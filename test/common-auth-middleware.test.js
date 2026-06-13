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

  // ===== Sprint 41: super_admin / admin 等级 =====

  test('permission=super_admin 且角色是 super_admin → 返回 admin 信息 + isSuperAdmin=true', async () => {
    mockOpenid('oTest_007')
    setAdminDoc({ _id: 'oTest_007', status: 'active', roles: ['super_admin'] })
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    const auth = await verifyAuth({}, { permission: 'super_admin' })
    expect(auth.openid).toBe('oTest_007')
    expect(auth.adminId).toBe('oTest_007')
    expect(auth.isSuperAdmin).toBe(true)
  })

  test('permission=super_admin 但角色仅 partner → 抛 PERMISSION_DENIED', async () => {
    mockOpenid('oTest_008')
    setAdminDoc({ _id: 'oTest_008', status: 'active', isPartner: true })
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    await expect(verifyAuth({}, { permission: 'super_admin' }))
      .rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  test('permission=super_admin 但无 admin 记录 → 抛 PARTNER_REQUIRED', async () => {
    mockOpenid('oTest_009')
    setAdminDoc(null)
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    await expect(verifyAuth({}, { permission: 'super_admin' }))
      .rejects.toMatchObject({ code: 'PARTNER_REQUIRED' })
  })

  test('permission=admin 且角色是 super_admin → 返回 isAdmin=true, isSuperAdmin=true', async () => {
    mockOpenid('oTest_010')
    setAdminDoc({ _id: 'oTest_010', status: 'active', roles: ['super_admin'] })
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    const auth = await verifyAuth({}, { permission: 'admin' })
    expect(auth.isAdmin).toBe(true)
    expect(auth.isSuperAdmin).toBe(true)
  })

  test('permission=admin 且角色是 partner → 返回 isAdmin=true, isSuperAdmin=false', async () => {
    mockOpenid('oTest_011')
    setAdminDoc({ _id: 'oTest_011', status: 'active', isPartner: true })
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    const auth = await verifyAuth({}, { permission: 'admin' })
    expect(auth.isAdmin).toBe(true)
    expect(auth.isSuperAdmin).toBe(false)
  })

  test('permission=admin 但既非 super_admin 也非 partner → 抛 PERMISSION_DENIED', async () => {
    mockOpenid('oTest_012')
    setAdminDoc({ _id: 'oTest_012', status: 'active' })
    const { verifyAuth } = require('../cloudfunctions/common/auth-middleware')
    await expect(verifyAuth({}, { permission: 'admin' }))
      .rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })
})
