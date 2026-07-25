#!/usr/bin/env node
/**
 * 云函数 common 模块完整性校验
 *
 * 用途：确保每个云函数 require('./common/xxx') 引用的模块
 *       在该云函数自身的 common/ 目录下都存在对应 .js 文件。
 *
 * 微信小程序云函数部署包是自包含的，不能跨函数引用 common/。
 * 缺失文件会导致 -504002 FUNCTIONS_EXECUTE_FAIL（Cannot find module）。
 *
 * 用法：
 *   node scripts/verify-cloud-common.js          # 校验，失败 exit(1)
 *   node scripts/verify-cloud-common.js --fix     # 自动同步缺失文件后再校验
 *
 * 校验规则：
 *   1. 扫描每个云函数目录下所有 .js 文件的 require('./common/xxx')
 *   2. 检查 cloudfunctions/<service>/common/xxx.js 是否存在
 *   3. 若 --fix 且源 cloudfunctions/common/xxx.js 存在，自动复制
 *   4. 若源也不存在，报错（模块名拼写错误或未创建）
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CF_DIR = path.join(ROOT, 'cloudfunctions')
const SOURCE_COMMON = path.join(CF_DIR, 'common')

const FIX_MODE = process.argv.includes('--fix')

/** 列出 cloudfunctions/ 下所有云函数目录（排除 common 源目录） */
function listServices() {
  return fs.readdirSync(CF_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => name !== 'common' && name !== '_shared')
}

/** 递归扫描目录下所有 .js 文件（不含 node_modules） */
function listJsFiles(dir, base = dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...listJsFiles(full, base))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(full)
    }
  }
  return results
}

/** 从文件内容提取 require('./common/xxx') 的模块名 */
function extractCommonRequires(filePath, serviceRoot) {
  const content = fs.readFileSync(filePath, 'utf8')
  const relPath = path.relative(serviceRoot, filePath)
  const results = []

  // 匹配 require('./common/xxx') 或 require("./common/xxx")
  // xxx 可带 .js 后缀也可不带
  const regex = /require\(['"]\.\/common\/([^'"]+)['"]\)/g
  let match
  while ((match = regex.exec(content)) !== null) {
    let modName = match[1]
    // 去掉 .js 后缀统一比较
    modName = modName.replace(/\.js$/, '')
    results.push({ modName, file: relPath, line: content.slice(0, match.index).split('\n').length })
  }
  return results
}

function main() {
  const services = listServices()
  const sourceFiles = new Set(
    listJsFiles(SOURCE_COMMON).map(f => path.basename(f, '.js'))
  )

  let totalMissing = 0
  let totalFixed = 0
  const report = []

  for (const svc of services) {
    const svcDir = path.join(CF_DIR, svc)
    const svcCommonDir = path.join(svcDir, 'common')
    const jsFiles = listJsFiles(svcDir)

    // 收集该 service 所有 require('./common/xxx')
    const requires = []
    for (const jsFile of jsFiles) {
      requires.push(...extractCommonRequires(jsFile, svcDir))
    }

    if (requires.length === 0) continue

    // 该 service common/ 目录实际存在的文件
    const existingFiles = new Set()
    if (fs.existsSync(svcCommonDir)) {
      for (const f of fs.readdirSync(svcCommonDir)) {
        if (f.endsWith('.js')) {
          existingFiles.add(path.basename(f, '.js'))
        }
      }
    }

    // 交叉比对
    const checked = new Set()
    for (const req of requires) {
      if (checked.has(req.modName)) continue
      checked.add(req.modName)

      if (existingFiles.has(req.modName)) continue // 存在，OK

      // 缺失！
      const sourceExists = sourceFiles.has(req.modName)
      const firstReq = requires.find(r => r.modName === req.modName)

      if (FIX_MODE && sourceExists) {
        // 自动修复：从源目录复制
        const srcFile = path.join(SOURCE_COMMON, `${req.modName}.js`)
        if (!fs.existsSync(svcCommonDir)) {
          fs.mkdirSync(svcCommonDir, { recursive: true })
        }
        fs.copyFileSync(srcFile, path.join(svcCommonDir, `${req.modName}.js`))
        totalFixed++
        report.push(`  [已修复] ${svc} ← ${req.modName}.js (源文件存在，已复制)`)
      } else {
        totalMissing++
        const hint = sourceExists
          ? '源文件存在，请运行 sync-cloud-common.js 或本脚本 --fix'
          : '源文件也不存在！请检查模块名拼写或创建该模块'
        report.push(`  [缺失] ${svc} 缺少 common/${req.modName}.js`)
        report.push(`         引用位置: ${firstReq.file}:${firstReq.line}`)
        report.push(`         ${hint}`)
      }
    }
  }

  // 输出报告
  if (report.length === 0) {
    console.log('✅ 所有云函数的 common 模块引用完整，无缺失。')
    process.exit(0)
  }

  console.log(`${FIX_MODE ? '同步修复报告' : '校验报告'}：\n`)
  for (const line of report) {
    console.log(line)
  }

  if (totalFixed > 0) {
    console.log(`\n✅ 已自动修复 ${totalFixed} 个缺失文件。`)
  }

  if (totalMissing > 0) {
    console.log(`\n❌ 发现 ${totalMissing} 个无法修复的缺失（源文件不存在）。`)
    process.exit(1)
  } else if (FIX_MODE && totalFixed > 0) {
    // 修复后重新校验
    console.log('\n正在重新校验...')
    const { execSync } = require('child_process')
    try {
      execSync('node scripts/verify-cloud-common.js', { cwd: ROOT, stdio: 'inherit' })
    } catch (e) {
      process.exit(1)
    }
  }
}

main()
