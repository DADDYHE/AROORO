#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 23: i18n 运营后台审计脚本
 *
 * 检查项：
 *   1. cloudfunctions/i18nOverride/index.js 存在并导出 main
 *   2. cloudfunctions/i18nOverride/index.js 支持 fetchActive action
 *   3. cloudfunctions/adminService/services/i18nOverride.js 存在并导出 7 个函数
 *   4. cloudfunctions/adminService/index.js 集成 i18nOverride handlers
 *   5. adminService ACTION_PERMISSIONS 包含 i18n override 权限位
 *   6. services/CloudFunctionService.js 暴露 AdminService.i18n override 方法
 *   7. utils/i18n-hot-update.js 存在并调用 i18n.applyCustomOverrides
 *   8. utils/i18n.js 导出 applyCustomOverrides
 *   9. subpackages/partner/i18n-override/index.js 存在
 *  10. app.json 的 partner subpackage 注册了 i18n-override/index
 *  11. 集合名 i18n_overrides 在云函数与服务侧一致
 *  12. SUPPORTED_LOCALES ['zh-CN', 'en-US', 'ja-JP'] 在云函数与服务侧一致
 *  13. 单元测试：admin-service-i18n-override.test.js
 *  14. 单元测试：i18n-override-cloud-function.test.js
 *  15. 单元测试：utils-i18n-hot-update.test.js
 *  16. 集成测试：integration/i18n-override-admin-page.test.js
 *  17. 集成测试：integration/i18n-override-cloud-roundtrip.test.js（如有）
 *
 * 退出码：
 *   0 = 全部通过
 *   1 = 至少 1 项不通过
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

let failed = 0
const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) {failed++}
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. i18nOverride 云函数入口
const cfPath = path.join(ROOT, 'cloudfunctions', 'i18nOverride', 'index.js')
const cfCode = readSafe(cfPath)
check('cloudfunctions/i18nOverride/index.js 存在', fs.existsSync(cfPath))
check('i18nOverride cloud function 导出 main', /exports\.main\s*=/.test(cfCode || ''))
check('i18nOverride cloud function 支持 fetchActive', /fetchActive\s*[,\s]/.test(cfCode || ''))
check('i18nOverride cloud function 兼容别名 fetchActiveOverrides', /fetchActiveOverrides\s*:/.test(cfCode || ''))
check('i18nOverride cloud function 拒绝未知 action', /未知\s*action/.test(cfCode || ''))
check('i18nOverride cloud function 限制 limit=200', /\.limit\(\s*200\s*\)/.test(cfCode || ''))

// 2. i18nOverride admin service
const svcPath = path.join(ROOT, 'cloudfunctions', 'adminService', 'services', 'i18nOverride.js')
const svcCode = readSafe(svcPath)
check('adminService/services/i18nOverride.js 存在', fs.existsSync(svcPath))
const requiredSrvFns = [
  'listI18nOverrides',
  'getI18nOverride',
  'upsertI18nOverride',
  'batchUpsertI18nOverrides',
  'deleteI18nOverride',
  'toggleI18nOverrideStatus',
  'fetchActiveOverrides',
]
for (const fn of requiredSrvFns) {
  check(`adminService i18nOverride service 导出 ${fn}`, new RegExp(`\\b${fn}\\b`).test(svcCode || ''))
}
check('adminService i18nOverride service 注册 COLLECTION', /COLLECTION\s*=\s*['"]i18n_overrides['"]/.test(svcCode || ''))
check('adminService i18nOverride service 注册 SUPPORTED_LOCALES', /SUPPORTED_LOCALES\s*=\s*\[\s*['"]zh-CN['"]/.test(svcCode || ''))
check('adminService i18nOverride service 校验 value 长度 ≤ 2000', /2000/.test(svcCode || ''))
check('adminService i18nOverride service 限制批量 ≤ 200', /items\.length\s*>\s*200/.test(svcCode || ''))

// 3. adminService index 集成
const adminIdx = readSafe(path.join(ROOT, 'cloudfunctions', 'adminService', 'index.js'))
check('adminService/index.js 引入 i18nOverride handlers', /require\(['"][^'"]*i18nOverride['"]\)/.test(adminIdx || ''))
check('adminService/index.js 展开 i18nOverride handlers', /\.\.\.i18nOverrideHandlers/.test(adminIdx || ''))
const requiredPerms = [
  'listI18nOverrides',
  'getI18nOverride',
  'upsertI18nOverride',
  'batchUpsertI18nOverrides',
  'deleteI18nOverride',
  'toggleI18nOverrideStatus',
  'fetchActiveOverrides',
]
for (const perm of requiredPerms) {
  check(`adminService ACTION_PERMISSIONS 包含 ${perm}`, new RegExp(`${perm}\\s*:`).test(adminIdx || ''))
}

// 4. CloudFunctionService 客户端封装
const cfSvc = readSafe(path.join(ROOT, 'services', 'CloudFunctionService.js'))
check('services/CloudFunctionService.js 暴露 listI18nOverrides', /listI18nOverrides\s*\(/.test(cfSvc || ''))
check('services/CloudFunctionService.js 暴露 upsertI18nOverride', /upsertI18nOverride\s*\(/.test(cfSvc || ''))
check('services/CloudFunctionService.js 暴露 fetchActiveI18nOverrides', /fetchActiveI18nOverrides\s*\(/.test(cfSvc || ''))
check('CloudFunctionService 调用 i18nOverride 云函数', /['"]i18nOverride['"]/.test(cfSvc || ''))

// 5. utils/i18n-hot-update.js
const hot = readSafe(path.join(ROOT, 'utils', 'i18n-hot-update.js'))
check('utils/i18n-hot-update.js 存在', fs.existsSync(path.join(ROOT, 'utils', 'i18n-hot-update.js')))
check('utils/i18n-hot-update.js 调用 i18nOverride 云函数', /name\s*:\s*['"]i18nOverride['"]/.test(hot || ''))
check('utils/i18n-hot-update.js 导出 refresh', /\brefresh\s*[,}]/.test(hot || ''))
check('utils/i18n-hot-update.js 导出 refreshIfStale', /\brefreshIfStale\b/.test(hot || ''))
check('utils/i18n-hot-update.js 导出 bootstrapOnLaunch', /\bbootstrapOnLaunch\b/.test(hot || ''))
check('utils/i18n-hot-update.js 调用 i18n.applyCustomOverrides', /applyCustomOverrides\s*\(/.test(hot || ''))
check('utils/i18n-hot-update.js 实现并发去重（_inFlight）', /_inFlight/.test(hot || ''))
check('utils/i18n-hot-update.js 实现节流（_lastFetchAt）', /_lastFetchAt/.test(hot || ''))

// 6. utils/i18n.js 暴露 applyCustomOverrides
const i18nUtil = readSafe(path.join(ROOT, 'utils', 'i18n.js'))
check('utils/i18n.js 导出 applyCustomOverrides', /applyCustomOverrides/.test(i18nUtil || ''))

// 7. 运营后台页面
const adminPage = readSafe(path.join(ROOT, 'subpackages', 'partner', 'i18n-override', 'index.js'))
const adminPageDir = path.join(ROOT, 'subpackages', 'partner', 'i18n-override')
check('subpackages/partner/i18n-override/index.js 存在', fs.existsSync(path.join(adminPageDir, 'index.js')))
check('partner i18n-override 页面调用 AdminService.listI18nOverrides', /listI18nOverrides/.test(adminPage || ''))
check('partner i18n-override 页面调用 AdminService.upsertI18nOverride', /upsertI18nOverride/.test(adminPage || ''))
check('partner i18n-override 页面调用 AdminService.deleteI18nOverride', /deleteI18nOverride/.test(adminPage || ''))
check('partner i18n-override 页面调用 AdminService.toggleI18nOverrideStatus', /toggleI18nOverrideStatus/.test(adminPage || ''))

// 8. app.json 注册页面
const appJson = readSafe(path.join(ROOT, 'app.json'))
check('app.json partner subpackage 注册 i18n-override/index', /i18n-override\/index/.test(appJson || ''))

// 9. 一致性：collection 名在 cloud function 与 service 一致
const cfCollection = /['"]i18n_overrides['"]/.test(cfCode || '')
const svcCollection = /['"]i18n_overrides['"]/.test(svcCode || '')
check('i18n_override 集合名一致（cloud function & service）', cfCollection && svcCollection)

// 10. 一致性：SUPPORTED_LOCALES 在 cloud function 与 service 一致
const cfLocales = /SUPPORTED_LOCALES\s*=\s*\[\s*['"]zh-CN['"]\s*,\s*['"]en-US['"]\s*,\s*['"]ja-JP['"]/.test(cfCode || '')
const svcLocales = /SUPPORTED_LOCALES\s*=\s*\[\s*['"]zh-CN['"]\s*,\s*['"]en-US['"]\s*,\s*['"]ja-JP['"]/.test(svcCode || '')
check('SUPPORTED_LOCALES 一致（zh-CN/en-US/ja-JP）', cfLocales && svcLocales)

// 11. 单元测试
const unitTests = [
  'admin-service-i18n-override.test.js',
  'i18n-override-cloud-function.test.js',
  'utils-i18n-hot-update.test.js',
]
for (const t of unitTests) {
  check(`单元测试 ${t} 存在`, fs.existsSync(path.join(ROOT, 'test', t)))
}

// 12. 集成测试
const intTests = [
  'i18n-override-admin-page.test.js',
]
for (const t of intTests) {
  check(`集成测试 ${t} 存在`, fs.existsSync(path.join(ROOT, 'test', 'integration', t)))
}

// 13. 端到端往返测试（如果有）
const roundtripTest = path.join(ROOT, 'test', 'integration', 'i18n-override-cloud-roundtrip.test.js')
if (fs.existsSync(roundtripTest)) {
  check('集成测试 i18n-override-cloud-roundtrip.test.js 存在', true)
}

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) {process.exit(1)}
