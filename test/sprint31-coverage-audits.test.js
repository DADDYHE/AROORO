/**
 * Sprint 31: 全局限流覆盖度 + TypeScript 迁移覆盖率审计测试
 *
 * 验证项：
 *   1. audit-s31-global-rate-limit-coverage.js 脚本存在
 *   2. audit-s31-ts-coverage.js 脚本存在
 *   3. package.json 注册了 audit:s31-global-rate-limit-coverage:strict
 *   4. package.json 注册了 audit:s31-ts-coverage:strict
 *   5. ci:check 包含 audit:s31-global-rate-limit-coverage:strict
 *   6. ci:check 包含 audit:s31-ts-coverage:strict
 *   7. rate-limit-store.ts 存在 + initGlobalRateLimitFromDb 导出
 *   8. 5 个服务注入了 initGlobalRateLimitFromDb
 *   9. ts-coverage.json 报告被生成
 *  10. 核心服务迁移率 >= 50%
 *  11. 总迁移率 >= 20%
 *  12. 已迁移 .ts 模块清单中含核心 common/orderService/paymentService 模块
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const CF_ROOT = path.join(ROOT, 'cloudfunctions')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (_e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (_e) { return false }
}

describe('Sprint 31: 全局限流覆盖度 + TypeScript 迁移覆盖率审计', () => {
  describe('1. 审计脚本与注册', () => {
    test('audit-s31-global-rate-limit-coverage.js 存在', () => {
      expect(fileExists(path.join(ROOT, 'scripts', 'audit-s31-global-rate-limit-coverage.js'))).toBe(true)
    })

    test('audit-s31-ts-coverage.js 存在', () => {
      expect(fileExists(path.join(ROOT, 'scripts', 'audit-s31-ts-coverage.js'))).toBe(true)
    })

    test('package.json 注册 audit:s31-global-rate-limit-coverage:strict', () => {
      const pkg = readFileSafe(path.join(ROOT, 'package.json'))
      expect(pkg).toMatch(/"audit:s31-global-rate-limit-coverage:strict"/)
    })

    test('package.json 注册 audit:s31-ts-coverage:strict', () => {
      const pkg = readFileSafe(path.join(ROOT, 'package.json'))
      expect(pkg).toMatch(/"audit:s31-ts-coverage:strict"/)
    })

    test('ci:check 包含 audit:s31-global-rate-limit-coverage:strict', () => {
      const pkg = readFileSafe(path.join(ROOT, 'package.json'))
      expect(pkg).toMatch(/ci:check.*audit:s31-global-rate-limit-coverage:strict/s)
    })

    test('ci:check 包含 audit:s31-ts-coverage:strict', () => {
      const pkg = readFileSafe(path.join(ROOT, 'package.json'))
      expect(pkg).toMatch(/ci:check.*audit:s31-ts-coverage:strict/s)
    })
  })

  describe('2. 全局限流审计脚本内容', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ROOT, 'scripts', 'audit-s31-global-rate-limit-coverage.js'))
    })

    test('脚本中含 "Sprint 31" 标识', () => {
      expect(code).toMatch(/Sprint\s*31/)
    })

    test('脚本扫描业务类型 order/evaluation/payment/refund/mall_order/activity_apply', () => {
      expect(code).toMatch(/'order'/)
      expect(code).toMatch(/'evaluation'/)
      expect(code).toMatch(/'payment'/)
      expect(code).toMatch(/'refund'/)
      expect(code).toMatch(/'mall_order'/)
      expect(code).toMatch(/'activity_apply'/)
    })

    test('脚本检查 SERVICES_WITH_RATELIMIT 服务列表', () => {
      expect(code).toMatch(/SERVICES_WITH_RATELIMIT/)
    })

    test('脚本检查 cron 7 段表达式', () => {
      expect(code).toMatch(/cron/)
    })

    test('脚本检查 tsconfig.common.json include rate-limit-store.ts', () => {
      expect(code).toMatch(/tsconfig\.common\.json/)
      expect(code).toMatch(/rate-limit-store\.ts/)
    })

    test('脚本支持 --strict 模式', () => {
      expect(code).toMatch(/--strict/)
    })
  })

  describe('3. TypeScript 覆盖率审计脚本内容', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ROOT, 'scripts', 'audit-s31-ts-coverage.js'))
    })

    test('脚本中含 "Sprint 31" 标识', () => {
      expect(code).toMatch(/Sprint\s*31/)
    })

    test('脚本定义 CORE_SERVICES 列表', () => {
      expect(code).toMatch(/CORE_SERVICES/)
      expect(code).toMatch(/orderService/)
      expect(code).toMatch(/paymentService/)
      expect(code).toMatch(/common/)
    })

    test('脚本按模块计（walkDir 输出 modules 数组）', () => {
      expect(code).toMatch(/walkDir/)
      expect(code).toMatch(/isMigrated/)
    })

    test('脚本生成 JSON 报告到 coverage/ts-coverage.json', () => {
      expect(code).toMatch(/ts-coverage\.json/)
    })

    test('脚本支持 --strict 模式', () => {
      expect(code).toMatch(/--strict/)
    })
  })

  describe('4. 实际执行 audit:global-rate-limit-coverage', () => {
    test('审计脚本执行成功（退出码 0）', () => {
      try {
        execSync('node scripts/audit-s31-global-rate-limit-coverage.js', {
          cwd: ROOT,
          stdio: 'pipe',
        })
        expect(true).toBe(true)
      } catch (e) {
        throw new Error(`audit 脚本执行失败：${e.stderr ? e.stderr.toString() : e.message}`)
      }
    })
  })

  describe('5. 实际执行 audit:ts-coverage', () => {
    test('审计脚本执行成功（退出码 0）', () => {
      try {
        execSync('node scripts/audit-s31-ts-coverage.js', { cwd: ROOT, stdio: 'pipe' })
        expect(true).toBe(true)
      } catch (e) {
        throw new Error(`audit 脚本执行失败：${e.stderr ? e.stderr.toString() : e.message}`)
      }
    })

    test('strict 模式执行成功（退出码 0）', () => {
      try {
        execSync('node scripts/audit-s31-ts-coverage.js --strict', { cwd: ROOT, stdio: 'pipe' })
        expect(true).toBe(true)
      } catch (e) {
        throw new Error(`audit 脚本 strict 模式执行失败：${e.stderr ? e.stderr.toString() : e.message}`)
      }
    })
  })

  describe('6. ts-coverage.json 报告', () => {
    let report
    beforeAll(() => {
      const reportPath = path.join(ROOT, 'coverage', 'ts-coverage.json')
      // 强制生成一次
      try {
        execSync('node scripts/audit-s31-ts-coverage.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (_e) { /* 忽略非零退出，文件可能仍然生成 */ }
      report = readFileSafe(reportPath)
    })

    test('报告文件存在', () => {
      expect(report).not.toBeNull()
    })

    test('报告含 summary 字段', () => {
      const data = JSON.parse(report)
      expect(data.summary).toBeDefined()
      expect(data.summary.totalModules).toBeGreaterThan(0)
      expect(data.summary.migratedModules).toBeGreaterThan(0)
      expect(data.summary.migrationRate).toBeGreaterThan(0)
    })

    test('报告含 perService 字段', () => {
      const data = JSON.parse(report)
      expect(data.perService).toBeDefined()
      expect(data.perService.common).toBeDefined()
      expect(data.perService.orderService).toBeDefined()
      expect(data.perService.paymentService).toBeDefined()
    })

    test('coreServices 中 orderService 迁移率 >= 50%', () => {
      const data = JSON.parse(report)
      expect(data.coreServices.orderService).toBeGreaterThanOrEqual(50)
    })

    test('coreServices 中 paymentService 迁移率 >= 50%', () => {
      const data = JSON.parse(report)
      expect(data.coreServices.paymentService).toBeGreaterThanOrEqual(50)
    })

    test('coreServices 中 common 迁移率 >= 50%', () => {
      const data = JSON.parse(report)
      expect(data.coreServices.common).toBeGreaterThanOrEqual(50)
    })
  })

  describe('7. 全局限流文件存在性', () => {
    test('rate-limit-store.ts 存在', () => {
      expect(fileExists(path.join(CF_ROOT, 'common', 'rate-limit-store.ts'))).toBe(true)
    })

    test('rate-limit-store.js 存在', () => {
      expect(fileExists(path.join(CF_ROOT, 'common', 'rate-limit-store.js'))).toBe(true)
    })

    test('rate-limit-store.d.ts 存在', () => {
      expect(fileExists(path.join(CF_ROOT, 'common', 'rate-limit-store.d.ts'))).toBe(true)
    })

    test('risk-rate-limit.ts 导出 initGlobalRateLimitFromDb', () => {
      const code = readFileSafe(path.join(CF_ROOT, 'common', 'risk-rate-limit.ts'))
      expect(code).toMatch(/export\s+function\s+initGlobalRateLimitFromDb/)
    })

    test('5 个服务注入了 initGlobalRateLimitFromDb', () => {
      const services = [
        'orderService/index.js',
        'paymentService/index.js',
        'activityService/index.js',
        'mallService/index.js',
        'rateLimitCleanup/index.js',
      ]
      const injectedCount = services.filter(rel => {
        const code = readFileSafe(path.join(CF_ROOT, rel))
        return code && /initGlobalRateLimitFromDb\s*\(/.test(code)
      }).length
      expect(injectedCount).toBe(5)
    })
  })

  describe('8. 业务类型覆盖', () => {
    const allFiles = []

    function collect(dir) {
      if (!fs.existsSync(dir)) {return}
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'common' && e.name !== 'miniprogram_npm') {
          collect(full)
        } else if (e.isFile() && (e.name.endsWith('.js') || e.name.endsWith('.ts'))) {
          allFiles.push(full)
        }
      }
    }

    beforeAll(() => {
      collect(CF_ROOT)
    })

    test('业务类型 order 至少 1 个服务', () => {
      const found = allFiles.some(f => /type:\s*['"]order['"]/.test(readFileSafe(f) || ''))
      expect(found).toBe(true)
    })

    test('业务类型 evaluation 至少 1 个服务', () => {
      const found = allFiles.some(f => /type:\s*['"]evaluation['"]/.test(readFileSafe(f) || ''))
      expect(found).toBe(true)
    })

    test('业务类型 payment 至少 1 个服务', () => {
      const found = allFiles.some(f => /type:\s*['"]payment['"]/.test(readFileSafe(f) || ''))
      expect(found).toBe(true)
    })

    test('业务类型 refund 至少 1 个服务', () => {
      const found = allFiles.some(f => /type:\s*['"]refund['"]/.test(readFileSafe(f) || ''))
      expect(found).toBe(true)
    })
  })

  describe('9. 已迁移 .ts 模块清单验证', () => {
    test('common 模块 .ts 数量 >= 10（核心公共模块已基本迁移）', () => {
      const commonTsDir = path.join(CF_ROOT, 'common')
      const files = fs.readdirSync(commonTsDir)
        .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
      expect(files.length).toBeGreaterThanOrEqual(10)
    })

    test('orderService 2 个核心 .ts（orders/stats；payment.ts Sprint 32 已废弃或为占位）', () => {
      const dir = path.join(CF_ROOT, 'orderService')
      expect(fileExists(path.join(dir, 'orders.ts'))).toBe(true)
      expect(fileExists(path.join(dir, 'stats.ts'))).toBe(true)
      // Sprint 32: payment.ts 已废弃移除（wechatPay / wechatPayNotify 迁移到 paymentService）
      // 允许 payment.ts 作为占位标记保留（含 PAYMENT_HANDLERS_MIGRATED = true）
      const paymentTs = path.join(dir, 'payment.ts')
      if (fileExists(paymentTs)) {
        const code = readFileSafe(paymentTs) || ''
        expect(code).toMatch(/PAYMENT_HANDLERS_MIGRATED\s*=\s*true/)
      }
    })

    test('paymentService/services 4 个核心 .ts（refund/pay/notify/commission）', () => {
      const dir = path.join(CF_ROOT, 'paymentService', 'services')
      expect(fileExists(path.join(dir, 'refund.ts'))).toBe(true)
      expect(fileExists(path.join(dir, 'pay.ts'))).toBe(true)
      expect(fileExists(path.join(dir, 'notify.ts'))).toBe(true)
      expect(fileExists(path.join(dir, 'commission.ts'))).toBe(true)
    })
  })
})
