/**
 * cloudfunctions/common/permissions.js 单元测试
 */

const {
  ROLES,
  ROLE_LEVEL,
  extractRoles,
  isAdmin,
  isSuperAdmin,
  isPartner,
  hasPermission,
  hasRoleAtLeast,
  requireOrThrow,
  buildIdentityContext,
} = require('../cloudfunctions/common/permissions')
const { BusinessError } = require('../cloudfunctions/common/errors')

describe('permissions.js', () => {
  describe('ROLES 常量', () => {
    test('应冻结以防外部修改', () => {
      expect(Object.isFrozen(ROLES)).toBe(true)
      expect(Object.isFrozen(ROLE_LEVEL)).toBe(true)
    })
  })

  describe('extractRoles', () => {
    test('数组 roles 优先', () => {
      expect(extractRoles({ roles: ['admin', 'partner'] })).toEqual(['admin', 'partner'])
    })

    test('单值 role 降级', () => {
      expect(extractRoles({ role: 'admin' })).toEqual(['admin'])
    })

    test('数组 + 单值同时存在时数组优先', () => {
      expect(extractRoles({ roles: ['admin'], role: 'partner' })).toEqual(['admin'])
    })

    test('应去重', () => {
      expect(extractRoles({ roles: ['admin', 'admin', 'partner'] })).toEqual(['admin', 'partner'])
    })

    test('空 / null / 非对象应返回空数组', () => {
      expect(extractRoles(null)).toEqual([])
      expect(extractRoles(undefined)).toEqual([])
      expect(extractRoles({})).toEqual([])
    })
  })

  describe('isAdmin', () => {
    test('super_admin / admin / operator / viewer 都算 admin', () => {
      ['super_admin', 'admin', 'operator', 'viewer'].forEach(r => {
        expect(isAdmin({ roles: [r] })).toBe(true)
      })
    })

    test('partner 不算 admin', () => {
      expect(isAdmin({ roles: ['partner'] })).toBe(false)
    })

    test('空 doc 应返回 false', () => {
      expect(isAdmin(null)).toBe(false)
      expect(isAdmin({})).toBe(false)
    })
  })

  describe('isSuperAdmin', () => {
    test('仅当包含 super_admin 时为 true', () => {
      expect(isSuperAdmin({ roles: ['super_admin'] })).toBe(true)
      expect(isSuperAdmin({ roles: ['super_admin', 'admin'] })).toBe(true)
      expect(isSuperAdmin({ roles: ['admin'] })).toBe(false)
    })
  })

  describe('isPartner', () => {
    test('roles 含 partner 即视为合作伙伴', () => {
      expect(isPartner({ roles: ['partner'] })).toBe(true)
    })

    test('isPartner: true 兜底', () => {
      expect(isPartner({ isPartner: true })).toBe(true)
    })

    test('普通 owner 不算 partner', () => {
      expect(isPartner({ roles: ['owner'] })).toBe(false)
      expect(isPartner({})).toBe(false)
    })
  })

  describe('hasPermission', () => {
    const adminDoc = { roles: ['admin'], permissions: ['order:list', 'order:create'] }
    const superDoc = { roles: ['super_admin'], permissions: [] }

    test('super_admin 隐含所有权限', () => {
      expect(hasPermission(superDoc, 'order:refund')).toBe(true)
    })

    test('普通 admin 需 permissions 中命中', () => {
      expect(hasPermission(adminDoc, 'order:list')).toBe(true)
      expect(hasPermission(adminDoc, 'order:refund')).toBe(false)
    })

    test('required 数组：任一命中即可', () => {
      expect(hasPermission(adminDoc, ['order:refund', 'order:list'])).toBe(true)
    })

    test('空 doc 应返回 false', () => {
      expect(hasPermission(null, 'x')).toBe(false)
    })
  })

  describe('hasRoleAtLeast', () => {
    test('角色等级应按 super_admin > admin > partner > operator > viewer > owner', () => {
      expect(ROLE_LEVEL[ROLES.SUPER_ADMIN]).toBeGreaterThan(ROLE_LEVEL[ROLES.ADMIN])
      expect(ROLE_LEVEL[ROLES.ADMIN]).toBeGreaterThan(ROLE_LEVEL[ROLES.PARTNER])
      expect(ROLE_LEVEL[ROLES.PARTNER]).toBeGreaterThan(ROLE_LEVEL[ROLES.OPERATOR])
      expect(ROLE_LEVEL[ROLES.OPERATOR]).toBeGreaterThan(ROLE_LEVEL[ROLES.VIEWER])
    })

    test('admin 满足 admin 最低角色', () => {
      expect(hasRoleAtLeast({ roles: ['admin'] }, 'admin')).toBe(true)
    })

    test('super_admin 满足 admin 最低角色', () => {
      expect(hasRoleAtLeast({ roles: ['super_admin'] }, 'admin')).toBe(true)
    })

    test('operator 不满足 admin 最低角色', () => {
      expect(hasRoleAtLeast({ roles: ['operator'] }, 'admin')).toBe(false)
    })

    test('未知角色按 0 级处理', () => {
      expect(hasRoleAtLeast({ roles: ['unknown_role'] }, 'viewer')).toBe(false)
    })
  })

  describe('requireOrThrow', () => {
    test('满足角色不应抛错', () => {
      expect(() => requireOrThrow({ roles: ['admin'] }, { requireRole: 'admin' })).not.toThrow()
    })

    test('不满足角色应抛 BusinessError', () => {
      expect(() => requireOrThrow({ roles: ['viewer'] }, { requireRole: 'admin' })).toThrow(BusinessError)
    })

    test('不满足权限应抛 BusinessError', () => {
      expect(() => requireOrThrow({ roles: ['admin'], permissions: ['order:list'] }, {
        requirePermission: 'order:refund',
      })).toThrow(BusinessError)
    })

    test('super_admin 满足任意权限', () => {
      expect(() => requireOrThrow({ roles: ['super_admin'] }, { requirePermission: 'any:thing' })).not.toThrow()
    })

    test('空 options 应不抛错', () => {
      expect(() => requireOrThrow({})).not.toThrow()
    })
  })

  describe('buildIdentityContext', () => {
    test('应汇总身份信息', () => {
      const ctx = buildIdentityContext({ roles: ['admin'], permissions: ['order:list'], isPartner: true })
      expect(ctx.roles).toEqual(['admin'])
      expect(ctx.permissions).toEqual(['order:list'])
      expect(ctx.isAdmin).toBe(true)
      expect(ctx.isSuperAdmin).toBe(false)
      expect(ctx.isPartner).toBe(true)
    })

    test('空 doc 应返回默认值', () => {
      const ctx = buildIdentityContext(null)
      expect(ctx.roles).toEqual([])
      expect(ctx.permissions).toEqual([])
      expect(ctx.isAdmin).toBe(false)
      expect(ctx.isPartner).toBe(false)
    })
  })
})
