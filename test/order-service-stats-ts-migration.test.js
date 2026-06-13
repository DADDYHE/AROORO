/**
 * Sprint 30: orderService/stats TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在
 *   2. 验证编译产物 .js / .d.ts
 *   3. 验证 CommonJS 导出 shim 正确（stats.getStats 是包装后函数）
 *   4. 验证 handler 强类型签名
 *   5. 验证关键业务逻辑（err / isBusinessError / aggregate / STATUS_TEXT_MAP / pickSum）
 *   6. 验证 TypeScript 编译可重复执行
 *   7. 验证 common/types.d.ts 包含 CloudBaseAggregate（Sprint 30 扩展）
 *   8. 验证 orderService TypeScript 迁移完成（orders.ts / payment.ts / stats.ts）
 *
 * 与 Sprint 28/29 迁移测试互补：
 *   - orders 服务测订单 / 评价 / 合作伙伴
 *   - payment 服务测支付下单 / 微信支付回调（旧版）
 *   - stats 服务测通用统计 / 收入统计
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const STATS_DIR = path.join(ROOT, 'cloudfunctions', 'orderService')

describe('Sprint 30: orderService/stats TypeScript 迁移', () => {
  describe('1. 文件存在性', () => {
    test('stats.ts 源文件应存在', () => {
      expect(fs.existsSync(path.join(STATS_DIR, 'stats.ts'))).toBe(true)
    })

    test('stats.d.ts 类型声明应存在', () => {
      expect(fs.existsSync(path.join(STATS_DIR, 'stats.d.ts'))).toBe(true)
    })

    test('stats.js 编译产物应存在', () => {
      expect(fs.existsSync(path.join(STATS_DIR, 'stats.js'))).toBe(true)
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

    test('include 包含 stats.ts（Sprint 30）', () => {
      expect(cfg.include).toContain('cloudfunctions/orderService/stats.ts')
    })

    test('include 仍包含 orders.ts（Sprint 28 回归）', () => {
      expect(cfg.include).toContain('cloudfunctions/orderService/orders.ts')
    })

    test('include 不再包含 payment.ts（Sprint 32 清理）', () => {
      // Sprint 32: payment.ts 已废弃移除，include 不应再包含
      expect(cfg.include).not.toContain('cloudfunctions/orderService/payment.ts')
    })
  })

  describe('3. stats.ts 源文件内容', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(STATS_DIR, 'stats.ts'), 'utf8')
    })

    test('注释中标注 "Sprint 30 迁移"', () => {
      expect(tsCode).toMatch(/Sprint\s*30/)
    })

    test('强类型化 GeneralStats 接口', () => {
      expect(tsCode).toMatch(/interface\s+GeneralStats\b/)
    })

    test('强类型化 AggregateSumResult 接口', () => {
      expect(tsCode).toMatch(/interface\s+AggregateSumResult\b/)
    })

    test('强类型化 IncomeStatsData 接口', () => {
      expect(tsCode).toMatch(/interface\s+IncomeStatsData\b/)
    })

    test('强类型化 IncomeListItem 接口', () => {
      expect(tsCode).toMatch(/interface\s+IncomeListItem\b/)
    })

    test('强类型化 STATUS_TEXT_MAP', () => {
      expect(tsCode).toMatch(/STATUS_TEXT_MAP/)
    })

    test('从 common/types 导入 ApiResponse', () => {
      expect(tsCode).toMatch(/import\s+type\s*\{[\s\S]*?ApiResponse/)
    })

    test('从 common/logger 导入 ServiceLogger', () => {
      expect(tsCode).toMatch(/import\s+\{[^}]*ServiceLogger[^}]*\}\s+from\s+['"][^'"]*logger['"]/)
    })
  })

  describe('4. stats.ts handler 完整性', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(STATS_DIR, 'stats.ts'), 'utf8')
    })

    test('handler "getStats" 应 export', () => {
      expect(tsCode).toMatch(/export\s+async\s+function\s+getStats\b/)
    })

    test('handler "getIncomeStats" 应 export', () => {
      expect(tsCode).toMatch(/export\s+async\s+function\s+getIncomeStats\b/)
    })

    test('应至少有 2 个 export async function', () => {
      const matches = tsCode.match(/export\s+async\s+function\s+/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('5. stats.ts 业务逻辑要点', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(STATS_DIR, 'stats.ts'), 'utf8')
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

    test('getStats 支持 owner 视角', () => {
      expect(tsCode).toMatch(/userRole\s*===\s*['"]owner['"]/)
    })

    test('getStats 支持 host 视角', () => {
      expect(tsCode).toMatch(/userRole\s*===\s*['"]host['"]/)
    })

    test('getStats 使用 db.collection.aggregate()', () => {
      expect(tsCode).toMatch(/\.aggregate\(\)[\s\S]{0,200}\.group\(/)
    })

    test('getStats 统计 bookingCount', () => {
      expect(tsCode).toMatch(/bookingCount[\s\S]{0,80}\$\.sum/)
    })

    test('getStats 统计 totalSpent（owner）', () => {
      expect(tsCode).toMatch(/totalSpent[\s\S]{0,80}\$\.sum/)
    })

    test('getStats 统计 totalIncome（host）', () => {
      expect(tsCode).toMatch(/totalIncome[\s\S]{0,80}\$\.sum/)
    })

    test('getIncomeStats 支持 status 过滤', () => {
      expect(tsCode).toMatch(/status\s*===\s*['"]completed['"]/)
      expect(tsCode).toMatch(/status\s*===\s*['"]pending['"]/)
    })

    test('getIncomeStats 支持 dateRange 过滤', () => {
      expect(tsCode).toMatch(/dateRange[\s\S]{0,200}getDateRangeFromPreset/)
    })

    test('getIncomeStats 并行查询（Promise.all）', () => {
      expect(tsCode).toMatch(/Promise\.all/)
    })

    test('getIncomeStats 返回 incomeList 明细', () => {
      expect(tsCode).toMatch(/incomeList/)
    })
  })

  describe('6. stats.ts Runtime shim（CommonJS 兼容）', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(STATS_DIR, 'stats.ts'), 'utf8')
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

  describe('7. stats.d.ts 类型声明', () => {
    let dtsCode
    beforeAll(() => {
      dtsCode = fs.readFileSync(path.join(STATS_DIR, 'stats.d.ts'), 'utf8')
    })

    test('至少 2 处 export declare function', () => {
      const matches = dtsCode.match(/export\s+declare\s+function/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })

    test('getStats 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+getStats\b/)
    })

    test('getIncomeStats 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+getIncomeStats\b/)
    })
  })

  describe('8. stats.js 编译产物', () => {
    let jsCode
    beforeAll(() => {
      jsCode = fs.readFileSync(path.join(STATS_DIR, 'stats.js'), 'utf8')
    })

    test('头部包含 /* eslint-disable */ 标记（构建产物）', () => {
      expect(jsCode.startsWith('/* eslint-disable')).toBe(true)
    })

    test('包含 _mod.exports = _handlers shim', () => {
      expect(jsCode).toMatch(/_mod\.exports\s*=\s*_handlers/)
    })

    test('导出 getStats', () => {
      expect(jsCode).toMatch(/exports\.getStats\s*=/)
    })

    test('导出 getIncomeStats', () => {
      expect(jsCode).toMatch(/exports\.getIncomeStats\s*=/)
    })

    test('require 路径在 cloudfunctions 内部可解析', () => {
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
          path.resolve(STATS_DIR, p),
          path.resolve(STATS_DIR, `${p}.js`),
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

  describe('10. stats.js 运行时（CommonJS 兼容）', () => {
    test('require("./stats") 包含 getStats 和 getIncomeStats', () => {
      delete require.cache[require.resolve(path.join(STATS_DIR, 'stats.js'))]
      const stats = require(path.join(STATS_DIR, 'stats.js'))
      expect(typeof stats.getStats).toBe('function')
      expect(typeof stats.getIncomeStats).toBe('function')
    })
  })

  describe('11. common/types.d.ts 扩展（Sprint 30）', () => {
    let typesDt
    beforeAll(() => {
      typesDt = fs.readFileSync(path.join(ROOT, 'cloudfunctions', 'common', 'types.d.ts'), 'utf8')
    })

    test('CloudBaseAggregate 接口定义存在', () => {
      expect(typesDt).toMatch(/interface\s+CloudBaseAggregate\b/)
    })

    test('AggregateOps 接口定义存在', () => {
      expect(typesDt).toMatch(/interface\s+AggregateOps\b/)
    })

    test('CloudBaseQuery 包含 aggregate() 方法', () => {
      expect(typesDt).toMatch(/aggregate:\s*\(\)\s*=>\s*CloudBaseAggregate/)
    })

    test('CloudBaseAggregate 包含 group() 方法', () => {
      expect(typesDt).toMatch(/group:\s*\(spec:\s*Record<string,\s*unknown>\)\s*=>\s*CloudBaseAggregate/)
    })

    test('CloudBaseAggregate 包含 end() 方法', () => {
      expect(typesDt).toMatch(/end:\s*\(\)\s*=>\s*Promise<\{\s*list:\s*any\[\]\s*\}>/)
    })
  })

  describe('12. orderService TypeScript 迁移完成度', () => {
    test('orders.ts 已迁移（Sprint 28）', () => {
      expect(fs.existsSync(path.join(STATS_DIR, 'orders.ts'))).toBe(true)
    })

    test('payment.ts 已废弃或为占位标记（Sprint 32）', () => {
      // Sprint 32: payment.ts 已废弃移除（wechatPay / wechatPayNotify 迁移到 paymentService）
      // 允许作为占位标记保留（含 PAYMENT_HANDLERS_MIGRATED = true）
      const paymentTs = path.join(STATS_DIR, 'payment.ts')
      if (fs.existsSync(paymentTs)) {
        const code = fs.readFileSync(paymentTs, 'utf8')
        expect(code).toMatch(/PAYMENT_HANDLERS_MIGRATED\s*=\s*true/)
      }
    })

    test('stats.ts 已迁移（Sprint 30）', () => {
      expect(fs.existsSync(path.join(STATS_DIR, 'stats.ts'))).toBe(true)
    })

    test('orderService 2/2 .ts 文件全部存在（payment.ts 已废弃）', () => {
      // Sprint 32: payment.ts 废弃移除，orderService 剩余 2 个 .ts 文件（orders.ts / stats.ts）
      const tsFiles = ['orders.ts', 'stats.ts']
      const allExist = tsFiles.every(f => fs.existsSync(path.join(STATS_DIR, f)))
      expect(allExist).toBe(true)
    })
  })
})
