/**
 * Sprint 41: feedingService TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在
 *   2. 验证 tsconfig.feedingService.json include 包含 index.ts
 *   3. 验证 build-all-services.js 包含 index.js target
 *   4. 验证 index.ts 类型定义完整
 *   5. 验证 12 个 handler 导出
 *   6. 验证 Runtime shim 兼容 CommonJS
 *   7. 验证 package.json 注册 audit 脚本
 *   8. 验证 audit 脚本可成功运行
 *
 * 配合：scripts/audit-s41-feeding-service-ts.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const FEEDING_DIR = path.join(ROOT, 'cloudfunctions', 'feedingService')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (e) { return false }
}

describe('Sprint 41: feedingService TypeScript 迁移', () => {
  describe('1. 物理文件存在', () => {
    test('index.ts 存在', () => {
      expect(fileExists(path.join(FEEDING_DIR, 'index.ts'))).toBe(true)
    })

    test('index.js（构建产物）存在', () => {
      expect(fileExists(path.join(FEEDING_DIR, 'index.js'))).toBe(true)
    })
  })

  describe('2. tsconfig.feedingService.json include', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.feedingService.json')))
    })

    test('include 包含 cloudfunctions/feedingService/index.ts', () => {
      expect(cfg.include).toContain('cloudfunctions/feedingService/index.ts')
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

    test('使用 tsc 编译 tsconfig.feedingService.json（在 build-all-services.js 中）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(allBuild).toMatch(new RegExp('tsconfig\\.feedingService\\.json'))
      expect(allBuild).toMatch(new RegExp(`name\\s*:\\s*'feedingService'`))
    })
  })

  describe('4. index.ts 类型与公共结构', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(FEEDING_DIR, 'index.ts'))
    })

    test('注释包含 Sprint 41', () => {
      expect(code).toMatch(/Sprint\s*41/)
    })

    test('包含 AuthLike / CloudEvent / CloudContext 接口', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
      expect(code).toMatch(/export\s+interface\s+CloudEvent\b/)
      expect(code).toMatch(/export\s+interface\s+CloudContext\b/)
    })

    test('包含 FeedingActionHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+FeedingActionHandler\b/)
    })

    test('包含 FeederRecord / FeedingOrderRecord 接口', () => {
      expect(code).toMatch(/export\s+interface\s+FeederRecord\b/)
      expect(code).toMatch(/export\s+interface\s+FeedingOrderRecord\b/)
    })

    test('包含 handlers 聚合对象', () => {
      expect(code).toMatch(/export\s+const\s+handlers\s*:\s*Record<string,\s*FeedingActionHandler>/)
    })

    test('包含 main 入口函数', () => {
      expect(code).toMatch(/export\s+async\s+function\s+main\b/)
    })
  })

  describe('5. 12 个 action handler', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(FEEDING_DIR, 'index.ts'))
    })

    const ACTIONS = [
      'getFeederList', 'getFeederDetail', 'createFeederProfile', 'updateFeederProfile',
      'createFeedingOrder', 'getFeedingOrders', 'updateFeedingOrderStatus',
      'getOrderStatus', 'getFeederOrders', 'getFeedingOrderDetail',
      'handleFeedingOrder', 'getCurrentFeeder',
    ]

    test('共 12 个 action', () => {
      expect(ACTIONS.length).toBe(12)
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
      code = readFileSafe(path.join(FEEDING_DIR, 'index.ts'))
    })

    const HELPERS = [
      'createCommissionRecord',
      'checkPartnerPermission',
      'refreshPetAvatars',
    ]

    HELPERS.forEach(fn => {
      test(`包含 ${fn} 函数`, () => {
        expect(code).toMatch(new RegExp(`async\\s+function\\s+${fn}\\b`))
      })
    })
  })

  describe('7. 12 个 action 强类型化', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(FEEDING_DIR, 'index.ts'))
    })

    test('强类型化 12 个 action', () => {
      const matches = code.match(/export\s+async\s+function\s+\w+/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(12)
    })

    test('包含状态流转校验', () => {
      expect(code).toMatch(/TRANSITIONS/)
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

    test('注册 audit:s41-feeding-service-ts', () => {
      expect(pkg.scripts['audit:s41-feeding-service-ts']).toBe(
        'node scripts/audit-s41-feeding-service-ts.js'
      )
    })

    test('注册 audit:s41-feeding-service-ts:strict', () => {
      expect(pkg.scripts['audit:s41-feeding-service-ts:strict']).toBe(
        'node scripts/audit-s41-feeding-service-ts.js --strict'
      )
    })

    test('ci:check 包含 audit:s41-feeding-service-ts:strict', () => {
      expect(pkg.scripts['ci:check']).toMatch(/audit:s41-feeding-service-ts:strict/)
    })
  })

  describe('9. audit 脚本可成功运行', () => {
    test('audit:s41-feeding-service-ts 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s41-feeding-service-ts.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本运行失败:\n${msg}`)
      }
    })

    test('audit:s41-feeding-service-ts:strict 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s41-feeding-service-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本（strict）运行失败:\n${msg}`)
      }
    })
  })
})
