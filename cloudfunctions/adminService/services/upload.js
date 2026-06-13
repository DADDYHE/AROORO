/* eslint-disable */
"use strict";
/**
 * adminService/upload.ts - 文件上传服务（TypeScript 源文件 - Sprint 33 迁移）
 *
 * 业务功能：
 *   - uploadFile: 上传文件到云存储（base64 接收），返回 fileID + 临时 URL
 *
 * 关键设计：
 *   - 异步获取临时 URL 失败时降级返回 fileID（不抛错）
 *   - 使用 err() 工厂 + withErrorHandling 包装
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.adminService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../common/utils");
const logger_1 = require("../common/logger");
const errors_1 = require("../common/errors");
const logger = (0, logger_1.createLogger)('uploadService');
/* ============================================================
 * Handlers
 * ============================================================ */
const uploadFile = (0, errors_1.withErrorHandling)(async (event, _context, _auth) => {
    const { cloudPath, fileContent } = event;
    if (!cloudPath) {
        throw (0, errors_1.err)('INVALID_PARAMS', '缺少 cloudPath');
    }
    // HTTP 调用时文件通过 base64 传入
    let buffer;
    if (fileContent) {
        buffer = Buffer.from(fileContent, 'base64');
    }
    else {
        throw (0, errors_1.err)('INVALID_PARAMS', '缺少文件内容');
    }
    const { cloud } = (0, utils_1.initCloud)();
    const uploadResult = await cloud.uploadFile({
        cloudPath,
        fileContent: buffer,
    });
    let previewUrl = uploadResult.fileID;
    try {
        const tmpResult = await cloud.getTempFileURL({ fileList: [uploadResult.fileID] });
        const first = (tmpResult.fileList || [])[0];
        previewUrl = first?.tempFileURL || uploadResult.fileID;
    }
    catch (e) {
        logger.warn('getTempFileURL failed', { fileID: uploadResult.fileID, msg: e?.message });
    }
    return (0, utils_1.handleSuccess)({
        fileID: uploadResult.fileID,
        url: uploadResult.fileID,
        previewUrl,
    });
});
const getTempFileUrls = async (event, _context, _auth) => {
    const { fileIDs } = event;
    if (!Array.isArray(fileIDs) || fileIDs.length === 0) {
        throw (0, errors_1.err)('INVALID_PARAMS', '缺少 fileIDs 数组');
    }
    const { cloud } = (0, utils_1.initCloud)();
    const urlMap = {};
    const validIds = fileIDs.filter(id => typeof id === 'string' && id.startsWith('cloud://'));
    if (validIds.length === 0) {
        return (0, utils_1.handleSuccess)({ urlMap });
    }
    try {
        for (let i = 0; i < validIds.length; i += 50) {
            const chunk = validIds.slice(i, i + 50);
            const res = await cloud.getTempFileURL({ fileList: chunk });
            for (const f of (res.fileList || [])) {
                if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
            }
        }
    }
    catch (e) {
        logger.warn('getTempFileUrls batch failed', { count: validIds.length, msg: e?.message });
    }
    return (0, utils_1.handleSuccess)({ urlMap });
};

/* ============================================================
 * 默认导出（CommonJS 兼容）
 * ============================================================ */
exports.default = { uploadFile, getTempFileUrls };
