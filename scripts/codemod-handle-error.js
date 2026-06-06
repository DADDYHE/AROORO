#!/usr/bin/env node
/**
 * codemod: return handleError(new Error(...), msg, ERROR_CODES.X) -> throw err(CODE, msg)
 *
 * 映射表（与 cloudfunctions/common/errors.js#BusinessErrors 对齐）：
 *   ERROR_CODES.AUTH       -> 'AUTH_REQUIRED'
 *   ERROR_CODES.VALIDATION -> 'INVALID_PARAMS'
 *   ERROR_CODES.NOT_FOUND  -> 'NOT_FOUND'
 *   ERROR_CODES.PERMISSION -> 'PERMISSION_DENIED'
 *   ERROR_CODES.BUSINESS   -> 'BUSINESS_ERROR'
 *   ERROR_CODES.DATA       -> 'DATA_ERROR'
 *   ERROR_CODES.SERVER     -> 'INTERNAL_ERROR'
 *   ERROR_CODES.UNKNOWN    -> 'INTERNAL_ERROR'
 */

const fs = require('fs')
const path = require('path')

const ERROR_CODE_MAP = {
  AUTH: 'AUTH_REQUIRED',
  VALIDATION: 'INVALID_PARAMS',
  NOT_FOUND: 'NOT_FOUND',
  PERMISSION: 'PERMISSION_DENIED',
  BUSINESS: 'BUSINESS_ERROR',
  DATA: 'DATA_ERROR',
  SERVER: 'INTERNAL_ERROR',
  UNKNOWN: 'INTERNAL_ERROR',
}

// 允许 first arg 是任意字符串（单/双/反引号/拼接），second arg 是常量字符串
const PATTERN = /return\s+handleError\(\s*new\s+Error\(([^,]+?)\)\s*,\s*(['"])(.*?)\2\s*,\s*ERROR_CODES\.(\w+)\s*\)/g

function transformFile(file) {
  const src = fs.readFileSync(file, 'utf8')
  const lines = src.split('\n')
  const out = []
  let totalReplaced = 0
  for (const line of lines) {
    PATTERN.lastIndex = 0
    if (PATTERN.test(line)) {
      PATTERN.lastIndex = 0
      const replaced = line.replace(PATTERN, (m, _inner, _q, msgOut, code) => {
        totalReplaced++
        return `throw err('${ERROR_CODE_MAP[code] || 'BUSINESS_ERROR'}', '${msgOut}')`
      })
      out.push(replaced)
    } else {
      out.push(line)
    }
  }
  if (totalReplaced > 0) {
    fs.writeFileSync(file, out.join('\n'))
    console.log(`${path.relative(process.cwd(), file)}: replaced ${totalReplaced}`)
  }
  return totalReplaced
}

const target = process.argv[2]
if (!target) {
  console.error('Usage: node codemod-handle-error.js <file>')
  process.exit(1)
}
const stat = fs.statSync(target)
if (stat.isDirectory()) {
  const files = fs.readdirSync(target).filter(f => f.endsWith('.js')).map(f => path.join(target, f))
  files.forEach(transformFile)
} else {
  transformFile(target)
}
