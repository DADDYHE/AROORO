/**
 * paymentService/commission.ts - 佣金记录服务（TypeScript 源文件 - Sprint 27 迁移）
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
 * 与 pay.ts / refund.ts / notify.ts 的关键差异：
 *   - 工具函数（非 handler）：被 pay.ts / notify.ts 异步调用
 *   - 导出形式：CommonJS `module.exports = createCommissionRecord`（default export）
 *   - 错误处理：所有异常都被吞掉（best-effort），仅记录日志
 *   - 无需鉴权 / 无需返回结构
 *
 * 迁移目标：
 *   - 强类型化 orderType / order / config / user / inviter / commission record
 *   - 与 common/* 共享类型（CloudBaseDB / CommissionDoc）
 *   - 编译产物（commission.js）继续被 pay.js / notify.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.paymentService.json
 *   （运行时仍消费 .js 编译产物）
 */
/** 订单类型（与 pay.ts / notify.ts 保持一致） */
export type CommissionOrderType = 'order' | 'mall' | 'tuan' | 'activity' | 'boarding' | 'feeding';
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
    boarding?: number;
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
 *   - confirmPayment 成功（pay.ts）
 *   - paymentNotify 成功（notify.ts）
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
