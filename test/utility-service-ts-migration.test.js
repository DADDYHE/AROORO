/**
 * Sprint 46: utilityService TypeScript 迁移测试
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TS_DIR = path.join(ROOT, 'cloudfunctions', 'utilityService')

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
function fileExists(p) { try { return fs.existsSync(p) } catch (e) { return false } }

describe('Sprint 46: utilityService TypeScript 迁移', () => {
  describe('1. 物理文件', () => {
    test('index.ts', () => { expect(fileExists(path.join(TS_DIR, 'index.ts'))).toBe(true) })
    test('index.js', () => { expect(fileExists(path.join(TS_DIR, 'index.js'))).toBe(true) })
  })

  describe('2. tsconfig', () => {
    test('include', () => {
      const cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.utilityService.json')))
      expect(cfg.include).toContain('cloudfunctions/utilityService/index.ts')
    })
  })

  describe('3. 业务类型', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('BannerDoc / BannerItem', () => {
      expect(code).toMatch(/export\s+interface\s+BannerDoc\b/)
      expect(code).toMatch(/export\s+interface\s+BannerItem\b/)
    })
    test('HostInfoResult', () => { expect(code).toMatch(/export\s+interface\s+HostInfoResult\b/) })
  })

  describe('4. 常量与缓存', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('BANNERS_CACHE_TTL=300000', () => { expect(code).toMatch(/export\s+const\s+BANNERS_CACHE_TTL\s*=\s*300000/) })
    test('BANNER_FETCH_LIMIT=10', () => { expect(code).toMatch(/export\s+const\s+BANNER_FETCH_LIMIT\s*=\s*10/) })
  })

  describe('5. Action handlers', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    ;['getBanners', 'getHostInfo', 'clearBannersCache'].forEach(fn => {
      test(`导出 ${fn}`, () => { expect(code).toMatch(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`)) })
    })
  })

  describe('6. 缓存逻辑', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('TTL 命中缓存', () => { expect(code).toMatch(/now\s*-\s*_bannersCacheTime\s*<\s*BANNERS_CACHE_TTL/) })
    test('clearBannersCache 重置', () => { expect(code).toMatch(/_bannersCache\s*=\s*null/) })
  })

  describe('7. getBanners 字段映射', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    // BannerItem 字段已与 DB banners 集合 / 首页 wxml 绑定对齐（imageUrl / actionType），
    // 原 image / action 为改名前旧断言（a1630c5 之后改名，此处同步更新）
    test('imageUrl 字段映射', () => { expect(code).toMatch(/imageUrl:\s*b\.imageUrl/) })
    test('actionType 字段映射', () => { expect(code).toMatch(/actionType:\s*b\.actionType/) })
  })

  describe('8. getHostInfo', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('校验 hostId', () => { expect(code).toMatch(/err\(['"]MISSING_REQUIRED['"]/) })
    test('HOST_NOT_FOUND', () => { expect(code).toMatch(/err\(['"]HOST_NOT_FOUND['"]/) })
  })

  describe('9. Runtime shim', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('_mod.exports', () => { expect(code).toMatch(/_mod\.exports\s*=\s*\{/) })
    test('export default', () => { expect(code).toMatch(/export\s+default\s+\{/) })
  })

  describe('10. package.json', () => {
    let pkg
    beforeAll(() => { pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json'))) })
    test('audit', () => { expect(pkg.scripts['audit:s46-utility-service-ts']).toBe('node scripts/audit-s46-utility-service-ts.js') })
    test('ci:check', () => { expect(pkg.scripts['ci:check']).toMatch(/(?:audit:s46-batch-services-ts:strict|audit:all:strict)/) })
  })

  describe('11. audit 脚本', () => {
    test('基础', () => { execSync('node scripts/audit-s46-utility-service-ts.js', { cwd: ROOT, stdio: 'pipe' }) })
    test('strict', () => { execSync('node scripts/audit-s46-utility-service-ts.js --strict', { cwd: ROOT, stdio: 'pipe' }) })
  })
})
