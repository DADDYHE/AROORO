/**
 * feedingService/index.ts - 喂养服务主入口（TypeScript 源文件 - Sprint 41 迁移）
 *
 * 业务功能：
 *   - 喂养师管理（CRUD + 列表筛选）
 *   - 喂养下单（多宠物 + 上门 + 钥匙 + 熟悉度 + 多次访问）
 *   - 订单管理（我的订单 / 详情 / 状态流转 / 喂养师视角订单）
 *   - 佣金记录（status=completed 触发）
 *
 * 共 12 个 action：
 *   1. getFeederList - 喂养师列表
 *   2. getFeederDetail - 喂养师详情
 *   3. createFeederProfile - 创建喂养师档案
 *   4. updateFeederProfile - 更新喂养师档案
 *   5. createFeedingOrder - 创建喂养订单
 *   6. getFeedingOrders - 我的喂养订单
 *   7. getOrderStatus - 获取订单状态
 *   8. updateFeedingOrderStatus - 更新订单状态
 *   9. getFeederOrders - 喂养师视角订单列表
 *  10. getFeedingOrderDetail - 喂养师视角订单详情
 *  11. handleFeedingOrder - 喂养师接单/完成操作
 *  12. getCurrentFeeder - 获取当前用户喂养师档案
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 与 adminService / partnerService / userService / activityService / mallService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.feedingService.json
 */
export interface AuthLike {
    openid?: string;
    nickName?: string;
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
    page?: number;
    pageSize?: number;
    status?: string;
    location?: string;
    serviceType?: string;
    feederId?: string;
    orderId?: string;
    operation?: string;
    name?: string;
    avatarUrl?: string;
    phone?: string;
    description?: string;
    serviceArea?: string[];
    pricePerVisit?: number;
    certifications?: unknown[];
    petIds?: string[];
    startDate?: string;
    endDate?: string;
    visitTimes?: string[];
    address?: string;
    notes?: string;
    keyMethod?: string;
    visitTime?: string;
    feederGender?: string;
    familiarity?: string;
    familiarityText?: string;
    familiarityDates?: string[];
    multiVisit?: number;
    multiVisitText?: string;
    multiVisitDates?: string[];
    petDetails?: unknown[];
    petServices?: Record<string, unknown>;
    totalAmount?: number;
    originalAmount?: number;
    couponId?: string;
    couponDiscount?: number;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export type FeedingActionHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export interface UserRecord {
    _id?: string;
    openid?: string;
    nickName?: string;
    inviterId?: string;
    [k: string]: unknown;
}
export interface AdminRecord {
    _id?: string;
    openid?: string;
    status?: string;
    roles?: string[];
    permissions?: string[];
    [k: string]: unknown;
}
export interface FeederRecord {
    _id?: string;
    name?: string;
    realName?: string;
    nickname?: string;
    avatarUrl?: string;
    phone?: string;
    description?: string;
    serviceArea?: string[];
    serviceTypes?: string[];
    serviceTags?: string[];
    pricePerVisit?: number;
    certifications?: unknown[];
    rating?: number;
    orderCount?: number;
    status?: string;
    gender?: string;
    beautyInfo?: Record<string, unknown>;
    createdBy?: string;
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
export interface FeedingOrderRecord {
    _id?: string;
    orderNo?: string;
    orderType?: string;
    ownerId?: string;
    feederId?: string;
    petIds?: string[];
    petDetails?: PetDetailInput[];
    petServices?: Record<string, unknown>;
    startDate?: string;
    endDate?: string;
    visitTimes?: string[];
    address?: string;
    notes?: string;
    keyMethod?: string;
    visitTime?: string;
    feederGender?: string;
    familiarity?: string;
    familiarityText?: string;
    familiarityDates?: string[];
    multiVisit?: number;
    multiVisitText?: string;
    multiVisitDates?: string[];
    totalAmount?: number;
    totalPrice?: number;
    originalAmount?: number;
    couponId?: string;
    couponDiscount?: number;
    status?: string;
    paymentStatus?: string;
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
export interface PetDetailInput {
    id?: string;
    petId?: string;
    _id?: string;
    name?: string;
    avatarUrl?: string;
    [k: string]: unknown;
}
export interface FeederInfo {
    feederName?: string;
    feederPhone?: string;
    feederAvatar?: string;
    [k: string]: unknown;
}
export interface StatusTip {
    title: string;
    subtitle: string;
    icon: string;
}
export interface PaginateResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages?: number;
    hasNext?: boolean;
}
export interface CommissionRecord {
    _id?: string;
    inviterId?: string;
    inviterNickName?: string;
    ownerId?: string;
    orderType?: string;
    orderId?: string;
    orderNo?: string;
    orderAmount?: number;
    commissionRate?: number;
    commissionAmount?: number;
    status?: string;
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
export interface SystemConfig {
    [key: string]: unknown;
}
export declare function getFeederList(event: CloudEvent, _context: CloudContext, _auth: AuthLike): Promise<unknown>;
export declare function getFeederDetail(event: CloudEvent, _context: CloudContext, _auth: AuthLike): Promise<unknown>;
export declare function createFeederProfile(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function updateFeederProfile(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function createFeedingOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getFeedingOrders(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function updateFeedingOrderStatus(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getOrderStatus(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getFeederOrders(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getFeedingOrderDetail(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function handleFeedingOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getCurrentFeeder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare const handlers: Record<string, FeedingActionHandler>;
export declare function main(event: CloudEvent, context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    getFeederList: typeof getFeederList;
    getFeederDetail: typeof getFeederDetail;
    createFeederProfile: typeof createFeederProfile;
    updateFeederProfile: typeof updateFeederProfile;
    createFeedingOrder: typeof createFeedingOrder;
    getFeedingOrders: typeof getFeedingOrders;
    getOrderStatus: typeof getOrderStatus;
    updateFeedingOrderStatus: typeof updateFeedingOrderStatus;
    getFeederOrders: typeof getFeederOrders;
    getFeedingOrderDetail: typeof getFeedingOrderDetail;
    handleFeedingOrder: typeof handleFeedingOrder;
    getCurrentFeeder: typeof getCurrentFeeder;
    handlers: Record<string, FeedingActionHandler>;
};
export default _default;
