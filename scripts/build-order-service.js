#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 28: orderService 编译脚本
 *
 * 功能：
 *   - 用 tsc 把 orders.ts 编译到 cloudfunctions/orderService/orders.js
 *   - 在 .js 顶部注入 /* eslint-disable *\/（避免 lint 误报）
 *   - 处理 deprecation 残留（删除 .js build 产物的兼容性）
 *
 * 编译目标：
 *   - cloudfunctions/orderService/orders.js
 *
 * 调用：
 *   node scripts/build-order-service.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')

// Sprint 28-30: 编译 orders.ts / payment.ts / stats.ts（与 paymentService 共享 tsc 行为）
const TARGETS = [
  path.join(ROOT, 'cloudfunctions', 'orderService', 'orders.js'),
  path.join(ROOT, 'cloudfunctions', 'orderService', 'payment.js'),
  path.join(ROOT, 'cloudfunctions', 'orderService', 'stats.js'),
]

function ensureEslintDisable(filePath) {
  if (!fs.existsSync(filePath)) {return}
  const content = fs.readFileSync(filePath, 'utf8')
  if (content.startsWith('/* eslint-disable')) {return}
  // 移除可能存在的 shebang 或 BOM
  let cleanContent = content
  if (cleanContent.charCodeAt(0) === 0xFEFF) {cleanContent = cleanContent.slice(1)}
  fs.writeFileSync(filePath, `/* eslint-disable */\n${cleanContent}`, 'utf8')
}

function compile() {
  console.log('[build-order-service] 正在编译 orders.ts → orders.js ...')
  try {
    execSync('npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json', {
      cwd: ROOT,
      stdio: 'inherit',
    })
  } catch (e) {
    console.error('[build-order-service] tsc 编译失败:', e.message)
    process.exit(1)
  }

  for (const target of TARGETS) {
    if (fs.existsSync(target)) {
      ensureEslintDisable(target)
      console.log(`[build-order-service] ✓ ${path.relative(ROOT, target)}`)
    } else {
      console.warn(`[build-order-service] ✗ 产物未生成: ${path.relative(ROOT, target)}`)
    }
  }
  console.log('[build-order-service] 编译完成')
}

compile()
