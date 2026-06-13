/**
 * orderService/index.ts - 订单服务统一入口（TypeScript 源文件 - Sprint 47 迁移）
 *
 * 业务功能（聚合 orders + stats 两个 service）：
 *   - orders 子服务（15 个 handler）：
 *     getOrders / createOrder / updateOrderStatus / cancelOrder / getOrderDetail /
 *     getActivityOrders / getActivityOrderDetail / calculatePrice / checkDateAvailability /
 *     getBoardingOrders / getBoardingOrderDetail / handleBoardingOrder / submitEvaluation /
 *     getHostEvaluations / enrichOrders
 *   - stats 子服务（2 个 handler）：
 *     getStats / getIncomeStats
 *
 * 入口分发：
 *   - 所有 action 都需要登录（verifyAuth with requireLogin=true）
 *   - 按 event.action 分发到对应 handler
 *
 * 关键设计：
 *   - 鉴权：所有 handler 都需 auth（calculatePrice / checkDateAvailability / getHostEvaluations
 *     在 orders.ts 内部也走 auth，但通过 _isHttpAuth 兼容公开访问）
 *   - 错误：err() 工厂 + handleError / toResponse 统一响应
 *   - 业务错误：isBusinessError 类型守卫
 *   - 限流：Sprint 21 注入 initGlobalRateLimitFromDb
 *
 * 迁移目标：
 *   - 强类型化 17 个 handler + CloudEvent / CloudContext / AuthLike
 *   - 抽离 SUPPORTED_ACTIONS 常量 + handlers 聚合逻辑
 *   - 编译产物（index.js）继续被云函数 runtime require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 *   （运行时仍消费 .js 编译产物）
 */
/** 鉴权后注入的会话信息（来自 verifyAuth） */
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
/** 普通 API 事件 */
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    body?: string | Record<string, unknown>;
    Time?: string;
    Timestamp?: number;
    TriggerName?: string;
    Message?: string;
    [k: string]: unknown;
}
/** 云函数上下文 */
export interface CloudContext {
    [k: string]: unknown;
}
/** handler 签名（与子服务 .js 编译产物对齐） */
export type Handler = (event: CloudEvent, context: CloudContext, auth: AuthLike | null) => Promise<unknown>;
/** 子服务 handlers 表 */
export type HandlerMap = Record<string, Handler>;
/** 支持的 action 集合（用于 fail-fast 校验） */
export declare const SUPPORTED_ACTIONS: readonly string[];
/** 聚合后的 handlers（与原 index.js 字段顺序保持一致） */
export declare const handlers: HandlerMap;
/**
 * 订单服务统一入口
 *
 * 流程：
 *   1. 校验 event.action 非空且在 SUPPORTED_ACTIONS 中
 *   2. 调 verifyAuth 注入 auth（所有 action 都需要登录）
 *   3. 按 action 分发到对应 handler
 *   4. 错误统一走 handleError / toResponse 序列化
 *
 * @throws BusinessError UNKNOWN_ACTION（缺少或未知 action）
 */
export declare function main(event: CloudEvent, context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    SUPPORTED_ACTIONS: readonly string[];
    handlers: HandlerMap;
};
export default _default;
