/**
 * utils.ts - 通用工具（TypeScript 源 - Sprint 15 迁移）
 *
 * 目标：
 *   - 把 utils.js 迁移到 .ts，让 errors.ts 等其他 .ts 文件可消费
 *   - 提供 CloudBase 初始化、ID 生成、错误处理、分页、批处理、Cloud URL 转换
 *
 * 设计原则：
 *   - 单例初始化（initCloud 内部用闭包缓存 cloud / db 实例）
 *   - 类型化导出（避免 utils.d.ts 的手动 shim）
 *   - 与 errors.ts 双向兼容（handleError 返回的 shape 可与 err() 配对）
 */
import type { CloudBaseDB } from './types';
/** 错误码分类（数字） */
export type ErrorCodeCategory = 'SUCCESS' | 'VALIDATION' | 'DATA' | 'AUTH' | 'NOT_FOUND' | 'PERMISSION' | 'BUSINESS' | 'SERVER' | 'UNKNOWN';
/** 错误码映射（类别 → 数字） */
export type ErrorCodeMap = Record<ErrorCodeCategory, number>;
/** 错误信息映射（数字 → 中文） */
export type ErrorMessageMap = Record<number, string>;
/** handleError 返回值 */
export interface ErrorResult {
    code: number;
    message: string;
    data: null;
    error: string | {
        type: string;
        details?: unknown;
        originalMessage?: string;
    };
}
/** handleSuccess 返回值 */
export interface SuccessResult<T = unknown> {
    code: number;
    message: string;
    data: T | null;
}
/** paginate 选项 */
export interface PaginateOptions {
    page?: number;
    pageSize?: number;
    where?: Record<string, unknown>;
    orderBy?: {
        field: string;
        direction: 'asc' | 'desc';
    };
    projection?: Record<string, boolean> | null;
}
/** paginate 返回值 */
export interface PaginatedResult<T = unknown> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
}
/** batchProcess handler 返回 */
export type BatchHandlerResult<TIn, TOut> = TOut | {
    success: false;
    error: string;
};
/** ID 类型白名单 */
export type IdType = 'pet' | 'order' | 'feeding' | 'tuan' | 'activity' | 'registration' | 'feeder' | 'product' | 'banner' | 'address' | 'application' | 'wallet' | 'commission' | 'coupon' | 'category' | 'favorite';
/** CloudBase SDK 实例（来自 wx-server-sdk） */
export interface CloudBaseInstance {
    database: () => CloudBaseDB;
    getTempFileURL: (params: {
        fileList: string[];
    }) => Promise<{
        fileList: Array<{
            fileID: string;
            tempFileURL?: string;
            status: number;
        }>;
    }>;
    init: (opts: {
        env: string;
    }) => void;
    DYNAMIC_CURRENT_ENV: string;
}
/**
 * 懒加载 wx-server-sdk 并返回 { cloud, db }
 * - 第一次调用会 init + database()，后续直接复用
 * - 必须在云函数入口（已注入环境）后才可调用
 */
export declare function initCloud(): {
    cloud: CloudBaseInstance;
    db: CloudBaseDB;
};
/** 业务错误码（数字） */
export declare const ERROR_CODES: ErrorCodeMap;
/** 错误码 → 中文文案 */
export declare const ERROR_MESSAGES: ErrorMessageMap;
/**
 * 生成业务主键 ID
 * 规则：
 *   - type：映射为 2-3 字母前缀
 *   - timestamp：Date.now() 8 位 base36
 *   - identifier：openid 哈希前 8 位（或 4 字节随机）
 *   - random：4 字节随机
 *   - 总长不超过 32，去除非字母数字下划线
 */
export declare function generateId(type?: IdType | string, openid?: string): string;
/**
 * 统一错误响应包装
 * 兼容旧业务层 call(old style) 与 new style（BusinessError）
 */
export declare function handleError(error: Error, message?: string | null, code?: number | null): ErrorResult;
/**
 * 统一成功响应
 */
export declare function handleSuccess<T = unknown>(data?: T | null, message?: string): SuccessResult<T>;
/**
 * 通用分页查询
 * @param db CloudBaseDB 实例
 * @param collectionName 集合名
 * @param options 分页参数
 * @returns 包含 list/total/page/pageSize/totalPages/hasNext
 */
export declare function paginate<T = Record<string, unknown>>(db: CloudBaseDB, collectionName: string, options?: PaginateOptions): Promise<PaginatedResult<T>>;
/**
 * 简单批处理：分批并发执行 handler，捕获每条错误
 *   - 默认 batchSize = 10
 *   - 失败的项返回 { success: false, error }，成功的项返回 handler 返回值
 */
export declare function batchProcess<TIn, TOut>(data: TIn[], handler: (item: TIn) => Promise<TOut>, batchSize?: number): Promise<Array<BatchHandlerResult<TIn, TOut>>>;
/**
 * 把对象/数组中所有 cloud://xxx 字段批量转换为 https:// 临时 URL
 * 递归遍历所有嵌套对象与数组
 * @param result 待处理对象
 * @returns 转换后的对象（深拷，新对象）
 */
export declare function convertCloudUrls<T = unknown>(result: T): Promise<T>;
/**
 * 占位实现：把 https 临时 URL 还原为 cloud:// 形式
 * 当前业务场景不需要（云函数只向客户端发送 https URL），保留 stub 以兼容旧调用方
 */
export declare function revertCloudUrls<T = unknown>(event: T): T;
export type { CloudBaseDB };
