/**
 * paymentService/pay.ts - 支付服务（TypeScript 源文件 - Sprint 25 迁移）
 *
 * 业务功能：
 *   - createPayment：发起微信支付预付单（含限流 + 订单状态校验 + 金额校验）
 *   - queryPayment：查询微信支付单状态
 *   - closePayment：主动关闭未支付预付单
 *   - confirmPayment：确认支付（从微信拉起，验证 trade_state 后落库 + 状态机）
 *
 * 迁移目标：
 *   - 强类型化 event / auth / 返回值
 *   - 与 common/* 共享类型（CloudBaseDB）
 *   - 编译产物（pay.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 *   （运行时仍消费 .js 编译产物）
 */
import { type WrappedHandler } from '../../common/errors';
interface CreatePaymentResult {
    orderId: string;
    outTradeNo: string;
    paymentParams: {
        timeStamp: string;
        nonceStr: string;
        package: string;
        signType: string;
        paySign: string;
    };
}
interface ConfirmPaymentPaidResult {
    paid: true;
    alreadyConfirmed?: boolean;
}
interface ConfirmPaymentUnpaidResult {
    paid: false;
    tradeState: string;
}
type ConfirmPaymentResult = ConfirmPaymentPaidResult | ConfirmPaymentUnpaidResult;
interface WechatPayQueryResult {
    trade_state?: string;
    transaction_id?: string;
    [k: string]: unknown;
}
/**
 * 发起微信支付预付单
 *
 * 流程：
 *   1. 业务参数校验（type / orderId / amount）
 *   2. 微信支付配置校验
 *   3. 订单存在性 + 支付状态校验
 *   4. 金额一致性校验（客户端入参 vs DB 订单金额）
 *   5. 旧预付单回收（如果存在 paying 状态）
 *   6. 调微信支付 API 发起预付单（受限流保护）
 *   7. 更新订单 paymentStatus = paying
 *   8. 返回小程序支付签名
 *
 * @throws BusinessError AUTH_REQUIRED / INVALID_PARAMS / WECHAT_API_ERROR / ORDER_NOT_FOUND
 *         ORDER_ALREADY_PAID / PAYMENT_AMOUNT_MISMATCH / PAYMENT_CREATE_FAILED / RATE_LIMITED
 */
export declare const createPayment: WrappedHandler<CreatePaymentResult>;
/**
 * 查询微信支付单
 *
 * @throws BusinessError INVALID_PARAMS / BUSINESS_ERROR
 */
export declare const queryPayment: WrappedHandler<WechatPayQueryResult>;
/**
 * 主动关闭未支付预付单
 *
 * @throws BusinessError INVALID_PARAMS / BUSINESS_ERROR
 */
export declare const closePayment: WrappedHandler<null>;
/**
 * 确认支付
 *
 * 流程：
 *   1. 通过 outTradeNo 向微信拉取交易状态
 *   2. 校验 trade_state === SUCCESS
 *   3. 解析订单类型（orderType）
 *   4. 查询订单并校验状态机可转移性
 *   5. 更新订单 paymentStatus=paid + status=resolveOrderStatus(...)
 *   6. 同步 tuan / activity 类型到对应业务表
 *   7. 触发 commission 记录（best-effort）
 *
 * @throws BusinessError INVALID_PARAMS / BUSINESS_ERROR / NOT_FOUND / STATE_INVALID
 */
export declare const confirmPayment: WrappedHandler<ConfirmPaymentResult>;
declare const _default: {
    createPayment: WrappedHandler<CreatePaymentResult>;
    queryPayment: WrappedHandler<WechatPayQueryResult>;
    closePayment: WrappedHandler<null>;
    confirmPayment: WrappedHandler<ConfirmPaymentResult>;
};
export default _default;
