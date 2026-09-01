"use strict";
/**
 * bundle.ts - 合伙人子页面首屏聚合接口（BFF，2026-09-01 性能优化 P1）
 *
 * 背景：
 *   income 页首屏需 5 次云调用（overview / wallet / rates / payee / details）、
 *   service-income 页 4 次、referral 页 3 次。每次调用付一次网络 RTT + 可能一次冷启动。
 *   本模块把每页聚合为 1 次云调用，服务端 Promise.all 并行执行各子查询：
 *   5 次冷启 + 5 次 RTT → 1 次冷启 + 1 次 RTT。
 *
 * 设计：
 *   - 复用各子模块 handler（编译产物 require，避免与 index.ts 循环依赖）
 *   - 任一子项失败降级为 null，不阻断整包（保持原页面 rates/payee 独立容错语义）
 *   - bundle 只覆盖首屏；tab 切换 / 分页 / 写操作后刷新仍走原接口
 *   - 注意：overview.wallet 是佣金+服务收入合并汇总（H2 口径），
 *     提现余额需独立调 getMyWallet（纯 commission 钱包），不可复用
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReferralBundle = exports.getServiceIncomeBundle = exports.getPartnerIncomeBundle = void 0;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess } = require('../common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger');
// 子模块走编译产物 require，避免与 index.ts 形成循环依赖
// eslint-disable-next-line @typescript-eslint/no-var-requires
const walletHandlers = require('./wallet');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const incomeHandlers = require('./income');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const applicationHandlers = require('./application');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const referralHandlers = require('./referral');
const logger = createLogger('partnerService:bundle');
/** 子模块降级：任一失败返回 null，不阻断整包 */
async function safe(promise, tag) {
    try {
        const res = (await promise);
        return res && res.data ? res : null;
    }
    catch (error) {
        logger.warn(`bundle.${tag}`, {
            msg: error?.message || String(error),
        });
        return null;
    }
}
// =====================================================================
// Handler: getPartnerIncomeBundle（income 页 5 次 → 1 次）
// =====================================================================
async function getPartnerIncomeBundle(event, context, auth) {
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(event.pageSize) || 20)));
    const [overviewRes, walletRes, ratesRes, payeeRes, detailsRes] = await Promise.all([
        safe(walletHandlers.getMyIncomeOverview(event, context, auth), 'getMyIncomeOverview'),
        safe(walletHandlers.getMyWallet(event, context, auth), 'getMyWallet'),
        safe(applicationHandlers.getMyCommissionRates(event, context, auth), 'getMyCommissionRates'),
        safe(walletHandlers.getMyPayeeAccounts(event, context, auth), 'getMyPayeeAccounts'),
        safe(walletHandlers.getMyIncomeDetails({ ...event, type: 'all', page: 1, pageSize }, context, auth), 'getMyIncomeDetails'),
    ]);
    return handleSuccess({
        overview: overviewRes?.data || null,
        wallet: walletRes?.data || null,
        commissionRates: ratesRes?.data || null,
        payee: payeeRes?.data?.payee || null,
        details: detailsRes?.data || null,
    }, '获取成功');
}
exports.getPartnerIncomeBundle = getPartnerIncomeBundle;
// =====================================================================
// Handler: getServiceIncomeBundle（service-income 页 4 次 → 1 次）
// =====================================================================
async function getServiceIncomeBundle(event, context, auth) {
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(event.pageSize) || 20)));
    const [overviewRes, walletRes, payeeRes, detailsRes] = await Promise.all([
        safe(incomeHandlers.getServiceIncomeOverview(event, context, auth), 'getServiceIncomeOverview'),
        safe(walletHandlers.getMyWallet({ ...event, walletType: 'serviceIncome' }, context, auth), 'getMyWallet'),
        safe(walletHandlers.getMyPayeeAccounts(event, context, auth), 'getMyPayeeAccounts'),
        safe(incomeHandlers.getServiceIncomeDetails({ ...event, type: 'all', page: 1, pageSize }, context, auth), 'getServiceIncomeDetails'),
    ]);
    return handleSuccess({
        overview: overviewRes?.data || null,
        wallet: walletRes?.data || null,
        payee: payeeRes?.data?.payee || null,
        details: detailsRes?.data || null,
    }, '获取成功');
}
exports.getServiceIncomeBundle = getServiceIncomeBundle;
// =====================================================================
// Handler: getReferralBundle（referral 页 3 次 → 1 次）
// =====================================================================
async function getReferralBundle(event, context, auth) {
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(event.pageSize) || 20)));
    const [usersRes, orderStatsRes, referralStatsRes] = await Promise.all([
        safe(referralHandlers.getMyInvitedUsers({ ...event, page: 1, pageSize }, context, auth), 'getMyInvitedUsers'),
        safe(referralHandlers.getReferralOrderStats({ ...event, type: 'all' }, context, auth), 'getReferralOrderStats'),
        safe(referralHandlers.getReferralStats(event, context, auth), 'getReferralStats'),
    ]);
    return handleSuccess({
        users: usersRes?.data || null,
        orderStats: orderStatsRes?.data || null,
        referralStats: referralStatsRes?.data || null,
    }, '获取成功');
}
exports.getReferralBundle = getReferralBundle;
