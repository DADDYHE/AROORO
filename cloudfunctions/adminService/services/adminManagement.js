/* eslint-disable */
"use strict";
/**
 * adminService/adminManagement.ts - 管理员列表与状态（TypeScript 源文件 - Sprint 33 迁移）
 *
 * 业务功能：
 *   - getAdminList: 分页列出管理员（paginate 工具）
 *   - getAdminDetail: 查询单个管理员
 *   - updateAdminStatus: 修改管理员状态（active / suspended / disabled）
 *
 * 关键设计：
 *   - 三个 handler 均需 partner 权限
 *   - 使用 err() 工厂 + handleSuccess / handleError
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.adminService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAdminStatus = exports.getAdminDetail = exports.getAdminList = void 0;
const utils_1 = require("../common/utils");
const logger_1 = require("../common/logger");
const errors_1 = require("../common/errors");
const logger = (0, logger_1.createLogger)('adminService.adminManagement');
/* ============================================================
 * 模块初始化
 * ============================================================ */
const { db } = (0, utils_1.initCloud)();
/* ============================================================
 * Handlers
 * ============================================================ */
const VALID_STATUSES = ['active', 'suspended', 'disabled'];
// 权限门禁与 ACTION_PERMISSIONS（super_admin）对齐：
// 允许超级管理员（HTTP 路径 roles 含 super_admin / 小程序路径 isSuperAdmin）与合作伙伴。
function canManageAdmins(auth) {
    return Boolean(auth && (
        auth.isPartner === true ||
        auth.isSuperAdmin === true ||
        (Array.isArray(auth.roles) && auth.roles.includes('super_admin'))
    ));
}
async function getAdminList(event, _context, auth) {
    if (!canManageAdmins(auth)) {
        throw (0, errors_1.err)('PERMISSION_DENIED', '需要管理员权限');
    }
    const page = Number(event.page) || 1;
    const rawPageSize = Number(event.pageSize) || 20;
    const pageSize = Math.min(Math.max(1, rawPageSize), 100);
    const result = await (0, utils_1.paginate)(db, 'admins', { page, pageSize });
    return (0, utils_1.handleSuccess)(result);
}
exports.getAdminList = getAdminList;
async function getAdminDetail(event, _context, auth) {
    if (!canManageAdmins(auth)) {
        throw (0, errors_1.err)('PERMISSION_DENIED', '需要管理员权限');
    }
    const { openid } = event;
    if (!openid) {
        throw (0, errors_1.err)('INVALID_PARAMS', '缺少管理员openid');
    }
    const res = await db.collection('admins').doc(openid).get();
    return (0, utils_1.handleSuccess)(res.data);
}
exports.getAdminDetail = getAdminDetail;
async function updateAdminStatus(event, _context, auth) {
    if (!canManageAdmins(auth)) {
        throw (0, errors_1.err)('PERMISSION_DENIED', '需要管理员权限');
    }
    const { openid, status } = event;
    if (!openid) {
        throw (0, errors_1.err)('INVALID_PARAMS', '缺少管理员openid');
    }
    if (!status) {
        throw (0, errors_1.err)('INVALID_PARAMS', '缺少状态');
    }
    if (!VALID_STATUSES.includes(status)) {
        throw (0, errors_1.err)('INVALID_PARAMS', '无效状态');
    }
    await db.collection('admins').doc(openid).update({
        data: { status, updatedAt: db.serverDate() },
    });
    return (0, utils_1.handleSuccess)(null, '状态更新成功');
}
exports.updateAdminStatus = updateAdminStatus;
/* ============================================================
 * 默认导出（保持 CommonJS 兼容）
 * ============================================================ */
const _handlers = { getAdminList, getAdminDetail, updateAdminStatus };
// Runtime shim: 把 module.exports 指向包装后的 handlers
// (兼容原 CommonJS 模式 `module.exports = { ... }`)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module;
_mod.exports = _handlers;
_handlers.default = _handlers;
exports.default = _handlers;
