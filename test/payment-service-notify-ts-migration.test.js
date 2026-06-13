/**
 * Sprint 26: paymentService/notify TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在（不能依赖 .js 编译产物）
 *   2. 验证编译产物 .js 与 .d.ts 一致
 *   3. 验证 paymentService/index.js 仍能 require 编译产物
 *   4. 验证 d.ts 中类型签名正确（强类型，不是 any）
 *   5. 验证 TypeScript 编译可重复执行（tsconfig.paymentService.json 无错误）
 *   6. 验证编译产物的 require 路径在 cloudfunctions 内部可解析
 *   7. 验证 Sprint 26 注释标记存在
 *   8. 验证 notify 核心逻辑：签名验证 + AES-256-GCM 解密 + 状态机推进
 *
 * 与 payment-service-pay-ts-migration.test.js 互补：
 *   - pay 测支付发起链路
 *   - notify 测微信回调链路
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SERVICES = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services')

describe('Sprint 26: paymentService/notify TypeScript 迁移', () => {
  describe('1. 文件存在性', () => {
    test('notify.ts 源文件应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'notify.ts'))).toBe(true)
    })

    test('notify.d.ts 类型声明应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'notify.d.ts'))).toBe(true)
    })

    test('notify.js 编译产物应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'notify.js'))).toBe(true)
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

    test('include 包含 notify.ts（Sprint 26 扩展）', () => {
      expect(cfg.include).toContain('cloudfunctions/paymentService/services/notify.ts')
    })

    test('include 仍包含 pay.ts（回归）', () => {
      expect(cfg.include).toContain('cloudfunctions/paymentService/services/pay.ts')
    })

    test('include 仍包含 refund.ts（回归）', () => {
      expect(cfg.include).toContain('cloudfunctions/paymentService/services/refund.ts')
    })
  })

  describe('3. notify.ts 源文件内容', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(SERVICES, 'notify.ts'), 'utf8')
    })

    test('注释中标注 "Sprint 26 迁移"', () => {
      expect(tsCode).toMatch(/Sprint\s*26/)
    })

    test('强类型化 NotifyEvent 入参', () => {
      expect(tsCode).toMatch(/interface\s+NotifyEvent\b/)
    })

    test('强类型化 NotifyHeaders 头', () => {
      expect(tsCode).toMatch(/interface\s+NotifyHeaders\b/)
    })

    test('强类型化 NotifyResource 加密资源', () => {
      expect(tsCode).toMatch(/interface\s+NotifyResource\b/)
    })

    test('强类型化 NotifyOrderInfo 订单信息', () => {
      expect(tsCode).toMatch(/interface\s+NotifyOrderInfo\b/)
    })

    test('定义 NotifyHttpResponse 响应结构', () => {
      expect(tsCode).toMatch(/interface\s+NotifyHttpResponse\b/)
    })

    test('使用 export async function paymentNotify', () => {
      expect(tsCode).toMatch(/export\s+async\s+function\s+paymentNotify\b/)
    })

    test('从 common/errors 导入 err 工厂', () => {
      expect(tsCode).toMatch(/import\s*\{[^}]*\berr\b[^}]*\}\s*from\s*['"][^'"]*errors['"]/)
    })

    test('从 common/types 导入 CloudBaseDB 类型', () => {
      expect(tsCode).toMatch(/CloudBaseDB/)
    })

    test('不使用 withErrorHandling（HTTP 响应需保留原结构）', () => {
      // 排除注释中提到的 withErrorHandling，仅检测实际 import / call
      const hasImport = /import\s*\{[^}]*withErrorHandling[^}]*\}\s*from/.test(tsCode)
      const hasCall = /withErrorHandling\s*[<(]/.test(tsCode)
      expect(hasImport || hasCall).toBe(false)
    })
  })

  describe('4. notify 业务逻辑要点', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(SERVICES, 'notify.ts'), 'utf8')
    })

    test('实现签名验证（RSA-SHA256 / createVerify）', () => {
      expect(tsCode).toMatch(/SHA256withRSA|createVerify/)
    })

    test('实现 AES-256-GCM 解密', () => {
      expect(tsCode).toMatch(/aes-256-gcm|decryptAes256Gcm/)
    })

    test('通过 outTradeNo 前缀识别订单类型（ORDER_/MALL_/TUAN_/ACT_/FD_）', () => {
      expect(tsCode).toMatch(/ORDER_/)
      expect(tsCode).toMatch(/MALL_/)
      expect(tsCode).toMatch(/TUAN_/)
      expect(tsCode).toMatch(/ACT_/)
      expect(tsCode).toMatch(/FD_/)
    })

    test('包含 trade_state === SUCCESS 状态机分支', () => {
      expect(tsCode).toMatch(/trade_state\s*===\s*['"]SUCCESS['"]/)
    })

    test('幂等保护：paymentStatus === paid 直接返回', () => {
      expect(tsCode).toMatch(/paymentStatus\s*===\s*['"]paid['"]/)
    })

    test('tuan 类型跨集合同步（tuan_orders）', () => {
      expect(tsCode).toMatch(/tuan_orders/)
    })

    test('activity 类型跨集合同步（orders）', () => {
      // 活动订单需同步到 orders（已 paid → confirmed）
      const match = tsCode.match(/orders.*activityId|activityId.*orders/s)
      expect(Boolean(match)).toBe(true)
    })

    test('触发 commission 记录（commission.js 兼容接口）', () => {
      expect(tsCode).toMatch(/require\(['"]\.\/commission['"]\)/)
    })

    test('使用解构风格 require commission（与 pay.ts 一致）', () => {
      // Sprint 27: commission.ts 迁移后，require 返回对象而非函数本身
      // 需用解构风格与 pay.ts 保持一致
      expect(tsCode).toMatch(/const\s*\{[^}]*createCommissionRecord[^}]*\}\s*=\s*require\(['"]\.\/commission['"]\)/)
    })

    test('catch 块使用 unknown 类型而非 any', () => {
      expect(tsCode).toMatch(/catch\s*\(\s*\w+\s*:\s*unknown\s*\)/)
    })
  })

  describe('5. notify.d.ts 类型声明', () => {
    let dtsCode
    beforeAll(() => {
      dtsCode = fs.readFileSync(path.join(SERVICES, 'notify.d.ts'), 'utf8')
    })

    test('paymentNotify 返回 Promise<NotifyHttpResponse>', () => {
      expect(dtsCode).toMatch(/Promise\s*<\s*NotifyHttpResponse\s*>/)
    })

    test('NotifyHttpResponse 类型导出', () => {
      expect(dtsCode).toMatch(/interface\s+NotifyHttpResponse\b/)
    })

    test('paymentNotify 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+paymentNotify\b/)
    })

    test('paymentNotify 接受 _auth 可为 null（HTTP 回调不需鉴权）', () => {
      expect(dtsCode).toMatch(/_\s*auth\s*:\s*\{[\s\S]*?\}\s*\|\s*null/)
    })

    test('未在 top-level 使用 any 类型', () => {
      const anyTopLevel = /^export\s+declare\s+(function|const)\s+\w+.*?:\s*any\s*;?$/m
      expect(anyTopLevel.test(dtsCode)).toBe(false)
    })
  })

  describe('6. notify.js 编译产物（结构与 require 解析）', () => {
    let jsCode
    beforeAll(() => {
      jsCode = fs.readFileSync(path.join(SERVICES, 'notify.js'), 'utf8')
    })

    test('头部包含 /* eslint-disable */ 标记（构建产物）', () => {
      expect(jsCode.startsWith('/* eslint-disable')).toBe(true)
    })

    test('导出 paymentNotify', () => {
      expect(jsCode).toMatch(/paymentNotify/)
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

  describe('7. paymentService/index.js 兼容（消费 .js 编译产物）', () => {
    test('paymentService/index.js 仍 require ./services/notify', () => {
      const idx = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'paymentService', 'index.js'), 'utf8')
      expect(idx).toMatch(/require\(['"][^'"]*services\/notify['"]\)/)
    })

    test('paymentService/index.js 仍使用 notifyHandlers（...notifyHandlers）', () => {
      const idx = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'paymentService', 'index.js'), 'utf8')
      expect(idx).toMatch(/\.\.\.notifyHandlers/)
    })

    test('paymentService/index.js NO_AUTH_ACTIONS 包含 paymentNotify', () => {
      const idx = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'paymentService', 'index.js'), 'utf8')
      expect(idx).toMatch(/NO_AUTH_ACTIONS.*paymentNotify/s)
    })
  })

  describe('8. 编译可重复执行', () => {
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
