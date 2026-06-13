/**
 * Sprint 32: orderService 废弃 payment.ts 清理测试
 *
 * 目标：
 *   1. 验证 payment.ts / .d.ts / .js 文件已物理删除
 *   2. 验证 tsconfig.orderService.json 不再 include payment.ts
 *   3. 验证 build-all-services.js 不再包含 payment.js target
 *   4. 验证 orderService/index.js 不再 require('./payment')
 *   5. 验证 orderService/index.js 不再导出 wechatPay / wechatPayNotify
 *   6. 验证 requireLogin 不再有 wechatPayNotify 特殊判断
 *   7. 验证 CloudFunctionService.js wechatPay 走 paymentService
 *   8. 验证 paymentService 包含 createPayment / paymentNotify handler
 *   9. 验证 package.json 注册 audit:s32-deprecated-payment-removal + strict
 *  10. 验证 ci:check 包含 audit:s32-deprecated-payment-removal:strict
 *  11. 验证审计脚本可成功运行
 *
 * 配合：scripts/audit-s32-deprecated-payment-removal.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const ORDER_DIR = path.join(ROOT, 'cloudfunctions', 'orderService')
const PAYMENT_SERVICE_DIR = path.join(ROOT, 'cloudfunctions', 'paymentService')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (e) { return false }
}

describe('Sprint 32: orderService 废弃 payment.ts 清理', () => {
  describe('1. 物理文件已删除（或保留为占位）', () => {
    test('payment.ts 状态合法（已删除或为占位标记）', () => {
      const p = path.join(ORDER_DIR, 'payment.ts')
      if (!fileExists(p)) {
        // 已删除 - 最优
        return
      }
      // 存在 - 必须是占位标记（含 PAYMENT_HANDLERS_MIGRATED = true 且无 wechatPay 业务代码）
      const code = readFileSafe(p)
      expect(code).toMatch(/PAYMENT_HANDLERS_MIGRATED\s*=\s*true/)
      expect(code).not.toMatch(/export\s+(?:async\s+)?function\s+wechatPay\b/)
      expect(code).not.toMatch(/export\s+(?:async\s+)?function\s+wechatPayNotify\b/)
    })

    test('payment.d.ts 已删除', () => {
      expect(fileExists(path.join(ORDER_DIR, 'payment.d.ts'))).toBe(false)
    })

    test('payment.js 已删除', () => {
      expect(fileExists(path.join(ORDER_DIR, 'payment.js'))).toBe(false)
    })
  })

  describe('2. tsconfig.orderService.json 不再 include payment.ts', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.orderService.json')))
    })

    test('include 不再包含 payment.ts', () => {
      expect(cfg.include).not.toContain('cloudfunctions/orderService/payment.ts')
    })

    test('include 仍包含 orders.ts（Sprint 28 回归）', () => {
      expect(cfg.include).toContain('cloudfunctions/orderService/orders.ts')
    })

    test('include 仍包含 stats.ts（Sprint 30 回归）', () => {
      expect(cfg.include).toContain('cloudfunctions/orderService/stats.ts')
    })
  })

  describe('3. build-all-services.js 不再包含 payment.js target', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
    })

    test('build 脚本存在', () => {
      expect(code).not.toBeNull()
    })

    test('TARGETS 不包含 payment.js', () => {
      // 移除注释后仍不应包含 payment.js
      const noComment = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      expect(noComment).not.toMatch(/payment\.js/)
    })
  })

  describe('4. orderService/index.js 已清理 paymentHandlers', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ORDER_DIR, 'index.js'))
    })

    test('index.js 存在', () => {
      expect(code).not.toBeNull()
    })

    test('不再 require(\'./payment\')', () => {
      expect(code).not.toMatch(/require\(['"]\.\/payment['"]\)/)
    })

    test('不再导出 wechatPay', () => {
      expect(code).not.toMatch(/wechatPay\s*:/)
    })

    test('不再导出 wechatPayNotify', () => {
      expect(code).not.toMatch(/wechatPayNotify\s*:/)
    })

    test('requireLogin 不再有 wechatPayNotify 特殊判断', () => {
      const noComment = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      expect(noComment).not.toMatch(/requireLogin\s*=\s*[^;\n]*wechatPayNotify/)
    })

    test('handlers 中保留订单 / 统计相关 handler', () => {
      expect(code).toMatch(/getOrders\s*:/)
      expect(code).toMatch(/createOrder\s*:/)
      expect(code).toMatch(/getStats\s*:/)
    })
  })

  describe('5. CloudFunctionService.js wechatPay 走 paymentService', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ROOT, 'services', 'CloudFunctionService.js'))
    })

    test('CloudFunctionService.js 存在', () => {
      expect(code).not.toBeNull()
    })

    test('wechatPay 方法存在', () => {
      expect(code).toMatch(/async\s+wechatPay\s*\(/)
    })

    test('wechatPay 调用 paymentService', () => {
      expect(code).toMatch(/wechatPay[\s\S]{0,200}paymentService/)
    })

    test('wechatPay 调用 createPayment action', () => {
      expect(code).toMatch(/action:\s*['"]createPayment['"]/)
    })

    test('不再调用 orderService/wechatPay', () => {
      expect(code).not.toMatch(/orderService['"]\s*,\s*\{[^}]*action:\s*['"]wechatPay['"]/)
    })

    test('不再调用 orderService/wechatPayNotify', () => {
      expect(code).not.toMatch(/action:\s*['"]wechatPayNotify['"]/)
    })
  })

  describe('6. paymentService 含替代 handler', () => {
    test('paymentService/services/pay.ts 存在', () => {
      expect(fileExists(path.join(PAYMENT_SERVICE_DIR, 'services', 'pay.ts'))).toBe(true)
    })

    test('pay.ts 包含 createPayment handler', () => {
      const code = readFileSafe(path.join(PAYMENT_SERVICE_DIR, 'services', 'pay.ts'))
      expect(code).toMatch(/export\s+(?:async\s+)?function\s+createPayment\b|export\s+const\s+createPayment\b/)
    })

    test('paymentService/services/notify.ts 存在', () => {
      expect(fileExists(path.join(PAYMENT_SERVICE_DIR, 'services', 'notify.ts'))).toBe(true)
    })

    test('notify.ts 包含 paymentNotify handler（替代旧版 wechatPayNotify）', () => {
      const code = readFileSafe(path.join(PAYMENT_SERVICE_DIR, 'services', 'notify.ts'))
      expect(code).toMatch(/export\s+(?:async\s+)?function\s+paymentNotify\b|export\s+const\s+paymentNotify\b/)
    })

    test('paymentService/index.js 引入 payHandlers', () => {
      const code = readFileSafe(path.join(PAYMENT_SERVICE_DIR, 'index.js'))
      expect(code).toMatch(/require\(['"]\.\/services\/pay['"]\)/)
    })

    test('paymentService/index.js 引入 notifyHandlers', () => {
      const code = readFileSafe(path.join(PAYMENT_SERVICE_DIR, 'index.js'))
      expect(code).toMatch(/require\(['"]\.\/services\/notify['"]\)/)
    })

    test('paymentService/index.js NO_AUTH_ACTIONS 含 paymentNotify', () => {
      const code = readFileSafe(path.join(PAYMENT_SERVICE_DIR, 'index.js'))
      expect(code).toMatch(/NO_AUTH_ACTIONS\s*=\s*\[[^\]]*paymentNotify[^\]]*\]/)
    })
  })

  describe('7. package.json 注册 audit 脚本', () => {
    let pkg
    beforeAll(() => {
      pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json')))
    })

    test('注册 audit:s32-deprecated-payment-removal', () => {
      expect(pkg.scripts['audit:s32-deprecated-payment-removal']).toBe(
        'node scripts/audit-s32-deprecated-payment-removal.js'
      )
    })

    test('注册 audit:s32-deprecated-payment-removal:strict', () => {
      expect(pkg.scripts['audit:s32-deprecated-payment-removal:strict']).toBe(
        'node scripts/audit-s32-deprecated-payment-removal.js --strict'
      )
    })

    test('ci:check 包含 audit:s32-deprecated-payment-removal:strict', () => {
      expect(pkg.scripts['ci:check']).toMatch(/audit:s32-deprecated-payment-removal:strict/)
    })
  })

  describe('8. audit 脚本可成功运行', () => {
    test('audit:s32-deprecated-payment-removal 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s32-deprecated-payment-removal.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本运行失败:\n${msg}`)
      }
    })

    test('audit:s32-deprecated-payment-removal:strict 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s32-deprecated-payment-removal.js --strict', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本（strict）运行失败:\n${msg}`)
      }
    })
  })
})
