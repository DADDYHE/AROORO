/**
 * Sprint 17: TypeScript 迁移测试 - query-builders.js → .ts
 */

const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const TS = path.join(ROOT, 'cloudfunctions', 'common', 'query-builders.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'query-builders.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'query-builders.d.ts')
const TSCONFIG = path.join(ROOT, 'tsconfig.common.json')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

describe('Sprint 17: query-builders TypeScript 迁移', () => {
  describe('文件存在性', () => {
    test('.ts 源文件存在', () => expect(fs.existsSync(TS)).toBe(true))
    test('.js 编译产物存在', () => expect(fs.existsSync(JS)).toBe(true))
    test('.d.ts 声明文件存在', () => expect(fs.existsSync(DTS)).toBe(true))
  })

  describe('.ts 源码契约', () => {
    let ts
    beforeAll(() => { ts = readSafe(TS) })

    test('导出 COLLECTION 常量', () => {
      expect(ts).toMatch(/export\s+const\s+COLLECTION/)
    })

    test('导出 HostProfileFilters / OrderFilters 接口', () => {
      expect(ts).toMatch(/export\s+interface\s+HostProfileFilters/)
      expect(ts).toMatch(/export\s+interface\s+OrderFilters/)
      expect(ts).toMatch(/export\s+interface\s+ProductFilters/)
    })

    test('从 types 导入 CloudBaseDB / CloudBaseQuery', () => {
      expect(ts).toMatch(/import\s+type.*CloudBaseDB/)
      expect(ts).toMatch(/import\s+type.*CloudBaseQuery/)
    })

    test('从 date-range 导入 RangeQueryDescriptor', () => {
      expect(ts).toMatch(/import\s+type.*RangeQueryDescriptor/)
    })
  })

  describe('模块 API 完整性', () => {
    let qb
    beforeAll(() => {
      delete require.cache[JS]
      qb = require(JS)
    })

    test('导出所有公共函数', () => {
      expect(typeof qb.builder).toBe('function')
      expect(typeof qb.userByOpenId).toBe('function')
      expect(typeof qb.userById).toBe('function')
      expect(typeof qb.hostProfile).toBe('function')
      expect(typeof qb.ordersByStatus).toBe('function')
      expect(typeof qb.activeProducts).toBe('function')
      expect(typeof qb.userCouponsAvailable).toBe('function')
      expect(typeof qb.activityRegistration).toBe('function')
      expect(typeof qb.tuanParticipants).toBe('function')
      expect(typeof qb.favorite).toBe('function')
      expect(typeof qb.inDateRange).toBe('function')
    })

    test('COLLECTION 是 frozen 对象', () => {
      expect(Object.isFrozen(qb.COLLECTION)).toBe(true)
    })
  })

  describe('builder 核心', () => {
    let qb
    beforeAll(() => {
      delete require.cache[JS]
      qb = require(JS)
    })

    test('缺 db → 抛错', () => {
      expect(() => qb.builder(null, 'orders')).toThrow(/db 必填/)
    })

    test('缺 collection → 抛错', () => {
      expect(() => qb.builder({}, null)).toThrow(/collection 必填/)
    })

    test('preset where 自动注入', () => {
      const db = makeFakeDb()
      const chain = qb.builder(db, 'orders', { status: 'paid' })
      expect(db.collection).toHaveBeenCalledWith('orders')
      expect(chain.where).toHaveBeenCalledWith({ status: 'paid' })
    })

    test('无 preset where', () => {
      const db = makeFakeDb()
      const chain = qb.builder(db, 'orders')
      expect(chain.where).not.toHaveBeenCalled()
    })
  })

  describe('userByOpenId / userById', () => {
    let qb
    beforeAll(() => {
      delete require.cache[JS]
      qb = require(JS)
    })

    test('userByOpenId', () => {
      const db = makeFakeDb()
      qb.userByOpenId(db, 'openid-1')
      expect(db.collection).toHaveBeenCalledWith('users')
    })

    test('userById', () => {
      const db = makeFakeDb()
      qb.userById(db, 'u-1')
      expect(db.collection).toHaveBeenCalledWith('users')
    })
  })

  describe('hostProfile filters', () => {
    let qb
    beforeAll(() => {
      delete require.cache[JS]
      qb = require(JS)
    })

    test('status 过滤', () => {
      const db = makeFakeDb()
      const chain = qb.hostProfile(db, { status: 'active' })
      expect(chain.where).toHaveBeenCalledWith({ status: 'active' })
    })

    test('city 过滤', () => {
      const db = makeFakeDb()
      const chain = qb.hostProfile(db, { city: '上海' })
      expect(chain.where).toHaveBeenCalledWith({ city: '上海' })
    })

    test('hostId 过滤', () => {
      const db = makeFakeDb()
      const chain = qb.hostProfile(db, { hostId: 'h1' })
      expect(chain.where).toHaveBeenCalledWith({ hostId: 'h1' })
    })

    test('userId 过滤', () => {
      const db = makeFakeDb()
      const chain = qb.hostProfile(db, { userId: 'u1' })
      expect(chain.where).toHaveBeenCalledWith({ userId: 'u1' })
    })

    test('无过滤', () => {
      const db = makeFakeDb()
      const chain = qb.hostProfile(db)
      expect(chain.where).not.toHaveBeenCalled()
    })
  })

  describe('ordersByStatus filters', () => {
    let qb
    beforeAll(() => {
      delete require.cache[JS]
      qb = require(JS)
    })

    test('userId + status + payStatus', () => {
      const db = makeFakeDb()
      const chain = qb.ordersByStatus(db, {
        userId: 'u1',
        status: 'paid',
        payStatus: 'paid',
      })
      expect(chain.where).toHaveBeenCalledWith({
        userId: 'u1',
        status: 'paid',
        payStatus: 'paid',
      })
    })

    test('hostId 过滤', () => {
      const db = makeFakeDb()
      const chain = qb.ordersByStatus(db, { hostId: 'h1' })
      expect(chain.where).toHaveBeenCalledWith({ hostId: 'h1' })
    })
  })

  describe('activeProducts', () => {
    let qb
    beforeAll(() => {
      delete require.cache[JS]
      qb = require(JS)
    })

    test('默认 status=active', () => {
      const db = makeFakeDb()
      const chain = qb.activeProducts(db)
      expect(chain.where).toHaveBeenCalledWith({ status: 'active' })
    })

    test('category 过滤', () => {
      const db = makeFakeDb()
      const chain = qb.activeProducts(db, { category: 'food' })
      expect(chain.where).toHaveBeenCalledWith({ status: 'active', category: 'food' })
    })

    test('keyword → RegExp', () => {
      const db = makeFakeDb()
      const chain = qb.activeProducts(db, { keyword: 'cat' })
      const arg = chain.where.mock.calls[0][0]
      expect(arg.status).toBe('active')
      expect(arg.name).toBeInstanceOf(RegExp)
      expect(arg.name.test('cattery')).toBe(true)
    })
  })

  describe('userCouponsAvailable / activityRegistration / tuanParticipants / favorite', () => {
    let qb
    beforeAll(() => {
      delete require.cache[JS]
      qb = require(JS)
    })

    test('userCouponsAvailable', () => {
      const db = makeFakeDb()
      const now = new Date('2026-06-05')
      qb.userCouponsAvailable(db, 'u1', now)
      expect(db.collection).toHaveBeenCalledWith('userCoupons')
    })

    test('activityRegistration', () => {
      const db = makeFakeDb()
      const chain = qb.activityRegistration(db, 'a1', 'u1')
      expect(chain.where).toHaveBeenCalledWith({ activityId: 'a1', userId: 'u1' })
    })

    test('tuanParticipants', () => {
      const db = makeFakeDb()
      const chain = qb.tuanParticipants(db, 't1')
      expect(chain.where).toHaveBeenCalledWith({ tuanId: 't1' })
    })

    test('favorite', () => {
      const db = makeFakeDb()
      const chain = qb.favorite(db, 'u1', 'target1')
      expect(chain.where).toHaveBeenCalledWith({ userId: 'u1', targetId: 'target1' })
    })
  })

  describe('inDateRange', () => {
    let qb
    beforeAll(() => {
      delete require.cache[JS]
      qb = require(JS)
    })

    test('rangeQuery 为 null + extraWhere', () => {
      const db = makeFakeDb()
      const chain = qb.inDateRange(db, 'orders', 'createdAt', null, { status: 'paid' })
      expect(chain.where).toHaveBeenCalledWith({ status: 'paid' })
    })

    test('rangeQuery 为 null + 无 extraWhere', () => {
      const db = makeFakeDb()
      qb.inDateRange(db, 'orders', 'createdAt', null)
      expect(db.collection).toHaveBeenCalledWith('orders')
    })

    test('rangeQuery 完整 + extraWhere 合并', () => {
      const db = makeFakeDb()
      const range = {
        _field: 'createdAt',
        _gte: new Date('2026-06-01'),
        _lt: new Date('2026-06-08'),
        range: 'week',
      }
      const chain = qb.inDateRange(db, 'orders', 'createdAt', range, { status: 'paid' })
      const arg = chain.where.mock.calls[0][0]
      expect(arg.status).toBe('paid')
      expect(arg.createdAt).toBeDefined()  // db.command.and(...) 返回值
    })
  })

  describe('tsconfig / build 工具链', () => {
    test('tsconfig.common.json include query-builders.ts', () => {
      const cfg = JSON.parse(readSafe(TSCONFIG))
      expect(cfg.include).toContain('cloudfunctions/common/query-builders.ts')
    })

    test('build-common.js TARGETS 含 query-builders.js', () => {
      const buildJs = readSafe(path.join(ROOT, 'scripts', 'build-common.js'))
      expect(buildJs).toMatch(/query-builders\.js/)
    })
  })
})

// =================== Helpers ===================

function makeFakeDb() {
  const chain = {
    where: jest.fn(function (q) { return chain }),
    field: jest.fn(function () { return chain }),
    orderBy: jest.fn(function () { return chain }),
    skip: jest.fn(function () { return chain }),
    limit: jest.fn(function () { return chain }),
    get: jest.fn(),
    count: jest.fn(),
  }
  return {
    collection: jest.fn(() => chain),
    command: {
      eq: jest.fn(v => ({ _op: 'eq', v })),
      neq: jest.fn(v => ({ _op: 'neq', v })),
      gt: jest.fn(v => ({ _op: 'gt', v })),
      gte: jest.fn(v => ({ _op: 'gte', v })),
      lt: jest.fn(v => ({ _op: 'lt', v })),
      lte: jest.fn(v => ({ _op: 'lte', v })),
      in: jest.fn(v => ({ _op: 'in', v })),
      nin: jest.fn(v => ({ _op: 'nin', v })),
      and: jest.fn((...args) => ({ _op: 'and', args })),
      or: jest.fn((...args) => ({ _op: 'or', args })),
      exists: jest.fn(v => ({ _op: 'exists', v })),
      inc: jest.fn(v => ({ _op: 'inc', v })),
      push: jest.fn(v => ({ _op: 'push', v })),
    },
    serverDate: jest.fn(),
    __chain: chain,
  }
}
