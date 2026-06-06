/**
 * 常用 CloudBase 数据库查询构造器（TypeScript 源文件 - Sprint 17 迁移）
 *
 * 解决：
 *   - 各云函数中重复实现 hostProfileQuery / userByOpenId / activityByDate 等查询
 *   - where / orderBy / skip / limit 链式调用拼写错误难发现
 *
 * 用法：
 *   const qb = require('./common/query-builders')
 *
 *   const chain = qb.hostProfile({ status: 'active', city: '上海' })
 *     .orderBy('pricePerDay', 'asc')
 *     .limit(20)
 *   const { data } = await chain.get()
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
import type { CloudBaseDB, CloudBaseQuery } from './types';
import type { RangeQueryDescriptor } from './date-range';
export declare const COLLECTION: Readonly<{
    USERS: "users";
    HOSTS: "hostProfiles";
    PETS: "pets";
    ORDERS: "orders";
    PRODUCTS: "products";
    COUPONS: "coupons";
    USER_COUPONS: "userCoupons";
    ACTIVITIES: "activities";
    ACTIVITY_REGS: "activityRegistrations";
    TUAN: "tuanActivities";
    TUAN_PARTS: "tuanParticipants";
    FAVORITES: "favorites";
}>;
export type CollectionName = (typeof COLLECTION)[keyof typeof COLLECTION];
export interface HostProfileFilters {
    status?: string;
    city?: string;
    hostId?: string;
    userId?: string;
    services?: string[];
    [key: string]: unknown;
}
export interface OrderFilters {
    userId?: string;
    hostId?: string;
    status?: string;
    payStatus?: string;
    createdAfter?: Date | string;
    [key: string]: unknown;
}
export interface ProductFilters {
    category?: string;
    keyword?: string;
    [key: string]: unknown;
}
/**
 * 创建带预设查询的 builder
 */
export declare function builder(db: CloudBaseDB, collection: string, presetWhere?: Record<string, unknown>): CloudBaseQuery;
/**
 * 用户 by _openid
 */
export declare function userByOpenId(db: CloudBaseDB, openid: string): CloudBaseQuery;
/**
 * 用户 by userId（自定义）
 */
export declare function userById(db: CloudBaseDB, userId: string): CloudBaseQuery;
/**
 * 寄养家庭查询
 */
export declare function hostProfile(db: CloudBaseDB, filters?: HostProfileFilters): CloudBaseQuery;
/**
 * 订单 by 状态
 */
export declare function ordersByStatus(db: CloudBaseDB, filters?: OrderFilters): CloudBaseQuery;
/**
 * 商品查询（默认 status=active）
 */
export declare function activeProducts(db: CloudBaseDB, filters?: ProductFilters): CloudBaseQuery;
/**
 * 用户优惠券（未使用 + 未过期）
 */
export declare function userCouponsAvailable(db: CloudBaseDB, userId: string, now?: Date): CloudBaseQuery;
/**
 * 活动报名 by 活动 + 用户
 */
export declare function activityRegistration(db: CloudBaseDB, activityId: string, userId: string): CloudBaseQuery;
/**
 * 团购参与者 by 团 ID
 */
export declare function tuanParticipants(db: CloudBaseDB, tuanId: string): CloudBaseQuery;
/**
 * 收藏 by user + 目标
 */
export declare function favorite(db: CloudBaseDB, userId: string, targetId: string): CloudBaseQuery;
/**
 * 时间范围查询（与 date-range.js 配合）
 *
 * @param db CloudBase db 实例
 * @param collection 集合名
 * @param field 时间字段名（如 'createdAt' / 'paidAt'）
 * @param rangeQuery 来自 date-range#buildRangeQuery 的输出
 * @param extraWhere 附加 where
 */
export declare function inDateRange(db: CloudBaseDB, collection: string, field: string, rangeQuery: RangeQueryDescriptor | null, extraWhere?: Record<string, unknown>): CloudBaseQuery;
declare const _default: {
    COLLECTION: Readonly<{
        USERS: "users";
        HOSTS: "hostProfiles";
        PETS: "pets";
        ORDERS: "orders";
        PRODUCTS: "products";
        COUPONS: "coupons";
        USER_COUPONS: "userCoupons";
        ACTIVITIES: "activities";
        ACTIVITY_REGS: "activityRegistrations";
        TUAN: "tuanActivities";
        TUAN_PARTS: "tuanParticipants";
        FAVORITES: "favorites";
    }>;
    builder: typeof builder;
    userByOpenId: typeof userByOpenId;
    userById: typeof userById;
    hostProfile: typeof hostProfile;
    ordersByStatus: typeof ordersByStatus;
    activeProducts: typeof activeProducts;
    userCouponsAvailable: typeof userCouponsAvailable;
    activityRegistration: typeof activityRegistration;
    tuanParticipants: typeof tuanParticipants;
    favorite: typeof favorite;
    inDateRange: typeof inDateRange;
};
export default _default;
