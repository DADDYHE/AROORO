"use strict";
/**
 * 风控模块（TypeScript 源文件 - Sprint 15 迁移）
 *
 * 目标：
 *   - 评价刷量识别（submitEvaluation 写入前风控）
 *   - 退款滥用识别（createRefund 写入前风控）
 *   - 提供 action → 错误码映射与业务层辅助
 *
 * 设计原则：
 *   - 纯函数式：detect* 接收 db 快照，返回风险报告
 *   - 不阻塞主流程：仅返回 riskLevel + reasons + action 建议
 *   - 可插拔：每个检测项独立函数，配置项集中在 CONFIG
 *   - 与 errors.ts 联动：mapActionToErrorCode / assertRiskDecision
 *
 * 风险等级：
 *   - low   → action=allow  → 业务返回 RISK_PASS
 *   - medium → action=review → 业务返回 RISK_PENDING（待人工审核）
 *   - high  → action=reject → 业务返回 RISK_REJECT
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 *   （运行时仍消费 .js 编译产物）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertRiskDecision = exports.mapActionToErrorCode = exports.detectActivityApplyRisk = exports.detectMallOrderRisk = exports.detectOrderRisk = exports.detectNewUserLargeAmount = exports.detectLargeAmount = exports.ORDER_RISK_CONFIG = exports.detectRefundAbuse = exports.detectSameAmountPattern = exports.detectFullRefund = exports.detectRefundRate = exports.detectRefundHighFrequency = exports.REFUND_CONFIG = exports.detectReviewSpam = exports.levelToAction = exports.detectFiveStarRatio = exports.detectCommentLength = exports.detectDuplicateComment = exports.detectHostConcentration = exports.detectHighFrequency = exports.commentFingerprint = exports.CONFIG = void 0;
const crypto_1 = require("crypto");
const errors_1 = require("./errors");
// =====================================================================
// 评价刷量识别
// =====================================================================
/**
 * 风控配置
 * 阈值可按业务调整；调整后只需更新本对象
 */
exports.CONFIG = {
    // 1) 短时间高频：N 秒内的评价数
    HIGH_FREQ_WINDOW_MS: 60 * 1000, // 1 分钟
    HIGH_FREQ_THRESHOLD: 3, // 1 分钟内 ≥ 3 次触发 medium；≥ 5 次触发 high
    // 2) 同一 host 集中好评：N 秒内对同一 host 的 5 星评价数
    HOST_CONCENTRATION_WINDOW_MS: 24 * 60 * 60 * 1000, // 24 小时
    HOST_CONCENTRATION_THRESHOLD: 3,
    HOST_CONCENTRATION_HIGH: 6,
    // 3) 重复模板：基于 comment hash 的 N 天内相同文本次数
    DUP_COMMENT_WINDOW_MS: 7 * 24 * 60 * 60 * 1000, // 7 天
    DUP_COMMENT_THRESHOLD: 2,
    DUP_COMMENT_HIGH: 4,
    // 4) 同订单反复提交：当前提交已是第 N 次
    DUP_ORDER_THRESHOLD: 1,
    // 5) 评论长度异常
    COMMENT_MIN_LEN: 2,
    COMMENT_MAX_LEN: 500,
    // 6) 全 5 星比例异常：用户历史全 5 星占比
    FIVE_STAR_RATIO_THRESHOLD: 0.95,
    FIVE_STAR_MIN_SAMPLES: 10,
};
/**
 * 计算评论指纹（标准化 + 哈希）
 * 规则：
 *   - 去首尾空白、转小写
 *   - 合并连续空白
 *   - 截取前 200 字
 *   - 移除 emoji
 */
function commentFingerprint(comment) {
    if (!comment) {
        return '';
    }
    const stripped = String(comment)
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '') // emoji
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
    if (stripped.length < exports.CONFIG.COMMENT_MIN_LEN) {
        return '';
    }
    return (0, crypto_1.createHash)('md5').update(stripped).digest('hex');
}
exports.commentFingerprint = commentFingerprint;
/** 检测 1：短时间高频 */
function detectHighFrequency(recentByUser, now) {
    const cutoff = now - exports.CONFIG.HIGH_FREQ_WINDOW_MS;
    const inWindow = recentByUser.filter(e => e.createdAt >= cutoff);
    const count = inWindow.length;
    let level = 'low';
    if (count >= exports.CONFIG.HIGH_FREQ_THRESHOLD) {
        level = 'medium';
    }
    if (count >= exports.CONFIG.HIGH_FREQ_THRESHOLD + 2) {
        level = 'high';
    }
    return { hit: level !== 'low', count, level };
}
exports.detectHighFrequency = detectHighFrequency;
/** 检测 2：同一 host 集中好评 */
function detectHostConcentration(recentByHost, rating, now) {
    if (rating !== 5) {
        return { hit: false, count: 0, level: 'low' };
    }
    const cutoff = now - exports.CONFIG.HOST_CONCENTRATION_WINDOW_MS;
    const inWindow = recentByHost.filter(e => e.createdAt >= cutoff);
    const count = inWindow.length;
    let level = 'low';
    if (count >= exports.CONFIG.HOST_CONCENTRATION_THRESHOLD) {
        level = 'medium';
    }
    if (count >= exports.CONFIG.HOST_CONCENTRATION_HIGH) {
        level = 'high';
    }
    return { hit: level !== 'low', count, level };
}
exports.detectHostConcentration = detectHostConcentration;
/** 检测 3：重复模板（同一指纹） */
function detectDuplicateComment(recentByUser, comment, now) {
    const fp = commentFingerprint(comment);
    if (!fp) {
        return { hit: false, fingerprint: fp, count: 0, level: 'low' };
    }
    const cutoff = now - exports.CONFIG.DUP_COMMENT_WINDOW_MS;
    const inWindow = recentByUser.filter(e => e.createdAt >= cutoff);
    const sameFp = inWindow.filter(e => commentFingerprint(e.comment) === fp);
    const count = sameFp.length;
    let level = 'low';
    if (count >= exports.CONFIG.DUP_COMMENT_THRESHOLD) {
        level = 'medium';
    }
    if (count >= exports.CONFIG.DUP_COMMENT_HIGH) {
        level = 'high';
    }
    return { hit: level !== 'low', fingerprint: fp, count, level };
}
exports.detectDuplicateComment = detectDuplicateComment;
/** 检测 4：评论长度异常 */
function detectCommentLength(comment) {
    const len = comment ? String(comment).length : 0;
    if (len === 0) {
        return { hit: false, length: 0, level: 'low' };
    }
    if (len > exports.CONFIG.COMMENT_MAX_LEN) {
        return { hit: true, length: len, level: 'high' };
    }
    if (len < exports.CONFIG.COMMENT_MIN_LEN) {
        return { hit: true, length: len, level: 'medium' };
    }
    return { hit: false, length: len, level: 'low' };
}
exports.detectCommentLength = detectCommentLength;
/** 检测 5：用户历史全 5 星比例异常 */
function detectFiveStarRatio(allByUser) {
    const samples = allByUser.length;
    if (samples < exports.CONFIG.FIVE_STAR_MIN_SAMPLES) {
        return { hit: false, ratio: 0, samples, level: 'low' };
    }
    const fiveStars = allByUser.filter(e => Number(e.rating) === 5).length;
    const ratio = fiveStars / samples;
    const level = ratio >= exports.CONFIG.FIVE_STAR_RATIO_THRESHOLD ? 'medium' : 'low';
    return { hit: level !== 'low', ratio, samples, level };
}
exports.detectFiveStarRatio = detectFiveStarRatio;
/**
 * 提升风险等级
 */
function maxLevel(...levels) {
    const order = { low: 0, medium: 1, high: 2 };
    return levels.reduce((acc, l) => (order[l] > order[acc] ? l : acc), 'low');
}
/** level → action 映射 */
function levelToAction(level) {
    if (level === 'high') {
        return 'reject';
    }
    if (level === 'medium') {
        return 'review';
    }
    return 'allow';
}
exports.levelToAction = levelToAction;
/**
 * 主入口：评价刷量检测
 */
async function detectReviewSpam(ctx) {
    const { db, userId, hostId, orderId, rating, comment, now = Date.now(), } = ctx;
    // 拉取三个窗口的快照
    const [userAllRes, userRecentRes, hostRecentRes,] = await Promise.all([
        safeList(db, 'evaluations', { ownerId: userId }, 1000),
        safeList(db, 'evaluations', { ownerId: userId, createdAt: { _op: 'gte', v: now - 7 * 24 * 60 * 60 * 1000 } }, 200),
        safeList(db, 'evaluations', { hostId, createdAt: { _op: 'gte', v: now - exports.CONFIG.HOST_CONCENTRATION_WINDOW_MS } }, 200),
    ]);
    const userAll = toSnapshots(userAllRes);
    const userRecent = toSnapshots(userRecentRes);
    const hostRecent = toSnapshots(hostRecentRes);
    const reasons = [];
    const details = {};
    const f1 = detectHighFrequency(userRecent, now);
    if (f1.hit) {
        reasons.push(`HIGH_FREQ:${f1.count}次/${exports.CONFIG.HIGH_FREQ_WINDOW_MS / 1000}秒`);
        details.highFreq = f1;
    }
    const f2 = detectHostConcentration(hostRecent, Number(rating), now);
    if (f2.hit) {
        reasons.push(`HOST_CONCENTRATION:${f2.count}次5星/${exports.CONFIG.HOST_CONCENTRATION_WINDOW_MS / 86400000}天`);
        details.hostConcentration = f2;
    }
    const f3 = detectDuplicateComment(userRecent, comment, now);
    if (f3.hit) {
        reasons.push(`DUP_COMMENT:${f3.count}次同文案/${exports.CONFIG.DUP_COMMENT_WINDOW_MS / 86400000}天`);
        details.dupComment = f3;
    }
    const f4 = detectCommentLength(comment);
    if (f4.hit) {
        reasons.push(`COMMENT_LENGTH:${f4.length}字`);
        details.commentLength = f4;
    }
    const f5 = detectFiveStarRatio(userAll);
    if (f5.hit) {
        reasons.push(`FIVE_STAR_RATIO:${(f5.ratio * 100).toFixed(0)}%/${f5.samples}条`);
        details.fiveStarRatio = f5;
    }
    const level = maxLevel(f1.level, f2.level, f3.level, f4.level, f5.level);
    const action = levelToAction(level);
    return {
        level,
        action,
        reasons,
        details,
        target: { userId, hostId, orderId, rating, comment },
    };
}
exports.detectReviewSpam = detectReviewSpam;
// =====================================================================
// 退款滥用识别
// =====================================================================
/**
 * 退款风控配置
 */
exports.REFUND_CONFIG = {
    REFUND_HIGH_FREQ_WINDOW_MS: 24 * 60 * 60 * 1000, // 24 小时
    REFUND_HIGH_FREQ_THRESHOLD: 3,
    REFUND_HIGH_FREQ_HIGH: 5,
    REFUND_RATE_WINDOW_MS: 30 * 24 * 60 * 60 * 1000, // 30 天
    REFUND_RATE_THRESHOLD: 0.5,
    REFUND_RATE_HIGH: 0.8,
    REFUND_RATE_MIN_SAMPLES: 3,
    FULL_REFUND_THRESHOLD: 0.95,
    FULL_REFUND_HIGH: 0.99,
    SAME_AMOUNT_WINDOW_MS: 60 * 60 * 1000, // 1 小时
    SAME_AMOUNT_THRESHOLD: 3,
    SAME_AMOUNT_HIGH: 5,
    POST_REFUND_INACTIVE_DAYS: 30,
};
/** 检测 1：短时间高频退款 */
function detectRefundHighFrequency(userRefunds, now) {
    const cutoff = now - exports.REFUND_CONFIG.REFUND_HIGH_FREQ_WINDOW_MS;
    const inWindow = userRefunds.filter(r => r.createdAt >= cutoff);
    const count = inWindow.length;
    let level = 'low';
    if (count >= exports.REFUND_CONFIG.REFUND_HIGH_FREQ_THRESHOLD) {
        level = 'medium';
    }
    if (count >= exports.REFUND_CONFIG.REFUND_HIGH_FREQ_HIGH) {
        level = 'high';
    }
    return { hit: level !== 'low', count, level };
}
exports.detectRefundHighFrequency = detectRefundHighFrequency;
/** 检测 2：退款率过高 */
function detectRefundRate(userRefunds, completedOrderCount, now) {
    if (completedOrderCount < exports.REFUND_CONFIG.REFUND_RATE_MIN_SAMPLES) {
        return { hit: false, rate: 0, samples: completedOrderCount, refunds: 0, level: 'low' };
    }
    const cutoff = now - exports.REFUND_CONFIG.REFUND_RATE_WINDOW_MS;
    const refundsInWindow = userRefunds.filter(r => r.createdAt >= cutoff).length;
    const rate = refundsInWindow / completedOrderCount;
    let level = 'low';
    if (rate >= exports.REFUND_CONFIG.REFUND_RATE_THRESHOLD) {
        level = 'medium';
    }
    if (rate >= exports.REFUND_CONFIG.REFUND_RATE_HIGH) {
        level = 'high';
    }
    return { hit: level !== 'low', rate, samples: completedOrderCount, refunds: refundsInWindow, level };
}
exports.detectRefundRate = detectRefundRate;
/** 检测 3：单笔退款接近全额 */
function detectFullRefund(current) {
    if (!current || !current.totalAmount) {
        return { hit: false, ratio: 0, level: 'low' };
    }
    const ratio = current.refundAmount / current.totalAmount;
    let level = 'low';
    if (ratio >= exports.REFUND_CONFIG.FULL_REFUND_THRESHOLD) {
        level = 'medium';
    }
    if (ratio >= exports.REFUND_CONFIG.FULL_REFUND_HIGH) {
        level = 'high';
    }
    return { hit: level !== 'low', ratio, level };
}
exports.detectFullRefund = detectFullRefund;
/** 检测 4：短时间内多次相同金额退款（拆单嫌疑） */
function detectSameAmountPattern(userRefunds, currentAmount, now) {
    if (!currentAmount) {
        return { hit: false, count: 0, amount: 0, level: 'low' };
    }
    const cutoff = now - exports.REFUND_CONFIG.SAME_AMOUNT_WINDOW_MS;
    const inWindow = userRefunds.filter(r => r.createdAt >= cutoff && r.refundAmount === currentAmount);
    const count = inWindow.length;
    let level = 'low';
    if (count >= exports.REFUND_CONFIG.SAME_AMOUNT_THRESHOLD) {
        level = 'medium';
    }
    if (count >= exports.REFUND_CONFIG.SAME_AMOUNT_HIGH) {
        level = 'high';
    }
    return { hit: level !== 'low', count, amount: currentAmount, level };
}
exports.detectSameAmountPattern = detectSameAmountPattern;
/**
 * 主入口：退款滥用检测
 */
async function detectRefundAbuse(ctx) {
    const { db, userId, orderId, refundAmount, totalAmount, reason, now = Date.now(), } = ctx;
    // 拉取用户历史退款 + 已完成订单数
    const [userRefundsRes, userCompletedRes] = await Promise.all([
        safeList(db, 'refunds', { ownerId: userId }, 500),
        safeList(db, 'orders', { ownerId: userId, status: 'completed' }, 500),
    ]);
    const userRefunds = toRefundSnapshots(userRefundsRes);
    const completedCount = userCompletedRes.length;
    const current = {
        _id: 'current',
        ownerId: userId,
        orderId,
        refundAmount: Number(refundAmount) || 0,
        totalAmount: Number(totalAmount) || 0,
        reason: reason || '',
        status: 'pending',
        createdAt: now,
    };
    const reasons = [];
    const details = {};
    const f1 = detectRefundHighFrequency(userRefunds, now);
    if (f1.hit) {
        reasons.push(`REFUND_HIGH_FREQ:${f1.count}笔/${exports.REFUND_CONFIG.REFUND_HIGH_FREQ_WINDOW_MS / 86400000}天`);
        details.refundHighFreq = f1;
    }
    const f2 = detectRefundRate(userRefunds, completedCount, now);
    if (f2.hit) {
        reasons.push(`REFUND_RATE:${(f2.rate * 100).toFixed(0)}%/${f2.refunds}笔/${f2.samples}单`);
        details.refundRate = f2;
    }
    // full refund 仅在有历史全退样本时才升级为 high
    let f3 = { hit: false, level: 'low', ratio: 0 };
    const f3Raw = detectFullRefund(current);
    if (f3Raw.hit) {
        const priorFullCount = userRefunds.filter(r => {
            const t = Number(r.totalAmount) || 0;
            const a = Number(r.refundAmount) || 0;
            return t > 0 && a / t >= exports.REFUND_CONFIG.FULL_REFUND_THRESHOLD;
        }).length;
        const escalatedLevel = priorFullCount >= 1
            ? f3Raw.level
            : (f3Raw.level === 'high' ? 'medium' : f3Raw.level);
        f3 = { ...f3Raw, level: escalatedLevel };
        reasons.push(`FULL_REFUND:${(f3.ratio * 100).toFixed(0)}%`);
        details.fullRefund = f3;
    }
    const f4 = detectSameAmountPattern(userRefunds, current.refundAmount, now);
    if (f4.hit) {
        reasons.push(`SAME_AMOUNT:${f4.count}笔/${f4.amount}分`);
        details.sameAmount = f4;
    }
    const level = maxLevel(f1.level, f2.level, f3.level, f4.level);
    const action = levelToAction(level);
    return {
        level,
        action,
        reasons,
        details,
        target: { userId, orderId, refundAmount, totalAmount, reason },
    };
}
exports.detectRefundAbuse = detectRefundAbuse;
// =====================================================================
// Sprint 22: 大额下单 / 活动报名 / 商城下单 风控
// =====================================================================
/**
 * 大额下单风控配置
 *   - 金额单位：分（与支付字段一致）
 *   - 阈值可按业务调整
 */
exports.ORDER_RISK_CONFIG = {
    /** 单笔大额阈值（≥ 触发 review） */
    LARGE_AMOUNT_FEN: 50 * 100 * 100, // 5 万元 = 5_000_000 分
    /** 单笔超大额阈值（≥ 触发 reject） */
    HUGE_AMOUNT_FEN: 100 * 100 * 100, // 10 万元 = 10_000_000 分
    /** 用户单日累计阈值（超过触发 review） */
    DAILY_AMOUNT_FEN: 100 * 100 * 100, // 10 万元 / 日
    /** 用户短期窗口（30 分钟）内累计订单数（超过触发 review） */
    SHORT_WINDOW_ORDERS: 5,
    SHORT_WINDOW_MS: 30 * 60 * 1000,
    /** 新用户首单大额阈值（注册 < 7 天的用户首单允许上限） */
    NEW_USER_LARGE_FEN: 10 * 100 * 100, // 1 万元
    NEW_USER_WINDOW_MS: 7 * 24 * 60 * 60 * 1000,
};
/** 检测：大额下单 */
function detectLargeAmount(amountFen) {
    const amount = Math.max(0, Math.floor(amountFen || 0));
    if (amount >= exports.ORDER_RISK_CONFIG.HUGE_AMOUNT_FEN) {
        return { hit: true, level: 'high', amount };
    }
    if (amount >= exports.ORDER_RISK_CONFIG.LARGE_AMOUNT_FEN) {
        return { hit: true, level: 'medium', amount };
    }
    return { hit: false, level: 'low', amount };
}
exports.detectLargeAmount = detectLargeAmount;
/** 检测：新用户首单大额 */
function detectNewUserLargeAmount(userCreatedAt, amountFen, now) {
    if (!userCreatedAt) {
        return { hit: false, level: 'low', userAgeMs: 0 };
    }
    const userAgeMs = now - userCreatedAt;
    if (userAgeMs > exports.ORDER_RISK_CONFIG.NEW_USER_WINDOW_MS) {
        return { hit: false, level: 'low', userAgeMs };
    }
    // 注册 < 7 天 + 大额 → medium
    if (amountFen >= exports.ORDER_RISK_CONFIG.NEW_USER_LARGE_FEN) {
        return { hit: true, level: 'medium', userAgeMs };
    }
    return { hit: false, level: 'low', userAgeMs };
}
exports.detectNewUserLargeAmount = detectNewUserLargeAmount;
/**
 * 主入口：商城/活动/寄养 大额下单风控
 * - 大额 → review
 * - 超大额 → reject
 * - 短期高频 → review
 * - 新用户首单大额 → review
 *
 * @throws 不抛错（best-effort）。失败时返回 level=low / action=allow
 */
async function detectOrderRisk(ctx) {
    const { db, userId, amountFen, type, targetId, now = Date.now() } = ctx;
    const reasons = [];
    const details = {};
    // 1) 单笔金额
    const f1 = detectLargeAmount(amountFen);
    if (f1.hit) {
        reasons.push(f1.level === 'high'
            ? `HUGE_AMOUNT:${(f1.amount / 100).toFixed(2)}元`
            : `LARGE_AMOUNT:${(f1.amount / 100).toFixed(2)}元`);
        details.largeAmount = f1;
    }
    // 2) 短期窗口内同一用户下单数
    try {
        const recentOrders = await safeList(db, 'orders', {
            ownerId: userId,
            createdAt: { _op: 'gte', v: now - exports.ORDER_RISK_CONFIG.SHORT_WINDOW_MS },
        }, 100);
        const recentCount = recentOrders.length;
        if (recentCount >= exports.ORDER_RISK_CONFIG.SHORT_WINDOW_ORDERS) {
            reasons.push(`SHORT_BURST:${recentCount}单/${exports.ORDER_RISK_CONFIG.SHORT_WINDOW_MS / 60000}分`);
            details.shortBurst = { count: recentCount };
        }
    }
    catch (e) {
        // 集合不可用：忽略
    }
    // 3) 单日累计金额
    try {
        const dayStart = now - 24 * 60 * 60 * 1000;
        const dayOrders = await safeList(db, 'orders', { ownerId: userId, createdAt: { _op: 'gte', v: dayStart } }, 100);
        const dayTotal = dayOrders.reduce((acc, o) => {
            const v = Number(o.totalAmount || o.totalPrice || o.basicPrice || 0);
            return acc + (Number.isFinite(v) ? v : 0);
        }, 0);
        if (dayTotal >= exports.ORDER_RISK_CONFIG.DAILY_AMOUNT_FEN) {
            reasons.push(`DAILY_TOTAL:${(dayTotal / 100).toFixed(2)}元`);
            details.dailyTotal = { fen: dayTotal };
        }
    }
    catch (e) {
        // ignore
    }
    // 4) 新用户首单大额
    try {
        const userRes = await db.collection('users').doc(userId).get();
        if (userRes && userRes.data) {
            const createdAt = toMs(userRes.data.createdAt);
            const f4 = detectNewUserLargeAmount(createdAt, amountFen, now);
            if (f4.hit) {
                reasons.push(`NEW_USER_LARGE:${Math.floor(f4.userAgeMs / 86400000)}天/${(amountFen / 100).toFixed(2)}元`);
                details.newUserLarge = f4;
            }
        }
    }
    catch (e) {
        // 用户记录可能不存在 → 忽略
    }
    const allLevels = [f1.level];
    if (details.shortBurst) {
        allLevels.push('medium');
    }
    if (details.dailyTotal) {
        allLevels.push('medium');
    }
    if (details.newUserLarge) {
        allLevels.push(details.newUserLarge.level);
    }
    const level = maxLevel(...allLevels);
    const action = levelToAction(level);
    return {
        level,
        action,
        reasons,
        details,
        target: { userId, type, targetId: targetId || '', amountFen },
    };
}
exports.detectOrderRisk = detectOrderRisk;
/** 商城下单专用 */
async function detectMallOrderRisk(ctx) {
    return detectOrderRisk({ ...ctx, type: 'mall_order' });
}
exports.detectMallOrderRisk = detectMallOrderRisk;
/** 活动报名专用 */
async function detectActivityApplyRisk(ctx) {
    return detectOrderRisk({ ...ctx, type: 'activity_apply' });
}
exports.detectActivityApplyRisk = detectActivityApplyRisk;
// =====================================================================
// 工具：db 拉取 + 快照转换
// =====================================================================
/**
 * 从 db 拉取数据并转为快照数组
 * 兼容两种 db 接口：真实 cloudbase db（where + get）与测试 in-memory mock
 */
async function safeList(db, collection, where, limit) {
    try {
        const chain = db.collection(collection).where(where).limit(limit);
        const res = await chain.get();
        return (res.data || []);
    }
    catch (e) {
        // 集合不存在（首次上线）时返回空
        return [];
    }
}
function toSnapshots(arr) {
    return arr.map(d => ({
        _id: String(d._id),
        ownerId: String(d.ownerId),
        hostId: String(d.hostId),
        orderId: String(d.orderId),
        rating: Number(d.rating) || 0,
        comment: String(d.comment || ''),
        createdAt: toMs(d.createdAt),
    }));
}
function toRefundSnapshots(arr) {
    return arr.map(d => ({
        _id: String(d._id),
        ownerId: String(d.ownerId),
        orderId: String(d.orderId),
        refundAmount: Number(d.refundAmount) || 0,
        totalAmount: Number(d.totalAmount || d.amount) || 0,
        reason: String(d.reason || ''),
        status: d.status || 'pending',
        createdAt: toMs(d.createdAt),
    }));
}
function toMs(v) {
    if (v == null) {
        return 0;
    }
    if (typeof v === 'number') {
        return v;
    }
    if (v instanceof Date) {
        return v.getTime();
    }
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
        return v.toDate().getTime();
    }
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
}
// =====================================================================
// Sprint 14：action → 错误码映射与业务层辅助
// =====================================================================
/**
 * action → 业务错误码 映射
 *   - 'allow'  → RISK_PASS
 *   - 'review' → RISK_PENDING
 *   - 'reject' → RISK_REJECT
 */
function mapActionToErrorCode(action) {
    if (action === 'reject') {
        return 'RISK_REJECT';
    }
    if (action === 'review') {
        return 'RISK_PENDING';
    }
    return 'RISK_PASS';
}
exports.mapActionToErrorCode = mapActionToErrorCode;
/**
 * 业务层辅助：根据风控报告抛出对应错误或返回标记
 *   - 'reject' → 抛 RISK_REJECT
 *   - 'review' → 抛 RISK_PENDING
 *   - 'allow'  → 返回 { passed: true, code: 'RISK_PASS', reasons }
 *
 * @throws {BusinessError} action=reject 时抛 RISK_REJECT；action=review 时抛 RISK_PENDING
 */
function assertRiskDecision(risk) {
    if (risk.action === 'reject') {
        throw (0, errors_1.err)('RISK_REJECT', '请求被风控拒绝', { reasons: risk.reasons, level: risk.level });
    }
    if (risk.action === 'review') {
        throw (0, errors_1.err)('RISK_PENDING', '请求已受理，待人工审核', { reasons: risk.reasons, level: risk.level });
    }
    // action === 'allow'
    return { passed: true, code: 'RISK_PASS', reasons: risk.reasons };
}
exports.assertRiskDecision = assertRiskDecision;
