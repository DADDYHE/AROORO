/**
 * Sprint 37: userService 4 个 services/* TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 4 个 .ts 源文件存在
 *   2. 验证 tsconfig.userService.json include 包含全部 5 个文件
 *   3. 验证 build-all-services.js 包含全部 5 个 target
 *   4. 验证各 .ts 文件类型定义完整
 *   5. 验证各 .ts 文件 handler 导出
 *   6. 验证 Runtime shim 兼容 CommonJS
 *   7. 验证 package.json 注册 audit 脚本
 *   8. 验证 audit 脚本可成功运行
 *
 * 配合：scripts/audit-s37-user-services-ts.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const USER_DIR = path.join(ROOT, 'cloudfunctions', 'userService')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (e) { return false }
}

describe('Sprint 37: userService services TypeScript 迁移', () => {
  describe('1. 物理文件存在', () => {
    const TS_FILES = ['auth.ts', 'notifications.ts', 'referral.ts', 'addresses.ts']
    const JS_FILES = ['auth.js', 'notifications.js', 'referral.js', 'addresses.js']

    TS_FILES.forEach(f => {
      test(`${f} 存在`, () => {
        expect(fileExists(path.join(USER_DIR, f))).toBe(true)
      })
    })

    JS_FILES.forEach(f => {
      test(`${f}（构建产物）存在`, () => {
        expect(fileExists(path.join(USER_DIR, f))).toBe(true)
      })
    })
  })

  describe('2. tsconfig.userService.json include', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.userService.json')))
    })

    const REQUIRED = [
      'cloudfunctions/userService/index.ts',
      'cloudfunctions/userService/auth.ts',
      'cloudfunctions/userService/notifications.ts',
      'cloudfunctions/userService/referral.ts',
      'cloudfunctions/userService/addresses.ts',
    ]

    REQUIRED.forEach(entry => {
      test(`include 包含 ${entry}`, () => {
        expect(cfg.include).toContain(entry)
      })
    })
  })

  describe('3. build-all-services.js 编译多文件', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
    })

    const REQUIRED_TARGETS = ['index.js', 'auth.js', 'notifications.js', 'referral.js', 'addresses.js']

    test('build 脚本存在', () => {
      expect(code).not.toBeNull()
    })

    test('build-all-services.js 包含全部 5 个 target（index.js / auth.js / notifications.js / referral.js / addresses.js）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      for (const target of REQUIRED_TARGETS) {
        expect(allBuild).toMatch(new RegExp(target.replace(/\./g, '\\.')))
      }
    })

    test('使用 tsc 编译 tsconfig.userService.json（在 build-all-services.js 中）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(allBuild).toMatch(new RegExp('tsconfig\\.userService\\.json'))
      expect(allBuild).toMatch(new RegExp(`name\\s*:\\s*'userService'`))
    })
  })

  describe('4. auth.ts 类型与 handler（9 个 action）', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(USER_DIR, 'auth.ts'))
    })

    test('注释包含 Sprint 37', () => {
      expect(code).toMatch(/Sprint\s*37/)
    })

    test('包含 AuthHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+AuthHandler\b/)
    })

    test('包含 UserRecord 接口', () => {
      expect(code).toMatch(/export\s+interface\s+UserRecord\b/)
    })

    test('包含 LoginResult / IdentityResult / CheckResult / AllUserInfoResult', () => {
      expect(code).toMatch(/export\s+interface\s+LoginResult\b/)
      expect(code).toMatch(/export\s+interface\s+IdentityResult\b/)
      expect(code).toMatch(/export\s+interface\s+CheckResult\b/)
      expect(code).toMatch(/export\s+interface\s+AllUserInfoResult\b/)
    })

    const ACTIONS = ['login', 'getIdentity', 'syncIdentity', 'checkUserInfo', 'updateUserInfo', 'getPhoneNumber', 'getAllUserInfo', 'getConfig', 'checkAdminStatus']
    test('共 9 个 action', () => {
      expect(ACTIONS.length).toBe(9)
    })

    ACTIONS.forEach(act => {
      test(`导出 ${act}`, () => {
        expect(code).toMatch(new RegExp(`export\\s+async\\s+function\\s+${act}\\b`))
      })
    })

    test('包含 Runtime shim', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })
  })

  describe('5. notifications.ts 类型与 handler（4 个 action）', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(USER_DIR, 'notifications.ts'))
    })

    test('注释包含 Sprint 37', () => {
      expect(code).toMatch(/Sprint\s*37/)
    })

    test('包含 NotificationHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+NotificationHandler\b/)
    })

    test('包含 NotificationRecord 接口', () => {
      expect(code).toMatch(/export\s+interface\s+NotificationRecord\b/)
    })

    test('包含 NotificationListResult 接口', () => {
      expect(code).toMatch(/export\s+interface\s+NotificationListResult\b/)
    })

    const ACTIONS = ['getNotificationList', 'markNotificationRead', 'markAllNotificationsRead', 'getNotificationDetail']
    ACTIONS.forEach(act => {
      test(`导出 ${act}`, () => {
        expect(code).toMatch(new RegExp(`export\\s+async\\s+function\\s+${act}\\b`))
      })
    })

    test('包含 Runtime shim', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })
  })

  describe('6. referral.ts 类型与 handler（2 个 action）', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(USER_DIR, 'referral.ts'))
    })

    test('注释包含 Sprint 37', () => {
      expect(code).toMatch(/Sprint\s*37/)
    })

    test('包含 ReferralHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+ReferralHandler\b/)
    })

    test('包含 UserRecord 接口', () => {
      expect(code).toMatch(/export\s+interface\s+UserRecord\b/)
    })

    test('包含 InvitedUserView 接口', () => {
      expect(code).toMatch(/export\s+interface\s+InvitedUserView\b/)
    })

    test('包含 sumOrderTotal 函数（强类型化）', () => {
      expect(code).toMatch(/function\s+sumOrderTotal\s*\(\s*orders\s*:\s*OrderLike\s*\[\s*\]\s*\)/)
    })

    const ACTIONS = ['getReferralStats', 'getInvitedUsers']
    ACTIONS.forEach(act => {
      test(`导出 ${act}`, () => {
        expect(code).toMatch(new RegExp(`export\\s+async\\s+function\\s+${act}\\b`))
      })
    })

    test('包含 Runtime shim', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })
  })

  describe('7. addresses.ts 类型与 handler（5 个 action）', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(USER_DIR, 'addresses.ts'))
    })

    test('注释包含 Sprint 37', () => {
      expect(code).toMatch(/Sprint\s*37/)
    })

    test('包含 AddressHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+AddressHandler\b/)
    })

    test('包含 AddressInput / AddressRecord 接口', () => {
      expect(code).toMatch(/export\s+interface\s+AddressInput\b/)
      expect(code).toMatch(/export\s+interface\s+AddressRecord\b/)
    })

    test('包含 filterAddressFields 函数（强类型化）', () => {
      expect(code).toMatch(/function\s+filterAddressFields\s*\(\s*data\s*:\s*AddressInput\s*\)/)
    })

    test('ADDRESS_FIELDS 强类型化（readonly tuple）', () => {
      expect(code).toMatch(/ADDRESS_FIELDS\s*:\s*readonly\s*\(/)
    })

    const ACTIONS = ['list', 'add', 'update', 'remove', 'setDefault']
    ACTIONS.forEach(act => {
      test(`导出 ${act}`, () => {
        expect(code).toMatch(new RegExp(`export\\s+async\\s+function\\s+${act}\\b`))
      })
    })

    test('包含 Runtime shim', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })
  })

  describe('8. 21 个 action 全部强类型化', () => {
    test('auth.ts 强类型化 9 个 action', () => {
      const code = readFileSafe(path.join(USER_DIR, 'auth.ts'))
      expect(code).toMatch(/Sprint\s*37/)
    })

    test('notifications.ts 强类型化 4 个 action', () => {
      const code = readFileSafe(path.join(USER_DIR, 'notifications.ts'))
      expect(code).toMatch(/Sprint\s*37/)
    })

    test('referral.ts 强类型化 2 个 action', () => {
      const code = readFileSafe(path.join(USER_DIR, 'referral.ts'))
      expect(code).toMatch(/Sprint\s*37/)
    })

    test('addresses.ts 强类型化 5 个 action', () => {
      const code = readFileSafe(path.join(USER_DIR, 'addresses.ts'))
      expect(code).toMatch(/Sprint\s*37/)
    })

    test('总数 = 9 + 4 + 2 + 5 = 20', () => {
      expect(9 + 4 + 2 + 5).toBe(20)
    })
  })

  describe('9. package.json 注册', () => {
    let pkg
    beforeAll(() => {
      pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json')))
    })

    test('注册 audit:s37-user-services-ts', () => {
      expect(pkg.scripts['audit:s37-user-services-ts']).toBe(
        'node scripts/audit-s37-user-services-ts.js'
      )
    })

    test('注册 audit:s37-user-services-ts:strict', () => {
      expect(pkg.scripts['audit:s37-user-services-ts:strict']).toBe(
        'node scripts/audit-s37-user-services-ts.js --strict'
      )
    })

    test('ci:check 包含 audit:s37-user-services-ts:strict', () => {
      expect(pkg.scripts['ci:check']).toMatch(/audit:s37-user-services-ts:strict/)
    })
  })

  describe('10. audit 脚本可成功运行', () => {
    test('audit:s37-user-services-ts 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s37-user-services-ts.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本运行失败:\n${msg}`)
      }
    })

    test('audit:s37-user-services-ts:strict 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s37-user-services-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本（strict）运行失败:\n${msg}`)
      }
    })
  })
})
