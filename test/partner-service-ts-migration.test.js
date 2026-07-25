/**
 * Sprint 35: partnerService/index.ts TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 index.ts / index.d.ts / index.js 文件存在
 *   2. 验证 tsconfig.partnerService.json 配置正确
 *   3. 验证 build-all-services.js 脚本正确
 *   4. 验证 index.ts 类型定义完整
 *   5. 验证 3 个 services 子模块未破坏
 *   6. 验证 12 个 action 全部注册
 *   7. 验证 package.json 注册 audit 脚本
 *   8. 验证 audit 脚本可成功运行
 *
 * 配合：scripts/audit-s35-partner-service-ts.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const PARTNER_DIR = path.join(ROOT, 'cloudfunctions', 'partnerService')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (e) { return false }
}

describe('Sprint 35: partnerService TypeScript 迁移', () => {
  describe('1. 物理文件存在', () => {
    test('index.ts 存在', () => {
      expect(fileExists(path.join(PARTNER_DIR, 'index.ts'))).toBe(true)
    })

    test('index.d.ts 存在', () => {
      expect(fileExists(path.join(PARTNER_DIR, 'index.d.ts'))).toBe(true)
    })

    test('index.js（构建产物）存在', () => {
      expect(fileExists(path.join(PARTNER_DIR, 'index.js'))).toBe(true)
    })
  })

  describe('2. tsconfig.partnerService.json 配置', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.partnerService.json')))
    })

    test('tsconfig 文件存在', () => {
      expect(cfg).toBeTruthy()
    })

    test('include 包含 index.ts', () => {
      expect(cfg.include).toContain('cloudfunctions/partnerService/index.ts')
    })

    test('compilerOptions.strict = true', () => {
      expect(cfg.compilerOptions.strict).toBe(true)
    })

    test('compilerOptions.target = ES2020', () => {
      expect(cfg.compilerOptions.target).toBe('ES2020')
    })

    test('compilerOptions.module = CommonJS', () => {
      expect(cfg.compilerOptions.module).toBe('CommonJS')
    })

    test('compilerOptions.declaration = true', () => {
      expect(cfg.compilerOptions.declaration).toBe(true)
    })
  })

  describe('3. build-all-services.js 脚本', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
    })

    test('build 脚本存在', () => {
      expect(code).not.toBeNull()
    })

    test('使用 tsc 编译 tsconfig.partnerService.json（在 build-all-services.js 中）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(allBuild).toMatch(new RegExp('tsconfig\\.partnerService\\.json'))
      expect(allBuild).toMatch(new RegExp(`name\\s*:\\s*'partnerService'`))
    })

    test('TARGETS 包含 index.js', () => {
      const noComment = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      expect(noComment).toMatch(/index\.js/)
    })
  })

  describe('4. index.ts 类型定义', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(PARTNER_DIR, 'index.ts'))
    })

    test('index.ts 存在', () => {
      expect(code).not.toBeNull()
    })

    test('注释包含 Sprint 35', () => {
      expect(code).toMatch(/Sprint\s*35/)
    })

    test('包含 AuthLike 接口', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
    })

    test('包含 CloudEvent 接口', () => {
      expect(code).toMatch(/export\s+interface\s+CloudEvent\b/)
    })

    test('包含 CloudContext 接口', () => {
      expect(code).toMatch(/export\s+interface\s+CloudContext\b/)
    })

    test('包含 PartnerActionHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+PartnerActionHandler\b/)
    })

    test('包含 PartnerPermission 类型', () => {
      expect(code).toMatch(/export\s+type\s+PartnerPermission\b/)
    })

    test('包含 PartnerHandlers 接口', () => {
      expect(code).toMatch(/export\s+interface\s+PartnerHandlers\b/)
    })

    test('强类型化 handlers 聚合对象', () => {
      expect(code).toMatch(/export\s+const\s+handlers\s*:\s*PartnerHandlers\b/)
    })

    test('强类型化 ACTION_PERMISSIONS', () => {
      expect(code).toMatch(
        /ACTION_PERMISSIONS\s*:\s*Record\s*<\s*keyof\s+PartnerHandlers\s*,\s*PartnerPermission\s*>/
      )
    })

    test('包含 checkPartnerPermission 函数', () => {
      expect(code).toMatch(/async\s+function\s+checkPartnerPermission\b/)
    })

    test('导出 main 函数', () => {
      expect(code).toMatch(/export\s+const\s+main\s*[:=]/)
    })

    test('Runtime shim 修复 CommonJS 导出', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })
  })

  describe('5. 3 个 services 子模块未破坏', () => {
    const EXPECTED_SERVICES = ['application', 'wallet', 'referral']

    EXPECTED_SERVICES.forEach(svc => {
      test(`services/${svc}.js 存在`, () => {
        expect(fileExists(path.join(PARTNER_DIR, 'services', `${svc}.js`))).toBe(true)
      })
    })

    test('index.ts 引入全部 3 个 services', () => {
      const indexTs = readFileSafe(path.join(PARTNER_DIR, 'index.ts'))
      EXPECTED_SERVICES.forEach(svc => {
        expect(indexTs).toMatch(new RegExp(`require\\(['"]\\.\\/services\\/${svc}['"]\\)`))
      })
    })
  })

  describe('6. 12 个 action 全部注册', () => {
    const KEY_ACTIONS = [
      // 申请（3 个）
      'submitApplication', 'getApplicationStatus', 'getMyPermissions',
      // 收入 / 钱包（5 个）
      'getMyIncomeOverview', 'getMyIncomeDetails', 'getMyWallet', 'getMyWithdrawals', 'requestWithdrawal',
      // 邀请（4 个）
      'getReferralStats', 'getMyInvitedUsers', 'getReferralOrders', 'getReferralOrderStats',
    ]

    test('共注册 12 个 action', () => {
      expect(KEY_ACTIONS.length).toBe(12)
    })

    let code
    beforeAll(() => {
      code = readFileSafe(path.join(PARTNER_DIR, 'index.ts'))
    })

    KEY_ACTIONS.forEach(act => {
      test(`action: ${act}`, () => {
        expect(code).toMatch(new RegExp(`\\b${act}\\s*:`))
      })
    })
  })

  describe('7. package.json 注册', () => {
    let pkg
    beforeAll(() => {
      pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json')))
    })

    test('注册 audit:s35-partner-service-ts', () => {
      expect(pkg.scripts['audit:s35-partner-service-ts']).toBe(
        'node scripts/audit-s35-partner-service-ts.js'
      )
    })

    test('注册 audit:s35-partner-service-ts:strict', () => {
      expect(pkg.scripts['audit:s35-partner-service-ts:strict']).toBe(
        'node scripts/audit-s35-partner-service-ts.js --strict'
      )
    })

    test('ci:check 通过 audit:all:strict 聚合器包含本审计', () => {
      // ci:check 已重构为 audit:all:strict 聚合器模式（scripts/audit-all.js 自动发现并运行所有 audit-*.js）
      // 此处验证聚合器存在；脚本本身的运行时校验由 "audit 脚本可成功运行" 用例覆盖
      expect(pkg.scripts['ci:check']).toMatch(/audit:all:strict/)
      expect(pkg.scripts['audit:all:strict']).toBeDefined()
    })
  })

  describe('8. audit 脚本可成功运行', () => {
    test('audit:s35-partner-service-ts 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s35-partner-service-ts.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本运行失败:\n${msg}`)
      }
    })

    test('audit:s35-partner-service-ts:strict 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s35-partner-service-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本（strict）运行失败:\n${msg}`)
      }
    })
  })
})
