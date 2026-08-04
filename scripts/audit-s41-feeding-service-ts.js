#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 41: feedingService TypeScript 迁移审计脚本
 *
 * 背景：
 *   - Sprint 41 完成 feedingService index.ts 入口 TS 化
 *   - 5 个 action 全部强类型化
 *
 * 严格模式额外检查（--strict）：
 *   - tsc --noEmit 8 个服务回归
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

const FEEDING_DIR = path.join(ROOT, 'cloudfunctions', 'feedingService')

// 1. 文件存在
const FEEDING_TS = path.join(FEEDING_DIR, 'index.ts')
check('feedingService/index.ts 存在', fs.existsSync(FEEDING_TS))

// 2. tsconfig 包含
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.feedingService.json'))
let includeCount = 0
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    const required = ['cloudfunctions/feedingService/index.ts']
    includeCount = required.filter(r => (cfg.include || []).includes(r)).length
  } catch (e) {
    check('tsconfig.feedingService.json 是合法 JSON', false, e.message)
  }
}
check(`tsconfig.feedingService.json include 包含 index.ts（${includeCount}/1）`, includeCount === 1)

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
    check('package.json 注册 audit:s41-feeding-service-ts', Boolean(cfg.scripts['audit:s41-feeding-service-ts']))
    check('package.json 注册 audit:s41-feeding-service-ts:strict', Boolean(cfg.scripts['audit:s41-feeding-service-ts:strict']))
    check('package.json ci:check 包含 audit:s41-feeding-service-ts:strict',
      /(?:audit:s41-feeding-service-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}

// 5. feedingService/index.ts 内容
const feedingTs = readSafe(FEEDING_TS)
if (feedingTs) {
  check('index.ts 注释包含 Sprint 41', /Sprint\s*41/.test(feedingTs))
  check('index.ts 包含 AuthLike 接口', /export\s+interface\s+AuthLike\b/.test(feedingTs))
  check('index.ts 包含 CloudEvent 接口', /export\s+interface\s+CloudEvent\b/.test(feedingTs))
  check('index.ts 包含 CloudContext 接口', /export\s+interface\s+CloudContext\b/.test(feedingTs))
  check('index.ts 包含 FeedingActionHandler 类型', /export\s+type\s+FeedingActionHandler\b/.test(feedingTs))
  check('index.ts 包含 FeederRecord 接口', /export\s+interface\s+FeederRecord\b/.test(feedingTs))
  check('index.ts 包含 FeedingOrderRecord 接口', /export\s+interface\s+FeedingOrderRecord\b/.test(feedingTs))
  // H1+H3+M1: createCommissionRecord 已迁移到公共模块 commission-utils
  //   旧检查：/async\s+function\s+createCommissionRecord\b/
  //   新检查：require('./common/commission-utils') 且使用 createCommissionRecord
  check('index.ts 从公共模块引入 createCommissionRecord（H1+H3+M1 迁移）',
    /require\(['"]\.\/common\/commission-utils['"]\)/.test(feedingTs) &&
    /\bcreateCommissionRecord\b/.test(feedingTs))
  check('index.ts 包含 refreshPetAvatars 函数', /async\s+function\s+refreshPetAvatars\b/.test(feedingTs))
  check('index.ts 包含 handlers 聚合对象', /export\s+const\s+handlers\s*:\s*Record<string,\s*FeedingActionHandler>/.test(feedingTs))
  check('index.ts 包含 main 入口函数', /export\s+async\s+function\s+main\b/.test(feedingTs))

  const ACTIONS = [
    'createFeedingOrder', 'getFeedingOrders', 'getOrderStatus',
    'updateFeedingOrderStatus', 'getFeedingOrderDetail',
  ]
  ACTIONS.forEach(act => {
    check(`index.ts 导出 ${act}`, new RegExp(`export\\s+async\\s+function\\s+${act}\\b`).test(feedingTs))
  })
  check('index.ts 包含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(feedingTs))
}

// 6. 测试存在
const migrationTest = path.join(ROOT, 'test', 'feeding-service-ts-migration.test.js')
check('测试 feeding-service-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 严格模式
if (STRICT) {
  const tsConfigs = [
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

  const JS_TARGET = path.join(FEEDING_DIR, 'index.js')
  const content = readSafe(JS_TARGET)
  if (content) {
    check('cloudfunctions/feedingService/index.js 头部含 eslint-disable', content.startsWith('/* eslint-disable'))
  } else {
    check('cloudfunctions/feedingService/index.js 存在', false)
  }

  check('feedingService 入口存在', fs.existsSync(JS_TARGET))
}

console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
