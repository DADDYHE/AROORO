/**
 * common/commission-utils.ts - 全局唯一佣金写入器（Single Source of Truth）
 *
 * 业务功能：
 *   - createCommissionRecord：订单支付/完成后创建佣金记录（best-effort）
 *     1) 规范化 orderType（order/hosting → boarding，group_buy → tuan）
 *     2) 查询订单买家（users._id = openid）→ 邀请人（inviterId）
 *     3) 解析佣金率：admins[inviterId].commissionRates → system_config.commission_rates
 *        ⭐ 支持费率键别名（boarding ↔ hosting ↔ order），修复寄养佣金恒为 0 的 P0
 *     4) 按 orderType 路由金额字段（activity=finalAmount / feeding=totalAmount / 其余 totalPrice）
 *     5) 幂等：确定性 _id + 先查后写 + 唯一索引冲突优雅恢复
 *     6) 写入 commissions 集合，失败落 alerts
 *   - cancelCommissionRecord：订单取消/退款时把 pending 佣金置为 cancelled
 *
 * 统一说明（2026-08-02 写入器合并）：
 *   - 本模块是**唯一**佣金写入实现；
 *     paymentService/services/commission.ts 与 activityService 本地实现均委托到此
 *   - 各云函数通过 require('./common/commission-utils') 调用（common 自包含约定）
 *   - 所有异常都被吞掉（best-effort），仅记录日志 + 告警，不影响主业务
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
/** 佣金记录使用的规范订单类型（写入 commissions.orderType 的值域） */
export type CommissionOrderType = 'boarding' | 'mall' | 'tuan' | 'activity' | 'feeding';
/** 订单文档（最小子集） */
export interface CommissionOrderDoc {
    _id: string;
    ownerId?: string;
    outTradeNo?: string;
    orderNo?: string;
    totalPrice?: number;
    totalAmount?: number;
    finalAmount?: number;
    basicPrice?: number;
    paidAmount?: number;
    productName?: string;
    [k: string]: unknown;
}
/** 系统配置（佣金率），键可能是 hosting 或 boarding，故用索引签名 */
export interface CommissionConfig {
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
    productName: string;
    status: 'pending';
    createdAt: unknown;
    updatedAt: unknown;
    [k: string]: unknown;
}
/**
 * 订单类型规范化表
 *   历史上同一业务有多种写法：寄养=order/hosting/boarding，团购=tuan/group_buy
 *   统一收敛后写入 commissions.orderType，保证读侧（wallet/partner）口径一致
 */
export declare const ORDER_TYPE_CANONICAL: Record<string, CommissionOrderType>;
/**
 * ⭐ P0 修复：费率键别名表
 *   线上 system_config.commission_rates 与 admins.commissionRates 的寄养键名是 `hosting`，
 *   而写入器一直用 `rates['boarding']` 查询 → undefined → rate=0 → 永不建佣。
 *   这里按候选顺序依次查找，任一命中且 > 0 即采用。
 */
export declare const RATE_KEY_ALIASES: Record<CommissionOrderType, string[]>;
/**
 * 金额字段路由表（按优先级取第一个 > 0 的字段）
 *   - 首选字段与 paymentService/pay.ts 的 ORDER_TYPE_AMOUNT_FIELD 对齐：
 *     activity=finalAmount（优惠后实付）、feeding=totalAmount、其余=totalPrice
 *   - P2-1: mall/tuan 加 paidAmount 为首选（支付成功回调写入的实付金额，
 *     用券订单 totalPrice/totalAmount 是原价，佣金应按实付计提）
 *   - 次选字段保留各业务历史写法（如 activity 镜像单可能只有 totalAmount），
 *     避免写入器统一后金额口径发生漂移
 */
export declare const AMOUNT_FIELD_BY_TYPE: Record<CommissionOrderType, string[]>;
/** 规范化订单类型（未知类型原样返回，便于排查） */
export declare function normalizeOrderType(orderType: string): CommissionOrderType;
/**
 * 从费率来源中按别名候选顺序取费率
 * @param source admins.commissionRates 或 system_config.commission_rates
 * @param canonicalType 规范化后的订单类型
 * @param rawType 调用方传入的原始类型（优先命中）
 */
export declare function pickRate(source: Record<string, unknown> | null | undefined, canonicalType: CommissionOrderType, rawType?: string): number;
/** 按 orderType 路由金额字段（优先级列表），全部无效时走通用兼容回退链 */
export declare function resolveOrderAmount(order: CommissionOrderDoc, canonicalType: CommissionOrderType): number;
/**
 * 确定性 _id（同一订单 + 同一邀请人恒定），并发下由 _id 冲突兜底去重
 *   仅保留 [A-Za-z0-9_-]，避免非法 _id 字符；长度上限 120
 */
export declare function buildCommissionId(orderId: string, inviterId: string): string;
/**
 * 检测唯一约束 / 主键冲突（CloudBase -502019、MongoDB 11000）
 *   并发双写时视为"已存在"，静默跳过而非记 error
 */
export declare function isDuplicateKeyError(e: unknown): boolean;
/**
 * 创建佣金记录（best-effort，全局唯一实现）
 *
 * 调用时机：
 *   - 寄养：orderService.handleBoardingOrder / adminService.hosting 完成
 *   - 商城：paymentService.confirmPayment|notify / adminService.completeMallOrder
 *   - 团购：paymentService.confirmPayment|notify
 *   - 活动：activityService 报名支付成功
 *   - 喂养：feedingService / paymentService.notify
 *   - 补偿：orderTimeoutService.dispatchRetry（failed_operations 重试）
 *
 * 跳过条件（均为静默 return，仅 debug 级日志）：
 *   ownerId 缺失 / 买家不存在 / 无邀请人 / 自购 / 邀请人不存在
 *   / 费率 <= 0 / 订单金额 < ¥1 / 佣金额 <= 0 / 已存在佣金记录
 *
 * @param orderType 订单类型（接受 order/hosting/boarding/group_buy 等别名）
 * @param order 订单文档
 */
export declare function createCommissionRecord(orderType: CommissionOrderType | string, order: CommissionOrderDoc): Promise<void>;
/**
 * 取消佣金记录（best-effort）
 *
 * 调用时机：订单取消 / 退款
 * 行为：将该订单下所有 pending 佣金置为 cancelled（已结算的 settled 不动）
 */
export declare function cancelCommissionRecord(orderId: string): Promise<void>;
export default createCommissionRecord;
