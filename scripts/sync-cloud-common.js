#!/usr/bin/env node
/**
 * cloudfunctions/common 同步脚本
 *
 * 用途：把 cloudfunctions/common/ 下的公共模块同步到各 service 的 common/ 目录
 *
 * 背景：云函数部署时需要自带 common/ 目录，无法通过 npm 共享。
 * 此前都是手动 cp，容易漏。本脚本自动同步并报告差异。
 *
 * 用法：
 *   node scripts/sync-cloud-common.js           # 检查并同步
 *   node scripts/sync-cloud-common.js --check   # 只检查不写
 *   node scripts/sync-cloud-common.js --service=<name>  # 只同步指定 service
 *
 * 同步规则：
 *   - 遍历 cloudfunctions/common/ 下所有 .js 文件
 *   - 对每个 service：复制 <file> 到 <service>/common/<file>
 *   - 同名同 md5 → 跳过
 *   - 目标存在但 md5 不同 → 覆盖
 *   - 目标存在但源文件已被删除 → 删除目标（可选）
 *
 * Sprint 19 特殊规则：
 *   - SHIM_FILES 中的文件不在 service common/ 下复制完整实现，
 *     而是写入 re-export shim（module.exports = require('../../common/<file>')）
 *   - 这样跨 service 的 `error instanceof BusinessError` 判定才能稳定工作
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'cloudfunctions', 'common')
const TARGET_BASE = path.join(ROOT, 'cloudfunctions')

// Sprint 39: 已移除 Sprint 19 shim 模式，所有文件统一作为完整副本同步
// 原因：shim 引用 require('../../common/errors.js') 在云函数部署后无法解析（部署包不含上级目录）
// 跨 service class identity 优化本来就未生效（云函数走 HTTP/CloudFunction 调用，内存不共享 class 实例）
const SHIM_FILES = new Set()

const args = process.argv.slice(2)
const CHECK_ONLY = args.includes('--check')
const ONLY_SERVICE = args
  .find(a => a.startsWith('--service='))
  ?.split('=')[1]

/** 生成 re-export shim 内容 */
function buildShimContent(fileName) {
  return `/* eslint-disable -- auto-generated re-export shim (Sprint 19) */
/**
 * 公共模块 shim - 跨 service 单一来源
 *
 * 【Sprint 19】本文件是 re-export，不再持有任何实现代码。
 *   所有 service 通过本 shim 引用 cloudfunctions/common/${fileName} 的同一份产物。
 *   这样跨 service 的模块实例判定（class identity）才能稳定工作。
 *
 * 【维护规则】
 *   - ❌ 不要在本文件中实现任何业务逻辑
 *   - ❌ 不要直接编辑本文件
 *   - ✅ 所有功能请直接修改 cloudfunctions/common/${fileName.replace(/\.js$/, '.ts')}
 *
 * @see cloudfunctions/common/${fileName}
 * @see docs/SPRINT_19_DELIVERY.md
 */
'use strict'

module.exports = require('../../common/${fileName}')
`
}

/** 计算文件 md5 */
function md5(content) {
  return crypto.createHash('md5').update(content).digest('hex')
}

/** 读取目录下的 .js 文件（不含子目录） */
function listJsFiles(dir) {
  if (!fs.existsSync(dir)) {return []}
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.js'))
    .map(d => d.name)
}

/** 列出所有 service 目录（包含 common/ 子目录） */
function listServices() {
  if (!fs.existsSync(TARGET_BASE)) {return []}
  const entries = fs.readdirSync(TARGET_BASE, { withFileTypes: true })
  return entries
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => name !== 'common' && name !== '_shared') // 排除源目录
    .filter(name => {
      if (ONLY_SERVICE) {return name === ONLY_SERVICE}
      // Sprint 39: 同步到所有 service（不仅限于有 common/ 的）
      // 这样 activityService 等被 build 误删 common/ 的服务能自动恢复
      return true
    })
}

/** 确保目标目录存在 */
function ensureServiceCommonDir(svc) {
  const dir = path.join(TARGET_BASE, svc, 'common')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function syncFile(srcName) {
  const srcPath = path.join(SOURCE, srcName)
  const srcContent = fs.readFileSync(srcPath, 'utf8')
  const srcHash = md5(srcContent)

  const isShim = SHIM_FILES.has(srcName)
  // Sprint 19: shim 文件期望的内容
  const expectedTargetContent = isShim ? buildShimContent(srcName) : srcContent
  const expectedTargetHash = md5(expectedTargetContent)

  const results = []
  const services = listServices()
  for (const svc of services) {
    const dstPath = path.join(TARGET_BASE, svc, 'common', srcName)
    if (!fs.existsSync(dstPath)) {
      results.push({
        svc, action: 'create', src: srcPath, dst: dstPath,
        expectedContent: expectedTargetContent, isShim,
      })
    } else {
      const dstContent = fs.readFileSync(dstPath, 'utf8')
      const dstHash = md5(dstContent)
      if (expectedTargetHash !== dstHash) {
        results.push({
          svc, action: 'update', src: srcPath, dst: dstPath,
          expectedContent: expectedTargetContent, isShim,
        })
      } else {
        results.push({ svc, action: 'skip', src: srcPath, dst: dstPath, isShim })
      }
    }
  }
  return results
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`源目录不存在：${SOURCE}`)
    process.exit(1)
  }

  const sourceFiles = listJsFiles(SOURCE)
  if (sourceFiles.length === 0) {
    console.log('源目录为空，无需同步')
    return
  }

  console.log(`源：${SOURCE}`)
  console.log(`模式：${CHECK_ONLY ? '检查 (--check)' : '同步'}`)
  if (ONLY_SERVICE) {console.log(`限定 service：${ONLY_SERVICE}`)}
  if (SHIM_FILES.size > 0) {
    console.log(`Shim 模式（Sprint 19）：${Array.from(SHIM_FILES).join(', ')}`)
  }
  console.log('')

  let totalCreate = 0
  let totalUpdate = 0
  let totalSkip = 0

  for (const file of sourceFiles) {
    const results = syncFile(file)
    const need = results.filter(r => r.action !== 'skip')
    if (need.length === 0) {
      console.log(`  [无变更] ${file}`)
      totalSkip += results.length
      continue
    }
    console.log(`  ${file}${SHIM_FILES.has(file) ? ' (shim)' : ''}`)
    for (const r of results) {
      if (r.action === 'skip') {
        totalSkip++
        continue
      }
      if (r.action === 'create') {
        console.log(`    [新建] ${r.svc}`)
        totalCreate++
      } else if (r.action === 'update') {
        console.log(`    [更新] ${r.svc}`)
        totalUpdate++
      }
      if (!CHECK_ONLY) {
        // Sprint 19: shim 文件写 shim 内容，其他文件 copyFileSync
        ensureServiceCommonDir(r.svc)
        if (r.isShim) {
          fs.writeFileSync(r.dst, r.expectedContent)
        } else {
          fs.copyFileSync(r.src, r.dst)
        }
      }
    }
  }

  console.log('')
  console.log(`汇总：新建 ${totalCreate}，更新 ${totalUpdate}，跳过 ${totalSkip}`)
  if (CHECK_ONLY && (totalCreate + totalUpdate > 0)) {
    console.log('检测到差异，请运行 `node scripts/sync-cloud-common.js` 进行同步')
    process.exit(1)
  }
}

main()
