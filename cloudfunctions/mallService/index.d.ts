/**
 * mallService/index.ts - 商城服务主入口（TypeScript 源文件 - Sprint 40 迁移）
 *
 * 业务功能：
 *   - 商品管理（CRUD + 批量操作 + 上下架/精选）
 *   - 商品浏览（列表 / 详情 / 分类统计 / 购物车状态）
 *   - 下单流程（普通下单 + 团购下单，含风控前置）
 *   - 订单管理（我的订单 / 详情 / 取消 / 确认收货 / 删除）
 *
 * 共 18 个 action：
 *   1. getProductList - 商品列表
 *   2. getProductDetail - 商品详情
 *   3. getCategoryStats - 分类统计
 *   4. listCategories - 分类列表
 *   5. checkCartItems - 购物车状态检查
 *   6. createProduct - 创建商品
 *   7. updateProduct - 更新商品
 *   8. deleteProduct - 下架商品
 *   9. batchUpdateProducts - 批量操作商品
 *  10. createOrder - 商城下单
 *  11. createGroupBuyOrder - 团购下单
 *  12. getMyOrders - 我的商城订单
 *  13. getGroupBuyOrders - 我的团购订单
 *  14. getOrderDetail - 订单详情
 *  15. cancelOrder - 取消订单
 *  16. confirmReceive - 确认收货
 *  17. deleteOrder - 删除订单
 *  18. getWxShippingStatus - 查询微信发货状态
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 与 adminService / partnerService / userService / activityService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.mallService.json
 *
 * 数据库索引建议（运维需在对应集合上创建）：
 *   products:
 *     - { status: 1, categoryId: 1 }               - 覆盖 getProductList / getCategoryStats
 *     - { createdBy: 1, updatedAt: -1 }             - 覆盖 batchUpdateProducts 权限校验
 *   orders:
 *     - { ownerId: 1, type: 1, status: 1, createdAt: -1 } - 覆盖 getMyOrders / getGroupBuyOrders
 *     - { orderNo: 1 }                              - 覆盖佣金记录查询
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
    page?: number;
    pageSize?: number;
    status?: string;
    category?: string;
    categoryId?: string;
    isFeatured?: boolean;
    productId?: string;
    productIds?: string[];
    orderId?: string;
    orderIds?: string[];
    orderType?: string;
    operation?: string;
    name?: string;
    description?: string;
    price?: number;
    originalPrice?: number;
    coverUrl?: string;
    images?: string[];
    stock?: number;
    specs?: unknown[];
    skuId?: string;
    quantity?: number;
    receiverName?: string;
    receiverPhone?: string;
    receiverAddress?: string;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export type MallActionHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export interface UserRecord {
    _id?: string;
    openid?: string;
    nickName?: string;
    inviterId?: string;
    [k: string]: unknown;
}
export interface SkuSpec {
    skuId?: string;
    specText?: string;
    price?: number;
    stock?: number;
    soldCount?: number;
    [k: string]: unknown;
}
export interface ProductRecord {
    _id?: string;
    name?: string;
    description?: string;
    price?: number;
    originalPrice?: number;
    coverUrl?: string;
    coverImage?: string;
    images?: string[];
    detailImages?: string[];
    category?: string;
    categoryId?: string;
    stock?: number;
    totalStock?: number;
    soldCount?: number;
    joinCount?: number;
    specs?: unknown[];
    status?: string;
    isFeatured?: boolean;
    createdBy?: string;
    skuType?: string;
    skus?: SkuSpec[];
    minPrice?: number;
    maxPrice?: number;
    tags?: string[];
    subTitle?: string;
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
export interface OrderRecord {
    _id?: string;
    orderNo?: string;
    productId?: string;
    productName?: string;
    productImage?: string;
    skuId?: string;
    skuText?: string;
    unitPrice?: number;
    quantity?: number;
    totalAmount?: number;
    totalPrice?: number;
    basicPrice?: number;
    originalAmount?: number;
    couponId?: string;
    couponDiscount?: number;
    receiverName?: string;
    receiverPhone?: string;
    receiverAddress?: string;
    ownerId?: string;
    ownerName?: string;
    sellerId?: string;
    status?: string;
    type?: string;
    paymentStatus?: string;
    pendingReview?: boolean;
    riskDecision?: string;
    riskReasons?: string[];
    cancelReason?: string;
    cancelledAt?: Date;
    paidAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
    bookingKey?: string;
    [k: string]: unknown;
}
export interface RiskCheckResult {
    pendingReview: boolean;
    reasons: string[];
    decision: 'RISK_PASS' | 'RISK_PENDING' | 'RISK_REJECT';
}
export interface PaginateResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
}
export interface BatchUpdateResult {
    success: number;
    failed: number;
}
export interface CartItemStatus {
    status: string;
    coverUrl: string;
    name: string;
    price: number;
}
export interface UrlMap {
    [k: string]: string;
}
export declare function getProductList(event: CloudEvent, _context: CloudContext, _auth: AuthLike): Promise<unknown>;
export declare function getCategoryStats(_event: CloudEvent, _context: CloudContext, _auth: AuthLike): Promise<unknown>;
export declare function listCategories(_event: CloudEvent, _context: CloudContext, _auth: AuthLike): Promise<unknown>;
export declare function checkCartItems(event: CloudEvent, _context: CloudContext, _auth: AuthLike): Promise<unknown>;
export declare function getProductDetail(event: CloudEvent, _context: CloudContext, _auth: AuthLike): Promise<unknown>;
export declare function createProduct(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function updateProduct(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function deleteProduct(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function batchUpdateProducts(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function createGroupBuyOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function createOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getMyOrders(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getGroupBuyOrders(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function cancelOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getOrderDetail(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function confirmReceive(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function deleteOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getWxShippingStatus(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getLogisticsTrack(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare const handlers: Record<string, MallActionHandler>;
export declare function main(event: CloudEvent, context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    getProductList: typeof getProductList;
    getProductDetail: typeof getProductDetail;
    getCategoryStats: typeof getCategoryStats;
    listCategories: typeof listCategories;
    checkCartItems: typeof checkCartItems;
    createProduct: typeof createProduct;
    updateProduct: typeof updateProduct;
    deleteProduct: typeof deleteProduct;
    batchUpdateProducts: typeof batchUpdateProducts;
    createOrder: typeof createOrder;
    createGroupBuyOrder: typeof createGroupBuyOrder;
    getMyOrders: typeof getMyOrders;
    getGroupBuyOrders: typeof getGroupBuyOrders;
    getOrderDetail: typeof getOrderDetail;
    cancelOrder: typeof cancelOrder;
    confirmReceive: typeof confirmReceive;
    deleteOrder: typeof deleteOrder;
    handlers: Record<string, MallActionHandler>;
};
export default _default;
