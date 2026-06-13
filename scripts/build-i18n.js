#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 16: i18n 字典预编译为 JSON（CDN 友好）
 *
 * 目标：
 *   - 把 cloudfunctions/common/errors-i18n.ts 的 DEFAULT_I18N 拆成 3 个 JSON
 *     （zh-CN / en-US / ja-JP），便于小程序端走 CDN 加载，避免打大包
 *   - 同时输出 merged JSON（含 BIZ_I18N + DEFAULT_I18N），覆盖端到端文案
 *   - 输出 manifest.json（带版本号、生成时间、code 数量）
 *   - 集成到 npm run build:i18n
 *
 * 设计取舍：
 *   - 仅生成 JSON，不上传 CDN（CDN 上传由 deploy 脚本完成）
 *   - 输出目录 dist/i18n/，保持与 docs/CHANGELOG 一致风格
 *   - JSON 用紧凑格式（无空白），减小体积
 *   - 同时生成 ts 占位声明（types/i18n-cdn.d.ts）便于端上引用
 *
 * 集成：
 *   - 前端 utils/i18n.js → loadFromCdn(url) 用 wx.request 拉 JSON 替换内置字典
 *   - 运营后台可热更新 CDN 上的 JSON，下发后前端拉新版本
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const I18N_MODULE = require(path.join(ROOT, 'cloudfunctions', 'common', 'errors-i18n.js'))
const MINI_I18N = require(path.join(ROOT, 'utils', 'i18n.js'))

const OUT_DIR = path.join(ROOT, 'dist', 'i18n')
const TYPES_DIR = path.join(ROOT, 'types')

const SUPPORTED_LOCALES = ['zh-CN', 'en-US', 'ja-JP']

// =====================================================================
// 工具：确保目录存在
// =====================================================================
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// =====================================================================
// 主流程
// =====================================================================
function build() {
  console.log('[build:i18n] start ...')
  ensureDir(OUT_DIR)
  ensureDir(TYPES_DIR)

  // 1. errors-i18n.ts → 按 locale 拆 JSON
  const { DEFAULT_I18N, ERROR_CODE_GROUPS, exportLocaleDictionary, resolveI18nMessage } = I18N_MODULE
  const codeCount = Object.keys(DEFAULT_I18N).length

  // 1.1 错误码字典（按 locale）
  for (const locale of SUPPORTED_LOCALES) {
    const dict = exportLocaleDictionary(locale)
    const filePath = path.join(OUT_DIR, `errors.${locale}.json`)
    fs.writeFileSync(filePath, JSON.stringify(dict), 'utf8')
    console.log(`[build:i18n] wrote ${path.relative(ROOT, filePath)} (${Object.keys(dict).length} codes)`)
  }

  // 1.2 错误码全量字典（含所有 locale，方便运维/后端查询）
  const allLocales = {}
  for (const locale of SUPPORTED_LOCALES) {
    allLocales[locale] = exportLocaleDictionary(locale)
  }
  const allPath = path.join(OUT_DIR, 'errors.all.json')
  fs.writeFileSync(allPath, JSON.stringify({
    locales: SUPPORTED_LOCALES,
    codes: DEFAULT_I18N,
    groups: ERROR_CODE_GROUPS,
  }, null, 0), 'utf8')
  console.log(`[build:i18n] wrote ${path.relative(ROOT, allPath)}`)

  // 2. utils/i18n.js 业务文案 → 拆 JSON
  const { BIZ_I18N } = MINI_I18N
  for (const locale of SUPPORTED_LOCALES) {
    const dict = {}
    for (const [key, trans] of Object.entries(BIZ_I18N)) {
      dict[key] = resolveI18nBiz(trans, locale, resolveI18nMessage)
    }
    const filePath = path.join(OUT_DIR, `biz.${locale}.json`)
    fs.writeFileSync(filePath, JSON.stringify(dict), 'utf8')
    console.log(`[build:i18n] wrote ${path.relative(ROOT, filePath)} (${Object.keys(dict).length} biz texts)`)
  }

  // 3. 合并字典（错误码 + 业务文案）— 小程序端首选
  for (const locale of SUPPORTED_LOCALES) {
    const merged = {}
    // 错误码优先（避免业务文案 key 与错误码重名时错乱，但通常不重名）
    const errDict = exportLocaleDictionary(locale)
    Object.assign(merged, errDict)
    // 业务文案
    for (const [key, trans] of Object.entries(BIZ_I18N)) {
      merged[key] = resolveI18nBiz(trans, locale, resolveI18nMessage)
    }
    const filePath = path.join(OUT_DIR, `merged.${locale}.json`)
    fs.writeFileSync(filePath, JSON.stringify(merged), 'utf8')
    console.log(`[build:i18n] wrote ${path.relative(ROOT, filePath)} (${Object.keys(merged).length} entries)`)
  }

  // 4. manifest.json（版本信息）
  const manifest = {
    version: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    generatedAt: new Date().toISOString(),
    locales: SUPPORTED_LOCALES,
    codeCount,
    bizCount: Object.keys(BIZ_I18N).length,
    files: {
      errors: SUPPORTED_LOCALES.map(l => `errors.${l}.json`),
      biz: SUPPORTED_LOCALES.map(l => `biz.${l}.json`),
      merged: SUPPORTED_LOCALES.map(l => `merged.${l}.json`),
      all: ['errors.all.json'],
    },
  }
  const manifestPath = path.join(OUT_DIR, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`[build:i18n] wrote ${path.relative(ROOT, manifestPath)}`)

  // 5. 客户端 .d.ts（TypeScript 项目可引用）
  const dtsPath = path.join(TYPES_DIR, 'i18n-cdn.d.ts')
  const dtsContent = buildCdnDts(manifest)
  fs.writeFileSync(dtsPath, dtsContent, 'utf8')
  console.log(`[build:i18n] wrote ${path.relative(ROOT, dtsPath)}`)

  console.log(`[build:i18n] done. ${codeCount} error codes, ${Object.keys(BIZ_I18N).length} biz texts, ${SUPPORTED_LOCALES.length} locales.`)
}

// 业务文案解析：bypass 错误码字典
function resolveI18nBiz(trans, locale, _resolveI18nMessage) {
  if (!trans || typeof trans !== 'object') {return ''}
  return trans[locale] || trans['zh-CN'] || Object.values(trans)[0] || ''
}

function buildCdnDts(manifest) {
  return `/**
 * i18n CDN 字典 manifest（auto-generated by scripts/build-i18n.js）
 * @generatedAt ${manifest.generatedAt}
 * @version ${manifest.version}
 */

export type I18nLocale = ${manifest.locales.map(l => `'${l}'`).join(' | ')}

export interface I18nManifest {
  version: string
  generatedAt: string
  locales: I18nLocale[]
  codeCount: number
  bizCount: number
  files: {
    errors: string[]
    biz: string[]
    merged: string[]
    all: string[]
  }
}

export const I18N_MANIFEST: I18nManifest

/**
 * 小程序端加载入口（示例）
 *   import { fetchI18nDictionary } from '@/utils/i18n-cdn'
 *   const dict = await fetchI18nDictionary('en-US')
 */
export declare function fetchI18nDictionary(locale: I18nLocale): Promise<Record<string, string>>
`
}

// 入口
if (require.main === module) {
  try {
    build()
  } catch (e) {
    console.error('[build:i18n] failed:', e.message)
    console.error(e.stack)
    process.exit(1)
  }
}

module.exports = { build }
