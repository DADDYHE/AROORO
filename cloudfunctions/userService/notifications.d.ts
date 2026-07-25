/**
 * notifications.ts - 通知服务（TypeScript 源文件 - Sprint 37 迁移）
 *
 * 业务功能：
 *   - 获取通知列表（getNotificationList）
 *   - 标记单条通知已读（markNotificationRead）
 *   - 标记全部通知已读（markAllNotificationsRead）
 *   - 获取通知详情（getNotificationDetail）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.userService.json
 */
import type { AuthLike, CloudEvent, CloudContext } from './common/types';
export type NotificationHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export interface NotificationRecord {
    _id: string;
    ownerId: string;
    type: string;
    isRead: boolean;
    title?: string;
    content?: string;
    orderId?: string;
    status?: string;
    statusText?: string;
    createdAt: Date;
    [k: string]: unknown;
}
export interface NotificationListResult {
    list: NotificationRecord[];
    unreadCount: number;
    page: number;
    pageSize: number;
}
export declare function getNotificationList(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function markNotificationRead(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function markAllNotificationsRead(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getNotificationDetail(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
declare const _default: {
    getNotificationList: typeof getNotificationList;
    markNotificationRead: typeof markNotificationRead;
    markAllNotificationsRead: typeof markAllNotificationsRead;
    getNotificationDetail: typeof getNotificationDetail;
};
export default _default;
