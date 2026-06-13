/**
 * Sprint 45: orderTimeoutService TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在
 *   2. 验证 tsconfig.orderTimeoutService.json include 包含 index.ts
 *   3. 验证 build-all-services.js 包含 index.js target
 *   4. 验证 index.ts 类型定义完整（5 类订单 + 7 辅助函数 + 7 常量）
 *   5. 验证 Runtime shim 兼容 CommonJS
 *   6. 验证 package.json 注册 audit 脚本
 *   7. 验证 audit 脚本可成功运行
 *
 * 配合：scripts/audit-s45-order-timeout-service-ts.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TS_DIR = path.join(ROOT, 'cloudfunctions', 'orderTimeoutService')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (e) { return false }
}

describe('Sprint 45: orderTimeoutService TypeScript 迁移', () => {
  describe('1. 物理文件存在', () => {
    test('index.ts 存在', () => {
      expect(fileExists(path.join(TS_DIR, 'index.ts'))).toBe(true)
    })

    test('index.js（构建产物）存在', () => {
      expect(fileExists(path.join(TS_DIR, 'index.js'))).toBe(true)
    })
  })

  describe('2. tsconfig.orderTimeoutService.json include', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.orderTimeoutService.json')))
    })

    test('include 包含 cloudfunctions/orderTimeoutService/index.ts', () => {
      expect(cfg.include).toContain('cloudfunctions/orderTimeoutService/index.ts')
    })
  })

  describe('3. build-all-services.js 编译', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
    })

    test('build 脚本存在', () => {
      expect(code).not.toBeNull()
    })

    test('build 脚本包含 target: index.js', () => {
      const noComment = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      expect(noComment).toMatch(/['"]?index\.js['"]?/)
    })

    test('使用 tsc 编译 tsconfig.orderTimeoutService.json（在 build-all-services.js 中）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(allBuild).toMatch(new RegExp('tsconfig\\.orderTimeoutService\\.json'))
      expect(allBuild).toMatch(new RegExp(`name\\s*:\\s*'orderTimeoutService'`))
    })
  })

  describe('4. index.ts 类型与公共结构', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(TS_DIR, 'index.ts'))
    })

    test('注释包含 Sprint 45', () => {
      expect(code).toMatch(/Sprint\s*45/)
    })

    test('包含 AuthLike / CloudEvent / CloudContext 接口', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
      expect(code).toMatch(/export\s+interface\s+CloudEvent\b/)
      expect(code).toMatch(/export\s+interface\s+CloudContext\b/)
    })
  })

  describe('5. 联合类型', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(TS_DIR, 'index.ts'))
    })

    test('包含 OrderBusinessLine 联合类型（5 类订单）', () => {
      expect(code).toMatch(/export\s+type\s+OrderBusinessLine[\s\S]*?['"]boarding['"][\s\S]*?['"]feeding['"][\s\S]*?['"]mall['"][\s\S]*?['"]group_buy['"][\s\S]*?['"]activity['"]/)
    })

    test('包含 OrderStatus 联合类型', () => {
      expect(code).toMatch(/export\s+type\s+OrderStatus\b/)
    })

    test('包含 OrderType 联合类型', () => {
      expect(code).toMatch(/export\s+type\s+OrderType\b/)
    })
  })

  describe('6. 业务接口', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(TS_DIR, 'index.ts'))
    })

    test('包含 OrderDoc 接口（通用订单文档）', () => {
      expect(code).toMatch(/export\s+interface\s+OrderDoc\b/)
    })

    test('包含 FeedingOrderDoc 接口（喂养订单）', () => {
      expect(code).toMatch(/export\s+interface\s+FeedingOrderDoc\b/)
    })

    test('包含 ActivityRegistrationDoc 接口（活动报名）', () => {
      expect(code).toMatch(/export\s+interface\s+ActivityRegistrationDoc\b/)
    })

    test('包含 TimeoutResult 接口（结果汇总）', () => {
      expect(code).toMatch(/export\s+interface\s+TimeoutResult\b/)
    })

    test('包含 WechatPayConfig 接口（微信支付 v3 配置）', () => {
      expect(code).toMatch(/export\s+interface\s+WechatPayConfig\b/)
    })
  })

  describe('7. 超时常量（7 个）', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(TS_DIR, 'index.ts'))
    })

    const TIMEOUTS = [
      { name: 'ORDER_TIMEOUT_MINUTES', val: 30 },
      { name: 'FEEDING_ORDER_TIMEOUT_MINUTES', val: 30 },
      { name: 'MALL_ORDER_TIMEOUT_MINUTES', val: 30 },
      { name: 'GROUP_BUY_TIMEOUT_MINUTES', val: 30 },
      { name: 'ACTIVITY_ORDER_TIMEOUT_MINUTES', val: 30 },
    ]

    test('共 7 个常量', () => {
      const matches = code.match(/export\s+const\s+\w+\s*=\s*\d+/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(7)
    })

    TIMEOUTS.forEach(t => {
      test(`包含 ${t.name}=${t.val}`, () => {
        expect(code).toMatch(new RegExp(`export\\s+const\\s+${t.name}\\s*=\\s*${t.val}`))
      })
    })

    test('包含 BATCH_SIZE=100', () => {
      expect(code).toMatch(/export\s+const\s+BATCH_SIZE\s*=\s*100/)
    })

    test('包含 MAX_BATCHES=10', () => {
      expect(code).toMatch(/export\s+const\s+MAX_BATCHES\s*=\s*10/)
    })
  })

  describe('8. 7 个辅助函数', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(TS_DIR, 'index.ts'))
    })

    const HELPERS = [
      'normalizePrivateKey',
      'generateAuthorization',
      'closeWechatOrder',
      'restoreProductStock',
      'unlockOrderCoupons',
      'restoreTuanDealStock',
      'restoreActivityQuota',
      'fetchAllExpired',
    ]

    test('共 8 个辅助函数（normalizePrivateKey/closeWechatOrder/restoreXxx/fetchAllExpired）', () => {
      expect(HELPERS.length).toBe(8)
    })

    HELPERS.forEach(fn => {
      test(`导出 ${fn}`, () => {
        expect(code).toMatch(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`))
      })
    })
  })

  describe('9. 5 类订单业务逻辑', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(TS_DIR, 'index.ts'))
    })

    test('导出 main 入口函数', () => {
      expect(code).toMatch(/export\s+async\s+function\s+main\b/)
    })

    test('包含 5 类订单取消数统计', () => {
      expect(code).toMatch(/cancelledBoardingOrders/)
      expect(code).toMatch(/cancelledFeedingOrders/)
      expect(code).toMatch(/cancelledMallOrders/)
      expect(code).toMatch(/cancelledGroupBuyOrders/)
      expect(code).toMatch(/cancelledActivityOrders/)
    })

    test('包含微信关单统计', () => {
      expect(code).toMatch(/closedWechatOrders/)
    })

    test('包含错误列表统计', () => {
      expect(code).toMatch(/errors:\s*\[/)
    })
  })

  describe('10. 5 类订单的 where 查询条件', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(TS_DIR, 'index.ts'))
    })

    test('寄养订单：status=pending + paymentStatus=unpaid', () => {
      expect(code).toMatch(/status:\s*['"]pending['"]/)
      expect(code).toMatch(/paymentStatus:\s*['"]unpaid['"]/)
    })

    test('喂养订单：status in [pending, pending_payment]', () => {
      expect(code).toMatch(/_\.in\(\[?['"]pending['"]/)
    })

    test('商城订单：type=mall + status=pending_payment', () => {
      expect(code).toMatch(/type:\s*['"]mall['"]/)
      expect(code).toMatch(/status:\s*['"]pending_payment['"]/)
    })

    test('团购订单：type=group_buy + status=pending_payment', () => {
      expect(code).toMatch(/type:\s*['"]group_buy['"]/)
    })

    test('活动报名：collection=activity_registrations', () => {
      expect(code).toMatch(/['"]activity_registrations['"]/)
    })

    test('5 类订单都使用 _.lte(timeout) 时间过滤', () => {
      const matches = code.match(/_\.lte\(/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(5)
    })
  })

  describe('11. 资源回退逻辑', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(TS_DIR, 'index.ts'))
    })

    test('closeWechatOrder 返回 Promise<boolean>', () => {
      expect(code).toMatch(/closeWechatOrder[\s\S]*?Promise<boolean>/)
    })

    test('restoreProductStock 处理 SKU 维度库存', () => {
      expect(code).toMatch(/skus\.\$\{skuIndex\}\.stock/)
    })

    test('unlockOrderCoupons 处理过期/未过期两种状态', () => {
      expect(code).toMatch(/isExpired\s*\?/)
      expect(code).toMatch(/['"]expired['"]/)
      expect(code).toMatch(/['"]unused['"]/)
    })

    test('restoreTuanDealStock 更新 totalStock + soldCount', () => {
      expect(code).toMatch(/totalStock:\s*_\.inc\(/)
    })

    test('restoreActivityQuota 更新 currentParticipants', () => {
      expect(code).toMatch(/currentParticipants:\s*_\.inc\(/)
    })

    test('fetchAllExpired 通用分批拉取', () => {
      expect(code).toMatch(/for\s*\(let\s+batch\s*=\s*0/)
    })
  })

  describe('12. Runtime shim 兼容 CommonJS', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(TS_DIR, 'index.ts'))
    })

    test('包含 _mod.exports 块', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })

    test('包含 _mod.exports.default', () => {
      expect(code).toMatch(/_mod\.exports\.default\s*=/)
    })

    test('包含 export default', () => {
      expect(code).toMatch(/export\s+default\s+\{/)
    })
  })

  describe('13. package.json 注册', () => {
    let pkg
    beforeAll(() => {
      pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json')))
    })

    test('注册 audit:s45-order-timeout-service-ts', () => {
      expect(pkg.scripts['audit:s45-order-timeout-service-ts']).toBe(
        'node scripts/audit-s45-order-timeout-service-ts.js'
      )
    })

    test('注册 audit:s45-order-timeout-service-ts:strict', () => {
      expect(pkg.scripts['audit:s45-order-timeout-service-ts:strict']).toBe(
        'node scripts/audit-s45-order-timeout-service-ts.js --strict'
      )
    })

    test('ci:check 包含 audit:s45-order-timeout-service-ts:strict', () => {
      expect(pkg.scripts['ci:check']).toMatch(/audit:s45-order-timeout-service-ts:strict/)
    })
  })

  describe('14. audit 脚本可成功运行', () => {
    test('audit:s45-order-timeout-service-ts 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s45-order-timeout-service-ts.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本运行失败:\n${msg}`)
      }
    })

    test('audit:s45-order-timeout-service-ts:strict 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s45-order-timeout-service-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本（strict）运行失败:\n${msg}`)
      }
    })
  })
})
