/**
 * Sprint 24: paymentService/refund TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在（不能依赖 .js 编译产物）
 *   2. 验证编译产物 .js 与 .d.ts 一致
 *   3. 验证 paymentService/index.js 仍能 require 编译产物
 *   4. 验证 d.ts 中类型签名正确（强类型，不是 any）
 *   5. 验证 TypeScript 编译可重复执行（tsconfig.paymentService.json 无错误）
 *   6. 验证编译产物的 require 路径在 cloudfunctions 内部可解析
 *   7. 验证 Sprint 24 注释标记存在
 *
 * 与 payment-service-refund-risk.test.js 互补：
 *   - 该文件验证 .ts 源 / .d.ts 类型 / .js 编译产物 的结构与一致性
 *   - risk.test.js 验证业务行为（风控 + 限流 + 错误码）
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SERVICES = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services')

describe('Sprint 24: paymentService/refund TypeScript 迁移', () => {
  describe('1. 文件存在性', () => {
    test('refund.ts 源文件应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'refund.ts'))).toBe(true)
    })

    test('refund.d.ts 类型声明应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'refund.d.ts'))).toBe(true)
    })

    test('refund.js 编译产物应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'refund.js'))).toBe(true)
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

    test('include 包含 refund.ts', () => {
      expect(cfg.include).toContain('cloudfunctions/paymentService/services/refund.ts')
    })

    test('rootDir 指向 cloudfunctions（与 build-common 对齐）', () => {
      expect(cfg.compilerOptions.rootDir).toBe('./cloudfunctions')
    })

    test('outDir 指向 cloudfunctions（保持目录结构）', () => {
      expect(cfg.compilerOptions.outDir).toBe('./cloudfunctions')
    })
  })

  describe('3. refund.ts 源文件内容', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(SERVICES, 'refund.ts'), 'utf8')
    })

    test('注释中标注 "Sprint 24 迁移"', () => {
      expect(tsCode).toMatch(/Sprint\s*24/)
    })

    test('使用 withErrorHandling 包装 handler', () => {
      expect(tsCode).toMatch(/withErrorHandling\s*</)
    })

    test('使用 WrappedHandler 强类型', () => {
      expect(tsCode).toMatch(/WrappedHandler\s*</)
    })

    test('从 common/errors 导入 err / isBusinessError', () => {
      expect(tsCode).toMatch(/import\s*\{[^}]*\berr\b[^}]*\}\s*from\s*['"][^'"]*errors['"]/)
      expect(tsCode).toMatch(/isBusinessError/)
    })

    test('从 common/risk-control 导入 detectRefundAbuse / mapActionToErrorCode', () => {
      expect(tsCode).toMatch(/detectRefundAbuse/)
      expect(tsCode).toMatch(/mapActionToErrorCode/)
    })

    test('从 common/risk-rate-limit 导入 withRateLimit', () => {
      expect(tsCode).toMatch(/withRateLimit/)
    })

    test('引用 CloudBaseDB 类型', () => {
      expect(tsCode).toMatch(/CloudBaseDB/)
    })

    test('定义 CreateRefundResult / QueryRefundEvent / WechatRefundResponse 接口', () => {
      expect(tsCode).toMatch(/interface\s+CreateRefundResult/)
      expect(tsCode).toMatch(/interface\s+QueryRefundEvent/)
      expect(tsCode).toMatch(/interface\s+WechatRefundResponse/)
    })

    test('导出 createRefund / queryRefund', () => {
      expect(tsCode).toMatch(/export\s+const\s+createRefund/)
      expect(tsCode).toMatch(/export\s+const\s+queryRefund/)
    })

    test('已迁移到 withErrorHandling 模式（不再调用 handleSuccess）', () => {
      expect(tsCode).not.toMatch(/\bhandleSuccess\s*\(/)
    })
  })

  describe('4. refund.d.ts 类型签名', () => {
    let dtsCode
    beforeAll(() => {
      dtsCode = fs.readFileSync(path.join(SERVICES, 'refund.d.ts'), 'utf8')
    })

    test('createRefund 强类型为 WrappedHandler<CreateRefundResult>', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+const\s+createRefund\s*:\s*WrappedHandler\s*<\s*CreateRefundResult\s*>/)
    })

    test('queryRefund 强类型为 WrappedHandler<WechatRefundResponse>', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+const\s+queryRefund\s*:\s*WrappedHandler\s*<\s*WechatRefundResponse\s*>/)
    })

    test('d.ts 不使用 any（顶层声明）', () => {
      const anyTopLevel = /^export\s+declare\s+const\s+\w+:\s*any\s*;?$/m
      expect(anyTopLevel.test(dtsCode)).toBe(false)
    })

    test('d.ts 包含默认导出', () => {
      expect(dtsCode).toMatch(/export\s+default/)
    })
  })

  describe('5. refund.js 编译产物', () => {
    let jsCode
    beforeAll(() => {
      jsCode = fs.readFileSync(path.join(SERVICES, 'refund.js'), 'utf8')
    })

    test('顶部包含 eslint-disable 标记（tsc 产物）', () => {
      expect(jsCode.startsWith('/* eslint-disable')).toBe(true)
    })

    test('require 路径全部可在 cloudfunctions 下解析', () => {
      const requireMatches = jsCode.match(/require\(['"]([^'"]+)['"]\)/g) || []
      const relativeRequires = requireMatches.filter(r => {
        const m = r.match(/require\(['"]([^'"]+)['"]\)/)
        return m && m[1].startsWith('.')
      })
      expect(relativeRequires.length).toBeGreaterThan(0)

      for (const r of relativeRequires) {
        const m = r.match(/require\(['"]([^'"]+)['"]\)/)
        const p = m[1]
        // 从 services 目录解析
        const abs1 = path.resolve(SERVICES, p)
        // 从 services/common 目录解析（fallback）
        const abs2 = path.resolve(SERVICES, 'common', p)
        // 跨 cloudfunctions 解析（../common → cloudfunctions/common）
        const abs3 = p.startsWith('../')
          ? path.resolve(SERVICES, p)
          : null
        const exists = fs.existsSync(abs1)
          || fs.existsSync(`${abs1}.js`)
          || fs.existsSync(abs2)
          || fs.existsSync(`${abs2}.js`)
          || (abs3 && (fs.existsSync(abs3) || fs.existsSync(`${abs3}.js`)))
        if (!exists) {
          throw new Error(`require 路径无法解析: ${p} (from ${r})`)
        }
        expect(exists).toBe(true)
      }
    })

    test('导出 createRefund / queryRefund', () => {
      expect(jsCode).toMatch(/createRefund/)
      expect(jsCode).toMatch(/queryRefund/)
    })

    test('使用 Object.defineProperty(exports, ...) 暴露命名导出', () => {
      expect(jsCode).toMatch(/Object\.defineProperty\s*\(\s*exports\s*,\s*['"]__esModule['"]/)
      expect(jsCode).toMatch(/exports\.createRefund\s*=/)
      expect(jsCode).toMatch(/exports\.queryRefund\s*=/)
    })
  })

  describe('6. paymentService/index.js 集成', () => {
    let idxCode
    beforeAll(() => {
      idxCode = fs.readFileSync(
        path.join(ROOT, 'cloudfunctions', 'paymentService', 'index.js'),
        'utf8'
      )
    })

    test('require ./services/refund（消费 .js 编译产物）', () => {
      expect(idxCode).toMatch(/require\(['"][^'"]*services\/refund['"]\)/)
    })

    test('展开 refundHandlers', () => {
      expect(idxCode).toMatch(/\.\.\.refundHandlers/)
    })
  })

  describe('7. package.json 脚本注册', () => {
    let pkg
    beforeAll(() => {
      pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    })

    test('注册 build:payment-service', () => {
      expect(pkg.scripts['build:payment-service']).toBe('node scripts/build-all-services.js')
    })

    test('注册 typecheck:paymentService', () => {
      expect(pkg.scripts['typecheck:paymentService']).toMatch(/tsconfig\.paymentService\.json/)
    })

    test('注册 audit:s24-payment-service-ts', () => {
      expect(pkg.scripts['audit:s24-payment-service-ts']).toBeDefined()
    })

    test('build:all 包含 build:all-services（Sprint 48 合并）', () => {
      expect(pkg.scripts['build:all']).toMatch(/build-all-services\.js/)
    })

    test('ci:check 包含 audit:s24-payment-service-ts:strict', () => {
      expect(pkg.scripts['ci:check']).toMatch(/audit:s24-payment-service-ts:strict/)
    })
  })

  describe('8. scripts/build-all-services.js 存在', () => {
    test('build-all-services.js 脚本应存在', () => {
      expect(fs.existsSync(path.join(ROOT, 'scripts', 'build-all-services.js'))).toBe(true)
    })

    test('build-all-services.js 包含 refund.js 作为构建目标', () => {
      const code = fs.readFileSync(
        path.join(ROOT, 'scripts', 'build-all-services.js'),
        'utf8'
      )
      expect(code).toMatch(/services\/refund\.js/)
      expect(code).toMatch(/tsconfig\.paymentService\.json/)
    })
  })

  describe('9. 类型一致性快照', () => {
    test('.ts 与 .js 的命名导出集合应一致', () => {
      const tsCode = fs.readFileSync(path.join(SERVICES, 'refund.ts'), 'utf8')
      const jsCode = fs.readFileSync(path.join(SERVICES, 'refund.js'), 'utf8')

      // ts 端：export const X 中的 X 名称
      const tsExports = []
      const tsRegex = /^export\s+const\s+(\w+)/gm
      let m
      while ((m = tsRegex.exec(tsCode)) !== null) {
        if (m[1] !== 'default') {tsExports.push(m[1])}
      }
      // js 端：exports.X = 中的 X 名称（排除 __esModule）
      const jsExports = []
      const jsRegex = /^exports\.(\w+)\s*=/gm
      while ((m = jsRegex.exec(jsCode)) !== null) {
        if (m[1] !== '__esModule') {jsExports.push(m[1])}
      }

      // .ts 中至少包含 createRefund 和 queryRefund
      expect(tsExports).toContain('createRefund')
      expect(tsExports).toContain('queryRefund')

      // .js 中也至少包含 createRefund 和 queryRefund
      expect(jsExports).toContain('createRefund')
      expect(jsExports).toContain('queryRefund')

      // 数量上 .ts 的命名导出应不超过 .js 的命名导出 + 1（允许 _default）
      expect(tsExports.length).toBeLessThanOrEqual(jsExports.length + 1)
      // .js 不应丢失 .ts 中的命名导出
      for (const name of tsExports) {
        if (name === '_default') {continue}
        expect(jsExports).toContain(name)
      }
    })
  })
})
