#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 46: tuanService TypeScript 迁移审计
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')
const SVC = 'tuanService'
const CFG = 'tsconfig.tuanService.json'
const NAME = 'tuan-service'

function readSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
let failed = 0
const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) { failed++ }
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const TS_FILE = path.join(ROOT, 'cloudfunctions', SVC, 'index.ts')
const code = readSafe(TS_FILE)
check(`${SVC}/index.ts 存在`, Boolean(code))

const tsconfig = readSafe(path.join(ROOT, CFG))
let includeOk = false
if (tsconfig) {
  try { includeOk = JSON.parse(tsconfig).include?.includes(`cloudfunctions/${SVC}/index.ts`) } catch (e) {}
}
check(`${CFG} include 包含 index.ts`, includeOk)

const pkg = readSafe(path.join(ROOT, 'package.json'))
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    check(`package.json 注册 audit:s46-${NAME}-ts`, Boolean(cfg.scripts[`audit:s46-${NAME}-ts`]))
    check(`package.json 注册 audit:s46-${NAME}-ts:strict`, Boolean(cfg.scripts[`audit:s46-${NAME}-ts:strict`]))
    check('audit:s46-batch-services-ts:strict 存在（统一 CI 入口）', Boolean(cfg.scripts['audit:s46-batch-services-ts:strict']))
    check('ci:check 包含 batch 入口', /(?:audit:s46-batch-services-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) { check('package.json 是合法 JSON', false, e.message) }
}

if (code) {
  check('index.ts 含 Sprint 46', /Sprint\s*46/.test(code))
  check('index.ts 含 main 入口', /export\s+async\s+function\s+main\b/.test(code))
  check('index.ts 含 3 个 action', /getTuanDealList/.test(code) && /getTuanDealDetail/.test(code) && /createTuanOrder/.test(code))
  check('index.ts 含 TuanStatus / TuanDeal / TuanOrder', /TuanStatus/.test(code) && /TuanDeal/.test(code) && /TuanOrder/.test(code))
  check('index.ts 含 TUAN_DEAL_LIST_FIELDS / WRITE_ACTIONS', /TUAN_DEAL_LIST_FIELDS/.test(code) && /WRITE_ACTIONS/.test(code))
  check('index.ts 含 computeMinPrice', /computeMinPrice/.test(code))
  check('index.ts 含 SKU 维度计算', /skuType\s*===\s*['"]multi['"]/.test(code))
  check('index.ts 含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(code))
  check('index.ts 含 export default', /export\s+default\s+\{/.test(code))
  check('index.ts 含 AuthLike / CloudEvent / CloudContext', /AuthLike/.test(code) && /CloudEvent/.test(code) && /CloudContext/.test(code))
}

check(`test/${NAME}-ts-migration.test.js 存在`, fs.existsSync(path.join(ROOT, 'test', `${NAME}-ts-migration.test.js`)))

if (STRICT) {
  try {
    execSync(`npx --yes -p typescript@5.4.5 tsc --noEmit -p ${CFG}`, { cwd: ROOT, stdio: 'pipe' })
    check(`tsc --noEmit 严格模式通过（${SVC}）`, true)
  } catch (e) { check(`tsc --noEmit 严格模式通过（${SVC}）`, false, e.message) }
  const js = readSafe(path.join(ROOT, 'cloudfunctions', SVC, 'index.js'))
  check('index.js 头部含 eslint-disable', js && js.startsWith('/* eslint-disable'))
}

console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
