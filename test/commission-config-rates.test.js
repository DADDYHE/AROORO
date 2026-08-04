/**
 * adminService/commissionConfig 费率读写测试
 *
 * 覆盖两个 2026-08-02 修复：
 *   A. getCommissionConfig 用 pickRate 兼容费率键别名
 *      线上 system_config.commission_rates 用 hosting 键，而 ORDER_TYPES 用
 *      boarding，旧实现 config['boarding'] 取不到 → 配置页寄养费率恒显示「假 0」。
 *   B. updateCommissionConfig 由 .set() 整覆盖改为增量合并（P0 数据丢失）
 *      旧实现只把本次提交的键写进 data 后整文档 set，前端仅提交部分字段时
 *      其余类型的费率会被整体清空。附带键漂移防护（hosting/boarding 值分裂）。
 */

const mockDb = {
  _collections: {},
  collection(name) {
    if (!this._collections[name]) { this._collections[name] = { docs: [] } }
    const self = this
    return {
      doc: id => ({
        get: async () => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          if (!doc) {
            // 对齐 CloudBase：文档不存在时 get 抛错
            const e = new Error('document does not exist')
            e.errCode = -502004
            throw e
          }
          return { data: doc }
        },
        set: async ({ data }) => {
          const idx = self._collections[name].docs.findIndex(d => d._id === id)
          const next = { _id: id, ...data }
          if (idx >= 0) { self._collections[name].docs[idx] = next } else { self._collections[name].docs.push(next) }
          return { updated: 1 }
        },
        update: async ({ data }) => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          if (doc) { Object.assign(doc, data) }
          return { updated: doc ? 1 : 0 }
        },
      }),
    }
  },
  command: { in: arr => ({ _op: 'in', v: arr }) },
  serverDate: () => new Date(),
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oSuperAdmin' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

const { getCommissionConfig, updateCommissionConfig } = require('../cloudfunctions/adminService/services/commissionConfig')

const AUTH = { openid: 'oSuperAdmin', roles: ['super_admin'] }
const seed = doc => { mockDb._collections.system_config = { docs: doc ? [doc] : [] } }
const readDoc = () => mockDb._collections.system_config.docs.find(d => d._id === 'commission_rates')

beforeEach(() => { mockDb._collections = {} })

describe('A. getCommissionConfig — 费率键别名兼容（消除假 0）', () => {
  test('线上仅有 hosting 键时，boarding 能读到真实值（旧实现恒为 0）', async () => {
    seed({ _id: 'commission_rates', hosting: 12, mall: 5, tuan: 5, feeding: 0, activity: 0 })
    const res = await getCommissionConfig({}, {}, AUTH)
    expect(res.code).toBe(0)
    expect(res.data.rates.boarding).toBe(12)
    expect(res.data.rates.mall).toBe(5)
  })

  test('boarding 与 hosting 并存时，优先取到非零值', async () => {
    seed({ _id: 'commission_rates', boarding: 8, hosting: 3 })
    const res = await getCommissionConfig({}, {}, AUTH)
    expect(res.data.rates.boarding).toBe(8)
  })

  test('全部缺失 / 文档不存在时兜底为 0，不抛错', async () => {
    seed(null)
    const res = await getCommissionConfig({}, {}, AUTH)
    expect(res.code).toBe(0)
    expect(res.data.rates.boarding).toBe(0)
    expect(res.data.rates.mall).toBe(0)
  })

  test('残留修复：寄养同时返回 boarding 与 hosting 双键（兼容读 hosting 的调用方）', async () => {
    seed({ _id: 'commission_rates', hosting: 12, mall: 5, tuan: 5, feeding: 0, activity: 0 })
    const res = await getCommissionConfig({}, {}, AUTH)
    expect(res.code).toBe(0)
    expect(res.data.rates.boarding).toBe(12)
    expect(res.data.rates.hosting).toBe(12) // 双键一致，读 hosting 的页面不再显示 0
  })

  test('boarding 与 hosting 并存时，两者均返回 pickRate 取到的值', async () => {
    seed({ _id: 'commission_rates', boarding: 8, hosting: 3 })
    const res = await getCommissionConfig({}, {}, AUTH)
    expect(res.data.rates.boarding).toBe(8)
    expect(res.data.rates.hosting).toBe(8) // pickRate 取 boarding=8，双键同步为 8
  })
})

describe('B. updateCommissionConfig — 增量合并（P0：防止清空其余费率）', () => {
  test('仅提交 mall 时，其余类型费率必须保留（旧实现会被整体清空）', async () => {
    seed({ _id: 'commission_rates', hosting: 10, mall: 5, tuan: 6, feeding: 7, activity: 8 })
    const res = await updateCommissionConfig({ rates: { mall: 9 } }, {}, AUTH)
    expect(res.code).toBe(0)

    const doc = readDoc()
    expect(doc.mall).toBe(9)      // 已更新
    expect(doc.hosting).toBe(10)  // ← 旧实现这些会全部丢失
    expect(doc.tuan).toBe(6)
    expect(doc.feeding).toBe(7)
    expect(doc.activity).toBe(8)
  })

  test('键漂移防护：文档已有 hosting 时，提交 boarding 会同步 hosting，避免值分裂', async () => {
    seed({ _id: 'commission_rates', hosting: 10, mall: 5 })
    await updateCommissionConfig({ rates: { boarding: 15 } }, {}, AUTH)

    const doc = readDoc()
    expect(doc.boarding).toBe(15)
    expect(doc.hosting).toBe(15) // 同步，否则 pickRate 可能取到过期的 hosting=10
    expect(doc.mall).toBe(5)
  })

  test('不新增冗余别名键：文档无 hosting 时只写 boarding', async () => {
    seed({ _id: 'commission_rates', mall: 5 })
    await updateCommissionConfig({ rates: { boarding: 15 } }, {}, AUTH)

    const doc = readDoc()
    expect(doc.boarding).toBe(15)
    expect(Object.prototype.hasOwnProperty.call(doc, 'hosting')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(doc, 'order')).toBe(false)
  })

  test('文档不存在（首次配置）时能正常创建', async () => {
    seed(null)
    const res = await updateCommissionConfig({ rates: { mall: 5, boarding: 10 } }, {}, AUTH)
    expect(res.code).toBe(0)

    const doc = readDoc()
    expect(doc.mall).toBe(5)
    expect(doc.boarding).toBe(10)
  })

  test('写入元信息 updatedBy / updatedAt', async () => {
    seed({ _id: 'commission_rates', mall: 5 })
    await updateCommissionConfig({ rates: { mall: 6 } }, {}, AUTH)

    const doc = readDoc()
    expect(doc.updatedBy).toBe('oSuperAdmin')
    expect(doc.updatedAt).toBeInstanceOf(Date)
  })

  test('非法费率（超出 0-100 / 非数字）被拒绝，且不落库', async () => {
    seed({ _id: 'commission_rates', mall: 5 })
    const res = await updateCommissionConfig({ rates: { mall: 150 } }, {}, AUTH)
    expect(res.code).not.toBe(0)
    expect(readDoc().mall).toBe(5) // 原值未被破坏
  })

  test('无任何命中 ORDER_TYPES 的字段时报错', async () => {
    seed({ _id: 'commission_rates', mall: 5 })
    const res = await updateCommissionConfig({ rates: { unknown_type: 5 } }, {}, AUTH)
    expect(res.code).not.toBe(0)
  })

  test('rates 缺失或非对象时报错', async () => {
    seed({ _id: 'commission_rates', mall: 5 })
    expect((await updateCommissionConfig({}, {}, AUTH)).code).not.toBe(0)
    expect((await updateCommissionConfig({ rates: 'x' }, {}, AUTH)).code).not.toBe(0)
  })
})

describe('A×B 闭环：改完立即读回一致', () => {
  test('hosting 存量文档 → 更新 boarding → getCommissionConfig 读到新值', async () => {
    seed({ _id: 'commission_rates', hosting: 10, mall: 5 })
    await updateCommissionConfig({ rates: { boarding: 20 } }, {}, AUTH)

    const res = await getCommissionConfig({}, {}, AUTH)
    expect(res.data.rates.boarding).toBe(20)
    expect(res.data.rates.mall).toBe(5)
  })
})
