// wx-server-sdk stub for tests
// 由于 wx-server-sdk 需要在云函数环境中运行，本地测试使用最小 mock
const collection = {
  where: jest.fn(() => collection),
  field: jest.fn(() => collection),
  orderBy: jest.fn(() => collection),
  skip: jest.fn(() => collection),
  limit: jest.fn(() => collection),
  get: jest.fn(() => Promise.resolve({ data: [] })),
  count: jest.fn(() => Promise.resolve({ total: 0 })),
  doc: jest.fn(() => ({
    get: jest.fn(() => Promise.resolve({ data: null })),
    update: jest.fn(() => Promise.resolve({ updated: 0 })),
    set: jest.fn(() => Promise.resolve({ _id: 'mock-id' })),
    remove: jest.fn(() => Promise.resolve({ deleted: 0 })),
  })),
}

const db = {
  collection: jest.fn(() => collection),
  command: {
    gte: jest.fn(v => ({ _op: 'gte', v })),
    lte: jest.fn(v => ({ _op: 'lte', v })),
    in: jest.fn(v => ({ _op: 'in', v })),
    eq: jest.fn(v => ({ _op: 'eq', v })),
    and: jest.fn((...args) => ({ _op: 'and', args })),
    or: jest.fn((...args) => ({ _op: 'or', args })),
    neq: jest.fn(v => ({ _op: 'neq', v })),
    exists: jest.fn(v => ({ _op: 'exists', v })),
  },
}

module.exports = {
  init: jest.fn(),
  database: jest.fn(() => db),
  DYNAMIC_CURRENT_ENV: 'mock-env',
}
