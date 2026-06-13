/**
 * Sprint 33: adminService/index.ts + constants.ts TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 index.ts / index.d.ts / index.js 文件存在
 *   2. 验证 constants.ts / constants.d.ts / constants.js 文件存在
 *   3. 验证 tsconfig.adminService.json 配置正确
 *   4. 验证 build-all-services.js 脚本正确
 *   5. 验证 index.ts 类型定义完整
 *   6. 验证 constants.ts 类型定义完整
 *   7. 验证 package.json 注册 audit 脚本
 *   8. 验证 audit 脚本可成功运行
 *
 * 配合：scripts/audit-s33-admin-service-ts.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const ADMIN_DIR = path.join(ROOT, 'cloudfunctions', 'adminService')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (e) { return false }
}

describe('Sprint 33: adminService TypeScript 迁移', () => {
  describe('1. 物理文件存在', () => {
    test('index.ts 存在', () => {
      expect(fileExists(path.join(ADMIN_DIR, 'index.ts'))).toBe(true)
    })

    test('index.d.ts 存在', () => {
      expect(fileExists(path.join(ADMIN_DIR, 'index.d.ts'))).toBe(true)
    })

    test('index.js（构建产物）存在', () => {
      expect(fileExists(path.join(ADMIN_DIR, 'index.js'))).toBe(true)
    })

    test('constants.ts 存在', () => {
      expect(fileExists(path.join(ADMIN_DIR, 'constants.ts'))).toBe(true)
    })

    test('constants.d.ts 存在', () => {
      expect(fileExists(path.join(ADMIN_DIR, 'constants.d.ts'))).toBe(true)
    })

    test('constants.js（构建产物）存在', () => {
      expect(fileExists(path.join(ADMIN_DIR, 'constants.js'))).toBe(true)
    })
  })

  describe('2. tsconfig.adminService.json 配置', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.adminService.json')))
    })

    test('tsconfig 文件存在', () => {
      expect(cfg).toBeTruthy()
    })

    test('include 包含 index.ts', () => {
      expect(cfg.include).toContain('cloudfunctions/adminService/index.ts')
    })

    test('include 包含 constants.ts', () => {
      expect(cfg.include).toContain('cloudfunctions/adminService/constants.ts')
    })

    test('compilerOptions.strict = true', () => {
      expect(cfg.compilerOptions.strict).toBe(true)
    })

    test('compilerOptions.target = ES2020', () => {
      expect(cfg.compilerOptions.target).toBe('ES2020')
    })

    test('compilerOptions.module = CommonJS', () => {
      expect(cfg.compilerOptions.module).toBe('CommonJS')
    })

    test('compilerOptions.declaration = true', () => {
      expect(cfg.compilerOptions.declaration).toBe(true)
    })
  })

  describe('3. build-all-services.js 脚本', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
    })

    test('build 脚本存在', () => {
      expect(code).not.toBeNull()
    })

    test('使用 tsc 编译 tsconfig.adminService.json（在 build-all-services.js 中）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(allBuild).toMatch(new RegExp('tsconfig\\.adminService\\.json'))
      expect(allBuild).toMatch(new RegExp(`name\\s*:\\s*'adminService'`))
    })

    test('TARGETS 包含 index.js / constants.js（build-all-services.js）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(allBuild).toMatch(/adminService[\s\S]*?index\.js/)
      expect(allBuild).toMatch(/adminService[\s\S]*?constants\.js/)
    })
  })

  describe('4. index.ts 类型定义', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ADMIN_DIR, 'index.ts'))
    })

    test('index.ts 存在', () => {
      expect(code).not.toBeNull()
    })

    test('注释包含 Sprint 33', () => {
      expect(code).toMatch(/Sprint\s*33/)
    })

    test('导出 PermissionLevel 类型', () => {
      expect(code).toMatch(/export\s+type\s+PermissionLevel\b/)
    })

    test('导出 ActionHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+ActionHandler\b/)
    })

    test('导出 CloudFunctionHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+CloudFunctionHandler\b/)
    })

    test('包含 AuthLike 接口', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
    })

    test('包含 CloudEvent 接口', () => {
      expect(code).toMatch(/export\s+interface\s+CloudEvent\b/)
    })

    test('包含 CloudContext 接口', () => {
      expect(code).toMatch(/export\s+interface\s+CloudContext\b/)
    })

    test('包含 HttpInfo 接口', () => {
      expect(code).toMatch(/export\s+interface\s+HttpInfo\b/)
    })

    test('包含 JwtDecodedToken 接口', () => {
      expect(code).toMatch(/export\s+interface\s+JwtDecodedToken\b/)
    })

    test('包含 EnrichmentResult 接口', () => {
      expect(code).toMatch(/export\s+interface\s+EnrichmentResult\b/)
    })

    test('包含 CorsHeaders 接口', () => {
      expect(code).toMatch(/export\s+interface\s+CorsHeaders\b/)
    })

    test('包含 HttpResponse 接口', () => {
      expect(code).toMatch(/export\s+interface\s+HttpResponse\b/)
    })

    test('强类型化 ACTION_PERMISSIONS', () => {
      expect(code).toMatch(/const\s+ACTION_PERMISSIONS\s*:\s*Record\s*<\s*string\s*,\s*PermissionLevel\s*>/)
    })

    test('导出 main 函数', () => {
      expect(code).toMatch(/export\s+const\s+main\s*[:=]/)
    })

    test('导出 handlers 聚合对象', () => {
      expect(code).toMatch(/export\s+const\s+handlers\s*[:=]/)
    })

    test('Runtime shim 修复 CommonJS 导出', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })
  })

  describe('5. constants.ts 类型定义', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(ADMIN_DIR, 'constants.ts'))
    })

    test('constants.ts 存在', () => {
      expect(code).not.toBeNull()
    })

    test('注释包含 Sprint 33', () => {
      expect(code).toMatch(/Sprint\s*33/)
    })

    test('使用 as const 派生 OrderTypeKey', () => {
      expect(code).toMatch(/as\s+const/)
    })

    test('包含 ORDER_TYPES 常量', () => {
      expect(code).toMatch(/export\s+const\s+ORDER_TYPES\s*[:=]/)
    })

    test('包含 ORDER_TYPE_NAMES 常量', () => {
      expect(code).toMatch(/export\s+const\s+ORDER_TYPE_NAMES\s*[:=]/)
    })

    test('强类型化 OrderTypeKey', () => {
      expect(code).toMatch(/export\s+type\s+OrderTypeKey\b/)
    })

    test('Runtime shim 修复 CommonJS 导出', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })
  })

  describe('6. 18 services 子模块未破坏（16 handler + 2 utility）', () => {
    const EXPECTED_HANDLER_SERVICES = [
      'activity', 'adminManagement', 'application', 'auth', 'banner',
      'coupon', 'feeding', 'hosting', 'i18nOverride', 'mall',
      'tuan', 'upload', 'user', 'wallet', 'stats',
      'commissionConfig',
    ]
    const EXPECTED_UTILITY_SERVICES = ['stateMachine', 'commission']
    const EXPECTED_ALL_SERVICES = [...EXPECTED_HANDLER_SERVICES, ...EXPECTED_UTILITY_SERVICES]

    EXPECTED_ALL_SERVICES.forEach(svc => {
      test(`services/${svc}.js 存在`, () => {
        expect(fileExists(path.join(ADMIN_DIR, 'services', `${svc}.js`))).toBe(true)
      })
    })

    test('index.ts 引入全部 16 handler services', () => {
      const indexTs = readFileSafe(path.join(ADMIN_DIR, 'index.ts'))
      EXPECTED_HANDLER_SERVICES.forEach(svc => {
        expect(indexTs).toMatch(new RegExp(`require\\(['"]\\.\\/services\\/${svc}['"]\\)`))
      })
    })
  })

  describe('7. package.json 注册', () => {
    let pkg
    beforeAll(() => {
      pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json')))
    })

    test('注册 audit:s33-admin-service-ts', () => {
      expect(pkg.scripts['audit:s33-admin-service-ts']).toBe(
        'node scripts/audit-s33-admin-service-ts.js'
      )
    })

    test('注册 audit:s33-admin-service-ts:strict', () => {
      expect(pkg.scripts['audit:s33-admin-service-ts:strict']).toBe(
        'node scripts/audit-s33-admin-service-ts.js --strict'
      )
    })

    test('ci:check 包含 audit:s33-admin-service-ts:strict', () => {
      expect(pkg.scripts['ci:check']).toMatch(/audit:s33-admin-service-ts:strict/)
    })
  })

  describe('8. audit 脚本可成功运行', () => {
    test('audit:s33-admin-service-ts 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s33-admin-service-ts.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本运行失败:\n${msg}`)
      }
    })

    test('audit:s33-admin-service-ts:strict 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s33-admin-service-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本（strict）运行失败:\n${msg}`)
      }
    })
  })
})
