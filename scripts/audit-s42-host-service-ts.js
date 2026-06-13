#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 42: hostService TypeScript 迁移审计脚本
 *
 * 背景：
 *   - Sprint 42 完成 hostService index.ts 入口 TS 化
 *   - 7 个 action 全部强类型化
 *
 * 严格模式额外检查（--strict）：
 *   - tsc --noEmit 9 个服务回归
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

const HOST_DIR = path.join(ROOT, 'cloudfunctions', 'hostService')

// 1. 文件存在
const HOST_TS = path.join(HOST_DIR, 'index.ts')
check('hostService/index.ts 存在', fs.existsSync(HOST_TS))

// 2. tsconfig 包含
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.hostService.json'))
let includeCount = 0
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    const required = ['cloudfunctions/hostService/index.ts']
    includeCount = required.filter(r => (cfg.include || []).includes(r)).length
  } catch (e) {
    check('tsconfig.hostService.json 是合法 JSON', false, e.message)
  }
}
check(`tsconfig.hostService.json include 包含 index.ts（${includeCount}/1）`, includeCount === 1)

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
    check('package.json 注册 audit:s42-host-service-ts', Boolean(cfg.scripts['audit:s42-host-service-ts']))
    check('package.json 注册 audit:s42-host-service-ts:strict', Boolean(cfg.scripts['audit:s42-host-service-ts:strict']))
    check('package.json ci:check 包含 audit:s42-host-service-ts:strict',
      /(?:audit:s42-host-service-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}

// 5. hostService/index.ts 内容
const hostTs = readSafe(HOST_TS)
if (hostTs) {
  check('index.ts 注释包含 Sprint 42', /Sprint\s*42/.test(hostTs))
  check('index.ts 包含 AuthLike 接口', /export\s+interface\s+AuthLike\b/.test(hostTs))
  check('index.ts 包含 CloudEvent 接口', /export\s+interface\s+CloudEvent\b/.test(hostTs))
  check('index.ts 包含 CloudContext 接口', /export\s+interface\s+CloudContext\b/.test(hostTs))
  check('index.ts 包含 HostActionHandler 类型', /export\s+type\s+HostActionHandler\b/.test(hostTs))
  check('index.ts 包含 HostRecord 接口', /export\s+interface\s+HostRecord\b/.test(hostTs))
  check('index.ts 包含 HostStats 接口', /export\s+interface\s+HostStats\b/.test(hostTs))
  check('index.ts 包含 EncryptedPayload 接口', /export\s+interface\s+EncryptedPayload\b/.test(hostTs))
  check('index.ts 包含 KeyVersion 联合类型', /export\s+type\s+KeyVersion\b/.test(hostTs))
  check('index.ts 包含 _encryptSensitive 函数', /function\s+_encryptSensitive\b/.test(hostTs))
  check('index.ts 包含 _encryptSensitiveCBC 函数', /function\s+_encryptSensitiveCBC\b/.test(hostTs))
  check('index.ts 包含 _encryptDual 函数', /function\s+_encryptDual\b/.test(hostTs))
  check('index.ts 包含 _decryptSensitive 函数', /function\s+_decryptSensitive\b/.test(hostTs))
  check('index.ts 包含 _decryptCBC 函数', /function\s+_decryptCBC\b/.test(hostTs))
  check('index.ts 包含 escapeRegExp 函数', /function\s+escapeRegExp\b/.test(hostTs))
  check('index.ts 包含 handlers 聚合对象', /export\s+const\s+handlers\s*:\s*Record<string,\s*HostActionHandler>/.test(hostTs))
  check('index.ts 包含 main 入口函数', /export\s+async\s+function\s+main\b/.test(hostTs))
  check('index.ts 包含 KEY_VERSION 常量', /const\s+KEY_VERSION/.test(hostTs))
  check('index.ts 包含 AES-GCM 加密', /AES-256-GCM/.test(hostTs))
  check('index.ts 包含 AES-CBC 双写', /AES-256-CBC/.test(hostTs))

  const ACTIONS = [
    'createHostProfile', 'updateHostProfile', 'getHostList', 'getHostDetail',
    'getHostProfile', 'updateHostAcceptingOrders', 'getHostStats',
  ]
  ACTIONS.forEach(act => {
    check(`index.ts 导出 ${act}`, new RegExp(`export\\s+async\\s+function\\s+${act}\\b`).test(hostTs))
  })
  check('index.ts 包含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(hostTs))
  check('index.ts 包含测试用 internal 导出', /HOST_SERVICE_EXPOSE_INTERNALS/.test(hostTs))
}

// 6. 测试存在
const migrationTest = path.join(ROOT, 'test', 'host-service-ts-migration.test.js')
check('测试 host-service-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 严格模式
if (STRICT) {
  const tsConfigs = [
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

  const JS_TARGET = path.join(HOST_DIR, 'index.js')
  const content = readSafe(JS_TARGET)
  if (content) {
    check('cloudfunctions/hostService/index.js 头部含 eslint-disable', content.startsWith('/* eslint-disable'))
  } else {
    check('cloudfunctions/hostService/index.js 存在', false)
  }

  check('hostService 入口存在', fs.existsSync(JS_TARGET))
}

console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
