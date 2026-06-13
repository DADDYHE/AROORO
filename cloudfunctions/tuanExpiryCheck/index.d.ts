/**
 * tuanExpiryCheck/index.ts - 团购过期检查（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能（cron 触发）：
 *   - 扫描 tuan_deals 集合中 status in [published, active] 且 endTime<now 的记录
 *   - 标记 status='ended'
 *
 * 迁移目标：
 *   - 强类型化 main 函数签名与 TuanDealDoc 接口
 *   - 与 orderTimeoutService / couponExpiryCheck 模式一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.tuanExpiryCheck.json
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
/** 团购状态 */
export type TuanStatus = 'draft' | 'published' | 'active' | 'ended' | 'cancelled';
/** 团购文档（投影用） */
export interface TuanDealDoc {
    _id: string;
    status?: TuanStatus;
    endTime?: string | Date;
    [k: string]: unknown;
}
/** 处理结果 */
export interface ExpiryCheckResult {
    updatedCount: number;
}
export declare const COLLECTION = "tuan_deals";
export declare const TARGET_STATUSES: readonly TuanStatus[];
export declare const NEW_STATUS: TuanStatus;
/**
 * 团购过期检查主入口（cron 触发）。
 *
 * 流程：
 *   1. 扫描 tuan_deals 中 status in [published, active] 且 endTime<now 的记录
 *   2. 批量更新为 status='ended'
 *   3. 返回 updatedCount
 */
export declare function main(event: CloudEvent, _context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    COLLECTION: string;
    TARGET_STATUSES: readonly TuanStatus[];
    NEW_STATUS: "ended";
};
export default _default;
