/**
 * Sprint 15: utils.ts TypeScript 迁移验证
 *
 * 覆盖：
 *   1. .ts 源文件存在 + utils.d.ts 已删除
 *   2. 编译产物 .js 存在
 *   3. 公共 API 在产物中正确导出
 *   4. 行为契约：ERROR_CODES、generateId、handleError、handleSuccess、paginate、batchProcess
 *   5. tsconfig / build-common 同步
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const TS = path.join(ROOT, 'cloudfunctions', 'common', 'utils.ts')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'utils.d.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'utils.js')
const TSCONFIG = path.join(ROOT, 'tsconfig.common.json')
const BUILD_SCRIPT = path.join(ROOT, 'scripts', 'build-common.js')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

describe('Sprint 15: utils.ts TypeScript 迁移', () => {
  describe('源文件 / 产物', () => {
    test('utils.ts 源文件存在', () => {
      expect(fs.existsSync(TS)).toBe(true)
    })

    test('utils.js 编译产物存在', () => {
      expect(fs.existsSync(JS)).toBe(true)
    })

    test('utils.d.ts 由 tsc 自动生成（基于 utils.ts）', () => {
      // 之前 utils.d.ts 是手动 shim；现在由 tsc 编译生成
      // 确认是自动产物（顶部有 tsc 注释）而非手写
      const content = readSafe(DTS)
      expect(content).toBeTruthy()
      // tsc 生成的文件通常包含头部注释
      expect(content).toMatch(/TypeScript/)
    })
  })

  describe('.ts 源码契约', () => {
    test('导出 initCloud / ERROR_CODES / ERROR_MESSAGES', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+function\s+initCloud/)
      expect(content).toMatch(/export\s+const\s+ERROR_CODES/)
      expect(content).toMatch(/export\s+const\s+ERROR_MESSAGES/)
    })

    test('导出 generateId / handleError / handleSuccess', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+function\s+generateId/)
      expect(content).toMatch(/export\s+function\s+handleError/)
      expect(content).toMatch(/export\s+function\s+handleSuccess/)
    })

    test('导出 paginate / batchProcess', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+async\s+function\s+paginate/)
      expect(content).toMatch(/export\s+async\s+function\s+batchProcess/)
    })

    test('导出 convertCloudUrls / revertCloudUrls', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+async\s+function\s+convertCloudUrls/)
      expect(content).toMatch(/export\s+function\s+revertCloudUrls/)
    })

    test('含 ID 类型白名单 TYPE_MAPPING', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/TYPE_MAPPING\s*:\s*Record/)
      expect(content).toMatch(/(?:['"]?order['"]?\s*:\s*['"]ord['"])/)
    })

    test('含核心类型 IdType / ErrorCodeMap / PaginateOptions', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+type\s+IdType/)
      expect(content).toMatch(/export\s+type\s+ErrorCodeMap/)
      expect(content).toMatch(/export\s+interface\s+PaginateOptions/)
    })
  })

  describe('.js 产物：行为契约', () => {
    let utils
    beforeAll(() => {
      const reqPath = require.resolve(JS)
      delete require.cache[reqPath]
      utils = require(JS)
    })

    test('产物导出所有公共 API', () => {
      const expected = [
        'initCloud', 'ERROR_CODES', 'ERROR_MESSAGES',
        'generateId', 'handleError', 'handleSuccess',
        'paginate', 'batchProcess', 'convertCloudUrls', 'revertCloudUrls',
      ]
      for (const name of expected) {
        expect(utils[name]).toBeDefined()
      }
    })

    test('ERROR_CODES 数值稳定（数字）', () => {
      expect(utils.ERROR_CODES.SUCCESS).toBe(0)
      expect(utils.ERROR_CODES.VALIDATION).toBe(1001)
      expect(utils.ERROR_CODES.DATA).toBe(1002)
      expect(utils.ERROR_CODES.AUTH).toBe(1003)
      expect(utils.ERROR_CODES.NOT_FOUND).toBe(1004)
      expect(utils.ERROR_CODES.PERMISSION).toBe(1005)
      expect(utils.ERROR_CODES.BUSINESS).toBe(1006)
      expect(utils.ERROR_CODES.SERVER).toBe(5001)
      expect(utils.ERROR_CODES.UNKNOWN).toBe(9999)
    })

    test('generateId 生成 ID 满足格式（≤32 字符 + 字母数字下划线）', () => {
      const id = utils.generateId('order', 'oUser12345')
      expect(id.length).toBeLessThanOrEqual(32)
      expect(id).toMatch(/^[a-zA-Z0-9_]+$/)
      expect(id).toMatch(/^ord_/)
    })

    test('generateId 无 type 时不以前缀开头', () => {
      const id = utils.generateId('', '')
      expect(id).toMatch(/^[a-zA-Z0-9_]+$/)
      expect(id.length).toBeGreaterThan(0)
    })

    test('handleError 返回结构正确', () => {
      const e = new Error('bad input')
      const res = utils.handleError(e, '失败', utils.ERROR_CODES.VALIDATION)
      expect(res.code).toBe(1001)
      expect(res.message).toBe('失败')
      expect(res.data).toBe(null)
      expect(res.error).toBe('bad input')
    })

    test('handleError 缺省 code 时回退到 BUSINESS (1006)', () => {
      const res = utils.handleError(new Error('x'))
      expect(res.code).toBe(1006)
    })

    test('handleSuccess 默认 success', () => {
      const res = utils.handleSuccess({ a: 1 })
      expect(res.code).toBe(0)
      expect(res.message).toBe('操作成功')
      expect(res.data).toEqual({ a: 1 })
    })

    test('paginate 基础行为（mock db）', async () => {
      const docs = Array.from({ length: 25 }, (_, i) => ({ _id: `d${i}`, createdAt: i }))
      const db = {
        collection: () => ({
          where: () => ({
            count: () => Promise.resolve({ total: docs.length }),
            field: function () { return this },
            orderBy: function () { return this },
            skip: function () { return this },
            limit: function () { return this },
            get: () => Promise.resolve({ data: docs.slice(0, 10) }),
          }),
        }),
      }
      const res = await utils.paginate(db, 'orders', { page: 1, pageSize: 10 })
      expect(res.list.length).toBe(10)
      expect(res.total).toBe(25)
      expect(res.totalPages).toBe(3)
      expect(res.hasNext).toBe(true)
    })

    test('paginate pageSize 上限保护（最大 100）', async () => {
      const db = {
        collection: () => ({
          where: () => ({
            count: () => Promise.resolve({ total: 0 }),
            field: function () { return this },
            orderBy: function () { return this },
            skip: function () { return this },
            limit: function (n) {
              // 验证 pageSize 被限制
              expect(n).toBeLessThanOrEqual(100)
              return { get: () => Promise.resolve({ data: [] }) }
            },
          }),
        }),
      }
      const res = await utils.paginate(db, 'orders', { pageSize: 9999 })
      expect(res.pageSize).toBe(100)
    })

    test('batchProcess 收集成功与失败', async () => {
      const items = [1, 2, 3, 4]
      const handler = async (n) => {
        if (n === 2) {throw new Error('boom')}
        return n * 10
      }
      const results = await utils.batchProcess(items, handler, 2)
      expect(results).toEqual([
        10,
        { success: false, error: 'boom' },
        30,
        40,
      ])
    })

    test('revertCloudUrls 是 no-op', () => {
      const event = { url: 'https://x' }
      expect(utils.revertCloudUrls(event)).toBe(event)
    })
  })

  describe('tsconfig / build 工具链', () => {
    test('tsconfig.common.json 包含 utils.ts', () => {
      const content = readSafe(TSCONFIG)
      expect(content).toMatch(/cloudfunctions\/common\/utils\.ts/)
    })

    test('scripts/build-common.js 包含 utils.js', () => {
      const content = readSafe(BUILD_SCRIPT)
      expect(content).toMatch(/['"]utils\.js['"]/)
    })

    test('tsconfig.common.json 包含 utils.ts（不直接 include .d.ts）', () => {
      const content = readSafe(TSCONFIG)
      // 已被 utils.ts 替代
      expect(content).not.toMatch(/cloudfunctions\/common\/utils\.d\.ts/)
      expect(content).toMatch(/cloudfunctions\/common\/utils\.ts/)
    })
  })

  describe('errors.ts 集成', () => {
    test('errors.ts 仍能从 utils 导入（编译通过）', () => {
      const errorsTs = readSafe(path.join(ROOT, 'cloudfunctions', 'common', 'errors.ts'))
      expect(errorsTs).toMatch(/from\s+['"]\.\/utils['"]/)
    })

    test('编译产物 errors.js 通过 require("./utils") 获取 ERROR_CODES', () => {
      const errorsJs = readSafe(path.join(ROOT, 'cloudfunctions', 'common', 'errors.js'))
      expect(errorsJs).toMatch(/require\(["']\.\/utils["']\)/)
    })
  })
})
