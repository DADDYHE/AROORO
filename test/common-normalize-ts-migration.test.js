/**
 * Sprint 17: TypeScript 迁移测试 - normalize.js → .ts
 */

const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const TS = path.join(ROOT, 'cloudfunctions', 'common', 'normalize.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'normalize.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'normalize.d.ts')
const TSCONFIG = path.join(ROOT, 'tsconfig.common.json')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

describe('Sprint 17: normalize TypeScript 迁移', () => {
  describe('文件存在性', () => {
    test('.ts 源文件存在', () => expect(fs.existsSync(TS)).toBe(true))
    test('.js 编译产物存在', () => expect(fs.existsSync(JS)).toBe(true))
    test('.d.ts 声明文件存在', () => expect(fs.existsSync(DTS)).toBe(true))
  })

  describe('.ts 源码契约', () => {
    let ts
    beforeAll(() => { ts = readSafe(TS) })

    test('导出 BaseDoc / OrderDoc / UserDoc 等接口', () => {
      expect(ts).toMatch(/export\s+interface\s+BaseDoc/)
      expect(ts).toMatch(/export\s+interface\s+OrderDoc/)
      expect(ts).toMatch(/export\s+interface\s+UserDoc/)
      expect(ts).toMatch(/export\s+interface\s+HostDoc/)
      expect(ts).toMatch(/export\s+interface\s+PetDoc/)
      expect(ts).toMatch(/export\s+interface\s+ProductDoc/)
    })

    test('导出 EntityName 类型', () => {
      expect(ts).toMatch(/export\s+type\s+EntityName/)
    })

    test('导出 COLLECTION_TO_ENTITY 常量', () => {
      expect(ts).toMatch(/export\s+const\s+COLLECTION_TO_ENTITY/)
    })
  })

  describe('模块 API 完整性', () => {
    let n
    beforeAll(() => {
      delete require.cache[JS]
      n = require(JS)
    })

    test('导出所有归一化函数', () => {
      expect(typeof n.normalizeBase).toBe('function')
      expect(typeof n.normalizeOrder).toBe('function')
      expect(typeof n.denormalizeOrder).toBe('function')
      expect(typeof n.normalizeUser).toBe('function')
      expect(typeof n.normalizeHost).toBe('function')
      expect(typeof n.normalizePet).toBe('function')
      expect(typeof n.normalizeProduct).toBe('function')
      expect(typeof n.normalizeList).toBe('function')
      expect(typeof n.normalizeByCollection).toBe('function')
      expect(typeof n.normalizeDbError).toBe('function')
      expect(typeof n.ensurePayload).toBe('function')
    })
  })

  describe('normalizeBase', () => {
    let n
    beforeAll(() => {
      delete require.cache[JS]
      n = require(JS)
    })

    test('_id → id', () => {
      const out = n.normalizeBase({ _id: 'abc', name: 'foo' })
      expect(out.id).toBe('abc')
      expect(out._id).toBe('abc')
    })

    test('createAt → createdAt', () => {
      const out = n.normalizeBase({ _id: '1', createAt: new Date() })
      expect(out.createdAt).toBeDefined()
    })

    test('updateAt → updatedAt', () => {
      const out = n.normalizeBase({ _id: '1', updateAt: new Date() })
      expect(out.updatedAt).toBeDefined()
    })

    test('null / undefined 透传', () => {
      expect(n.normalizeBase(null)).toBeNull()
      expect(n.normalizeBase(undefined)).toBeUndefined()
    })
  })

  describe('normalizeOrder', () => {
    let n
    beforeAll(() => {
      delete require.cache[JS]
      n = require(JS)
    })

    test('days → duration', () => {
      const out = n.normalizeOrder({ _id: '1', days: 3 })
      expect(out.duration).toBe(3)
    })

    test('nights → duration', () => {
      const out = n.normalizeOrder({ _id: '1', nights: 5 })
      expect(out.duration).toBe(5)
    })

    test('petIDs → petIds', () => {
      const out = n.normalizeOrder({ _id: '1', petIDs: ['a', 'b'] })
      expect(out.petIds).toEqual(['a', 'b'])
    })

    test('pets → petInfos', () => {
      const out = n.normalizeOrder({ _id: '1', pets: [{ name: 'foo' }] })
      expect(out.petInfos).toEqual([{ name: 'foo' }])
    })

    test('hostInfo._id → hostId', () => {
      const out = n.normalizeOrder({ _id: '1', hostInfo: { _id: 'h1' } })
      expect(out.hostId).toBe('h1')
    })

    test('totalPrice → amount', () => {
      const out = n.normalizeOrder({ _id: '1', totalPrice: 100 })
      expect(out.amount).toBe(100)
    })
  })

  describe('denormalizeOrder', () => {
    let n
    beforeAll(() => {
      delete require.cache[JS]
      n = require(JS)
    })

    test('移除旧字段', () => {
      const out = n.denormalizeOrder({
        _id: '1',
        petIDs: ['a'],
        pets: [{ name: 'foo' }],
        days: 3,
        totalPrice: 100,
        createAt: 'foo',
      })
      expect(out.petIDs).toBeUndefined()
      expect(out.pets).toBeUndefined()
      expect(out.days).toBeUndefined()
      expect(out.totalPrice).toBeUndefined()
      expect(out.createAt).toBeUndefined()
    })

    test('保留新字段', () => {
      const out = n.denormalizeOrder({
        _id: '1',
        petIds: ['a'],
        petInfos: [{ name: 'foo' }],
        duration: 3,
        amount: 100,
        createdAt: 'foo',
      })
      expect(out.petIds).toEqual(['a'])
      expect(out.petInfos).toEqual([{ name: 'foo' }])
      expect(out.duration).toBe(3)
      expect(out.amount).toBe(100)
      expect(out.createdAt).toBe('foo')
    })
  })

  describe('normalizeUser', () => {
    let n
    beforeAll(() => {
      delete require.cache[JS]
      n = require(JS)
    })

    test('nickname → nickName', () => {
      const out = n.normalizeUser({ _id: '1', nickname: 'foo' })
      expect(out.nickName).toBe('foo')
    })

    test('avatar → avatarUrl', () => {
      const out = n.normalizeUser({ _id: '1', avatar: 'http://x' })
      expect(out.avatarUrl).toBe('http://x')
    })

    test('headImg → avatarUrl', () => {
      const out = n.normalizeUser({ _id: '1', headImg: 'http://y' })
      expect(out.avatarUrl).toBe('http://y')
    })
  })

  describe('normalizeHost / Pet / Product', () => {
    let n
    beforeAll(() => {
      delete require.cache[JS]
      n = require(JS)
    })

    test('Host: price → pricePerDay', () => {
      const out = n.normalizeHost({ _id: '1', price: 100 })
      expect(out.pricePerDay).toBe(100)
    })

    test('Host: dayPrice → pricePerDay', () => {
      const out = n.normalizeHost({ _id: '1', dayPrice: 80 })
      expect(out.pricePerDay).toBe(80)
    })

    test('Pet: sex → gender', () => {
      const out = n.normalizePet({ _id: '1', sex: 'male' })
      expect(out.gender).toBe('male')
    })

    test('Product: coverImage → coverUrl', () => {
      const out = n.normalizeProduct({ _id: '1', coverImage: 'http://x' })
      expect(out.coverUrl).toBe('http://x')
    })

    test('Product: cover → coverUrl', () => {
      const out = n.normalizeProduct({ _id: '1', cover: 'http://y' })
      expect(out.coverUrl).toBe('http://y')
    })
  })

  describe('normalizeList / normalizeByCollection', () => {
    let n
    beforeAll(() => {
      delete require.cache[JS]
      n = require(JS)
    })

    test('normalizeList 数组', () => {
      const out = n.normalizeList([{ _id: '1' }, { _id: '2' }])
      expect(out).toHaveLength(2)
      expect(out[0].id).toBe('1')
    })

    test('normalizeList null → []', () => {
      expect(n.normalizeList(null)).toEqual([])
    })

    test('normalizeByCollection orders', () => {
      const out = n.normalizeByCollection('orders', [{ _id: '1', days: 3 }])
      expect(Array.isArray(out)).toBe(true)
      expect(out[0].duration).toBe(3)
    })

    test('normalizeByCollection users', () => {
      const out = n.normalizeByCollection('users', { _id: '1', nickname: 'foo' })
      expect(out.nickName).toBe('foo')
    })

    test('normalizeByCollection 未知集合走 base', () => {
      const out = n.normalizeByCollection('unknown', { _id: '1' })
      expect(out.id).toBe('1')
    })
  })

  describe('normalizeDbError / ensurePayload', () => {
    let n
    beforeAll(() => {
      delete require.cache[JS]
      n = require(JS)
    })

    test('已注册错误码 → 透传', () => {
      const e = new Error('test')
      e.code = 'ORDER_NOT_FOUND'
      const out = n.normalizeDbError(e)
      expect(out).toBe(e)
    })

    test('duplicate key → DUPLICATE_KEY', () => {
      const out = n.normalizeDbError(new Error('E11000 duplicate key error'))
      expect(out.code).toBe('DUPLICATE_KEY')
    })

    test('普通错误 → DB_ERROR', () => {
      const out = n.normalizeDbError(new Error('connection lost'))
      expect(out.code).toBe('DB_ERROR')
    })

    test('ensurePayload 缺字段抛错', () => {
      expect(() => n.ensurePayload({}, ['orderId'])).toThrow(/缺少字段/)
    })

    test('ensurePayload null 抛错', () => {
      expect(() => n.ensurePayload(null)).toThrow(/请求体/)
    })

    test('ensurePayload 正常通过', () => {
      const out = n.ensurePayload({ orderId: '1' }, ['orderId'])
      expect(out.orderId).toBe('1')
    })
  })

  describe('tsconfig / build 工具链', () => {
    test('tsconfig.common.json include normalize.ts', () => {
      const cfg = JSON.parse(readSafe(TSCONFIG))
      expect(cfg.include).toContain('cloudfunctions/common/normalize.ts')
    })

    test('build-all-services.js TARGETS 含 normalize.js', () => {
      const buildJs = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(buildJs).toMatch(/normalize\.js/)
    })
  })
})
