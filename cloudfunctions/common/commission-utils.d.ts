/**
 * common/commission-utils.ts - 共享佣金记录工具
 *
 * 业务功能：
 *   - createCommissionRecord：订单支付成功后创建佣金记录（best-effort）
 *     1) 读取 system_config.commission_rates[orderType]
 *     2) 查询订单买家（users._id = openid）
 *     3) 查找邀请人（inviterId）
 *     4) 计算佣金金额 = 订单金额 × 佣金率 / 100
 *     5) 幂等检查（已存在则跳过）
 *     6) 写入 tuan_commissions 集合
 *
 * 使用方式：
 *   - 各云函数通过 require('../../common/commission-utils').createCommissionRecord 调用
 *   - 所有异常都被吞掉（best-effort），仅记录日志
 *   - 无需鉴权 / 无需返回结构
 */
/** 订单类型 */
export type CommissionOrderType = 'order' | 'mall' | 'tuan' | 'activity' | 'feeding';
/** 订单文档（最小子集） */
export interface CommissionOrderDoc {
    _id: string;
    ownerId?: string;
    outTradeNo?: string;
    orderNo?: string;
    totalPrice?: number;
    totalAmount?: number;
    basicPrice?: number;
    [k: string]: unknown;
}
/** 系统配置（佣金率） */
export interface CommissionConfig {
    order?: number;
    mall?: number;
    tuan?: number;
    activity?: number;
    feeding?: number;
    [k: string]: number | undefined;
}
/** 用户文档（最小子集） */
export interface CommissionUserDoc {
    _id: string;
    inviterId?: string;
    nickName?: string;
    [k: string]: unknown;
}
/** 佣金记录写入载荷 */
export interface CommissionRecordPayload {
    _id: string;
    inviterId: string;
    inviterNickName: string;
    ownerId: string;
    orderType: CommissionOrderType;
    orderId: string;
    orderNo: string;
    orderAmount: number;
    commissionRate: number;
    commissionAmount: number;
    status: 'pending';
    createdAt: Date;
    updatedAt: Date;
    [k: string]: unknown;
}
/**
 * 创建佣金记录（best-effort）
 *
 * 调用时机：
 *   - 支付成功后（paymentService / mallService / activityService / feedingService）
 *
 * 流程：
 *   1. 读取 system_config.commission_rates[orderType]
 *   2. 若 rate <= 0 → 跳过（无佣金）
 *   3. 若 order.ownerId 缺失 → 跳过
 *   4. 查询买家（users._id = ownerId）
 *   5. 若买家 inviterId 缺失 → 跳过
 *   6. 查询邀请人档案
 *   7. 计算佣金金额（orderAmount × rate / 100，保留 2 位小数）
 *   8. 幂等检查（orderId + inviterId 已存在 → 跳过）
 *   9. 写入 tuan_commissions
 *
 * 错误处理：
 *   - 任何异常都被吞掉，仅记录日志
 *   - 不影响主业务（支付成功）的响应
 *
 * @param orderType 订单类型
 * @param order 订单文档
 * @returns 始终返回 void；失败仅记日志
 */
export declare function createCommissionRecord(orderType: CommissionOrderType | string, order: CommissionOrderDoc): Promise<void>;
export default createCommissionRecord;
