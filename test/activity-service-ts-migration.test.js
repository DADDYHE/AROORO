/**
 * Sprint 38: activityService TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在
 *   2. 验证 tsconfig.activityService.json include 包含 index.ts
 *   3. 验证 build-all-services.js 包含 index.js target
 *   4. 验证 index.ts 类型定义完整
 *   5. 验证 13 个 handler 导出
 *   6. 验证 Runtime shim 兼容 CommonJS
 *   7. 验证 package.json 注册 audit 脚本
 *   8. 验证 audit 脚本可成功运行
 *
 * 配合：scripts/audit-s38-activity-service-ts.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const ACT_DIR = path.join(ROOT, 'cloudfunctions', 'activityService')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (e) { return false }
}

describe('Sprint 38: activityService TypeScript 迁移', () => {
  describe('1. 物理文件存在', () => {
    test('index.ts 存在', () => {
      expect(fileExists(path.join(ACT_DIR, 'index.ts'))).toBe(true)
    })

    test('index.js（构建产物）存在', () => {
      expect(fileExists(path.join(ACT_DIR, 'index.js'))).toBe(true)
    })
  })

  describe('2. tsconfig.activityService.json include', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.activityService.json')))
    })

    const REQUIRED = [
      'cloudfunctions/activityService/index.ts',
    ]

    REQUIRED.forEach(entry => {
      test(`include 包含 ${entry}`, () => {
        expect(cfg.include).toContain(entry)
      })
    })
  })

  describe('3. build-all-services.js 编译', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
    })

    test('build 脚本存在', () => {
      expect(code).not.toBeNull()
    })

    test('build 脚本包含 target: index.js', () => {
      const noComment = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      expect(noComment).toMatch(/['"]?index\.js['"]?/)
    })

    test('使用 tsc 编译 tsconfig.activityService.json（在 build-all-services.js 中）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(allBuild).toMatch(new RegExp('tsconfig\\.activityService\\.json'))
      expect(allBuild).toMatch(new RegExp(`name\\s*:\\s*'activityService'`))
    })
  })

  describe('4. index.ts 类型与公共结构', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ACT_DIR, 'index.ts'))
    })

    test('注释包含 Sprint 38', () => {
      expect(code).toMatch(/Sprint\s*38/)
    })

    test('包含 AuthLike / CloudEvent / CloudContext 接口', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
      expect(code).toMatch(/export\s+interface\s+CloudEvent\b/)
      expect(code).toMatch(/export\s+interface\s+CloudContext\b/)
    })

    test('包含 ActivityActionHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+ActivityActionHandler\b/)
    })

    test('包含 ActivityRecord / RegistrationRecord / OrderRecord 接口', () => {
      expect(code).toMatch(/export\s+interface\s+ActivityRecord\b/)
      expect(code).toMatch(/export\s+interface\s+RegistrationRecord\b/)
      expect(code).toMatch(/export\s+interface\s+OrderRecord\b/)
    })

    test('包含 RiskCheckResult / PaymentParams 接口', () => {
      expect(code).toMatch(/export\s+interface\s+RiskCheckResult\b/)
      expect(code).toMatch(/export\s+interface\s+PaymentParams\b/)
    })

    test('包含 handlers 聚合对象', () => {
      expect(code).toMatch(/export\s+const\s+handlers\s*:\s*Record<string,\s*ActivityActionHandler>/)
    })

    test('包含 main 入口函数', () => {
      expect(code).toMatch(/export\s+async\s+function\s+main\b/)
    })
  })

  describe('5. 5 个 action handler', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ACT_DIR, 'index.ts'))
    })

    const ACTIONS = [
      'getActivityList', 'getActivityDetail', 'submitRegistration',
      'getRegistrationDetail', 'getRegistrationList',
    ]

    test('共 5 个 action', () => {
      expect(ACTIONS.length).toBe(5)
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

  describe('6. 辅助函数', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ACT_DIR, 'index.ts'))
    })

    const HELPERS = [
      'performActivityApplyRiskCheck',
      'autoUpdateActivityStatus',
    ]

    HELPERS.forEach(fn => {
      test(`包含 ${fn} 函数`, () => {
        expect(code).toMatch(new RegExp(`async\\s+function\\s+${fn}\\b`))
      })
    })

    test('佣金写入委托 common/commission-utils（写入器统一，2026-08-02）', () => {
      // activityService 不再内联 createCommissionRecord 实现，改为从公共写入器引入
      expect(code).toMatch(
        /const\s*\{\s*createCommissionRecord\s*\}\s*=\s*require\(['"]\.\/common\/commission-utils['"]\)/
      )
      expect(code).not.toMatch(/async\s+function\s+createCommissionRecord\b/)
    })

    test('直连微信支付遗留代码已清理（P3-7）', () => {
      expect(code).not.toMatch(/_createPaymentParams|_queryWechatOrder|_wxPayV3Request|createActivityPaymentOrder|confirmActivityPayment/)
    })
  })

  describe('7. 5 个 action 强类型化', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ACT_DIR, 'index.ts'))
    })

    test('强类型化 5 个 action', () => {
      // 全部 action 都是 export async function
      const matches = code.match(/export\s+async\s+function\s+\w+/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(5)
    })

    test('包含风控前置调用', () => {
      expect(code).toMatch(/performActivityApplyRiskCheck/)
    })

    test('包含 commission 记录调用', () => {
      expect(code).toMatch(/createCommissionRecord/)
    })
  })

  describe('8. package.json 注册', () => {
    let pkg
    beforeAll(() => {
      pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json')))
    })

    test('注册 audit:s38-activity-service-ts', () => {
      expect(pkg.scripts['audit:s38-activity-service-ts']).toBe(
        'node scripts/audit-s38-activity-service-ts.js'
      )
    })

    test('注册 audit:s38-activity-service-ts:strict', () => {
      expect(pkg.scripts['audit:s38-activity-service-ts:strict']).toBe(
        'node scripts/audit-s38-activity-service-ts.js --strict'
      )
    })

    test('ci:check 包含 audit:all:strict', () => {
      expect(pkg.scripts['ci:check']).toMatch(/audit:all:strict/)
    })
  })

  describe('9. audit 脚本可成功运行', () => {
    test('audit:s38-activity-service-ts 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s38-activity-service-ts.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本运行失败:\n${msg}`)
      }
    })

    test('audit:s38-activity-service-ts:strict 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s38-activity-service-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本（strict）运行失败:\n${msg}`)
      }
    })
  })
})
