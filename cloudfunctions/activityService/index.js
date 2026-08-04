"use strict";
/**
 * activityService/index.ts - 活动服务主入口（TypeScript 源文件 - Sprint 38 迁移）
 *
 * 业务功能：
 *   - 活动列表 / 详情（用户端）
 *   - 活动报名（带风控前置 + 优惠券，支付走 paymentService 回调闭环）
 *   - 我的报名（详情、列表）
 *   - 定时状态自动更新（published → registration_stopped → ended + 佣金/收入）
 *
 * 注（P3-7 清理）：活动管理（CRUD/报名列表/导出/活动订单）已统一走
 *   adminService（合作伙伴端）与 orderService（订单列表），本服务不再承载。
 *
 * 共 5 个 action：
 *   1. getActivityList - 活动列表
 *   2. getActivityDetail - 活动详情
 *   3. submitRegistration - 提交报名（含风控前置）
 *   4. getRegistrationDetail - 报名详情
 *   5. getRegistrationList - 报名列表
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 与 adminService / partnerService / userService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.activityService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.handlers = exports.getRegistrationList = exports.getRegistrationDetail = exports.submitRegistration = exports.getActivityDetail = exports.getActivityList = void 0;
// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES, paginate, escapeRegExp } = require('./common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger');
// 2026-08-02 写入器统一：佣金写入委托 common/commission-utils（全局唯一实现）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createCommissionRecord } = require('./common/commission-utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError } = require('./common/errors');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { detectActivityApplyRisk, mapActionToErrorCode } = require('./common/risk-control');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('./common/risk-rate-limit');
// Sprint 50: 限流统一 bootstrap
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap');
const { cloud, db } = initCloud();
const logger = createLogger('activityService');
const _ = db.command;
// Sprint 50: 注入全局限流存储（rate_limits + rate_limit_configs 一次注入）
try {
    bootstrapRateLimit(db, { logger });
}
catch (e) {
    logger.warn('bootstrapRateLimit failed, fallback to memory:', e && e.message);
}
// =====================================================================
// 辅助函数：风控前置
// =====================================================================
/**
 * Sprint 22: 活动报名风控前置
 *   - reject → 抛 RISK_REJECT
 *   - review → 标 pendingReview = true（不阻塞报名，运营后续抽检）
 *   - allow  → 放行
 */
async function performActivityApplyRiskCheck(ctx) {
    const { openid, activityId, amountFen } = ctx;
    let pendingReview = false;
    let riskDecision = 'RISK_PASS';
    let riskReasons = [];
    try {
        const risk = await withRateLimit({ userId: openid, type: 'activity_apply', targetId: activityId }, () => detectActivityApplyRisk({
            db,
            userId: openid,
            amountFen,
            targetId: activityId,
        }));
        riskDecision = mapActionToErrorCode(risk.action);
        riskReasons = risk.reasons;
        if (risk.action === 'reject') {
            logger.warn('activityApply.risk_reject', { userId: maskOpenid(openid), activityId, amountFen, reasons: risk.reasons });
            throw err('RISK_REJECT', '报名被风控拦截', {
                reasons: risk.reasons,
                level: risk.level,
                activityId,
            });
        }
        if (risk.action === 'review') {
            pendingReview = true;
            logger.info('activityApply.risk_pending', { userId: maskOpenid(openid), activityId, amountFen, reasons: risk.reasons });
        }
        else {
            const debug = logger.debug;
            if (debug) {
                debug('activityApply.risk_pass', { userId: maskOpenid(openid), activityId });
            }
        }
    }
    catch (e) {
        if (isBusinessError(e) && (e.code === 'RATE_LIMITED' || e.code === 'RISK_REJECT')) {
            throw e;
        }
        logger.warn('activityApply.risk_control_error', { userId: maskOpenid(openid), activityId, msg: e && e.message });
        riskDecision = 'RISK_PASS';
    }
    return { pendingReview, reasons: riskReasons, decision: riskDecision };
}
// =====================================================================
// 辅助函数：佣金记录
// =====================================================================
// 2026-08-02 写入器统一：原本地实现（费率键 config[orderType] 同样踩中
// hosting/boarding 键不匹配的 P0，且金额/幂等口径与另两套实现漂移）已删除，
// 统一委托 common/commission-utils（全局唯一写入器）。
// 公共版已包含本地版的全部能力：确定性 _id 幂等、主键冲突静默跳过、
// 活动金额优先取 finalAmount → totalAmount → totalPrice。
// =====================================================================
// 辅助函数：活动状态自动更新
// =====================================================================
// M4 修复：本函数不再挂在 getActivityList 上同步执行（写放大），
// 改由 config.json 定时触发器（activityStatusTrigger，每 5 分钟）驱动
async function autoUpdateActivityStatus() {
    try {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const bjTime = new Date(utc + (8 * 3600000));
        const nowStr = `${bjTime.getFullYear()}-${String(bjTime.getMonth() + 1).padStart(2, '0')}-${String(bjTime.getDate()).padStart(2, '0')} ${String(bjTime.getHours()).padStart(2, '0')}:${String(bjTime.getMinutes()).padStart(2, '0')}`;
        const stoppedRes = await db.collection('activities')
            .where({ status: 'published', startTime: _.lte(nowStr) })
            .update({ data: { status: 'registration_stopped', updatedAt: db.serverDate() } });
        if (stoppedRes.updated > 0) {
            logger.info('autoUpdate.stopped', { updated: stoppedRes.updated });
        }
        // M4 修复：消除"查询-批量 update"竞态——先查候选，再逐活动条件更新，
        // updated===1（本次真正置为 ended）才生成佣金，不重不漏
        const endingActivitiesRes = await db.collection('activities')
            .where({ status: _.in(['published', 'registration_stopped']), endTime: _.lte(nowStr) })
            .field({ _id: true })
            .get();
        const endingActivities = (endingActivitiesRes.data || []);
        if (endingActivities.length === 0) {
            return;
        }
        let endedCount = 0;
        // M6 修复：分批限流（每批 5），避免瞬时打满数据库连接
        await runInBatches(endingActivities, 5, async (activity) => {
            if (!activity._id) {
                return;
            }
            const upRes = await db.collection('activities')
                .where({ _id: activity._id, status: _.in(['published', 'registration_stopped']), endTime: _.lte(nowStr) })
                .update({ data: { status: 'ended', updatedAt: db.serverDate() } });
            if ((upRes.updated || 0) > 0) {
                endedCount += 1;
                await generateActivityCommissions(activity._id);
            }
        });
        if (endedCount > 0) {
            logger.info('autoUpdate.ended', { updated: endedCount });
        }
    }
    catch (e) {
        logger.error('autoUpdate', e);
    }
}
/**
 * 为已结束的活动生成佣金记录
 * 查询所有已确认的报名，为每个报名创建佣金
 */
async function generateActivityCommissions(activityId) {
    try {
        // 查询该活动所有已确认的报名
        const registrationsRes = await db.collection('activity_registrations')
            .where({ activityId, status: 'confirmed' })
            .get();
        const registrations = registrationsRes.data || [];
        if (registrations.length === 0) {
            logger.info('generateActivityCommissions.noRegistrations', { activityId });
            return;
        }
        // P1-1 修复：镜像单统一按 activityId + orderType='activity' 查询（原实现用报名单 orderId
        //   查 orders._id，而活跃路径报名单无 orderId 字段 → 恒空，活动佣金从未生成）
        const ordersRes = await db.collection('orders')
            .where({ activityId, orderType: 'activity', status: 'confirmed' })
            .get();
        const orders = ordersRes.data || [];
        if (orders.length === 0) {
            logger.info('generateActivityCommissions.noOrders', { activityId, registrations: registrations.length });
            return;
        }
        // M6 修复：分批限流（每批 5）创建佣金，替代无上限 Promise.all
        await runInBatches(orders, 5, async (order) => {
            await createCommissionRecord('activity', order);
        });
        logger.info('generateActivityCommissions.done', { activityId, registrations: registrations.length, orders: orders.length });
    }
    catch (e) {
        logger.error('generateActivityCommissions', { activityId, msg: e.message });
    }
}
// =====================================================================
// 辅助函数：合作伙伴权限校验
// =====================================================================
function calculateActivityCouponDiscount(type, rules, orderAmount) {
    if (!rules) {
        return { eligible: false, message: '优惠券规则缺失' };
    }
    if (rules.threshold && orderAmount < rules.threshold) {
        return { eligible: false, message: `订单金额未达到满${rules.threshold}元使用门槛` };
    }
    let discountAmount = 0;
    switch (type) {
        case 'fixed_amount':
        case 'full_reduction':
            discountAmount = rules.reduceAmount || 0;
            break;
        case 'discount': {
            const discountRate = Number(rules.discountRate) || 1;
            if (discountRate <= 0 || discountRate > 1) {
                return { eligible: false, message: '折扣率无效' };
            }
            discountAmount = orderAmount * (1 - discountRate);
            if (rules.maxReduceAmount && rules.maxReduceAmount > 0) {
                discountAmount = Math.min(discountAmount, rules.maxReduceAmount);
            }
            break;
        }
        default:
            return { eligible: false, message: '未知优惠券类型' };
    }
    discountAmount = Math.min(discountAmount, orderAmount);
    discountAmount = Math.round(discountAmount * 100) / 100;
    return { eligible: true, discountAmount };
}
// 服务端重算活动金额（H3：不再信任前端 totalAmount）
function computeActivityAmount(activity, pCount, petCount) {
    const pricePerPerson = activity.pricePerPerson || 0;
    const pricePerPet = activity.pricePerPet || 0;
    return Math.max(0, pricePerPerson * pCount + pricePerPet * petCount);
}
// 校验并解析优惠券，返回服务端认定的折扣（H3）
// 仅做校验 + 计算，不修改券状态，避免与 couponService 的 lock/use 流程冲突导致重复核销
async function resolveCoupon(openid, couponId, calculatedAmount) {
    if (!couponId) {
        return { couponId: '', discount: 0 };
    }
    try {
        const couponRes = await db.collection('user_coupons').where({ _id: couponId }).limit(1).get();
        const coupon = (couponRes.data || [])[0];
        if (!coupon) {
            throw err('COUPON_NOT_FOUND', '优惠券不存在');
        }
        if (coupon.ownerId !== openid) {
            throw err('PERMISSION_DENIED', '无权使用他人优惠券');
        }
        if (coupon.status && coupon.status !== 'unused' && coupon.status !== 'locked') {
            throw err('COUPON_STATUS_INVALID', `优惠券当前状态不可用：${coupon.status}`);
        }
        const now = new Date();
        if (coupon.startTime && now < new Date(coupon.startTime)) {
            throw err('BUSINESS_ERROR', '优惠券尚未生效');
        }
        if (coupon.endTime && now > new Date(coupon.endTime)) {
            throw err('BUSINESS_ERROR', '优惠券已过期');
        }
        const scopes = coupon.applicableScopes || [];
        // P1-3 修复：放行全品类券（all），无效券 fail-closed 抛错（不再静默降级导致按原价收费）
        if (scopes.length > 0 && !scopes.includes('all') && !scopes.includes('activity')) {
            throw err('BUSINESS_ERROR', '该优惠券不适用于活动报名');
        }
        const result = calculateActivityCouponDiscount(coupon.type, coupon.rules, calculatedAmount);
        if (!result.eligible || result.discountAmount === undefined) {
            throw err('BUSINESS_ERROR', `优惠券不可用：${result.message || '不满足使用条件'}`);
        }
        return { couponId, discount: result.discountAmount };
    }
    catch (e) {
        // P1-3 修复：券异常必须让用户感知（不再静默降级）
        if (e && typeof e === 'object' && e.name === 'BusinessError') {
            throw e;
        }
        logger.warn('resolveCoupon.error', { couponId, msg: e.message });
        throw err('BUSINESS_ERROR', '优惠券校验失败，请重试');
    }
}
// 手机号脱敏（H5：列表/订单场景不直接暴露完整号码）
function maskPhone(phone) {
    if (!phone) {
        return '';
    }
    const s = String(phone).trim();
    if (s.length < 7) {
        return s;
    }
    return `${s.slice(0, 3)}****${s.slice(-4)}`;
}
// L9 修复：openid 属 PII，日志中掩码，避免明文落盘
function maskOpenid(openid) {
    if (!openid) {
        return '';
    }
    const s = String(openid);
    if (s.length <= 6) {
        return s;
    }
    return `${s.slice(0, 6)}***`;
}
/**
 * M3 修复：循环分页拉取集合全量数据，规避 CloudBase 单次 get 上限静默截断
 * @param maxTotal 安全上限，防止超大集合拖爆内存/超时
 */
async function fetchAllPaged(collection, where, orderByField, maxTotal = 5000) {
    const BATCH = 100;
    const all = [];
    let skip = 0;
    for (;;) {
        const res = await db.collection(collection)
            .where(where)
            .orderBy(orderByField, 'desc')
            .skip(skip)
            .limit(BATCH)
            .get();
        const batch = (res.data || []);
        all.push(...batch);
        if (batch.length < BATCH || all.length >= maxTotal) {
            break;
        }
        skip += BATCH;
    }
    return all.slice(0, maxTotal);
}
/**
 * M3 修复：CSV 公式注入防护——以 = + - @ 及制表符/回车开头的单元格加单引号前缀，
 * 防止 Excel/WPS 打开时把用户可控内容当公式执行
 */
/**
 * M6 修复：并发批处理限流——分批执行异步任务，避免 Promise.all 无上限打满数据库连接
 */
async function runInBatches(items, batchSize, worker) {
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(batch.map((item) => worker(item).catch((e) => {
            logger.warn('runInBatches.item', { msg: e.message });
        })));
    }
}
// =====================================================================
// Handler 1: getActivityList - 活动列表
// =====================================================================
const ACTIVITY_LIST_FIELDS = {
    _id: true, title: true, coverUrl: true, startTime: true, endTime: true,
    location: true, latitude: true, longitude: true, category: true,
    price: true, pricePerPerson: true, pricePerPet: true,
    maxParticipants: true, currentParticipants: true, status: true, createdBy: true, createdAt: true, organizer: true,
};
const REGISTRATION_LIST_FIELDS = {
    _id: true, activityId: true, openid: true, phone: true, status: true,
    totalAmount: true, createdAt: true,
};
async function getActivityList(event, context, auth) {
    const { page = 1, pageSize = 10, status, category, keyword } = event;
    const safePageSize = Math.min(Math.max(1, Number(pageSize) || 10), 100);
    logger.info('getActivityList.query', { page, pageSize: safePageSize, status, category, keyword });
    // M4 修复：状态自动更新迁移至定时触发器（见 main 入口 Timer 分支），列表接口只读
    const where = {};
    if (status && status !== 'all') {
        where.status = status;
    }
    else {
        // P1-A 修复：默认只展示"对用户可见"的活动（已发布/报名截止/已结束），
        //   原 _.neq('deleted') 会把草稿（draft）与已取消（cancelled）活动外露给用户列表
        where.status = _.in(['published', 'registration_stopped', 'ended']);
    }
    if (category && category !== 'all') {
        where.category = category;
    }
    if (keyword) {
        const safeKeyword = escapeRegExp(String(keyword).slice(0, 50));
        where.$or = [
            { title: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
            { location: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
        ];
    }
    const result = await paginate(db, 'activities', {
        page, pageSize: safePageSize, where,
        projection: ACTIVITY_LIST_FIELDS,
        orderBy: { field: 'createdAt', direction: 'desc' },
    });
    result.list.forEach((activity) => {
        const avatar = activity.organizer && activity.organizer.avatar;
        if (avatar && !avatar.startsWith('cloud://') && !avatar.startsWith('https://')) {
            if (activity.organizer) {
                activity.organizer.avatar = '';
                activity.organizer._avatarInvalid = true;
            }
        }
    });
    const invalidAvatarActivities = result.list.filter(a => a.organizer && a.organizer._avatarInvalid && a.createdBy);
    if (invalidAvatarActivities.length > 0) {
        const creatorOpenids = [...new Set(invalidAvatarActivities.map(a => a.createdBy).filter((id) => Boolean(id)))];
        try {
            const adminRes = await db.collection('admins').where({ _id: _.in(creatorOpenids) }).field({ avatarUrl: true, nickName: true }).get();
            const adminMap = {};
            (adminRes.data || []).forEach((a) => { if (a._id) {
                adminMap[a._id] = a;
            } });
            invalidAvatarActivities.forEach((activity) => {
                if (!activity.createdBy || !activity.organizer) {
                    return;
                }
                const admin = adminMap[activity.createdBy];
                if (admin && admin.avatarUrl && (admin.avatarUrl.startsWith('cloud://') || admin.avatarUrl.startsWith('https://'))) {
                    activity.organizer.avatar = admin.avatarUrl;
                    if (admin.nickName && activity.organizer.name === '宠团团') {
                        activity.organizer.name = admin.nickName;
                    }
                }
                delete activity.organizer._avatarInvalid;
            });
        }
        catch (e) {
            invalidAvatarActivities.forEach((a) => { if (a.organizer) {
                delete a.organizer._avatarInvalid;
            } });
        }
    }
    logger.info('getActivityList.result', { total: result.total, listCount: result.list.length });
    let myRegistrations = [];
    if (auth.openid) {
        const regRes = await db.collection('activity_registrations')
            .where({ ownerId: auth.openid, status: 'confirmed' })
            .field({ activityId: true })
            .get();
        myRegistrations = (regRes.data || []).map((r) => r.activityId).filter((id) => Boolean(id));
    }
    result.list = result.list.map((activity) => ({
        ...activity,
        joined: myRegistrations.includes(activity._id || ''),
    }));
    return handleSuccess(result, '获取成功');
}
exports.getActivityList = getActivityList;
// =====================================================================
// Handler 2: getActivityDetail - 活动详情
// =====================================================================
async function getActivityDetail(event, context, auth) {
    const { activityId } = event;
    if (!activityId) {
        throw err('INVALID_PARAMS', '缺少活动ID');
    }
    try {
        // L8 修复：主查询与"我是否报名"相互独立，并行执行降低详情接口 P95
        const [res, regRes] = await Promise.all([
            db.collection('activities').doc(activityId).get(),
            auth.openid
                ? db.collection('activity_registrations')
                    .where({ activityId, ownerId: auth.openid, status: 'confirmed' })
                    .count()
                : Promise.resolve({ total: 0 }),
        ]);
        const isRegistered = regRes.total > 0;
        const data = res.data;
        if (!data) {
            throw err('NOT_FOUND', '活动不存在');
        }
        const result = { ...data, isRegistered };
        // L8 修复：头像补全与活动数彼此独立且都依赖主查询结果 → 并行执行
        await Promise.all([
            (async () => {
                if (!(result.organizer && result.organizer.avatar))
                    return;
                const avatar = result.organizer.avatar;
                if (avatar.startsWith('cloud://') || avatar.startsWith('https://'))
                    return;
                result.organizer.avatar = '';
                if (!result.createdBy)
                    return;
                try {
                    const adminRes = await db.collection('admins').doc(result.createdBy).field({ avatarUrl: true, nickName: true }).get();
                    const admin = adminRes.data;
                    if (admin && admin.avatarUrl && (admin.avatarUrl.startsWith('cloud://') || admin.avatarUrl.startsWith('https://'))) {
                        result.organizer.avatar = admin.avatarUrl;
                        if (admin.nickName && result.organizer.name === '宠团团') {
                            result.organizer.name = admin.nickName;
                        }
                    }
                }
                catch (e) {
                    logger.warn('getActivityDetail.admins.fetch', { createdBy: result.createdBy, code: e.errCode, msg: e.message });
                }
            })(),
            (async () => {
                if (!(data.createdBy && result.organizer))
                    return;
                try {
                    const countRes = await db.collection('activities')
                        .where({ createdBy: data.createdBy, status: _.in(['published', 'ongoing', 'ended']) })
                        .count();
                    result.organizer.activityCount = countRes.total || 0;
                }
                catch (e) {
                    logger.warn('queryHostActivities', e);
                    result.organizer.activityCount = 0;
                }
            })(),
        ]);
        return handleSuccess(result, '获取成功');
    }
    catch (error) {
        return handleError(error, '活动不存在', ERROR_CODES.NOT_FOUND);
    }
}
exports.getActivityDetail = getActivityDetail;
// =====================================================================
// Handler 6: submitRegistration - 提交报名（含风控前置）
// =====================================================================
async function submitRegistration(event, context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { activityId, pets, phone, notes, friends, petIds, couponId, participantCount } = event;
    if (!activityId) {
        throw err('INVALID_PARAMS', '缺少活动ID');
    }
    if (!pets || !Array.isArray(pets) || pets.length === 0) {
        throw err('INVALID_PARAMS', '请选择参与的宠物');
    }
    if (!phone) {
        throw err('INVALID_PARAMS', '请填写联系电话');
    }
    // M1 修复：查重前置到事务外（CloudBase 事务内不支持 where 查询），
    // 名额检查移入事务内基于快照读，避免"读-判-写"跨事务竞态
    const existReg = await db.collection('activity_registrations')
        .where({ activityId, ownerId: openid, status: _.in(['confirmed', 'pending_payment']) })
        .count();
    if (existReg.total > 0) {
        throw err('BUSINESS_ERROR', '您已报名此活动');
    }
    const transaction = await db.startTransaction();
    try {
        // M1 修复：活动读取走事务快照，与后续 _.inc 同事务；
        // 并发提交冲突时 CloudBase 事务失败回滚，杜绝名额超卖
        const activityRes = await transaction.collection('activities').doc(activityId).get();
        const activity = activityRes.data;
        if (!activity) {
            throw err('NOT_FOUND', '活动不存在');
        }
        // P1-A 修复：仅"已发布"状态可报名——草稿/报名截止/已取消/已结束活动一律拒绝
        if (activity.status !== 'published') {
            throw err('BUSINESS_ERROR', `活动当前状态不可报名：${activity.status || '未知'}`);
        }
        const pricePerPerson = activity.pricePerPerson || 0;
        const pricePerPet = activity.pricePerPet || 0;
        // M2 修复：participantCount 服务端规范化（≥1 的整数），不再裸信前端
        const pCount = Math.max(1, Math.floor(Number(participantCount) || 1));
        if (activity.maxParticipants && (activity.currentParticipants || 0) + pCount > activity.maxParticipants) {
            throw err('BUSINESS_ERROR', '报名人数已满');
        }
        const petsArray = pets;
        const friendsArray = Array.isArray(friends) ? friends : [];
        const petCount = petsArray.length + friendsArray.length;
        // H3 修复：金额一律服务端重算，不再信任前端 totalAmount
        const calculatedAmount = computeActivityAmount(activity, pCount, petCount);
        const coupon = await resolveCoupon(openid, couponId, calculatedAmount);
        const finalAmount = Math.max(0, Math.round((calculatedAmount - coupon.discount) * 100) / 100);
        // Sprint 22: 活动报名前先做大额风控
        const applyRisk = await performActivityApplyRiskCheck({
            openid,
            activityId,
            amountFen: Math.round(calculatedAmount * 100),
        });
        const isPaid = calculatedAmount > 0;
        const now = db.serverDate();
        const petsInfo = petsArray.map((p) => ({
            name: p.petName || p.name || '',
            gender: p.petGender || p.gender || 'male',
            breed: p.petBreed || p.breed || '',
            petId: p.petId || '',
        }));
        const registration = {
            _id: generateId('registration', openid),
            activityId,
            ownerId: openid,
            pets: petsInfo,
            petIds: petIds || [],
            phone: phone || '',
            notes: notes || '',
            friends: friendsArray,
            status: isPaid ? 'pending_payment' : 'confirmed',
            // P0-A 修复：报名单补写 paymentStatus（付费=pending 中间态 / 免费=paid 无支付流程），
            //   paymentService.createPayment 条件更新与 orderTimeoutService 超时扫描均依赖该字段
            paymentStatus: isPaid ? 'pending' : 'paid',
            participantCount: pCount,
            petCount,
            pricePerPerson,
            pricePerPet,
            totalAmount: calculatedAmount,
            originalAmount: calculatedAmount,
            couponId: coupon.couponId,
            couponDiscount: coupon.discount,
            finalAmount,
            pendingReview: applyRisk.pendingReview,
            riskDecision: applyRisk.decision,
            riskReasons: applyRisk.reasons,
            createdAt: now,
            updatedAt: now,
        };
        const regResult = await transaction.collection('activity_registrations').add({ data: registration });
        if (!isPaid) {
            await transaction.collection('activities').doc(activityId).update({
                data: {
                    currentParticipants: _.inc(pCount),
                    updatedAt: db.serverDate(),
                },
            });
        }
        try {
            let user = null;
            try {
                const userRes = await db.collection('users').doc(openid).get();
                user = userRes.data;
            }
            catch (e) {
                logger.warn('submitRegistration.users.fetch', { openid: maskOpenid(openid), code: e.errCode, msg: e.message });
            }
            const activityOrder = {
                ownerId: openid,
                orderType: 'activity',
                type: 'activity',
                activityId,
                activityTitle: activity.title || '',
                activityCoverUrl: activity.coverUrl || '',
                activityStartTime: activity.startTime || '',
                activityEndTime: activity.endTime || '',
                activityLocation: activity.location || '',
                organizerId: activity.createdBy || '',
                petIds: petIds || [],
                petsInfo,
                startDate: activity.startTime || '',
                endDate: activity.endTime || '',
                duration: 1,
                pricePerDay: activity.price || 0,
                participantCount: pCount,
                petCount,
                pricePerPerson,
                pricePerPet,
                basicPrice: calculatedAmount,
                totalPrice: finalAmount,
                originalAmount: calculatedAmount,
                couponId: coupon.couponId,
                couponDiscount: coupon.discount,
                phone: phone || '',
                notes: notes || '',
                status: isPaid ? 'pending_payment' : 'confirmed',
                ownerInfo: user ? { nickName: user.nickName, avatarUrl: user.avatarUrl, phone } : { phone },
                createdAt: now,
                updatedAt: now,
            };
            // H7: idx_bookingKey_unique 唯一索引要求 orders 全文档 bookingKey 唯一
            //   活动订单无寄养业务键,用 _id 占位保证唯一性,避免 null 冲突导致 -502001 DuplicateKey
            activityOrder._id = generateId('order', openid);
            activityOrder.bookingKey = `nb_${activityOrder._id}`;
            await transaction.collection('orders').add({ data: activityOrder });
        }
        catch (orderErr) {
            logger.warn('创建活动订单记录失败:', orderErr.message);
        }
        await transaction.commit();
        return handleSuccess({ id: regResult._id || 'ok', registrationId: regResult._id }, '报名成功');
    }
    catch (error) {
        // M1 修复：rollback 包裹 try/catch，避免二次 rollback 抛新错掩盖原始业务错误
        try {
            await transaction.rollback();
        }
        catch (_) { /* ignore rollback error */ }
        return handleError(error, '报名失败', ERROR_CODES.DATA);
    }
}
exports.submitRegistration = submitRegistration;
// =====================================================================
// Handler 7: getRegistrationDetail - 报名详情
// =====================================================================
async function getRegistrationDetail(event, context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { registrationId } = event;
    if (!registrationId) {
        throw err('INVALID_PARAMS', '缺少订单ID');
    }
    try {
        let registration = null;
        try {
            const regRes = await db.collection('activity_registrations').doc(registrationId).get();
            if (regRes.data && regRes.data.ownerId === openid) {
                registration = regRes.data;
            }
        }
        catch (e) {
            logger.warn('getRegistrationDetail.activity_registrations.fetch', { registrationId, code: e.errCode, msg: e.message });
        }
        if (!registration) {
            try {
                const orderRes = await db.collection('orders').doc(registrationId).get();
                if (orderRes.data) {
                    const order = orderRes.data;
                    if (order.ownerId === openid) {
                        const regQuery = await db.collection('activity_registrations')
                            .where({ activityId: order.activityId, ownerId: openid })
                            .limit(1).get();
                        const regData = (regQuery.data || []);
                        if (regData.length > 0) {
                            registration = regData[0];
                        }
                        else {
                            registration = {
                                _id: order._id,
                                activityId: order.activityId || '',
                                ownerId: openid,
                                pets: order.petsInfo || [],
                                phone: order.phone || '',
                                notes: order.notes || '',
                                participantCount: order.participantCount || 1,
                                petCount: order.petCount || 0,
                                totalAmount: order.totalPrice || order.basicPrice || 0,
                                originalAmount: order.originalAmount || order.totalPrice || 0,
                                couponId: order.couponId || '',
                                couponDiscount: order.couponDiscount || 0,
                                finalAmount: order.totalPrice || 0,
                                status: order.status || 'pending',
                                createdAt: order.createdAt,
                            };
                        }
                    }
                    else {
                        throw err('AUTH_REQUIRED', '无权查看此订单');
                    }
                }
            }
            catch (e) {
                logger.warn('getRegistrationDetail.orders.lookup', { registrationId, code: e.errCode, msg: e.message });
            }
        }
        if (!registration) {
            throw err('NOT_FOUND', '订单不存在');
        }
        let activityInfo = null;
        try {
            const activityRes = await db.collection('activities').doc(registration.activityId).get();
            if (activityRes.data) {
                const act = activityRes.data;
                activityInfo = {
                    title: act.title || '',
                    coverUrl: act.coverUrl || '',
                    startTime: act.startTime || '',
                    endTime: act.endTime || '',
                    location: act.location || '',
                    pricePerPerson: act.pricePerPerson || 0,
                    pricePerPet: act.pricePerPet || 0,
                };
            }
        }
        catch (e) {
            logger.warn('getRegistrationDetail: 获取活动信息失败', e.message);
        }
        return handleSuccess({
            registration,
            activityInfo,
        }, '获取成功');
    }
    catch (error) {
        logger.error('getRegistrationDetail', error);
        return handleError(error, '获取报名详情失败', ERROR_CODES.BUSINESS);
    }
}
exports.getRegistrationDetail = getRegistrationDetail;
// =====================================================================
// Handler 8: getRegistrationList - 报名列表
// =====================================================================
async function getRegistrationList(event, context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { page = 1, pageSize = 20, activityId, status } = event;
    // M5 修复：pageSize 增加下限保护（0/负数/非数字回退默认），与其他 handler 口径一致
    const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 20);
    const where = { ownerId: openid };
    if (activityId) {
        where.activityId = activityId;
    }
    // M5 修复：status==='active'（进行中的已报名活动）过滤提前到查询层，
    // 分页与 total 均基于过滤后的数据集，不再对"当前页"做内存过滤导致分页错乱
    if (status === 'active') {
        const myRegs = await fetchAllPaged('activity_registrations', { ownerId: openid, status: 'confirmed' }, 'createdAt', 1000);
        const myActivityIds = [...new Set(myRegs.map((r) => r.activityId).filter((id) => Boolean(id)))];
        if (myActivityIds.length === 0) {
            return handleSuccess({ list: [], total: 0, page, pageSize: safePageSize }, '获取成功');
        }
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const bjTime = new Date(utc + (8 * 3600000));
        const nowStr = `${bjTime.getFullYear()}-${String(bjTime.getMonth() + 1).padStart(2, '0')}-${String(bjTime.getDate()).padStart(2, '0')} ${String(bjTime.getHours()).padStart(2, '0')}:${String(bjTime.getMinutes()).padStart(2, '0')}`;
        const activeIds = [];
        for (let i = 0; i < myActivityIds.length; i += 100) {
            const actRes = await db.collection('activities')
                .where({
                _id: _.in(myActivityIds.slice(i, i + 100)),
                status: _.nin(['ended', 'cancelled', 'deleted']),
            })
                .field({ _id: true, endTime: true })
                .get();
            (actRes.data || []).forEach((a) => {
                if (!a._id) {
                    return;
                }
                if (a.endTime && String(a.endTime) <= nowStr) {
                    return;
                }
                activeIds.push(a._id);
            });
        }
        if (activeIds.length === 0) {
            return handleSuccess({ list: [], total: 0, page, pageSize: safePageSize }, '获取成功');
        }
        where.activityId = _.in(activeIds);
        where.status = 'confirmed';
    }
    else if (status) {
        where.status = status;
    }
    const result = await paginate(db, 'activity_registrations', {
        page, pageSize: safePageSize, where, projection: REGISTRATION_LIST_FIELDS,
        orderBy: { field: 'createdAt', direction: 'desc' },
    });
    const activityIds = [...new Set(result.list.map((r) => r.activityId).filter((id) => Boolean(id)))];
    if (activityIds.length > 0) {
        const activitiesRes = await db.collection('activities')
            .where({ _id: _.in(activityIds) })
            .get();
        const activityMap = {};
        (activitiesRes.data || []).forEach((a) => { if (a._id) {
            activityMap[a._id] = a;
        } });
        // M5 修复：regMap 保留每个活动"最新"一条报名（列表已按 createdAt desc 排序，首条即最新），
        // 存量重复报名不再互相覆盖
        const regMap = {};
        result.list.forEach((r) => {
            if (r.activityId && !regMap[r.activityId]) {
                regMap[r.activityId] = r;
            }
        });
        const activities = activityIds
            .map((id) => activityMap[id])
            .filter((a) => Boolean(a))
            .map((a) => {
            const reg = regMap[a._id || ''];
            return {
                ...a,
                joined: true,
                _registrationId: reg ? (reg._id || '') : (a._id || ''),
                regStatus: reg ? reg.status : '',
                regCreatedAt: reg ? reg.createdAt : a.createdAt,
            };
        });
        // M5 修复：active 过滤已提前到查询层（见上方 where 构造），此处不再内存过滤、不再覆盖 result.total
        const invalidAvatarList = [];
        for (const activity of activities) {
            if (activity.organizer && activity.organizer.avatar) {
                const avatar = activity.organizer.avatar;
                if (!avatar.startsWith('cloud://') && !avatar.startsWith('https://')) {
                    activity.organizer.avatar = '';
                    if (activity.createdBy) {
                        invalidAvatarList.push(activity);
                    }
                }
            }
        }
        if (invalidAvatarList.length > 0) {
            const creatorOpenids = [...new Set(invalidAvatarList.map((a) => a.createdBy).filter((id) => Boolean(id)))];
            try {
                const adminRes = await db.collection('admins').where({ _id: _.in(creatorOpenids) }).field({ avatarUrl: true, nickName: true }).get();
                const adminMap = {};
                (adminRes.data || []).forEach((a) => { if (a._id) {
                    adminMap[a._id] = a;
                } });
                invalidAvatarList.forEach((activity) => {
                    if (!activity.createdBy || !activity.organizer) {
                        return;
                    }
                    const admin = adminMap[activity.createdBy];
                    if (admin && admin.avatarUrl && (admin.avatarUrl.startsWith('cloud://') || admin.avatarUrl.startsWith('https://'))) {
                        activity.organizer.avatar = admin.avatarUrl;
                        if (admin.nickName && activity.organizer.name === '宠团团') {
                            activity.organizer.name = admin.nickName;
                        }
                    }
                });
            }
            catch (e) {
                logger.warn('getRegistrationList.admins.fetch', { count: creatorOpenids.length, code: e.errCode, msg: e.message });
            }
        }
        result.list = activities;
    }
    else {
        result.list = [];
    }
    return handleSuccess(result, '获取成功');
}
exports.getRegistrationList = getRegistrationList;
// =====================================================================
// 入口聚合：handlers 路由表
// =====================================================================
// P3-7 清理：活动管理走 adminService、活动支付走 paymentService；
//   遗留 handler（create/update/deleteActivity、直连支付、报名导出/订单列表）已彻底删除。
exports.handlers = {
    getActivityList,
    getActivityDetail,
    submitRegistration,
    getRegistrationDetail,
    getRegistrationList,
};
// =====================================================================
// Main 入口（云函数调用）
// =====================================================================
// P3-010: 写操作和登录校验 action 列表提升为模块级常量，避免每次调用重新创建数组
const WRITE_ACTIONS = ['submitRegistration'];
const LOGIN_REQUIRED_ACTIONS = [...WRITE_ACTIONS, 'getActivityDetail', 'getRegistrationDetail', 'getRegistrationList'];
async function main(event, context) {
    // M4 修复：定时触发器入口（config.json triggers: activityStatusTrigger）
    // 仅接受平台 Timer 事件，不暴露为外部可调 action
    if (event.Type === 'Timer') {
        logger.info('timer.autoUpdateActivityStatus', { trigger: event.TriggerName || 'timer' });
        await autoUpdateActivityStatus();
        return handleSuccess(null, '活动状态定时更新完成');
    }
    const { action } = event;
    if (!action || !exports.handlers[action]) {
        throw err('INVALID_PARAMS', '无效的操作类型');
    }
    const requireLogin = LOGIN_REQUIRED_ACTIONS.includes(action);
    try {
        const auth = await verifyAuth(event, { requireLogin });
        logger.info(action, { openid: maskOpenid(auth.openid) });
        return await exports.handlers[action](event, context, auth);
    }
    catch (error) {
        logger.error(action, error);
        const code = error.code || ERROR_CODES.BUSINESS;
        return handleError(error, error.message, code);
    }
}
exports.main = main;
// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module;
_mod.exports = {
    main,
    getActivityList,
    getActivityDetail,
    submitRegistration,
    getRegistrationDetail,
    getRegistrationList,
    handlers: exports.handlers,
};
_mod.exports.default = _mod.exports;
exports.default = {
    main,
    getActivityList,
    getActivityDetail,
    submitRegistration,
    getRegistrationDetail,
    getRegistrationList,
    handlers: exports.handlers,
};
