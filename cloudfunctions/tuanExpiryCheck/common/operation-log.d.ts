/**
 * operation-log.ts - 统一操作日志写入工具（best-effort）
 *
 * 设计目标：
 *   1. 集中所有写入 `operation_logs` 集合的逻辑（不再各 service 各自散落）
 *   2. 任何写入失败只 warn 不抛错（避免审计日志影响主业务流程）
 *   3. 入口支持两种形式：
 *      - writeOperationLog({ module, action, ... })            // 模块化
 *      - writeOperationLog({ module, action, ... }, { db })     // 显式注入 db（测试/CI 用）
 *
 * 字段约定（与 adminService/services/coupon.js:writeOperationLog 保持一致）：
 *   - module:        string  必填，模块名（user_coupon / order / mall ...）
 *   - action:        string  必填，动作（claim / lock / use / unlock / refund / refund_on_cancel ...）
 *   - targetId:      string  选填，操作目标 ID
 *   - targetName:    string  选填，操作目标名称
 *   - operatorId:    string  选填，操作人 openid
 *   - operatorName:  string  选填，操作人昵称
 *   - beforeData:    object  选填，操作前快照
 *   - afterData:     object  选填，操作后快照
 *   - createdAt:     Date    系统注入
 *
 * 故障语义：
 *   - 集合不存在 / 字段缺失 / 写入抛错 → logger.warn + swallow
 *   - 绝不 rethrow，绝不让 audit 失败阻断业务
 */
import type { CloudBaseDB } from './types';
/** 单条操作日志的入参字段（createdAt 由系统注入） */
export interface OperationLogInput {
    module: string;
    action: string;
    targetId?: string;
    targetName?: string;
    operatorId?: string;
    operatorName?: string;
    beforeData?: Record<string, unknown>;
    afterData?: Record<string, unknown>;
    /** 透传任意附加字段 */
    [k: string]: unknown;
}
/** 可选注入（db 用于测试 / logger 用于自定义） */
export interface OperationLogOpts {
    db?: CloudBaseDB;
    logger?: {
        warn: (category: string, event: string, payload?: unknown) => void;
    };
}
export interface WriteSummary {
    success: number;
    failed: number;
}
/**
 * 写一条操作日志（best-effort）
 *
 * @param data  日志字段（module/action 必填）
 * @param opts  可选注入
 * @returns true=写入成功，false=被吞掉
 */
export declare function writeOperationLog(data: OperationLogInput, opts?: OperationLogOpts): Promise<boolean>;
/**
 * 批量写日志（全部 best-effort）
 */
export declare function writeOperationLogs(list: OperationLogInput[], opts?: OperationLogOpts): Promise<WriteSummary>;
