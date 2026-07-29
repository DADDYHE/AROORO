/**
 * Sprint 25: paymentService/pay TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在（不能依赖 .js 编译产物）
 *   2. 验证编译产物 .js 与 .d.ts 一致
 *   3. 验证 paymentService/index.js 仍能 require 编译产物
 *   4. 验证 d.ts 中类型签名正确（强类型，不是 any）
 *   5. 验证 TypeScript 编译可重复执行（tsconfig.paymentService.json 无错误）
 *   6. 验证编译产物的 require 路径在 cloudfunctions 内部可解析
 *   7. 验证 Sprint 25 注释标记存在
 *   8. 验证 4 个 handler 全部迁移：createPayment / queryPayment / closePayment / confirmPayment
 *
 * 与 payment-order-rate-limit.test.js 互补：
 *   - 该文件验证 .ts 源 / .d.ts 类型 / .js 编译产物 的结构与一致性
 *   - rate-limit.test.js 验证业务行为（限流 + 错误码）
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SERVICES = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services')

describe('Sprint 25: paymentService/pay TypeScript 迁移', () => {
  describe('1. 文件存在性', () => {
    test('pay.ts 源文件应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'pay.ts'))).toBe(true)
    })

    test('pay.d.ts 类型声明应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'pay.d.ts'))).toBe(true)
    })

    test('pay.js 编译产物应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'pay.js'))).toBe(true)
    })

    test('tsconfig.paymentService.json 应存在', () => {
      expect(fs.existsSync(path.join(ROOT, 'tsconfig.paymentService.json'))).toBe(true)
    })
  })

  describe('2. tsconfig.paymentService.json 配置', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.paymentService.json'), 'utf8'))
    })

    test('strict 模式开启', () => {
      expect(cfg.compilerOptions.strict).toBe(true)
    })

    test('noImplicitAny 开启', () => {
      expect(cfg.compilerOptions.noImplicitAny).toBe(true)
    })

    test('strictNullChecks 开启', () => {
      expect(cfg.compilerOptions.strictNullChecks).toBe(true)
    })

    test('declaration 开启（生成 .d.ts）', () => {
      expect(cfg.compilerOptions.declaration).toBe(true)
    })

    test('include 包含 pay.ts（Sprint 25 扩展）', () => {
      expect(cfg.include).toContain('cloudfunctions/paymentService/services/pay.ts')
    })

    test('include 仍包含 refund.ts（回归）', () => {
      expect(cfg.include).toContain('cloudfunctions/paymentService/services/refund.ts')
    })
  })

  describe('3. pay.ts 源文件内容', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(SERVICES, 'pay.ts'), 'utf8')
    })

    test('注释中标注 "Sprint 25 迁移"', () => {
      expect(tsCode).toMatch(/Sprint\s*25/)
    })

    test('使用 withErrorHandling 包装 handler', () => {
      expect(tsCode).toMatch(/withErrorHandling\s*</)
    })

    test('使用 WrappedHandler 强类型', () => {
      expect(tsCode).toMatch(/WrappedHandler\s*</)
    })

    test('从 common/errors 导入 err / isBusinessError / WrappedHandler', () => {
      expect(tsCode).toMatch(/import\s*\{[^}]*\berr\b[^}]*\}\s*from\s*['"][^'"]*errors['"]/)
      expect(tsCode).toMatch(/isBusinessError/)
      expect(tsCode).toMatch(/WrappedHandler/)
    })

    test('从 common/risk-rate-limit 导入 withRateLimit', () => {
      expect(tsCode).toMatch(/import\s*\{[^}]*withRateLimit[^}]*\}\s*from\s*['"][^'"]*risk-rate-limit['"]/)
    })

    test('从 common/types 导入 CloudBaseDB 类型', () => {
      expect(tsCode).toMatch(/import\s+type\s*\{[^}]*CloudBaseDB[^}]*\}\s*from\s*['"][^'"]*types['"]/)
    })

    test('包含 4 个 handler：createPayment / queryPayment / closePayment / confirmPayment', () => {
      expect(tsCode).toMatch(/export\s+const\s+createPayment\b/)
      expect(tsCode).toMatch(/export\s+const\s+queryPayment\b/)
      expect(tsCode).toMatch(/export\s+const\s+closePayment\b/)
      expect(tsCode).toMatch(/export\s+const\s+confirmPayment\b/)
    })

    test('仍调用 handleSuccess（H7 契约保留）', () => {
      // H7 契约：pay.ts 仍保留 handleSuccess 调用
      expect(tsCode).toMatch(/\bhandleSuccess\s*\(/)
    })
  })

  describe('4. pay.d.ts 类型声明', () => {
    let dtsCode
    beforeAll(() => {
      dtsCode = fs.readFileSync(path.join(SERVICES, 'pay.d.ts'), 'utf8')
    })

    test('包含 4 个 WrappedHandler<T> 强类型导出', () => {
      const wrappedHandlerMatches = dtsCode.match(/WrappedHandler\s*</g) || []
      expect(wrappedHandlerMatches.length).toBeGreaterThanOrEqual(4)
    })

    test('未在 top-level 使用 any 类型', () => {
      // 排除 union 中的 any（容许 createPaymentResult | something 中带 any）
      const anyTopLevel = /^export\s+declare\s+const\s+\w+:\s*any\s*;?$/m
      expect(anyTopLevel.test(dtsCode)).toBe(false)
    })
  })

  describe('5. pay.js 编译产物（结构与 require 解析）', () => {
    let jsCode
    beforeAll(() => {
      jsCode = fs.readFileSync(path.join(SERVICES, 'pay.js'), 'utf8')
    })

    test('头部包含 /* eslint-disable */ 标记（构建产物）', () => {
      expect(jsCode.startsWith('/* eslint-disable')).toBe(true)
    })

    test('导出 4 个 handler', () => {
      expect(jsCode).toMatch(/createPayment/)
      expect(jsCode).toMatch(/queryPayment/)
      expect(jsCode).toMatch(/closePayment/)
      expect(jsCode).toMatch(/confirmPayment/)
    })

    test('require 路径在 cloudfunctions 内部可解析', () => {
      const requires = jsCode.match(/require\(['"]([^'"]+)['"]\)/g) || []
      for (const r of requires) {
        const m = r.match(/require\(['"]([^'"]+)['"]\)/)
        if (!m) { continue }
        const p = m[1]
        // 只校验相对路径；外部模块（wx-server-sdk、crypto）跳过
        if (!(p.startsWith('.') || p.startsWith('/'))) { continue }
        // 解析到 cloudfunctions 下
        const candidates = [
          path.resolve(SERVICES, p),
          path.resolve(SERVICES, `${p}.js`),
          // 跨 cloudfunctions 解析（../common → cloudfunctions/common）
          path.resolve(ROOT, 'cloudfunctions', p.replace(/^\.\.\//, '')),
        ]
        const exists = candidates.some(c => fs.existsSync(c))
        expect(exists).toBe(true)
      }
    })
  })

  describe('6. paymentService/index.js 兼容（消费 .js 编译产物）', () => {
    test('paymentService/index.js 仍 require ./services/pay', () => {
      const idx = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'paymentService', 'index.js'), 'utf8')
      expect(idx).toMatch(/require\(['"][^'"]*services\/pay['"]\)/)
    })
  })

  describe('7. 编译可重复执行', () => {
    test('tsc --noEmit 无错误', () => {
      const { execSync } = require('child_process')
      // 不期望真正产出，仅类型检查
      try {
        execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.paymentService.json', {
          cwd: ROOT, stdio: 'pipe',
        })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
        throw new Error(`tsc --noEmit 失败: ${msg}`)
      }
    })
  })
})
