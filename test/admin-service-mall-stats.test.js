/**
 * adminService/services/mall 聚焦单测（F20 提升迁移率信号）
 *
 * adminService 多数模块此前无行为测试。本 P1 聚焦用例直接驱动真实的 mall service 处理函数，
 * 覆盖商城「统计」与「列表/详情」关键分支：
 *   1. getProductStats：按状态聚合商品计数（total / on_sale / off_sale / draft）
 *   2. getCategoryStats：按 category / categoryId 聚合计数（含异常降级兜底）
 *   3. getMallOrderDetail：缺 orderId → INVALID_PARAMS；订单不存在/非 mall → NOT_FOUND
 *
 * Mock 方式：jest.mock('wx-server-sdk') 提供最小内存 db（count / where().count / field().limit().get / doc().get）。
 * 不改动任何业务代码。
 */

const countStore = { total: 100, on_sale: 60, off_sale: 30, draft: 10 }

jest.mock('wx-server-sdk', () => {
  const db = {
    collection: () => ({
      count: async () => ({ total: countStore.total }),
      where: q => ({
        count: async () => ({ total: countStore[q.status] != null ? countStore[q.status] : 0 }),
      }),
      field: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
      limit: () => ({ get: async () => ({ data: [] }) }),
      get: async () => ({ data: [] }),
      doc: () => ({ get: async () => ({ data: null }) }),
    }),
    command: {},
    serverDate: () => 'NOW',
  }
  return {
    init: jest.fn(),
    getWXContext: () => ({ OPENID: 'x' }),
    DYNAMIC_CURRENT_ENV: 'mock-env',
    database: () => db,
  }
})

const mall = require('../cloudfunctions/adminService/services/mall')

// handleSuccess 包裹后的统一取值
function dataOf(r) {
  return r && r.data != null ? r.data : r
}

describe('adminService/services/mall 统计与详情聚焦', () => {
  describe('getProductStats', () => {
    test('按状态聚合商品计数（total/on_sale/off_sale/draft）', async () => {
      const r = await mall.getProductStats({}, {}, {})
      expect(dataOf(r)).toMatchObject({
        total: 100,
        on_sale: 60,
        off_sale: 30,
        draft: 10,
      })
    })
  })

  describe('getCategoryStats', () => {
    test('按 category / categoryId 聚合计数', async () => {
      // 覆盖 db.collection('products').field().limit().get 返回值
      const realDb = require('wx-server-sdk').database()
      realDb.collection = () => ({
        field: () => ({
          limit: () => ({
            get: async () => ({
              data: [
                { category: 'food', categoryId: 'c1' },
                { category: 'food', categoryId: 'c1' },
                { category: 'toy', categoryId: 'c2' },
                { categoryId: 'c3' }, // 无 category，仅按 categoryId 计数
              ],
            }),
          }),
        }),
      })
      const r = await mall.getCategoryStats()
      expect(dataOf(r)).toMatchObject({ food: 2, c1: 2, toy: 1, c2: 1, c3: 1 })
    })

    test('查询异常应降级返回空对象（不抛错）', async () => {
      const realDb = require('wx-server-sdk').database()
      realDb.collection = () => ({
        field: () => ({
          limit: () => ({
            get: async () => { throw new Error('db down') },
          }),
        }),
      })
      const r = await mall.getCategoryStats()
      expect(dataOf(r)).toEqual({})
    })
  })

  describe('getMallOrderDetail', () => {
    test('缺 orderId 应抛 INVALID_PARAMS', async () => {
      await expect(mall.getMallOrderDetail({}, {}, {})).rejects.toThrow(/INVALID_PARAMS|缺少订单ID/)
    })

    test('订单不存在应抛 NOT_FOUND', async () => {
      const realDb = require('wx-server-sdk').database()
      realDb.collection = () => ({
        doc: () => ({ get: async () => ({ data: null }) }),
      })
      await expect(mall.getMallOrderDetail({ orderId: 'missing' }, {}, {})).rejects.toThrow(/NOT_FOUND|订单不存在/)
    })

    test('非 mall 订单应抛 NOT_FOUND', async () => {
      const realDb = require('wx-server-sdk').database()
      realDb.collection = () => ({
        doc: () => ({ get: async () => ({ data: { _id: 'o1', type: 'boarding' } }) }),
      })
      await expect(mall.getMallOrderDetail({ orderId: 'o1' }, {}, {})).rejects.toThrow(/NOT_FOUND|订单不存在/)
    })
  })
})
