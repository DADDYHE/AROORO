/**
 * auth.ts - 用户身份服务（TypeScript 源文件 - Sprint 37 迁移）
 *
 * 业务功能：
 *   - 登录（login）
 *   - 获取身份（getIdentity）
 *   - 同步身份（syncIdentity）
 *   - 检查用户信息（checkUserInfo）
 *   - 更新用户信息（updateUserInfo）
 *   - 获取手机号（getPhoneNumber）
 *   - 获取全部用户信息（getAllUserInfo）
 *   - 获取配置（getConfig）
 *   - 检查管理员状态（checkAdminStatus）
 *   - 个人中心统计聚合（getMyProfileSummary）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 与 index.ts 的 UserActionHandler 类型对齐
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.userService.json
 */
import type { AuthLike, CloudEvent, CloudContext } from './common/types';
export type AuthHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export interface UserRecord {
    _id: string;
    openid: string;
    nickName: string;
    avatarUrl: string;
    gender?: string;
    phone?: string;
    birthday?: string;
    email?: string;
    address?: string;
    ownerName?: string;
    role: string;
    isPartner?: boolean;
    bio?: string;
    inviterId?: string;
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt?: Date;
}
export interface UserPublicView {
    _id: string;
    openid: string;
    nickName: string;
    avatarUrl: string;
    gender: string;
    phone: string;
    birthday: string;
    email: string;
    address: string;
    ownerName: string;
    hasPhone: boolean;
    role: string;
    isPartner: boolean;
}
export interface AdminRecord {
    _id: string;
    status: string;
    isPartner?: boolean;
    roles?: string[];
    permissions?: string[];
    [k: string]: unknown;
}
export interface LoginResult {
    user: UserPublicView;
    isNewUser: boolean;
}
export interface IdentityResult {
    user: Omit<UserPublicView, 'role' | 'isPartner'>;
}
export interface CheckResult {
    exists: boolean;
    nickName?: string;
    avatarUrl?: string;
    hasPhone?: boolean;
}
export interface PhoneData {
    phoneNumber?: string;
    purePhoneNumber?: string;
    data?: {
        phoneNumber?: string;
    };
}
export interface AllUserInfoResult {
    userInfo: CheckResult | null;
    phone: {
        phoneNumber: string;
    } | null;
}
export interface ProfileSummaryResult {
    petCount: number;
    activityCount: number;
    couponCount: number;
}
export interface WxContext {
    OPENID?: string;
    APPID?: string;
    UNIONID?: string;
    [k: string]: unknown;
}
export declare function login(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getIdentity(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function syncIdentity(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function checkUserInfo(event: CloudEvent): Promise<unknown>;
export declare function updateUserInfo(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getPhoneNumber(event: CloudEvent): Promise<unknown>;
export declare function getAllUserInfo(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getConfig(): Promise<unknown>;
export declare function checkAdminStatus(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getMyProfileSummary(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
declare const _default: {
    login: typeof login;
    getIdentity: typeof getIdentity;
    syncIdentity: typeof syncIdentity;
    checkUserInfo: typeof checkUserInfo;
    updateUserInfo: typeof updateUserInfo;
    getPhoneNumber: typeof getPhoneNumber;
    getAllUserInfo: typeof getAllUserInfo;
    getConfig: typeof getConfig;
    checkAdminStatus: typeof checkAdminStatus;
    getMyProfileSummary: typeof getMyProfileSummary;
};
export default _default;
