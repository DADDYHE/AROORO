/**
 * orderService/payment.ts - 旧版支付实现（TypeScript 源文件 - Sprint 29 迁移）
 *
 * @deprecated 此文件为旧版支付实现，请使用 paymentService 云函数。
 *   新版支付入口: cloudfunctions/paymentService/services/pay.js
 *   保留此文件仅为向后兼容，请勿新增调用。
 *
 * 业务功能（2 个 handler）：
 *   1. wechatPay          微信支付下单（旧版）
 *   2. wechatPayNotify    微信支付回调（旧版）
 *
 * 关键设计：
 *   - 鉴权：wechatPay 需 auth，wechatPayNotify 不需（由 index.js 判定）
 *   - 错误：使用 err() 工厂（参数校验），withErrorHandling 包装（统一响应）
 *   - 业务错误：isBusinessError 类型守卫（替代裸字符串 e.code === 'X'）
 *   - wechatPayNotify 返回原始 HTTP 响应（statusCode + body）
 *   - wechatPay 返回 ApiResponse（标准 handler 响应）
 *
 * 迁移目标：
 *   - 强类型化 2 个 handler 的 event / context / auth
 *   - 强类型化微信支付配置、请求体、响应（避免拼写错误）
 *   - 编译产物（payment.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 *   （运行时仍消费 .js 编译产物）
 *
 * 后续计划：
 *   - Sprint 30: 移除旧版 payment.js（在新版 paymentService 完全替代后）
 *   - 现阶段保留 .js 是为了与 orderService/index.js 兼容
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
type NotifyHttpResponse = {
    statusCode: number;
    body: string;
};
/**
 * 1. wechatPay - 微信支付下单（旧版）
 * @deprecated 请使用 paymentService 云函数
 */
export declare function wechatPay(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 2. wechatPayNotify - 微信支付回调（旧版）
 *
 * 注意：此 handler 返回原始 HTTP 响应（statusCode + body），
 *       而非 ApiResponse。原因：微信支付回调需要返回特定的状态码和 body。
 *
 * @deprecated 请使用 paymentService 云函数
 */
export declare function wechatPayNotify(event: EventLike): Promise<NotifyHttpResponse>;
/** wechatPayNotify 返回原始 HTTP 响应，不通过 withErrorHandling 包装（保留原始 statusCode） */
declare const _handlers: {
    wechatPay: any;
    wechatPayNotify: typeof wechatPayNotify;
};
export default _handlers;
