/**
 * Sprint 46: rateLimitCleanup TypeScript 迁移测试
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TS_DIR = path.join(ROOT, 'cloudfunctions', 'rateLimitCleanup')

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
function fileExists(p) { try { return fs.existsSync(p) } catch (e) { return false } }

describe('Sprint 46: rateLimitCleanup TypeScript 迁移', () => {
  describe('1. 物理文件', () => {
    test('index.ts', () => { expect(fileExists(path.join(TS_DIR, 'index.ts'))).toBe(true) })
    test('index.js', () => { expect(fileExists(path.join(TS_DIR, 'index.js'))).toBe(true) })
  })

  describe('2. tsconfig', () => {
    test('include', () => {
      const cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.rateLimitCleanup.json')))
      expect(cfg.include).toContain('cloudfunctions/rateLimitCleanup/index.ts')
    })
  })

  describe('3. 业务类型', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('CleanupResult', () => { expect(code).toMatch(/export\s+interface\s+CleanupResult\b/) })
    test('RateLimitStats', () => { expect(code).toMatch(/export\s+interface\s+RateLimitStats\b/) })
  })

  describe('4. 常量', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('COLLECTION = rate_limits', () => { expect(code).toMatch(/export\s+const\s+COLLECTION\s*=\s*['"]rate_limits['"]/) })
    test('CLEANUP_BATCH_SIZE=200', () => { expect(code).toMatch(/export\s+const\s+CLEANUP_BATCH_SIZE\s*=\s*200/) })
    test('ACTION_CLEANUP=cleanup', () => { expect(code).toMatch(/export\s+const\s+ACTION_CLEANUP\s*=\s*['"]cleanup['"]/) })
    test('ACTION_STATS=stats', () => { expect(code).toMatch(/export\s+const\s+ACTION_STATS\s*=\s*['"]stats['"]/) })
  })

  describe('5. Action handlers', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    ;['cleanupAction', 'statsAction'].forEach(fn => {
      test(`导出 ${fn}`, () => { expect(code).toMatch(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`)) })
    })
  })

  describe('6. 业务流程', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('cleanupAction 循环清理', () => { expect(code).toMatch(/do\s*\{[\s\S]*?\}\s*while\s*\(\s*batch\s*>\s*0\s*\)/) })
    test('initGlobalRateLimitFromDb 调用', () => { expect(code).toMatch(/(initGlobalRateLimitFromDb|bootstrapRateLimit)\(/) })
    test('使用 cleanupExpiredRateLimits', () => { expect(code).toMatch(/cleanupExpiredRateLimits\(/) })
    test('使用 getGlobalRateLimitStats', () => { expect(code).toMatch(/getGlobalRateLimitStats\(/) })
    test('UNKOWN_ACTION 抛出', () => { expect(code).toMatch(/err\(['"]UNKNOWN_ACTION['"]/) })
  })

  describe('7. Runtime shim', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('_mod.exports', () => { expect(code).toMatch(/_mod\.exports\s*=\s*\{/) })
    test('export default', () => { expect(code).toMatch(/export\s+default\s+\{/) })
  })

  describe('8. package.json', () => {
    let pkg
    beforeAll(() => { pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json'))) })
    test('audit', () => { expect(pkg.scripts['audit:s46-rate-limit-cleanup-ts']).toBe('node scripts/audit-s46-rate-limit-cleanup-ts.js') })
    test('ci:check', () => { expect(pkg.scripts['ci:check']).toMatch(/(audit:s46-batch-services-ts:strict|audit:all:strict)/) })
  })

  describe('9. audit 脚本', () => {
    test('基础', () => { execSync('node scripts/audit-s46-rate-limit-cleanup-ts.js', { cwd: ROOT, stdio: 'pipe' }) })
    test('strict', () => { execSync('node scripts/audit-s46-rate-limit-cleanup-ts.js --strict', { cwd: ROOT, stdio: 'pipe' }) })
  })
})
