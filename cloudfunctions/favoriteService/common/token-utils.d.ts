export interface UserInfo {
    openid?: string;
    userId?: string;
    id?: string;
    _id?: string;
    role?: string;
    isPartner?: boolean;
    isSuperAdmin?: boolean;
    adminId?: string;
    exp?: number;
    iat?: number;
    [k: string]: unknown;
}
export interface CloudEventLike {
    headers?: Record<string, string | undefined>;
    data?: {
        token?: string;
    };
    token?: string;
    [k: string]: unknown;
}
/**
 * 验证token并解析用户信息
 */
export declare function verifyToken(token: string): UserInfo;
/**
 * 从请求头或请求体中获取token
 */
export declare function getTokenFromEvent(event: CloudEventLike): string | null;
/**
 * 生成token
 */
export declare function generateToken(userInfo: UserInfo): string;
declare const _exports: {
    verifyToken: typeof verifyToken;
    getTokenFromEvent: typeof getTokenFromEvent;
    generateToken: typeof generateToken;
};
export default _exports;
