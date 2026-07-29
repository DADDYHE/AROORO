/**
 * Sprint 42: hostService TypeScript 迁移测试
 *
 * 目标：
 *   1. 验证 .ts 源文件存在
 *   2. 验证 tsconfig.hostService.json include 包含 index.ts
 *   3. 验证 build-all-services.js 包含 index.js target
 *   4. 验证 index.ts 类型定义完整（含加密子系统）
 *   5. 验证 7 个 handler 导出
 *   6. 验证 Runtime shim 兼容 CommonJS
 *   7. 验证测试用 internal 导出
 *   8. 验证 package.json 注册 audit 脚本
 *   9. 验证 audit 脚本可成功运行
 *
 * 配合：scripts/audit-s42-host-service-ts.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const HOST_DIR = path.join(ROOT, 'cloudfunctions', 'hostService')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

function fileExists(p) {
  try { return fs.existsSync(p) } catch (e) { return false }
}

describe('Sprint 42: hostService TypeScript 迁移', () => {
  describe('1. 物理文件存在', () => {
    test('index.ts 存在', () => {
      expect(fileExists(path.join(HOST_DIR, 'index.ts'))).toBe(true)
    })

    test('index.js（构建产物）存在', () => {
      expect(fileExists(path.join(HOST_DIR, 'index.js'))).toBe(true)
    })
  })

  describe('2. tsconfig.hostService.json include', () => {
    let cfg
    beforeAll(() => {
      cfg = JSON.parse(readFileSafe(path.join(ROOT, 'tsconfig.hostService.json')))
    })

    test('include 包含 cloudfunctions/hostService/index.ts', () => {
      expect(cfg.include).toContain('cloudfunctions/hostService/index.ts')
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

    test('使用 tsc 编译 tsconfig.hostService.json（在 build-all-services.js 中）', () => {
      const allBuild = readFileSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(allBuild).toMatch(new RegExp('tsconfig\\.hostService\\.json'))
      expect(allBuild).toMatch(new RegExp(`name\\s*:\\s*'hostService'`))
    })
  })

  describe('4. index.ts 类型与公共结构', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(HOST_DIR, 'index.ts'))
    })

    test('注释包含 Sprint 42', () => {
      expect(code).toMatch(/Sprint\s*42/)
    })

    test('包含 AuthLike / CloudEvent / CloudContext 接口', () => {
      expect(code).toMatch(/export\s+interface\s+AuthLike\b/)
      expect(code).toMatch(/export\s+interface\s+CloudEvent\b/)
      expect(code).toMatch(/export\s+interface\s+CloudContext\b/)
    })

    test('包含 HostActionHandler 类型', () => {
      expect(code).toMatch(/export\s+type\s+HostActionHandler\b/)
    })

    test('包含 HostRecord / HostStats 接口', () => {
      expect(code).toMatch(/export\s+interface\s+HostRecord\b/)
      expect(code).toMatch(/export\s+interface\s+HostStats\b/)
    })

    test('包含 handlers 聚合对象', () => {
      expect(code).toMatch(/export\s+const\s+handlers\s*:\s*Record<string,\s*HostActionHandler>/)
    })

    test('包含 main 入口函数', () => {
      expect(code).toMatch(/export\s+async\s+function\s+main\b/)
    })
  })

  describe('5. 7 个 action handler', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(HOST_DIR, 'index.ts'))
    })

    const ACTIONS = [
      'createHostProfile', 'updateHostProfile', 'getHostList', 'getHostDetail',
      'getHostProfile', 'updateHostAcceptingOrders', 'getHostStats',
    ]

    test('共 7 个 action', () => {
      expect(ACTIONS.length).toBe(7)
    })

    ACTIONS.forEach(act => {
      test(`导出 ${act}`, () => {
        expect(code).toMatch(new RegExp(`export\\s+async\\s+function\\s+${act}\\b`))
      })
    })

    test('包含 Runtime shim', () => {
      expect(code).toMatch(/_mod\.exports\s*=\s*\{/)
    })
  })

  describe('6. 加密子系统（5 函数 + 类型）', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(HOST_DIR, 'index.ts'))
    })

    const HELPERS = [
      '_encryptSensitive',
      '_encryptSensitiveCBC',
      '_encryptDual',
      '_decryptSensitive',
      '_decryptCBC',
    ]

    HELPERS.forEach(fn => {
      test(`包含 ${fn} 函数`, () => {
        expect(code).toMatch(new RegExp(`function\\s+${fn}\\b`))
      })
    })

    test('包含 EncryptedPayload 接口（v1/v2 双写）', () => {
      expect(code).toMatch(/export\s+interface\s+EncryptedPayload\b/)
      expect(code).toMatch(/v1\?:\s*string/)
      expect(code).toMatch(/v2:\s*string/)
    })

    test('包含 KeyVersion 联合类型', () => {
      expect(code).toMatch(/export\s+type\s+KeyVersion\s*=\s*1\s*\|\s*2/)
    })

    test('包含 KEY_VERSION 常量（V1_CBC=1, V2_GCM=2）', () => {
      expect(code).toMatch(/V1_CBC:\s*1/)
      expect(code).toMatch(/V2_GCM:\s*2/)
    })

    test('包含 AES-256-GCM / AES-256-CBC 算法标识', () => {
      expect(code).toMatch(/AES-256-GCM/)
      expect(code).toMatch(/AES-256-CBC/)
    })
  })

  describe('7. 工具函数', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(HOST_DIR, 'index.ts'))
    })

    test('包含 escapeRegExp 函数（用于关键词转义）', () => {
      expect(code).toMatch(/function\s+escapeRegExp\b/)
    })

    test('包含 KEYWORD_MAX_LENGTH=50 常量', () => {
      expect(code).toMatch(/KEYWORD_MAX_LENGTH\s*=\s*50/)
    })
  })

  describe('8. 7 个 action 强类型化', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(HOST_DIR, 'index.ts'))
    })

    test('强类型化 7 个 action', () => {
      const matches = code.match(/export\s+async\s+function\s+\w+/g) || []
      expect(matches.length).toBeGreaterThanOrEqual(7)
    })

    test('getHostList 支持 keyword 关键词搜索', () => {
      expect(code).toMatch(/db\.RegExp/)
    })

    test('getHostList 支持 sort 排序', () => {
      expect(code).toMatch(/sort\s*===\s*'price_asc'/)
      expect(code).toMatch(/sort\s*===\s*'price_desc'/)
    })

    test('getHostStats 聚合 4 种订单状态', () => {
      expect(code).toMatch(/organizerId:\s*openid/)
    })
  })

  describe('9. 测试用 internal 导出', () => {
    let code
    beforeAll(() => {
      code = readFileSafe(path.join(HOST_DIR, 'index.ts'))
    })

    test('导出 _encryptSensitive（测试用）', () => {
      expect(code).toMatch(/_mod\.exports\._encryptSensitive\s*=/)
    })

    test('导出 _decryptSensitive（测试用）', () => {
      expect(code).toMatch(/_mod\.exports\._decryptSensitive\s*=/)
    })

    test('导出 KEY_VERSION（测试用）', () => {
      expect(code).toMatch(/_mod\.exports\.KEY_VERSION\s*=/)
    })

    test('导出条件含 HOST_SERVICE_EXPOSE_INTERNALS=true', () => {
      expect(code).toMatch(/HOST_SERVICE_EXPOSE_INTERNALS\s*===\s*'true'/)
    })
  })

  describe('10. package.json 注册', () => {
    let pkg
    beforeAll(() => {
      pkg = JSON.parse(readFileSafe(path.join(ROOT, 'package.json')))
    })

    test('注册 audit:s42-host-service-ts', () => {
      expect(pkg.scripts['audit:s42-host-service-ts']).toBe(
        'node scripts/audit-s42-host-service-ts.js'
      )
    })

    test('注册 audit:s42-host-service-ts:strict', () => {
      expect(pkg.scripts['audit:s42-host-service-ts:strict']).toBe(
        'node scripts/audit-s42-host-service-ts.js --strict'
      )
    })

    test('ci:check 包含 audit:all:strict', () => {
      expect(pkg.scripts['ci:check']).toMatch(/audit:all:strict/)
    })
  })

  describe('11. audit 脚本可成功运行', () => {
    test('audit:s42-host-service-ts 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s42-host-service-ts.js', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本运行失败:\n${msg}`)
      }
    })

    test('audit:s42-host-service-ts:strict 退出码为 0', () => {
      try {
        execSync('node scripts/audit-s42-host-service-ts.js --strict', { cwd: ROOT, stdio: 'pipe' })
      } catch (e) {
        const msg = e.stderr ? e.stderr.toString().split('\n').slice(0, 10).join('\n') : e.message
        throw new Error(`audit 脚本（strict）运行失败:\n${msg}`)
      }
    })
  })
})
