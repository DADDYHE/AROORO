/**
 * paymentService/refund.ts - 退款服务（TypeScript 源文件 - Sprint 24 迁移）
 *
 * 业务功能：
 *   - createRefund：发起微信支付退款（含风控前置扫描 + 限流 + 业务校验）
 *   - queryRefund：查询退款单进度
 *
 * 迁移目标：
 *   - 强类型化 event / auth / 返回值
 *   - 与 common/* 共享类型（CloudBaseDB）
 *   - 编译产物（refund.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 *   （运行时仍消费 .js 编译产物）
 */
import { type WrappedHandler } from '../common/errors';
interface CreateRefundResult {
    refundId?: string;
    outRefundNo: string;
    status?: string;
    channel?: string;
    userReceivedAccount?: string;
    pendingReview: boolean;
    riskDecision: string;
    riskReasons: string[];
}
interface WechatRefundResponse {
    refund_id?: string;
    out_refund_no?: string;
    status?: string;
    channel?: string;
    user_received_account?: string;
    message?: string;
}
/**
 * 发起退款
 *
 * 流程：
 *   1. 业务参数校验
 *   2. 订单归属校验（必须是订单 owner）
 *   3. 风控前置扫描（detectRefundAbuse，受限流保护）
 *   4. 调微信支付 API 发起退款
 *   5. 返回退款结果（含 riskDecision 供客户端/后台决策）
 *
 * @throws BusinessError INVALID_PARAMS / PERMISSION_DENIED / RISK_REJECT / RATE_LIMITED / REFUND_FAILED
 */
export declare const createRefund: WrappedHandler<CreateRefundResult>;
/**
 * 查询退款单进度
 *
 * @throws BusinessError INVALID_PARAMS / BUSINESS_ERROR
 */
export declare const queryRefund: WrappedHandler<WechatRefundResponse>;
declare const _default: {
    createRefund: WrappedHandler<CreateRefundResult>;
    queryRefund: WrappedHandler<WechatRefundResponse>;
};
export default _default;
