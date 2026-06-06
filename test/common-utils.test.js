/**
 * cloudfunctions/common 模块单元测试
 *
 * 目标：覆盖 cloudfunctions/common 下的工具、错误处理、ID 生成等公共模块
 * 取代旧的 `test/post-commit-correctness.test.js`（该文件引用了不存在的 CentralIdentityManager）
 */

const utils = require('../cloudfunctions/common/utils')

describe('utils.js', () => {
  describe('ERROR_CODES', () => {
    test('应导出所有预定义错误码', () => {
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
  })

  describe('ERROR_MESSAGES', () => {
    test('每个错误码应都有对应的中文消息', () => {
      Object.values(utils.ERROR_CODES).forEach(code => {
        expect(utils.ERROR_MESSAGES[code]).toBeDefined()
        expect(typeof utils.ERROR_MESSAGES[code]).toBe('string')
        expect(utils.ERROR_MESSAGES[code].length).toBeGreaterThan(0)
      })
    })
  })

  describe('handleSuccess', () => {
    test('默认值（无参）应返回成功且 data=null', () => {
      const result = utils.handleSuccess()
      expect(result).toEqual({
        code: utils.ERROR_CODES.SUCCESS,
        message: '操作成功',
        data: null,
      })
    })

    test('应正确传入 data', () => {
      const data = { id: 1, name: 'test' }
      const result = utils.handleSuccess(data, '自定义成功')
      expect(result.data).toEqual(data)
      expect(result.message).toBe('自定义成功')
    })
  })

  describe('handleError', () => {
    test('应使用默认 BUSINESS 错误码', () => {
      const result = utils.handleError(new Error('boom'))
      expect(result.code).toBe(utils.ERROR_CODES.BUSINESS)
      expect(result.message).toBe('boom')
    })

    test('应支持自定义错误码', () => {
      const result = utils.handleError(new Error('x'), null, utils.ERROR_CODES.AUTH)
      expect(result.code).toBe(utils.ERROR_CODES.AUTH)
    })

    test('应支持自定义消息覆盖', () => {
      const result = utils.handleError(new Error('orig'), '覆盖消息')
      expect(result.message).toBe('覆盖消息')
    })
  })

  describe('generateId', () => {
    test('不带前缀应生成纯随机 ID', () => {
      const id = utils.generateId()
      expect(id).toMatch(/^[a-z0-9_]+$/i)
      expect(id.length).toBeGreaterThan(0)
    })

    test('带 type 前缀应在 ID 中可见', () => {
      const id = utils.generateId('order')
      // generateId 实现使用 `${shortPrefix}_${timestamp}...`
      expect(id.startsWith('ord_') || id.includes('ord_')).toBe(true)
    })

    test('应保证 ID 长度不超过 32', () => {
      for (let i = 0; i < 50; i++) {
        const id = utils.generateId('commission', 'mock_openid_abcdef')
        expect(id.length).toBeLessThanOrEqual(32)
      }
    })

    test('相同输入应产生不同 ID（random 部分）', () => {
      const ids = new Set()
      for (let i = 0; i < 100; i++) {
        ids.add(utils.generateId('pet', 'same_openid'))
      }
      // 100 次中至少 99 个不同（极小概率碰撞）
      expect(ids.size).toBeGreaterThan(95)
    })

    test('未注册的 type 应回退到原值', () => {
      const id = utils.generateId('custom_type_xyz', 'o123')
      // 应当仍以原 type 字符串作为前缀
      expect(id).toMatch(/custom_type_xyz_/)
    })
  })

  describe('paginate', () => {
    let mockDb
    let mockCollection

    beforeEach(() => {
      mockCollection = {
        _records: [],
        where: jest.fn(function () {
          return this
        }),
        field: jest.fn(function () {
          return this
        }),
        orderBy: jest.fn(function () {
          return this
        }),
        skip: jest.fn(function () {
          return this
        }),
        limit: jest.fn(function () {
          return this
        }),
        get: jest.fn(function () {
          return Promise.resolve({ data: this._records })
        }),
        count: jest.fn(function () {
          return Promise.resolve({ total: this._records.length })
        }),
      }
      mockDb = {
        collection: jest.fn(() => mockCollection),
      }
    })

    test('应返回标准分页结构', async () => {
      const result = await utils.paginate(mockDb, 'orders', {})
      expect(result).toEqual(
        expect.objectContaining({
          list: expect.any(Array),
          total: expect.any(Number),
          page: 1,
          pageSize: 10,
          hasNext: expect.any(Boolean),
          totalPages: expect.any(Number),
        })
      )
    })

    test('应限制 pageSize 上限为 100', async () => {
      await utils.paginate(mockDb, 'orders', { pageSize: 9999 })
      expect(mockCollection.limit).toHaveBeenCalledWith(100)
    })

    test('应确保 pageSize 至少为 1', async () => {
      await utils.paginate(mockDb, 'orders', { pageSize: -5 })
      expect(mockCollection.limit).toHaveBeenCalledWith(1)
    })

    test('应支持自定义 page', async () => {
      await utils.paginate(mockDb, 'orders', { page: 3, pageSize: 20 })
      expect(mockCollection.skip).toHaveBeenCalledWith(40)
    })

    test('应支持自定义排序字段', async () => {
      await utils.paginate(mockDb, 'orders', {
        orderBy: { field: 'price', direction: 'asc' },
      })
      expect(mockCollection.orderBy).toHaveBeenCalledWith('price', 'asc')
    })
  })

  describe('batchProcess', () => {
    test('应串行分批处理数据', async () => {
      const data = [1, 2, 3, 4, 5]
      const handler = jest.fn(async x => x * 2)
      const results = await utils.batchProcess(data, handler, 2)
      expect(results).toEqual([2, 4, 6, 8, 10])
      expect(handler).toHaveBeenCalledTimes(5)
    })

    test('单条失败不应中断整批', async () => {
      const data = [1, 2, 3]
      const handler = async x => {
        if (x === 2) {throw new Error('boom')}
        return x * 10
      }
      const results = await utils.batchProcess(data, handler, 10)
      expect(results).toEqual([10, { success: false, error: 'boom' }, 30])
    })

    test('空数据应返回空数组', async () => {
      const handler = jest.fn()
      const results = await utils.batchProcess([], handler, 5)
      expect(results).toEqual([])
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('convertCloudUrls', () => {
    const cloud = require('wx-server-sdk')

    beforeEach(() => {
      // 重置 initCloud 单例并 mock 临时 URL 接口
      cloud.getTempFileURL = jest.fn()
    })

    test('非对象 / null 应原样返回', async () => {
      expect(await utils.convertCloudUrls(null)).toBeNull()
      expect(await utils.convertCloudUrls(undefined)).toBeUndefined()
      expect(await utils.convertCloudUrls('string')).toBe('string')
      expect(await utils.convertCloudUrls(42)).toBe(42)
    })

    test('对象中无 cloud:// 字段应原样返回', async () => {
      const obj = { a: 1, b: 'plain', c: { d: 2 } }
      const result = await utils.convertCloudUrls(obj)
      expect(result).toBe(obj)
    })

    test('应递归收集 cloud:// URL 并替换为临时 URL', async () => {
      cloud.getTempFileURL = jest.fn(({ fileList }) => {
        const fileList1 = fileList.map(id => ({ fileID: id, status: 0, tempFileURL: `https://tmp/${id}` }))
        return Promise.resolve({ fileList: fileList1 })
      })
      const obj = {
        a: 'cloud://abc',
        b: { c: 'cloud://def' },
        d: [{ e: 'cloud://ghi' }],
        f: 'not-cloud',
      }
      const result = await utils.convertCloudUrls(obj)
      expect(result.a).toBe('https://tmp/cloud://abc')
      expect(result.b.c).toBe('https://tmp/cloud://def')
      expect(result.d[0].e).toBe('https://tmp/cloud://ghi')
      expect(result.f).toBe('not-cloud')
    })

    test('getTempFileURL 抛错时应原样返回结果', async () => {
      cloud.getTempFileURL = jest.fn(() => Promise.reject(new Error('network')))
      const obj = { a: 'cloud://abc' }
      const result = await utils.convertCloudUrls(obj)
      expect(result).toBe(obj)
    })

    test('status !== 0 时不应替换 URL', async () => {
      cloud.getTempFileURL = jest.fn(() => Promise.resolve({
        fileList: [{ fileID: 'cloud://abc', status: 1, tempFileURL: 'https://x' }],
      }))
      const obj = { a: 'cloud://abc' }
      const result = await utils.convertCloudUrls(obj)
      expect(result.a).toBe('cloud://abc')
    })
  })

  describe('revertCloudUrls', () => {
    test('应原样返回 event', () => {
      const event = { a: 1, b: { c: 2 } }
      expect(utils.revertCloudUrls(event)).toBe(event)
    })
  })
})
