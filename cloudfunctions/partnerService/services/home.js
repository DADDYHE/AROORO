"use strict";
/**
 * home.ts - 合伙人中心首屏聚合接口（BFF，2026-09-01 性能优化）
 *
 * 背景：
 *   合伙人中心首页原本需要 3 次云函数调用（getMyPermissions / getApplicationStatus /
 *   getMyIncomeOverview），每次调用都要付一次网络 RTT + 一次可能的冷启动。
 *   本接口在同一次云调用内聚合三份数据：3 次冷启 + 3 次 RTT → 1 次冷启 + 1 次 RTT。
 *
 * 设计：
 *   - 阶段一：并行取权限 + 申请状态
 *   - 阶段二：仅当是合伙人时再取收入概览（内部串行不影响外部 RTT，省掉无谓查询）
 *   - 任一子模块失败不影响整体（降级为该项默认值），首屏宁可少数据不可白屏
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPartnerHome = void 0;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess } = require('../common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger');
// 子模块走编译产物 require，避免与 index.ts 形成循环依赖
// eslint-disable-next-line @typescript-eslint/no-var-requires
const applicationHandlers = require('./application');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const walletHandlers = require('./wallet');
const logger = createLogger('partnerService:home');
/** 子模块降级：任一失败返回 null，不阻断首屏 */
async function safe(promise, tag) {
    try {
        const res = (await promise);
        return res && res.data ? res : null;
    }
    catch (error) {
        logger.warn(`getPartnerHome.${tag}`, {
            msg: error?.message || String(error),
        });
        return null;
    }
}
/** 数值兜底：undefined / 非数字一律按 0 处理（金额单位：元） */
function num(value) {
    return Number(value) || 0;
}
// =====================================================================
// Handler: getPartnerHome
// =====================================================================
async function getPartnerHome(event, context, auth) {
    const [permRes, appRes] = await Promise.all([
        safe(applicationHandlers.getMyPermissions(event, context, auth), 'getMyPermissions'),
        safe(applicationHandlers.getApplicationStatus(event, context, auth), 'getApplicationStatus'),
    ]);
    const isPartner = (permRes?.data?.isPartner === true);
    const hasPendingApplication = (appRes?.data?.hasPending === true);
    let incomeSummary = null;
    if (isPartner) {
        const incomeRes = await safe(walletHandlers.getMyIncomeOverview(event, context, auth), 'getMyIncomeOverview');
        const d = incomeRes?.data;
        if (d) {
            incomeSummary = {
                total: (num(d.commission?.total) + num(d.activity?.total) +
                    num(d.boarding?.total) + num(d.feeding?.total)).toFixed(2),
                monthly: (num(d.commission?.monthly) + num(d.activity?.monthly) +
                    num(d.boarding?.monthly) + num(d.feeding?.monthly)).toFixed(2),
                walletBalance: num(d.wallet?.balance).toFixed(2),
            };
        }
    }
    return handleSuccess({ isPartner, hasPendingApplication, incomeSummary }, '获取成功');
}
exports.getPartnerHome = getPartnerHome;
