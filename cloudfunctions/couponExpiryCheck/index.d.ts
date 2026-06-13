/**
 * couponExpiryCheck/index.ts - 优惠券过期检查（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能（cron 触发）：
 *   - 扫描 user_coupons 集合中 status='unused' 且 endTime<now 的记录
 *   - 标记 status='expired'
 *
 * 迁移目标：
 *   - 强类型化 main 函数签名与 UserCouponDoc 接口
 *   - 与 orderTimeoutService / tuanExpiryCheck 模式一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.couponExpiryCheck.json
 */
export interface CloudEvent {
    Time?: string;
    Timestamp?: number;
    TriggerName?: string;
    Message?: string;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
/** 优惠券状态 */
export type CouponStatus = 'unused' | 'locked' | 'used' | 'expired';
/** 优惠券文档（投影用） */
export interface UserCouponDoc {
    _id: string;
    status?: CouponStatus;
    endTime?: string | Date;
    [k: string]: unknown;
}
/** 处理结果 */
export interface ExpiryCheckResult {
    updatedCount: number;
}
export declare const COLLECTION = "user_coupons";
export declare const TARGET_STATUS: CouponStatus;
export declare const NEW_STATUS: CouponStatus;
/**
 * 优惠券过期检查主入口（cron 触发）。
 *
 * 流程：
 *   1. 扫描 user_coupons 中 status='unused' 且 endTime<now 的记录
 *   2. 批量更新为 status='expired'
 *   3. 返回 updatedCount
 */
export declare function main(event: CloudEvent, _context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    COLLECTION: string;
    TARGET_STATUS: "unused";
    NEW_STATUS: "expired";
};
export default _default;
