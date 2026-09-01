#!/usr/bin/env node
/**
 * 校验全仓页面/组件 json 的 usingComponents 引用路径均可解析。
 *
 * 用途：组件移动/下沉、分包结构调整后运行，一次性发现路径错误，
 * 避免 DevTools 重编译报 component not found。
 *
 * 规则：
 *   - 相对路径：以 json 所在目录为基准 resolve（分包根目录页面引用同分包
 *     components 用 `./`，子目录页面用 `../`）
 *   - 绝对路径：以项目根为基准 resolve（小程序 `/<path>` 语义）
 *
 * 运行：node scripts/verify-using-components-paths.js
 * 退出码：0 全部可解析；1 存在缺失（逐条打印）
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SKIP_DIRS = new Set(['node_modules', 'dist', 'miniprogram_npm', '.git'])

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.json')) out.push(p)
  }
  return out
}

function existsBase(p) {
  return fs.existsSync(p) || fs.existsSync(p + '.js') || fs.existsSync(p + '.wxml') || fs.existsSync(p + '.json')
}

let bad = 0, relChecked = 0, absChecked = 0
for (const f of walk(ROOT)) {
  let j
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { continue }
  for (const [name, ref] of Object.entries(j.usingComponents || {})) {
    if (typeof ref !== 'string') continue
    const resolved = ref.startsWith('/')
      ? (absChecked++, path.resolve(ROOT, ref.slice(1)))
      : (relChecked++, path.resolve(path.dirname(f), ref))
    if (!existsBase(resolved)) {
      bad++
      console.log(`MISSING: ${path.relative(ROOT, f)} -> ${name} = ${ref} => resolved ${resolved}`)
    }
  }
}
console.log(`checked ${relChecked} relative + ${absChecked} absolute refs, ${bad} missing`)
process.exit(bad ? 1 : 0)
