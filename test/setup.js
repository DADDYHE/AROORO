/**
 * Jest 全局设置：提供 wx-server-sdk、wx 等小程序 / 云函数环境的最小 stub
 */

// 避免 wx-server-sdk 真实初始化失败
jest.mock('wx-server-sdk', () => {
  const collection = jest.fn()
  collection.where = jest.fn(() => collection)
  collection.field = jest.fn(() => collection)
  collection.orderBy = jest.fn(() => collection)
  collection.skip = jest.fn(() => collection)
  collection.limit = jest.fn(() => collection)
  collection.get = jest.fn(() => Promise.resolve({ data: [], total: 0 }))
  collection.count = jest.fn(() => Promise.resolve({ total: 0 }))
  collection.doc = jest.fn(() => ({
    get: jest.fn(() => Promise.resolve({ data: null })),
    update: jest.fn(() => Promise.resolve({ updated: 0 })),
    set: jest.fn(() => Promise.resolve({ _id: 'mock-id' })),
    remove: jest.fn(() => Promise.resolve({ deleted: 0 })),
  }))

  return {
    init: jest.fn(),
    database: jest.fn(() => ({
      collection,
      command: {
        gte: jest.fn(v => ({ _op: 'gte', v })),
        lte: jest.fn(v => ({ _op: 'lte', v })),
        in: jest.fn(v => ({ _op: 'in', v })),
        eq: jest.fn(v => ({ _op: 'eq', v })),
        and: jest.fn((...args) => ({ _op: 'and', args })),
        or: jest.fn((...args) => ({ _op: 'or', args })),
      },
    })),
    DYNAMIC_CURRENT_ENV: 'mock-env',
  }
})

// 全局 wx 桩
global.wx = {
  getStorageSync: jest.fn(() => null),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  cloud: {
    callFunction: jest.fn(() => Promise.resolve({ result: { code: 0, data: null } })),
  },
  showToast: jest.fn(),
  showModal: jest.fn(),
  request: jest.fn(),
}

// 全局 getApp 桩
global.getApp = jest.fn(() => ({
  globalData: {},
}))

global.getCurrentPages = jest.fn(() => [])

// 抑制 wx-server-sdk 真实 require
process.env.WX_SERVER_SDK_MOCK = '1'
