/**
 * Sprint 16+: auth-middleware.ts 迁移验证
 *
 * 当前模型（Sprint 19+ 简化后）：
 *   - requireLogin: 是否要求 openid 存在（默认 true）
 *   - permission:   非空字符串则需合作伙伴身份
 *
 * 覆盖：
 *   1. 源文件 / 编译产物
 *   2. 公共 API 签名
 *   3. requireLogin 行为
 *   4. permission='partner' 行为（status/isPartner 校验）
 *   5. 默认 requireLogin=true
 */

const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..', 'cloudfunctions', 'common')
const TS = path.join(ROOT, 'auth-middleware.ts')
const JS = path.join(ROOT, 'auth-middleware.js')
const DTS = path.join(ROOT, 'auth-middleware.d.ts')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

describe('Sprint 16+: auth-middleware.ts 迁移', () => {
  describe('源文件 / 编译产物', () => {
    test('auth-middleware.ts 源文件存在', () => {
      expect(fs.existsSync(TS)).toBe(true)
    })

    test('auth-middleware.js 编译产物存在', () => {
      expect(fs.existsSync(JS)).toBe(true)
    })

    test('auth-middleware.d.ts 类型声明存在', () => {
      expect(fs.existsSync(DTS)).toBe(true)
    })

    test('产物导出 verifyAuth', () => {
      const m = require(JS)
      expect(typeof m.verifyAuth).toBe('function')
    })
  })

  describe('类型签名（.ts / .d.ts 层面）', () => {
    test('导出 VerifyAuthOptions 接口', () => {
      const ts = readSafe(TS)
      expect(ts).toMatch(/export\s+interface\s+VerifyAuthOptions/)
    })

    test('导出 AuthResult 类型', () => {
      const ts = readSafe(TS)
      expect(ts).toMatch(/export\s+type\s+AuthResult/)
    })

    test('导出 BasicAuthResult 接口', () => {
      const ts = readSafe(TS)
      expect(ts).toMatch(/export\s+interface\s+BasicAuthResult/)
    })

    test('导出 PartnerAuthResult 接口', () => {
      const ts = readSafe(TS)
      expect(ts).toMatch(/export\s+interface\s+PartnerAuthResult/)
    })

    test('permission 字段类型为 partner | admin | super_admin | null', () => {
      const ts = readSafe(TS)
      expect(ts).toMatch(/permission\?:\s*'partner'\s*\|\s*'admin'\s*\|\s*'super_admin'\s*\|\s*null/)
    })
  })

  describe('运行时行为（requireLogin）', () => {
    let adminDoc
    const setupMocks = (opts = {}) => {
      const ctx = {}
      if ('openid' in opts) {ctx.OPENID = opts.openid}
      const mockCloud = {
        getWXContext: () => ctx,
      }
      const mockDb = {
        collection: name => ({
          doc: id => ({
            get: async () => ({ data: adminDoc }),
          }),
        }),
      }
      const utils = require(path.join(ROOT, 'utils.js'))
      utils.initCloud = () => ({ cloud: mockCloud, db: mockDb })
      return { mockCloud, mockDb }
    }

    beforeEach(() => {
      jest.resetModules()
      adminDoc = null
    })

    test('openid 存在 + requireLogin=true（默认）→ 返回 { openid }', async () => {
      const { verifyAuth } = require(JS)
      setupMocks({ openid: 'oTest' })
      const r = await verifyAuth({})
      expect(r).toEqual({ openid: 'oTest' })
    })

    test('openid 缺失 + requireLogin=true → 抛 AUTH_REQUIRED', async () => {
      const { verifyAuth } = require(JS)
      setupMocks({ openid: undefined })
      await expect(verifyAuth({})).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    })

    test('openid 缺失 + requireLogin=false → 返回 { openid: "" }', async () => {
      const { verifyAuth } = require(JS)
      setupMocks({ openid: undefined })
      const r = await verifyAuth({}, { requireLogin: false })
      expect(r.openid).toBe('')
    })
  })

  describe('运行时行为（permission → 需 partner）', () => {
    let adminDoc
    const setupMocks = (opts = {}) => {
      const ctx = {}
      ctx.OPENID = opts.openid || 'oAdmin'
      const mockCloud = {
        getWXContext: () => ctx,
      }
      const mockDb = {
        collection: name => ({
          doc: id => ({
            get: async () => ({ data: adminDoc }),
          }),
        }),
      }
      const utils = require(path.join(ROOT, 'utils.js'))
      utils.initCloud = () => ({ cloud: mockCloud, db: mockDb })
    }

    beforeEach(() => {
      jest.resetModules()
      adminDoc = null
    })

    test('admin.status !== active → 抛 PARTNER_REQUIRED', async () => {
      const { verifyAuth } = require(JS)
      adminDoc = { _id: 'a1', openid: 'oAdmin', status: 'pending', isPartner: true }
      setupMocks()
      await expect(verifyAuth({}, { permission: 'hosting' }))
        .rejects.toMatchObject({ code: 'PARTNER_REQUIRED' })
    })

    test('admin.status=active + isPartner=true → 返回 partner 信息', async () => {
      const { verifyAuth } = require(JS)
      adminDoc = { _id: 'a1', openid: 'oAdmin', status: 'active', isPartner: true }
      setupMocks()
      const r = await verifyAuth({}, { permission: 'hosting' })
      expect(r.partnerId).toBe('a1')
      expect(r.openid).toBe('oAdmin')
      expect(r.isPartner).toBe(true)
    })

    test('admin 缺 isPartner 字段 → 抛 PARTNER_REQUIRED', async () => {
      const { verifyAuth } = require(JS)
      adminDoc = { _id: 'a1', status: 'active' }
      setupMocks()
      await expect(verifyAuth({}, { permission: 'hosting' }))
        .rejects.toMatchObject({ code: 'PARTNER_REQUIRED' })
    })

    test('admin 缺失（admins 集合无记录）→ 抛 PARTNER_REQUIRED', async () => {
      const { verifyAuth } = require(JS)
      adminDoc = null
      setupMocks()
      await expect(verifyAuth({}, { permission: 'hosting' }))
        .rejects.toMatchObject({ code: 'PARTNER_REQUIRED' })
    })

    test('isPartner=false → 抛 PARTNER_REQUIRED', async () => {
      const { verifyAuth } = require(JS)
      adminDoc = { _id: 'a1', status: 'active', isPartner: false }
      setupMocks()
      await expect(verifyAuth({}, { permission: 'hosting' }))
        .rejects.toMatchObject({ code: 'PARTNER_REQUIRED' })
    })
  })

  describe('向后兼容（与原 .js 一致）', () => {
    test('默认 requireLogin=true（与原行为一致）', async () => {
      jest.resetModules()
      const { verifyAuth } = require(JS)
      const mockCloud = { getWXContext: () => ({ OPENID: undefined }) }
      const mockDb = { collection: () => ({ doc: () => ({ get: async () => ({ data: null }) }) }) }
      const utils = require(path.join(ROOT, 'utils.js'))
      utils.initCloud = () => ({ cloud: mockCloud, db: mockDb })
      await expect(verifyAuth({})).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    })

    test('admins 集合查询异常 → 视作无 admin 记录（兜底）', async () => {
      jest.resetModules()
      const { verifyAuth } = require(JS)
      const mockCloud = { getWXContext: () => ({ OPENID: 'oAdmin' }) }
      const mockDb = {
        collection: () => ({
          doc: () => ({
            get: async () => { throw new Error('collection missing') },
          }),
        }),
      }
      const utils = require(path.join(ROOT, 'utils.js'))
      utils.initCloud = () => ({ cloud: mockCloud, db: mockDb })
      await expect(verifyAuth({}, { permission: 'hosting' }))
        .rejects.toMatchObject({ code: 'PARTNER_REQUIRED' })
    })
  })
})
