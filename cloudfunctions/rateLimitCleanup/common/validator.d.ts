/**
 * 参数校验中间件（TypeScript 源文件 - Sprint 14 迁移）
 *
 * 用于云函数中统一参数校验，替代重复的手动检查
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
/**
 * 单字段校验规则
 */
export interface FieldRule {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    enum?: ReadonlyArray<string | number | boolean>;
    min?: number;
    max?: number;
    message?: string;
}
/**
 * 校验 schema：{ fieldName: FieldRule }
 */
export type ValidationSchema = Record<string, FieldRule>;
/**
 * 校验错误项
 */
export interface ValidationErrorItem {
    field: string;
    message: string;
}
/**
 * 校验错误异常
 */
export declare class ValidationError extends Error {
    readonly name: 'ValidationError';
    readonly field: string;
    readonly items: ValidationErrorItem[];
    constructor(message: string, field: string, items?: ValidationErrorItem[]);
}
/**
 * 校验数据是否符合 schema
 * - required 失败：抛 BusinessError(MISSING_REQUIRED)
 * - 其他规则失败：抛 ValidationError
 */
export declare function validate(schema: ValidationSchema, data: Record<string, unknown> | null | undefined): void;
/**
 * 按白名单过滤对象字段（防止注入多余字段）
 */
export declare function filterFields<T = Record<string, unknown>>(whitelist: string[], data: Record<string, unknown>): T;
/**
 * 内置字段白名单（按业务域分组）
 */
export declare const FIELD_WHITELISTS: Record<string, string[]>;
