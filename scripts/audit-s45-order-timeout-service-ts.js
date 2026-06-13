#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 45: orderTimeoutService TypeScript 迁移审计脚本
 *
 * 背景：
 *   - Sprint 45 完成 orderTimeoutService index.ts 入口 TS 化
 *   - 5 类订单超时处理 + 7 个辅助函数全部强类型化
 *
 * 严格模式额外检查（--strict）：
 *   - tsc --noEmit 12 个服务回归
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

const TS_DIR = path.join(ROOT, 'cloudfunctions', 'orderTimeoutService')

// 1. 文件存在
const TS_FILE = path.join(TS_DIR, 'index.ts')
check('orderTimeoutService/index.ts 存在', fs.existsSync(TS_FILE))

// 2. tsconfig 包含
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.orderTimeoutService.json'))
let includeCount = 0
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    const required = ['cloudfunctions/orderTimeoutService/index.ts']
    includeCount = required.filter(r => (cfg.include || []).includes(r)).length
  } catch (e) {
    check('tsconfig.orderTimeoutService.json 是合法 JSON', false, e.message)
  }
}
check(`tsconfig.orderTimeoutService.json include 包含 index.ts（${includeCount}/1）`, includeCount === 1)

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
    check('package.json 注册 audit:s45-order-timeout-service-ts', Boolean(cfg.scripts['audit:s45-order-timeout-service-ts']))
    check('package.json 注册 audit:s45-order-timeout-service-ts:strict', Boolean(cfg.scripts['audit:s45-order-timeout-service-ts:strict']))
    check('package.json ci:check 包含 audit:s45-order-timeout-service-ts:strict',
      /(?:audit:s45-order-timeout-service-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}

// 5. orderTimeoutService/index.ts 内容
const tsCode = readSafe(TS_FILE)
if (tsCode) {
  check('index.ts 注释包含 Sprint 45', /Sprint\s*45/.test(tsCode))
  check('index.ts 包含 AuthLike 接口', /export\s+interface\s+AuthLike\b/.test(tsCode))
  check('index.ts 包含 CloudEvent 接口', /export\s+interface\s+CloudEvent\b/.test(tsCode))
  check('index.ts 包含 CloudContext 接口', /export\s+interface\s+CloudContext\b/.test(tsCode))

  // 联合类型
  check('index.ts 包含 OrderBusinessLine 联合类型（5 类）',
    /export\s+type\s+OrderBusinessLine[\s\S]*?['"]boarding['"][\s\S]*?['"]feeding['"][\s\S]*?['"]mall['"][\s\S]*?['"]group_buy['"][\s\S]*?['"]activity['"]/.test(tsCode))
  check('index.ts 包含 OrderStatus 联合类型', /export\s+type\s+OrderStatus\b/.test(tsCode))
  check('index.ts 包含 OrderType 联合类型', /export\s+type\s+OrderType\b/.test(tsCode))

  // 业务接口
  check('index.ts 包含 OrderDoc 接口', /export\s+interface\s+OrderDoc\b/.test(tsCode))
  check('index.ts 包含 FeedingOrderDoc 接口', /export\s+interface\s+FeedingOrderDoc\b/.test(tsCode))
  check('index.ts 包含 ActivityRegistrationDoc 接口', /export\s+interface\s+ActivityRegistrationDoc\b/.test(tsCode))
  check('index.ts 包含 TimeoutResult 接口', /export\s+interface\s+TimeoutResult\b/.test(tsCode))
  check('index.ts 包含 WechatPayConfig 接口', /export\s+interface\s+WechatPayConfig\b/.test(tsCode))

  // 7 个常量
  check('index.ts 包含 ORDER_TIMEOUT_MINUTES=30', /export\s+const\s+ORDER_TIMEOUT_MINUTES\s*=\s*30/.test(tsCode))
  check('index.ts 包含 FEEDING_ORDER_TIMEOUT_MINUTES=30', /export\s+const\s+FEEDING_ORDER_TIMEOUT_MINUTES\s*=\s*30/.test(tsCode))
  check('index.ts 包含 MALL_ORDER_TIMEOUT_MINUTES=30', /export\s+const\s+MALL_ORDER_TIMEOUT_MINUTES\s*=\s*30/.test(tsCode))
  check('index.ts 包含 GROUP_BUY_TIMEOUT_MINUTES=30', /export\s+const\s+GROUP_BUY_TIMEOUT_MINUTES\s*=\s*30/.test(tsCode))
  check('index.ts 包含 ACTIVITY_ORDER_TIMEOUT_MINUTES=30', /export\s+const\s+ACTIVITY_ORDER_TIMEOUT_MINUTES\s*=\s*30/.test(tsCode))
  check('index.ts 包含 BATCH_SIZE=100', /export\s+const\s+BATCH_SIZE\s*=\s*100/.test(tsCode))
  check('index.ts 包含 MAX_BATCHES=10', /export\s+const\s+MAX_BATCHES\s*=\s*10/.test(tsCode))

  // 7 个辅助函数
  const HELPERS = [
    'normalizePrivateKey', 'generateAuthorization', 'closeWechatOrder',
    'restoreProductStock', 'unlockOrderCoupons', 'restoreTuanDealStock',
    'restoreActivityQuota', 'fetchAllExpired',
  ]
  HELPERS.forEach(fn => {
    check(`index.ts 导出 ${fn}`, new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`).test(tsCode))
  })

  // main 入口
  check('index.ts 导出 main 函数', /export\s+async\s+function\s+main\b/.test(tsCode))
  check('index.ts 包含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(tsCode))

  // 5 类业务函数
  check('index.ts 包含 5 类订单取消逻辑（cancelledBoardingOrders 等）', /cancelledBoardingOrders/.test(tsCode))
  check('index.ts 包含微信关单逻辑', /closeWechatOrder/.test(tsCode))
  check('index.ts 包含库存回退逻辑', /restoreProductStock/.test(tsCode))
  check('index.ts 包含团名额回退逻辑', /restoreTuanDealStock/.test(tsCode))
  check('index.ts 包含活动名额回退逻辑', /restoreActivityQuota/.test(tsCode))
  check('index.ts 包含优惠券解锁逻辑', /unlockOrderCoupons/.test(tsCode))
}

// 6. 测试存在
const migrationTest = path.join(ROOT, 'test', 'order-timeout-service-ts-migration.test.js')
check('测试 order-timeout-service-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 严格模式
if (STRICT) {
  const tsConfigs = [
    'tsconfig.orderTimeoutService.json',
    'tsconfig.petService.json',
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

  const JS_TARGET = path.join(TS_DIR, 'index.js')
  const content = readSafe(JS_TARGET)
  if (content) {
    check('cloudfunctions/orderTimeoutService/index.js 头部含 eslint-disable', content.startsWith('/* eslint-disable'))
  } else {
    check('cloudfunctions/orderTimeoutService/index.js 存在', false)
  }

  check('orderTimeoutService 入口存在', fs.existsSync(JS_TARGET))
}

console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
