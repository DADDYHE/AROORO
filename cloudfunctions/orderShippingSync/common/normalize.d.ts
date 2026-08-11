/**
 * 字段归一化适配层（TypeScript 源文件 - Sprint 17 迁移）
 *
 * 目标：解决字段同义/别名问题（详见 docs/FIELD_DEDUPLICATION_REPORT.md）
 *   - `id` / `_id`
 *   - `createAt` / `createdAt`
 *   - `days` / `nights` / `duration`
 *   - `petIds` / `pets` / `petsInfo` / `petInfos`
 *   - `nickname` / `nickName`
 *   - `totalPrice` / `totalAmount` / `amount`
 *
 * 使用方式：
 *   1. 读路径：DB 取出数据 → normalizeXxx(doc) → 返回给前端
 *   2. 写路径：前端入参 → denormalizeXxx(input) → DB 写入
 *
 * 生命周期：v1.x 兼容期，v2.0 移除。
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
export type EntityName = 'order' | 'user' | 'host' | 'pet' | 'product' | 'coupon' | 'userCoupon' | 'activity' | 'tuan';
export interface BaseDoc {
    _id?: string;
    id?: string;
    createAt?: Date | string;
    createdAt?: Date | string;
    updateAt?: Date | string;
    updatedAt?: Date | string;
    [key: string]: unknown;
}
export interface OrderDoc extends BaseDoc {
    duration?: number;
    days?: number;
    nights?: number;
    petIds?: string[];
    petIDs?: string[];
    petInfos?: unknown[];
    petsInfo?: unknown[];
    pets?: unknown[];
    hostId?: string | null;
    hostInfo?: {
        _id?: string;
        id?: string;
    } | null;
    amount?: number;
    totalAmount?: number;
    totalPrice?: number;
    money?: number;
}
export interface UserDoc extends BaseDoc {
    nickName?: string;
    nickname?: string;
    avatarUrl?: string;
    avatar?: string;
    headImg?: string;
}
export interface HostDoc extends BaseDoc {
    pricePerDay?: number;
    price?: number;
    dayPrice?: number;
}
export interface PetDoc extends BaseDoc {
    gender?: string;
    sex?: string;
}
export interface ProductDoc extends BaseDoc {
    coverUrl?: string;
    coverImage?: string;
    cover?: string;
}
export type Normalizer<T = BaseDoc> = (doc: T | null | undefined) => T | null | undefined;
export type ListNormalizer<T = BaseDoc> = (list: T[] | null | undefined) => T[];
export declare const COLLECTION_TO_ENTITY: Readonly<Record<string, EntityName>>;
/**
 * 通用归一化函数：扁平化 `_id` 改 `id`、兼容 `createdAt` / `createAt`
 */
export declare function normalizeBase<T extends BaseDoc>(doc: T | null | undefined): T | null | undefined;
/**
 * 订单归一化
 */
export declare function normalizeOrder<T extends OrderDoc>(order: T | null | undefined): T | null | undefined;
/**
 * 订单反归一化（前端入参 → DB 写入）
 */
export declare function denormalizeOrder<T extends OrderDoc>(order: T | null | undefined): T | null | undefined;
/**
 * 用户归一化
 */
export declare function normalizeUser<T extends UserDoc>(user: T | null | undefined): T | null | undefined;
/**
 * 寄养家庭归一化
 */
export declare function normalizeHost<T extends HostDoc>(host: T | null | undefined): T | null | undefined;
/**
 * 宠物归一化
 */
export declare function normalizePet<T extends PetDoc>(pet: T | null | undefined): T | null | undefined;
/**
 * 商品归一化
 */
export declare function normalizeProduct<T extends ProductDoc>(product: T | null | undefined): T | null | undefined;
/**
 * 批量归一化（用于 list 接口）
 */
export declare function normalizeList<T extends BaseDoc>(list: T[] | null | undefined, normalizer?: Normalizer<T>): T[];
/**
 * 通用入口：按集合名选择归一化器
 */
export declare function normalizeByCollection<T extends BaseDoc = BaseDoc>(collectionName: string, doc: T | T[] | null | undefined): T | T[] | null | undefined;
/**
 * 将 wx-server-sdk / db 抛出的错误归一化为 BusinessError
 */
export declare function normalizeDbError(e: Error | {
    code?: string;
    message?: string;
    errMsg?: string;
} | null | undefined): Error;
/**
 * 校验非空 payload（用于 webhook 入口）
 */
export declare function ensurePayload<T extends Record<string, unknown>>(payload: T | null | undefined, required?: string[]): T;
declare const _default: {
    COLLECTION_TO_ENTITY: Readonly<Record<string, EntityName>>;
    normalizeBase: typeof normalizeBase;
    normalizeOrder: typeof normalizeOrder;
    denormalizeOrder: typeof denormalizeOrder;
    normalizeUser: typeof normalizeUser;
    normalizeHost: typeof normalizeHost;
    normalizePet: typeof normalizePet;
    normalizeProduct: typeof normalizeProduct;
    normalizeList: typeof normalizeList;
    normalizeByCollection: typeof normalizeByCollection;
    normalizeDbError: typeof normalizeDbError;
    ensurePayload: typeof ensurePayload;
};
export default _default;
