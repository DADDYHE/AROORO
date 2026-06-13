/**
 * cloudfunctions/common/errors.js 单元测试
 */

const { BusinessError, BusinessErrors, err, isBusinessError, wrapUnknown, toResponse, withErrorHandling } = require('../cloudfunctions/common/errors')
const { ERROR_CODES } = require('../cloudfunctions/common/utils')

describe('errors.js', () => {
  describe('BusinessError', () => {
    test('应正确携带 code / message / details / httpStatus', () => {
      const e = new BusinessError('ORDER_NOT_FOUND', '订单不存在', { orderId: 'ord_1' }, 404)
      expect(e.code).toBe('ORDER_NOT_FOUND')
      expect(e.message).toBe('订单不存在')
      expect(e.details).toEqual({ orderId: 'ord_1' })
      expect(e.httpStatus).toBe(404)
      expect(e.name).toBe('BusinessError')
      expect(e).toBeInstanceOf(Error)
      expect(e).toBeInstanceOf(BusinessError)
    })

    test('httpStatus 默认 200', () => {
      const e = new BusinessError('X', 'y')
      expect(e.httpStatus).toBe(200)
    })

    test('toResponse 应返回标准响应结构', () => {
      const e = new BusinessError('ORDER_NOT_FOUND', '订单不存在', { orderId: 'ord_1' })
      const res = e.toResponse()
      expect(res.code).toBe(ERROR_CODES.NOT_FOUND)
      expect(res.message).toBe('订单不存在')
      expect(res.data).toBeNull()
      expect(res.error).toEqual({ type: 'ORDER_NOT_FOUND', details: { orderId: 'ord_1' } })
    })

    test('severity 应根据 code 前缀推断', () => {
      expect(new BusinessError('VALIDATION_FAILED', 'x').severity).toBe('VALIDATION')
      expect(new BusinessError('AUTH_REQUIRED', 'x').severity).toBe('AUTH')
      expect(new BusinessError('TOKEN_EXPIRED', 'x').severity).toBe('AUTH')
      expect(new BusinessError('PERMISSION_DENIED', 'x').severity).toBe('PERMISSION')
      expect(new BusinessError('ORDER_NOT_FOUND', 'x').severity).toBe('NOT_FOUND')
      expect(new BusinessError('DATA_INVALID', 'x').severity).toBe('DATA')
      expect(new BusinessError('INTERNAL_ERROR', 'x').severity).toBe('SERVER')
      expect(new BusinessError('UNKNOWN', 'x').severity).toBe('BUSINESS')
    })
  })

  describe('BusinessErrors 注册表', () => {
    test('应包含关键错误码', () => {
      const expected = [
        'INVALID_PARAMS', 'AUTH_REQUIRED', 'TOKEN_EXPIRED',
        'PERMISSION_DENIED', 'NOT_FOUND', 'ORDER_NOT_FOUND',
        'PAYMENT_CREATE_FAILED', 'ENCRYPT_FAILED', 'INTERNAL_ERROR',
        'IDEMPOTENT_REPLAY', 'UNKNOWN_ACTION',
      ]
      expected.forEach(code => {
        expect(BusinessErrors[code]).toBeDefined()
        expect(BusinessErrors[code].code).toBe(code)
        expect(typeof BusinessErrors[code].message).toBe('string')
        expect(typeof BusinessErrors[code].httpStatus).toBe('number')
        expect(typeof BusinessErrors[code].severity).toBe('string')
      })
    })

    test('所有 httpStatus 应为合法 HTTP 状态码', () => {
      const validStatus = [200, 201, 204, 400, 401, 403, 404, 409, 410, 429, 500, 502, 503]
      Object.values(BusinessErrors).forEach(spec => {
        expect(validStatus).toContain(spec.httpStatus)
      })
    })
  })

  describe('err() 工厂', () => {
    test('已知错误码应使用注册表元数据', () => {
      const e = err('ORDER_NOT_FOUND')
      expect(e).toBeInstanceOf(BusinessError)
      expect(e.code).toBe('ORDER_NOT_FOUND')
      expect(e.message).toBe('订单不存在')
      expect(e.httpStatus).toBe(404)
    })

    test('应支持自定义 message 覆盖', () => {
      const e = err('ORDER_NOT_FOUND', '找不到这个订单')
      expect(e.message).toBe('找不到这个订单')
      expect(e.httpStatus).toBe(404)
    })

    test('应支持 details 透传', () => {
      const e = err('ORDER_NOT_FOUND', null, { orderId: 'ord_1' })
      expect(e.details).toEqual({ orderId: 'ord_1' })
    })

    test('未知错误码应降级为 INTERNAL_ERROR 但保留原 code', () => {
      const e = err('SOMETHING_NEW')
      expect(e.code).toBe('SOMETHING_NEW')
      expect(e.httpStatus).toBe(500)
    })
  })

  describe('isBusinessError', () => {
    test('应识别 BusinessError', () => {
      expect(isBusinessError(new BusinessError('X', 'y'))).toBe(true)
      expect(isBusinessError(err('ORDER_NOT_FOUND'))).toBe(true)
    })

    test('应拒绝非 BusinessError', () => {
      expect(isBusinessError(new Error('plain'))).toBe(false)
      expect(isBusinessError(null)).toBe(false)
      expect(isBusinessError('string')).toBe(false)
      expect(isBusinessError({ code: 'X' })).toBe(false)
    })
  })

  describe('wrapUnknown', () => {
    test('BusinessError 应原样返回', () => {
      const orig = err('ORDER_NOT_FOUND')
      expect(wrapUnknown(orig)).toBe(orig)
    })

    test('普通 Error 应包装为 INTERNAL_ERROR', () => {
      const orig = new Error('boom')
      orig.name = 'MongoError'
      const wrapped = wrapUnknown(orig)
      expect(wrapped).toBeInstanceOf(BusinessError)
      expect(wrapped.code).toBe('INTERNAL_ERROR')
      expect(wrapped.details).toEqual({
        originalMessage: 'boom',
        originalName: 'MongoError',
      })
    })
  })

  describe('toResponse', () => {
    test('BusinessError 应序列化为带 type/details 的响应', () => {
      const e = err('ORDER_NOT_FOUND', '订单不存在', { orderId: 'ord_1' })
      const res = toResponse(e)
      expect(res.code).toBe(ERROR_CODES.NOT_FOUND)
      expect(res.message).toBe('订单不存在')
      expect(res.data).toBeNull()
      expect(res.error).toEqual({ type: 'ORDER_NOT_FOUND', details: { orderId: 'ord_1' } })
    })

    test('AUTH 类错误应映射到 ERROR_CODES.AUTH', () => {
      const e = err('AUTH_REQUIRED')
      const res = toResponse(e)
      expect(res.code).toBe(ERROR_CODES.AUTH)
      expect(res.error.type).toBe('AUTH_REQUIRED')
    })

    test('VALIDATION 类错误应映射到 ERROR_CODES.VALIDATION', () => {
      const e = err('INVALID_PARAMS')
      const res = toResponse(e)
      expect(res.code).toBe(ERROR_CODES.VALIDATION)
    })

    test('PERMISSION 类错误应映射到 ERROR_CODES.PERMISSION', () => {
      const e = err('PERMISSION_DENIED')
      const res = toResponse(e)
      expect(res.code).toBe(ERROR_CODES.PERMISSION)
    })

    test('SERVER 类错误应映射到 ERROR_CODES.SERVER', () => {
      const e = err('INTERNAL_ERROR')
      const res = toResponse(e)
      expect(res.code).toBe(ERROR_CODES.SERVER)
    })

    test('普通 Error 应降级走 handleError 兼容路径', () => {
      const e = new Error('boom')
      const res = toResponse(e)
      expect(res.message).toBe('boom')
      expect(res.error).toBe('boom')
    })
  })

  describe('withErrorHandling', () => {
    test('正常返回值应原样透传', async () => {
      const handler = withErrorHandling(async () => ({ ok: true, data: 42 }))
      const res = await handler({}, {}, {})
      expect(res).toEqual({ ok: true, data: 42 })
    })

    test('handler 抛 BusinessError 应序列化为标准响应', async () => {
      const handler = withErrorHandling(async () => {
        throw err('ORDER_NOT_FOUND', '订单不存在', { orderId: 'ord_9' })
      })
      const res = await handler({}, {}, {})
      expect(res.code).toBe(ERROR_CODES.NOT_FOUND)
      expect(res.message).toBe('订单不存在')
      expect(res.data).toBeNull()
      expect(res.error).toEqual({ type: 'ORDER_NOT_FOUND', details: { orderId: 'ord_9' } })
    })

    test('handler 抛普通 Error 应被 wrapUnknown 后序列化', async () => {
      const handler = withErrorHandling(async () => {
        const e = new Error('mongo down')
        e.name = 'MongoNetworkError'
        throw e
      })
      const res = await handler({}, {}, {})
      expect(res.code).toBe(ERROR_CODES.SERVER)
      expect(res.error.type).toBe('INTERNAL_ERROR')
      expect(res.error.details).toEqual({
        originalMessage: 'mongo down',
        originalName: 'MongoNetworkError',
      })
    })

    test('handler 抛非 Error 对象也应被兜底', async () => {
      const handler = withErrorHandling(async () => {
        // eslint-disable-next-line no-throw-literal
        throw 'string error'
      })
      const res = await handler({}, {}, {})
      expect(res.code).toBe(ERROR_CODES.SERVER)
    })

    test('event / context / auth 应正确透传给 handler', async () => {
      const seen = {}
      const handler = withErrorHandling(async (event, context, auth) => {
        seen.event = event
        seen.context = context
        seen.auth = auth
        return 'ok'
      })
      await handler({ a: 1 }, { b: 2 }, { openid: 'oX' })
      expect(seen.event).toEqual({ a: 1 })
      expect(seen.context).toEqual({ b: 2 })
      expect(seen.auth).toEqual({ openid: 'oX' })
    })
  })
})
