/**
 * Sprint 46: tuanService TypeScript 迁移测试
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TS_DIR = path.join(ROOT, 'cloudfunctions', 'tuanService')

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
function fileExists(p) { try { return fs.existsSync(p) } catch (e) { return false } }

describe('Sprint 46: tuanService TypeScript 迁移', () => {
  describe('1. 物理文件', () => {
    test('index.ts 存在', () => { expect(fileExists(path.join(TS_DIR, 'index.ts'))).toBe(true) })
    test('index.js 存在', () => { expect(fileExists(path.join(TS_DIR, 'index.js'))).toBe(true) })
  })

  describe('2. tsconfig include', () => {
    test('包含 cloudfunctions/tuanService/index.ts', () => {
      const cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.tuanService.json')))
      expect(cfg.include).toContain('cloudfunctions/tuanService/index.ts')
    })
  })

  describe('3. 公共结构', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('注释含 Sprint 46', () => { expect(code).toMatch(/Sprint\s*46/) })
    test('含 AuthLike / CloudEvent / CloudContext', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
      expect(code).toMatch(/export\s+interface\s+CloudEvent\b/)
      expect(code).toMatch(/export\s+interface\s+CloudContext\b/)
    })
  })

  describe('4. 业务类型', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('TuanStatus 联合类型', () => { expect(code).toMatch(/export\s+type\s+TuanStatus\b/) })
    test('TuanDeal 接口', () => { expect(code).toMatch(/export\s+interface\s+TuanDeal\b/) })
    test('TuanOrder 接口', () => { expect(code).toMatch(/export\s+interface\s+TuanOrder\b/) })
    test('TuanProduct / TuanSku 接口', () => {
      expect(code).toMatch(/export\s+interface\s+TuanProduct\b/)
      expect(code).toMatch(/export\s+interface\s+TuanSku\b/)
    })
  })

  describe('5. 常量', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('TUAN_DEAL_LIST_FIELDS', () => { expect(code).toMatch(/export\s+const\s+TUAN_DEAL_LIST_FIELDS/) })
    test('WRITE_ACTIONS = [createTuanOrder]', () => { expect(code).toMatch(/export\s+const\s+WRITE_ACTIONS[\s\S]*?['"]createTuanOrder['"]/) })
  })

  describe('6. Action handlers', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    const ACTIONS = ['getTuanDealList', 'getTuanDealDetail', 'createTuanOrder']
    ACTIONS.forEach(a => {
      test(`导出 ${a}`, () => { expect(code).toMatch(new RegExp(`export\\s+(?:async\\s+)?function\\s+${a}\\b`)) })
    })
  })

  describe('7. 工具函数', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('computeMinPrice 处理 SKU 维度', () => {
      expect(code).toMatch(/export\s+function\s+computeMinPrice\b/)
      expect(code).toMatch(/skuType\s*===\s*['"]multi['"]/)
    })
  })

  describe('8. 业务流程', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('createTuanOrder 写入 tuan_orders + orders 双表', () => {
      expect(code).toMatch(/db\.collection\(['"]tuan_orders['"]\)/)
      expect(code).toMatch(/db\.collection\(['"]orders['"]\)/)
    })
    test('SKU 维度库存扣减点号路径（优先团购配额 tuanStock）', () => {
      expect(code).toMatch(/skus\.\$\{skuIndex\}\./)
      expect(code).toMatch(/stockField\s*=\s*\(sku\.tuanStock/)
    })
    test('订单号生成', () => { expect(code).toMatch(/orderNo\s*=/) })
  })

  describe('9. Runtime shim', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('_mod.exports', () => { expect(code).toMatch(/_mod\.exports\s*=\s*\{/) })
    test('export default', () => { expect(code).toMatch(/export\s+default\s+\{/) })
  })

  describe('10. package.json 注册', () => {
    let pkg
    beforeAll(() => { pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json'))) })
    test('audit script', () => { expect(pkg.scripts['audit:s46-tuan-service-ts']).toBe('node scripts/audit-s46-tuan-service-ts.js') })
    test('audit strict', () => { expect(pkg.scripts['audit:s46-tuan-service-ts:strict']).toBe('node scripts/audit-s46-tuan-service-ts.js --strict') })
    test('ci:check 集成', () => { expect(pkg.scripts['ci:check']).toMatch(/(?:audit:s46-batch-services-ts:strict|audit:all:strict)/) })
  })

  describe('11. audit 脚本可运行', () => {
    test('audit:s46-tuan-service-ts 退出码 0', () => {
      execSync('node scripts/audit-s46-tuan-service-ts.js', { cwd: ROOT, stdio: 'pipe' })
    })
    test('audit:s46-tuan-service-ts:strict 退出码 0', () => {
      execSync('node scripts/audit-s46-tuan-service-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
    })
  })
})
