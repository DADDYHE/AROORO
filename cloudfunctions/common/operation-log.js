"use strict";
/**
 * operation-log.js - 统一操作日志写入工具（best-effort）
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeOperationLog = writeOperationLog;
exports.writeOperationLogs = writeOperationLogs;
// 懒加载 initCloud，避免在测试/CI 阶段强制初始化 wx-server-sdk
function _resolveDb(extra) {
    if (extra && extra.db) {return extra.db;}
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initCloud } = require('./utils');
    return initCloud().db;
}
/**
 * 写一条操作日志（best-effort）
 *
 * @param {object} data  日志字段
 * @param {object} [opts]  可选注入（db / logger）
 * @returns {Promise<boolean>} true=写入成功，false=被吞掉
 */
async function writeOperationLog(data, opts) {
    if (!data || !data.module || !data.action) {
        const logger = (opts && opts.logger) || _defaultLogger();
        logger.warn('operationLog', 'writeOperationLog: 缺少 module/action 字段', { data });
        return false;
    }
    const db = _resolveDb(opts);
    const logger = (opts && opts.logger) || _defaultLogger();
    try {
        await db.collection('operation_logs').add({
            data: {
                ...data,
                createdAt: db.serverDate(),
            },
        });
        return true;
    }
    catch (e) {
        // 关键：审计失败绝对不能让业务失败
        // 常见原因：operation_logs 集合未建 / 权限不足 / 超时
        logger.warn('operationLog', 'writeOperationLog: 写入失败（已吞掉）', {
            module: data.module,
            action: data.action,
            msg: e && e.message ? e.message : String(e),
        });
        return false;
    }
}
/**
 * 批量写日志（all-or-nothing 都吞掉，best-effort）
 *
 * @param {Array<object>} list
 * @param {object} [opts]
 * @returns {Promise<{ success: number, failed: number }>}
 */
async function writeOperationLogs(list, opts) {
    if (!Array.isArray(list) || list.length === 0) {return { success: 0, failed: 0 };}
    let success = 0;
    let failed = 0;
    for (const item of list) {
        const ok = await writeOperationLog(item, opts);
        if (ok) {success++;}
        else {failed++;}
    }
    return { success, failed };
}
/** 懒加载默认 logger，避免循环依赖 */
function _defaultLogger() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createLogger } = require('./logger');
    return createLogger('operationLog');
}
