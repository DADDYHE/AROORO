#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 46: 批量 TS 化收官 - 统一审计脚本
 *
 * 覆盖 7 个服务：
 *   - tuanService / favoriteService / i18nOverride / utilityService
 *   - couponExpiryCheck / tuanExpiryCheck / rateLimitCleanup
 *
 * 严格模式额外检查（--strict）：
 *   - tsc --noEmit 19 个服务回归
 *   - .js 构建产物头部含 eslint-disable
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')

const SERVICES = [
  { id: 'tuanService', cfg: 'tsconfig.tuanService.json', name: 'tuan-service' },
  { id: 'favoriteService', cfg: 'tsconfig.favoriteService.json', name: 'favorite-service' },
  { id: 'i18nOverride', cfg: 'tsconfig.i18nOverride.json', name: 'i18n-override' },
  { id: 'utilityService', cfg: 'tsconfig.utilityService.json', name: 'utility-service' },
  { id: 'couponExpiryCheck', cfg: 'tsconfig.couponExpiryCheck.json', name: 'coupon-expiry-check' },
  { id: 'tuanExpiryCheck', cfg: 'tsconfig.tuanExpiryCheck.json', name: 'tuan-expiry-check' },
  { id: 'rateLimitCleanup', cfg: 'tsconfig.rateLimitCleanup.json', name: 'rate-limit-cleanup' },
]

function readSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }

let failed = 0
const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) { failed++ }
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const pkg = readSafe(path.join(ROOT, 'package.json'))
let pkgCfg = null
if (pkg) {
  try { pkgCfg = JSON.parse(pkg) } catch (e) { check('package.json 是合法 JSON', false, e.message) }
}

SERVICES.forEach(svc => {
  const TS_DIR = path.join(ROOT, 'cloudfunctions', svc.id)
  const TS_FILE = path.join(TS_DIR, 'index.ts')
  const JS_FILE = path.join(TS_DIR, 'index.js')

  // 文件存在
  check(`${svc.id}/index.ts 存在`, fs.existsSync(TS_FILE))
  check(`${svc.id}/index.js 存在`, fs.existsSync(JS_FILE))

  // tsconfig include
  const tsconfig = readSafe(path.join(ROOT, svc.cfg))
  let includeCount = 0
  if (tsconfig) {
    try {
      const cfg = JSON.parse(tsconfig)
      const required = [`cloudfunctions/${svc.id}/index.ts`]
      includeCount = required.filter(r => (cfg.include || []).includes(r)).length
    } catch (e) { check(`${svc.cfg} 是合法 JSON`, false, e.message) }
  }
  check(`${svc.cfg} include 包含 index.ts（${includeCount}/1）`, includeCount === 1)

  // build script (统一由 build-all-services.js 处理)
  const buildAll = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
  if (buildAll) {
    const noComment = buildAll.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    check(`build-all-services.js 注册 ${svc.id}`,
      new RegExp(`name:\\s*['"]${svc.id}['"]`).test(noComment))
    check(`build-all-services.js 包含 ${svc.cfg}`,
      noComment.includes(svc.cfg))
    check(`build-all-services.js 包含 ${svc.id} 的 index.js target`,
      noComment.includes(`cloudfunctions/${svc.id}/index.js`))
  } else {
    check('scripts/build-all-services.js 存在', false)
  }

  // audit script & test
  const testFile = path.join(ROOT, 'test', `${svc.name}-ts-migration.test.js`)
  check(`测试 ${svc.name}-ts-migration.test.js 存在`, fs.existsSync(testFile))

  // index.ts 内容基础
  const code = readSafe(TS_FILE)
  if (code) {
    check(`${svc.id}/index.ts 包含 Sprint 46`, /Sprint\s*46/.test(code))
    check(`${svc.id}/index.ts 包含 main 入口`, /export\s+async\s+function\s+main\b/.test(code))
    check(`${svc.id}/index.ts 包含 Runtime shim`, /_mod\.exports\s*=\s*\{/.test(code))
    check(`${svc.id}/index.ts 包含 export default`, /export\s+default\s+\{/.test(code))
  }
})

// package.json 注册
if (pkgCfg) {
  SERVICES.forEach(svc => {
    const key1 = `audit:s46-${svc.name}-ts`
    const key2 = `audit:s46-${svc.name}-ts:strict`
    check(`package.json 注册 ${key1}`, Boolean(pkgCfg.scripts[key1]))
    check(`package.json 注册 ${key2}`, Boolean(pkgCfg.scripts[key2]))
  })
  // Sprint 46 设计：使用 batch 入口统一接入 ci:check
  check('package.json 注册 audit:s46-batch-services-ts:strict', Boolean(pkgCfg.scripts['audit:s46-batch-services-ts:strict']))
  check('package.json ci:check 包含 audit:s46-batch-services-ts:strict',
    /(?:audit:s46-batch-services-ts:strict|audit:all:strict)/.test(pkgCfg.scripts['ci:check'] || ''))
}

// 严格模式
if (STRICT) {
  const tsConfigs = [
    ...SERVICES.map(s => s.cfg),
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
      const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 3).join(' / ') : e.message
      check(`tsc --noEmit 严格模式通过（${cfg.replace('tsconfig.', '').replace('.json', '')}）`, false, msg)
    }
  })

  SERVICES.forEach(svc => {
    const content = readSafe(path.join(ROOT, 'cloudfunctions', svc.id, 'index.js'))
    if (content) {
      check(`${svc.id}/index.js 头部含 eslint-disable`, content.startsWith('/* eslint-disable'))
    }
  })
}

console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
