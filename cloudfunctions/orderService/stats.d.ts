/**
 * orderService/stats.ts - 统计服务（TypeScript 源文件 - Sprint 30 迁移）
 *
 * 业务功能（2 个 handler）：
 *   1. getStats        通用统计（owner / host 双视角）
 *   2. getIncomeStats  收入统计（host 视角，含按状态 + 日期范围聚合）
 *
 * 关键设计：
 *   - 鉴权：所有 handler 都需 auth
 *   - 错误：使用 err() 工厂（参数校验），handleError 包装（统一响应）
 *   - 业务错误：isBusinessError 类型守卫（替代裸字符串 e.code === 'X'）
 *   - 聚合：使用 db.collection.aggregate().group() 计算 bookingCount / totalSpent / totalIncome
 *   - 日期范围：today / week / month / last_month / default（与 orders.ts 共享语义）
 *
 * 迁移目标：
 *   - 强类型化 2 个 handler 的 event / context / auth
 *   - 强类型化聚合查询的输入/输出（消除聚合字段拼写错误）
 *   - 编译产物（stats.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 *   （运行时仍消费 .js 编译产物）
 *
 * 后续计划：
 *   - Sprint 31: orderService 完成 TS 迁移
 */
import type { ApiResponse } from '../common/types';
/** 通用 handler 签名（event / context / auth） */
type AuthLike = {
    openid?: string;
    [k: string]: unknown;
};
type EventLike = Record<string, unknown>;
type ContextLike = Record<string, unknown>;
type HandlerResult = Promise<ApiResponse<unknown> | unknown>;
/**
 * 1. getStats - 通用统计（owner / host 双视角）
 */
export declare function getStats(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 2. getIncomeStats - 收入统计（host 视角）
 *
 * 支持：
 *   - status: 'all' | 'completed' | 'pending'
 *   - dateRange: 'today' | 'week' | 'month' | 'last_month' | 'all' | '全部'
 *   - limit: 单次返回的最大订单数（默认 500，上限 1000）
 */
export declare function getIncomeStats(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
declare const _handlers: {
    getStats: any;
    getIncomeStats: any;
};
export default _handlers;
