/**
 * Sprint 23：客户端 i18n-hot-update 工具单元测试
 *
 * 覆盖：
 *   - 无 wx.cloud 环境时降级返回 { applied: false, error: 'no_wx_cloud' }
 *   - 成功拉取后调用 i18n.applyCustomOverrides
 *   - 拉取失败时静默返回 error 字段
 *   - refreshIfStale 节流
 *   - 并发 refresh 去重
 */

jest.mock('../utils/i18n', () => {
  const real = jest.requireActual('../utils/i18n')
  return {
    ...real,
    applyCustomOverrides: jest.fn(),
    getLocale: jest.fn(() => 'zh-CN'),
    setLocale: real.setLocale,
  }
})

// 注意：不要在文件顶部 require ../utils/i18n；否则 jest.resetModules
// 后 i18n-hot-update 拿到的是新 mock 实例，而这里的 i18n 仍是旧实例。
// 改在每个 test 里通过 reloadHot() 同步刷新。
let i18n

function reloadHot() {
  jest.resetModules()
  jest.doMock('../utils/i18n', () => ({
    ...jest.requireActual('../utils/i18n'),
    applyCustomOverrides: jest.fn(),
    getLocale: jest.fn(() => 'zh-CN'),
  }))
  i18n = require('../utils/i18n')
  return require('../utils/i18n-hot-update')
}

describe('i18n-hot-update', () => {
  let i18nHot
  beforeEach(() => {
    if (global.wx) {
      delete global.wx.cloud
    }
    i18nHot = reloadHot()
    i18nHot._reset()
  })

  it('无 wx.cloud 环境时降级', async () => {
    const res = await i18nHot.refresh()
    expect(res.applied).toBe(false)
    expect(res.error).toBe('no_wx_cloud')
    expect(i18n.applyCustomOverrides).not.toHaveBeenCalled()
  })

  it('成功拉取后调用 applyCustomOverrides', async () => {
    global.wx.cloud = {
      callFunction: jest.fn(() => Promise.resolve({
        result: {
          code: 0,
          message: 'success',
          data: {
            overrides: { HOME_TITLE: { 'en-US': 'New Home' } },
            count: 1,
            locale: 'en-US',
          },
        },
      })),
    }
    const hot = reloadHot()
    const res = await hot.refresh()
    expect(res.applied).toBe(true)
    expect(res.count).toBe(1)
    expect(i18n.applyCustomOverrides).toHaveBeenCalledWith({ HOME_TITLE: { 'en-US': 'New Home' } })
  })

  it('payload code !== 0 不调用 applyCustomOverrides', async () => {
    global.wx.cloud = {
      callFunction: jest.fn(() => Promise.resolve({
        result: { code: 500, message: 'server error' },
      })),
    }
    const hot = reloadHot()
    const res = await hot.refresh()
    expect(res.applied).toBe(false)
    expect(res.error).toBe('server error')
    expect(i18n.applyCustomOverrides).not.toHaveBeenCalled()
  })

  it('wx.cloud.callFunction 抛错时静默返回', async () => {
    global.wx.cloud = {
      callFunction: jest.fn(() => Promise.reject(new Error('network fail'))),
    }
    const hot = reloadHot()
    const res = await hot.refresh()
    expect(res.applied).toBe(false)
    expect(res.error).toBe('network fail')
  })

  it('refreshIfStale 节流', async () => {
    global.wx.cloud = {
      callFunction: jest.fn(() => Promise.resolve({
        result: { code: 0, data: { overrides: {}, count: 0 } },
      })),
    }
    const hot = reloadHot()

    // 第一次会真正拉取
    const r1 = await hot.refreshIfStale(60_000)
    expect(r1.applied).toBe(true)

    // 第二次应该被节流
    const r2 = await hot.refreshIfStale(60_000)
    expect(r2.applied).toBe(false)
    expect(r2.reason).toBe('fresh')

    // 只调用了一次 callFunction
    expect(global.wx.cloud.callFunction).toHaveBeenCalledTimes(1)
  })

  it('并发 refresh 只发起一次请求', async () => {
    let callCount = 0
    global.wx.cloud = {
      callFunction: jest.fn(() => {
        callCount++
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({ result: { code: 0, data: { overrides: { A: { 'zh-CN': 'A' } }, count: 1 } } })
          }, 10)
        })
      }),
    }
    const hot = reloadHot()
    const [r1, r2, r3] = await Promise.all([hot.refresh(), hot.refresh(), hot.refresh()])
    expect(callCount).toBe(1)
    expect(r1.applied).toBe(true)
    expect(r2.applied).toBe(true)
    expect(r3.applied).toBe(true)
  })
})
