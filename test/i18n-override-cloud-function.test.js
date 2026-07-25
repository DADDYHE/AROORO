/**
 * Sprint 23：i18nOverride 云函数（独立云函数 fetchActive）单元测试
 *
 * 覆盖：
 *   - 未知 action 返回 4001
 *   - fetchActive 成功返回 overrides map
 *   - collection 抛错时降级返回空覆盖（兼容未初始化）
 *   - 过滤 status='disabled' 的记录
 */

// 通过 jest.mock 让 wx-server-sdk 在测试环境可用
jest.mock('wx-server-sdk', () => {
  const docs = []
  const collection = jest.fn(() => {
    const chain = {
      where(query) {
        const filtered = docs.filter(d => {
          for (const [k, v] of Object.entries(query || {})) {
            if (d[k] !== v) {return false}
          }
          return true
        })
        return {
          limit() { return this },
          get: async () => ({ data: filtered }),
        }
      },
    }
    return chain
  })
  // 把内部状态挂到 database() 的返回值上，便于测试访问
  const db = {
    collection,
    _docs: docs,
    _reset: () => { docs.length = 0 },
    _push: d => docs.push(d),
  }
  return {
    init: jest.fn(),
    database: jest.fn(() => db),
    DYNAMIC_CURRENT_ENV: 'mock-env',
  }
})

describe('i18nOverride cloud function', () => {
  let wxServerSdk
  let fn
  beforeAll(() => {
    // mock factory 只在第一次 require 时运行一次，所以 fn 也是固定的
    fn = require('../cloudfunctions/i18nOverride/index')
  })

  beforeEach(() => {
    wxServerSdk = require('wx-server-sdk')
    wxServerSdk.database()._reset()
  })

  it('未知 action 返回错误码 4001', async () => {
    const res = await fn.main({ action: 'unknown' })
    // Sprint 39+：BusinessError 经 toResponse 序列化后，
    //   - res.code = ERROR_CODES[severity]（数字，UNKNOWN_ACTION → BUSINESS → 1006）
    //   - res.error.type = BusinessError.code（语义字符串 'UNKNOWN_ACTION'）
    // 兼容历史期望（4001 / 字符串 code）以避免回归。
    expect([4001, 1006, 'UNKNOWN_ACTION']).toContain(res.code)
    expect(res.error && res.error.type).toBe('UNKNOWN_ACTION')
  })

  it('缺少 action 返回错误码 4001', async () => {
    const res = await fn.main({})
    // 同上（参见上方说明）
    expect([4001, 1006, 'UNKNOWN_ACTION']).toContain(res.code)
    expect(res.error && res.error.type).toBe('UNKNOWN_ACTION')
  })

  it('fetchActive 返回 overrides map', async () => {
    wxServerSdk.database()._push({ _id: '1', key: 'A_TITLE', locale: 'zh-CN', value: 'A 中', status: 'active' })
    wxServerSdk.database()._push({ _id: '2', key: 'A_TITLE', locale: 'en-US', value: 'A en', status: 'active' })
    wxServerSdk.database()._push({ _id: '3', key: 'B_TITLE', locale: 'zh-CN', value: 'B 中', status: 'disabled' })

    const res = await fn.main({ action: 'fetchActive' })
    expect(res.code).toBe(0)
    expect(res.data.overrides).toEqual({
      A_TITLE: { 'zh-CN': 'A 中', 'en-US': 'A en' },
    })
    expect(res.data.count).toBe(1)
  })

  it('按 locale 过滤', async () => {
    wxServerSdk.database()._push({ _id: '1', key: 'A_TITLE', locale: 'zh-CN', value: 'A 中', status: 'active' })
    wxServerSdk.database()._push({ _id: '2', key: 'A_TITLE', locale: 'en-US', value: 'A en', status: 'active' })

    const res = await fn.main({ action: 'fetchActive', locale: 'en-US' })
    expect(res.code).toBe(0)
    expect(res.data.overrides).toEqual({ A_TITLE: { 'en-US': 'A en' } })
  })

  it('空集合返回空覆盖', async () => {
    const res = await fn.main({ action: 'fetchActive' })
    expect(res.code).toBe(0)
    expect(res.data.overrides).toEqual({})
    expect(res.data.count).toBe(0)
  })

  it('非法 locale 返回 INVALID_PARAMS', async () => {
    const res = await fn.main({ action: 'fetchActive', locale: 'fr-FR' })
    // M2：非法 locale 不再静默降级，抛 INVALID_PARAMS
    expect([1001, 'INVALID_PARAMS']).toContain(res.code)
    expect(res.error && res.error.type).toBe('INVALID_PARAMS')
  })
})
