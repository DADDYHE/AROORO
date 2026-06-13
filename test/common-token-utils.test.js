/**
 * cloudfunctions/common/token-utils.js 测试
 * 验证 JWT 生成 / 验证 / 提取逻辑
 *
 * 注意：jsonwebtoken 仅在云函数目录内安装（cloudfunctions/<svc>/node_modules），
 * 本文件路径下 require 会失败。使用 jest.mock virtual:true 绕过解析。
 */
process.env.JWT_SECRET = 'test-jwt-secret-key-for-unit-tests'

// 模拟 jsonwebtoken：sign 返回固定格式字符串，verify 解析回原始 payload
// virtual: true 告诉 Jest 不要尝试解析这个模块
jest.mock('jsonwebtoken', () => ({
  sign: (payload, _secret, _options) => {
    const p = Buffer.from(JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 8 * 3600,
    })).toString('base64')
    return `${p}.mock-secret.mock-sig`
  },
  verify: (token, _secret) => {
    if (token === 'not.a.valid.jwt') {throw new Error('invalid token')}
    const [p] = token.split('.')
    const payload = JSON.parse(Buffer.from(p, 'base64').toString('utf8'))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('jwt expired')
    }
    return payload
  },
}), { virtual: true })

const { verifyToken, getTokenFromEvent, generateToken } = require('../cloudfunctions/common/token-utils')

describe('common/token-utils', () => {
  describe('generateToken', () => {
    test('生成 token 后能通过 verifyToken 校验', () => {
      const token = generateToken({ openid: 'openid-1', role: 'owner' })
      expect(typeof token).toBe('string')
      const payload = verifyToken(token)
      expect(payload.openid).toBe('openid-1')
      expect(payload.role).toBe('owner')
    })

    test('adminId 应写入 payload', () => {
      const token = generateToken({ adminId: 'admin-1' })
      const payload = verifyToken(token)
      expect(payload.adminId).toBe('admin-1')
      expect(payload.openid).toBe('')
    })

    test('roles 数组应写入 payload', () => {
      const token = generateToken({ openid: 'o1', roles: ['admin', 'operator'] })
      const payload = verifyToken(token)
      expect(payload.roles).toEqual(['admin', 'operator'])
    })

    test('默认 role 应为 owner', () => {
      const token = generateToken({ openid: 'o1' })
      const payload = verifyToken(token)
      expect(payload.role).toBe('owner')
    })

    // P1 修复：adminService HTTP/JWT 鉴权路径依赖 isSuperAdmin / isPartner 字段
    // 区分等级，token-utils 必须能正确写入这两个权限位
    test('isSuperAdmin === true 应写入 payload', () => {
      const token = generateToken({ openid: 'o1', adminId: 'a1', isSuperAdmin: true })
      const payload = verifyToken(token)
      expect(payload.isSuperAdmin).toBe(true)
    })

    test('isPartner === true 应写入 payload', () => {
      const token = generateToken({ openid: 'o1', isPartner: true })
      const payload = verifyToken(token)
      expect(payload.isPartner).toBe(true)
    })

    test('isSuperAdmin 缺省或非 true 时不应写入 payload', () => {
      const t1 = generateToken({ openid: 'o1' })
      expect(verifyToken(t1).isSuperAdmin).toBeUndefined()

      const t2 = generateToken({ openid: 'o1', isSuperAdmin: false })
      expect(verifyToken(t2).isSuperAdmin).toBeUndefined()

      const t3 = generateToken({ openid: 'o1', isSuperAdmin: 'yes' })
      expect(verifyToken(t3).isSuperAdmin).toBeUndefined()
    })

    test('isPartner 缺省或非 true 时不应写入 payload', () => {
      const t1 = generateToken({ openid: 'o1' })
      expect(verifyToken(t1).isPartner).toBeUndefined()

      const t2 = generateToken({ openid: 'o1', isPartner: false })
      expect(verifyToken(t2).isPartner).toBeUndefined()

      const t3 = generateToken({ openid: 'o1', isPartner: 1 })
      expect(verifyToken(t3).isPartner).toBeUndefined()
    })
  })

  describe('verifyToken', () => {
    test('空 token 应抛错', () => {
      expect(() => verifyToken('')).toThrow(/token/)
      expect(() => verifyToken(null)).toThrow(/token/)
      expect(() => verifyToken(undefined)).toThrow(/token/)
    })

    test('伪造 token 应抛错', () => {
      expect(() => verifyToken('not.a.valid.jwt')).toThrow()
    })
  })

  describe('getTokenFromEvent', () => {
    test('应从 event.headers.Authorization 中提取（去除 Bearer 前缀）', () => {
      const token = getTokenFromEvent({ headers: { Authorization: 'Bearer abc.def.ghi' } })
      expect(token).toBe('abc.def.ghi')
    })

    test('无 headers 时返回 null', () => {
      expect(getTokenFromEvent({})).toBeNull()
    })

    test('无 Authorization 时返回 null', () => {
      expect(getTokenFromEvent({ headers: { 'Content-Type': 'application/json' } })).toBeNull()
    })

    test('不规范的 Authorization 值应原样返回', () => {
      // 不带 Bearer 前缀的 token 应保留原样
      expect(getTokenFromEvent({ headers: { Authorization: 'raw-token' } })).toBe('raw-token')
    })
  })

  describe('边界场景', () => {
    test('JWT_SECRET 缺失时应抛错', () => {
      const original = process.env.JWT_SECRET
      delete process.env.JWT_SECRET
      jest.resetModules()
      // 重新 mock 以应用新的 JWT_SECRET
      jest.doMock('jsonwebtoken', () => ({
        sign: () => 'mock.sig',
        verify: () => ({}),
      }))
      const freshTokenUtils = require('../cloudfunctions/common/token-utils')
      try {
        expect(() => freshTokenUtils.generateToken({ openid: 'o' })).toThrow(/JWT_SECRET/)
        expect(() => freshTokenUtils.verifyToken('x')).toThrow(/JWT_SECRET/)
      } finally {
        process.env.JWT_SECRET = original
        jest.dontMock('jsonwebtoken')
      }
    })
  })
})
