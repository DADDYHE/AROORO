/**
 * orderService/orders.ts - 订单服务（TypeScript 源文件 - Sprint 28 迁移）
 *
 * 业务功能（14 个 handler + 7 个内部 helper）：
 *   1. getOrders                  订单列表（owner / host 双视角）
 *   2. enrichOrders               订单冗余信息补全（pets / host）
 *   3. createOrder                创建订单（含风控限流 + 价格计算）
 *   4. updateOrderStatus          状态机推进（pending → paid → confirmed → ...）
 *   5. getActivityOrders          活动订单列表
 *   6. getActivityOrderDetail     活动订单详情
 *   7. cancelOrder                取消订单（= updateOrderStatus('cancelled')）
 *   8. getOrderDetail             订单详情（含冗余信息）
 *   9. calculatePrice             价格计算（公开）
 *  10. checkDateAvailability      日期可用性（公开）
 *  11. getBoardingOrders          合作伙伴视角的寄养订单
 *  12. getBoardingOrderDetail     合作伙伴订单详情
 *  13. handleBoardingOrder        合作伙伴操作（状态机 + 佣金）
 *  14. submitEvaluation           评价提交（含风控）
 *     getHostEvaluations          寄养家庭评价列表（公开）
 *
 * 关键设计：
 *   - 鉴权：所有 handler 都需 auth（除 calculatePrice / checkDateAvailability / getHostEvaluations 公开）
 *   - 错误：使用 err() 工厂（参数校验），withErrorHandling 包装（统一响应）
 *   - 业务错误：isBusinessError 类型守卫（替代裸字符串 e.code === 'X'）
 *   - 限流：withRateLimit（order / evaluation 类型）
 *   - 风控：detectReviewSpam + mapActionToErrorCode
 *   - 状态机：allowedTransitions 表 + boarding-state-machine（合作伙伴）
 *
 * 迁移目标：
 *   - 强类型化 14 个 handler 的 event / context / auth
 *   - 强类型化订单 / 用户 / 寄养家庭 / 宠物 / 评价文档（复用 common/types）
 *   - 编译产物（orders.js）继续被 index.js require
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
 *   （运行时仍消费 .js 编译产物）
 */
import type { OrderDoc, UserDoc, ApiResponse } from '../common/types';
/** 通用 handler 签名（event / context / auth） */
type AuthLike = {
    openid?: string;
    [k: string]: unknown;
};
type EventLike = Record<string, unknown>;
type ContextLike = Record<string, unknown>;
type HandlerResult = Promise<ApiResponse<unknown> | unknown>;
/** 内部增强订单（包含 pets / hostName / hostAvatar） */
interface EnrichedOrder extends OrderDoc {
    pets?: UserDoc[];
    hostName?: string;
    hostAvatar?: string;
    ownerName?: string;
    ownerPhone?: string;
    hostPhone?: string;
    notes?: string;
    price?: number;
    days?: number;
    petsInfo?: unknown[];
    hostInfo?: Record<string, unknown>;
    ownerInfo?: Record<string, unknown>;
    orderNo?: string;
    [k: string]: unknown;
}
/**
 * 1. getOrders - 订单列表（owner / host 双视角）
 */
export declare function getOrders(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 2. enrichOrders - 订单冗余信息补全（pets / host）
 */
export declare function enrichOrders(orders: unknown[]): Promise<EnrichedOrder[]>;
/**
 * 3. createOrder - 创建订单
 */
export declare function createOrder(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 4. updateOrderStatus - 状态机推进
 */
export declare function updateOrderStatus(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 5. getActivityOrders - 活动订单列表
 */
export declare function getActivityOrders(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 6. getActivityOrderDetail - 活动订单详情
 */
export declare function getActivityOrderDetail(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 7. cancelOrder - 取消订单（= updateOrderStatus('cancelled')）
 */
export declare function cancelOrder(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 8. getOrderDetail - 订单详情
 */
export declare function getOrderDetail(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 9. calculatePrice - 价格计算（公开）
 */
export declare function calculatePrice(event: EventLike): HandlerResult;
/**
 * 10. checkDateAvailability - 日期可用性（公开）
 */
export declare function checkDateAvailability(event: EventLike): HandlerResult;
/**
 * 11. getBoardingOrders - 合作伙伴视角的寄养订单
 */
export declare function getBoardingOrders(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 12. getBoardingOrderDetail - 合作伙伴订单详情
 */
export declare function getBoardingOrderDetail(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 13. handleBoardingOrder - 合作伙伴操作（状态机 + 佣金）
 *    Sprint 51: confirm 操作接入 boarding_accept 风控（防账号被盗批量接单）
 */
export declare function handleBoardingOrder(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * 14. submitEvaluation - 评价提交（含风控）
 */
export declare function submitEvaluation(event: EventLike, _context: ContextLike, auth: AuthLike | null): HandlerResult;
/**
 * getHostEvaluations - 寄养家庭评价列表（公开）
 */
export declare function getHostEvaluations(event: EventLike): HandlerResult;
declare const _handlers: {
    getOrders: any;
    enrichOrders: typeof enrichOrders;
    createOrder: any;
    updateOrderStatus: any;
    getActivityOrders: any;
    getActivityOrderDetail: any;
    cancelOrder: any;
    getOrderDetail: any;
    calculatePrice: any;
    checkDateAvailability: any;
    getBoardingOrders: any;
    getBoardingOrderDetail: any;
    handleBoardingOrder: any;
    submitEvaluation: any;
    getHostEvaluations: any;
};
export default _handlers;
