/* eslint-disable */
"use strict";
/**
 * adminService/stateMachine.ts - 状态机常量与工具（TypeScript 源文件 - Sprint 33 迁移）
 *
 * 业务功能：
 *   - 集中维护 boarding/feeding/mall/host 订单的状态转移表
 *   - 提供 canTransition / validateTransition 工具
 *
 * 迁移目标：
 *   - 强类型化状态字符串与转移表
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.adminService.json
 *   （运行时仍消费 .js 编译产物）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTransition = exports.canTransition = exports.ACTIVITY_ORDER_TRANSITIONS = exports.MALL_STATUS_MAP = exports.FEEDING_OPERATION_LABELS = exports.FEEDING_STATUS_MAP = exports.BOARDING_STATUS_MAP = exports.STATUS_LABELS = exports.HOST_SERVICE_TRANSITIONS = exports.MALL_ORDER_TRANSITIONS = exports.FEEDING_ORDER_TRANSITIONS = exports.BOARDING_ORDER_TRANSITIONS = void 0;
/* ============================================================
 * 状态转移表
 * ============================================================ */
exports.BOARDING_ORDER_TRANSITIONS = {
    pending: ['confirmed', 'cancelled'],
    paid: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled'],
    in_progress: ['completed'],
    completed: [],
    cancelled: [],
};
exports.FEEDING_ORDER_TRANSITIONS = {
    pending_payment: ['confirmed', 'cancelled'],
    paid: ['confirmed', 'cancelled'],
    pending: ['confirmed', 'rejected', 'cancelled'],
    rejected: ['pending', 'cancelled'],
    confirmed: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
};
/**
 * 商城 + 团购统一状态机（LOGISTICS_ORDER_TRANSITIONS）
 * - 合并自原 MALL_ORDER_TRANSITIONS / TUAN_ORDER_TRANSITIONS
 * - 删除死状态：confirmed / pending_shipment（paymentService 不再写入，历史脏数据已清理）
 * - paid 取消统一走 refunded（经 paymentService.createRefund），不再直写 cancelled
 *
 * 约束力声明:
 * - adminService 的 handleMallOrder/handleTuanOrder 通过 validateTransition 校验
 *   （handleTuanOrder 的 cancel 路径在分支内分别校验 paid→refunded / pending_payment→cancelled）
 * - mallService/tuanService 用户侧操作为直写，不走 validateTransition
 * - paymentService 的 refund 链路为直写，不走 validateTransition
 */
exports.LOGISTICS_ORDER_TRANSITIONS = {
    pending_payment: ['paid', 'cancelled'],
    paid: ['shipped', 'refunded'],
    shipped: ['completed'],
    completed: [],
    cancelled: [],
    refunded: [],
    deleted: [],
};
// 历史别名：mall/tuan 状态机已统一为 LOGISTICS_ORDER_TRANSITIONS
exports.MALL_ORDER_TRANSITIONS = exports.LOGISTICS_ORDER_TRANSITIONS;
exports.TUAN_ORDER_TRANSITIONS = exports.LOGISTICS_ORDER_TRANSITIONS;
/**
 * 活动订单统一状态机（V5）
 * - 5 态：pending_payment / paid / completed / cancelled / refunded
 * - 删除死状态 confirmed / pending
 * - paid → completed（活动结束，orderTimeoutService completeActivityOrders 定时任务）/ refunded（退款）
 */
exports.ACTIVITY_ORDER_TRANSITIONS = {
    pending_payment: ['paid', 'cancelled'],
    paid: ['completed', 'refunded'],
    completed: [],
    cancelled: [],
    refunded: [],
};
exports.HOST_SERVICE_TRANSITIONS = {
    pending_review: ['active', 'rejected'],
    active: ['suspended', 'inactive'],
    suspended: ['active'],
    inactive: ['active'],
    rejected: [],
};
/* ============================================================
 * 状态显示标签
 * ============================================================ */
exports.STATUS_LABELS = {
    pending: '待确认',
    paid: '已支付',
    confirmed: '已确认',
    in_progress: '进行中',
    completed: '已完成',
    cancelled: '已取消',
    pending_payment: '待支付',
    shipped: '已发货',
    pending_review: '待审核',
    active: '已激活',
    suspended: '已暂停',
    inactive: '未激活',
    rejected: '已拒绝',
    refunded: '已退款',
    deleted: '已删除',
};
/* ============================================================
 * 操作映射（前端 action → 目标状态）
 * ============================================================ */
exports.BOARDING_STATUS_MAP = {
    confirm: 'confirmed',
    reject: 'cancelled',
    complete: 'completed',
};
exports.FEEDING_STATUS_MAP = {
    confirm: 'confirmed',
    reject: 'rejected',
    complete: 'completed',
    start: 'in_progress',
    cancel: 'cancelled',
};
exports.FEEDING_OPERATION_LABELS = {
    confirm: '确认',
    reject: '拒绝',
    complete: '完成',
    start: '开始',
    cancel: '取消',
};
exports.MALL_STATUS_MAP = {
    ship: 'shipped',
    complete: 'completed',
    cancel: 'cancelled',
};
exports.TUAN_STATUS_MAP = {
    ship: 'shipped',
    complete: 'completed',
    cancel: 'cancelled',
};
/* ============================================================
 * 工具函数
 * ============================================================ */
/**
 * 检查 from → to 是否在转移表中合法
 */
function canTransition(transitions, from, to) {
    const allowed = transitions[from];
    if (!allowed) {
        return false;
    }
    return allowed.includes(to);
}
exports.canTransition = canTransition;
/**
 * 校验状态转移；非法时抛出错误
 */
function validateTransition(transitions, from, to) {
    if (!canTransition(transitions, from, to)) {
        const fromLabel = exports.STATUS_LABELS[from] || from;
        const toLabel = exports.STATUS_LABELS[to] || to;
        throw new Error(`无法从"${fromLabel}"变更为"${toLabel}"`);
    }
    return true;
}
exports.validateTransition = validateTransition;
/* ============================================================
 * 默认导出（保持 CommonJS 兼容）
 * ============================================================ */
const _exports = {
    BOARDING_ORDER_TRANSITIONS: exports.BOARDING_ORDER_TRANSITIONS,
    FEEDING_ORDER_TRANSITIONS: exports.FEEDING_ORDER_TRANSITIONS,
    LOGISTICS_ORDER_TRANSITIONS: exports.LOGISTICS_ORDER_TRANSITIONS,
    ACTIVITY_ORDER_TRANSITIONS: exports.ACTIVITY_ORDER_TRANSITIONS,
    MALL_ORDER_TRANSITIONS: exports.MALL_ORDER_TRANSITIONS,
    TUAN_ORDER_TRANSITIONS: exports.TUAN_ORDER_TRANSITIONS,
    HOST_SERVICE_TRANSITIONS: exports.HOST_SERVICE_TRANSITIONS,
    STATUS_LABELS: exports.STATUS_LABELS,
    BOARDING_STATUS_MAP: exports.BOARDING_STATUS_MAP,
    FEEDING_STATUS_MAP: exports.FEEDING_STATUS_MAP,
    FEEDING_OPERATION_LABELS: exports.FEEDING_OPERATION_LABELS,
    MALL_STATUS_MAP: exports.MALL_STATUS_MAP,
    TUAN_STATUS_MAP: exports.TUAN_STATUS_MAP,
    canTransition,
    validateTransition,
};
// Runtime shim: 把 module.exports 指向 _exports
// (兼容原 CommonJS 模式 `module.exports = { ... }`)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module;
_mod.exports = _exports;
_exports.default = _exports;
exports.default = _exports;
