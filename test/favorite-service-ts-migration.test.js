/**
 * Sprint 46: favoriteService TypeScript 迁移测试
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TS_DIR = path.join(ROOT, 'cloudfunctions', 'favoriteService')

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
function fileExists(p) { try { return fs.existsSync(p) } catch (e) { return false } }

describe('Sprint 46: favoriteService TypeScript 迁移', () => {
  describe('1. 物理文件', () => {
    test('index.ts 存在', () => { expect(fileExists(path.join(TS_DIR, 'index.ts'))).toBe(true) })
    test('index.js 存在', () => { expect(fileExists(path.join(TS_DIR, 'index.js'))).toBe(true) })
  })

  describe('2. tsconfig', () => {
    test('include index.ts', () => {
      const cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.favoriteService.json')))
      expect(cfg.include).toContain('cloudfunctions/favoriteService/index.ts')
    })
  })

  describe('3. 公共结构', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('Sprint 46 注释', () => { expect(code).toMatch(/Sprint\s*46/) })
    test('公共接口', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
      expect(code).toMatch(/export\s+interface\s+CloudEvent\b/)
    })
  })

  describe('4. 业务类型', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('FavoriteTargetType 联合', () => { expect(code).toMatch(/export\s+type\s+FavoriteTargetType\b/) })
    test('FavoriteDoc 接口', () => { expect(code).toMatch(/export\s+interface\s+FavoriteDoc\b/) })
  })

  describe('5. Action handlers', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    ;['addFavorite', 'removeFavorite', 'getFavorites'].forEach(fn => {
      test(`导出 ${fn}`, () => { expect(code).toMatch(new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`)) })
    })
  })

  describe('6. 防重逻辑', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('addFavorite 校验已存在', () => { expect(code).toMatch(/existing\.data\s*&&\s*existing\.data\.length\s*>\s*0/) })
  })

  describe('7. 业务流程', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('list 排序 createdAt desc', () => { expect(code).toMatch(/orderBy\(['"]createdAt['"]\s*,\s*['"]desc['"]\)/) })
    test('list 分页 skip/limit', () => { expect(code).toMatch(/\.skip\(/) })
    test('list count 统计', () => { expect(code).toMatch(/\.count\(/) })
  })

  describe('8. 鉴权', () => {
    let code
    beforeAll(() => { code = readFileSafe(path.join(TS_DIR, 'index.ts')) })
    test('requireLogin: true', () => { expect(code).toMatch(/requireLogin:\s*true/) })
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
    test('audit', () => { expect(pkg.scripts['audit:s46-favorite-service-ts']).toBe('node scripts/audit-s46-favorite-service-ts.js') })
    test('ci:check', () => { expect(pkg.scripts['ci:check']).toMatch(/(?:audit:s46-batch-services-ts:strict|audit:all:strict)/) })
  })

  describe('11. audit 脚本', () => {
    test('基础退出码 0', () => { execSync('node scripts/audit-s46-favorite-service-ts.js', { cwd: ROOT, stdio: 'pipe' }) })
    test('strict 退出码 0', () => { execSync('node scripts/audit-s46-favorite-service-ts.js --strict', { cwd: ROOT, stdio: 'pipe' }) })
  })
})
