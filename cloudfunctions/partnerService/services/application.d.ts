/**
 * application.ts - 合作伙伴申请服务（TypeScript 源文件 - Sprint 36 迁移）
 *
 * 业务功能：
 *   - 提交合作伙伴申请（submitApplication）
 *   - 查询申请状态（getApplicationStatus）
 *   - 查询合作伙伴权限（getMyPermissions）
 *
 * 迁移目标：
 *   - 修复原 application.js line 1 的路径错误（./common/errors → ../common/errors）
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json
 *
 * 数据库索引建议（运维需在对应集合上创建）：
 *   admin_applications: { openid: 1, status: 1, createdAt: -1 } - 覆盖 pending 申请查询
 *   admins: { _id: 1, status: 1 }                                - 覆盖合作伙伴权限查询
 */
export interface ApplicationRecord {
    _id: string;
    openid: string;
    nickName: string;
    avatarUrl: string;
    realName: string;
    phone: string;
    role: string;
    permissions: string[];
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: Date;
    updatedAt: Date;
}
export interface AdminRecord {
    _id: string;
    nickName?: string;
    avatarUrl?: string;
    status?: string;
    isPartner?: boolean;
    roles?: string[];
    permissions?: string[];
}
export interface SubmitApplicationEvent {
    realName?: string;
    phone?: string;
    reason?: string;
    permissions?: string[];
}
export interface AuthLike {
    openid?: string;
    adminId?: string;
    partnerId?: string;
    isPartner?: boolean;
    roles?: string[];
    permissions?: string[];
    nickName?: string;
    [k: string]: unknown;
}
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export type ApplicationHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export declare function submitApplication(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getApplicationStatus(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getMyPermissions(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
declare const _default: {
    submitApplication: typeof submitApplication;
    getApplicationStatus: typeof getApplicationStatus;
    getMyPermissions: typeof getMyPermissions;
};
export default _default;
