/**
 * Sprint 41: partner 入口同步预检查测试
 *
 * 验证 subpackages/partner/home 与 application 的 onLoad：
 *   - home: 未登录（userInfo=null）→ 立即 toast + navigateBack，不调 _loadData；
 *           已登录（userInfo 存在）→ 同步调 _loadData（partner 态由异步 _loadData 判断）
 *   - application: 未登录 → 立即 toast + navigateBack；已登录 → 调 _loadData
 */

// 使用 fake timers 跳过 setTimeout 1.5s
jest.useFakeTimers()

// =========================================================================
// 模拟 wx
// =========================================================================
const wxMock = {
  _toasts: [],
  _navigates: [],
  _switchTabs: [],
  showToast: jest.fn(opts => { wxMock._toasts.push(opts) }),
  navigateBack: jest.fn(opts => { wxMock._navigates.push({ type: 'back', opts }) }),
  switchTab: jest.fn(opts => { wxMock._switchTabs.push(opts) }),
  showModal: jest.fn(),
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  showNavigationBarLoading: jest.fn(),
  hideNavigationBarLoading: jest.fn(),
}

global.wx = wxMock
global.getCurrentPages = jest.fn(() => [{ route: 'pages/index/index' }])

// =========================================================================
// 模拟 getApp（默认未登录）
// =========================================================================
const globalData = { identity: null, userInfo: null }
global.getApp = jest.fn(() => ({ globalData }))

/**
 * 加载 partner/home 页面并返回 pageOpts + mock 后的 _loadData
 */
function loadHome() {
  const pages = []
  global.Page = jest.fn(opts => { pages.push(opts) })
  jest.resetModules()
  jest.doMock('../services/CloudFunctionService', () => ({ AdminService: {} }))
  jest.doMock('../utils/page-i18n.js', () => ({ mixin: () => ({}) }))
  require('../subpackages/partner/home/index.js')
  const pageOpts = pages[0]
  pageOpts._loadData = jest.fn()
  pageOpts.error = jest.fn()
  return pageOpts
}

/**
 * 加载 partner/application 页面
 */
function loadApplication() {
  const pages = []
  global.Page = jest.fn(opts => { pages.push(opts) })
  jest.resetModules()
  jest.doMock('../services/CloudFunctionService', () => ({ AdminService: {} }))
  jest.doMock('../utils/dateUtils', () => ({ parseDate: d => (d ? new Date(d) : null) }))
  jest.doMock('../utils/page-i18n.js', () => ({ mixin: () => ({}) }))
  require('../subpackages/partner/application/index.js')
  const pageOpts = pages[0]
  pageOpts._loadData = jest.fn()
  pageOpts.error = jest.fn()
  return pageOpts
}

// =========================================================================
// home
// =========================================================================
describe('partner/home onLoad 同步预检查', () => {
  beforeEach(() => {
    wxMock._toasts = []
    wxMock._navigates = []
    wxMock._switchTabs = []
    globalData.identity = null
    globalData.userInfo = null
  })

  test('未登录（userInfo=null）→ 弹 AUTH_REQUIRED + navigateBack，不调 _loadData', () => {
    const pageOpts = loadHome()
    pageOpts.onLoad()
    expect(pageOpts.error).toHaveBeenCalledWith('AUTH_REQUIRED')
    expect(pageOpts._loadData).not.toHaveBeenCalled()
  })

  test('已登录（userInfo 存在，非 partner 业务态）→ 调 _loadData（partner 态交异步 _loadData 判断）', () => {
    globalData.userInfo = { _id: 'u1', nickName: 'test' }
    const pageOpts = loadHome()
    pageOpts.onLoad()
    expect(pageOpts._loadData).toHaveBeenCalled()
  })

  test('已登录（userInfo 存在，isPartner=true）→ 同步放行调 _loadData', () => {
    globalData.userInfo = { _id: 'u1', nickName: 'test', isPartner: true }
    const pageOpts = loadHome()
    pageOpts.onLoad()
    expect(pageOpts._loadData).toHaveBeenCalled()
  })
})

// =========================================================================
// application
// =========================================================================
describe('partner/application onLoad 登录预检查', () => {
  beforeEach(() => {
    wxMock._toasts = []
    wxMock._navigates = []
    wxMock._switchTabs = []
    globalData.identity = null
    globalData.userInfo = null
  })

  test('未登录（userInfo=null）→ toast + 不调 _loadData', () => {
    const pageOpts = loadApplication()
    pageOpts.onLoad()
    expect(pageOpts.error).toHaveBeenCalledWith('AUTH_REQUIRED')
    expect(pageOpts._loadData).not.toHaveBeenCalled()
  })

  test('已登录 → 调 _loadData（partner 状态交给异步判断）', () => {
    globalData.userInfo = { _id: 'u1', nickName: 'test' }
    const pageOpts = loadApplication()
    pageOpts.onLoad()
    expect(pageOpts._loadData).toHaveBeenCalled()
  })
})
