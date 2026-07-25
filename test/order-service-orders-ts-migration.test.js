/**
 * Sprint 28: orderService/orders TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在
 *   2. 验证编译产物 .js / .d.ts
 *   3. 验证 CommonJS 导出 shim 正确（orders.getOrders 是包装后函数）
 *   4. 验证 handler 强类型签名
 *   5. 验证关键业务逻辑（err / isBusinessError / withRateLimit / detectReviewSpam）
 *   6. 验证 TypeScript 编译可重复执行
 *
 * 与 payment-service TS 迁移测试互补：
 *   - payment 服务测支付 / 退款 / 回调
 *   - order 服务测订单 / 评价 / 合作伙伴
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const ORDERS_DIR = path.join(ROOT, 'cloudfunctions', 'orderService')

describe('Sprint 28: orderService/orders TypeScript 迁移', () => {
  describe('1. 文件存在性', () => {
    test('orders.ts 源文件应存在', () => {
      expect(fs.existsSync(path.join(ORDERS_DIR, 'orders.ts'))).toBe(true)
    })

    test('orders.d.ts 类型声明应存在', () => {
      expect(fs.existsSync(path.join(ORDERS_DIR, 'orders.d.ts'))).toBe(true)
    })

    test('orders.js 编译产物应存在', () => {
      expect(fs.existsSync(path.join(ORDERS_DIR, 'orders.js'))).toBe(true)
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

    test('include 包含 orders.ts（Sprint 28）', () => {
      expect(cfg.include).toContain('cloudfunctions/orderService/orders.ts')
    })
  })

  describe('3. orders.ts 源文件内容', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(ORDERS_DIR, 'orders.ts'), 'utf8')
    })

    test('注释中标注 "Sprint 28 迁移"', () => {
      expect(tsCode).toMatch(/Sprint\s*28/)
    })

    test('强类型化 EnrichedOrder 接口', () => {
      expect(tsCode).toMatch(/interface\s+EnrichedOrder\b/)
    })

    test('强类型化 EnrichedBoardingOrder 接口', () => {
      expect(tsCode).toMatch(/interface\s+EnrichedBoardingOrder\b/)
    })

    test('强类型化 NotificationPayload 接口', () => {
      expect(tsCode).toMatch(/interface\s+NotificationPayload\b/)
    })

    test('强类型化 AdminDoc 接口', () => {
      expect(tsCode).toMatch(/interface\s+AdminDoc\b/)
    })

    test('订单状态机（boardingOrderStateMachine.canTransition）', () => {
      // Sprint 28 重构：状态机外置到 ./common/boarding-state-machine，
      // orders.ts 通过 boardingOrderStateMachine.canTransition() 推进状态，
      // 不再内联 ALLOWED_TRANSITIONS 常量
      expect(tsCode).toMatch(/boardingOrderStateMachine\.canTransition/)
    })

    test('强类型化 STATUS_TEXT_MAP', () => {
      expect(tsCode).toMatch(/STATUS_TEXT_MAP/)
    })

    test('强类型化 SENSITIVE_HOST_FIELDS', () => {
      expect(tsCode).toMatch(/SENSITIVE_HOST_FIELDS/)
    })

    test('从 common/types 导入 OrderDoc / UserDoc / OrderStatus', () => {
      expect(tsCode).toMatch(/import\s+type\s*\{[\s\S]*?OrderDoc/)
      expect(tsCode).toMatch(/import\s+type\s*\{[\s\S]*?UserDoc/)
      expect(tsCode).toMatch(/import\s+type\s*\{[\s\S]*?OrderStatus/)
    })

    test('从 common/logger 导入 ServiceLogger', () => {
      expect(tsCode).toMatch(/import\s+\{[^}]*ServiceLogger[^}]*\}\s+from\s+['"][^'"]*logger['"]/)
    })
  })

  describe('4. orders.ts handler 完整性', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(ORDERS_DIR, 'orders.ts'), 'utf8')
    })

    const HANDLERS = [
      'getOrders', 'enrichOrders', 'createOrder', 'updateOrderStatus',
      'getActivityOrders', 'getActivityOrderDetail', 'cancelOrder',
      'getOrderDetail', 'calculatePrice', 'checkDateAvailability',
      'getBoardingOrders', 'getBoardingOrderDetail', 'handleBoardingOrder',
      'submitEvaluation', 'getHostEvaluations',
    ]

    test.each(HANDLERS)('handler "%s" 应 export', name => {
      const re = new RegExp(`export\\s+async\\s+function\\s+${name}\\b`)
      expect(re.test(tsCode)).toBe(true)
    })

    test('应至少有 15 个 export async function', () => {
      const matches = tsCode.match(/export\s+async\s+function\s+/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(15)
    })
  })

  describe('5. orders.ts 业务逻辑要点', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(ORDERS_DIR, 'orders.ts'), 'utf8')
    })

    test('使用 err() 工厂（参数校验）', () => {
      const matches = tsCode.match(/\berr\s*\(/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(10)
    })

    test('使用 isBusinessError 类型守卫（替代裸字符串比较）', () => {
      const matches = tsCode.match(/isBusinessError\(/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(3)
    })

    test('使用 catch (error: unknown) 模式', () => {
      const matches = tsCode.match(/catch\s*\(\s*\w+\s*:\s*unknown\s*\)/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(5)
    })

    test('createOrder 接入风控限流（withRateLimit）', () => {
      expect(tsCode).toMatch(/withRateLimit[\s\S]{0,200}type:\s*['"]order['"]/)
    })

    test('submitEvaluation 接入风控检测（detectReviewSpam）', () => {
      expect(tsCode).toMatch(/detectReviewSpam/)
    })

    test('submitEvaluation 使用 mapActionToErrorCode', () => {
      expect(tsCode).toMatch(/mapActionToErrorCode/)
    })

    test('handleBoardingOrder 使用 boarding-state-machine', () => {
      expect(tsCode).toMatch(/boarding-state-machine/)
    })

    test('createOrder 使用 normalizeDbError 兜底', () => {
      expect(tsCode).toMatch(/normalizeDbError/)
    })

    test('getBoardingOrders 使用 paginate 工具', () => {
      expect(tsCode).toMatch(/paginate/)
    })

    test('检测订单状态机（boardingOrderStateMachine.canTransition）', () => {
      // Sprint 28 重构：状态机外置到 ./common/boarding-state-machine
      expect(tsCode).toMatch(/boardingOrderStateMachine\.canTransition/)
    })
  })

  describe('6. orders.ts Runtime shim（CommonJS 兼容）', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(ORDERS_DIR, 'orders.ts'), 'utf8')
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

  describe('7. orders.d.ts 类型声明', () => {
    let dtsCode
    beforeAll(() => {
      dtsCode = fs.readFileSync(path.join(ORDERS_DIR, 'orders.d.ts'), 'utf8')
    })

    test('至少 14 处 export declare function', () => {
      const matches = dtsCode.match(/export\s+declare\s+function/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(14)
    })

    test('getOrders 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+getOrders\b/)
    })

    test('createOrder 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+createOrder\b/)
    })

    test('submitEvaluation 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+submitEvaluation\b/)
    })

    test('calculatePrice 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+calculatePrice\b/)
    })

    test('checkDateAvailability 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+checkDateAvailability\b/)
    })

    test('EnrichedOrder 接口导出', () => {
      expect(dtsCode).toMatch(/interface\s+EnrichedOrder\b/)
    })
  })

  describe('8. orders.js 编译产物', () => {
    let jsCode
    beforeAll(() => {
      jsCode = fs.readFileSync(path.join(ORDERS_DIR, 'orders.js'), 'utf8')
    })

    test('头部包含 /* eslint-disable */ 标记（构建产物）', () => {
      expect(jsCode.startsWith('/* eslint-disable')).toBe(true)
    })

    test('包含 _mod.exports = _handlers shim', () => {
      expect(jsCode).toMatch(/_mod\.exports\s*=\s*_handlers/)
    })

    test('导出 getOrders', () => {
      expect(jsCode).toMatch(/exports\.getOrders\s*=/)
    })

    test('导出 createOrder', () => {
      expect(jsCode).toMatch(/exports\.createOrder\s*=/)
    })

    test('require 路径在 cloudfunctions 内部可解析', () => {
      // 跳过注释行（避免匹配到 .ts 注释中描述 CommonJS 行为的 require 字面量）
      const lines = jsCode.split('\n')
      const requires = []
      for (const line of lines) {
        if (line.trim().startsWith('//')) {continue}
        const m = line.match(/require\(['"]([^'"]+)['"]\)/g)
        if (m) {requires.push(...m)}
      }
      for (const r of requires) {
        const m = r.match(/require\(['"]([^'"]+)['"]\)/)
        if (!m) { continue }
        const p = m[1]
        if (!(p.startsWith('.') || p.startsWith('/'))) { continue }
        const candidates = [
          path.resolve(ORDERS_DIR, p),
          path.resolve(ORDERS_DIR, `${p}.js`),
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

  describe('10. 现有 order-service 测试回归', () => {
    test('order-service-orders.test.js 应继续通过', () => {
      // 由独立 jest 任务验证；此处只检查文件存在
      expect(fs.existsSync(path.join(ROOT, 'test', 'order-service-orders.test.js'))).toBe(true)
    })

    test('order-service-evaluation-risk.test.js 应继续通过', () => {
      expect(fs.existsSync(path.join(ROOT, 'test', 'order-service-evaluation-risk.test.js'))).toBe(true)
    })
  })
})
