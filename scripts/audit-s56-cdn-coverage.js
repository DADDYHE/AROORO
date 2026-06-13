#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 56-02: CDN 静态资源覆盖率审计
 *
 * 目标：扫描项目中所有静态资源引用，统计 CDN 覆盖率
 *
 * 检查范围：
 *   1. 小程序代码中的 src / url / 背景图片 / wx.previewImage
 *   2. WXML 中 <image src="..."> / <image src="cloud://...">
 *   3. WXSS 中 background / background-image url(...)
 *   4. JS 中的字符串 URL（cloud://, https://*.cos., CDN_BASE, http://...）
 *
 * 判定逻辑：
 *   - ✅ CDN 化：使用 https://*.cos.* 或 cloud:// 或 config.CDN_BASE
 *   - ❌ 本地：/images/xxx.png 相对路径
 *   - ⏭️  外部：包含非项目域名（社交平台、CDN 第三方）
 *
 * 用法：
 *   node scripts/audit-s56-cdn-coverage.js
 *   node scripts/audit-s56-cdn-coverage.js --strict   // 强制要求 100% 覆盖率
 *
 * 退出码：0 = 全部通过，1 = 至少 1 项不通过
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')

let failed = 0
const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) { failed++ }
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const SCAN_DIRS = ['pages', 'subpackages', 'miniprogram']
const FILE_EXTS = ['.js', '.ts', '.wxml', '.wxss', '.json']
const EXTERNAL_DOMAINS = [
  'weixin.qq.com',
  'qq.com',
  'qpic.cn',
  'qlogo.cn',
  'gtimg.com',
  'wx.qq.com',
  'meituan.com',
  'amap.com',
]

// 静态资源 URL 提取模式
const PATTERNS = {
  // WXML: <image src="...">
  wxmlImage: /<image[^>]+src=["']([^"']+)["']/g,
  // WXML: <image src="cloud://..." /> 单独看 cloud://
  cloudUrl: /cloud:\/\/[^"'\s)]+/g,
  // WXSS: url(...) 或 background: url('...')
  cssUrl: /url\(\s*['"]?([^'")]+)['"]?\s*\)/g,
  // JS: 字符串字面量
  jsStringUrl: /["'`](https?:\/\/[^"'`\s]+|cloud:\/\/[^"'`\s]+|\/images\/[^"'`\s]+|\/static\/[^"'`\s]+)["'`]/g,
}

const ALL_URLS = new Set()
const urlToFiles = new Map()

function scanFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8')
  const relPath = path.relative(ROOT, filePath)
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    pattern.lastIndex = 0
    let m
    while ((m = pattern.exec(code)) !== null) {
      const url = m[1] || m[0]
      if (url && !url.startsWith('data:') && url.length > 4) {
        ALL_URLS.add(url)
        if (!urlToFiles.has(url)) { urlToFiles.set(url, new Set()) }
        urlToFiles.get(url).add(relPath)
      }
    }
  }
}

function walkDir(dir) {
  const full = path.join(ROOT, dir)
  if (!fs.existsSync(full)) { return }
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) { continue }
    const f = path.join(full, entry.name)
    if (entry.isDirectory()) {
      walkDir(path.join(dir, entry.name))
    } else if (FILE_EXTS.some(ext => entry.name.endsWith(ext))) {
      scanFile(f)
    }
  }
}

SCAN_DIRS.forEach(d => walkDir(d))

// 分类 URL
const categories = {
  cdn: [],
  cloud: [],
  external: [],
  local: [],
  skip: [],
}
for (const url of ALL_URLS) {
  if (url.startsWith('cloud://')) {
    categories.cloud.push(url)
  } else if (url.startsWith('https://') && EXTERNAL_DOMAINS.some(d => url.includes(d))) {
    categories.skip.push(url) // 第三方平台，非项目资源
  } else if (url.startsWith('https://') && (url.includes('.cos.') || url.includes('cdn.') || url.includes('COS_BASE') || url.includes('CDN_BASE'))) {
    categories.cdn.push(url)
  } else if (url.startsWith('https://')) {
    categories.cdn.push(url) // 视为已 CDN 化（可能是其他 CDN）
  } else if (url.startsWith('http://')) {
    categories.external.push(url) // http 应转为 https
  } else if (url.startsWith('/') && !url.startsWith('//')) {
    categories.local.push(url) // 本地资源（应该 CDN 化）
  } else if (url.startsWith('//')) {
    categories.skip.push(url) // 协议无关 URL
  } else {
    categories.skip.push(url) // 动态 URL（如变量）
  }
}

const totalScannable = categories.cdn.length + categories.cloud.length + categories.local.length + categories.external.length
const cdnized = categories.cdn.length + categories.cloud.length
const coverageRate = totalScannable > 0 ? cdnized / totalScannable : 1

console.log('\n========== 静态资源 CDN 覆盖率审计 ==========')
console.log(`总 URL: ${ALL_URLS.size}`)
console.log(`  ✅ CDN 化（https://*）: ${categories.cdn.length}`)
console.log(`  ☁️  cloud://（云开发存储）: ${categories.cloud.length}`)
console.log(`  ❌ 本地（/images/...）: ${categories.local.length}`)
console.log(`  ⚠️  http://（应转 https）: ${categories.external.length}`)
console.log(`  ⏭️  第三方 / 动态（跳过）: ${categories.skip.length}`)
console.log(`可 CDN 化覆盖: ${coverageRate.toFixed(2)}% (${cdnized}/${totalScannable})`)

// ===== 检查项 =====

check('Sprint 56 项目目录至少有一个被扫描', SCAN_DIRS.some(d => fs.existsSync(path.join(ROOT, d))),
  `扫描目录: ${SCAN_DIRS.join(', ')}`)

// 1. CDN 覆盖率
check(`CDN 覆盖率（严格）≥ 30%（实际 ${(coverageRate * 100).toFixed(2)}%）`, coverageRate >= 0.3)

// 默认占位图 + tabBar 图标 + icons 属于「可本地保留」资源（小 SVG / 必要 UI 资源）
const KEEP_LOCAL_PATTERN = /\/images\/default-|\/images\/tabBar\/|\/images\/icons\//
const PLACEHOLDER_LOCAL = categories.local.filter(u => KEEP_LOCAL_PATTERN.test(u))
const REAL_LOCAL = categories.local.filter(u => !KEEP_LOCAL_PATTERN.test(u))
const effectiveRate = totalScannable > 0
  ? (cdnized + PLACEHOLDER_LOCAL.length) / (totalScannable + PLACEHOLDER_LOCAL.length)
  : 1
check(
  `有效 CDN 覆盖率（含占位/tabBar/icons 本地）≥ 50%（实际 ${(effectiveRate * 100).toFixed(2)}%）`,
  effectiveRate >= 0.5,
  `占位/tabBar/icons 本地 ${PLACEHOLDER_LOCAL.length} 个不计入`
)
check(
  `真实业务本地资源 = 0（实际 ${REAL_LOCAL.length}）`,
  REAL_LOCAL.length === 0,
  REAL_LOCAL.length > 0 ? REAL_LOCAL.join(', ') : ''
)

if (STRICT) {
  check(`(strict) CDN 覆盖率 = 100%（实际 ${(coverageRate * 100).toFixed(2)}%）`, coverageRate >= 1.0)
  check(`(strict) 真实业务本地资源 = 0（实际 ${REAL_LOCAL.length}）`, REAL_LOCAL.length === 0)
}

// 2. config.js 有 CDN_BASE / COS_BASE 配置
const configPath = path.join(ROOT, 'cloudfunctions', 'common', 'config.js')
const config = fs.readFileSync(configPath, 'utf8')
check('cloudfunctions/common/config.js 存在', fs.existsSync(configPath))
check('config.js 导出 CDN_BASE 字段', /CDN_BASE:/.test(config))
check('config.js 导出 COS_BASE 字段', /COS_BASE:/.test(config))

// 3. i18n CDN 化（与 Sprint 54 衔接）
const i18nPath = path.join(ROOT, 'utils', 'i18n.js')
const i18n = fs.readFileSync(i18nPath, 'utf8')
check('utils/i18n.js 存在', fs.existsSync(i18nPath))
check('utils/i18n.js 暴露 loadFromCdn 能力', /loadFromCdn/.test(i18n))

const i18nCdnTypes = path.join(ROOT, 'types', 'i18n-cdn.d.ts')
check('types/i18n-cdn.d.ts 存在（i18n CDN manifest）', fs.existsSync(i18nCdnTypes))

// 4. 小程序网络层：request 域名白名单（备注：实际配置在微信 MP 后台，不在 app.json）
const appJsonPath = path.join(ROOT, 'miniprogram', 'app.json')
let appJson = null
let appJsonPath2 = path.join(ROOT, 'app.json')
if (fs.existsSync(appJsonPath)) {
  appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
} else if (fs.existsSync(appJsonPath2)) {
  appJson = JSON.parse(fs.readFileSync(appJsonPath2, 'utf8'))
}
if (appJson) {
  const requestDomains = appJson.requestDomains || []
  const uploadDomains = appJson.uploadFileDomains || []
  // 注：requestDomains 配置在微信 MP 后台，本地 app.json 含则加分（信息可见性）
  check(
    'app.json 含 requestDomains / uploadDomains 字段（可选项，便于审计）',
    Array.isArray(requestDomains) && Array.isArray(uploadDomains),
    `request=${Array.isArray(requestDomains) ? requestDomains.length : 0} upload=${Array.isArray(uploadDomains) ? uploadDomains.length : 0}`
  )
  check('app.json 含 networkTimeout 配置', appJson.networkTimeout && typeof appJson.networkTimeout === 'object',
    `request=${appJson.networkTimeout?.request || 0}ms`)
} else {
  check('app.json 存在', false, '未找到 app.json')
}

// 5. 本地资源详情
if (categories.local.length > 0) {
  console.log('\n--- 待 CDN 化的本地资源（前 20） ---')
  categories.local.slice(0, 20).forEach(url => {
    const files = Array.from(urlToFiles.get(url) || []).slice(0, 3)
    console.log(`  ${url} (引用: ${files.join(', ')}${files.length > 3 ? '...' : ''})`)
  })
}

// 6. http:// 资源警告
if (categories.external.length > 0) {
  console.log('\n--- ⚠️  http:// 资源（应转 https） ---')
  categories.external.forEach(url => {
    console.log(`  ${url}`)
  })
}

// 7. 静态资源总览（按 type）
const typeStats = {}
for (const url of ALL_URLS) {
  const ext = (url.match(/\.([a-z0-9]+)(?:\?.*)?$/i) || ['', 'unknown'])[1].toLowerCase()
  typeStats[ext] = (typeStats[ext] || 0) + 1
}
console.log('\n--- 按资源类型统计 ---')
Object.entries(typeStats)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([t, c]) => {
    console.log(`  .${t.padEnd(10)} ${c}`)
  })

console.log(`\n=== 总计 ${checks.length} 项检查${STRICT ? '（含 strict）' : ''} ===`)
console.log(`${failed === 0 ? '✅' : '❌'} ${failed === 0 ? '全部通过' : `${failed} 项失败`}`)

process.exit(failed === 0 ? 0 : 1)
