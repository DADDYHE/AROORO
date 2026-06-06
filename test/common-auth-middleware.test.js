/**
 * cloudfunctions/common/auth-middleware.js 单元测试
 *
 * 当前模型（Sprint 19+）：
 *   - requireLogin: 是否要求 openid 存在（默认 true）
 *   - permission:   非空字符串则需合作伙伴身份（admins 集合 status=active && isPartner=true）
 *
 * 合作伙伴可访问所有管理功能，无细粒度 permission 区分。
 * 旧版 requireAdmin / roles / permissions 模型已被简化，本测试不覆盖。
 */

describe('auth-middleware verifyAuth', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  function mockOpenid(openid) {
    const cloudSdk = require('wx-server-sdk')
    cloudSdk.getWXContext = jest.fn(() => ({ OPENID: openid }))
  }

  function setAdminDoc(doc) {
    const cloudSdk = require('wx-server-sdk')
    const db = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ data: doc })),
        })),
      })),
    }
    cloudSdk.database = jest.fn(() => db)
    // 同步覆盖 utils.initCloud 返回
    const utils = require('../cloudfunctions/common/utils')
    utils.initCloud = () => ({ cloud: cloudSdk, db })
  }

  test('未登录时应抛出 AUTH_REQUIRED 业务错误', async () => {
    mockOpenid(null)
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    await expect(verifyAuth({}, { requireLogin: true }))
      .rejects.toMatchObject({ name: 'BusinessError', code: 'AUTH_REQUIRED', message: '未登录' })
  })

  test('已登录时（非管理员）应返回 openid', async () => {
    mockOpenid('oTest_001')
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    const auth = await verifyAuth({}, { requireLogin: true })
    expect(auth).toEqual({ openid: 'oTest_001' })
  })

  test('未登录 + permission → 抛 AUTH_REQUIRED', async () => {
    mockOpenid(null)
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    await expect(verifyAuth({}, { permission: 'hosting' }))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  test('permission 非空但 admins 集合无记录 → 抛 PARTNER_REQUIRED', async () => {
    mockOpenid('oTest_002')
    setAdminDoc(null)
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    await expect(verifyAuth({}, { permission: 'hosting' }))
      .rejects.toMatchObject({ code: 'PARTNER_REQUIRED' })
  })

  test('admin.status !== active → 抛 PARTNER_REQUIRED', async () => {
    mockOpenid('oTest_003')
    setAdminDoc({ _id: 'oTest_003', status: 'disabled' })
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    await expect(verifyAuth({}, { permission: 'hosting' }))
      .rejects.toMatchObject({ code: 'PARTNER_REQUIRED' })
  })

  test('admin 缺 isPartner 字段 → 抛 PARTNER_REQUIRED', async () => {
    mockOpenid('oTest_004')
    setAdminDoc({ _id: 'oTest_004', status: 'active' })
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    await expect(verifyAuth({}, { permission: 'hosting' }))
      .rejects.toMatchObject({ code: 'PARTNER_REQUIRED' })
  })

  test('admins 集合查询异常 → 兜底为无 admin 记录', async () => {
    mockOpenid('oTest_005')
    const cloudSdk = require('wx-server-sdk')
    const db = {
      collection: () => ({
        doc: () => ({ get: async () => { throw new Error('collection missing') } }),
      }),
    }
    cloudSdk.database = jest.fn(() => db)
    const utils = require('../cloudfunctions/common/utils')
    utils.initCloud = () => ({ cloud: cloudSdk, db })
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    await expect(verifyAuth({}, { permission: 'hosting' }))
      .rejects.toMatchObject({ code: 'PARTNER_REQUIRED' })
  })

  test('status=active && isPartner=true → 返回 partner 信息', async () => {
    mockOpenid('oTest_006')
    setAdminDoc({ _id: 'oTest_006', status: 'active', isPartner: true })
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    const auth = await verifyAuth({}, { permission: 'hosting' })
    expect(auth.openid).toBe('oTest_006')
    expect(auth.partnerId).toBe('oTest_006')
    expect(auth.isPartner).toBe(true)
  })
})
