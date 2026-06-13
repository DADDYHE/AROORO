/**
 * paymentService/index.ts - 支付服务统一入口（TypeScript 源文件 - Sprint 47 迁移）
 *
 * 业务功能（聚合 pay / refund / notify 三个 service）：
 *   - pay     子服务：createPayment / queryPayment / closePayment / confirmPayment
 *   - refund  子服务：createRefund / queryRefund
 *   - notify  子服务：paymentNotify（微信支付 V3 HTTP 回调）
 *
 * 入口分发：
 *   - HTTP 请求（微信支付回调）：event.headers + event.body + !event.action
 *     → 直接调用 paymentNotify，跳过鉴权
 *   - 普通 API 请求：按 event.action 分发到对应 handler
 *     → 调用 verifyAuth 鉴权（paymentNotify 之外都需要登录）
 *
 * 关键设计：
 *   - 鉴权：paymentNotify 不需要登录（在 NO_AUTH_ACTIONS 中声明）
 *   - 错误：err() 工厂 + toResponse 统一响应
 *   - 业务错误：isBusinessError 类型守卫替代裸字符串 e.code === 'X'
 *   - 限流：Sprint 21 注入 initGlobalRateLimitFromDb（基于 db.rate_limits 共享计数）
 *
 * 迁移目标：
 *   - 强类型化 6 个 handler + 1 个 notify 入口
 *   - 强类型化 CloudEvent / CloudContext / AuthLike（与已迁移的 12 个服务对齐）
 *   - 抽离 NO_AUTH_ACTIONS 常量 + CloudEvent 事件分支判定
 *   - 编译产物（index.js）继续被云函数 runtime require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
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
/** 微信支付回调 HTTP 事件 */
export interface HttpEvent {
    headers?: Record<string, string | undefined>;
    body?: string | Record<string, unknown> | null;
    [k: string]: unknown;
}
/** 普通 API 事件 */
export interface ApiEvent {
    action?: string;
    data?: Record<string, unknown>;
    body?: string | Record<string, unknown>;
    Time?: string;
    Timestamp?: number;
    TriggerName?: string;
    Message?: string;
    [k: string]: unknown;
}
/** 云函数统一事件（HTTP 或 API） */
export type CloudEvent = HttpEvent & ApiEvent;
/** 云函数上下文 */
export interface CloudContext {
    [k: string]: unknown;
}
/** handler 签名（与子服务 .js 编译产物对齐） */
export type Handler = (event: CloudEvent, context: CloudContext, auth: AuthLike | null) => Promise<unknown>;
/** 子服务 handlers 表 */
export type HandlerMap = Record<string, Handler>;
/** 不需要登录的 actions（HTTP 回调或公开 endpoint） */
export declare const NO_AUTH_ACTIONS: readonly string[];
/** 支持的 action 集合（用于 fail-fast 校验） */
export declare const SUPPORTED_ACTIONS: readonly string[];
/** 判定 event 是否为 HTTP 触发（微信支付回调入口） */
export declare function isHttpRequest(event: CloudEvent): boolean;
/** 聚合后的 handlers（所有子服务暴露的 action） */
export declare const handlers: HandlerMap;
/**
 * 支付服务统一入口
 *
 * 流程：
 *   1. 若 event 是 HTTP 请求（微信支付回调）→ 直接调 paymentNotify
 *   2. 否则按 event.action 分发到对应 handler
 *   3. 对需要登录的 action 调 verifyAuth 注入 auth
 *   4. 错误统一走 handleError / toResponse 序列化
 *
 * @throws BusinessError UNKNOWN_ACTION（未知 action）
 */
export declare function main(event: CloudEvent, context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    NO_AUTH_ACTIONS: readonly string[];
    SUPPORTED_ACTIONS: readonly string[];
    isHttpRequest: typeof isHttpRequest;
    handlers: HandlerMap;
};
export default _default;
