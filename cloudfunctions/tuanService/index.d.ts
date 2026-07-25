/**
 * tuanService/index.ts - 团购服务（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - getTuanDealList - 拉取团购列表（分页 + 状态过滤 + 计算 minPrice）
 *   - getTuanDealDetail - 拉取团购详情（含 SKU 维度 minPrice 计算）
 *   - createTuanOrder - 创建团购订单（含库存扣减 + 双订单写入）
 *   - shipTuanOrder - 团长发货（保留 action）
 *   - confirmReceiveTuanOrder - 确认收货（保留 action）
 *   - cancelTuanOrder - 取消团订单（保留 action）
 *
 * 迁移目标：
 *   - 强类型化 6 个 action handler 签名（含 3 个保留 action）
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 抽离 TUAN_DEAL_LIST_FIELDS 与 WRITE_ACTIONS 常量
 *   - computeMinPrice 工具函数强类型化
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.tuanService.json
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
    Time?: string;
    Timestamp?: number;
    TriggerName?: string;
    Message?: string;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
/** 团购状态 */
export type TuanStatus = 'draft' | 'published' | 'active' | 'ended' | 'cancelled';
/** SKU 状态 */
export type SkuType = 'single' | 'multi';
/** 团购内单个商品（含 SKU 数组） */
export interface TuanProduct {
    productId: string;
    name?: string;
    image?: string;
    price?: number;
    tuanPrice?: number;
    stock?: number;
    sold?: number;
    skuType?: SkuType;
    skus?: TuanSku[];
    minSkuPrice?: number;
    [k: string]: unknown;
}
/** 团购 SKU */
export interface TuanSku {
    skuId: string;
    price?: number;
    tuanPrice?: number;
    stock?: number;
    sold?: number;
    enabled?: boolean;
    [k: string]: unknown;
}
/** 团购文档 */
export interface TuanDeal {
    _id: string;
    title?: string;
    coverUrl?: string;
    description?: string;
    images?: string[];
    products?: TuanProduct[];
    startTime?: string | Date;
    endTime?: string | Date;
    status?: TuanStatus;
    totalOrders?: number;
    totalAmount?: number;
    createdAt?: string | Date;
    [k: string]: unknown;
}
/** 团购订单 */
export interface TuanOrder {
    _id?: string;
    dealId: string;
    productId: string;
    skuId?: string;
    specText?: string;
    ownerId: string;
    quantity: number;
    tuanPrice: number;
    originalAmount?: number;
    totalAmount: number;
    couponId?: string;
    couponDiscount?: number;
    status?: string;
    paymentStatus?: string;
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
/**
 * 统一订单（含团购订单联动）
 *
 * 团购订单状态语义：
 *   pending_payment: 待支付
 *   paid: 已支付/已确认，等待发货
 *   pending_shipment: 待发货
 *   shipped: 已发货
 *   completed: 已完成
 *   cancelled: 已取消
 *   refunded: 已退款
 */
export interface UnifiedOrder {
    _id?: string;
    orderNo: string;
    dealId: string;
    productId: string;
    productName?: string;
    productImage?: string;
    skuId?: string;
    skuText?: string;
    unitPrice: number;
    quantity: number;
    originalAmount: number;
    totalAmount: number;
    couponId?: string;
    couponDiscount?: number;
    receiverName?: string;
    receiverPhone?: string;
    receiverAddress?: string;
    remark?: string;
    ownerId: string;
    status: string;
    type: 'group_buy';
    tuanOrderId?: string;
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
/** 分页结果 */
export interface PageResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
}
export declare const TUAN_DEAL_LIST_FIELDS: Record<string, boolean>;
export declare const WRITE_ACTIONS: readonly string[];
export declare const DEFAULT_PAGE_SIZE = 10;
export declare const MAX_PAGE_SIZE = 100;
/**
 * 计算团购内商品的最低价（用于列表展示与详情展示）
 *   - 优先 SKU 维度
 *   - 回退商品 tuanPrice
 */
export declare function computeMinPrice(products: TuanProduct[]): number;
export declare function getTuanDealList(event: CloudEvent): Promise<unknown>;
export declare function getTuanDealDetail(event: CloudEvent): Promise<unknown>;
export declare function createTuanOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
declare function shipTuanOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
declare function confirmReceiveTuanOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
declare function cancelTuanOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function main(event: CloudEvent, context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    getTuanDealList: typeof getTuanDealList;
    getTuanDealDetail: typeof getTuanDealDetail;
    createTuanOrder: typeof createTuanOrder;
    shipTuanOrder: typeof shipTuanOrder;
    confirmReceiveTuanOrder: typeof confirmReceiveTuanOrder;
    cancelTuanOrder: typeof cancelTuanOrder;
    TUAN_DEAL_LIST_FIELDS: Record<string, boolean>;
    WRITE_ACTIONS: readonly string[];
    DEFAULT_PAGE_SIZE: number;
    MAX_PAGE_SIZE: number;
    computeMinPrice: typeof computeMinPrice;
};
export default _default;
