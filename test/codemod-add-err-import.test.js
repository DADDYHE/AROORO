/**
 * scripts/codemod-add-err-import.js 单元测试
 *
 * 由于脚本固定扫描 ROOT = cloudfunctions/，测试在临时目录构造一个
 * 模拟 cloudfunctions/<svc>/file.js 结构
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

function setupFixture(files) {
  // files: { 'cloudfunctions/svc1/file.js': '...content...' }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-test-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return root
}

function runCodemod(fixtureRoot) {
  // 在 fixture 根目录运行脚本，但脚本写死了 ROOT=cloudfunctions
  // 解决方案：复制 fixture 命名为 cloudfunctions 子目录
  // 更简单：在 fixture 根创建 cloudfunctions/ 软链
  const cfLink = path.join(fixtureRoot, 'cloudfunctions')
  if (fs.existsSync(cfLink)) {
    fs.rmSync(cfLink, { recursive: true, force: true })
  }
  // 把已存在的 svc 目录挪到 cloudfunctions/ 下
  const realRoot = path.join(fixtureRoot, '_test')
  fs.mkdirSync(realRoot, { recursive: true })
  fs.mkdirSync(cfLink, { recursive: true })
  // 重新写入到 cloudfunctions/
  // 简单做法：直接使用 fixture 根的 _test/ 作为新 ROOT
  // 改用环境变量不便，所以走「复制一份到 cloudfunctions/」的方式
  return cfLink
}

function collectJsFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full))
    } else if (full.endsWith('.js') && !full.includes('/common/')) {
      results.push(full)
    }
  }
  return results
}

describe('codemod-add-err-import', () => {
  // 由于脚本固定 ROOT=cloudfunctions/，我们在 cwd 临时切换
  // 简化做法：直接在 /tmp/cf-test/cloudfunctions/svcX 下放文件
  let fixtureRoot

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-fixture-'))
    // 把脚本 ROOT 路径的相对基准指到 fixtureRoot
    // 方案：把 fixtureRoot 软链到 /tmp/cf-fixture/cloudfunctions
    const cfDir = path.join(fixtureRoot, 'cloudfunctions')
    fs.mkdirSync(cfDir, { recursive: true })
  })

  function runScriptAgainst(fileContent, fileRelPath) {
    // 写到 fixtureRoot/cloudfunctions/<fileRelPath>
    const full = path.join(fixtureRoot, 'cloudfunctions', fileRelPath)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, fileContent)
    // 在 fixtureRoot 运行脚本，通过环境变量指定 ROOT
    const scriptPath = path.join(__dirname, '..', 'scripts', 'codemod-add-err-import.js')
    try {
      const out = execSync(`node ${scriptPath}`, {
        cwd: fixtureRoot,
        env: { ...process.env, CODEMOD_ROOT: fixtureRoot },
      }).toString()
      return { result: fs.readFileSync(full, 'utf8'), out }
    } catch (e) {
      return { result: null, out: e.message }
    }
  }

  test('无 err 调用的文件不应被修改', () => {
    const src = `const x = 1\nfunction f() { return 42 }\n`
    const { result } = runScriptAgainst(src, 'svc1/noerr.js')
    expect(result).toBe(src)
  })

  test('已正确导入 err 的文件不应被修改', () => {
    const src = [
      `const { err } = require('./common/errors')`,
      `function f() { throw err('X', 'Y') }`,
    ].join('\n')
    const { result } = runScriptAgainst(src, 'svc2/witherr.js')
    expect(result).toBe(src)
  })

  test('缺少 import 时补 const { err } = require(...common/errors...)', () => {
    const src = [
      `const { handleSuccess } = require('./common/utils')`,
      `function f() { throw err('INVALID_PARAMS', 'x') }`,
    ].join('\n')
    const { result } = runScriptAgainst(src, 'svc3/missing.js')
    expect(result).toMatch(/const \{ err \} = require\(['"]\.\/common\/errors['"]\)/)
  })

  test('已 require errors 但没 import err 时注入到解构中', () => {
    const src = [
      `const { toResponse } = require('./common/errors')`,
      `function f() { throw err('INVALID_PARAMS', 'x') }`,
    ].join('\n')
    const { result } = runScriptAgainst(src, 'svc4/inject.js')
    expect(result).toMatch(/const \{\s*err\s*,\s*toResponse\s*\}\s*=\s*require\(['"]\.\/common\/errors['"]\)/)
  })

  test('adminService/services 子目录应使用 ../common/errors 相对路径', () => {
    const src = [
      `const { handleSuccess } = require('../common/utils')`,
      `function f() { throw err('X', 'Y') }`,
    ].join('\n')
    const { result } = runScriptAgainst(src, 'adminService/services/sub.js')
    expect(result).toMatch(/require\(['"]\.\.\/common\/errors['"]\)/)
  })
})
