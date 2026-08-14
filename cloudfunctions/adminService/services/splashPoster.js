/* eslint-disable */
"use strict";
/**
 * adminService/splashPoster.js - 启动首屏海报配置
 *
 * 业务功能：
 *   - getSplashPoster:    读取启动首屏海报配置（读 system_config.splash_poster）
 *   - updateSplashPoster: 更新启动首屏海报配置（全局唯一，单文档覆盖写）
 *
 * 关键设计：
 *   - 与 commissionConfig 一致，使用 system_config 集合、固定 _id = 'splash_poster'，
 *     读现有 → 增量合并 → set 写回，避免整文档覆盖清空其它字段。
 *   - getSplashPoster 会把 cloud:// fileID 解析成临时访问 URL（imagePreviewUrl），
 *     供 web-admin 预览与小程序展示；小程序端也可直接用 imageUrl(fileID) 自行解析。
 *   - 写入强校验：启用时必须带 imageUrl；尺寸/比例/时长做边界收敛。
 *
 * 文档结构（system_config.splash_poster）：
 *   { _id, enabled, imageUrl, imagePreviewUrl, width, height, aspectRatio, durationMs, updatedBy, updatedAt }
 */
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../common/utils");
const logger_1 = require("../common/logger");
const errors_1 = require("../common/errors");
const logger = (0, logger_1.createLogger)('adminService.splashPoster');
const COLLECTION = 'system_config';
const DOC_ID = 'splash_poster';
const TARGET_RATIO = 9 / 16;
const DEFAULT_DURATION = 2500;
/* ============================================================
 * Handlers
 * ============================================================ */
exports.getSplashPoster = (0, errors_1.withErrorHandling)(async () => {
    const { db } = (0, utils_1.initCloud)();
    let doc = {};
    try {
        const res = await db.collection(COLLECTION).doc(DOC_ID).get();
        doc = (res.data || {});
    }
    catch (e) {
        // 文档不存在（尚未配置过）→ 返回默认关闭态
        logger.warn('getSplashPoster.read', { code: e?.errCode, msg: e?.message });
    }
    const data = {
        enabled: doc.enabled === true,
        imageUrl: doc.imageUrl || '',
        imagePreviewUrl: doc.imagePreviewUrl || '',
        width: doc.width || 0,
        height: doc.height || 0,
        aspectRatio: typeof doc.aspectRatio === 'number' ? doc.aspectRatio : 0,
        durationMs: typeof doc.durationMs === 'number' ? doc.durationMs : DEFAULT_DURATION,
        updatedAt: doc.updatedAt || null,
        updatedBy: doc.updatedBy || '',
    };
    // cloud:// fileID → 临时访问 URL（web 预览 / 小程序展示通用）
    if (data.imageUrl && data.imageUrl.startsWith('cloud://')) {
        try {
            const { cloud } = (0, utils_1.initCloud)();
            const tmp = await cloud.getTempFileURL({ fileList: [data.imageUrl] });
            const first = (tmp.fileList || [])[0];
            if (first && first.tempFileURL) {
                data.imagePreviewUrl = first.tempFileURL;
            }
        }
        catch (e) {
            logger.warn('getSplashPoster.tempUrl', { msg: e?.message });
        }
    }
    return (0, utils_1.handleSuccess)(data);
});
exports.updateSplashPoster = (0, errors_1.withErrorHandling)(async (event, _ctx, auth) => {
    const { db } = (0, utils_1.initCloud)();
    const { enabled, imageUrl, imagePreviewUrl, width, height, aspectRatio, durationMs } = event;
    const enable = enabled === true;
    if (enable && (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim())) {
        throw (0, errors_1.err)('INVALID_PARAMS', '启用首屏海报时必须上传图片');
    }
    // 读现有（首次配置走空对象，等价于 set 语义）
    let existing = {};
    try {
        const res = await db.collection(COLLECTION).doc(DOC_ID).get();
        existing = (res.data || {});
    }
    catch (e) {
        logger.warn('updateSplashPoster.read', { code: e?.errCode, msg: e?.message });
    }
    const data = {
        updatedBy: auth?.openid || auth?.adminId || 'unknown',
        updatedAt: new Date(),
    };
    // 仅写入前端明确传参的字段，未传的保留原值（增量合并）
    data.enabled = typeof enabled === 'boolean' ? enabled : (existing.enabled === true);
    if (typeof imageUrl === 'string' && imageUrl.trim()) {
        data.imageUrl = imageUrl.trim();
    }
    if (typeof imagePreviewUrl === 'string' && imagePreviewUrl.trim()) {
        data.imagePreviewUrl = imagePreviewUrl.trim();
    }
    if (Number.isFinite(width) && width > 0) {
        data.width = Math.floor(width);
    }
    if (Number.isFinite(height) && height > 0) {
        data.height = Math.floor(height);
    }
    if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
        data.aspectRatio = aspectRatio;
    }
    if (Number.isFinite(durationMs)) {
        // 展示时长收敛到 1s~5s，避免过长卡首屏
        data.durationMs = Math.min(5000, Math.max(1000, Math.floor(durationMs)));
    }
    const merged = { ...existing, ...data };
    delete merged._id;
    await db.collection(COLLECTION).doc(DOC_ID).set({ data: merged });
    logger.info('updateSplashPoster.saved', { enabled: merged.enabled, width: merged.width, height: merged.height });
    return (0, utils_1.handleSuccess)({ ...merged, _id: DOC_ID }, '保存成功');
});
/* ============================================================
 * 默认导出（保持 CommonJS 兼容，与 commissionConfig/upload 一致）
 * ============================================================ */
const _handlers = { getSplashPoster: exports.getSplashPoster, updateSplashPoster: exports.updateSplashPoster };
const _mod = module;
_mod.exports = _handlers;
_handlers.default = _handlers;
exports.default = _handlers;
