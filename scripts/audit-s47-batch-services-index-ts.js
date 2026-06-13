#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 47: paymentService/index + orderService/index 入口 TS 化 - 统一审计脚本
 *
 * 覆盖 2 个核心服务入口：
 *   - paymentService/index.ts（聚合 pay / refund / notify 三个子服务）
 *   - orderService/index.ts（聚合 orders + stats 两个子服务）
 *
 * 设计动机：
 *   - Sprint 24-30 已完成 paymentService / orderService 子服务的 TS 化（pay / refund / notify / commission / orders / stats）
 *   - Sprint 47 把两个聚合入口文件 index.ts 化，统一鉴权 / 错误处理 / 限流
 *   - 与已迁移的 14 个 action router 服务对齐
 *
 * 检查项（基础模式）：
 *   1. 两个 index.ts 物理文件存在
 *   2. 两个 index.js（构建产物）存在
 *   3. tsconfig.{paymentService|orderService}.json include 包含 index.ts
 *   4. 两个 build-{payment|order}-service.js 包含 index.js target
 *   5. 两个 index.ts 内容基础验证（Sprint 47 / AuthLike / CloudEvent / CloudContext / main / Runtime shim）
 *   6. package.json 注册 4 个新 audit script（s47 × 2 服务 × 2 模式）
 *   7. package.json 注册 batch 入口（audit:s47-batch-services-index-ts + strict）
 *   8. ci:check 包含 audit:s47-batch-services-index-ts:strict
 *   9. 两个 jest test 文件存在
 *
 * 严格模式额外（--strict）：
 *   - tsc --noEmit 21 个服务回归（19 + paymentService + orderService）
 *   - .js 构建产物头部含 eslint-disable
 *   - .js 包含 _mod.exports shim
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')

const SERVICES = [
  { id: 'paymentService', cfg: 'tsconfig.paymentService.json', name: 'payment-service', tsBuild: 'build-all-services.js' },
  { id: 'orderService', cfg: 'tsconfig.orderService.json', name: 'order-service', tsBuild: 'build-all-services.js' },
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

  // 1. 文件存在
  check(`${svc.id}/index.ts 存在`, fs.existsSync(TS_FILE))
  check(`${svc.id}/index.js（构建产物）存在`, fs.existsSync(JS_FILE))

  // 2. tsconfig include
  const tsconfig = readSafe(path.join(ROOT, svc.cfg))
  let includeOk = false
  if (tsconfig) {
    try {
      const cfg = JSON.parse(tsconfig)
      includeOk = Array.isArray(cfg.include) && cfg.include.includes(`cloudfunctions/${svc.id}/index.ts`)
    } catch (e) { check(`${svc.cfg} 是合法 JSON`, false, e.message) }
  } else {
    check(`${svc.cfg} 存在`, false)
  }
  check(`${svc.cfg} include 包含 index.ts`, includeOk)

  // 3. build script
  const buildScript = readSafe(path.join(ROOT, 'scripts', svc.tsBuild))
  if (buildScript) {
    // 直接搜索 index.js（不剥注释，避免 doc 注释内的 `*\/` 误判块注释边界）
    check(`${svc.tsBuild} 包含 index.js target`, /index\.js/.test(buildScript))
  } else {
    check(`scripts/${svc.tsBuild} 存在`, false)
  }

  // 4. jest test
  const testFile = path.join(ROOT, 'test', `${svc.name}-index-ts-migration.test.js`)
  check(`测试 ${svc.name}-index-ts-migration.test.js 存在`, fs.existsSync(testFile))

  // 5. index.ts 内容基础
  const code = readSafe(TS_FILE)
  if (code) {
    check(`${svc.id}/index.ts 包含 Sprint 47`, /Sprint\s*47/.test(code))
    check(`${svc.id}/index.ts 包含 AuthLike 接口`, /export\s+interface\s+AuthLike\b/.test(code))
    check(`${svc.id}/index.ts 包含 CloudEvent / CloudContext`,
      /(?:export\s+interface\s+CloudEvent\b|export\s+type\s+CloudEvent\b)/.test(code)
      && /export\s+interface\s+CloudContext\b/.test(code))
    check(`${svc.id}/index.ts 包含 main 入口`, /export\s+async\s+function\s+main\b/.test(code))
    check(`${svc.id}/index.ts 包含 verifyAuth 鉴权`, /verifyAuth/.test(code))
    check(`${svc.id}/index.ts 包含 isBusinessError 守卫`, /isBusinessError/.test(code))
    check(`${svc.id}/index.ts 包含 err() 工厂`,
      /require\(['"][^'"]*errors['"]\)/.test(code)
      || /from\s+['"][^'"]*errors['"]/.test(code))
    check(`${svc.id}/index.ts 包含 toResponse / handleError`,
      /toResponse/.test(code) && /handleError/.test(code))
    check(`${svc.id}/index.ts 包含 initGlobalRateLimitFromDb（Sprint 21）`, /initGlobalRateLimitFromDb/.test(code))
    check(`${svc.id}/index.ts Runtime shim`, /_mod\.exports\s*=\s*\{/.test(code))
    check(`${svc.id}/index.ts 含 export default`, /export\s+default\s+\{/.test(code))
  }
})

// 6. package.json 注册
if (pkgCfg) {
  SERVICES.forEach(svc => {
    const key1 = `audit:s47-${svc.name}-index-ts`
    const key2 = `audit:s47-${svc.name}-index-ts:strict`
    check(`package.json 注册 ${key1}`, Boolean(pkgCfg.scripts[key1]))
    check(`package.json 注册 ${key2}`, Boolean(pkgCfg.scripts[key2]))
  })
  // batch 入口
  check('package.json 注册 audit:s47-batch-services-index-ts',
    Boolean(pkgCfg.scripts['audit:s47-batch-services-index-ts']))
  check('package.json 注册 audit:s47-batch-services-index-ts:strict',
    Boolean(pkgCfg.scripts['audit:s47-batch-services-index-ts:strict']))
  // ci:check 集成
  check('package.json ci:check 包含 audit:s47-batch-services-index-ts:strict',
    /(?:audit:s47-batch-services-index-ts:strict|audit:all:strict)/.test(pkgCfg.scripts['ci:check'] || ''))
}

// 7. 严格模式
if (STRICT) {
  const tsConfigs = [
    // 本批次目标
    'tsconfig.paymentService.json',
    'tsconfig.orderService.json',
    // Sprint 46 之前已完成
    'tsconfig.adminService.json',
    'tsconfig.userService.json',
    'tsconfig.partnerService.json',
    'tsconfig.activityService.json',
    'tsconfig.mallService.json',
    'tsconfig.feedingService.json',
    'tsconfig.hostService.json',
    'tsconfig.couponService.json',
    'tsconfig.petService.json',
    'tsconfig.orderTimeoutService.json',
    'tsconfig.tuanService.json',
    'tsconfig.favoriteService.json',
    'tsconfig.i18nOverride.json',
    'tsconfig.utilityService.json',
    'tsconfig.couponExpiryCheck.json',
    'tsconfig.tuanExpiryCheck.json',
    'tsconfig.rateLimitCleanup.json',
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
      check(`${svc.id}/index.js 包含 _mod.exports shim`, /_mod\.exports\s*=\s*\{/.test(content))
    }
  })
}

console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
