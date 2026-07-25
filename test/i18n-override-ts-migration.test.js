/**
 * Sprint 46: i18nOverride TypeScript 迁移测试
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TS_DIR = path.join(ROOT, 'cloudfunctions', 'i18nOverride')

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
function fileExists(p) { try { return fs.existsSync(p) } catch (e) { return false } }

describe('Sprint 46: i18nOverride TypeScript 迁移', () => {
  describe('1. 物理文件', () => {
    test('index.ts', () => { expect(fileExists(path.join(TS_DIR, 'index.ts'))).toBe(true) })
    test('index.js', () => { expect(fileExists(path.join(TS_DIR, 'index.js'))).toBe(true) })
  })

  describe('2. tsconfig', () => {
    test('include', () => {
      const cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.i18nOverride.json')))
      expect(cfg.include).toContain('cloudfunctions/i18nOverride/index.ts')
    })
  })

  describe('3. 业务类型', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('SupportedLocale 联合', () => { expect(code).toMatch(/export\s+type\s+SupportedLocale\b/) })
    test('I18nOverrideDoc', () => { expect(code).toMatch(/export\s+interface\s+I18nOverrideDoc\b/) })
    test('I18nOverrides', () => { expect(code).toMatch(/export\s+interface\s+I18nOverrides\b/) })
  })

  describe('4. 常量', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('COLLECTION = i18n_overrides', () => { expect(code).toMatch(/export\s+const\s+COLLECTION\s*=\s*['"]i18n_overrides['"]/) })
    test('SUPPORTED_LOCALES 3 语言', () => {
      expect(code).toMatch(/['"]zh-CN['"]/)
      expect(code).toMatch(/['"]en-US['"]/)
      expect(code).toMatch(/['"]ja-JP['"]/)
    })
    test('FETCH_LIMIT=200', () => { expect(code).toMatch(/export\s+const\s+FETCH_LIMIT\s*=\s*200/) })
  })

  describe('5. Action handlers', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('fetchActive', () => { expect(code).toMatch(/export\s+async\s+function\s+fetchActive\b/) })
    // L2：fetchActiveOverrides 别名已移除（不再与 adminService 内部函数名重复）
  })

  describe('6. 业务流程', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('按 status=active 过滤', () => { expect(code).toMatch(/status:\s*['"]active['"]/) })
    test('按 locale 过滤（可选）', () => { expect(code).toMatch(/filter\.locale\s*=\s*locale/) })
    test('组装 overrides', () => { expect(code).toMatch(/overrides\[doc\.key\]\[doc\.locale\]\s*=\s*doc\.value/) })
  })

  describe('7. wx-server-sdk 降级', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('try/catch 降级', () => { expect(code).toMatch(/catch\s*\(e\)/) })
    test('cloudbase = null', () => { expect(code).toMatch(/cloudbase\s*=\s*null/) })
    test('INTERNAL_ERROR 抛出', () => { expect(code).toMatch(/err\(['"]INTERNAL_ERROR['"]/) })
  })

  describe('8. Runtime shim', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('_mod.exports', () => { expect(code).toMatch(/_mod\.exports\s*=\s*\{/) })
    test('export default', () => { expect(code).toMatch(/export\s+default\s+\{/) })
  })

  describe('9. package.json', () => {
    let pkg
    beforeAll(() => { pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json'))) })
    test('audit', () => { expect(pkg.scripts['audit:s46-i18n-override-ts']).toBe('node scripts/audit-s46-i18n-override-ts.js') })
    // ci:check 现走统一入口 audit:all:strict（含本服务 audit），不再硬编码 batch 入口
    test('ci:check', () => { expect(pkg.scripts['ci:check']).toMatch(/audit:all:strict/) })
  })

  describe('10. audit 脚本', () => {
    test('基础', () => { execSync('node scripts/audit-s46-i18n-override-ts.js', { cwd: ROOT, stdio: 'pipe' }) })
    test('strict', () => { execSync('node scripts/audit-s46-i18n-override-ts.js --strict', { cwd: ROOT, stdio: 'pipe' }) })
  })
})
