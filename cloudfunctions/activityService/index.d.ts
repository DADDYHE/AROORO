/**
 * activityService/index.ts - 活动服务主入口（TypeScript 源文件 - Sprint 38 迁移）
 *
 * 业务功能：
 *   - 活动列表 / 详情（用户端）
 *   - 活动报名（带风控前置 + 优惠券，支付走 paymentService 回调闭环）
 *   - 我的报名（详情、列表）
 *   - 定时状态自动更新（published → registration_stopped → ended + 佣金/收入）
 *
 * 注（P3-7 清理）：活动管理（CRUD/报名列表/导出/活动订单）已统一走
 *   adminService（合作伙伴端）与 orderService（订单列表），本服务不再承载。
 *
 * 共 5 个 action：
 *   1. getActivityList - 活动列表
 *   2. getActivityDetail - 活动详情
 *   3. submitRegistration - 提交报名（含风控前置）
 *   4. getRegistrationDetail - 报名详情
 *   5. getRegistrationList - 报名列表
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 与 adminService / partnerService / userService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.activityService.json
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
    page?: number;
    pageSize?: number;
    status?: string;
    activityId?: string;
    registrationId?: string;
    orderId?: string;
    pets?: PetInput[];
    petIds?: string[];
    phone?: string;
    notes?: string;
    friends?: unknown[];
    totalAmount?: number;
    originalAmount?: number;
    couponId?: string;
    couponDiscount?: number;
    participantCount?: number;
    title?: string;
    description?: string;
    coverUrl?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    latitude?: number | null;
    longitude?: number | null;
    maxParticipants?: number;
    category?: string;
    price?: number;
    pricePerPerson?: number;
    pricePerPet?: number;
    contactName?: string;
    contactPhone?: string;
    wechatId?: string;
    images?: string[];
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export type ActivityActionHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export interface PetInput {
    petName?: string;
    name?: string;
    petGender?: string;
    gender?: string;
    petBreed?: string;
    breed?: string;
    petId?: string;
    [k: string]: unknown;
}
export interface PetInfo {
    name: string;
    gender: string;
    breed: string;
    petId: string;
}
export interface OrganizerInfo {
    name: string;
    avatar: string;
    _avatarInvalid?: boolean;
    activityCount?: number;
}
export interface UserRecord {
    _id?: string;
    openid?: string;
    nickName?: string;
    avatarUrl?: string;
    inviterId?: string;
    [k: string]: unknown;
}
export interface AdminRecord {
    _id?: string;
    status?: string;
    isPartner?: boolean;
    nickName?: string;
    avatarUrl?: string;
    roles?: string[];
    permissions?: string[];
    [k: string]: unknown;
}
export interface ActivityRecord {
    _id?: string;
    title?: string;
    description?: string;
    coverUrl?: string;
    images?: string[];
    startTime?: string;
    endTime?: string;
    location?: string;
    latitude?: number | null;
    longitude?: number | null;
    maxParticipants?: number;
    currentParticipants?: number;
    category?: string;
    price?: number;
    pricePerPerson?: number;
    pricePerPet?: number;
    contactName?: string;
    contactPhone?: string;
    wechatId?: string;
    status?: string;
    createdBy?: string;
    organizer?: OrganizerInfo;
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
export interface RegistrationRecord {
    _id?: string;
    activityId: string;
    ownerId: string;
    openid?: string;
    phone?: string;
    notes?: string;
    pets?: PetInfo[];
    petIds?: string[];
    friends?: unknown[];
    status: string;
    totalAmount?: number;
    originalAmount?: number;
    couponId?: string;
    couponDiscount?: number;
    finalAmount?: number;
    participantCount?: number;
    petCount?: number;
    pricePerPerson?: number;
    pricePerPet?: number;
    orderId?: string;
    outTradeNo?: string;
    pendingReview?: boolean;
    riskDecision?: string;
    riskReasons?: string[];
    createdAt?: Date;
    updatedAt?: Date;
    signInStatus?: 'signed' | string;
    signedAt?: Date;
    signInLatitude?: number;
    signInLongitude?: number;
    signInDistance?: number;
    [k: string]: unknown;
}
export interface OrderRecord {
    _id?: string;
    ownerId?: string;
    orderId?: string;
    outTradeNo?: string;
    orderType?: string;
    activityId?: string;
    activityTitle?: string;
    activityCoverUrl?: string;
    activityStartTime?: string;
    activityEndTime?: string;
    activityLocation?: string;
    organizerId?: string;
    petIds?: string[];
    petsInfo?: PetInfo[];
    startDate?: string;
    endDate?: string;
    duration?: number;
    pricePerDay?: number;
    participantCount?: number;
    petCount?: number;
    pricePerPerson?: number;
    pricePerPet?: number;
    basicPrice?: number;
    totalPrice?: number;
    totalAmount?: number;
    originalAmount?: number;
    couponId?: string;
    couponDiscount?: number;
    phone?: string;
    notes?: string;
    status?: string;
    paymentStatus?: string;
    paidAt?: Date;
    ownerInfo?: {
        nickName?: string;
        avatarUrl?: string;
        phone?: string;
    };
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
export interface CommissionRecord {
    _id?: string;
    inviterId: string;
    inviterNickName: string;
    ownerId: string;
    orderType: string;
    orderId?: string;
    orderNo?: string;
    orderAmount: number;
    commissionRate: number;
    commissionAmount: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    [k: string]: unknown;
}
export interface PaginateResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
}
export interface RiskCheckResult {
    pendingReview: boolean;
    reasons: string[];
    decision: 'RISK_PASS' | 'RISK_PENDING' | 'RISK_REJECT';
}
export interface PaymentParams {
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
}
export interface ExportResult {
    activityTitle: string;
    totalCount: number;
    csvContent: string;
}
export interface ActivityDetailResult extends ActivityRecord {
    isRegistered: boolean;
    isSigned?: boolean;
    registrationId?: string;
}
export declare function getActivityList(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getActivityDetail(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function submitRegistration(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getRegistrationDetail(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getRegistrationList(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function signInRegistration(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare const handlers: Record<string, ActivityActionHandler>;
export declare function main(event: CloudEvent, context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    getActivityList: typeof getActivityList;
    getActivityDetail: typeof getActivityDetail;
    submitRegistration: typeof submitRegistration;
    signInRegistration: typeof signInRegistration;
    getRegistrationDetail: typeof getRegistrationDetail;
    getRegistrationList: typeof getRegistrationList;
    handlers: Record<string, ActivityActionHandler>;
};
export default _default;
