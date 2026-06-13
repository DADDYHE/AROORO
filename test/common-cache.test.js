/**
 * cloudfunctions/common/cache.js 测试
 * 验证进程内 LRU-TTL 缓存的正确性
 */
const cacheModule = require('../cloudfunctions/common/cache')

const {
  getCache,
  setCache,
  deleteCache,
  clearCache,
  getCacheSize,
  hasCache,
} = cacheModule

describe('common/cache', () => {
  beforeEach(() => {
    clearCache()
  })

  describe('基础读写', () => {
    test('setCache 后 getCache 应能取出', () => {
      setCache('k1', { a: 1 })
      expect(getCache('k1')).toEqual({ a: 1 })
    })

    test('未设置的 key 应返回 null', () => {
      expect(getCache('not-exists')).toBeNull()
    })

    test('setCache 相同 key 应覆盖', () => {
      setCache('k', 'v1')
      setCache('k', 'v2')
      expect(getCache('k')).toBe('v2')
    })

    test('deleteCache 应清除指定 key', () => {
      setCache('k', 'v')
      expect(deleteCache('k')).toBe(true)
      expect(getCache('k')).toBeNull()
    })

    test('删除不存在的 key 应返回 false', () => {
      expect(deleteCache('not-exists')).toBe(false)
    })
  })

  describe('TTL 过期', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    test('超过 TTL 的 key 应返回 null 并被清除', () => {
      setCache('k', 'v', 10) // 10 秒
      expect(getCache('k')).toBe('v')
      jest.advanceTimersByTime(11_000)
      expect(getCache('k')).toBeNull()
    })

    test('未到 TTL 的 key 应仍能取出', () => {
      setCache('k', 'v', 60)
      jest.advanceTimersByTime(30_000)
      expect(getCache('k')).toBe('v')
    })

    test('hasCache 应遵守 TTL', () => {
      setCache('k', 'v', 5)
      expect(hasCache('k')).toBe(true)
      jest.advanceTimersByTime(6_000)
      expect(hasCache('k')).toBe(false)
    })

    test('getCache 默认 TTL 应为 5 分钟', () => {
      setCache('k', 'v')
      jest.advanceTimersByTime(4 * 60 * 1000) // 4 分钟
      expect(getCache('k')).toBe('v')
      jest.advanceTimersByTime(61_000) // 超过 5 分钟
      expect(getCache('k')).toBeNull()
    })
  })

  describe('容量淘汰', () => {
    test('超过 1000 项时应淘汰最旧项', () => {
      // 填满 1000 项
      for (let i = 0; i < 1000; i++) {
        setCache(`k${i}`, i, 60)
      }
      expect(getCacheSize()).toBe(1000)

      // 再写一个，应淘汰最旧的 k0
      setCache('new-key', 'new', 60)
      expect(getCacheSize()).toBe(1000)
      expect(getCache('k0')).toBeNull()
      expect(getCache('new-key')).toBe('new')
    })

    test('覆盖已有 key 不应触发淘汰', () => {
      for (let i = 0; i < 1000; i++) {
        setCache(`k${i}`, i, 60)
      }
      // 覆盖已存在的 key 不应增加 size，也不应触发淘汰
      setCache('k500', 'updated', 60)
      expect(getCacheSize()).toBe(1000)
      expect(getCache('k500')).toBe('updated')
    })
  })

  describe('辅助方法', () => {
    test('hasCache 对存在的 key 返回 true', () => {
      setCache('k', 'v')
      expect(hasCache('k')).toBe(true)
    })

    test('hasCache 对不存在的 key 返回 false', () => {
      expect(hasCache('missing')).toBe(false)
    })

    test('getCacheSize 应反映当前缓存项数', () => {
      expect(getCacheSize()).toBe(0)
      setCache('a', 1)
      setCache('b', 2)
      setCache('c', 3)
      expect(getCacheSize()).toBe(3)
    })

    test('clearCache 应清空所有项', () => {
      setCache('a', 1)
      setCache('b', 2)
      clearCache()
      expect(getCacheSize()).toBe(0)
      expect(getCache('a')).toBeNull()
    })
  })
})
