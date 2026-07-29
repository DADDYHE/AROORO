/**
 * common/types.ts - userService 统一公共类型定义
 *
 * 抽自 index / auth / referral / addresses / notifications 五处重复定义的
 * AuthLike / CloudEvent / CloudContext，取各模块字段并集（均可选）以保证兼容。
 * 地址域的 AddressInput 一并抽出（被 CloudEvent.address 引用）。
 *
 * 其他模块用 `import type { ... } from './common/types'` 引入，
 * 编译后类型擦除、不生成运行时 require，零运行时依赖。
 */
export interface AuthLike {
    openid?: string;
    adminId?: string;
    partnerId?: string;
    isPartner?: boolean;
    isSuperAdmin?: boolean;
    roles?: string[];
    permissions?: string[];
    _isHttpAuth?: boolean;
    [k: string]: unknown;
}
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    body?: string | Record<string, unknown>;
    headers?: Record<string, string | undefined>;
    httpMethod?: string;
    requestContext?: {
        httpMethod?: string;
        [k: string]: unknown;
    };
    accessToken?: string;
    openid?: string;
    userInfo?: Record<string, unknown>;
    inviterId?: string;
    code?: string;
    page?: number;
    pageSize?: number;
    notificationId?: string;
    addressId?: string;
    address?: AddressInput;
    [k: string]: unknown;
}
export interface CloudContext {
    HTTP_CONTEXT?: {
        headers: Record<string, string | undefined>;
    };
    [k: string]: unknown;
}
export interface AddressInput {
    name?: string;
    phone?: string;
    province?: string;
    city?: string;
    district?: string;
    detail?: string;
    fullAddress?: string;
    postalCode?: string;
    isDefault?: boolean;
    [k: string]: unknown;
}
