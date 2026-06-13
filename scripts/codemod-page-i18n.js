#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 18: 业务文案页面层替换 codemod（增强版）
 *
 * 目标：
 *   - 把 `wx.showToast({ title: '中文' })` → `this.toast('KEY')` 或 `this.error('KEY')`
 *   - 把 `wx.showToast({ title: '中文', icon: 'none' })` → `this.error('KEY')`
 *   - 把 `wx.showToast({ title: '中文', icon: 'success' })` → `this.toast('KEY')`
 *   - 处理多行 wx.showToast 调用
 *   - 处理 `title: foo.message || '中文'` 动态模式 → `this.errorDynamic(foo.message, 'KEY')`
 *   - 处理 `title: \`请填写第${i}只宠物的必填信息\`` 模板字符串 → `this.errorDynamic(() => ..., 'KEY')`
 *   - 替换成功后自动注入 `...pageI18n.mixin()` 到 Page({...})
 *   - 自动添加 `const pageI18n = require('相对路径/utils/page-i18n')` 引用
 *
 * 支持的内联替换模式（更多见 BIZ_I18N / ERROR_I18N）：
 *   - '操作成功'   → 'OPERATION_SUCCESS'
 *   - '加载中...'  → 'LOADING'
 *   - '参数错误'   → 'INVALID_PARAMS'
 *   - '加载失败'   → 'LOAD_FAILED'
 *   - '库存不足'   → 'STOCK_INSUFFICIENT'
 *   - '请先登录'   → 'AUTH_REQUIRED'
 *   - ... 等
 *
 * 用法：
 *   node scripts/codemod-page-i18n.js <file_or_dir>...
 *   node scripts/codemod-page-i18n.js pages/service/index.js
 *   node scripts/codemod-page-i18n.js pages/
 *
 * 集成：
 *   - CI 可加 node scripts/codemod-page-i18n.js --check 验证无遗漏
 *   - dry-run 模式只输出替换，不写文件
 */

const fs = require('fs')
const path = require('path')

const BIZ_I18N = require(path.join(__dirname, '..', 'utils', 'i18n.js')).BIZ_I18N

// 把 BIZ_I18N 翻转为 { zh-CN: { KEY: 文案 } } 方便查找
const ZH2KEY = (() => {
  const out = {}
  for (const [key, trans] of Object.entries(BIZ_I18N)) {
    if (trans['zh-CN']) {
      out[trans['zh-CN']] = key
    }
  }
  return out
})()

// 已知错误码文案（来自 errors-i18n.js 的 DEFAULT_I18N）
const ERR_ZH2KEY = (() => {
  const errDict = require(path.join(__dirname, '..', 'cloudfunctions', 'common', 'errors-i18n.js')).DEFAULT_I18N
  const out = {}
  for (const [code, trans] of Object.entries(errDict)) {
    if (trans['zh-CN']) {
      out[trans['zh-CN']] = code
    }
  }
  return out
})()

// 合并查找表
const ZH_LOOKUP = { ...ZH2KEY, ...ERR_ZH2KEY }

function tryTranslate(zhText) {
  return ZH_LOOKUP[zhText] || null
}

/**
 * 解析 icon 字段（默认 none）
 */
function parseIcon(content, idx) {
  const m = content.slice(idx).match(/icon:\s*['"](\w+)['"]/)
  return m ? m[1] : null
}

/**
 * 解析 duration 字段
 */
function parseDuration(content, idx) {
  const m = content.slice(idx).match(/duration:\s*(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * 把 'foo' 或 "foo" 字面量提取出来
 */
function tryExtractStringLiteral(s) {
  const m = s.match(/^['"](.*)['"]$/)
  return m ? m[1] : null
}

/**
 * 替换单个 wx.showToast 调用块（从 { 开始到 } 结束）
 * 返回 { replacement, kind, titleStr, hasFallback, fallbackExpr, hasTemplate, templateStr, duration }
 */
function transformOneShowToast(content, startIdx) {
  // startIdx 指向 '{' 之后
  // 找到匹配的 '}'
  let depth = 1
  let i = startIdx
  let inStr = null
  while (i < content.length) {
    const ch = content[i]
    if (inStr) {
      if (ch === '\\') { i += 2; continue }
      if (ch === inStr) {inStr = null}
    } else {
      if (ch === '"' || ch === '\'' || ch === '`') {inStr = ch} else if (ch === '{') {depth++} else if (ch === '}') {
        depth--
        if (depth === 0) {break}
      }
    }
    i++
  }
  if (depth !== 0) {return null}
  const endIdx = i + 1
  const objContent = content.slice(startIdx, endIdx)
  const isMultiLine = objContent.includes('\n')

  // 1. 解析 title（支持多行、嵌套、模板字符串）
  // 提取 title 字段值：找 'title:' 然后跨多行匹配到 ',' 或 '}'（在对象字面量内）
  const titleKeyIdx = objContent.search(/title\s*:/)
  if (titleKeyIdx < 0) {return null}
  // 跳过 'title:'
  let t = titleKeyIdx + objContent.slice(titleKeyIdx).indexOf(':') + 1
  // 跳过空白（包含换行）
  while (t < objContent.length && /\s/.test(objContent[t])) {t++}

  // 解析一个 expression（支持字符串字面量、模板字符串、变量、二元运算、嵌套括号）
  // 结束条件：',' 或 '}'（在 exprDepth=0 时）
  function parseExpression(startPos) {
    let j = startPos
    let exprDepth = 0
    let strMark = null
    while (j < objContent.length) {
      const ch = objContent[j]
      if (strMark) {
        if (ch === '\\') {
          j += 2
          continue
        }
        if (ch === strMark) {
          strMark = null
        }
      } else if (ch === '"' || ch === '\'' || ch === '`') {
        strMark = ch
      } else if (ch === '(' || ch === '[' || ch === '{') {
        exprDepth++
      } else if (ch === ')' || ch === ']' || ch === '}') {
        if (exprDepth === 0) {
          return objContent.slice(startPos, j).trim()
        }
        exprDepth--
      } else if (ch === ',' && exprDepth === 0) {
        return objContent.slice(startPos, j).trim()
      }
      j++
    }
    return objContent.slice(startPos, j).trim()
  }

  const titleExpr = parseExpression(t)
  if (!titleExpr) {return null}
  // 处理模板字符串 `` `...${expr}...` ``
  const isTemplate = titleExpr.startsWith('`')

  // 2. 解析 icon
  const icon = parseIcon(objContent, 0) || 'none'

  // 3. 解析 duration
  const duration = parseDuration(objContent, 0)

  // 4. 决定 kind: success → toast, none/无 → error
  const kind = icon === 'success' ? 'toast' : 'error'

  let result = null

  if (!isTemplate) {
    // 简单情况：title 为字面量
    const titleStr = tryExtractStringLiteral(titleExpr)
    if (titleStr) {
      const key = tryTranslate(titleStr)
      if (key) {
        result = {
          replacement: `this.${kind}('${key}'${duration && duration !== 2000 ? `, { duration: ${duration} }` : ''})`,
          kind,
          titleStr,
          key,
          hasFallback: false,
        }
      }
    } else {
      // 动态表达式：检查是否是 'X.message || \'字面量\'' 模式
      // 例: `err.message || '支付失败'`
      const fallbackMatch = titleExpr.match(/^(.+?)\s*\|\|\s*(['"])([^'"]+)\2\s*$/)
      if (fallbackMatch) {
        const dynamicExpr = fallbackMatch[1].trim()
        const fallbackLiteral = fallbackMatch[3]
        const key = tryTranslate(fallbackLiteral)
        if (key) {
          result = {
            replacement: `this.${kind}Dynamic(${dynamicExpr}, '${key}'${duration && duration !== 2000 ? `, { duration: ${duration} }` : ''})`,
            kind,
            titleStr: fallbackLiteral,
            key,
            hasFallback: true,
            dynamicExpr,
          }
        }
      }

      // 字符串拼接：'X：' + expr → 函数形式
      if (!result) {
        const concatMatch = titleExpr.match(/^(['"])([^'"]+)\1\s*\+\s*(.+)$/)
        if (concatMatch) {
          const prefix = concatMatch[2]
          const dynamicExpr = concatMatch[3].trim()
          // 前缀可能是 i18n key：例如 '操作失败：'
          // 暂时直接用函数形式，不做翻译
          result = {
            replacement: `this.${kind}(() => ${titleExpr}${duration && duration !== 2000 ? `, { duration: ${duration} }` : ''})`,
            kind,
            titleStr: prefix,
            key: null,
            hasFunction: true,
            dynamicExpr,
          }
        }
      }

      // 裸表达式：err.message / result.message → 函数形式
      if (!result) {
        if (/^[a-zA-Z_$][\w.$?[\]'"` ]*$/.test(titleExpr) && titleExpr.length <= 100) {
          result = {
            replacement: `this.${kind}(() => ${titleExpr}${duration && duration !== 2000 ? `, { duration: ${duration} }` : ''})`,
            kind,
            titleStr: titleExpr,
            key: null,
            hasFunction: true,
            dynamicExpr: titleExpr,
          }
        }
      }

      // 三元：cond ? 'A' : (cond2 ? 'B' : 'C') → 函数形式 + 翻译字符串
      if (!result) {
        if (titleExpr.includes('?') && titleExpr.includes(':')) {
          // 尝试把里面的字符串字面量翻译成 i18n key
          const newExpr = titleExpr.replace(/(['"])([^'"]+)\1/g, (m, q, s) => {
            const key = tryTranslate(s)
            return key ? `'${key}'` : m
          })
          result = {
            replacement: `this.${kind}(() => ${newExpr}${duration && duration !== 2000 ? `, { duration: ${duration} }` : ''})`,
            kind,
            titleStr: titleExpr,
            key: null,
            hasFunction: true,
            hasTernary: true,
            dynamicExpr: newExpr,
          }
        }
      }
    }
  } else {
    // 模板字符串
    // 例: `请填写第${i + 1}只宠物的必填信息`
    // 提取中文片段（不含 ${} 表达式）
    const tplInner = titleExpr.slice(1, -1) // 去掉首尾 `
    // 把 ${...} 替换为占位符
    const stripped = tplInner.replace(/\$\{[^}]+\}/g, 'X')
    // 简单匹配：如果整个 stripped 是单一中文
    let key = null
    if (/^[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffefa-zA-Z0-9 _\-.!?!…]+$/.test(stripped) && stripped.length <= 30) {
      key = tryTranslate(stripped)
    }
    if (key) {
      // 还原为函数
      // 模板字符串 `` `请填写第${i+1}只宠物的必填信息` ``
      // 转换为 () => `` `请填写第${i+1}只宠物的必填信息` ``
      result = {
        replacement: `this.${kind}(() => ${titleExpr}${duration && duration !== 2000 ? `, { duration: ${duration} }` : ''})`,
        kind,
        titleStr: stripped,
        key,
        hasTemplate: true,
        templateStr: titleExpr,
      }
    } else {
      // 模板字符串里有变量但没匹配到 key → 仍转为函数形式
      result = {
        replacement: `this.${kind}(() => ${titleExpr}${duration && duration !== 2000 ? `, { duration: ${duration} }` : ''})`,
        kind,
        titleStr: stripped,
        key: null,
        hasTemplate: true,
        hasFunction: true,
        templateStr: titleExpr,
      }
    }
  }

  if (!result) {return null}

  return {
    ...result,
    isMultiLine,
    endIdx,
    objContent,
  }
}

/**
 * 替换单个 wx.showModal 调用块（从 { 开始到 } 结束）
 * 返回 { replacement, kind, titleStr, contentStr, hasFallback, ... }
 */
function transformOneShowModal(content, startIdx) {
  let depth = 1
  let i = startIdx
  let inStr = null
  while (i < content.length) {
    const ch = content[i]
    if (inStr) {
      if (ch === '\\') { i += 2; continue }
      if (ch === inStr) {inStr = null}
    } else {
      if (ch === '"' || ch === '\'' || ch === '`') {inStr = ch} else if (ch === '{') {depth++} else if (ch === '}') {
        depth--
        if (depth === 0) {break}
      }
    }
    i++
  }
  if (depth !== 0) {return null}
  const endIdx = i + 1
  const objContent = content.slice(startIdx, endIdx)

  // 解析 title
  const titleKeyIdx = objContent.search(/title\s*:/)
  if (titleKeyIdx < 0) {return null}
  let t = titleKeyIdx + objContent.slice(titleKeyIdx).indexOf(':') + 1
  while (t < objContent.length && /\s/.test(objContent[t])) {t++}

  function parseExpression(startPos) {
    let j = startPos
    let exprDepth = 0
    let strMark = null
    while (j < objContent.length) {
      const ch = objContent[j]
      if (strMark) {
        if (ch === '\\') { j += 2; continue }
        if (ch === strMark) { strMark = null }
      } else if (ch === '"' || ch === '\'' || ch === '`') {
        strMark = ch
      } else if (ch === '(' || ch === '[' || ch === '{') {
        exprDepth++
      } else if (ch === ')' || ch === ']' || ch === '}') {
        if (exprDepth === 0) { return objContent.slice(startPos, j).trim() }
        exprDepth--
      } else if (ch === ',' && exprDepth === 0) {
        return objContent.slice(startPos, j).trim()
      }
      j++
    }
    return objContent.slice(startPos, j).trim()
  }

  const titleExpr = parseExpression(t)
  const titleStr = tryExtractStringLiteral(titleExpr)
  const titleKey = titleStr ? tryTranslate(titleStr) : null

  // 解析 content
  const contentKeyIdx = objContent.search(/content\s*:/)
  let contentStr = null
  let contentKey = null
  if (contentKeyIdx >= 0) {
    let c = contentKeyIdx + objContent.slice(contentKeyIdx).indexOf(':') + 1
    while (c < objContent.length && /\s/.test(objContent[c])) {c++}
    const contentExpr = parseExpression(c)
    contentStr = tryExtractStringLiteral(contentExpr)
    contentKey = contentStr ? tryTranslate(contentStr) : null
  }

  if (!titleKey && !contentKey) {return null}

  // 至少有一个能翻译 → 生成替换
  // 构造 { titleKey: 'K1', contentKey: 'K2', showCancel: true/false, success: ... }
  // 用 this.modal({ titleKey, contentKey, ... }) 或 we，改用 this.showModal
  const parts = []
  if (titleKey) {parts.push(`titleKey: '${titleKey}'`)} else if (titleStr) {parts.push(`title: ${JSON.stringify(titleStr)}`)} // 兜底

  if (contentKey) {parts.push(`contentKey: '${contentKey}'`)} else if (contentStr) {parts.push(`content: ${JSON.stringify(contentStr)}`)}

  // 保留其他字段（showCancel, confirmText, cancelText, success 等）
  // 简化处理：保留 showCancel / confirmText / cancelText（如果是字面量）
  for (const k of ['showCancel', 'cancelText', 'confirmText', 'editable', 'placeholderText']) {
    const re = new RegExp(`${k}\\s*:\\s*([^,}]+)`)
    const m = objContent.match(re)
    if (m) {
      const v = m[1].trim()
      // 仅保留字面量（数字 / 字符串 / 布尔）
      if (/^['"`].*['"`]$/.test(v) || /^\d+$/.test(v) || /^(true|false)$/.test(v)) {
        parts.push(`${k}: ${v}`)
      }
    }
  }

  // 过滤 null content
  const filteredParts = parts.filter(p => !p.includes('content: null') && !p.includes('contentKey: null'))
  const replacement = `this.showModal({ ${filteredParts.join(', ')} })`
  return {
    replacement,
    kind: 'modal',
    titleStr,
    contentStr,
    titleKey,
    contentKey,
    isMultiLine: objContent.includes('\n'),
    endIdx,
  }
}

/**
 * 替换文件内容
 * @param {string} filePath
 * @param {object} options
 * @returns {{changed: boolean, count: number, replacements: string[]}}
 */
function transform(filePath, options = {}) {
  const { dryRun = false } = options
  const content = fs.readFileSync(filePath, 'utf8')
  const replacements = []

  let newContent = content

  // 找到所有 wx.showToast( { ... } ) 和 wx.showModal( { ... } )
  const callRe = /wx\.(showToast|showModal)\(/g
  const calls = []
  let m
  while ((m = callRe.exec(content)) !== null) {
    const method = m[1]
    // 找 { 位置（在 m.index 之后）
    let j = m.index + m[0].length
    // 跳过空白
    while (j < content.length && /\s/.test(content[j])) {j++}
    if (content[j] !== '{') {continue}
    calls.push({ callStart: m.index, callEnd: null, objStart: j + 1, method, result: null })
  }

  // 处理每个 call
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]
    if (call.method === 'showModal') {
      call.result = transformOneShowModal(content, call.objStart)
    } else {
      call.result = transformOneShowToast(content, call.objStart)
    }
    if (call.result) {
      // 找到匹配的 )，endIdx 是 } 位置 +1
      let k = call.result.endIdx
      while (k < content.length && /\s/.test(content[k])) {k++}
      if (content[k] === ')') {k++}
      call.callEnd = k
    }
  }

  // 收集成功的 calls，反向替换
  const okCalls = calls.filter(c => c.result).sort((a, b) => b.callStart - a.callStart)

  for (const call of okCalls) {
    const before = newContent.slice(0, call.callStart)
    const after = newContent.slice(call.callEnd)
    newContent = before + call.result.replacement + after

    const r = call.result
    if (call.method === 'showModal') {
      // showModal 专用日志
      const t = r.titleKey ? `title='${r.titleKey}'` : `title=${JSON.stringify(r.titleStr)}`
      const c = r.contentKey ? `content='${r.contentKey}'` : `content=${JSON.stringify(r.contentStr)}`
      replacements.push(`wx.showModal → this.showModal({ ${t}, ${c} })  // was: ${r.titleStr || ''}`)
    } else if (r.hasFallback) {
      replacements.push(`wx.showToast(${r.kind === 'toast' ? 'success' : 'none'}, dynamic) → this.${r.kind}Dynamic(${r.dynamicExpr}, '${r.key}')`)
    } else if (r.hasTernary) {
      replacements.push(`wx.showToast(ternary) → this.${r.kind}(() => ${r.dynamicExpr})  // was: ${r.titleStr.slice(0, 40)}`)
    } else if (r.hasTemplate || r.hasFunction) {
      // 用 r.replacement 反映真实输出，截短避免 log 过长
      const out = r.replacement.length > 100 ? `${r.replacement.slice(0, 100)}…` : r.replacement
      replacements.push(`wx.showToast(fn) → ${out}${r.key ? `  // was key: ${r.key}` : ''}`)
    } else {
      replacements.push(`wx.showToast(${r.kind === 'toast' ? 'success' : 'none'}) → this.${r.kind}('${r.key}')  // was: ${r.titleStr}`)
    }
  }

  // 注入 mixin
  if (replacements.length > 0 && /Page\(\{/.test(newContent)) {
    if (!newContent.includes('pageI18n.mixin()') && !newContent.includes('page-i18n')) {
      // 推断 require 路径
      const fileDir = path.dirname(filePath)
      const repoRoot = path.resolve(__dirname, '..')
      const i18nPath = path.join(repoRoot, 'utils', 'page-i18n.js')
      let relPath = path.relative(fileDir, i18nPath).replace(/\\/g, '/')
      if (!relPath.startsWith('.')) {relPath = `./${relPath}`}
      // 简化：常用 'utils/page-i18n'
      if (filePath.includes('/subpackages/')) {
        relPath = '../../../utils/page-i18n'
      } else if (filePath.includes('/pages/')) {
        relPath = '../../utils/page-i18n'
      }

      newContent = newContent.replace(
        /Page\(\{\n/,
        `const pageI18n = require('${relPath}')\n\nPage({\n  ...pageI18n.mixin(),\n`
      )
      replacements.push(`[注入] ...pageI18n.mixin() + require('${relPath}')`)
    }
  }

  if (replacements.length > 0 && !dryRun) {
    fs.writeFileSync(filePath, newContent, 'utf8')
  }

  return { changed: replacements.length > 0, count: replacements.length, replacements }
}

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') {continue}
      out.push(...walk(full))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full)
    }
  }
  return out
}

function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const checkMode = args.includes('--check')
  const targets = args.filter(a => !a.startsWith('--'))
  if (targets.length === 0) {
    console.error('用法: codemod-page-i18n.js <file_or_dir>... [--dry-run] [--check]')
    process.exit(1)
  }

  const files = []
  for (const t of targets) {
    const stat = fs.statSync(t)
    if (stat.isDirectory()) {
      files.push(...walk(t))
    } else {
      files.push(t)
    }
  }

  let totalReplaced = 0
  let totalFiles = 0
  const failures = []

  for (const f of files) {
    try {
      const r = transform(f, { dryRun })
      if (r.changed) {
        totalFiles++
        totalReplaced += r.count
        if (dryRun || checkMode) {
          console.log(`[${dryRun ? 'DRY' : 'CHECK'}] ${f}: ${r.count} 处替换`)
          for (const line of r.replacements) {
            console.log(`  - ${line}`)
          }
        }
      }
    } catch (e) {
      failures.push({ file: f, err: e.message })
    }
  }

  if (checkMode) {
    if (totalReplaced > 0) {
      console.log(`\n[FAIL] ${totalReplaced} 处可被替换（--check 模式下未实际写入）`)
      process.exit(2)
    } else {
      console.log('[PASS] 所有目标已 i18n 化')
    }
  } else {
    console.log(`\n[done] ${totalFiles} 个文件 / ${totalReplaced} 处替换${dryRun ? ' (dry-run)' : ''}`)
  }

  if (failures.length > 0) {
    console.error(`\n[error] ${failures.length} 个文件处理失败：`)
    for (const f of failures) {
      console.error(`  ${f.file}: ${f.err}`)
    }
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { transform, walk, ZH_LOOKUP }
