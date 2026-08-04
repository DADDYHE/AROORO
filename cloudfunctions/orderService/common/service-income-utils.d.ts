/**
 * service-income-utils.ts - 服务收入记录工具
 *
 * 业务功能：
 *   - 记录服务收入（活动收入、寄养收入、上门服务收入）
 *   - 在特定时机（活动结束、订单完成）调用
 *
 * 与佣金的区别：
 *   - 佣金：推广奖励，记录在 commissions 表
 *   - 收入：服务报酬，记录在 service_incomes 表
 */
export type ServiceIncomeType = 'activity' | 'boarding' | 'feeding';
export interface ServiceIncomeRecord {
    _id?: string;
    providerId: string;
    type: ServiceIncomeType;
    orderId: string;
    orderNo?: string;
    amount: number;
    status: 'pending' | 'completed' | 'cancelled';
    description?: string;
    createdAt?: Date;
    updatedAt?: Date;
    settledAt?: Date;
    cancelledAt?: Date;
}
/**
 * 创建服务收入记录
 *
 * @param providerId 服务提供者ID
 * @param type 收入类型
 * @param orderId 订单ID
 * @param amount 收入金额
 * @param orderNo 订单编号（可选）
 * @param description 收入描述（可选）
 */
export declare function createServiceIncomeRecord(providerId: string, type: ServiceIncomeType, orderId: string, amount: number, orderNo?: string, description?: string): Promise<void>;
/**
 * 批量创建活动收入记录
 * 在活动结束时调用，为活动创建者记录所有报名订单的收入
 *
 * @param activityId 活动ID
 * @param creatorId 活动创建者ID
 */
export declare function createActivityIncomeRecords(activityId: string, creatorId: string): Promise<void>;
/**
 * 取消服务收入记录
 *
 * 调用时机：
 *   - 取消活动订单/报名时（type='activity'）
 *   - 取消寄养订单时（type='boarding'）
 *   - 取消喂养订单时（type='feeding'）
 *
 * 行为：
 *   - 将匹配的 service_incomes 记录 status 更新为 'cancelled'
 *   - best-effort：异常被吞掉，仅记日志
 *
 * @param orderId 订单ID
 * @param type 收入类型
 * @returns 始终返回 void；失败仅记日志
 */
export declare function cancelServiceIncomeRecord(orderId: string, type: ServiceIncomeType): Promise<void>;
declare const _default: {
    createServiceIncomeRecord: typeof createServiceIncomeRecord;
    createActivityIncomeRecords: typeof createActivityIncomeRecords;
    cancelServiceIncomeRecord: typeof cancelServiceIncomeRecord;
};
export default _default;
