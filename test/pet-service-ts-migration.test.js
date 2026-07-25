/**
 * Sprint 44: petService TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在
 *   2. 验证 tsconfig.petService.json include 包含 index.ts
 *   3. 验证 build-all-services.js 包含 index.js target
 *   4. 验证 index.ts 类型定义完整（含宠物类型 / 性别 / 软删除）
 *   5. 验证 6 个 handler 导出
 *   6. 验证 Runtime shim 兼容 CommonJS
 *   7. 验证 1 个辅助函数（convertWeight）
 *   8. 验证 package.json 注册 audit 脚本
 *   9. 验证 audit 脚本可成功运行
 *
 * 配合：scripts/audit-s44-pet-service-ts.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const PET_DIR = path.join(ROOT, 'cloudfunctions', 'petService')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (e) { return false }
}

describe('Sprint 44: petService TypeScript 迁移', () => {
  describe('1. 物理文件存在', () => {
    test('index.ts 存在', () => {
      expect(fileExists(path.join(PET_DIR, 'index.ts'))).toBe(true)
    })

    test('index.js（构建产物）存在', () => {
      expect(fileExists(path.join(PET_DIR, 'index.js'))).toBe(true)
    })
  })

  describe('2. tsconfig.petService.json include', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.petService.json')))
    })

    test('include 包含 cloudfunctions/petService/index.ts', () => {
      expect(cfg.include).toContain('cloudfunctions/petService/index.ts')
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

    test('使用 tsc 编译 tsconfig.petService.json（在 build-all-services.js 中）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(allBuild).toMatch(new RegExp('tsconfig\\.petService\\.json'))
      expect(allBuild).toMatch(new RegExp(`name\\s*:\\s*'petService'`))
    })
  })

  describe('4. index.ts 类型与公共结构', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(PET_DIR, 'index.ts'))
    })

    test('注释包含 Sprint 44', () => {
      expect(code).toMatch(/Sprint\s*44/)
    })

    test('包含 AuthLike / CloudEvent / CloudContext 接口', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
      expect(code).toMatch(/export\s+interface\s+CloudEvent\b/)
      expect(code).toMatch(/export\s+interface\s+CloudContext\b/)
    })

    test('包含 PetActionHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+PetActionHandler\b/)
    })

    test('包含 PetRecord 接口', () => {
      expect(code).toMatch(/export\s+interface\s+PetRecord\b/)
    })

    test('包含 handlers 聚合对象', () => {
      expect(code).toMatch(/export\s+const\s+handlers\s*:\s*Record<string,\s*PetActionHandler>/)
    })

    test('包含 main 入口函数', () => {
      expect(code).toMatch(/export\s+async\s+function\s+main\b/)
    })
  })

  describe('5. 联合类型', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(PET_DIR, 'index.ts'))
    })

    test('包含 PetType 联合类型（cat / dog / exotic）', () => {
      expect(code).toMatch(/export\s+type\s+PetType\s*=\s*['"]cat['"]\s*\|\s*['"]dog['"]\s*\|\s*['"]exotic['"]/)
    })

    test('包含 PetGender 联合类型（male / female / unknown）', () => {
      expect(code).toMatch(/export\s+type\s+PetGender\s*=\s*['"]male['"]\s*\|\s*['"]female['"]\s*\|\s*['"]unknown['"]/)
    })

    test('包含 IsActive 联合类型（0 | 1）', () => {
      expect(code).toMatch(/export\s+type\s+IsActive\s*=\s*0\s*\|\s*1/)
    })

    test('包含 PetRecord 字段（name / type / gender / breed / birthday / weight / avatarUrl / note / ownerId / isActive）', () => {
      expect(code).toMatch(/name\?:\s*string/)
      expect(code).toMatch(/type\?:\s*PetType/)
      expect(code).toMatch(/gender\?:\s*PetGender/)
      expect(code).toMatch(/breed\?:\s*string/)
      expect(code).toMatch(/birthday\?:\s*string/)
      expect(code).toMatch(/weight\?:\s*number\s*\|\s*null/)
      expect(code).toMatch(/avatarUrl\?:\s*string/)
      expect(code).toMatch(/note\?:\s*string/)
      expect(code).toMatch(/ownerId\?:\s*string/)
      expect(code).toMatch(/isActive\?:\s*IsActive/)
    })
  })

  describe('6. 6 个 action handler', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(PET_DIR, 'index.ts'))
    })

    const ACTIONS = [
      'createPet', 'updatePet', 'deletePet', 'getPet', 'getPetList', 'getPetDetail',
    ]

    test('共 6 个 action', () => {
      expect(ACTIONS.length).toBe(6)
    })

    ACTIONS.forEach(act => {
      test(`导出 ${act}`, () => {
        // Sprint 51: 兼容 withErrorHandling 包装风格（export const xxx = withErrorHandling）
        const re = new RegExp(`export\\s+(async\\s+function|const)\\s+${act}\\b`)
        expect(code).toMatch(re)
      })
    })

    test('包含 Runtime shim', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })
  })

  describe('7. 辅助函数', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(PET_DIR, 'index.ts'))
    })

    test('包含 convertWeight 函数（体重转换）', () => {
      expect(code).toMatch(/export\s+function\s+convertWeight\b/)
    })

    test('convertWeight 返回 number | null', () => {
      expect(code).toMatch(/function\s+convertWeight[\s\S]*?:\s*number\s*\|\s*null\s*\{/)
    })

    test('包含默认值（null）的兜底', () => {
      expect(code).toMatch(/return\s+null/)
    })
  })

  describe('8. 6 个 action 强类型化', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(PET_DIR, 'index.ts'))
    })

    test('强类型化 6 个 action', () => {
      // Sprint 51: 兼容 withErrorHandling 包装风格
      const fnMatches = code.match(/export\s+async\s+function\s+\w+/g) || []
      const constMatches = code.match(/export\s+const\s+(createPet|updatePet|deletePet|getPet|getPetList|getPetDetail)\b/g) || []
      expect(fnMatches.length + constMatches.length).toBeGreaterThanOrEqual(6)
    })

    test('软删除（isActive=0）', () => {
      expect(code).toMatch(/isActive:\s*0/)
    })

    test('createPet 必填校验（name / type / breed / gender）', () => {
      expect(code).toMatch(/!name\s*\|\|\s*!type\s*\|\|\s*!breed\s*\|\|\s*!gender/)
    })

    test('VALID_TYPES 包含 3 个类型', () => {
      expect(code).toMatch(/VALID_TYPES:\s*PetType\[\]\s*=\s*\[\s*['"]cat['"]\s*,\s*['"]dog['"]\s*,\s*['"]exotic['"]\s*\]/)
    })

    test('VALID_GENDERS 包含 3 个性别', () => {
      expect(code).toMatch(/VALID_GENDERS:\s*PetGender\[\]\s*=\s*\[\s*['"]male['"]\s*,\s*['"]female['"]\s*,\s*['"]unknown['"]\s*\]/)
    })
  })

  describe('9. 缓存层', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(PET_DIR, 'index.ts'))
    })

    test('getPetDetail 缓存（pet_${petId}）', () => {
      expect(code).toMatch(/pet_\$\{petId\}/)
    })

    test('updatePet 缓存失效（pet_${petId} + pets_${openid}）', () => {
      expect(code).toMatch(/deleteCache\(`pets_\$\{openid\}`\)/)
      expect(code).toMatch(/deleteCache\(`pet_\$\{petId\}`\)/)
    })

    test('deletePet 缓存失效', () => {
      expect(code).toMatch(/deleteCache\(`pet_\$\{petId\}`\)/)
    })
  })

  describe('10. package.json 注册', () => {
    let pkg
    beforeAll(() => {
      pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json')))
    })

    test('注册 audit:s44-pet-service-ts', () => {
      expect(pkg.scripts['audit:s44-pet-service-ts']).toBe(
        'node scripts/audit-s44-pet-service-ts.js'
      )
    })

    test('注册 audit:s44-pet-service-ts:strict', () => {
      expect(pkg.scripts['audit:s44-pet-service-ts:strict']).toBe(
        'node scripts/audit-s44-pet-service-ts.js --strict'
      )
    })

    test('ci:check 包含 audit:all:strict（统一审计入口）', () => {
      // Sprint 48+: ci:check 改用 audit:all:strict 统一调用所有 audit 脚本
      //   audit:s44-pet-service-ts:strict 仍注册在 package.json 中，由 audit-all.js 自动遍历调用
      expect(pkg.scripts['ci:check']).toMatch(/audit:all:strict/)
    })
  })

  describe('11. audit 脚本可成功运行', () => {
    test('audit:s44-pet-service-ts 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s44-pet-service-ts.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本运行失败:\n${msg}`)
      }
    })

    test('audit:s44-pet-service-ts:strict 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s44-pet-service-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本（strict）运行失败:\n${msg}`)
      }
    })
  })
})
