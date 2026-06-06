/**
 * Sprint 29: orderService/payment TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在
 *   2. 验证编译产物 .js / .d.ts
 *   3. 验证 CommonJS 导出 shim 正确（payment.wechatPay 是包装后函数）
 *   4. 验证 handler 强类型签名
 *   5. 验证关键业务逻辑（err / isBusinessError / WECHAT_PAY / rsaSign / decryptAes256Gcm）
 *   6. 验证 TypeScript 编译可重复执行
 *
 * 与 Sprint 28 orders 迁移测试互补：
 *   - orders 服务测订单 / 评价 / 合作伙伴
 *   - payment 服务测支付下单 / 微信支付回调（旧版）
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PAYMENT_DIR = path.join(ROOT, 'cloudfunctions', 'orderService')

describe('Sprint 29: orderService/payment TypeScript 迁移', () => {
  describe('1. 文件存在性', () => {
    test('payment.ts 源文件应存在', () => {
      expect(fs.existsSync(path.join(PAYMENT_DIR, 'payment.ts'))).toBe(true)
    })

    test('payment.d.ts 类型声明应存在', () => {
      expect(fs.existsSync(path.join(PAYMENT_DIR, 'payment.d.ts'))).toBe(true)
    })

    test('payment.js 编译产物应存在', () => {
      expect(fs.existsSync(path.join(PAYMENT_DIR, 'payment.js'))).toBe(true)
    })
  })

  describe('2. tsconfig.orderService.json 配置', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.orderService.json'), 'utf8'))
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

    test('include 包含 payment.ts（Sprint 29）', () => {
      expect(cfg.include).toContain('cloudfunctions/orderService/payment.ts')
    })

    test('include 仍包含 orders.ts（Sprint 28 回归）', () => {
      expect(cfg.include).toContain('cloudfunctions/orderService/orders.ts')
    })
  })

  describe('3. payment.ts 源文件内容', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(PAYMENT_DIR, 'payment.ts'), 'utf8')
    })

    test('注释中标注 "Sprint 29 迁移"', () => {
      expect(tsCode).toMatch(/Sprint\s*29/)
    })

    test('@deprecated 标记存在', () => {
      expect(tsCode).toMatch(/@deprecated/)
    })

    test('强类型化 WechatPayConfig 接口', () => {
      expect(tsCode).toMatch(/interface\s+WechatPayConfig\b/)
    })

    test('强类型化 WechatPayJsapiRequest 接口', () => {
      expect(tsCode).toMatch(/interface\s+WechatPayJsapiRequest\b/)
    })

    test('强类型化 WechatPayJsapiResponse 接口', () => {
      expect(tsCode).toMatch(/interface\s+WechatPayJsapiResponse\b/)
    })

    test('强类型化 WechatPayNotifyHeaders 接口', () => {
      expect(tsCode).toMatch(/interface\s+WechatPayNotifyHeaders\b/)
    })

    test('强类型化 WechatPayNotifyBody 接口', () => {
      expect(tsCode).toMatch(/interface\s+WechatPayNotifyBody\b/)
    })

    test('强类型化 WechatPayOrderInfo 接口', () => {
      expect(tsCode).toMatch(/interface\s+WechatPayOrderInfo\b/)
    })

    test('强类型化 WechatPayClientParams 接口', () => {
      expect(tsCode).toMatch(/interface\s+WechatPayClientParams\b/)
    })

    test('强类型化 WechatPayClientData 接口', () => {
      expect(tsCode).toMatch(/interface\s+WechatPayClientData\b/)
    })

    test('强类型化 NotifyHttpResponse 类型别名', () => {
      expect(tsCode).toMatch(/type\s+NotifyHttpResponse\b/)
    })

    test('从 common/types 导入 ApiResponse', () => {
      expect(tsCode).toMatch(/import\s+type\s*\{[\s\S]*?ApiResponse/)
    })

    test('从 common/logger 导入 ServiceLogger', () => {
      expect(tsCode).toMatch(/import\s+\{[^}]*ServiceLogger[^}]*\}\s+from\s+['"][^'"]*logger['"]/)
    })
  })

  describe('4. payment.ts handler 完整性', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(PAYMENT_DIR, 'payment.ts'), 'utf8')
    })

    test('handler "wechatPay" 应 export', () => {
      expect(tsCode).toMatch(/export\s+async\s+function\s+wechatPay\b/)
    })

    test('handler "wechatPayNotify" 应 export', () => {
      expect(tsCode).toMatch(/export\s+async\s+function\s+wechatPayNotify\b/)
    })

    test('应至少有 2 个 export async function', () => {
      const matches = tsCode.match(/export\s+async\s+function\s+/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('5. payment.ts 业务逻辑要点', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(PAYMENT_DIR, 'payment.ts'), 'utf8')
    })

    test('使用 err() 工厂（参数校验）', () => {
      const matches = tsCode.match(/\berr\s*\(/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(3)
    })

    test('使用 isBusinessError 类型守卫', () => {
      expect(tsCode).toMatch(/isBusinessError\(/)
    })

    test('使用 catch (error: unknown) 模式（至少 2 处）', () => {
      const matches = tsCode.match(/catch\s*\(\s*\w+\s*:\s*unknown\s*\)/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })

    test('wechatPay 使用 WECHAT_PAY 配置', () => {
      expect(tsCode).toMatch(/WECHAT_PAY/)
    })

    test('wechatPay 使用 rsaSign 签名', () => {
      expect(tsCode).toMatch(/rsaSign\(/)
    })

    test('wechatPay 使用 httpsRequest 调用微信 API', () => {
      expect(tsCode).toMatch(/httpsRequest\(/)
    })

    test('wechatPayNotify 使用 decryptAes256Gcm 解密', () => {
      expect(tsCode).toMatch(/decryptAes256Gcm\(/)
    })

    test('wechatPayNotify 验证微信支付签名', () => {
      expect(tsCode).toMatch(/createVerify\(['"]SHA256withRSA['"]\)/)
    })

    test('wechatPayNotify 启动数据库事务', () => {
      expect(tsCode).toMatch(/db\.startTransaction\(\)|startTransaction\(\)/)
    })

    test('wechatPayNotify 使用 WECHAT_PAY.certificate 验证签名', () => {
      expect(tsCode).toMatch(/WECHAT_PAY\.certificate/)
    })

    test('wechatPayNotify 使用 WECHAT_PAY.apiV3Key 解密', () => {
      expect(tsCode).toMatch(/WECHAT_PAY\.apiV3Key/)
    })

    test('订单状态更新为 paid', () => {
      expect(tsCode).toMatch(/status:\s*['"]paid['"]/)
    })

    test('订单 paymentStatus 更新为 paid', () => {
      expect(tsCode).toMatch(/paymentStatus:\s*['"]paid['"]/)
    })
  })

  describe('6. payment.ts Runtime shim（CommonJS 兼容）', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(PAYMENT_DIR, 'payment.ts'), 'utf8')
    })

    test('Runtime shim 把 module.exports 指向 _handlers', () => {
      expect(tsCode).toMatch(/_mod\.exports\s*=\s*_handlers/)
    })

    test('同步设置 _handlers.default 保持 ESM 互操作', () => {
      expect(tsCode).toMatch(/_handlers[\s\S]{0,40}\.default\s*=\s*_handlers/)
    })

    test('包含 _mod = module as 模式', () => {
      expect(tsCode).toMatch(/_mod\s*=\s*module\s+as/)
    })
  })

  describe('7. payment.d.ts 类型声明', () => {
    let dtsCode
    beforeAll(() => {
      dtsCode = fs.readFileSync(path.join(PAYMENT_DIR, 'payment.d.ts'), 'utf8')
    })

    test('至少 2 处 export declare function', () => {
      const matches = dtsCode.match(/export\s+declare\s+function/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })

    test('wechatPay 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+wechatPay\b/)
    })

    test('wechatPayNotify 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+wechatPayNotify\b/)
    })

    test('wechatPayNotify 返回 Promise<NotifyHttpResponse>', () => {
      expect(dtsCode).toMatch(/wechatPayNotify\([^)]*\):\s*Promise<NotifyHttpResponse>/)
    })
  })

  describe('8. payment.js 编译产物', () => {
    let jsCode
    beforeAll(() => {
      jsCode = fs.readFileSync(path.join(PAYMENT_DIR, 'payment.js'), 'utf8')
    })

    test('头部包含 /* eslint-disable */ 标记（构建产物）', () => {
      expect(jsCode.startsWith('/* eslint-disable')).toBe(true)
    })

    test('包含 _mod.exports = _handlers shim', () => {
      expect(jsCode).toMatch(/_mod\.exports\s*=\s*_handlers/)
    })

    test('导出 wechatPay', () => {
      expect(jsCode).toMatch(/exports\.wechatPay\s*=/)
    })

    test('导出 wechatPayNotify', () => {
      expect(jsCode).toMatch(/exports\.wechatPayNotify\s*=/)
    })

    test('wechatPayNotify 不通过 withErrorHandling 包装', () => {
      // 检查 wechatPayNotify 直接作为函数引用
      // (不能像 wechatPay 那样通过 withErrorHandling 包装，因为需要返回原始 HTTP 响应)
      const matches = jsCode.match(/withErrorHandling\(wechatPayNotify\)/g) || []
      expect(matches.length).toBe(0)
    })

    test('require 路径在 cloudfunctions 内部可解析', () => {
      const lines = jsCode.split('\n')
      const requires = []
      for (const line of lines) {
        if (line.trim().startsWith('//')) continue
        const m = line.match(/require\(['"]([^'"]+)['"]\)/g)
        if (m) requires.push(...m)
      }
      for (const r of requires) {
        const m = r.match(/require\(['"]([^'"]+)['"]\)/)
        if (!m) { continue }
        const p = m[1]
        if (!(p.startsWith('.') || p.startsWith('/'))) { continue }
        const candidates = [
          path.resolve(PAYMENT_DIR, p),
          path.resolve(PAYMENT_DIR, `${p}.js`),
          path.resolve(ROOT, 'cloudfunctions', p.replace(/^\.\.\//, '')),
        ]
        const exists = candidates.some(c => fs.existsSync(c))
        expect(exists).toBe(true)
      }
    })
  })

  describe('9. 编译可重复执行', () => {
    test('tsc --noEmit 无错误', () => {
      const { execSync } = require('child_process')
      try {
        execSync('npx --yes -p typescript@5.4.5 tsc --noEmit -p tsconfig.orderService.json', {
          cwd: ROOT, stdio: 'pipe',
        })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 5).join(' / ') : e.message
        throw new Error(`tsc --noEmit 失败: ${msg}`)
      }
    })
  })

  describe('10. payment.js 运行时（CommonJS 兼容）', () => {
    test('require("./payment") 包含 wechatPay 和 wechatPayNotify', () => {
      // 清除缓存
      delete require.cache[require.resolve(path.join(PAYMENT_DIR, 'payment.js'))]
      const payment = require(path.join(PAYMENT_DIR, 'payment.js'))
      expect(typeof payment.wechatPay).toBe('function')
      expect(typeof payment.wechatPayNotify).toBe('function')
    })
  })
})
