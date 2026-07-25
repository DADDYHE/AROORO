"use strict";
/**
 * userService/index.ts - 用户服务主入口（TypeScript 源文件 - Sprint 34 迁移）
 *
 * 业务功能：
 *   - 小程序端用户身份、地址、通知、邀请等统一入口
 *   - 4 个服务子模块：auth / notifications / referral / addresses
 *   - 共 21 个 action，覆盖：
 *     * 身份相关（login / getIdentity / syncIdentity / check / update / phone / all / getConfig / checkAdminStatus）
 *     * 通知（getNotificationList / markNotificationRead / markAllNotificationsRead / getNotificationDetail）
 *     * 邀请（getReferralStats / getInvitedUsers）
 *     * 地址（addressList / addressAdd / addressUpdate / addressRemove / addressSetDefault）
 *
 * 迁移目标：
 *   - 强类型化 event / auth / handler 签名
 *   - 与 adminService / partnerService 保持一致的类型系统
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.userService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.handlers = void 0;
// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, maskOpenid } = require('./common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, toResponse, isBusinessError, wrapUnknown } = require('./common/errors');
const { db } = initCloud();
const logger = createLogger('userService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const authHandlers = require('./auth');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const notificationHandlers = require('./notifications');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const referralHandlers = require('./referral');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const addressHandlers = require('./addresses');
// =====================================================================
// handlers 聚合
// =====================================================================
exports.handlers = {
    // 身份相关
    login: authHandlers.login,
    getIdentity: authHandlers.getIdentity,
    syncIdentity: authHandlers.syncIdentity,
    check: authHandlers.checkUserInfo,
    update: authHandlers.updateUserInfo,
    phone: authHandlers.getPhoneNumber,
    all: authHandlers.getAllUserInfo,
    getConfig: authHandlers.getConfig,
    checkAdminStatus: authHandlers.checkAdminStatus,
    // 通知
    getNotificationList: notificationHandlers.getNotificationList,
    markNotificationRead: notificationHandlers.markNotificationRead,
    markAllNotificationsRead: notificationHandlers.markAllNotificationsRead,
    getNotificationDetail: notificationHandlers.getNotificationDetail,
    // 邀请
    getReferralStats: referralHandlers.getReferralStats,
    getInvitedUsers: referralHandlers.getInvitedUsers,
    // 地址
    addressList: addressHandlers.list,
    addressAdd: addressHandlers.add,
    addressUpdate: addressHandlers.update,
    addressRemove: addressHandlers.remove,
    addressSetDefault: addressHandlers.setDefault,
};
// 不需要登录的 action（公共接口）
// M8 修复：getConfig 返回静态空配置，首屏通常未登录拉取，免登录
const NO_AUTH_ACTIONS = new Set(['login', 'check', 'getConfig']);
// =====================================================================
// 主入口
// =====================================================================
const main = async (event, context) => {
    const { action } = event;
    if (!action || !exports.handlers[action]) {
        throw err('INVALID_PARAMS', '无效的操作类型');
    }
    try {
        const requireLogin = !NO_AUTH_ACTIONS.has(action);
        const auth = await verifyAuth(event, { requireLogin });
        logger.info(action, { openid: maskOpenid(auth.openid) });
        return await exports.handlers[action](event, context, auth);
    }
    catch (error) {
        logger.error(action, error);
        if (isBusinessError(error)) {
            return toResponse(error); // 受控：业务异常 message 安全回显
        }
        // H1 修复：未知异常经 wrapUnknown 脱敏，避免原始 message（含集合名/内部标识）透传客户端
        return toResponse(wrapUnknown(error));
    }
};
exports.main = main;
// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================
// userService 必须被 CloudBase 云函数 runtime 加载（exports.main）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module;
_mod.exports = { main: exports.main };
_mod.exports.main = exports.main;
_mod.exports.default = _mod.exports;
// 避免 unused 警告：db 在 service handler 中通过 initCloud 二次获取
void db;
exports.default = { main: exports.main, handlers: exports.handlers };
