#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 43: couponService TypeScript 迁移审计脚本
 *
 * 背景：
 *   - Sprint 43 完成 couponService index.ts 入口 TS 化
 *   - 8 个 action 全部强类型化
 *
 * 严格模式额外检查（--strict）：
 *   - tsc --noEmit 10 个服务回归
 *   - .js 构建产物头部含 eslint-disable
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

let failed = 0
const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) { failed++ }
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const COUPON_DIR = path.join(ROOT, 'cloudfunctions', 'couponService')

// 1. 文件存在
const COUPON_TS = path.join(COUPON_DIR, 'index.ts')
check('couponService/index.ts 存在', fs.existsSync(COUPON_TS))

// 2. tsconfig 包含
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.couponService.json'))
let includeCount = 0
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    const required = ['cloudfunctions/couponService/index.ts']
    includeCount = required.filter(r => (cfg.include || []).includes(r)).length
  } catch (e) {
    check('tsconfig.couponService.json 是合法 JSON', false, e.message)
  }
}
check(`tsconfig.couponService.json include 包含 index.ts（${includeCount}/1）`, includeCount === 1)

// 3. build script
const buildScript = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
if (buildScript) {
  const noComment = buildScript.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('build-all-services.js 包含 index.js target',
    /['"]?index\.js['"]?/.test(noComment))
} else {
  check('scripts/build-all-services.js 存在', false)
}

// 4. package.json 注册
const pkg = readSafe(path.join(ROOT, 'package.json'))
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    check('package.json 注册 audit:s43-coupon-service-ts', Boolean(cfg.scripts['audit:s43-coupon-service-ts']))
    check('package.json 注册 audit:s43-coupon-service-ts:strict', Boolean(cfg.scripts['audit:s43-coupon-service-ts:strict']))
    check('package.json ci:check 包含 audit:s43-coupon-service-ts:strict',
      /(?:audit:s43-coupon-service-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}

// 5. couponService/index.ts 内容
const couponTs = readSafe(COUPON_TS)
if (couponTs) {
  check('index.ts 注释包含 Sprint 43', /Sprint\s*43/.test(couponTs))
  check('index.ts 包含 AuthLike 接口', /export\s+interface\s+AuthLike\b/.test(couponTs))
  check('index.ts 包含 CloudEvent 接口', /export\s+interface\s+CloudEvent\b/.test(couponTs))
  check('index.ts 包含 CloudContext 接口', /export\s+interface\s+CloudContext\b/.test(couponTs))
  check('index.ts 包含 CouponActionHandler 类型', /export\s+type\s+CouponActionHandler\b/.test(couponTs))
  check('index.ts 包含 CouponType 联合类型', /export\s+type\s+CouponType\s*=\s*['"]fixed_amount['"]\s*\|\s*['"]full_reduction['"]\s*\|\s*['"]discount['"]/.test(couponTs))
  check('index.ts 包含 CouponStatus 联合类型', /export\s+type\s+CouponStatus\s*=\s*['"]unused['"]\s*\|\s*['"]locked['"]\s*\|\s*['"]used['"]\s*\|\s*['"]expired['"]/.test(couponTs))
  check('index.ts 包含 CouponTemplate 接口', /export\s+interface\s+CouponTemplate\b/.test(couponTs))
  check('index.ts 包含 UserCoupon 接口', /export\s+interface\s+UserCoupon\b/.test(couponTs))
  check('index.ts 包含 CouponUsage 接口', /export\s+interface\s+CouponUsage\b/.test(couponTs))
  check('index.ts 包含 CouponRules 接口', /export\s+interface\s+CouponRules\b/.test(couponTs))
  check('index.ts 包含 generateCouponCode 函数', /export\s+function\s+generateCouponCode\b/.test(couponTs))
  check('index.ts 包含 calculateCouponDiscount 函数', /export\s+function\s+calculateCouponDiscount\b/.test(couponTs))
  check('index.ts 包含 handlers 聚合对象', /export\s+const\s+handlers\s*:\s*Record<string,\s*CouponActionHandler>/.test(couponTs))
  check('index.ts 包含 main 入口函数', /export\s+async\s+function\s+main\b/.test(couponTs))

  const ACTIONS = [
    'getMyCoupons', 'getAvailableCoupons', 'getClaimableTemplates', 'getPopupCoupon',
    'claimCoupon', 'lockCoupon', 'useCoupon', 'unlockCoupon',
  ]
  ACTIONS.forEach(act => {
    check(`index.ts 导出 ${act}`, new RegExp(`export\\s+async\\s+function\\s+${act}\\b`).test(couponTs))
  })
  check('index.ts 包含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(couponTs))
  check('index.ts 包含状态机注释', /unused\s*→\s*locked\s*→\s*used/.test(couponTs))
}

// 6. 测试存在
const migrationTest = path.join(ROOT, 'test', 'coupon-service-ts-migration.test.js')
check('测试 coupon-service-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 严格模式
if (STRICT) {
  const tsConfigs = [
    'tsconfig.couponService.json',
    'tsconfig.hostService.json',
    'tsconfig.feedingService.json',
    'tsconfig.mallService.json',
    'tsconfig.activityService.json',
    'tsconfig.userService.json',
    'tsconfig.partnerService.json',
    'tsconfig.adminService.json',
    'tsconfig.paymentService.json',
    'tsconfig.orderService.json',
  ]
  tsConfigs.forEach(cfg => {
    try {
      execSync(`npx --yes -p typescript@5.4.5 tsc --noEmit -p ${cfg}`, { cwd: ROOT, stdio: 'pipe' })
      check(`tsc --noEmit 严格模式通过（${cfg.replace('tsconfig.', '').replace('.json', '')}）`, true)
    } catch (e) {
      const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
      check(`tsc --noEmit 严格模式通过（${cfg.replace('tsconfig.', '').replace('.json', '')}）`, false, msg)
    }
  })

  const JS_TARGET = path.join(COUPON_DIR, 'index.js')
  const content = readSafe(JS_TARGET)
  if (content) {
    check('cloudfunctions/couponService/index.js 头部含 eslint-disable', content.startsWith('/* eslint-disable'))
  } else {
    check('cloudfunctions/couponService/index.js 存在', false)
  }

  check('couponService 入口存在', fs.existsSync(JS_TARGET))
}

console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
