/**
 * paymentService/notify.ts - 微信支付回调服务（TypeScript 源文件 - Sprint 26 迁移）
 *
 * 业务功能：
 *   - paymentNotify：处理微信支付 V3 回调
 *     1) 验证签名（RSA-SHA256，使用平台证书公钥）
 *     2) AES-256-GCM 解密回调资源
 *     3) 解析订单信息，推进订单状态机
 *     4) 跨集合同步（tuan_orders / orders 活动报名）
 *     5) 触发 commission 记录（best-effort）
 *
 * 与 pay.ts / refund.ts 的关键差异：
 *   - 返回结构：使用 { statusCode, body } HTTP 响应，**不是**标准 API 响应
 *     （微信支付回调直接消费此结构，错误时也必须返回 HTTP 响应而非 ApiResponse）
 *   - 不使用 withErrorHandling 包装：异常路径也需要返回 HTTP 响应
 *   - 鉴权：不需要登录（paymentService/index.js 的 NO_AUTH_ACTIONS 已声明）
 *   - 入口：paymentService/index.js 的 isHttpRequest(event) 判定
 *
 * 迁移目标：
 *   - 强类型化 event / headers / resource / orderInfo
 *   - 与 common/* 共享类型（CloudBaseDB）
 *   - 编译产物（notify.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 *   （运行时仍消费 .js 编译产物）
 */
/** HTTP 响应（与微信支付回调契约一致） */
interface NotifyHttpResponse {
    statusCode: number;
    body: string;
}
/**
 * 微信支付 V3 回调入口
 *
 * 流程：
 *   1. 解析回调头（签名 / 时间戳 / 随机串 / 证书序列号）
 *   2. 验证签名（RSA-SHA256）
 *   3. AES-256-GCM 解密 resource
 *   4. 解析 outTradeNo → 订单类型
 *   5. 查询订单，幂等检查（已 paid 则直接返回）
 *   6. 推进订单状态（paymentStatus=paid + 跨表同步）
 *   7. 触发 commission 记录
 *   8. 返回微信支付期望的响应
 *
 * 错误处理：
 *   - 业务错误：返回 HTTP 200 + SUCCESS（幂等保护）
 *   - 签名 / 格式错误：返回 HTTP 401 / 400 + FAIL
 *   - 未知错误：返回 HTTP 500 + FAIL（同时记日志）
 *
 * 签名约定：
 *   - event: HTTP 触发事件（含 headers / body）
 *   - context: 云函数上下文
 *   - auth: 永远为 null（paymentService/index.js 中 NO_AUTH_ACTIONS 包含 paymentNotify）
 */
export declare function paymentNotify(event: Record<string, unknown>, _context: Record<string, unknown>, _auth: {
    openid?: string;
    [k: string]: unknown;
} | null): Promise<NotifyHttpResponse>;
declare const _default: {
    paymentNotify: typeof paymentNotify;
};
export default _default;
