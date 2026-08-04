/**
 * Sprint 27: paymentService/commission TypeScript 迁移测试（写入器统一版）
 *
 * 2026-08-02 写入器统一后的契约：
 *   - common/commission-utils.ts 是全局唯一佣金写入实现（Single Source of Truth）
 *   - paymentService/services/commission.ts 仅薄委托，维持 pay.js / notify.js 的
 *     `require('./commission').createCommissionRecord` 调用契约不变
 *   - 业务逻辑（费率键别名 / 金额字段路由 / 幂等 / 写入）全部在 common/commission-utils.ts
 *
 * 本测试验证：
 *   1. 委托层文件存在（.ts / .js / .d.ts）
 *   2. tsconfig 配置（strict / include）
 *   3. commission.ts 是委托层（从 ../common/commission-utils 导入并再导出，无本地实现）
 *   4. 业务逻辑要点实际落在 common/commission-utils.ts
 *   5. pay.ts / notify.ts 仍用解构风格 require('./commission')
 *   6. commission.d.ts 类型声明正确（再导出函数与类型）
 *   7. commission.js 编译产物结构与导出（委托、路径可解析）
 *   8. tsc --noEmit 无错误
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SERVICES = path.join(ROOT, 'cloudfunctions', 'paymentService', 'services')
const COMMON = path.join(ROOT, 'cloudfunctions', 'common')

describe('Sprint 27: paymentService/commission 委托层迁移', () => {
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
    test('公共写入器 common/commission-utils.ts 应存在', () => {
      expect(fs.existsSync(path.join(COMMON, 'commission-utils.ts'))).toBe(true)
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

  describe('3. commission.ts 委托层契约', () => {
    let tsCode
    beforeAll(() => {
      tsCode = fs.readFileSync(path.join(SERVICES, 'commission.ts'), 'utf8')
    })

    test('从 ../common/commission-utils 导入写入器', () => {
      expect(tsCode).toMatch(/from\s*['"]\.\.\/common\/commission-utils['"]/)
    })

    test('导入 createCommissionRecord 与 cancelCommissionRecord', () => {
      expect(tsCode).toMatch(/createCommissionRecord/)
      expect(tsCode).toMatch(/cancelCommissionRecord/)
    })

    test('再导出类型（CommissionOrderDoc / CommissionOrderType）', () => {
      expect(tsCode).toMatch(/export\s+type\s*\{[^}]*CommissionOrderType[^}]*\}/)
      expect(tsCode).toMatch(/export\s+type\s*\{[^}]*CommissionOrderDoc[^}]*\}/)
    })

    test('默认导出 createCommissionRecord（CommonJS 兼容）', () => {
      expect(tsCode).toMatch(/export\s+default\s+createCommissionRecord/)
    })

    test('注释标注「写入器统一」/「委托」', () => {
      expect(tsCode).toMatch(/写入器统一|委托/)
    })

    test('⚠️ 不含本地佣金业务逻辑（统一到公共写入器）', () => {
      // 委托层允许薄 async function 包装 + 描述性注释，但不得重新实现业务逻辑：
      // 不得直接读 system_config / 不得用 generateId 生成 ID / 不得直接写 commissions
      expect(tsCode).not.toMatch(/db\.collection\(['"]system_config['"]\)/)
      expect(tsCode).not.toMatch(/doc\(['"]commission_rates['"]\)/)
      expect(tsCode).not.toMatch(/generateId/)
      expect(tsCode).not.toMatch(/db\.collection\(['"]commissions['"]\)\.add/)
    })
  })

  describe('4. 业务逻辑要点实际落在 common/commission-utils.ts', () => {
    let code
    beforeAll(() => {
      code = fs.readFileSync(path.join(COMMON, 'commission-utils.ts'), 'utf8')
    })

    test('读取 system_config.commission_rates', () => {
      expect(code).toMatch(/system_config/)
      expect(code).toMatch(/commission_rates/)
    })
    test('费率键别名表（修复寄养佣金恒为 0 的 P0）', () => {
      expect(code).toMatch(/RATE_KEY_ALIASES/)
      expect(code).toMatch(/hosting/)
    })
    test('查询买家（users._id = openid）', () => {
      expect(code).toMatch(/users/)
      expect(code).toMatch(/ownerId/)
    })
    test('查询邀请人（inviterId）', () => {
      expect(code).toMatch(/inviterId/)
    })
    test('计算佣金金额 = orderAmount × rate / 100（整数分）', () => {
      expect(code).toMatch(/orderAmount[\s\S]{0,60}\*\s*100|orderAmountFen/)
      expect(code).toMatch(/rate/)
    })
    test('幂等：orderId + inviterId 先查后写 + 唯一索引冲突恢复', () => {
      expect(code).toMatch(/orderId[\s\S]{0,120}inviterId/)
      expect(code).toMatch(/isDuplicateKeyError/)
    })
    test('写入 commissions 集合', () => {
      expect(code).toMatch(/commissions/)
    })
    test('确定性 _id（buildCommissionId 替代 generateId）', () => {
      expect(code).toMatch(/buildCommissionId/)
    })
    test('best-effort 错误处理：catch (error: unknown)', () => {
      expect(code).toMatch(/catch\s*\(\s*\w+\s*:\s*unknown\s*\)/)
    })
    test('强类型化 CommissionOrderType / CommissionOrderDoc / CommissionConfig / CommissionRecordPayload', () => {
      expect(code).toMatch(/export\s+type\s+CommissionOrderType\b/)
      expect(code).toMatch(/export\s+interface\s+CommissionOrderDoc\b/)
      expect(code).toMatch(/export\s+interface\s+CommissionConfig\b/)
      expect(code).toMatch(/export\s+interface\s+CommissionRecordPayload\b/)
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
    test('cancelCommissionRecord 函数导出', () => {
      expect(dtsCode).toMatch(/export\s+declare\s+function\s+cancelCommissionRecord\b/)
    })
    test('createCommissionRecord 返回 Promise<void>', () => {
      expect(dtsCode).toMatch(/createCommissionRecord[\s\S]{0,200}Promise\s*<\s*void\s*>/)
    })
    test('默认导出 createCommissionRecord（保持 CommonJS 兼容）', () => {
      expect(dtsCode).toMatch(/export\s+default\s+createCommissionRecord/)
    })
    test('再导出类型（至少 2 个类型 + 2 个函数 + 默认 ≥ 4 个 export）', () => {
      const exports = dtsCode.match(/export\s+/g) || []
      expect(exports.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('7. commission.js 编译产物（结构与导出）', () => {
    let jsCode
    beforeAll(() => {
      jsCode = fs.readFileSync(path.join(SERVICES, 'commission.js'), 'utf8')
    })

    test('委托到 ../common/commission-utils（require 存在）', () => {
      expect(jsCode).toMatch(/require\(['"]\.\.\/common\/commission-utils['"]\)/)
    })

    test('导出 createCommissionRecord 与 cancelCommissionRecord', () => {
      expect(jsCode).toMatch(/exports\.(createCommissionRecord|default)/)
      expect(jsCode).toMatch(/exports\.cancelCommissionRecord/)
    })

    test('不含本地 generateId 实现（逻辑已上移到公共写入器）', () => {
      expect(jsCode).not.toMatch(/generateId/)
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
