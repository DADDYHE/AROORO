/**
 * Sprint 43: couponService TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在
 *   2. 验证 tsconfig.couponService.json include 包含 index.ts
 *   3. 验证 build-all-services.js 包含 index.js target
 *   4. 验证 index.ts 类型定义完整（含优惠券类型 / 状态 / 规则）
 *   5. 验证 8 个 handler 导出
 *   6. 验证 Runtime shim 兼容 CommonJS
 *   7. 验证 2 个辅助函数（generateCouponCode / calculateCouponDiscount）
 *   8. 验证 package.json 注册 audit 脚本
 *   9. 验证 audit 脚本可成功运行
 *
 * 配合：scripts/audit-s43-coupon-service-ts.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const COUPON_DIR = path.join(ROOT, 'cloudfunctions', 'couponService')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (e) { return false }
}

describe('Sprint 43: couponService TypeScript 迁移', () => {
  describe('1. 物理文件存在', () => {
    test('index.ts 存在', () => {
      expect(fileExists(path.join(COUPON_DIR, 'index.ts'))).toBe(true)
    })

    test('index.js（构建产物）存在', () => {
      expect(fileExists(path.join(COUPON_DIR, 'index.js'))).toBe(true)
    })
  })

  describe('2. tsconfig.couponService.json include', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.couponService.json')))
    })

    test('include 包含 cloudfunctions/couponService/index.ts', () => {
      expect(cfg.include).toContain('cloudfunctions/couponService/index.ts')
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

    test('使用 tsc 编译 tsconfig.couponService.json（在 build-all-services.js 中）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(allBuild).toMatch(new RegExp('tsconfig\\.couponService\\.json'))
      expect(allBuild).toMatch(new RegExp(`name\\s*:\\s*'couponService'`))
    })
  })

  describe('4. index.ts 类型与公共结构', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(COUPON_DIR, 'index.ts'))
    })

    test('注释包含 Sprint 43', () => {
      expect(code).toMatch(/Sprint\s*43/)
    })

    test('包含 AuthLike / CloudEvent / CloudContext 接口', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
      expect(code).toMatch(/export\s+interface\s+CloudEvent\b/)
      expect(code).toMatch(/export\s+interface\s+CloudContext\b/)
    })

    test('包含 CouponActionHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+CouponActionHandler\b/)
    })

    test('包含 CouponTemplate / UserCoupon / CouponUsage 接口', () => {
      expect(code).toMatch(/export\s+interface\s+CouponTemplate\b/)
      expect(code).toMatch(/export\s+interface\s+UserCoupon\b/)
      expect(code).toMatch(/export\s+interface\s+CouponUsage\b/)
    })

    test('包含 handlers 聚合对象', () => {
      expect(code).toMatch(/export\s+const\s+handlers\s*:\s*Record<string,\s*CouponActionHandler>/)
    })

    test('包含 main 入口函数', () => {
      expect(code).toMatch(/export\s+async\s+function\s+main\b/)
    })
  })

  describe('5. 优惠券类型 / 状态联合类型', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(COUPON_DIR, 'index.ts'))
    })

    test('包含 CouponType 联合类型（fixed_amount / full_reduction / discount）', () => {
      expect(code).toMatch(/export\s+type\s+CouponType\s*=\s*['"]fixed_amount['"]\s*\|\s*['"]full_reduction['"]\s*\|\s*['"]discount['"]/)
    })

    test('包含 CouponStatus 联合类型（unused / locked / used / expired）', () => {
      expect(code).toMatch(/export\s+type\s+CouponStatus\s*=\s*['"]unused['"]\s*\|\s*['"]locked['"]\s*\|\s*['"]used['"]\s*\|\s*['"]expired['"]/)
    })

    test('包含 CouponSource 联合类型', () => {
      expect(code).toMatch(/export\s+type\s+CouponSource\s*=\s*['"]claim['"]\s*\|\s*['"]popup['"]\s*\|\s*['"]system['"]\s*\|\s*['"]manual['"]/)
    })

    test('包含 CouponRules 接口（含 threshold / reduceAmount / discountRate / maxReduceAmount）', () => {
      expect(code).toMatch(/export\s+interface\s+CouponRules\b/)
      expect(code).toMatch(/threshold\?:\s*number/)
      expect(code).toMatch(/reduceAmount\?:\s*number/)
      expect(code).toMatch(/discountRate\?:\s*number/)
      expect(code).toMatch(/maxReduceAmount\?:\s*number/)
    })
  })

  describe('6. 8 个 action handler', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(COUPON_DIR, 'index.ts'))
    })

    const ACTIONS = [
      'getMyCoupons', 'getAvailableCoupons', 'getClaimableTemplates', 'getPopupCoupon',
      'claimCoupon', 'lockCoupon', 'useCoupon', 'unlockCoupon',
    ]

    test('共 8 个 action', () => {
      expect(ACTIONS.length).toBe(8)
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

  describe('7. 辅助函数', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(COUPON_DIR, 'index.ts'))
    })

    test('包含 generateCouponCode 函数（CP + 36 进制时间戳 + 随机数）', () => {
      expect(code).toMatch(/export\s+function\s+generateCouponCode\b/)
      expect(code).toMatch(/'CP'/)
      expect(code).toMatch(/Date\.now\(\)\.toString\(36\)/)
    })

    test('包含 calculateCouponDiscount 函数（支持 3 种优惠券类型）', () => {
      expect(code).toMatch(/export\s+function\s+calculateCouponDiscount\b/)
      expect(code).toMatch(/'fixed_amount'/)
      expect(code).toMatch(/'full_reduction'/)
      expect(code).toMatch(/'discount'/)
    })

    test('calculateCouponDiscount 返回 DiscountCalcResult 类型', () => {
      expect(code).toMatch(/export\s+interface\s+DiscountCalcResult\b/)
      expect(code).toMatch(/eligible:\s*boolean/)
      expect(code).toMatch(/discountAmount\?:\s*number/)
      expect(code).toMatch(/message\?:\s*string/)
    })
  })

  describe('8. 8 个 action 强类型化', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(COUPON_DIR, 'index.ts'))
    })

    test('强类型化 8 个 action', () => {
      const matches = code.match(/export\s+async\s+function\s+\w+/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(8)
    })

    test('包含状态机注释（unused → locked → used）', () => {
      expect(code).toMatch(/unused\s*→\s*locked\s*→\s*used/)
    })

    test('claimCoupon 实现 perUserLimit 校验', () => {
      expect(code).toMatch(/perUserLimit/)
    })

    test('useCoupon 写入 coupon_usage 集合', () => {
      expect(code).toMatch(/coupon_usage/)
    })

    test('unlockCoupon 处理过期逻辑', () => {
      expect(code).toMatch(/isExpired/)
    })
  })

  describe('9. 集合操作', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(COUPON_DIR, 'index.ts'))
    })

    test('使用 user_coupons 集合', () => {
      expect(code).toMatch(/user_coupons/)
    })

    test('使用 coupon_templates 集合', () => {
      expect(code).toMatch(/coupon_templates/)
    })

    test('使用 coupon_usage 集合', () => {
      expect(code).toMatch(/coupon_usage/)
    })

    test('使用 operation_logs 集合（领取/锁定/核销/解锁 4 个日志点）', () => {
      const matches = code.match(/operation_logs/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('10. package.json 注册', () => {
    let pkg
    beforeAll(() => {
      pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json')))
    })

    test('注册 audit:s43-coupon-service-ts', () => {
      expect(pkg.scripts['audit:s43-coupon-service-ts']).toBe(
        'node scripts/audit-s43-coupon-service-ts.js'
      )
    })

    test('注册 audit:s43-coupon-service-ts:strict', () => {
      expect(pkg.scripts['audit:s43-coupon-service-ts:strict']).toBe(
        'node scripts/audit-s43-coupon-service-ts.js --strict'
      )
    })

    test('ci:check 包含 audit:s43-coupon-service-ts:strict', () => {
      expect(pkg.scripts['ci:check']).toMatch(/audit:s43-coupon-service-ts:strict/)
    })
  })

  describe('11. audit 脚本可成功运行', () => {
    test('audit:s43-coupon-service-ts 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s43-coupon-service-ts.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本运行失败:\n${msg}`)
      }
    })

    test('audit:s43-coupon-service-ts:strict 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s43-coupon-service-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本（strict）运行失败:\n${msg}`)
      }
    })
  })
})
