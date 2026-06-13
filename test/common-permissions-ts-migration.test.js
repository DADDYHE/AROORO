/**
 * Sprint 17: TypeScript 迁移测试 - permissions.js → .ts
 */

const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const TS = path.join(ROOT, 'cloudfunctions', 'common', 'permissions.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'permissions.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'permissions.d.ts')
const TSCONFIG = path.join(ROOT, 'tsconfig.common.json')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

describe('Sprint 17: permissions TypeScript 迁移', () => {
  describe('文件存在性', () => {
    test('.ts 源文件存在', () => {
      expect(fs.existsSync(TS)).toBe(true)
    })

    test('.js 编译产物存在', () => {
      expect(fs.existsSync(JS)).toBe(true)
    })

    test('.d.ts 声明文件存在', () => {
      expect(fs.existsSync(DTS)).toBe(true)
    })
  })

  describe('.ts 源码契约', () => {
    let ts
    beforeAll(() => { ts = readSafe(TS) })

    test('导出 RoleName 类型', () => {
      expect(ts).toMatch(/export\s+type\s+RoleName/)
    })

    test('导出 IdentityDoc / IdentityContext / RequireOrThrowOptions 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+IdentityDoc/)
      expect(ts).toMatch(/export\s+interface\s+IdentityContext/)
      expect(ts).toMatch(/export\s+interface\s+RequireOrThrowOptions/)
    })

    test('导出 ROLES / ROLE_LEVEL 常量', () => {
      expect(ts).toMatch(/export\s+const\s+ROLES/)
      expect(ts).toMatch(/export\s+const\s+ROLE_LEVEL/)
    })
  })

  describe('模块 API 完整性', () => {
    let perms
    beforeAll(() => {
      delete require.cache[JS]
      perms = require(JS)
    })

    test('导出所有公共方法', () => {
      expect(typeof perms.extractRoles).toBe('function')
      expect(typeof perms.isAdmin).toBe('function')
      expect(typeof perms.isSuperAdmin).toBe('function')
      expect(typeof perms.isPartner).toBe('function')
      expect(typeof perms.hasPermission).toBe('function')
      expect(typeof perms.hasRoleAtLeast).toBe('function')
      expect(typeof perms.requireOrThrow).toBe('function')
      expect(typeof perms.buildIdentityContext).toBe('function')
    })

    test('ROLES 是 frozen 对象', () => {
      expect(Object.isFrozen(perms.ROLES)).toBe(true)
    })
  })

  describe('角色提取', () => {
    let perms
    beforeAll(() => {
      delete require.cache[JS]
      perms = require(JS)
    })

    test('数组 roles', () => {
      expect(perms.extractRoles({ roles: ['admin', 'partner'] })).toEqual(['admin', 'partner'])
    })

    test('单值 role 兼容', () => {
      expect(perms.extractRoles({ role: 'admin' })).toEqual(['admin'])
    })

    test('空文档', () => {
      expect(perms.extractRoles({})).toEqual([])
    })

    test('null / undefined', () => {
      expect(perms.extractRoles(null)).toEqual([])
      expect(perms.extractRoles(undefined)).toEqual([])
    })
  })

  describe('角色判定', () => {
    let perms
    beforeAll(() => {
      delete require.cache[JS]
      perms = require(JS)
    })

    test('isAdmin 含 super_admin/admin/operator/viewer', () => {
      expect(perms.isAdmin({ roles: ['super_admin'] })).toBe(true)
      expect(perms.isAdmin({ roles: ['admin'] })).toBe(true)
      expect(perms.isAdmin({ roles: ['operator'] })).toBe(true)
      expect(perms.isAdmin({ roles: ['viewer'] })).toBe(true)
    })

    test('isAdmin 不含 partner', () => {
      expect(perms.isAdmin({ roles: ['partner'] })).toBe(false)
    })

    test('isSuperAdmin', () => {
      expect(perms.isSuperAdmin({ roles: ['super_admin'] })).toBe(true)
      expect(perms.isSuperAdmin({ roles: ['admin'] })).toBe(false)
    })

    test('isPartner（roles 路径）', () => {
      expect(perms.isPartner({ roles: ['partner'] })).toBe(true)
    })

    test('isPartner（isPartner=true 路径）', () => {
      expect(perms.isPartner({ isPartner: true })).toBe(true)
    })

    test('isPartner null', () => {
      expect(perms.isPartner(null)).toBe(false)
    })
  })

  describe('权限校验', () => {
    let perms
    beforeAll(() => {
      delete require.cache[JS]
      perms = require(JS)
    })

    test('super_admin 隐含所有权限', () => {
      expect(perms.hasPermission({ roles: ['super_admin'] }, 'order:refund')).toBe(true)
    })

    test('普通 admin 缺权限', () => {
      expect(perms.hasPermission({ roles: ['admin'], permissions: ['order:list'] }, 'order:refund')).toBe(false)
    })

    test('普通 admin 命中权限', () => {
      expect(perms.hasPermission({ roles: ['admin'], permissions: ['order:refund'] }, 'order:refund')).toBe(true)
    })

    test('数组 required 命中任一', () => {
      expect(perms.hasPermission(
        { roles: ['admin'], permissions: ['order:refund'] },
        ['order:list', 'order:refund']
      )).toBe(true)
    })
  })

  describe('角色等级断言', () => {
    let perms
    beforeAll(() => {
      delete require.cache[JS]
      perms = require(JS)
    })

    test('admin ≥ operator', () => {
      expect(perms.hasRoleAtLeast({ roles: ['admin'] }, 'operator')).toBe(true)
    })

    test('viewer < operator', () => {
      expect(perms.hasRoleAtLeast({ roles: ['viewer'] }, 'operator')).toBe(false)
    })

    test('partner ≥ partner', () => {
      expect(perms.hasRoleAtLeast({ roles: ['partner'] }, 'partner')).toBe(true)
    })
  })

  describe('requireOrThrow 鉴权守卫', () => {
    let perms
    beforeAll(() => {
      delete require.cache[JS]
      perms = require(JS)
    })

    test('未传 doc + requireRole → 抛错', () => {
      expect(() => perms.requireOrThrow(null, { requireRole: 'admin' }))
        .toThrow(/需要 admin 角色/)
    })

    test('未传 doc + requirePermission → 抛错', () => {
      expect(() => perms.requireOrThrow(null, { requirePermission: 'order:refund' }))
        .toThrow(/缺少权限/)
    })

    test('权限满足 → 不抛错', () => {
      expect(() => perms.requireOrThrow(
        { roles: ['admin'], permissions: ['order:refund'] },
        { requirePermission: 'order:refund' }
      )).not.toThrow()
    })

    test('数组 required 错误信息含 join', () => {
      expect(() => perms.requireOrThrow(
        { roles: ['admin'] },
        { requirePermission: ['a', 'b'] }
      )).toThrow(/a\/b/)
    })

    test('PERMISSION_DENIED 错误码', () => {
      try {
        perms.requireOrThrow(null, { requireRole: 'admin' })
      } catch (e) {
        expect(e.code).toBe('PERMISSION_DENIED')
      }
    })
  })

  describe('buildIdentityContext', () => {
    let perms
    beforeAll(() => {
      delete require.cache[JS]
      perms = require(JS)
    })

    test('完整文档 → 完整 context', () => {
      const ctx = perms.buildIdentityContext({
        roles: ['super_admin', 'partner'],
        permissions: ['order:refund'],
        isPartner: true,
      })
      expect(ctx.roles).toEqual(['super_admin', 'partner'])
      expect(ctx.permissions).toEqual(['order:refund'])
      expect(ctx.isSuperAdmin).toBe(true)
      expect(ctx.isAdmin).toBe(true)
      expect(ctx.isPartner).toBe(true)
    })

    test('null doc', () => {
      const ctx = perms.buildIdentityContext(null)
      expect(ctx.roles).toEqual([])
      expect(ctx.permissions).toEqual([])
      expect(ctx.isSuperAdmin).toBe(false)
    })
  })

  describe('tsconfig / build 工具链', () => {
    test('tsconfig.common.json include permissions.ts', () => {
      const cfg = JSON.parse(readSafe(TSCONFIG))
      expect(cfg.include).toContain('cloudfunctions/common/permissions.ts')
    })

    test('build-all-services.js TARGETS 含 permissions.js', () => {
      const buildJs = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(buildJs).toMatch(/permissions\.js/)
    })
  })
})
