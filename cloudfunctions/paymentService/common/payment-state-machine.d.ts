/**
 * paymentService 专用状态机（TypeScript 源文件 - Sprint 49 迁移）
 *
 * 解决：
 *   - pay.js / refund.js / notify.js 中散落的 paymentStatus 转移校验重复代码
 *   - 订单状态由 orderType + paymentStatus 双维度决定，需要统一解析
 *
 * 用法：
 *   import { paymentStateMachine, resolveOrderStatus, isKnownOrderType } from './common/payment-state-machine'
 *   import { ORDER_STATUS_ON_PAID } from './common/payment-state-machine'
 *
 *   if (!paymentStateMachine.canTransition('paying', 'paid')) {
 *     // 业务层抛出 INVALID_STATE_TRANSITION 错误
 *   }
 *   const newStatus = ORDER_STATUS_ON_PAID[orderType] || 'paid'
 *
 * 状态机：
 *   unpaid → paying → paid → refunded
 *                ↓
 *              closed
 *
 * 编译：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 *   （运行时仍消费 .js 编译产物）
 */
import type { StateMachine } from './types';
/**
 * 支付状态枚举（与 state-machine 的 states 对齐）
 */
export type PaymentState = 'unpaid' | 'paying' | 'paid' | 'refunded' | 'closed';
/** 状态转移表 */
export type PaymentTransitions = Record<PaymentState, PaymentState[]>;
/** 订单类型白名单 */
export type KnownOrderType = 'order' | 'mall' | 'tuan' | 'feeding' | 'activity';
/** 业务订单状态 */
export type OrderBusinessStatus = 'paid' | 'confirmed';
/**
 * 支付状态机：unpaid → paying → paid → refunded
 *                            ↓
 *                          closed
 */
export declare const paymentStateMachine: StateMachine<PaymentState> & {
    initial: PaymentState;
    states: PaymentState[];
    transitions: PaymentTransitions;
    isValidState: (s: string) => s is PaymentState;
    nextStates: (from: PaymentState) => PaymentState[];
    isTerminal: (state: PaymentState) => boolean;
    getMetadata: (state: PaymentState) => Record<string, unknown> | null;
};
/**
 * 已知订单类型判断
 */
export declare function isKnownOrderType(orderType: unknown): orderType is KnownOrderType;
/**
 * 支付成功时各订单类型对应的业务状态
 *   - order / mall / tuan: 进入 paid 状态（业务流程 = 支付完成）
 *   - feeding / activity: 进入 confirmed 状态（需要二次确认）
 */
export declare const ORDER_STATUS_ON_PAID: Record<KnownOrderType, OrderBusinessStatus>;
/**
 * 解析订单最终状态：orderType → 支付成功后的业务状态
 *   - 已知类型：返回 ORDER_STATUS_ON_PAID[orderType]
 *   - 未知类型：返回兜底值（默认 'paid'）
 *   - null / undefined：返回兜底值
 */
export declare function resolveOrderStatus(orderType: unknown, fallback?: OrderBusinessStatus): OrderBusinessStatus;
