/**
 * cloudfunctions/orderService/common/boarding-pricing.ts
 *
 * 家庭寄养计费核心（唯一权威）
 *
 * 两套算法：
 *   - hotel    酒店式：按过夜数计费 + 超时退房加收（≤6h 半天，>6h 全天）
 *   - hourly24 24 小时制：入住时刻向下取整到整点起算，每满 24h 为一天，尾数按实际小时计费
 *
 * 设计约束：
 *   - 纯函数：不碰 db / Date.now() / 任何 IO，可单测
 *   - 时刻用 'HH:mm' 字面量，日期用 'YYYY-MM-DD' 字面量，日期差走 Date.UTC 计算，
 *     彻底规避云函数 UTC 与本地时区差异（禁裸 new Date(str) 解析日期）
 *   - 金额全程「元」，仅最终金额四舍五入到分（项目铁律：勿 ÷100）
 *
 * 规格：deliverables/boarding-pricing-spec-2026-09-05.md
 */
export type BillingMode = 'hotel' | 'hourly24';
export interface BoardingPricingInput {
    mode?: string;
    pricePerDay: number;
    startDate: string;
    startAt: string;
    endDate: string;
    endAt: string;
    petCount?: number;
    checkOutBefore?: string;
}
export interface HotelBreakdown {
    mode: 'hotel';
    pricePerDay: number;
    nights: number;
    baseFee: number;
    checkOutBefore: string;
    overtimeMinutes: number;
    overtimeHours: number;
    overtimeFee: number;
    petCount: number;
    total: number;
}
export interface Hourly24Breakdown {
    mode: 'hourly24';
    pricePerDay: number;
    pricePerHour: number;
    billableHours: number;
    days: number;
    remainHours: number;
    baseFee: number;
    hourlyFee: number;
    petCount: number;
    total: number;
}
export type ChargeBreakdown = HotelBreakdown | Hourly24Breakdown;
export interface BoardingPricingResult {
    total: number;
    breakdown: ChargeBreakdown;
}
export declare const DEFAULT_CHECK_OUT_BEFORE = "12:00";
export declare const DEFAULT_BILLING_MODE: BillingMode;
/**
 * 家庭寄养计费入口
 *
 * @throws Error INVALID_PARAMS 日期/时刻格式非法或时间倒挂
 */
export declare function computeBoardingAmount(input: BoardingPricingInput): BoardingPricingResult;
declare const _default: {
    computeBoardingAmount: typeof computeBoardingAmount;
    DEFAULT_BILLING_MODE: "hotel";
    DEFAULT_CHECK_OUT_BEFORE: string;
};
export default _default;
