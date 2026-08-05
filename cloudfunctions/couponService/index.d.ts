/**
 * couponService/index.ts - 优惠券服务主入口（TypeScript 源文件 - Sprint 43 迁移）
 *
 * 业务功能：
 *   - 我的优惠券（按状态查询）
 *   - 可用优惠券（订单计算折扣）
 *   - 可领取模板（领券中心）
 *   - 弹窗优惠券（指定页面）
 *   - 优惠券生命周期：领取 → 锁定（订单）→ 核销（支付完成）/ 解锁（取消）
 *
 * 共 8 个 action：
 *   1. getMyCoupons - 我的优惠券
 *   2. getAvailableCoupons - 可用优惠券
 *   3. getClaimableTemplates - 可领取模板
 *   4. getPopupCoupon - 弹窗优惠券
 *   5. claimCoupon - 领取优惠券
 *   6. lockCoupon - 锁定优惠券（订单创建时）
 *   7. useCoupon - 核销优惠券（订单完成时）
 *   8. unlockCoupon - 解锁优惠券（订单取消时）
 *
 * 优惠券类型：
 *   - fixed_amount / full_reduction：固定金额（rules.reduceAmount）
 *   - discount：折扣率（rules.discountRate，可选 rules.maxReduceAmount 封顶）
 *
 * 状态流转：unused → locked → used
 *         或：unused → locked → expired（解锁时已过期）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 优惠券规则 / 状态 / 类型强类型化
 *   - 与 adminService / partnerService / userService / activityService / mallService / feedingService / hostService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.couponService.json
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
    business?: string;
    items?: string[];
    amount?: number;
    templateId?: string;
    couponId?: string;
    orderId?: string;
    orderType?: string;
    source?: string;
    originalAmount?: number;
    discountAmount?: number;
    finalAmount?: number;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export type CouponActionHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export type CouponType = 'fixed_amount' | 'full_reduction' | 'discount';
export type CouponStatus = 'unused' | 'locked' | 'used' | 'expired';
export type CouponSource = 'claim' | 'popup' | 'system' | 'manual';
export interface CouponRules {
    threshold?: number;
    reduceAmount?: number;
    discountRate?: number;
    maxReduceAmount?: number;
    [k: string]: unknown;
}
export interface CouponTemplate {
    _id?: string;
    name?: string;
    type?: CouponType;
    rules?: CouponRules;
    applicableScopes?: string[];
    applicableItemIds?: string[];
    remaining?: number;
    perUserLimit?: number;
    claimable?: boolean;
    popupEnabled?: boolean;
    popupPage?: string;
    status?: string;
    validFrom?: string;
    validTo?: string;
    validDays?: number;
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
export interface UserCoupon {
    _id?: string;
    templateId?: string;
    templateName?: string;
    ownerId?: string;
    couponCode?: string;
    type?: CouponType;
    rules?: CouponRules;
    applicableScopes?: string[];
    applicableItemIds?: string[];
    status?: CouponStatus;
    source?: CouponSource;
    startTime?: Date | string;
    endTime?: Date | string;
    receivedAt?: Date;
    usedAt?: Date;
    usedOrderId?: string;
    usedBusiness?: string;
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
export interface CouponUsage {
    _id?: string;
    userCouponId?: string;
    templateId?: string;
    ownerId?: string;
    orderId?: string;
    businessType?: string;
    originalAmount?: number;
    discountAmount?: number;
    finalAmount?: number;
    usedAt?: Date;
    createdAt?: Date;
    [k: string]: unknown;
}
export interface AvailableCoupon {
    _id?: string;
    templateId?: string;
    templateName?: string;
    couponCode?: string;
    type?: CouponType;
    rules?: CouponRules;
    status?: CouponStatus;
    discountAmount: number;
    endTime?: Date | string;
}
export interface DiscountCalcResult {
    eligible: boolean;
    discountAmount?: number;
    message?: string;
}
export interface ClaimableTemplate {
    _id?: string;
    name?: string;
    type?: CouponType;
    rules?: CouponRules;
    applicableScopes?: string[];
    remaining?: number;
    perUserLimit?: number;
    claimedCount?: number;
    canClaim?: boolean;
    createdAt?: Date;
    [k: string]: unknown;
}
export interface PaginateResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages?: number;
    hasNext?: boolean;
}
export interface PopupCoupon {
    templateId?: string;
    name?: string;
    type?: CouponType;
    rules?: CouponRules;
    applicableScopes?: string[];
    remaining?: number;
    validDays?: number;
    perUserLimit?: number;
    canClaim: boolean;
}
export declare function generateCouponCode(): string;
export declare function calculateCouponDiscount(coupon: {
    type?: CouponType;
    rules?: CouponRules;
}, orderAmount: number): DiscountCalcResult;
export declare function getMyCoupons(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getAvailableCoupons(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getClaimableTemplates(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function claimCoupon(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function lockCoupon(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function useCoupon(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function unlockCoupon(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getPopupCoupon(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare const handlers: Record<string, CouponActionHandler>;
export declare function main(event: CloudEvent, context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    getMyCoupons: typeof getMyCoupons;
    getAvailableCoupons: typeof getAvailableCoupons;
    getClaimableTemplates: typeof getClaimableTemplates;
    getPopupCoupon: typeof getPopupCoupon;
    claimCoupon: typeof claimCoupon;
    lockCoupon: typeof lockCoupon;
    useCoupon: typeof useCoupon;
    unlockCoupon: typeof unlockCoupon;
    calculateCouponDiscount: typeof calculateCouponDiscount;
    generateCouponCode: typeof generateCouponCode;
    handlers: Record<string, CouponActionHandler>;
};
export default _default;
