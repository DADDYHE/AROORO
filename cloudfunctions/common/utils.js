"use strict";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeRegExp = exports.revertCloudUrls = exports.convertCloudUrls = exports.batchProcess = exports.paginate = exports.handleSuccess = exports.handleError = exports.generateId = exports.ERROR_MESSAGES = exports.ERROR_CODES = exports.initCloud = void 0;
var crypto_1 = require("crypto");
// =====================================================================
// 单例缓存
// =====================================================================
var cloudInstance = null;
var dbInstance = null;
// =====================================================================
// 1. 初始化
// =====================================================================
/**
 * 懒加载 wx-server-sdk 并返回 { cloud, db }
 * - 第一次调用会 init + database()，后续直接复用
 * - 必须在云函数入口（已注入环境）后才可调用
 */
function initCloud() {
    if (!cloudInstance) {
        // 动态 require：避免在 jest 单元测试时强制加载 wx-server-sdk
        var cloud = require('wx-server-sdk');
        cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
        cloudInstance = cloud;
        dbInstance = cloud.database();
    }
    return { cloud: cloudInstance, db: dbInstance };
}
exports.initCloud = initCloud;
// =====================================================================
// 2. 错误码字典
// =====================================================================
/** 业务错误码（数字） */
exports.ERROR_CODES = {
    SUCCESS: 0,
    VALIDATION: 1001,
    DATA: 1002,
    AUTH: 1003,
    NOT_FOUND: 1004,
    PERMISSION: 1005,
    BUSINESS: 1006,
    SERVER: 5001,
    UNKNOWN: 9999,
};
/** 错误码 → 中文文案 */
exports.ERROR_MESSAGES = (_a = {},
    _a[exports.ERROR_CODES.SUCCESS] = '操作成功',
    _a[exports.ERROR_CODES.VALIDATION] = '参数错误',
    _a[exports.ERROR_CODES.DATA] = '数据操作失败',
    _a[exports.ERROR_CODES.AUTH] = '未登录或登录已过期',
    _a[exports.ERROR_CODES.NOT_FOUND] = '数据不存在',
    _a[exports.ERROR_CODES.PERMISSION] = '无权限操作',
    _a[exports.ERROR_CODES.BUSINESS] = '业务处理失败',
    _a[exports.ERROR_CODES.SERVER] = '服务器内部错误',
    _a[exports.ERROR_CODES.UNKNOWN] = '未知错误',
    _a);
// =====================================================================
// 3. ID 生成
// =====================================================================
var TYPE_MAPPING = {
    pet: 'pet',
    order: 'ord',
    feeding: 'fd',
    tuan: 'tn',
    activity: 'act',
    registration: 'reg',
    feeder: 'fdr',
    product: 'prd',
    banner: 'bnr',
    address: 'addr',
    application: 'app',
    wallet: 'wlt',
    commission: 'cmm',
    coupon: 'cpn',
    category: 'cat',
    favorite: 'fav',
};
/**
 * 生成业务主键 ID
 * 规则：
 *   - type：映射为 2-3 字母前缀
 *   - timestamp：Date.now() 8 位 base36
 *   - identifier：openid 哈希前 8 位（或 4 字节随机）
 *   - random：4 字节随机
 *   - 总长不超过 32，去除非字母数字下划线
 */
function generateId(type, openid) {
    if (type === void 0) { type = ''; }
    if (openid === void 0) { openid = ''; }
    var shortPrefix = TYPE_MAPPING[type] || type;
    var timestamp = Date.now().toString(36).padStart(8, '0').slice(0, 8);
    var identifier = '';
    if (openid) {
        var hash = 0;
        for (var i = 0; i < openid.length; i++) {
            var char = openid.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        identifier = Math.abs(hash).toString(36).padStart(8, '0').slice(0, 8);
    }
    else {
        identifier = (0, crypto_1.randomBytes)(4).toString('hex').slice(0, 8);
    }
    var random = (0, crypto_1.randomBytes)(4).toString('hex').slice(0, 8);
    var id = shortPrefix
        ? "".concat(shortPrefix, "_").concat(timestamp).concat(identifier).concat(random)
        : "".concat(timestamp).concat(identifier).concat(random);
    if (id.length > 32) {
        id = id.substring(0, 32);
    }
    id = id.replace(/[^a-zA-Z0-9_]/g, '');
    return id;
}
exports.generateId = generateId;
// =====================================================================
// 4. 错误/成功响应包装
// =====================================================================
/**
 * 统一错误响应包装
 * 兼容旧业务层 call(old style) 与 new style（BusinessError）
 */
function handleError(error, message, code) {
    if (message === void 0) { message = null; }
    if (code === void 0) { code = null; }
    var errorCode = code !== null && code !== void 0 ? code : exports.ERROR_CODES.BUSINESS;
    var errorMessage = message || error.message || exports.ERROR_MESSAGES[errorCode] || '操作失败';
    return {
        code: errorCode,
        message: errorMessage,
        data: null,
        error: error.message || '',
    };
}
exports.handleError = handleError;
/**
 * 统一成功响应
 */
function handleSuccess(data, message) {
    if (data === void 0) { data = null; }
    if (message === void 0) { message = '操作成功'; }
    return {
        code: exports.ERROR_CODES.SUCCESS,
        message: message,
        data: data,
    };
}
exports.handleSuccess = handleSuccess;
// =====================================================================
// 5. 分页
// =====================================================================
var MAX_PAGE_SIZE = 100;
/**
 * 通用分页查询
 * @param db CloudBaseDB 实例
 * @param collectionName 集合名
 * @param options 分页参数
 * @returns 包含 list/total/page/pageSize/totalPages/hasNext
 */
function paginate(db_1, collectionName_1) {
    return __awaiter(this, arguments, void 0, function (db, collectionName, options) {
        var _a, page, _b, pageSize, _c, where, _d, orderBy, _e, projection, safePageSize, offset, countQuery, countResult, total, dataQuery, dataResult;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _a = options.page, page = _a === void 0 ? 1 : _a, _b = options.pageSize, pageSize = _b === void 0 ? 10 : _b, _c = options.where, where = _c === void 0 ? {} : _c, _d = options.orderBy, orderBy = _d === void 0 ? { field: 'createdAt', direction: 'desc' } : _d, _e = options.projection, projection = _e === void 0 ? null : _e;
                    safePageSize = Math.min(Math.max(1, Number(pageSize) || 10), MAX_PAGE_SIZE);
                    offset = (page - 1) * safePageSize;
                    countQuery = db.collection(collectionName).where(where);
                    return [4 /*yield*/, countQuery.count()];
                case 1:
                    countResult = _f.sent();
                    total = countResult.total;
                    dataQuery = db.collection(collectionName).where(where);
                    if (projection) {
                        dataQuery = dataQuery.field(projection);
                    }
                    dataQuery = dataQuery.orderBy(orderBy.field, orderBy.direction);
                    return [4 /*yield*/, dataQuery.skip(offset).limit(safePageSize).get()];
                case 2:
                    dataResult = _f.sent();
                    return [2 /*return*/, {
                            list: (dataResult.data || []),
                            total: total,
                            page: page,
                            pageSize: safePageSize,
                            totalPages: Math.ceil(total / safePageSize),
                            hasNext: page * safePageSize < total,
                        }];
            }
        });
    });
}
exports.paginate = paginate;
// =====================================================================
// 6. 批处理
// =====================================================================
/**
 * 简单批处理：分批并发执行 handler，捕获每条错误
 *   - 默认 batchSize = 10
 *   - 失败的项返回 { success: false, error }，成功的项返回 handler 返回值
 */
function batchProcess(data_1, handler_1) {
    return __awaiter(this, arguments, void 0, function (data, handler, batchSize) {
        var results, i, batch, batchResults;
        var _this = this;
        if (batchSize === void 0) { batchSize = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    results = [];
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < data.length)) return [3 /*break*/, 4];
                    batch = data.slice(i, i + batchSize);
                    return [4 /*yield*/, Promise.all(batch.map(function (item) { return __awaiter(_this, void 0, void 0, function () {
                            var error_1;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _a.trys.push([0, 2, , 3]);
                                        return [4 /*yield*/, handler(item)];
                                    case 1: return [2 /*return*/, _a.sent()];
                                    case 2:
                                        error_1 = _a.sent();
                                        return [2 /*return*/, { success: false, error: error_1.message }];
                                    case 3: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 2:
                    batchResults = _a.sent();
                    results.push.apply(results, batchResults);
                    _a.label = 3;
                case 3:
                    i += batchSize;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, results];
            }
        });
    });
}
exports.batchProcess = batchProcess;
// =====================================================================
// 7. Cloud URL 转换
// =====================================================================
/**
 * 把对象/数组中所有 cloud://xxx 字段批量转换为 https:// 临时 URL
 * 递归遍历所有嵌套对象与数组
 * @param result 待处理对象
 * @returns 转换后的对象（深拷，新对象）
 */
function convertCloudUrls(result) {
    return __awaiter(this, void 0, void 0, function () {
        function collectCloudIds(obj) {
            if (!obj || typeof obj !== 'object') {
                return;
            }
            if (obj instanceof Date) {
                return;
            }
            if (Array.isArray(obj)) {
                obj.forEach(collectCloudIds);
                return;
            }
            for (var _i = 0, _a = Object.keys(obj); _i < _a.length; _i++) {
                var key = _a[_i];
                var v = obj[key];
                if (typeof v === 'string' && v.startsWith('cloud://')) {
                    cloudIds.push(v);
                }
                else if (typeof v === 'object' && v !== null) {
                    collectCloudIds(v);
                }
            }
        }
        function replaceUrls(obj) {
            if (!obj || typeof obj !== 'object') {
                return obj;
            }
            if (obj instanceof Date) {
                return obj;
            }
            if (Array.isArray(obj)) {
                return obj.map(replaceUrls);
            }
            var res = {};
            for (var _i = 0, _a = Object.keys(obj); _i < _a.length; _i++) {
                var key = _a[_i];
                var v = obj[key];
                if (typeof v === 'string' && v.startsWith('cloud://') && urlMap[v]) {
                    res[key] = urlMap[v];
                }
                else if (typeof v === 'object' && v !== null) {
                    res[key] = replaceUrls(v);
                }
                else {
                    res[key] = v;
                }
            }
            return res;
        }
        var cloud, cloudIds, urlMap, uniqueIds, BATCH_SIZE, i, chunk, urlRes, _i, _a, f, e_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!result || typeof result !== 'object') {
                        return [2 /*return*/, result];
                    }
                    cloud = initCloud().cloud;
                    cloudIds = [];
                    collectCloudIds(result);
                    if (cloudIds.length === 0) {
                        return [2 /*return*/, result];
                    }
                    urlMap = {};
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 6, , 7]);
                    uniqueIds = __spreadArray([], new Set(cloudIds), true);
                    BATCH_SIZE = 50;
                    i = 0;
                    _b.label = 2;
                case 2:
                    if (!(i < uniqueIds.length)) return [3 /*break*/, 5];
                    chunk = uniqueIds.slice(i, i + BATCH_SIZE);
                    return [4 /*yield*/, cloud.getTempFileURL({ fileList: chunk })];
                case 3:
                    urlRes = _b.sent();
                    for (_i = 0, _a = (urlRes.fileList || []); _i < _a.length; _i++) {
                        f = _a[_i];
                        if (f.status === 0 && f.tempFileURL) {
                            urlMap[f.fileID] = f.tempFileURL;
                        }
                    }
                    _b.label = 4;
                case 4:
                    i += BATCH_SIZE;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 7];
                case 6:
                    e_1 = _b.sent();
                    return [2 /*return*/, result];
                case 7: return [2 /*return*/, replaceUrls(result)];
            }
        });
    });
}
exports.convertCloudUrls = convertCloudUrls;
/**
 * 占位实现：把 https 临时 URL 还原为 cloud:// 形式
 * 当前业务场景不需要（云函数只向客户端发送 https URL），保留 stub 以兼容旧调用方
 */
function revertCloudUrls(event) {
    return event;
}
exports.revertCloudUrls = revertCloudUrls;
/**
 * 转义正则表达式特殊字符，防止正则注入攻击
 *
 * 用途：在使用 db.RegExp 时，对用户输入进行转义
 *
 * @param str 需要转义的字符串
 * @returns 转义后的字符串
 */
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
exports.escapeRegExp = escapeRegExp;
/**
 * 转义正则表达式特殊字符，防止正则注入攻击
 *
 * 用途：在使用 db.RegExp 时，对用户输入进行转义
 *
 * @param str 需要转义的字符串
 * @returns 转义后的字符串
 *
 * @example
 * const keyword = 'test(user)'
 * const escaped = escapeRegExp(keyword)
 * // escaped = 'test\\(user\\)'
 * db.collection('data').where({
 *   name: db.RegExp({ regexp: escaped, options: 'i' })
 * })
 */
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
exports.escapeRegExp = escapeRegExp;
// 注：上面"未使用"的导入仅用于类型导出
