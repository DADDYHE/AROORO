/**
 * userService/index.ts - 用户服务主入口（TypeScript 源文件 - Sprint 34 迁移）
 *
 * 业务功能：
 *   - 小程序端用户身份、地址、通知、邀请等统一入口
 *   - 4 个服务子模块：auth / notifications / referral / addresses
 *   - 共 22 个 action（2026-09-02 新增 getMyProfileSummary 个人中心 3 统计聚合），覆盖：
 *     * 身份相关（login / getIdentity / syncIdentity / check / update / phone / all / getConfig / checkAdminStatus / getMyProfileSummary）
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
import type { AuthLike, CloudEvent, CloudContext } from './common/types';
export type UserActionHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export interface UserHandlers {
    login: UserActionHandler;
    getIdentity: UserActionHandler;
    syncIdentity: UserActionHandler;
    check: UserActionHandler;
    update: UserActionHandler;
    phone: UserActionHandler;
    all: UserActionHandler;
    getConfig: UserActionHandler;
    checkAdminStatus: UserActionHandler;
    getMyProfileSummary: UserActionHandler;
    getNotificationList: UserActionHandler;
    markNotificationRead: UserActionHandler;
    markAllNotificationsRead: UserActionHandler;
    getNotificationDetail: UserActionHandler;
    getReferralStats: UserActionHandler;
    getInvitedUsers: UserActionHandler;
    addressList: UserActionHandler;
    addressAdd: UserActionHandler;
    addressUpdate: UserActionHandler;
    addressRemove: UserActionHandler;
    addressSetDefault: UserActionHandler;
}
export declare const handlers: UserHandlers;
export declare const main: (event: CloudEvent, context: CloudContext) => Promise<unknown>;
declare const _default: {
    main: (event: CloudEvent, context: CloudContext) => Promise<unknown>;
    handlers: UserHandlers;
};
export default _default;
