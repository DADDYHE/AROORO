const ERROR_TYPE_TO_MESSAGE = {
  AUTH: '登录已过期，请重新登录',
  VALIDATION: '请求参数不正确',
  NETWORK: '网络连接失败，请检查网络',
  NOT_FOUND: '请求的资源不存在',
  PERMISSION: '没有权限执行此操作',
  BUSINESS: '操作失败，请稍后重试',
  DATA: '数据处理失败',
  SYSTEM: '服务器内部错误，请稍后重试',
  UNKNOWN: '未知错误',
}

const ERROR_CODE_MAP = {
  0: null,
  1001: 'VALIDATION',
  1002: 'DATA',
  1003: 'AUTH',
  1004: 'NOT_FOUND',
  1005: 'PERMISSION',
  1006: 'BUSINESS',
  5001: 'SYSTEM',
  9999: 'UNKNOWN',
}

const DEFAULT_CACHE_TIME = 5 * 60 * 1000

function _resolveErrorMessage(result) {
  if (!result) {return null}
  const severity = ERROR_CODE_MAP[result.code]
  if (severity && ERROR_TYPE_TO_MESSAGE[severity]) {
    return ERROR_TYPE_TO_MESSAGE[severity]
  }
  if (result.error && result.error.type && ERROR_TYPE_TO_MESSAGE[result.error.type]) {
    return ERROR_TYPE_TO_MESSAGE[result.error.type]
  }
  return null
}
const DEFAULT_RETRY_COUNT = 2
const DEFAULT_RETRY_DELAY = 1000
const RETRYABLE_CODES = [1002, 9999]
const MAX_CACHE_SIZE = 100
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000
const REQUEST_CACHE_KEY_PREFIX = 'cloud_request_cache_'

// 前端绝对兜底超时：以防 wx.cloud.callFunction 在极端情况下（调试器云通道断开、
// 环境未关联等）既无 success 也无 fail、连自身 timeout 都不触发，导致调用 Promise
// 永久 pending、页面 loading 死锁。该值略大于 callFunction 的 20s 服务端超时，
// 只兜底"服务端超时回调都失效"的极端场景，不影响正常请求。
const FRONTEND_TIMEOUT = 25000

/**
 * 给 Promise 套一个绝对超时。超时后 reject（message 含 'timeout' 以便被识别为超时、
 * 在 _executeWithRetry 中直接 break 不再重试）。原 Promise 不会被取消，会在其自身
 * 结束后自然 settle，不影响其它逻辑。
 */
function _withFrontendTimeout(promise, ms, label) {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Frontend call timeout (${ms}ms): ${label}`)
      err.frontendTimeout = true
      reject(err)
    }, ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) { clearTimeout(timer) }
  })
}

function _stableStringify(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {return String(obj)}
  if (Array.isArray(obj)) {return JSON.stringify(obj)}
  return JSON.stringify(
    Object.keys(obj).sort().reduce((sorted, key) => {
      sorted[key] = obj[key]
      return sorted
    }, {})
  )
}

class CloudFunctionService {
  constructor() {
    this.cache = new Map()
    this.pendingRequests = new Map()
    this._cacheCleanupTimer = setInterval(() => {
      this._cleanupExpiredCache()
    }, CACHE_CLEANUP_INTERVAL)
  }

  _cleanupExpiredCache() {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.cacheTime) {
        this.cache.delete(key)
      }
    }
  }

  invalidateCache(name) {
    const prefix = `${REQUEST_CACHE_KEY_PREFIX}${name}_`
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  _evictLRU() {
    if (this.cache.size < MAX_CACHE_SIZE) {return}
    const oldestKey = this.cache.keys().next().value
    this.cache.delete(oldestKey)
  }

  /**
   * 统一云函数调用入口
   * 提供请求去重、可选缓存、自动重试、错误上报、loading管理等能力
   *
   * @param {string} name - 云函数名称
   * @param {Object} data - 请求参数
   * @param {Object} options - 选项
   * @param {boolean} [options.useCache=false] - 是否启用缓存
   * @param {number} [options.cacheTime=300000] - 缓存有效期(ms)
   * @param {number} [options.retryCount=2] - 重试次数
   * @param {number} [options.retryDelay=1000] - 重试基础延迟(ms)，指数退避
   * @param {boolean} [options.showLoading=false] - 是否显示loading
   * @param {string} [options.loadingText='加载中...'] - loading文案
   * @returns {Promise<Object>} 云函数返回的 result 对象 { code, data, message }
   */
  async call(name, data = {}, options = {}) {
    const {
      useCache = false,
      cacheTime = DEFAULT_CACHE_TIME,
      retryCount = DEFAULT_RETRY_COUNT,
      retryDelay = DEFAULT_RETRY_DELAY,
      showLoading = false,
      loadingText = '加载中...',
    } = options

    const dataStr = _stableStringify(data)
    if (useCache) {
      const cacheKey = `${REQUEST_CACHE_KEY_PREFIX}${name}_${dataStr}`
      const cachedData = this.getCache(cacheKey)
      if (cachedData) {
        return cachedData
      }
    }

    const requestKey = `${name}_${dataStr}`
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey)
    }

    if (showLoading) {
      wx.showLoading({ title: loadingText, mask: true })
    }

    const requestPromise = this._executeWithRetry(name, data, retryCount, retryDelay)
      .then(result => {
        if (useCache) {
          const cacheKey = `${REQUEST_CACHE_KEY_PREFIX}${name}_${dataStr}`
          this.setCache(cacheKey, result, cacheTime)
        }
        return result
      })
      .catch(error => {
        this._reportToErrorManager(name, data, error)
        throw error
      })
      .finally(() => {
        this.pendingRequests.delete(requestKey)
        if (showLoading) {
          wx.hideLoading()
        }
      })

    this.pendingRequests.set(requestKey, requestPromise)
    return requestPromise
  }

  async _executeWithRetry(name, data, retryCount, retryDelay) {
    let lastError = new Error('云函数调用未执行')

    let safeMode
    try {
      safeMode = require('../utils/safeMode')
    } catch (e) {
      // safeMode 模块可能不存在（功能降级），静默忽略
    }

    if (safeMode) {
      const check = safeMode.checkCall(name, data.action)
      if (check.blocked) {
        throw new Error(`[SafeMode] ${name}.${data.action} 已被拦截`)
      }
    }

    for (let i = 0; i <= retryCount; i++) {
      try {
        const result = await _withFrontendTimeout(
          wx.cloud.callFunction({ name, data, timeout: 20000 }),
          FRONTEND_TIMEOUT,
          `${name}.${data.action || ''}`
        )
        if (result.result) {
          if (result.result.code !== 0) {
            // Sprint 16：优先使用 i18n 翻译 error.type
            const localizedMsg = _resolveErrorMessage(result.result)
            const fallbackMsg = result.result.message || result.result.error || '云函数执行失败'
            // 前端层无法访问 cloudfunctions/common/errors.js 的 err()，保留 error.code 直赋值
            const error = new Error(localizedMsg || fallbackMsg)
            // eslint-disable-next-line no-restricted-syntax
            error.code = result.result.code
            error.type = result.result.error && result.result.error.type
            error.details = result.result.error && result.result.error.details
            error.raw = result.result
            if (!RETRYABLE_CODES.includes(error.code)) {
              throw error
            }
            lastError = error
          } else {
            return result.result
          }
        } else {
          return result.result
        }
      } catch (error) {
        lastError = error
        if (this._isTimeoutError(error)) {
          break
        }
        if (i < retryCount && (!error.code || RETRYABLE_CODES.includes(error.code))) {
          await this._delay(retryDelay * (i + 1))
        } else {
          break
        }
      }
    }

    throw lastError
  }

  _isTimeoutError(error) {
    return error && (
      (error.errMsg && error.errMsg.toLowerCase().includes('timeout')) ||
      (error.message && error.message.toLowerCase().includes('timeout'))
    )
  }

  async get(name, data = {}, cacheTime = DEFAULT_CACHE_TIME) {
    return this.call(name, data, { useCache: true, cacheTime })
  }

  async post(name, data = {}, options = {}) {
    return this.call(name, data, { ...options, useCache: false })
  }

  setCache(key, data, cacheTime) {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else {
      this._evictLRU()
    }
    this.cache.set(key, { data, timestamp: Date.now(), cacheTime })
  }

  getCache(key) {
    const cached = this.cache.get(key)
    if (!cached) {return null}
    const now = Date.now()
    if (now - cached.timestamp > cached.cacheTime) {
      this.cache.delete(key)
      return null
    }
    return cached.data
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  _reportToErrorManager(name, data, error) {
    try {
      const { globalErrorManager, ERROR_TYPES, ERROR_LEVELS } = require('../utils/globalErrorManager')
      if (!globalErrorManager || !globalErrorManager.handleError) {return}

      const code = error.code || 9999
      const errorTypeKey = ERROR_CODE_MAP[code] || 'BUSINESS'
      // 业务校验错误（含未映射的业务码，默认归为 BUSINESS）属预期用户态，降级为 WARNING，避免污染 error 级监控
      const level = (errorTypeKey === 'BUSINESS' || [1003, 1005].includes(code))
        ? ERROR_LEVELS.WARNING
        : ERROR_LEVELS.ERROR

      globalErrorManager.handleError(error, {
        level,
        context: { functionName: name, action: data.action, code },
      })
    } catch (e) {
      // 错误管理器本身失败时不阻断主流程（兜底静默）
    }
  }
}

/**
 * 寄养家庭服务
 * 封装 hostService 云函数调用，提供寄养家庭列表和详情查询
 */
class HostService {
  constructor(cloudService) {
    this.cloud = cloudService
  }

  /** 获取寄养家庭列表，支持筛选条件 */
  async getHostList(data = {}) {
    return this.cloud.get('hostService', { action: 'getHostList', ...data })
  }

  /** 获取指定寄养家庭详情 */
  async getHostInfo(hostId) {
    return this.cloud.call('hostService', { action: 'getHostDetail', hostId }, { useCache: false })
  }

  /** 获取当前登录用户自己的寄养档案（含 status/rejectReason） */
  async getMyProfile() {
    return this.cloud.call('hostService', { action: 'getHostProfile' }, { useCache: false })
  }

  /** 创建寄养家庭档案（提交后进入 pending_review 审核） */
  async createHostProfile(data) {
    return this.cloud.post('hostService', { action: 'createHostProfile', ...data })
  }

  /** 更新寄养家庭档案（updateType=basicInfo 全量字段；resubmit=true 时 rejected 重提审核） */
  async updateHostProfile(data) {
    return this.cloud.post('hostService', { action: 'updateHostProfile', ...data })
  }

  /** 切换接单开关 */
  async updateHostAcceptingOrders(isAcceptingOrders) {
    return this.cloud.post('hostService', { action: 'updateHostAcceptingOrders', isAcceptingOrders })
  }
}

/**
 * 订单服务
 * 封装 orderService 云函数调用，处理订单创建、支付、状态更新等全生命周期
 */
class OrderService {
  constructor(cloudService) {
    this.cloud = cloudService
  }

  /** 创建新订单 */
  async createOrder(data) {
    return this.cloud.post('orderService', { action: 'createOrder', ...data })
  }

  /** 更新订单状态（如 paid/cancelled/completed） */
  async updateBookingStatus(orderId, status) {
    return this.cloud.post('orderService', { action: 'updateOrderStatus', orderId, status })
  }

  /** 查询订单列表 */
  async getOrders(data = {}) {
    return this.cloud.get('orderService', { action: 'getOrders', ...data })
  }

  /** 查询单个订单详情（支持 orderId 或 outTradeNo） */
  async getOrderDetail({ orderId, outTradeNo } = {}) {
    return this.cloud.call('orderService', {
      action: 'getOrderDetail',
      ...(orderId ? { orderId } : {}),
      ...(outTradeNo ? { outTradeNo } : {}),
    }, { useCache: false })
  }

  /** 取消订单 */
  async cancelOrder(data) {
    return this.cloud.post('orderService', { action: 'cancelOrder', ...data })
  }

  /** 合伙人寄养订单操作：confirm 接单 / reject 拒单 / complete 完成（状态机+佣金+退款在服务端） */
  async handleBoardingOrder(orderId, operation) {
    return this.cloud.post('orderService', { action: 'handleBoardingOrder', orderId, operation })
  }

  /** 发起微信支付，amount 单位为元（Sprint 32: 迁移到 paymentService/createPayment） */
  async wechatPay(orderId, amount) {
    return this.cloud.post('paymentService', { action: 'createPayment', type: 'order', orderId, amount: amount * 100 })
  }

  /** 查询活动报名订单列表 */
  async getActivityOrders(data = {}) {
    return this.cloud.call('orderService', { action: 'getActivityOrders', ...data }, { useCache: false })
  }

  /** 查询活动报名订单详情 */
  async getActivityOrderDetail(orderId) {
    return this.cloud.call('orderService', { action: 'getActivityOrderDetail', orderId }, { useCache: false })
  }

  async getMallOrders(data = {}) {
    return this.cloud.call('mallService', { action: 'getMyOrders', ...data }, { useCache: false })
  }

  async cancelMallOrder(orderId) {
    return this.cloud.call('mallService', { action: 'cancelOrder', orderId }, { useCache: false })
  }

  async getMallOrderDetail(orderId) {
    return this.cloud.call('mallService', { action: 'getOrderDetail', orderId }, { useCache: false })
  }

  async confirmMallReceive(orderId) {
    return this.cloud.call('mallService', { action: 'confirmReceive', orderId }, { useCache: false })
  }

  async deleteMallOrder(orderId) {
    return this.cloud.call('mallService', { action: 'deleteOrder', orderId }, { useCache: false })
  }

  /**
   * 批量查询订单的 wx 平台发货状态（用于识别"在 mp.weixin.qq.com 后台发货但未同步到我们后端"的订单）
   * @param {{ orderIds: string[], orderType?: 'mall' | 'group_buy' }} params
   * @returns {Promise<{ code, data: { items: Array<{ orderId, ok, order_state?, shipping?, error? }> } }>}
   */
  async getWxShippingStatus({ orderIds, orderType }) {
    return this.cloud.call('mallService', { action: 'getWxShippingStatus', orderIds, orderType }, { useCache: false })
  }

  async getGroupBuyOrders(data = {}) {
    return this.cloud.call('mallService', { action: 'getGroupBuyOrders', ...data }, { useCache: false })
  }

  async getFeedingOrders(data = {}) {
    return this.cloud.call('feedingService', { action: 'getFeedingOrders', ...data }, { useCache: false })
  }
}

class FavoriteService {
  constructor(cloudService) {
    this.cloud = cloudService
  }

  async getFavorites(params = {}) {
    // 默认拉取寄养家庭收藏；调用方可通过 params.targetType 覆盖
    return this.cloud.get('favoriteService', { action: 'list', targetType: 'host', ...params })
  }

  async addFavorite(data) {
    const hostProfileId = typeof data === 'string' ? data : data.hostProfileId
    // 云函数规范参数为 targetType/targetId；hostProfileId 为向后兼容别名
    return this.cloud.post('favoriteService', { action: 'add', targetType: 'host', targetId: hostProfileId })
  }

  async removeFavorite(data) {
    const hostProfileId = typeof data === 'string' ? data : data.hostProfileId
    return this.cloud.post('favoriteService', { action: 'remove', targetType: 'host', targetId: hostProfileId })
  }
}

class UserService {
  constructor(cloudService) {
    this.cloud = cloudService
  }

  async getUserInfo() {
    return this.cloud.get('userService', { action: 'check' })
  }

  async updateUserInfo(userInfo) {
    return this.cloud.post('userService', { action: 'update', userInfo })
  }
}

class PetService {
  constructor(cloudService) {
    this.cloud = cloudService
  }

  async createPet(data) {
    const result = await this.cloud.post('petService', { action: 'createPet', ...data })
    this.cloud.invalidateCache('petService')
    return result
  }

  async updatePet(petId, updateData) {
    const result = await this.cloud.post('petService', { action: 'updatePet', petId, updateData })
    this.cloud.invalidateCache('petService')
    return result
  }

  async deletePet(petId) {
    const result = await this.cloud.post('petService', { action: 'deletePet', petId })
    this.cloud.invalidateCache('petService')
    return result
  }

  async getPets() {
    return this.cloud.get('petService', { action: 'getPetList' })
  }

  async getPetList(data = {}) {
    return this.cloud.get('petService', { action: 'getPetList', ...data })
  }

  async getPetDetail(petId) {
    return this.cloud.get('petService', { action: 'getPetDetail', petId })
  }
}

class UtilityService {
  constructor(cloudService) {
    this.cloud = cloudService
  }

  async getBanners() {
    return this.cloud.get('utilityService', { action: 'getBanners' })
  }

  // 启动首屏海报（adminService.getSplashPoster，NO_AUTH，可在登录前读取）
  async getSplashPoster() {
    return this.cloud.call('adminService', { action: 'getSplashPoster' }, { useCache: false })
  }
}

class ActivityService {
  constructor(cloudService) {
    this.cloud = cloudService
  }

  async getActivityList(data = {}) {
    return this.cloud.get('activityService', { action: 'getActivityList', ...data })
  }

  async getMyRegisteredActivities(data = {}) {
    return this.cloud.get('activityService', { action: 'getRegistrationList', ...data })
  }

  async getRegistrationList(data = {}) {
    return this.cloud.get('activityService', { action: 'getRegistrationList', ...data })
  }

  async signInRegistration(data = {}) {
    return this.cloud.get('activityService', { action: 'signInRegistration', ...data })
  }
}

class AdminService {
  constructor(cloudService) {
    this.cloud = cloudService
  }

  async getActivityList(data = {}) {
    return this.cloud.call('adminService', { action: 'getActivityList', ...data }, { useCache: false })
  }

  async getActivityDetail(activityId) {
    return this.cloud.call('adminService', { action: 'getActivityDetail', activityId }, { useCache: false })
  }

  async getActivityRegistrations(data = {}) {
    return this.cloud.call('adminService', { action: 'getActivityRegistrations', ...data }, { useCache: false })
  }

  async exportActivityRegistrations(data = {}) {
    return this.cloud.call('adminService', { action: 'exportActivityRegistrations', ...data }, { useCache: false })
  }

  async createActivity(data) {
    return this.cloud.post('adminService', { action: 'createActivity', ...data })
  }

  async updateActivity(data) {
    return this.cloud.post('adminService', { action: 'updateActivity', ...data })
  }

  async getHostProfile() {
    return this.cloud.call('adminService', { action: 'getHostProfile' }, { useCache: false })
  }

  async updateHostProfile(data) {
    return this.cloud.post('adminService', { action: 'updateHostProfile', ...data })
  }

  async createHostProfile(data) {
    return this.cloud.post('adminService', { action: 'createHostProfile', ...data })
  }

  async getBoardingOrders(data = {}) {
    return this.cloud.call('adminService', { action: 'getBoardingOrders', ...data }, { useCache: false })
  }

  async handleBoardingOrder(orderId, operation) {
    return this.cloud.post('adminService', { action: 'handleBoardingOrder', orderId, operation })
  }

  async getMyIncomeOverview(options = {}) {
    return this.cloud.call('partnerService', { action: 'getMyIncomeOverview' }, { useCache: false, ...options })
  }

  async getMyIncomeDetails(data = {}, options = {}) {
    return this.cloud.call('partnerService', { action: 'getMyIncomeDetails', ...data }, { useCache: false, ...options })
  }

  async getMyWallet(data = {}, options = {}) {
    return this.cloud.call('partnerService', { action: 'getMyWallet', ...data }, { useCache: false, ...options })
  }

  async requestWithdrawal(amount, walletType = 'commission', payoutMethod = '') {
    return this.cloud.post('partnerService', { action: 'requestWithdrawal', amount, walletType, payoutMethod })
  }

  async confirmWithdrawal(withdrawalId) {
    return this.cloud.post('partnerService', { action: 'confirmWithdrawal', withdrawalId })
  }

  async getMyPayeeAccounts(options = {}) {
    return this.cloud.call('partnerService', { action: 'getMyPayeeAccounts' }, { useCache: false, ...options })
  }

  async updatePayeeAccounts(payee) {
    return this.cloud.post('partnerService', { action: 'updatePayeeAccounts', payee })
  }

  async cancelWithdrawal(withdrawalId, reason) {
    return this.cloud.post('partnerService', { action: 'cancelWithdrawal', withdrawalId, reason })
  }

  async getMyWithdrawals(data = {}) {
    return this.cloud.call('partnerService', { action: 'getMyWithdrawals', ...data }, { useCache: false })
  }

  // 服务收入（活动创建者、寄养服务者、上门服务者）
  async getServiceIncomeOverview(options = {}) {
    return this.cloud.call('partnerService', { action: 'getServiceIncomeOverview' }, { useCache: false, ...options })
  }

  async getServiceIncomeDetails(data = {}, options = {}) {
    return this.cloud.call('partnerService', { action: 'getServiceIncomeDetails', ...data }, { useCache: false, ...options })
  }

  async getApplicationStatus() {
    return this.cloud.call('partnerService', { action: 'getApplicationStatus' }, { useCache: false })
  }

  async submitApplication(data) {
    return this.cloud.post('partnerService', { action: 'submitApplication', ...data })
  }

  async getMyPermissions() {
    return this.cloud.call('partnerService', { action: 'getMyPermissions' }, { useCache: false })
  }

  /**
   * 合伙人中心首屏聚合（BFF）：一次返回 isPartner / hasPendingApplication / incomeSummary
   * 性能优化：取代 getMyPermissions + getApplicationStatus + getMyIncomeOverview 三连
   */
  async getPartnerHome() {
    return this.cloud.call('partnerService', { action: 'getPartnerHome' }, { useCache: false })
  }

  // ===== 子页面首屏聚合（BFF P1）：每页 1 次调用取代 3~5 次 =====

  /** income 页：overview + wallet + rates + payee + 首屏详情（5 次 → 1 次） */
  async getPartnerIncomeBundle(data = {}, options = {}) {
    return this.cloud.call('partnerService', { action: 'getPartnerIncomeBundle', ...data }, { useCache: false, ...options })
  }

  /** service-income 页：overview + wallet(serviceIncome) + payee + 首屏详情（4 次 → 1 次） */
  async getServiceIncomeBundle(data = {}, options = {}) {
    return this.cloud.call('partnerService', { action: 'getServiceIncomeBundle', ...data }, { useCache: false, ...options })
  }

  /** referral 页：invitedUsers + orderStats + stats（3 次 → 1 次） */
  async getReferralBundle(data = {}, options = {}) {
    return this.cloud.call('partnerService', { action: 'getReferralBundle', ...data }, { useCache: false, ...options })
  }

  async getMyInvitedUsers(data = {}, options = {}) {
    return this.cloud.call('partnerService', { action: 'getMyInvitedUsers', ...data }, { useCache: false, ...options })
  }

  async getReferralOrders(data = {}) {
    return this.cloud.call('partnerService', { action: 'getReferralOrders', ...data }, { useCache: false })
  }

  async getReferralOrderStats(data = {}, options = {}) {
    return this.cloud.call('partnerService', { action: 'getReferralOrderStats', ...data }, { useCache: false, ...options })
  }

  async getReferralStats(data = {}, options = {}) {
    return this.cloud.call('partnerService', { action: 'getReferralStats', ...data }, { useCache: false, ...options })
  }

  // ===== i18n override (Sprint 23) =====

  async listI18nOverrides(data = {}) {
    return this.cloud.call('adminService', { action: 'listI18nOverrides', ...data }, { useCache: false })
  }

  async getI18nOverride(key) {
    return this.cloud.call('adminService', { action: 'getI18nOverride', key }, { useCache: false })
  }

  async upsertI18nOverride(data) {
    return this.cloud.post('adminService', { action: 'upsertI18nOverride', ...data })
  }

  async batchUpsertI18nOverrides(items) {
    return this.cloud.post('adminService', { action: 'batchUpsertI18nOverrides', items })
  }

  async deleteI18nOverride(overrideId) {
    return this.cloud.post('adminService', { action: 'deleteI18nOverride', overrideId })
  }

  async toggleI18nOverrideStatus(overrideId, status) {
    return this.cloud.post('adminService', { action: 'toggleI18nOverrideStatus', overrideId, status })
  }

  async fetchActiveI18nOverrides(locale) {
    return this.cloud.call('i18nOverride', { action: 'fetchActive', locale }, { useCache: false })
  }

  /**
   * Sprint 53: 导出 i18n override 全量为 JSON
   * 入参：{ locale?, status?, limit? }
   * 返回：{ items: [{ key, locale, value, status, note, updatedAt, updatedBy }], count, exportedAt }
   */
  async exportI18nOverrides(params = {}) {
    return this.cloud.call('adminService', { action: 'exportI18nOverrides', ...params }, { useCache: false })
  }

  /**
   * Sprint 53: 扫描 i18n 缺失翻译
   * 入参：{ baseLocale? }
   * 返回：{ totalKeys, totalMissing, missingByLocale }
   */
  async findMissingI18nTranslations(params = {}) {
    return this.cloud.call('adminService', { action: 'findMissingTranslations', ...params }, { useCache: false })
  }

  /**
   * Sprint 53: i18n 覆盖统计概览
   * 返回：{ totalDocs, activeDocs, disabledDocs, uniqueKeys, byLocale, byStatus, lastUpdatedAt }
   */
  async getI18nOverrideStats() {
    return this.cloud.call('adminService', { action: 'getI18nOverrideStats' }, { useCache: false })
  }

  async getMyBoardingOrders(data = {}) {
    return this.cloud.call('adminService', { action: 'getBoardingOrders', ...data }, { useCache: false })
  }

  async getMyCommissionRates(options = {}) {
    return this.cloud.call('partnerService', { action: 'getMyCommissionRates' }, { useCache: false, ...options })
  }
}

const cloudFunctionService = new CloudFunctionService()

module.exports = {
  CloudFunctionService: cloudFunctionService,
  HostService: new HostService(cloudFunctionService),
  OrderService: new OrderService(cloudFunctionService),
  UserService: new UserService(cloudFunctionService),
  FavoriteService: new FavoriteService(cloudFunctionService),
  UtilityService: new UtilityService(cloudFunctionService),
  PetService: new PetService(cloudFunctionService),
  ActivityService: new ActivityService(cloudFunctionService),
  AdminService: new AdminService(cloudFunctionService),
}
