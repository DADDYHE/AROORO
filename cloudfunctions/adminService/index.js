'use strict';
/**
 * adminService/index.js - 简化主入口
 *
 * 修复说明：
 * - 旧的 TypeScript 编译产物触发 cloudbase Nodejs18 runtime 的
 *   `writeRuntimeFile` 内部 bug（TypeError: Cannot read properties of undefined
 *   (reading 'toString') at /data/scf/frame/node18/runtime.js:65:37）。
 * - 本文件改用最直接的 `exports.main = async (...) => {...}` 写法，并在 main 内部
 *   动态 require 各 services，避免云函数运行时在模块加载阶段遍历整个 require 链。
 */

let _handlers = null;
let _permission = null;
let _noAuth = null;
let _logger = null;
let _verifyTokenFn = null;

function loadModules() {
  if (_handlers) return;

  const { handleSuccess, handleError, ERROR_CODES, convertCloudUrls, revertCloudUrls } = require('./common/utils');
  const { createLogger } = require('./common/logger');
  const { verifyAuth } = require('./common/auth-middleware');
  const { err, toResponse, isBusinessError } = require('./common/errors');
  const { verifyToken } = require('./common/token-utils');
  _verifyTokenFn = verifyToken;

  const authHandlers = require('./services/auth');
  const applicationHandlers = require('./services/application');
  const hostingHandlers = require('./services/hosting');
  const adminHandlers = require('./services/adminManagement');
  const userHandlers = require('./services/user');
  const activityHandlers = require('./services/activity');
  const mallHandlers = require('./services/mall');
  const feedingHandlers = require('./services/feeding');
  const bannerHandlers = require('./services/banner');
  const couponHandlers = require('./services/coupon');
  const tuanHandlers = require('./services/tuan');
  const commissionConfigHandlers = require('./services/commissionConfig');
  const walletHandlers = require('./services/wallet');
  const statsHandlers = require('./services/stats');
  const i18nOverrideHandlers = require('./services/i18nOverride');
  const uploadHandlers = require('./services/upload');

  _handlers = {
    ...authHandlers,
    ...applicationHandlers,
    ...hostingHandlers,
    ...adminHandlers,
    ...userHandlers,
    ...activityHandlers,
    ...mallHandlers,
    ...feedingHandlers,
    ...bannerHandlers,
    ...couponHandlers,
    ...tuanHandlers,
    ...commissionConfigHandlers,
    ...walletHandlers,
    ...statsHandlers,
    ...i18nOverrideHandlers,
    ...uploadHandlers,
  };

  _permission = {
    checkAuth: null, login: null, webLogin: null,
    createScanLogin: null, pollScanLogin: null, confirmScanLogin: null,
    logout: null, getAvailableRoles: null, getConfig: null,
    updateProfile: null, resolveCloudUrls: null, getTempFileUrls: null,
    submitApplication: null, getApplicationStatus: null, getMyPermissions: null,
    approveApplication: 'super_admin', rejectApplication: 'super_admin',
    getApplicationList: 'super_admin',
    getAdminList: 'super_admin', getAdminDetail: 'super_admin', updateAdminStatus: 'super_admin',
    getUserList: 'super_admin', getUserDetail: 'super_admin', updateUserStatus: 'super_admin',
    getDashboardStats: 'super_admin', getEnhancedDashboardStats: 'super_admin', getFinanceOverview: 'super_admin',
    getWithdrawalList: 'super_admin', approveWithdrawal: 'super_admin', rejectWithdrawal: 'super_admin', retryTransfer: 'super_admin',
    getPartnerCommissionRates: 'super_admin', updatePartnerCommissionRates: 'super_admin',
    getCommissionConfig: 'super_admin', updateCommissionConfig: 'super_admin',
    initIndexes: 'super_admin', getOperationLogList: 'super_admin', exportOrders: 'super_admin',
    getBoardingOrders: 'partner', getBoardingOrderDetail: 'partner', handleBoardingOrder: 'partner',
    getHostProfile: 'partner', updateHostProfile: 'partner', createHostProfile: 'partner',
    getPendingHostReviews: 'partner', reviewHost: 'partner',
    getActiveHosts: 'partner', getDisabledHosts: 'partner',
    toggleHostAccepting: 'partner', toggleHostStatus: 'partner',
    getReferralStats: 'partner', getReferralList: 'partner', getInvitedUsersByAdmin: 'partner',
    getReferralOrders: 'partner', getReferralOrderStats: 'partner',
    getMyCommissionRates: 'partner', getMyInvitedUsers: 'partner',
    getActivityList: 'partner', getActivityDetail: 'partner', createActivity: 'partner',
    updateActivity: 'partner', getActivityRegistrations: 'partner', exportActivityRegistrations: 'partner',
    getActivityOrders: 'partner',
    getProductList: 'partner', getProductDetail: 'partner', createProduct: 'partner',
    updateProduct: 'partner', deleteProduct: 'partner', batchUpdateProducts: 'partner',
    cloneProduct: 'partner', getMallOrders: 'partner', getMallOrderDetail: 'partner',
    handleMallOrder: 'partner', shipMallOrder: 'partner', completeMallOrder: 'partner',
    getProductStats: 'partner', getCategoryStats: 'partner',
    listCategories: 'partner', createCategory: 'partner', updateCategory: 'partner', deleteCategory: 'partner',
    getFeederList: 'partner', getFeederDetail: 'partner', getCurrentFeeder: 'partner',
    createFeederProfile: 'partner', updateFeederProfile: 'partner',
    getFeedingOrders: 'partner', getFeederOrders: 'partner',
    handleFeedingOrder: 'partner', getFeedingOrderDetail: 'partner',
    getBannerList: 'partner', getBannerDetail: 'partner', createBanner: 'partner',
    updateBanner: 'partner', updateBannerStatus: 'partner', updateBannerSortOrder: 'partner',
    deleteBanner: 'partner',
    createCouponTemplate: 'partner', updateCouponTemplate: 'partner', deleteCouponTemplate: 'partner',
    toggleCouponTemplateStatus: 'partner', cloneCouponTemplate: 'partner',
    getTemplateList: 'partner', getTemplateDetail: 'partner',
    createCouponGrant: 'partner', getGrantList: 'partner', getGrantDetail: 'partner',
    getUserCouponList: 'partner', grantCouponToUser: 'partner', revokeUserCoupon: 'partner',
    batchRevokeUserCoupons: 'partner', getCouponStatistics: 'partner', getScopeStatistics: 'partner',
    createTuanDeal: 'partner', updateTuanDeal: 'partner', deleteTuanDeal: 'partner',
    publishTuanDeal: 'partner', endTuanDeal: 'partner',
    getTuanDealList: 'partner', getTuanDealDetail: 'partner',
    getTuanDealOrders: 'partner', getTuanDealOrderDetail: 'partner',
    getTuanLeaderList: 'partner', getTuanLeaderCommissions: 'partner',
    getTuanCommissionStats: 'partner', settleTuanCommissions: 'partner',
    getMyIncomeOverview: 'partner', getMyIncomeDetails: 'partner',
    getMyWallet: 'partner', getMyWithdrawals: 'partner', requestWithdrawal: 'partner',
    getOrderStats: 'partner', getOrderTrend: 'partner', getOrderTypeStats: 'partner',
    listI18nOverrides: 'partner', getI18nOverride: 'partner', upsertI18nOverride: 'partner',
    batchUpsertI18nOverrides: 'partner', deleteI18nOverride: 'partner', toggleI18nOverrideStatus: 'partner',
    fetchActiveOverrides: null,
    uploadFile: 'partner',
  };

  _noAuth = new Set(['webLogin', 'createScanLogin', 'pollScanLogin', 'fetchActiveOverrides']);
  _logger = createLogger('adminService');

  exports.__utils = { handleSuccess, handleError, ERROR_CODES, convertCloudUrls, revertCloudUrls, verifyAuth, err, toResponse, isBusinessError };
  exports.__helpers = { _logger };
}

function parseHttpEvent(event, context) {
  const isHttpCall = !!(context && context.HTTP_CONTEXT || event && event.requestContext || event && event.headers);
  if (isHttpCall) {
    try {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (!body || !body.action) return { _isHttpCall: true, _parseError: new Error('缺少 action 字段') };
      const httpContext = (context && context.HTTP_CONTEXT) || { headers: (event && event.headers) || {} };
      return { action: body.action, data: body.data || {}, accessToken: body.accessToken || '', _httpContext: httpContext, _isHttpCall: true };
    } catch (e) {
      return { _isHttpCall: true, _parseError: e };
    }
  }
  // CloudBase HTTP API 网关调用：event 直接是请求体 JSON，无 headers/requestContext
  if (event && event.action && (event.accessToken !== undefined || event.data !== undefined)) {
    const httpContext = { headers: {} };
    return { action: event.action, data: event.data || {}, accessToken: event.accessToken || '', _httpContext: httpContext, _isHttpCall: true, _isCloudbaseHttpApi: true };
  }
  return null;
}

function parseHttpAuth(httpContext, accessToken) {
  // 优先从请求体读取 accessToken（本地开发代理通过 body 传递用户 JWT）
  if (accessToken) {
    try {
      const { verifyToken } = require('./common/token-utils');
      return verifyToken(accessToken);
    } catch (e) { /* fall through */ }
  }
  const headers = httpContext && httpContext.headers ? httpContext.headers : {};
  // 读取 X-User-Token（代理通过自定义头传递）
  const userToken = headers['x-user-token'] || '';
  if (userToken) {
    try {
      const { verifyToken } = require('./common/token-utils');
      return verifyToken(userToken);
    } catch (e) { /* fall through to Authorization header */ }
  }
  const authHeader = headers.authorization || headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const { verifyToken } = require('./common/token-utils');
    return verifyToken(token);
  } catch (e) { return null; }
}

function checkHttpPermission(decoded, action) {
  const permission = _permission[action];
  if (permission === null || permission === undefined) return true;
  if (!decoded) return false;
  if (permission === 'super_admin') return decoded.isSuperAdmin === true;
  if (permission === 'admin') return decoded.isSuperAdmin === true || decoded.isPartner === true;
  return decoded.isPartner === true;
}

let _enrichAdminDb = null;
let _cloudbaseApp = null;
function getEnrichAdminDb() {
  if (_enrichAdminDb === null) {
    const cloudbase = require('@cloudbase/node-sdk');
    _cloudbaseApp = cloudbase.init();
    _enrichAdminDb = _cloudbaseApp.database();
  }
  return _enrichAdminDb;
}

async function convertCloudUrlsForHttp(result) {
  if (!result || typeof result !== 'object') return result;
  const cloudIds = [];
  function collectIds(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj instanceof Date) return;
    if (Array.isArray(obj)) { obj.forEach(collectIds); return; }
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (typeof v === 'string' && v.startsWith('cloud://')) cloudIds.push(v);
      else if (typeof v === 'object' && v !== null) collectIds(v);
    }
  }
  collectIds(result);
  if (cloudIds.length === 0) return result;

  getEnrichAdminDb(); // 确保 _cloudbaseApp 已初始化
  const urlMap = {};
  try {
    const uniqueIds = [...new Set(cloudIds)];
    console.log('[convertCloudUrlsForHttp] converting', uniqueIds.length, 'cloud URLs');
    for (let i = 0; i < uniqueIds.length; i += 50) {
      const chunk = uniqueIds.slice(i, i + 50);
      const res = await _cloudbaseApp.getTempFileURL({ fileList: chunk });
      for (const f of (res.fileList || [])) {
        if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
      }
    }
    console.log('[convertCloudUrlsForHttp] urlMap keys:', Object.keys(urlMap).length);
  } catch (e) {
    console.error('[convertCloudUrlsForHttp] getTempFileURL error:', e.message);
    return result;
  }

  function replaceUrls(obj) {
    if (typeof obj === 'string') {
      if (obj.startsWith('cloud://')) {
        if (urlMap[obj]) return urlMap[obj];
        console.log('[replaceUrls] NOT FOUND in urlMap:', obj.substring(0, 60));
      }
      return obj;
    }
    if (!obj || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(replaceUrls);
    const res = {};
    for (const key of Object.keys(obj)) {
      res[key] = replaceUrls(obj[key]);
    }
    return res;
  }
  return replaceUrls(result);
}

async function enrichAuthFromAdmin(decoded) {
  if (!decoded) return null;
  const id = decoded.adminId || decoded.openid;
  if (!id) return null;
  let admin = null;
  try {
    const adminDb = getEnrichAdminDb();
    const res = await adminDb.collection('admins').doc(id).get();
    admin = (res && res.data);
  } catch (e) { return null; }
  if (!admin || admin.status !== 'active') return null;
  const roles = Array.isArray(admin.roles) ? admin.roles : [];
  return {
    admin,
    roles,
    permissions: roles.includes('super_admin') ? ['all'] : (Array.isArray(admin.permissions) ? admin.permissions : []),
    isPartner: admin.isPartner === true || roles.includes('partner'),
  };
}

exports.main = async (event, context) => {
  loadModules();
  const { handleSuccess, handleError, ERROR_CODES, convertCloudUrls, verifyAuth, err, isBusinessError } = exports.__utils;
  const logger = _logger;

  const httpInfo = parseHttpEvent(event, context);
  if (httpInfo && httpInfo._isHttpCall) {
    // CloudBase HTTP API 网关：直接返回业务 JSON，网关会原样作为 HTTP 响应体
    const isCloudbaseApi = httpInfo._isCloudbaseHttpApi;

    if (!isCloudbaseApi && (event.httpMethod === 'OPTIONS' || (event.requestContext && event.requestContext.httpMethod === 'OPTIONS'))) {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
        body: '',
      };
    }
    if (httpInfo._parseError) {
      return isCloudbaseApi
        ? { code: 400, message: '请求格式错误' }
        : { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 400, message: '请求格式错误' }) };
    }
    if (!httpInfo.action || !_handlers[httpInfo.action]) {
      return isCloudbaseApi
        ? { code: 400, message: '未知操作: ' + httpInfo.action }
        : { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 400, message: '未知操作: ' + httpInfo.action }) };
    }
    if (httpInfo.action !== 'webLogin' && !_noAuth.has(httpInfo.action)) {
      const httpAuth = parseHttpAuth(httpInfo._httpContext, httpInfo.accessToken);
      if (!httpAuth) {
        return isCloudbaseApi
          ? { code: 401, message: '未登录或Token已过期' }
          : { statusCode: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 401, message: '未登录或Token已过期' }) };
      }
      if (!checkHttpPermission(httpAuth, httpInfo.action)) {
        logger.warn('http.permission_denied', { action: httpInfo.action });
        return isCloudbaseApi
          ? { code: 403, message: '权限不足' }
          : { statusCode: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 403, message: '权限不足' }) };
      }
      const enrichment = await enrichAuthFromAdmin(httpAuth);
      const auth = {
        openid: httpAuth.openid,
        partnerId: httpAuth.adminId,
        isPartner: true,
        _isHttpAuth: true,
      };
      if (enrichment) {
        auth.adminId = enrichment.admin._id;
        auth.roles = enrichment.roles;
        auth.permissions = enrichment.permissions;
        auth.isPartner = enrichment.isPartner;
      } else if (httpAuth) {
        if (httpAuth.isSuperAdmin) { auth.roles = ['super_admin']; auth.permissions = ['all']; }
        if (httpAuth.adminId) { auth.adminId = httpAuth.adminId; }
      }
      try {
        const mergedEvent = Object.assign({}, httpInfo.data, { action: httpInfo.action });
        const result = await _handlers[httpInfo.action](mergedEvent, context, auth);
        const converted = await convertCloudUrlsForHttp(result);
        return isCloudbaseApi
          ? converted
          : { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(converted) };
      } catch (error) {
        logger.error(httpInfo.action, error);
        const code = error && error.code ? error.code : 500;
        return isCloudbaseApi
          ? { code: code, message: error.message }
          : { statusCode: (code >= 400 && code < 600) ? code : 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: code, message: error.message }) };
      }
    }
    try {
      const mergedEvent = Object.assign({}, httpInfo.data, { action: httpInfo.action });
      const auth = { _isHttpAuth: true };
      const result = await _handlers[httpInfo.action](mergedEvent, context, auth);
      const converted = await convertCloudUrlsForHttp(result);
      return isCloudbaseApi
        ? converted
        : { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(converted) };
    } catch (error) {
      logger.error('webLogin', error);
      const code = error && error.code ? error.code : 500;
      return isCloudbaseApi
        ? { code: code, message: error.message }
        : { statusCode: (code >= 400 && code < 600) ? code : 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: code, message: error.message }) };
    }
  }

  // 小程序端 Event 调用路径（也处理 web-admin 通过 SDK 的调用）
  const action = event.action;
  if (!action || !_handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型');
  }
  if (action === 'webLogin') {
    try {
      const mergedEvent = Object.assign({}, event, (event.data || {}));
      const auth = { _isHttpAuth: true };
      const result = await _handlers[action](mergedEvent, context, auth);
      return result;
    } catch (error) {
      logger.error('webLogin', error);
      if (isBusinessError(error)) return { code: error.code, message: error.message };
      return { code: ERROR_CODES.BUSINESS || 500, message: error.message };
    }
  }
  const required = _permission[action];
  const needLogin = required !== null && required !== undefined;

  // web-admin 通过 Express server SDK 调用：用 accessToken 鉴权
  if (event.accessToken && _verifyTokenFn) {
    try {
      let decoded;
      try {
        decoded = _verifyTokenFn(event.accessToken);
      } catch (e) {
        return { code: 401, message: '未登录或Token已过期' };
      }
      if (!checkHttpPermission(decoded, action)) {
        return { code: 403, message: '权限不足' };
      }
      const enrichment = await enrichAuthFromAdmin(decoded);
      const auth = {
        openid: decoded.openid,
        partnerId: decoded.adminId,
        isPartner: true,
        _isWebSdkCall: true,
      };
      if (enrichment) {
        auth.adminId = enrichment.admin._id;
        auth.roles = enrichment.roles;
        auth.permissions = enrichment.permissions;
        auth.isPartner = enrichment.isPartner;
      } else if (decoded) {
        if (decoded.isSuperAdmin) { auth.roles = ['super_admin']; auth.permissions = ['all']; }
        if (decoded.adminId) { auth.adminId = decoded.adminId; }
      }
      const mergedEvent = Object.assign({}, event, (event.data || {}));
      const result = await _handlers[action](mergedEvent, context, auth);
      return await convertCloudUrls(result);
    } catch (error) {
      logger.error(action, error);
      if (isBusinessError(error)) return { code: error.code, message: error.message };
      return { code: ERROR_CODES.BUSINESS || 500, message: error.message };
    }
  }

  // 小程序端：通过微信上下文鉴权
  try {
    const auth = await verifyAuth(event, { requireLogin: needLogin, permission: required });
    const mergedEvent = Object.assign({}, event, (event.data || {}));
    const result = await _handlers[action](mergedEvent, context, auth);
    return await convertCloudUrls(result);
  } catch (error) {
    logger.error(action, error);
    if (isBusinessError(error)) return { code: error.code, message: error.message };
    return { code: ERROR_CODES.BUSINESS || 500, message: error.message };
  }
};