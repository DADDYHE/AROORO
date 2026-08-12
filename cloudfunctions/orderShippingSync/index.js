"use strict";
/**
 * orderShippingSync/index.js - 订单物流状态同步定时任务
 *
 * 业务功能（cron 触发，每天 03:00）：
 *   1. 扫描 orders 集合中 status='shipped' 且有 waybillToken 的订单
 *   2. 逐条调微信 query_trace 接口查询运单当前状态（0-6）
 *   3. 若返回 status=4（已签收）或 status=6（代签收），自动把订单 status 推进为 completed
 *      并写入 completedAt / completionReason='auto_synced_from_logistics'
 *   4. queryTrace 失败 / 非签收状态：仅记日志与统计，不修改订单
 *   5. recordAlert 通知运营本次同步结果（处理多少条、自动完成多少条、失败多少条）
 *
 * 设计原则：
 *   - 仅推进明确「已签收」状态的订单，避免误判（status=3 派件中不推进）
 *   - 单次最多处理 MAX_PROCESS 条（默认 50），避免云函数超时（60s）
 *   - 并发保护 _isRunning，防止 cron 重叠执行
 *   - 幂等：update 时 where status='shipped' 保护，重复执行不会出错
 *   - best-effort：queryTrace 失败的单条不阻断其他订单处理
 *
 * 业务背景：
 *   - 原本订单从 shipped → completed 依赖用户在小程序点「确认收货」或运营手动点「完成订单」
 *   - 大量用户不主动点确认，导致订单长期卡在 shipped，影响：
 *     a. 佣金结算延迟（commissions.status='pending' 等订单 completed 才能结算）
 *     b. web 后台数据展示与实际物流状态不符
 *     c. 订单关闭周期拉长，售后风险增加
 *   - 本任务通过实时查询微信侧运单状态，自动推进签收订单的 status
 *
 * 数据流：
 *   orders (status=shipped, waybillToken exists)
 *     → queryTrace(waybillToken, openid)
 *       → 返回 status ∈ {0,1,2,3,4,5,6}
 *         → [4, 6] 推进为 completed
 *         → 其他 状态记日志不动订单
 *
 * 注意：
 *   - 依赖订单的 waybillToken 字段（由 shipMallOrder 在发货时调用 traceWaybill 写入）
 *   - 没有 waybillToken 的历史订单无法自动同步，需运营手动点「完成订单」
 *   - query_trace 不返回轨迹节点列表，只有当前状态
 */
Object.defineProperty(exports, "__esModule", { value: true });

// =====================================================================
// 内部模块初始化
// =====================================================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { createLogger } = require("./common/logger");
const { handleSuccess, handleError } = require("./common/utils");
const { recordAlert } = require("./common/alert");
const { queryTrace } = require("./common/wxLogistics");

const logger = createLogger('orderShippingSync');

// =====================================================================
// 常量
// =====================================================================
/** 目标集合 */
const COLLECTION = 'orders';
/** 单次最多扫描的订单数（避免 60s 超时；每条约需 500ms 调微信 API） */
const MAX_PROCESS = 50;
/** 微信运单状态码 - 已签收 */
const WAYBILL_STATUS_SIGNED = 4;
/** 微信运单状态码 - 代签收 */
const WAYBILL_STATUS_SIGNED_PROXY = 6;
/** 触发自动推进的运单状态集合 */
const AUTO_COMPLETE_STATUSES = [WAYBILL_STATUS_SIGNED, WAYBILL_STATUS_SIGNED_PROXY];
/** 自动完成标识，便于运维查询 */
const COMPLETION_REASON = 'auto_synced_from_logistics';
/** 告警 action 标识常量（点分风格） */
const ALERT_ACTION = {
  SYNC_FAILED: 'order.shipping.sync.failed',
  SYNC_DONE: 'order.shipping.sync.done',
  QUERY_TRACE_FAILED: 'order.shipping.query_trace.failed',
};

// =====================================================================
// 并发保护（参考 tuanExpiryCheck / orderTimeoutService 实现）
// =====================================================================
let _isRunning = false;

// =====================================================================
// 辅助函数 - 分页查询待同步订单
// =====================================================================
/**
 * 查询 status='shipped' 且有 waybillToken 的订单（按 shippedAt 升序，老的优先）
 *
 * 限制：
 *   - 单次最多 MAX_PROCESS 条
 *   - field 仅取必要字段（_id, orderNo, waybillToken, ownerId, expressNo, shippedAt, tuanOrderId）
 *
 * @returns 订单文档数组
 */
async function fetchShippedOrders() {
  const res = await db.collection(COLLECTION)
    .where({
      status: 'shipped',
      waybillToken: _.exists(true).and(_.neq('')),
    })
    .field({
      _id: true,
      orderNo: true,
      waybillToken: true,
      ownerId: true,
      expressNo: true,
      shippedAt: true,
      tuanOrderId: true,
    })
    .orderBy('shippedAt', 'asc')
    .limit(MAX_PROCESS)
    .get();
  return res.data || [];
}

// =====================================================================
// 辅助函数 - 幂等推进订单为 completed
// =====================================================================
/**
 * 把订单 status 推进为 completed
 *
 * 幂等保护：where status='shipped'，若已被其他路径推进则 update.stats.updated=0
 *
 * 双表一致性：若 order.tuanOrderId 存在（团购订单），同步更新 tuan_orders 表状态，
 *   避免 orders.completed 但 tuan_orders.shipped 的数据不一致。
 *   tuan_orders 同步为 best-effort：失败告警，不阻断主流程（与 adminService.handleTuanOrder 一致）。
 *
 * @param {object} order 订单文档（至少含 _id，可选 tuanOrderId）
 * @returns {Promise<{updated: number, tuanSynced: boolean, tuanError: string|null}>}
 */
async function advanceOrderToCompleted(order) {
  const orderId = order._id;
  const res = await db.collection(COLLECTION)
    .where({ _id: orderId, status: 'shipped' })
    .update({
      data: {
        status: 'completed',
        completedAt: db.serverDate(),
        completionReason: COMPLETION_REASON,
        updatedAt: db.serverDate(),
      },
    });
  const updated = res.stats ? res.stats.updated : 0;

  let tuanSynced = false;
  let tuanError = null;

  // 团购订单双表同步（仅当主表推进成功时才执行）
  if (updated > 0 && order.tuanOrderId) {
    try {
      const tuanUpd = await db.collection('tuan_orders')
        .where({ _id: order.tuanOrderId, status: 'shipped' })
        .update({
          data: {
            status: 'completed',
            completedAt: db.serverDate(),
            completionReason: COMPLETION_REASON,
            updatedAt: db.serverDate(),
          },
        });
      tuanSynced = (tuanUpd.stats && tuanUpd.stats.updated) > 0;
      if (!tuanSynced) {
        // tuan_orders 状态已不是 shipped（可能被其他路径推进），记 info 不告警
        logger.info('advanceOrderToCompleted.tuan_skipped', {
          orderId,
          tuanOrderId: order.tuanOrderId,
          reason: 'tuan_orders status not shipped (already advanced by other path)',
        });
      }
    } catch (e) {
      tuanError = e?.message || 'unknown error';
      logger.error('advanceOrderToCompleted.tuan_sync.failed', {
        orderId,
        tuanOrderId: order.tuanOrderId,
        orderNo: order.orderNo || '',
        msg: tuanError,
      });
      try {
        const { recordAlert } = require('./common/alert');
        await recordAlert(
          'warning',
          'order.shipping.sync.tuan_sync.failed',
          '物流自动签收后 tuan_orders 同步失败',
          {
            orderId,
            tuanOrderId: order.tuanOrderId,
            orderNo: order.orderNo || '',
            error: tuanError,
          }
        );
      } catch (_) { /* best-effort */ }
    }
  }

  return { updated, tuanSynced, tuanError };
}

// =====================================================================
// 单订单同步逻辑
// =====================================================================
/**
 * 处理单条订单：
 *   1. 调 queryTrace 查询运单状态
 *   2. 状态 ∈ [4, 6] 时推进订单为 completed
 *   3. 失败仅记日志，不抛错
 *
 * @param order 订单文档
 * @returns 同步结果对象
 */
async function syncOneOrder(order) {
  const result = {
    orderId: order._id,
    orderNo: order.orderNo || '',
    expressNo: order.expressNo || '',
    waybillStatus: null,
    waybillStatusLabel: '',
    advanced: false,           // 是否本次推进
    advancedSkipped: false,    // 已被并发推进
    tuanSynced: false,         // tuan_orders 是否同步成功
    tuanSyncError: null,       // tuan_orders 同步失败原因
    queryTraceError: null,
  };

  const traceRes = await queryTrace({
    waybillToken: order.waybillToken,
    openid: order.ownerId || '',
  });

  if (!traceRes.ok) {
    result.queryTraceError = traceRes.error || 'query_trace failed';
    logger.warn('syncOneOrder.queryTrace.failed', {
      orderId: order._id,
      orderNo: order.orderNo,
      expressNo: order.expressNo,
      error: result.queryTraceError,
    });
    return result;
  }

  result.waybillStatus = traceRes.status;
  result.waybillStatusLabel = traceRes.statusLabel || '';

  // 非签收状态，记日志不动订单
  if (!AUTO_COMPLETE_STATUSES.includes(traceRes.status)) {
    logger.info('syncOneOrder.not_signed', {
      orderId: order._id,
      orderNo: order.orderNo,
      waybillStatus: traceRes.status,
      waybillStatusLabel: traceRes.statusLabel,
    });
    return result;
  }

  // 已签收 → 推进订单为 completed
  const advanceResult = await advanceOrderToCompleted(order);
  if (advanceResult.updated > 0) {
    result.advanced = true;
    result.tuanSynced = advanceResult.tuanSynced;
    result.tuanSyncError = advanceResult.tuanError;
    logger.info('syncOneOrder.advanced', {
      orderId: order._id,
      orderNo: order.orderNo,
      expressNo: order.expressNo,
      waybillStatus: traceRes.status,
      waybillStatusLabel: traceRes.statusLabel,
      tuanSynced: advanceResult.tuanSynced,
      hasTuanOrderId: !!order.tuanOrderId,
    });
  } else {
    result.advancedSkipped = true;
    logger.info('syncOneOrder.advanced.skipped', {
      orderId: order._id,
      orderNo: order.orderNo,
      reason: 'order status changed by other path',
    });
  }
  return result;
}

// =====================================================================
// Main 入口
// =====================================================================
/**
 * 订单物流状态同步主入口（cron 触发）。
 *
 * @param event 云函数事件（cron 触发或 HTTP 调用）
 * @param _context CloudBase 上下文（本函数未使用）
 */
async function main(event, _context) {
  // 并发保护
  if (_isRunning) {
    logger.warn('skip: previous run still in progress');
    return handleSuccess({ skipped: true }, '上次执行未完成，已跳过');
  }
  _isRunning = true;

  const safeEvent = (event && typeof event === 'object') ? event : {};
  const now = new Date();
  logger.info('start', {
    trigger: safeEvent.TriggerName || 'manual',
    now: now.toISOString(),
  });

  try {
    const orders = await fetchShippedOrders();
    if (orders.length === 0) {
      logger.info('no shipped orders with waybillToken', { now: now.toISOString() });
      return handleSuccess({ processedCount: 0, advancedCount: 0 }, '无待同步订单');
    }

    logger.info('shipped orders found', { count: orders.length });

    const results = [];
    let advancedCount = 0;
    let queryFailedCount = 0;
    let notSignedCount = 0;
    let advancedSkippedCount = 0;
    let tuanSyncedCount = 0;
    let tuanSyncFailedCount = 0;

    for (const order of orders) {
      try {
        const r = await syncOneOrder(order);
        results.push(r);
        if (r.advanced) advancedCount += 1;
        if (r.advancedSkipped) advancedSkippedCount += 1;
        if (r.queryTraceError) queryFailedCount += 1;
        if (r.advanced && r.tuanSynced) tuanSyncedCount += 1;
        if (r.advanced && r.tuanSyncError) tuanSyncFailedCount += 1;
        if (!r.advanced && !r.advancedSkipped && !r.queryTraceError) notSignedCount += 1;
      } catch (e) {
        // 单条异常不阻断整体
        logger.error('syncOneOrder.exception', {
          orderId: order._id,
          orderNo: order.orderNo,
          msg: e?.message,
        });
        queryFailedCount += 1;
        results.push({
          orderId: order._id,
          orderNo: order.orderNo || '',
          expressNo: order.expressNo || '',
          waybillStatus: null,
          waybillStatusLabel: '',
          advanced: false,
          advancedSkipped: false,
          tuanSynced: false,
          tuanSyncError: null,
          queryTraceError: e?.message || 'exception',
        });
      }
    }

    const summary = {
      processedCount: orders.length,
      advancedCount,
      notSignedCount,
      queryFailedCount,
      advancedSkippedCount,
      tuanSyncedCount,
      tuanSyncFailedCount,
      now: now.toISOString(),
    };
    logger.info('done', summary);

    // 告警通知（info 级，便于运维查询同步情况；query_trace 失败或 tuan 同步失败则 warning）
    const hasFailures = queryFailedCount > 0 || tuanSyncFailedCount > 0;
    const alertSeverity = hasFailures ? 'warning' : 'info';
    let alertAction = ALERT_ACTION.SYNC_DONE;
    if (queryFailedCount > 0) alertAction = ALERT_ACTION.QUERY_TRACE_FAILED;
    else if (tuanSyncFailedCount > 0) alertAction = 'order.shipping.sync.tuan_sync.failed';

    let alertMsg = `订单物流同步完成：${advancedCount}/${orders.length} 条自动签收`;
    if (queryFailedCount > 0 && tuanSyncFailedCount > 0) {
      alertMsg = `订单物流同步完成（${queryFailedCount} 条查询失败，${tuanSyncFailedCount} 条团购同步失败）`;
    } else if (queryFailedCount > 0) {
      alertMsg = `订单物流同步完成（有 ${queryFailedCount} 条查询失败）`;
    } else if (tuanSyncFailedCount > 0) {
      alertMsg = `订单物流同步完成（${tuanSyncFailedCount} 条团购订单双表同步失败）`;
    }
    try {
      await recordAlert(alertSeverity, alertAction, alertMsg, summary);
    } catch { /* best-effort */ }

    return handleSuccess(summary, '订单物流同步完成');
  } catch (error) {
    logger.error('main', error);
    try {
      await recordAlert('critical', ALERT_ACTION.SYNC_FAILED, '订单物流同步失败', {
        msg: error?.message,
        now: now.toISOString(),
      });
    } catch { /* best-effort */ }
    return handleError(error, '订单物流同步失败');
  } finally {
    _isRunning = false;
  }
}

exports.main = main;
exports.default = { main };
