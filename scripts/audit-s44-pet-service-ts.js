#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 44: petService TypeScript 迁移审计脚本
 *
 * 背景：
 *   - Sprint 44 完成 petService index.ts 入口 TS 化
 *   - 6 个 action 全部强类型化
 *
 * 严格模式额外检查（--strict）：
 *   - tsc --noEmit 11 个服务回归
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

const PET_DIR = path.join(ROOT, 'cloudfunctions', 'petService')

// 1. 文件存在
const PET_TS = path.join(PET_DIR, 'index.ts')
check('petService/index.ts 存在', fs.existsSync(PET_TS))

// 2. tsconfig 包含
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.petService.json'))
let includeCount = 0
if (tsconfig) {
  try {
    const cfg = JSON.parse(tsconfig)
    const required = ['cloudfunctions/petService/index.ts']
    includeCount = required.filter(r => (cfg.include || []).includes(r)).length
  } catch (e) {
    check('tsconfig.petService.json 是合法 JSON', false, e.message)
  }
}
check(`tsconfig.petService.json include 包含 index.ts（${includeCount}/1）`, includeCount === 1)

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
    check('package.json 注册 audit:s44-pet-service-ts', Boolean(cfg.scripts['audit:s44-pet-service-ts']))
    check('package.json 注册 audit:s44-pet-service-ts:strict', Boolean(cfg.scripts['audit:s44-pet-service-ts:strict']))
    check('package.json ci:check 包含 audit:s44-pet-service-ts:strict',
      /(?:audit:s44-pet-service-ts:strict|audit:all:strict)/.test(cfg.scripts['ci:check'] || ''))
  } catch (e) {
    check('package.json 是合法 JSON', false, e.message)
  }
}

// 5. petService/index.ts 内容
const petTs = readSafe(PET_TS)
if (petTs) {
  check('index.ts 注释包含 Sprint 44', /Sprint\s*44/.test(petTs))
  check('index.ts 包含 AuthLike 接口', /export\s+interface\s+AuthLike\b/.test(petTs))
  check('index.ts 包含 CloudEvent 接口', /export\s+interface\s+CloudEvent\b/.test(petTs))
  check('index.ts 包含 CloudContext 接口', /export\s+interface\s+CloudContext\b/.test(petTs))
  check('index.ts 包含 PetActionHandler 类型', /export\s+type\s+PetActionHandler\b/.test(petTs))
  check('index.ts 包含 PetType 联合类型', /export\s+type\s+PetType\s*=\s*['"]cat['"]\s*\|\s*['"]dog['"]\s*\|\s*['"]exotic['"]/.test(petTs))
  check('index.ts 包含 PetGender 联合类型', /export\s+type\s+PetGender\s*=\s*['"]male['"]\s*\|\s*['"]female['"]\s*\|\s*['"]unknown['"]/.test(petTs))
  check('index.ts 包含 IsActive 联合类型', /export\s+type\s+IsActive\s*=\s*0\s*\|\s*1/.test(petTs))
  check('index.ts 包含 PetRecord 接口', /export\s+interface\s+PetRecord\b/.test(petTs))
  check('index.ts 包含 convertWeight 函数', /export\s+function\s+convertWeight\b/.test(petTs))
  check('index.ts 包含 handlers 聚合对象', /export\s+const\s+handlers\s*:\s*Record<string,\s*PetActionHandler>/.test(petTs))
  check('index.ts 包含 main 入口函数', /export\s+async\s+function\s+main\b/.test(petTs))

  const ACTIONS = [
    'createPet', 'updatePet', 'deletePet', 'getPet', 'getPetList', 'getPetDetail',
  ]
  // Sprint 51: 兼容 withErrorHandling 包装风格
  //   - 旧风格：export async function createPet
  //   - 新风格：export const createPet = withErrorHandling(async (...) => ...)
  ACTIONS.forEach(act => {
    const re = new RegExp(`export\\s+(async\\s+function|const)\\s+${act}\\b`)
    check(`index.ts 导出 ${act}`, re.test(petTs))
  })
  check('index.ts 包含 Runtime shim', /_mod\.exports\s*=\s*\{/.test(petTs))
  check('index.ts 包含软删除（isActive=0）', /isActive:\s*0/.test(petTs))
}

// 6. 测试存在
const migrationTest = path.join(ROOT, 'test', 'pet-service-ts-migration.test.js')
check('测试 pet-service-ts-migration.test.js 存在', fs.existsSync(migrationTest))

// 严格模式
if (STRICT) {
  const tsConfigs = [
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

  const JS_TARGET = path.join(PET_DIR, 'index.js')
  const content = readSafe(JS_TARGET)
  if (content) {
    check('cloudfunctions/petService/index.js 头部含 eslint-disable', content.startsWith('/* eslint-disable'))
  } else {
    check('cloudfunctions/petService/index.js 存在', false)
  }

  check('petService 入口存在', fs.existsSync(JS_TARGET))
}

console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) { process.exit(1) }
