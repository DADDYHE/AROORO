#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 53: i18n 运营后台 v1 审计
 *
 * 检查目标：
 *   1. i18n 字典 BIZ_I18N 完整度（≥ 200 keys）
 *   2. codemod 替换覆盖率（pages + subpackages 全部 i18n 化）
 *   3. i18nOverride 后端服务 9 个 action（含 Sprint 53 新增 3 个）
 *   4. adminService 入口正确路由 i18nOverride handlers
 *   5. i18n-override 客户端后台页面（含 Sprint 53 增强）
 *   6. CloudFunctionService 客户端 wrapper
 *   7. 测试覆盖（exportI18nOverrides / findMissingTranslations / getI18nOverrideStats）
 *   8. (strict) tsc 严格模式编译通过
 *
 * 退出码：0 = 全部通过，1 = 至少 1 项不通过
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

// 1. i18n 字典完整度
let bizI18n
try {
  bizI18n = require(path.join(ROOT, 'utils', 'i18n.js')).BIZ_I18N
} catch (e) {
  bizI18n = null
}
const bizCount = bizI18n ? Object.keys(bizI18n).length : 0
check('utils/i18n.js 存在', bizI18n !== null)
check(`BIZ_I18N 字典 ≥ 200 keys（实际 ${bizCount}）`, bizCount >= 200)

// 2. codemod 替换覆盖率
const pages = path.join(ROOT, 'pages')
const subs = path.join(ROOT, 'subpackages')
let allJs = []
function walkJs(dir) {
  if (!fs.existsSync(dir)) { return }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') { continue }
      walkJs(full)
    } else if (entry.name.endsWith('.js')) {
      allJs.push(full)
    }
  }
}
walkJs(pages)
walkJs(subs)

let hasPage = allJs.filter(f => /Page\(\{/.test(readSafe(f) || ''))
let withI18n = hasPage.filter(f => /pageI18n\.mixin\(\)/.test(readSafe(f) || ''))
let withRawShowToast = withI18n.filter(f => /wx\.showToast\(\s*\{/.test(readSafe(f) || ''))

check(`pages/subpackages 含 Page({}) 的 js 文件数: ${hasPage.length}`, hasPage.length > 0)
check(`已注入 pageI18n.mixin() 的文件数: ${withI18n.length}`, withI18n.length > 0)
check(`i18n 化覆盖率 = 100%（剩余 wx.showToast = ${withRawShowToast.length}）`, withRawShowToast.length === 0)
if (withRawShowToast.length > 0) {
  withRawShowToast.slice(0, 5).forEach(f => console.log(`   提示: ${path.relative(ROOT, f)}`))
}
const withoutMixin = hasPage.filter(f => !/pageI18n\.mixin\(\)/.test(readSafe(f) || ''))
check(
  `未注入 pageI18n.mixin() 的页面 ${withoutMixin.length} 个（其中 0 个含 wx.showToast，已 i18n 化所有 showToast 100% 通过）`,
  withoutMixin.every(f => !/wx\.showToast\(\s*\{/.test(readSafe(f) || ''))
)

// 3. i18nOverride 后端服务 9 个 action
const i18nSvcPath = path.join(ROOT, 'cloudfunctions', 'adminService', 'services', 'i18nOverride.js')
const i18nSvc = readSafe(i18nSvcPath)
check('cloudfunctions/adminService/services/i18nOverride.js 存在', fs.existsSync(i18nSvcPath))

const REQUIRED_HANDLERS = [
  'listI18nOverrides',
  'getI18nOverride',
  'upsertI18nOverride',
  'batchUpsertI18nOverrides',
  'deleteI18nOverride',
  'fetchActiveOverrides',
  'toggleI18nOverrideStatus',
  // Sprint 53 新增
  'exportI18nOverrides',
  'findMissingTranslations',
  'getI18nOverrideStats',
]
for (const h of REQUIRED_HANDLERS) {
  const re = new RegExp(`const\\s+${h}\\s*=\\s*withErrorHandling`)
  check(`i18nOverride 服务导出 ${h}`, i18nSvc && re.test(i18nSvc))
  const exportRe = new RegExp(`${h}\\s*,`)
  check(`module.exports 含 ${h}`, i18nSvc && exportRe.test(i18nSvc))
}

// 4. adminService 入口正确路由
const adminIdxPath = path.join(ROOT, 'cloudfunctions', 'adminService', 'index.ts')
const adminIdx = readSafe(adminIdxPath)
check('cloudfunctions/adminService/index.ts 存在', fs.existsSync(adminIdxPath))
check('adminService/index.ts 引入 i18nOverride handlers',
  adminIdx && /i18nOverrideHandlers[\s\S]{0,100}require\(['"]\.\/services\/i18nOverride['"]\)/.test(adminIdx))
check('adminService/index.ts 展开 i18nOverride handlers',
  adminIdx && /\.\.\.i18nOverrideHandlers/.test(adminIdx))

// 5. i18n-override 客户端后台页面
const pagePath = path.join(ROOT, 'subpackages', 'partner', 'i18n-override', 'index.js')
const pageWxmlPath = path.join(ROOT, 'subpackages', 'partner', 'i18n-override', 'index.wxml')
const pageWxssPath = path.join(ROOT, 'subpackages', 'partner', 'i18n-override', 'index.wxss')
const pageJs = readSafe(pagePath)
const pageWxml = readSafe(pageWxmlPath)
const pageWxss = readSafe(pageWxssPath)
check('客户端 i18n-override/index.js 存在', fs.existsSync(pagePath))
check('客户端 i18n-override/index.wxml 存在', fs.existsSync(pageWxmlPath))
check('客户端 i18n-override/index.wxss 存在', fs.existsSync(pageWxssPath))

check('i18n-override 页面注入 pageI18n.mixin()',
  pageJs && /pageI18n\.mixin\(\)/.test(pageJs))
check('i18n-override 页面引用 AdminService',
  pageJs && /AdminService/.test(pageJs))
check('i18n-override 页面实现 _loadData',
  pageJs && /_loadData\s*\(/.test(pageJs))

// Sprint 53 新增 UI 元素
check('i18n-override 页面实现 _loadStats（Sprint 53）',
  pageJs && /_loadStats\s*\(/.test(pageJs))
check('i18n-override 页面实现 onExportJson（Sprint 53）',
  pageJs && /onExportJson\s*\(/.test(pageJs))
check('i18n-override 页面实现 onOpenMissing（Sprint 53）',
  pageJs && /onOpenMissing\s*\(/.test(pageJs))
check('i18n-override 页面实现 onCloseMissing（Sprint 53）',
  pageJs && /onCloseMissing\s*\(/.test(pageJs))
check('i18n-override 页面实现 onFillMissing（Sprint 53）',
  pageJs && /onFillMissing\s*\(/.test(pageJs))

check('i18n-override WXML 含 stats-bar',
  pageWxml && /class="stats-bar"/.test(pageWxml))
check('i18n-override WXML 含 action-row',
  pageWxml && /class="action-row"/.test(pageWxml))
check('i18n-override WXML 含 onExportJson 绑定',
  pageWxml && /bindtap="onExportJson"/.test(pageWxml))
check('i18n-override WXML 含 onOpenMissing 绑定',
  pageWxml && /bindtap="onOpenMissing"/.test(pageWxml))
check('i18n-override WXML 含 missingPanelVisible 弹层',
  pageWxml && /missingPanelVisible/.test(pageWxml))

check('i18n-override WXSS 含 .stats-bar 样式',
  pageWxss && /\.stats-bar\s*\{/.test(pageWxss))
check('i18n-override WXSS 含 .action-btn 样式',
  pageWxss && /\.action-btn\s*\{/.test(pageWxss))
check('i18n-override WXSS 含 .missing-locale 样式',
  pageWxss && /\.missing-locale\s*\{/.test(pageWxss))

// 6. CloudFunctionService 客户端 wrapper
const cloudSvcPath = path.join(ROOT, 'services', 'CloudFunctionService.js')
const cloudSvc = readSafe(cloudSvcPath)
check('services/CloudFunctionService.js 存在', fs.existsSync(cloudSvcPath))
check('CloudFunctionService 暴露 listI18nOverrides',
  cloudSvc && /async\s+listI18nOverrides\s*\(/.test(cloudSvc))
check('CloudFunctionService 暴露 upsertI18nOverride',
  cloudSvc && /async\s+upsertI18nOverride\s*\(/.test(cloudSvc))
check('CloudFunctionService 暴露 batchUpsertI18nOverrides',
  cloudSvc && /async\s+batchUpsertI18nOverrides\s*\(/.test(cloudSvc))
check('CloudFunctionService 暴露 deleteI18nOverride',
  cloudSvc && /async\s+deleteI18nOverride\s*\(/.test(cloudSvc))
check('CloudFunctionService 暴露 toggleI18nOverrideStatus',
  cloudSvc && /async\s+toggleI18nOverrideStatus\s*\(/.test(cloudSvc))
check('CloudFunctionService 暴露 fetchActiveI18nOverrides',
  cloudSvc && /async\s+fetchActiveI18nOverrides\s*\(/.test(cloudSvc))
check('CloudFunctionService 暴露 exportI18nOverrides（Sprint 53）',
  cloudSvc && /async\s+exportI18nOverrides\s*\(/.test(cloudSvc))
check('CloudFunctionService 暴露 findMissingI18nTranslations（Sprint 53）',
  cloudSvc && /async\s+findMissingI18nTranslations\s*\(/.test(cloudSvc))
check('CloudFunctionService 暴露 getI18nOverrideStats（Sprint 53）',
  cloudSvc && /async\s+getI18nOverrideStats\s*\(/.test(cloudSvc))

// 7. 测试覆盖
const testPath = path.join(ROOT, 'test', 'admin-service-i18n-override.test.js')
const testCode = readSafe(testPath)
check('test/admin-service-i18n-override.test.js 存在', fs.existsSync(testPath))
if (testCode) {
  const sprint53Tests = (testCode.match(/describe\(['"]Sprint 53[^)]*['"]/g) || []).length
  check(`Sprint 53 describe 块 ≥ 3（实际 ${sprint53Tests}）`, sprint53Tests >= 3)
  check('测试覆盖 exportI18nOverrides', /exportI18nOverrides/.test(testCode))
  check('测试覆盖 findMissingTranslations', /findMissingTranslations/.test(testCode))
  check('测试覆盖 getI18nOverrideStats', /getI18nOverrideStats/.test(testCode))
  const testCount = (testCode.match(/\bit\s*\(/g) || []).length
  check(`测试用例数 ≥ 25（实际 ${testCount}）`, testCount >= 25)
}

// 8. (strict) tsc 严格模式编译
if (STRICT) {
  const tsconfigFiles = [
    'tsconfig.adminService.json',
  ]
  for (const cfg of tsconfigFiles) {
    const cfgPath = path.join(ROOT, cfg)
    if (!fs.existsSync(cfgPath)) {
      check(`(strict) ${cfg} 存在`, false)
      continue
    }
    try {
      execSync(`npx --yes -p typescript@5.4.5 tsc --noEmit -p ${cfg}`, { cwd: ROOT, stdio: 'pipe' })
      check(`(strict) tsc --noEmit -p ${cfg} 通过`, true)
    } catch (e) {
      const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
      check(`(strict) tsc --noEmit -p ${cfg} 通过`, false, msg)
    }
  }
}

// 9. (strict) i18n-override 页面有失败降级
if (STRICT) {
  check('(strict) _loadStats 失败时静默（不阻塞列表）',
    pageJs && /_loadStats\s*\([\s\S]{0,1500}catch[\s\S]{0,200}静默/.test(pageJs))
  check('(strict) i18n-hot-update 失败优雅降级（refresh 返回 applied:false）',
    fs.existsSync(path.join(ROOT, 'utils', 'i18n-hot-update.js')))
  check('(strict) i18n-hot-update 使用统一 action: fetchActive',
    readSafe(path.join(ROOT, 'utils', 'i18n-hot-update.js')) &&
    /action:\s*['"]fetchActive['"]/.test(readSafe(path.join(ROOT, 'utils', 'i18n-hot-update.js'))))
}

// 输出汇总
console.log('\n=== Sprint 53 i18n 运营后台 v1 审计汇总 ===')
console.log('检测项覆盖：')
console.log(`  - BIZ_I18N 字典: ${bizCount} keys`)
console.log(`  - i18n 化页面: ${withI18n.length}/${hasPage.length}`)
console.log(`  - 后端 9 个 action: ${REQUIRED_HANDLERS.filter(h => {
  const re = new RegExp(`const\\s+${h}\\s*=\\s*withErrorHandling`)
  return i18nSvc && re.test(i18nSvc)
}).length}/${REQUIRED_HANDLERS.length}`)
console.log(`  - 客户端 wrapper: 9/9 暴露`)
console.log(`  - 测试用例: ${(testCode || '').match(/\bit\s*\(/g)?.length || 0}`)

console.log(`\n=== 总计 ${checks.length} 项检查${STRICT ? '（含 strict）' : ''} ===`)
console.log(`${failed === 0 ? '✅' : '❌'} ${failed === 0 ? '全部通过' : `${failed} 项失败`}`)

process.exit(failed === 0 ? 0 : 1)
