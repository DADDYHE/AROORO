/**
 * Sprint 36: partnerService/services/* TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 3 个 services/*.ts 源文件存在
 *   2. 验证 application.ts 修复了 pre-existing 路径错误
 *   3. 验证 tsconfig.partnerService.json include 包含全部 4 个文件
 *   4. 验证 build-all-services.js 包含全部 4 个 target
 *   5. 验证各 .ts 文件类型定义完整
 *   6. 验证各 .ts 文件 handler 导出
 *   7. 验证 Runtime shim 兼容 CommonJS
 *   8. 验证 package.json 注册 audit 脚本
 *   9. 验证 audit 脚本可成功运行
 *
 * 配合：scripts/audit-s36-partner-services-ts.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const PARTNER_DIR = path.join(ROOT, 'cloudfunctions', 'partnerService')
const SERVICES_DIR = path.join(PARTNER_DIR, 'services')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (e) { return false }
}

describe('Sprint 36: partnerService services TypeScript 迁移', () => {
  describe('1. 物理文件存在', () => {
    test('services/application.ts 存在', () => {
      expect(fileExists(path.join(SERVICES_DIR, 'application.ts'))).toBe(true)
    })

    test('services/referral.ts 存在', () => {
      expect(fileExists(path.join(SERVICES_DIR, 'referral.ts'))).toBe(true)
    })

    test('services/wallet.ts 存在', () => {
      expect(fileExists(path.join(SERVICES_DIR, 'wallet.ts'))).toBe(true)
    })

    test('services/application.js（构建产物）存在', () => {
      expect(fileExists(path.join(SERVICES_DIR, 'application.js'))).toBe(true)
    })

    test('services/referral.js（构建产物）存在', () => {
      expect(fileExists(path.join(SERVICES_DIR, 'referral.js'))).toBe(true)
    })

    test('services/wallet.js（构建产物）存在', () => {
      expect(fileExists(path.join(SERVICES_DIR, 'wallet.js'))).toBe(true)
    })
  })

  describe('2. application.ts 修复 pre-existing 路径错误', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(SERVICES_DIR, 'application.ts'))
    })

    test('application.ts 存在', () => {
      expect(code).not.toBeNull()
    })

    test('使用正确的相对路径 require(\'../common/errors\')', () => {
      expect(code).toMatch(/require\(['"]\.\.\/common\/errors['"]\)/)
    })

    test('已修复错误的相对路径（无 require(\'./common/errors\')）', () => {
      expect(code).not.toMatch(/require\(['"]\.\/common\/errors['"]\)/)
    })
  })

  describe('3. tsconfig.partnerService.json include', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.partnerService.json')))
    })

    const REQUIRED = [
      'cloudfunctions/partnerService/index.ts',
      'cloudfunctions/partnerService/services/application.ts',
      'cloudfunctions/partnerService/services/referral.ts',
      'cloudfunctions/partnerService/services/wallet.ts',
    ]

    REQUIRED.forEach(entry => {
      test(`include 包含 ${entry}`, () => {
        expect(cfg.include).toContain(entry)
      })
    })
  })

  describe('4. build-all-services.js 编译多文件', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
    })

    const REQUIRED_TARGETS = ['index.js', 'application.js', 'referral.js', 'wallet.js']

    test('build 脚本存在', () => {
      expect(code).not.toBeNull()
    })

    test('build-all-services.js 包含全部 4 个 target（index.js / application.js / referral.js / wallet.js）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      for (const target of REQUIRED_TARGETS) {
        expect(allBuild).toMatch(new RegExp(target.replace(/\./g, '\\.')))
      }
    })

    test('使用 tsc 编译 tsconfig.partnerService.json（在 build-all-services.js 中）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(allBuild).toMatch(new RegExp('tsconfig\\.partnerService\\.json'))
      expect(allBuild).toMatch(new RegExp(`name\\s*:\\s*'partnerService'`))
    })
  })

  describe('5. application.ts 类型与 handler', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(SERVICES_DIR, 'application.ts'))
    })

    test('注释包含 Sprint 36', () => {
      expect(code).toMatch(/Sprint\s*36/)
    })

    test('包含 ApplicationRecord 接口', () => {
      expect(code).toMatch(/export\s+interface\s+ApplicationRecord\b/)
    })

    test('包含 AdminRecord 接口', () => {
      expect(code).toMatch(/export\s+interface\s+AdminRecord\b/)
    })

    test('包含 SubmitApplicationEvent 接口', () => {
      expect(code).toMatch(/export\s+interface\s+SubmitApplicationEvent\b/)
    })

    test('包含 ApplicationHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+ApplicationHandler\b/)
    })

    test('导出 submitApplication', () => {
      expect(code).toMatch(/export\s+async\s+function\s+submitApplication\b/)
    })

    test('导出 getApplicationStatus', () => {
      expect(code).toMatch(/export\s+async\s+function\s+getApplicationStatus\b/)
    })

    test('导出 getMyPermissions', () => {
      expect(code).toMatch(/export\s+async\s+function\s+getMyPermissions\b/)
    })

    test('包含 Runtime shim', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })

    test('使用 Partial<AdminRecord> 处理 db 查询失败情况', () => {
      expect(code).toMatch(/Partial<AdminRecord>/)
    })
  })

  describe('6. referral.ts 类型与 handler', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(SERVICES_DIR, 'referral.ts'))
    })

    test('注释包含 Sprint 36', () => {
      expect(code).toMatch(/Sprint\s*36/)
    })

    test('包含 ReferralHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+ReferralHandler\b/)
    })

    test('包含 InvitedUser 接口', () => {
      expect(code).toMatch(/export\s+interface\s+InvitedUser\b/)
    })

    test('包含 CommissionItem 接口', () => {
      expect(code).toMatch(/export\s+interface\s+CommissionItem\b/)
    })

    test('包含 countAndSum 函数（强类型化）', () => {
      expect(code).toMatch(/function\s+countAndSum\s*\(\s*res\s*:\s*DbQueryResult\s*\)/)
    })

    const ACTIONS = ['getReferralStats', 'getMyInvitedUsers', 'getReferralOrders', 'getReferralOrderStats']
    ACTIONS.forEach(act => {
      test(`导出 ${act}`, () => {
        expect(code).toMatch(new RegExp(`export\\s+async\\s+function\\s+${act}\\b`))
      })
    })
  })

  describe('7. wallet.ts 类型与 handler', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(SERVICES_DIR, 'wallet.ts'))
    })

    test('注释包含 Sprint 36', () => {
      expect(code).toMatch(/Sprint\s*36/)
    })

    test('包含 WalletRecord 接口', () => {
      expect(code).toMatch(/export\s+interface\s+WalletRecord\b/)
    })

    test('包含 CommissionItem 接口', () => {
      expect(code).toMatch(/export\s+interface\s+CommissionItem\b/)
    })

    test('包含 OrderAggregate 接口', () => {
      expect(code).toMatch(/export\s+interface\s+OrderAggregate\b/)
    })

    test('包含 IncomeOverview 接口', () => {
      expect(code).toMatch(/export\s+interface\s+IncomeOverview\b/)
    })

    test('包含 IncomeDetailItem 接口', () => {
      expect(code).toMatch(/export\s+interface\s+IncomeDetailItem\b/)
    })

    test('包含 WalletHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+WalletHandler\b/)
    })

    test('包含 sumOrders 函数', () => {
      expect(code).toMatch(/function\s+sumOrders\s*\(/)
    })

    test('包含 sumCommissions 函数', () => {
      expect(code).toMatch(/function\s+sumCommissions\s*\(/)
    })

    const ACTIONS = ['getMyIncomeOverview', 'getMyIncomeDetails', 'getMyWallet', 'getMyWithdrawals', 'requestWithdrawal']
    ACTIONS.forEach(act => {
      test(`导出 ${act}`, () => {
        expect(code).toMatch(new RegExp(`export\\s+async\\s+function\\s+${act}\\b`))
      })
    })

    test('包含 Runtime shim', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })
  })

  describe('8. 12 个 action 全部强类型化', () => {
    const ALL_ACTIONS = [
      // application
      'submitApplication', 'getApplicationStatus', 'getMyPermissions',
      // referral
      'getReferralStats', 'getMyInvitedUsers', 'getReferralOrders', 'getReferralOrderStats',
      // wallet
      'getMyIncomeOverview', 'getMyIncomeDetails', 'getMyWallet', 'getMyWithdrawals', 'requestWithdrawal',
    ]

    test('共 12 个 action', () => {
      expect(ALL_ACTIONS.length).toBe(12)
    })

    const services = ['application', 'referral', 'wallet']
    services.forEach(svc => {
      test(`${svc}.ts 强类型化（注释包含 Sprint 36）`, () => {
        const code = readFileSafe(path.join(SERVICES_DIR, `${svc}.ts`))
        expect(code).toMatch(/Sprint\s*36/)
      })
    })
  })

  describe('9. package.json 注册', () => {
    let pkg
    beforeAll(() => {
      pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json')))
    })

    test('注册 audit:s36-partner-services-ts', () => {
      expect(pkg.scripts['audit:s36-partner-services-ts']).toBe(
        'node scripts/audit-s36-partner-services-ts.js'
      )
    })

    test('注册 audit:s36-partner-services-ts:strict', () => {
      expect(pkg.scripts['audit:s36-partner-services-ts:strict']).toBe(
        'node scripts/audit-s36-partner-services-ts.js --strict'
      )
    })

    test('ci:check 包含 audit:s36-partner-services-ts:strict', () => {
      expect(pkg.scripts['ci:check']).toMatch(/audit:s36-partner-services-ts:strict/)
    })
  })

  describe('10. audit 脚本可成功运行', () => {
    test('audit:s36-partner-services-ts 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s36-partner-services-ts.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本运行失败:\n${msg}`)
      }
    })

    test('audit:s36-partner-services-ts:strict 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s36-partner-services-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本（strict）运行失败:\n${msg}`)
      }
    })
  })
})
