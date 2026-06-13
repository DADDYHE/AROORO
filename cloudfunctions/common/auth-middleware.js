"use strict";
/**
 * auth-middleware.ts - 鉴权与权限中间件
 *
 * 权限模型：
 *   - permission=null  → 仅需登录
 *   - permission='partner' → 需要合作伙伴身份（admins 集合 status=active 且 isPartner=true）
 *
 * 合作伙伴可访问所有管理功能，无细粒度权限区分。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAuth = void 0;
const utils_1 = require("./utils");
const errors_1 = require("./errors");
// =====================================================================
// 主入口
// =====================================================================
/**
 * 鉴权与权限校验
 *
 * @throws {BusinessError} AUTH_REQUIRED：未登录
 * @throws {BusinessError} PARTNER_REQUIRED：非合作伙伴
 */
async function verifyAuth(event, options = {}) {
    const { requireLogin = true, permission, } = options;
    const { cloud, db } = (0, utils_1.initCloud)();
    const wxContext = (cloud.getWXContext
        ? cloud.getWXContext()
        : {});
    const openid = wxContext.OPENID || '';
    if (requireLogin && !openid) {
        throw (0, errors_1.err)('AUTH_REQUIRED', '未登录');
    }
    // 无需特殊身份，仅登录即可
    if (!permission) {
        return { openid };
    }
    // ----- 需要特殊身份 -----
    if (!openid) {
        throw (0, errors_1.err)('AUTH_REQUIRED', '未登录');
    }
    const { isSuperAdmin, isPartner } = require('./permissions');
    let doc = null;
    try {
        const res = await db.collection('admins').doc(openid).get();
        doc = ((res && res.data) || null);
    }
    catch (e) {
        doc = null;
    }
    if (!doc || doc.status !== 'active') {
        throw (0, errors_1.err)('PARTNER_REQUIRED', '无有效管理账号');
    }
    if (permission === 'super_admin') {
        if (!isSuperAdmin(doc)) {
            throw (0, errors_1.err)('PERMISSION_DENIED', '需要超级管理员权限');
        }
        return { openid, adminId: doc._id, isSuperAdmin: true };
    }
    if (permission === 'admin') {
        if (!isSuperAdmin(doc) && !isPartner(doc)) {
            throw (0, errors_1.err)('PERMISSION_DENIED', '需要管理员或合作伙伴权限');
        }
        return { openid, adminId: doc._id, isAdmin: true, isSuperAdmin: isSuperAdmin(doc) };
    }
    // permission === 'partner'
    if (!isPartner(doc)) {
        throw (0, errors_1.err)('PARTNER_REQUIRED', '无合作伙伴权限');
    }
    return {
        openid,
        partnerId: doc._id,
        isPartner: true,
    };
}
exports.verifyAuth = verifyAuth;
