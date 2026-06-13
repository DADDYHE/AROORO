/**
 * addresses.ts - 地址服务（TypeScript 源文件 - Sprint 37 迁移）
 *
 * 业务功能：
 *   - 获取地址列表（list）
 *   - 添加地址（add）
 *   - 更新地址（update）
 *   - 删除地址（remove）
 *   - 设置默认地址（setDefault）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 统一 AddressRecord / AddressInput 接口
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.userService.json
 */
export interface AuthLike {
    openid?: string;
    [k: string]: unknown;
}
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    addressId?: string;
    address?: AddressInput;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export type AddressHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
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
export interface AddressRecord extends AddressInput {
    _id: string;
    openid: string;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare function list(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function add(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function update(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function remove(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function setDefault(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
declare const _default: {
    list: typeof list;
    add: typeof add;
    update: typeof update;
    remove: typeof remove;
    setDefault: typeof setDefault;
};
export default _default;
