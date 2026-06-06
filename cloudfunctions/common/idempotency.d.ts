/**
 * 幂等键与去重工具（TypeScript 源文件 - Sprint 13 迁移）
 *
 * 解决：
 *   - 支付回调、订单创建、提现等关键链路缺乏幂等保护
 *   - 微信支付回调重试可能导致重复入账
 *
 * 用法：
 *   const { buildIdempotencyKey, isIdempotentHit } = require('./common/idempotency')
 *
 *   // 1. 客户端调用前生成 key
 *   const key = buildIdempotencyKey({
 *     userId: 'u1',
 *     action: 'createOrder',
 *     payload: { petId: 'p1', duration: 3 },
 *   })
 *   // → 'u1:createOrder:<sha256 of payload>'
 *
 *   // 2. 服务端去重
 *   if (await isIdempotentHit(db, 'idempotency_keys', key)) {
 *     return err('IDEMPOTENT_REPLAY')
 *   }
 *   await db.collection('idempotency_keys').add({ _id: key, createdAt: new Date() })
 *
 *   // 3. 微信支付回调验签后做幂等
 *   const notifKey = `wxpay:notify:${outTradeNo}:${transactionId}`
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
import type { CloudBaseDB } from './types';
/**
 * 构造幂等键的输入参数
 */
export interface IdempotencyKeyInput {
    userId?: string;
    action: string;
    payload?: Record<string, unknown> | string;
    scope?: string;
}
/**
 * 微信支付回调输入
 */
export interface PaymentNotifyInput {
    outTradeNo?: string;
    transactionId?: string;
    event?: 'pay' | 'refund' | string;
}
/**
 * 注册幂等键的结果
 */
export interface RegisterIdempotencyResult {
    ok: boolean;
    duplicate: boolean;
    replayed?: boolean;
}
/**
 * 频次限制结果
 */
export interface RateLimitResult {
    allowed: boolean;
    count: number;
    resetAt: Date;
}
/**
 * 构造幂等键
 *
 * 命名规范：`<scope>:<action>:<hash>` 或 `<scope>:<action>:<fingerprint>`
 */
export declare function buildIdempotencyKey({ userId, action, payload, scope }: IdempotencyKeyInput): string;
/**
 * 微信支付回调幂等键（专用）
 */
export declare function buildPaymentIdempotencyKey(notify: PaymentNotifyInput): string;
/**
 * 从记录中检测幂等命中
 */
export declare function isIdempotentHit(db: CloudBaseDB, collection: string, key: string): Promise<boolean>;
/**
 * 注册幂等键（带过期时间）
 *
 * 建议 TTL：支付/订单 24h，活动报名 1h，登录 5min
 */
export declare function registerIdempotencyKey(db: CloudBaseDB, collection: string, key: string, meta?: Record<string, unknown>, ttlMs?: number): Promise<RegisterIdempotencyResult>;
/**
 * 封装"幂等命中 → 抛 IDEMPOTENT_REPLAY"的标准用法
 */
export declare function assertIdempotent(db: CloudBaseDB, collection: string, key: string): Promise<void>;
/**
 * 时间窗口内同 action 的频次限制
 */
export declare function checkRateLimit(db: CloudBaseDB, collection: string, actionKey: string, maxCount: number, windowMs: number): Promise<RateLimitResult>;
/**
 * 封装"频次超限 → 抛 RATE_LIMITED"的标准用法（与 assertIdempotent 对称）
 */
export declare function assertRateLimit(db: CloudBaseDB, collection: string, actionKey: string, maxCount: number, windowMs: number): Promise<void>;
