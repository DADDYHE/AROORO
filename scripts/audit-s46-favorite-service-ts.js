#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 46: favoriteService TypeScript 迁移审计
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')
const SVC = 'favoriteService'
const CFG = 'tsconfig.favoriteService.json'
const NAME = 'favorite-service'

function readSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
let failed = 0
const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) { failed++ }
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const code = readSafe(path.join(ROOT, 'cloudfunctions', SVC, 'index.ts'))
check(`${SVC}/index.ts 存在`, Boolean(code))

const tsconfig = readSafe(path.join(ROOT, CFG))
let includeOk = false
if (tsconfig) { try { includeOk = JSON.parse(tsconfig).include?.includes(`cloudfunctions/${SVC}/index.ts`) } catch (e) {} }
check(`${CFG} include 包含 index.ts`, includeOk)

const pkg = readSafe(path.join(ROOT, 'package.json'))
if (pkg) {
  try {
    const cfg = JSON.parse(pkg)
    check(`audit:s46-${NAME}-ts`, Boolean(cfg.scripts[`audit:s46-${NAME}-ts`]))
    check(`audit:s46-${NAME}-ts:strict`, Boolean(cfg.scripts[`audit:s46-${NAME}-ts:strict`]))
    check('audit:s46-batch-services-ts:strict 存在（统一 CI 入口）', Boolean(cfg.scripts['audit:s46-batch-services-ts:strict']))
    check('ci:check 包含 batch 入口', /(?:audit:s46-batch-services-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {}
}

if (code) {
  check('Sprint 46', /Sprint\s*46/.test(code))
  check('main 入口', /export\s+async\s+function\s+main\b/.test(code))
  check('3 个 action', /addFavorite/.test(code) && /removeFavorite/.test(code) && /getFavorites/.test(code))
  check('FavoriteTargetType 联合', /FavoriteTargetType/.test(code))
  check('FavoriteDoc', /FavoriteDoc/.test(code))
  check('防重逻辑', /existing\.data/.test(code))
  check('count + skip + limit', /\.count\(/.test(code) && /\.skip\(/.test(code) && /\.limit\(/.test(code))
  check('Runtime shim', /_mod\.exports\s*=\s*\{/.test(code))
  check('export default', /export\s+default\s+\{/.test(code))
}

check(`test/${NAME}-ts-migration.test.js 存在`, fs.existsSync(path.join(ROOT, 'test', `${NAME}-ts-migration.test.js`)))

if (STRICT) {
  try {
    execSync(`npx --yes -p typescript@5.4.5 tsc --noEmit -p ${CFG}`, { cwd: ROOT, stdio: 'pipe' })
    check(`tsc 严格通过（${SVC}）`, true)
  } catch (e) { check(`tsc 严格通过（${SVC}）`, false, e.message) }
  const js = readSafe(path.join(ROOT, 'cloudfunctions', SVC, 'index.js'))
  check('index.js eslint-disable', js && js.startsWith('/* eslint-disable'))
}

console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
