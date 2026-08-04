/** 支付状态：所有订单类型共用 */
export type PaymentStatus = 'unpaid' | 'paying' | 'paid' | 'refunded' | 'closed';
/** 业务状态：统一命名规范 */
export type OrderStatus = 'pending_payment' | 'paid' | 'confirmed' | 'in_progress' | 'pending_shipment' | 'shipped' | 'completed' | 'cancelled' | 'refunded' | 'deleted' | 'rejected';
/** 提现状态 */
export type WithdrawalStatus = 'pending' | 'processing' | 'approved' | 'completed' | 'rejected';
export declare const ORDER_STATUS_LABELS: Record<OrderStatus, string>;
export declare const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string>;
export declare const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string>;
