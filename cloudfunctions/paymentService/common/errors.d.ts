/**
 * 业务异常类与错误码字典（TypeScript 源文件 - Sprint 11 迁移）
 *
 * 本文件为 source-of-truth，编译产物 cloudfunctions/common/errors.js 仍由 runtime 加载
 * - 类型声明：errors.d.ts
 * - 运行代码：errors.js
 *
 * 目标：
 *   1. 替代散落各处的 `error.code = ERROR_CODES.X` 直接赋值
 *   2. 统一异常类型供 catch 块判定（结构化字段判定，不依赖 class identity）
 *   3. 错误码字典单一来源（与 utils.js 的 ERROR_CODES 保持一致）
 *   4. 提供完整静态类型守卫，避免下游误用
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 *
 * 与 .d.ts 类型联合方式：
 *   import type { BusinessErrorCode, ErrorSeverity, BusinessErrorSpec } from './types'
 *   （types.d.ts 与本文件同目录）
 *
 * Sprint 39 重要变更：
 *   - 移除 `instanceof BusinessError` 判定，改用鸭子类型
 *   - 原因：每个 require 路径会创建独立的 class，跨 module 引用同一 class 不可行
 *   - 新判定：`error instanceof Error && error.name === 'BusinessError' && typeof error.code === 'string'`
 *   - 替代了 Sprint 19 shim 模式（shim 引用 require('../../common/errors.js') 在云端部署会失败）
 */
import type { BusinessErrorCode, BusinessErrorInstance, BusinessErrorSpec, ErrorSeverity, ApiResponse } from './types';
/**
 * 业务异常类
 * 继承自 Error，携带 code、details、httpStatus、severity 四个扩展字段
 */
export declare class BusinessError extends Error implements BusinessErrorInstance {
    readonly name: 'BusinessError';
    readonly code: BusinessErrorCode;
    readonly details: Record<string, unknown> | null;
    readonly httpStatus: number;
    constructor(code: BusinessErrorCode, message: string, details?: Record<string, unknown> | null, httpStatus?: number);
    /**
     * 从 code 推断严重级别
     */
    get severity(): ErrorSeverity;
    /**
     * 序列化为标准 API 响应
     */
    toResponse(): {
        code: number;
        message: string;
        data: null;
        error: {
            type: BusinessErrorCode;
            details: Record<string, unknown> | null;
        };
    };
}
/**
 * 错误码注册表
 * 每个错误码包含：code（语义名）、message（默认消息）、httpStatus、severity
 *
 * 命名规范：<领域>_<动作>_<结果>，如 ORDER_CREATE_FAILED / ORDER_NOT_FOUND
 */
export declare const BusinessErrors: Record<BusinessErrorCode, BusinessErrorSpec>;
/**
 * 通过语义码快速构造 BusinessError
 *
 * @example
 *   throw err('ORDER_NOT_FOUND', null, { orderId: 'ord_123' })
 *   throw err('INVALID_PARAMS', '手机号格式错误', { field: 'phone' })
 */
export declare function err(codeName: BusinessErrorCode, message?: string | null, details?: Record<string, unknown> | null): BusinessError;
/**
 * 判定一个 Error 是否为已知业务错误（结构化判定，跨 module 一致）
 *
 * Sprint 39：基于鸭子类型（name + code 字段）而非 instanceof
 * - 理由：每个 require 路径下 class 是独立的，跨 module 引用同一 class 不可行
 * - 此判定对任何包含 { name: 'BusinessError', code: string } 的 Error 命中
 */
export declare function isBusinessError(error: unknown): error is BusinessError;
/**
 * 未知错误兜底：转换为标准 BusinessError
 */
export declare function wrapUnknown(error: unknown): BusinessError;
/**
 * 将任意 Error / BusinessError 序列化为标准 API 响应
 *
 * 约定返回结构（与 utils.js#handleError 对齐，便于上层 index.js 统一处理）：
 *   {
 *     code: <number>,        // ERROR_CODES 中的一项
 *     message: <string>,     // 给用户/前端展示的中文消息
 *     data: null,            // 错误时 data 始终为 null
 *     error: {               // 错误详情
 *       type: <string>,      // 语义化错误码（BusinessError.code）
 *       details: <object>,   // 上下文（BusinessError.details）
 *       originalMessage?: <string>, // 仅未知错误时填充
 *     }
 *   }
 */
export declare function toResponse(error: unknown): ApiResponse<null>;
export type Handler<T = unknown> = (event: Record<string, unknown>, context: Record<string, unknown>, auth: {
    openid?: string;
    [k: string]: unknown;
}) => Promise<T>;
export type WrappedHandler<T = unknown> = (event: Record<string, unknown>, context: Record<string, unknown>, auth: {
    openid?: string;
    [k: string]: unknown;
}) => Promise<T | ApiResponse<null>>;
/**
 * 业务异常装饰器 / 包装器
 *
 * 用法（推荐）：
 *   const { withErrorHandling } = require('./common/errors')
 *
 *   const handlers = {
 *     createOrder: withErrorHandling(async (event, context, auth) => {
 *       if (!auth.openid) throw err('AUTH_REQUIRED')
 *       ...
 *       return handleSuccess({ orderId })
 *     }),
 *   }
 *
 *   exports.main = async (event, context) => {
 *     try {
 *       const auth = await verifyAuth(event)
 *       return await handlers[event.action](event, context, auth)
 *     } catch (e) {
 *       return toResponse(e)
 *     }
 *   }
 *
 * 行为：
 *   1. handler 抛出 BusinessError → 序列化为标准响应
 *   2. handler 抛出普通 Error → wrapUnknown 后再序列化
 *   3. handler 正常返回 → 原样透传（不强制转换为 handleSuccess）
 */
export declare function withErrorHandling<T = unknown>(handler: Handler<T>): WrappedHandler<T>;
