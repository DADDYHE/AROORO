#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 40: mallService TypeScript 迁移审计脚本
 *
 * 背景：
 *   - Sprint 40 完成 mallService index.ts 入口 TS 化
 *   - 16 个 action 全部强类型化
 *
 * 严格模式额外检查（--strict）：
 *   - tsc --noEmit 7 个服务回归
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

const MALL_DIR = path.join(ROOT, 'cloudfunctions', 'mallService')

// 1. 文件存在
const MALL_TS = path.join(MALL_DIR, 'index.ts')
check('mallService/index.ts 存在', fs.existsSync(MALL_TS))

// 2. tsconfig 包含
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.mallService.json'))
let includeCount = 0
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    const required = ['cloudfunctions/mallService/index.ts']
    includeCount = required.filter(r => (cfg.include || []).includes(r)).length
  } catch (e) {
    check('tsconfig.mallService.json 是合法 JSON', false, e.message)
  }
}
check(`tsconfig.mallService.json include 包含 index.ts（${includeCount}/1）`, includeCount === 1)

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
    check('package.json 注册 audit:s40-mall-service-ts', Boolean(cfg.scripts['audit:s40-mall-service-ts']))
    check('package.json 注册 audit:s40-mall-service-ts:strict', Boolean(cfg.scripts['audit:s40-mall-service-ts:strict']))
    check('package.json ci:check 包含 audit:s40-mall-service-ts:strict',
      /(?:audit:s40-mall-service-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}

// 5. mallService/index.ts 内容
const mallTs = readSafe(MALL_TS)
if (mallTs) {
  check('index.ts 注释包含 Sprint 40', /Sprint\s*40/.test(mallTs))
  check('index.ts 包含 AuthLike 接口', /export\s+interface\s+AuthLike\b/.test(mallTs))
  check('index.ts 包含 CloudEvent 接口', /export\s+interface\s+CloudEvent\b/.test(mallTs))
  check('index.ts 包含 CloudContext 接口', /export\s+interface\s+CloudContext\b/.test(mallTs))
  check('index.ts 包含 MallActionHandler 类型', /export\s+type\s+MallActionHandler\b/.test(mallTs))
  check('index.ts 包含 ProductRecord 接口', /export\s+interface\s+ProductRecord\b/.test(mallTs))
  check('index.ts 包含 OrderRecord 接口', /export\s+interface\s+OrderRecord\b/.test(mallTs))
  check('index.ts 包含 RiskCheckResult 接口', /export\s+interface\s+RiskCheckResult\b/.test(mallTs))
  check('index.ts 包含 SkuSpec 接口', /export\s+interface\s+SkuSpec\b/.test(mallTs))
  check('index.ts 包含 performMallOrderRiskCheck 函数', /async\s+function\s+performMallOrderRiskCheck\b/.test(mallTs))
  // H1: mallService 的佣金职责仅为「取消订单时撤销 pending 佣金」，统一走 common/commission-utils；
  //   佣金创建在支付回调（paymentService）与后台完成（adminService completeMallOrder），不在 mallService。
  check('index.ts 使用共享 cancelCommissionRecord（common/commission-utils）',
    /cancelCommissionRecord: sharedCancelCommissionRecord/.test(mallTs) &&
    /sharedCancelCommissionRecord\(/.test(mallTs) &&
    /common\/commission-utils/.test(mallTs))
  check('index.ts 包含 batchGetTempFileURL 函数', /async\s+function\s+batchGetTempFileURL\b/.test(mallTs))
  check('index.ts 包含 handlers 聚合对象', /export\s+const\s+handlers\s*:\s*Record<string,\s*MallActionHandler>/.test(mallTs))
  check('index.ts 包含 main 入口函数', /export\s+async\s+function\s+main\b/.test(mallTs))

  const ACTIONS = [
    'getProductList', 'getProductDetail', 'getCategoryStats', 'listCategories',
    'checkCartItems', 'createOrder', 'createMultiOrder',
    'getMyOrders', 'getGroupBuyOrders', 'getOrderDetail',
    'cancelOrder', 'confirmReceive', 'deleteOrder', 'getWxShippingStatus',
  ]
  ACTIONS.forEach(act => {
    check(`index.ts 导出 ${act}`, new RegExp(`export\\s+async\\s+function\\s+${act}\\b`).test(mallTs))
  })
  check('index.ts 包含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(mallTs))
}

// 6. 测试存在
const migrationTest = path.join(ROOT, 'test', 'mall-service-ts-migration.test.js')
check('测试 mall-service-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 严格模式
if (STRICT) {
  const tsConfigs = [
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

  const JS_TARGET = path.join(MALL_DIR, 'index.js')
  const content = readSafe(JS_TARGET)
  if (content) {
    check('cloudfunctions/mallService/index.js 头部含 eslint-disable', content.startsWith('/* eslint-disable'))
  } else {
    check('cloudfunctions/mallService/index.js 存在', false)
  }

  check('mallService 入口存在', fs.existsSync(JS_TARGET))
}

console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
