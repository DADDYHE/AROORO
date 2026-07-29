/**
 * Sprint 27: paymentService/commission TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在（不能依赖 .js 编译产物）
 *   2. 验证编译产物 .js 与 .d.ts 一致
 *   3. 验证 pay.ts / notify.ts 使用解构风格 require commission
 *   4. 验证 d.ts 中类型签名正确（强类型）
 *   5. 验证 TypeScript 编译可重复执行
 *   6. 验证业务逻辑要点（佣金率读取、幂等、写入）
 *   7. 验证 best-effort 错误处理（catch unknown）
 *
 * 与 Sprint 25/26 测试互补：
 *   - pay / notify 测 handler
 *   - commission 测 best-effort 工具函数
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SERVICES = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services')

describe('Sprint 27: paymentService/commission TypeScript 迁移', () => {
  describe('1. 文件存在性', () => {
    test('commission.ts 源文件应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'commission.ts'))).toBe(true)
    })

    test('commission.d.ts 类型声明应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'commission.d.ts'))).toBe(true)
    })

    test('commission.js 编译产物应存在', () => {
      expect(fs.existsSync(path.join(SERVICES, 'commission.js'))).toBe(true)
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

    test('include 包含 commission.ts（Sprint 27 扩展）', () => {
      expect(cfg.include).toContain('cloudfunctions/paymentService/services/commission.ts')
    })

    test('include 仍包含 pay.ts（回归）', () => {
      expect(cfg.include).toContain('cloudfunctions/paymentService/services/pay.ts')
    })

    test('include 仍包含 notify.ts（回归）', () => {
      expect(cfg.include).toContain('cloudfunctions/paymentService/services/notify.ts')
    })

    test('include 仍包含 refund.ts（回归）', () => {
      expect(cfg.include).toContain('cloudfunctions/paymentService/services/refund.ts')
    })
  })

  describe('3. commission.ts 源文件内容', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(SERVICES, 'commission.ts'), 'utf8')
    })

    test('注释中标注 "Sprint 27 迁移"', () => {
      expect(tsCode).toMatch(/Sprint\s*27/)
    })

    test('强类型化 CommissionOrderType', () => {
      expect(tsCode).toMatch(/export\s+type\s+CommissionOrderType\b/)
    })

    test('强类型化 CommissionOrderDoc', () => {
      expect(tsCode).toMatch(/export\s+interface\s+CommissionOrderDoc\b/)
    })

    test('强类型化 CommissionConfig（佣金率）', () => {
      expect(tsCode).toMatch(/export\s+interface\s+CommissionConfig\b/)
    })

    test('强类型化 CommissionRecordPayload（写入载荷）', () => {
      expect(tsCode).toMatch(/export\s+interface\s+CommissionRecordPayload\b/)
    })

    test('使用 export async function createCommissionRecord', () => {
      expect(tsCode).toMatch(/export\s+(async\s+)?function\s+createCommissionRecord\b/)
    })

    test('默认导出 createCommissionRecord', () => {
      expect(tsCode).toMatch(/export\s+default\s+createCommissionRecord/)
    })

    test('从 common/utils 导入 initCloud / generateId', () => {
      expect(tsCode).toMatch(/import\s*\{[^}]*initCloud[^}]*\}\s*from\s*['"][^'"]*utils['"]/)
      expect(tsCode).toMatch(/generateId/)
    })

    test('从 common/logger 导入 createLogger', () => {
      expect(tsCode).toMatch(/import\s*\{[^}]*createLogger[^}]*\}\s*from\s*['"][^'"]*logger['"]/)
    })

    test('从 common/types 导入 CloudBaseDB 类型', () => {
      expect(tsCode).toMatch(/CloudBaseDB/)
    })
  })

  describe('4. commission 业务逻辑要点', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(SERVICES, 'commission.ts'), 'utf8')
    })

    test('读取 system_config.commission_rates', () => {
      expect(tsCode).toMatch(/system_config/)
      expect(tsCode).toMatch(/commission_rates/)
    })

    test('查询买家（users._id = openid）', () => {
      expect(tsCode).toMatch(/users[\s\S]{0,80}doc[\s\S]{0,80}ownerId|ownerId[\s\S]{0,80}users/)
    })

    test('查询邀请人（inviterId）', () => {
      expect(tsCode).toMatch(/inviterId/)
    })

    test('计算佣金金额 = orderAmount × rate / 100', () => {
      // 期望出现 orderAmount * rate / 100 的计算
      expect(tsCode).toMatch(/orderAmount[\s\S]{0,40}\*\s*rate[\s\S]{0,40}\/\s*100|orderAmount[\s\S]{0,40}rate[\s\S]{0,40}\/100/)
    })

    test('幂等检查：orderId + inviterId', () => {
      expect(tsCode).toMatch(/orderId[\s\S]{0,100}inviterId[\s\S]{0,100}count|count[\s\S]{0,100}orderId[\s\S]{0,100}inviterId/)
    })

    test('写入 commissions 集合', () => {
      expect(tsCode).toMatch(/commissions/)
    })

    test('使用 generateId 生成佣金记录 ID', () => {
      expect(tsCode).toMatch(/generateId\(['"]commission['"]/)
    })

    test('best-effort 错误处理：catch (error: unknown)', () => {
      expect(tsCode).toMatch(/catch\s*\(\s*\w+\s*:\s*unknown\s*\)/)
    })
  })

  describe('5. pay.ts / notify.ts 解构风格 require', () => {
    test('pay.ts 使用解构风格 require commission', () => {
      const payCode = fs.readFileSync(path.join(SERVICES, 'pay.ts'), 'utf8')
      expect(payCode).toMatch(/const\s*\{[^}]*createCommissionRecord[^}]*\}\s*=\s*require\(['"]\.\/commission['"]\)/)
    })

    test('notify.ts 使用解构风格 require commission', () => {
      const notifyCode = fs.readFileSync(path.join(SERVICES, 'notify.ts'), 'utf8')
      expect(notifyCode).toMatch(/const\s*\{[^}]*createCommissionRecord[^}]*\}\s*=\s*require\(['"]\.\/commission['"]\)/)
    })
  })

  describe('6. commission.d.ts 类型声明', () => {
    let dtsCode
    beforeAll(() => {
      dtsCode = fs.readFileSync(path.join(SERVICES, 'commission.d.ts'), 'utf8')
    })

    test('createCommissionRecord 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+createCommissionRecord\b/)
    })

    test('createCommissionRecord 返回 Promise<void>', () => {
      expect(dtsCode).toMatch(/createCommissionRecord[\s\S]{0,200}Promise\s*<\s*void\s*>/)
    })

    test('默认导出 createCommissionRecord（保持 CommonJS 兼容）', () => {
      expect(dtsCode).toMatch(/export\s+default\s+createCommissionRecord/)
    })

    test('至少 4 个 export 类型（CommissionOrderType / OrderDoc / Config / RecordPayload）', () => {
      const exports = dtsCode.match(/export\s+(interface|type)/g) || []
      expect(exports.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('7. commission.js 编译产物（结构与导出）', () => {
    let jsCode
    beforeAll(() => {
      jsCode = fs.readFileSync(path.join(SERVICES, 'commission.js'), 'utf8')
    })

    test('头部包含 /* eslint-disable */ 标记（构建产物）', () => {
      expect(jsCode.startsWith('/* eslint-disable')).toBe(true)
    })

    test('导出 createCommissionRecord', () => {
      expect(jsCode).toMatch(/exports\.(createCommissionRecord|default)/)
    })

    test('引用 generateId', () => {
      expect(jsCode).toMatch(/generateId/)
    })

    test('require 路径在 cloudfunctions 内部可解析', () => {
      const requires = jsCode.match(/require\(['"]([^'"]+)['"]\)/g) || []
      for (const r of requires) {
        const m = r.match(/require\(['"]([^'"]+)['"]\)/)
        if (!m) { continue }
        const p = m[1]
        if (!(p.startsWith('.') || p.startsWith('/'))) { continue }
        const candidates = [
          path.resolve(SERVICES, p),
          path.resolve(SERVICES, `${p}.js`),
          path.resolve(ROOT, 'cloudfunctions', p.replace(/^\.\.\//, '')),
        ]
        const exists = candidates.some(c => fs.existsSync(c))
        expect(exists).toBe(true)
      }
    })
  })

  describe('8. 编译可重复执行', () => {
    test('tsc --noEmit 无错误', () => {
      const { execSync } = require('child_process')
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
