/**
 * income.ts - 服务收入服务（活动创建者、寄养服务者、上门服务者）
 *
 * 业务功能：
 *   - 获取服务收入概览（getServiceIncomeOverview）
 *   - 获取服务收入明细（getServiceIncomeDetails）
 *
 * 收入类型：
 *   - 活动收入：活动创建者通过创建活动获得的报名费收入
 *   - 寄养收入：寄养家庭提供服务获得的报酬
 *   - 上门服务收入：服务师提供上门服务获得的报酬
 *
 * 与佣金的区别：
 *   - 佣金：推广奖励（推荐他人消费获得的分成）
 *   - 收入：服务报酬（提供服务直接获得的报酬）
 */
export interface AuthLike {
    openid?: string;
    adminId?: string;
    partnerId?: string;
    isPartner?: boolean;
    roles?: string[];
    permissions?: string[];
    [k: string]: unknown;
}
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    type?: string;
    page?: number;
    pageSize?: number;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export interface ServiceIncomeAggregate {
    total: number;
    monthly: number;
    today: number;
    count: number;
}
export interface ServiceIncomeOverview {
    activity: ServiceIncomeAggregate;
    boarding: ServiceIncomeAggregate;
    feeding: ServiceIncomeAggregate;
    totalIncome: number;
    monthlyIncome: number;
    todayIncome: number;
}
export interface ServiceIncomeDetailItem {
    id: string;
    type: 'activity' | 'boarding' | 'feeding';
    typeName: string;
    amount: number;
    orderNo: string;
    description: string;
    status: string;
    createdAt: Date;
    orderId?: string;
}
/**
 * 获取服务收入概览
 * 包含：活动收入、寄养收入、上门服务收入
 *
 * L6: 喂养师体系已废弃——统一从 service_incomes 集合查询（providerId = openid），
 *   不再中转 feeders 集合，也不再直接查 feedingOrders.ownerId
 */
export declare function getServiceIncomeOverview(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
/**
 * 获取服务收入明细
 * @param event.type - 收入类型筛选：all | activity | boarding | feeding
 * @param event.page - 页码（从1开始）
 * @param event.pageSize - 每页数量
 *
 * L6: 喂养师体系已废弃——统一从 service_incomes 集合查询（providerId = openid），
 *   不再中转 feeders 集合，也不再直接查 feedingOrders.ownerId
 */
export declare function getServiceIncomeDetails(event: CloudEvent, context: CloudContext, auth: AuthLike): Promise<unknown>;
declare const _default: {
    getServiceIncomeOverview: typeof getServiceIncomeOverview;
    getServiceIncomeDetails: typeof getServiceIncomeDetails;
};
export default _default;
