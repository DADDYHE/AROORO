/**
 * orderTimeoutService/index.ts - 订单超时自动取消服务（TypeScript 源文件 - Sprint 45 迁移）
 *
 * 业务功能：
 *   - 定时器触发：每 30 分钟一次（cron 7 段表达式，每段含义：秒 分 时 日 月 星期 年）
 *   - 扫描各业务线的过期未支付订单，自动取消
 *   - 释放优惠券锁定 / 商城库存 / 团名额 / 活动名额
 *   - 关闭微信支付未支付订单
 *
 * 覆盖 5 类订单：
 *   1. 寄养订单（orders collection，type=hosting 或无 type）
 *   2. 喂养订单（feedingOrders collection）
 *   3. 商城订单（orders collection，type=mall）
 *   4. 团购订单（orders collection，type=group_buy）
 *   5. 活动报名（activity_registrations collection）
 *
 * 共 10 个内部函数：
 *   1. main - 入口（cron 触发，含 _isRunning 并发保护）
 *   2. normalizePrivateKey - 微信支付私钥格式归一化
 *   3. generateAuthorization - 微信支付 V3 签名生成
 *   4. closeWechatOrder - 关闭微信支付订单（fetch async/await）
 *   5. restoreProductStock - 恢复商品库存（含 SKU 校验）
 *   6. unlockOrderCoupons - 解锁订单相关优惠券
 *   7. restoreTuanDealStock - 恢复团购名额
 *   8. restoreActivityQuota - 恢复活动名额
 *   9. cancelTuanOrder - 同步取消 tuan_orders（幂等保护）
 *  10. pushError - 错误收集（限制数组上限）
 *  11. fetchAllExpired - 分批拉取过期订单
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 5 类订单 / 11 个辅助函数 / 7 个超时时长常量全部强类型化
 *   - 与已迁移的 11 个服务保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderTimeoutService.json
 *
 * 数据库索引建议（运维需在对应集合上创建）：
 *   orders:
 *     - { status: 1, paymentStatus: 1, createdAt: 1 }                        - 覆盖 cancelBoardingOrders/Feeding/Mall/GroupBuy
 *     - { type: 1, status: 1, paymentStatus: 1, createdAt: 1 }               - 覆盖 cancelMallOrders/cancelGroupBuyOrders（H1 修复后按 type 过滤）
 *   feedingOrders:
 *     - { status: 1, paymentStatus: 1, createdAt: 1 }                        - 覆盖 cancelFeedingOrders
 *   activity_registrations:
 *     - { status: 1, paymentStatus: 1, createdAt: 1 }                        - 覆盖 cancelActivityOrders
 *   user_coupons:
 *     - { lockedOrderId: 1, status: 1 }                                      - 覆盖 unlockOrderCoupons
 *   tuan_orders:
 *     - { _id: 1, status: 1 }                                                - 覆盖 cancelTuanOrder
 */
export interface AuthLike {
    openid?: string;
    nickName?: string;
    adminId?: string;
    partnerId?: string;
    isPartner?: boolean;
    isSuperAdmin?: boolean;
    roles?: string[];
    permissions?: string[];
    _isHttpAuth?: boolean;
    [k: string]: unknown;
}
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    body?: string | Record<string, unknown>;
    /** cron 触发时携带的时间戳（ISO 字符串，优先用作超时基准时间） */
    Time?: string;
    /** cron 触发时携带的时间戳（毫秒，Time 不可用时降级使用） */
    Timestamp?: number;
    /** cron 触发时携带的触发器名称 */
    TriggerName?: string;
    /** cron 触发时携带的消息 */
    Message?: string;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
/** 5 类订单业务线 */
export type OrderBusinessLine = 'boarding' | 'feeding' | 'mall' | 'group_buy' | 'activity';
/** 订单状态 */
export type OrderStatus = 'pending' | 'pending_payment' | 'paid' | 'cancelled';
/** 支付状态 */
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';
/** 订单类型（业务类型） */
export type OrderType = 'hosting' | 'feeding' | 'activity' | 'group_buy' | 'mall';
/** 通用订单文档基类（按业务投影字段） */
export interface OrderDoc {
    _id: string;
    outTradeNo?: string;
    productId?: string;
    skuId?: string;
    quantity?: number;
    dealId?: string;
    activityId?: string;
    participantCount?: number;
    /** 关联的团订单 ID（type=group_buy 时由 tuanService.createTuanOrder 写入） */
    tuanOrderId?: string;
    type?: OrderType;
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    [k: string]: unknown;
}
/** 喂养订单文档 */
export interface FeedingOrderDoc {
    _id: string;
    outTradeNo?: string;
    status?: OrderStatus;
    [k: string]: unknown;
}
/** 活动报名文档 */
export interface ActivityRegistrationDoc {
    _id: string;
    outTradeNo?: string;
    activityId?: string;
    participantCount?: number;
    status?: OrderStatus;
    [k: string]: unknown;
}
/** 商品 SKU 字段（投影用） */
export interface ProductSku {
    skuId?: string;
    stock?: number;
    soldCount?: number;
    [k: string]: unknown;
}
/** 商品文档 */
export interface ProductDoc {
    _id: string;
    stock?: number;
    totalStock?: number;
    soldCount?: number;
    skus?: ProductSku[];
    [k: string]: unknown;
}
/** 用户优惠券（解锁用投影） */
export interface UserCouponUnlock {
    _id: string;
    endTime?: string | Date;
    status?: 'locked' | 'unused' | 'used' | 'expired';
    [k: string]: unknown;
}
/** 团购团单 */
export interface TuanDealDoc {
    _id: string;
    totalStock?: number;
    soldCount?: number;
    [k: string]: unknown;
}
/** 活动 */
export interface ActivityDoc {
    _id: string;
    currentParticipants?: number;
    [k: string]: unknown;
}
/** 微信支付 v3 配置 */
export interface WechatPayConfig {
    appId: string;
    mchId: string;
    serialNo: string;
    privateKey: string;
    apiV3Key: string;
}
/** 关闭微信订单的 HTTP 响应 */
export interface WechatCloseResponse {
    statusCode: number;
    data: string;
}
/** 超时处理结果 */
export interface TimeoutResult {
    cancelledBoardingOrders: number;
    cancelledFeedingOrders: number;
    cancelledMallOrders: number;
    cancelledGroupBuyOrders: number;
    cancelledActivityOrders: number;
    closedWechatOrders: number;
    errors: Array<{
        type?: string;
        orderId?: string;
        error?: string;
        stockRestoreError?: string;
    }>;
}
/** 寄养订单超时（分钟） */
export declare const ORDER_TIMEOUT_MINUTES = 30;
/** 喂养订单超时（分钟） */
export declare const FEEDING_ORDER_TIMEOUT_MINUTES = 30;
/** 商城订单超时（分钟） */
export declare const MALL_ORDER_TIMEOUT_MINUTES = 30;
/** 团购订单超时（分钟） */
export declare const GROUP_BUY_TIMEOUT_MINUTES = 30;
/** 活动报名超时（分钟） */
export declare const ACTIVITY_ORDER_TIMEOUT_MINUTES = 30;
/** 批量处理：每批拉取数量 */
export declare const BATCH_SIZE = 100;
/** 批量处理：最大批次数（10 批 × 100 = 1000 单） */
export declare const MAX_BATCHES = 10;
/**
 * 归一化微信支付私钥。
 * 支持原始 PEM 或 base64 编码 PEM（自动 decode）。
 */
export declare function normalizePrivateKey(key: string | undefined | null): string;
/**
 * 生成微信支付 v3 API 的 Authorization header。
 * 遵循 WECHATPAY2-SHA256-RSA2048 签名规范。
 */
export declare function generateAuthorization(method: 'POST' | 'GET', path: string, body: string, mchId: string, serialNo: string, privateKey: string): string;
/**
 * 调用微信支付 v3 关闭订单接口。
 *
 * - POST /v3/pay/transactions/out-trade-no/{outTradeNo}/close
 * - 缺配置时跳过并返回 false
 * - 网络异常 / 非 2xx 响应也返回 false（不抛错，让外层继续处理其他订单）
 */
export declare function closeWechatOrder(outTradeNo: string): Promise<boolean>;
/**
 * 取消订单时恢复商品库存：
 *   - totalStock / soldCount
 *   - SKU 维度：skus[index].stock / soldCount（仅 SKU 模式）
 *   - 顶层 stock：仅无 SKU 模式才更新
 *
 * H5: SKU 模式下不更新顶层 stock——与 mallService 下单逻辑对称
 *   （下单时 SKU 模式只减 skus[index].stock 不减 stock，
 *    取消时若同时加 stock 和 skus[index].stock 会导致 stock 虚高）
 * M7: 补充 skus 字段类型校验，避免 null/非数组时 findIndex 抛错
 */
export declare function restoreProductStock(productId: string | undefined, skuId: string | null | undefined, quantity: number | undefined): Promise<void>;
/**
 * 取消订单时解锁 user_coupons 集合中 status='locked' 且 lockedOrderId=orderId 的记录：
 *   - 已过期 → status='expired'
 *   - 未过期 → status='unused'
 */
export declare function unlockOrderCoupons(orderId: string): Promise<void>;
/**
 * 取消团购订单时恢复 tuan_deals 集合的 totalStock / soldCount。
 */
export declare function restoreTuanDealStock(dealId: string | undefined, quantity: number | undefined): Promise<void>;
/**
 * 取消 orders 中 type=group_buy 记录时，同步把 tuan_orders 表对应记录也置为 cancelled。
 *
 * 背景：
 *   paymentService 在支付回调中会把 tuan_orders 状态从 pending → paid，
 *   但 orderTimeoutService 取消时只更新 orders，没联动 tuan_orders，
 *   导致管理后台 / 团长视图看到 "待确认" 的幽灵订单。
 *
 * H3: 删除 outTradeNo fallback——paymentService/services/pay.js 注释明确
 *     "tuan_orders 中没有 outTradeNo 字段"，fallback 路径永远查不到记录
 * H4: 不写 paymentStatus='cancelled'——'cancelled' 不是合法 PaymentStatus 枚举值，
 *     超时未支付的 tuan_orders 应保持 paymentStatus='unpaid'，仅更新 status
 * M8: 直接使用 where().update() 替代两步查询+更新，避免 TOCTOU 风险
 */
export declare function cancelTuanOrder(tuanOrderId: string | undefined): Promise<void>;
/**
 * 取消活动报名时回退 activities 集合的 currentParticipants。
 */
export declare function restoreActivityQuota(activityId: string | undefined, participantCount: number | undefined): Promise<void>;
/**
 * 通用分批拉取接口（最大 MAX_BATCHES * BATCH_SIZE = 1000 条）。
 */
export declare function fetchAllExpired<T = OrderDoc>(collection: string, where: Record<string, unknown>, fields: Record<string, boolean>): Promise<T[]>;
export declare function main(event: CloudEvent, _context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    ORDER_TIMEOUT_MINUTES: number;
    FEEDING_ORDER_TIMEOUT_MINUTES: number;
    MALL_ORDER_TIMEOUT_MINUTES: number;
    GROUP_BUY_TIMEOUT_MINUTES: number;
    ACTIVITY_ORDER_TIMEOUT_MINUTES: number;
    BATCH_SIZE: number;
    MAX_BATCHES: number;
    normalizePrivateKey: typeof normalizePrivateKey;
    generateAuthorization: typeof generateAuthorization;
    closeWechatOrder: typeof closeWechatOrder;
    restoreProductStock: typeof restoreProductStock;
    unlockOrderCoupons: typeof unlockOrderCoupons;
    restoreTuanDealStock: typeof restoreTuanDealStock;
    cancelTuanOrder: typeof cancelTuanOrder;
    restoreActivityQuota: typeof restoreActivityQuota;
    fetchAllExpired: typeof fetchAllExpired;
};
export default _default;
