/**
 * scripts/codemod-handle-error.js 单元测试
 *
 * 验证 codemod 能在各种行内 / 跨字符串 / 模板字符串场景下稳定转换
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

function runCodemod(content) {
  const tmp = path.join(os.tmpdir(), `codemod-test-${Date.now()}.js`)
  fs.writeFileSync(tmp, content)
  try {
    const out = execSync(`node ${path.join(__dirname, '../scripts/codemod-handle-error.js')} ${tmp}`).toString()
    const replaced = fs.readFileSync(tmp, 'utf8')
    return { replaced, stdout: out }
  } finally {
    fs.unlinkSync(tmp)
  }
}

describe('codemod-handle-error', () => {
  test('基本模式：return handleError(new Error("x"), "x", ERROR_CODES.AUTH)', () => {
    const src = `function f() {\n  if (!openid) return handleError(new Error('未登录'), '未登录', ERROR_CODES.AUTH)\n}\n`
    const { replaced, stdout } = runCodemod(src)
    expect(replaced).toContain(`throw err('AUTH_REQUIRED', '未登录')`)
    expect(stdout).toContain('replaced 1')
  })

  test('错误码映射：VALIDATION -> INVALID_PARAMS', () => {
    const src = `function f() {\n  return handleError(new Error('x'), '参数错', ERROR_CODES.VALIDATION)\n}\n`
    const { replaced } = runCodemod(src)
    expect(replaced).toContain(`throw err('INVALID_PARAMS', '参数错')`)
  })

  test('双引号字符串', () => {
    const src = `function f() {\n  return handleError(new Error("foo"), "bar", ERROR_CODES.NOT_FOUND)\n}\n`
    const { replaced } = runCodemod(src)
    expect(replaced).toContain(`throw err('NOT_FOUND', 'bar')`)
  })

  test('新 Error 内是模板字符串：内层是变量，外层是常量（应替换）', () => {
    const src = 'function f() {\n  return handleError(new Error(\`未知操作: \${action}\`), \'无效的操作类型\', ERROR_CODES.VALIDATION)\n}\n'
    const { replaced } = runCodemod(src)
    expect(replaced).toContain(`throw err('INVALID_PARAMS', '无效的操作类型')`)
  })

  test('PERMISSION 错误码', () => {
    const src = `function f() {\n  return handleError(new Error('x'), '无权限', ERROR_CODES.PERMISSION)\n}\n`
    const { replaced } = runCodemod(src)
    expect(replaced).toContain(`throw err('PERMISSION_DENIED', '无权限')`)
  })

  test('BUSINESS 错误码', () => {
    const src = `function f() {\n  return handleError(new Error('x'), 'y', ERROR_CODES.BUSINESS)\n}\n`
    const { replaced } = runCodemod(src)
    expect(replaced).toContain(`throw err('BUSINESS_ERROR', 'y')`)
  })

  test('UNKNOWN 错误码', () => {
    const src = `function f() {\n  return handleError(new Error('x'), 'y', ERROR_CODES.UNKNOWN)\n}\n`
    const { replaced } = runCodemod(src)
    expect(replaced).toContain(`throw err('INTERNAL_ERROR', 'y')`)
  })

  test('多行不匹配（new Error 跨多行）应原样保留', () => {
    const src = `function f() {\n  return handleError(\n    new Error('x'),\n    'y',\n    ERROR_CODES.VALIDATION\n  )\n}\n`
    const { replaced } = runCodemod(src)
    // 多行不匹配，保留原内容
    expect(replaced).toContain(`return handleError(`)
  })

  test('没有匹配：原样保留', () => {
    const src = `function f() {\n  return handleSuccess({ id: 1 })\n}\n`
    const { replaced, stdout } = runCodemod(src)
    expect(replaced).toBe(src)
    expect(stdout).not.toContain('replaced')
  })

  test('同文件多匹配', () => {
    const src = [
      `function a() { return handleError(new Error('a1'), 'a2', ERROR_CODES.AUTH) }`,
      `function b() { return handleError(new Error('b1'), 'b2', ERROR_CODES.NOT_FOUND) }`,
      `function c() { return handleError(new Error('c1'), 'c2', ERROR_CODES.DATA) }`,
    ].join('\n')
    const { replaced, stdout } = runCodemod(src)
    expect(replaced).toContain(`throw err('AUTH_REQUIRED', 'a2')`)
    expect(replaced).toContain(`throw err('NOT_FOUND', 'b2')`)
    expect(replaced).toContain(`throw err('DATA_ERROR', 'c2')`)
    expect(stdout).toContain('replaced 3')
  })
})
