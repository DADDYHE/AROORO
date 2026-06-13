/**
 * Sprint 20: 收集硬编码中文字符串并生成 BIZ_I18N 字典扩充
 *
 * 功能：
 *   - 扫描 pages/ + subpackages/ 下所有 .js 文件
 *   - 提取所有硬编码中文字符串
 *   - 去重
 *   - 与现有 BIZ_I18N 对比，输出新增字符串
 *   - 自动生成 KEY（基于字符串 hash）
 *   - 输出为可粘贴到 utils/i18n.js 的 JS 片段
 *
 * 用法：
 *   node scripts/collect-zh-strings.js           # 提取
 *   node scripts/collect-zh-strings.js --apply   # 同时更新 utils/i18n.js
 */

const fs = require('fs')
const path = require('path')

const I18N_PATH = path.join(__dirname, '..', 'utils', 'i18n.js')
const i18nModule = require(I18N_PATH)
const BIZ_I18N = i18nModule.BIZ_I18N || {}

// 字符串 → key 的反向索引
const STR2KEY = {}
for (const [key, trans] of Object.entries(BIZ_I18N)) {
  if (trans['zh-CN']) {
    STR2KEY[trans['zh-CN']] = key
  }
}

const TARGET_DIRS = ['pages', 'subpackages']

// 需要跳过的字符串（不是用户可见文案）
const SKIP_PATTERNS = [
  /^https?:\/\//, // URL
  /^\/(pages|subpackages)\//, // 路由
  /^[A-Z_]+$/, // 全部大写（key 引用）
  /^\{\{.*\}\}$/, // 模板
  /^\$\{.*\}$/, // 模板字符串
  /^yyyy|YYYY|MM|dd|HH|mm|ss/, // 日期格式
  /^\d+(\.\d+)?$/, // 数字
  /^\w+:\w+$/, // mime type
  /^[a-z]+\.png$/i, // icon 文件名
  /^#[0-9a-fA-F]{3,6}$/, // 颜色
  /^rgba?\(/, // 颜色函数
  /^[0-9]+rpx$/, // 尺寸
  /^[0-9]+%$/, // 百分比
  /^item\./, // 内部变量
  /^https:\/\/thirdwx\.qlogo\.cn/, // 头像 URL
  /^\[.*\]\s/, // [module] 开头的日志前缀
  /^console\./, // console 调用
  /^\s*$/, // 空字符串
]

/** 跳过字符串 */
function shouldSkip(s) {
  for (const p of SKIP_PATTERNS) {
    if (p.test(s)) {return true}
  }
  // 短字符串（< 2 字符）跳过（多半是噪音）
  if (s.length < 2) {return true}
  // 完全是数字+符号的字符串
  if (/^[\d.,+\-*/%()<>=\s]+$/.test(s)) {return true}
  return false
}

/** 提取 .js 文件中的中文字符串 */
function extractStrings(content) {
  const strings = new Set()
  // 匹配 'xxx' 或 "xxx"（不跨行），包含中文
  // 用 [^\r\n] 排除换行，避免误抓多行模板
  const re = /['"]([^'"\r\n]*[\u4e00-\u9fa5][^'"\r\n]*)['"]/g
  let m
  while ((m = re.exec(content)) !== null) {
    const s = m[1]
    if (!shouldSkip(s)) {
      strings.add(s)
    }
  }
  return strings
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.name === 'node_modules') {continue}
    if (e.isDirectory()) {yield* walk(p)} else if (e.isFile() && e.name.endsWith('.js')) {yield p}
  }
}

/** 把中文字符串转换为 KEY */
function toKey(zh, index) {
  if (STR2KEY[zh]) {return STR2KEY[zh]}
  // 简单 hash 生成 KEY
  let hash = 0
  for (let i = 0; i < zh.length; i++) {
    hash = (hash * 31 + zh.charCodeAt(i)) >>> 0
  }
  return `BIZ_${hash.toString(36).toUpperCase()}`
}

function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const checkMode = args.includes('--check')

  const allStrings = new Set()
  const fileCount = new Map()

  for (const d of TARGET_DIRS) {
    for (const f of walk(d)) {
      const c = fs.readFileSync(f, 'utf8')
      const strings = extractStrings(c)
      if (strings.size > 0) {
        fileCount.set(f, strings.size)
        for (const s of strings) {
          allStrings.add(s)
        }
      }
    }
  }

  // 找出不在 BIZ_I18N 中的新字符串
  const newStrings = []
  for (const s of allStrings) {
    if (!STR2KEY[s]) {
      newStrings.push(s)
    }
  }

  console.log(`扫描目录: ${TARGET_DIRS.join(', ')}`)
  console.log(`含中文的文件数: ${fileCount.size}`)
  console.log(`不重复的中文字符串总数: ${allStrings.size}`)
  console.log(`已存在于 BIZ_I18N: ${allStrings.size - newStrings.length}`)
  console.log(`新增待添加: ${newStrings.length}`)

  if (checkMode) {
    if (newStrings.length > 0) {
      console.log(`\n[FAIL] ${newStrings.length} 个新字符串未添加到 BIZ_I18N`)
      console.log('请运行 `npm run i18n:collect:zh:apply` 同步字典')
      process.exit(1)
    } else {
      console.log('\n[PASS] 所有中文字符串已在 BIZ_I18N 中')
      process.exit(0)
    }
  }

  if (newStrings.length === 0) {
    console.log('\n无新字符串需要添加')
    return
  }

  // 生成新 KEY + 占位文案（en-US 和 ja-JP 先用 zh-CN 兜底，后续人工翻译）
  const newEntries = []
  for (const s of newStrings) {
    const key = toKey(s, 0)
    if (BIZ_I18N[key] && BIZ_I18N[key]['zh-CN'] !== s) {
      // 哈希冲突，KEY 已被占用但内容不同 → 用编号版本
      let i = 2
      while (BIZ_I18N[`${key}_${i}`]) {i++}
      newEntries.push({
        key: `${key}_${i}`,
        zh: s,
        en: s, // 临时占位
        ja: s, // 临时占位
      })
    } else {
      newEntries.push({
        key,
        zh: s,
        en: s,
        ja: s,
      })
    }
  }

  // 写入文件 / 输出
  if (apply) {
    const content = fs.readFileSync(I18N_PATH, 'utf8')
    // 找到 BIZ_I18N = { 的位置
    const startIdx = content.indexOf('const BIZ_I18N = {')
    if (startIdx < 0) {
      console.error('未找到 BIZ_I18N 定义')
      process.exit(1)
    }
    // 找到 BIZ_I18N 块的结束 } 位置（depth 匹配）
    let depth = 0
    let endIdx = -1
    for (let i = startIdx; i < content.length; i++) {
      const ch = content[i]
      if (ch === '{') {depth++} else if (ch === '}') {
        depth--
        if (depth === 0) {
          endIdx = i
          break
        }
      }
    }
    if (endIdx < 0) {
      console.error('无法找到 BIZ_I18N 结束位置')
      process.exit(1)
    }

    // 在 endIdx 前插入新条目
    const newBlock = `\n${newEntries
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(e => `  ${e.key}: {\n    'zh-CN': ${JSON.stringify(e.zh)},\n    'en-US': ${JSON.stringify(e.en)},\n    'ja-JP': ${JSON.stringify(e.ja)},\n  },\n`)
      .join('')}`

    const newContent = content.slice(0, endIdx) + newBlock + content.slice(endIdx)
    fs.writeFileSync(I18N_PATH, newContent, 'utf8')
    console.log(`\n已写入 ${newEntries.length} 个新条目到 ${I18N_PATH}`)
  } else {
    console.log('\n--- 新条目预览（前 30 条）---')
    for (const e of newEntries.slice(0, 30)) {
      console.log(`  ${e.key}: ${JSON.stringify(e.zh)}`)
    }
    if (newEntries.length > 30) {
      console.log(`  ... 共 ${newEntries.length} 条`)
    }
    console.log('\n使用 --apply 写入文件')
  }
}

main()
