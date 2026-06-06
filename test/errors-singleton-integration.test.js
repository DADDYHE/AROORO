/**
 * Sprint 19: 跨 service BusinessError instanceof 一致性测试
 *
 * 验证：
 *   1. cloudfunctions/common/errors.js 与所有 *Service/common/errors.js 引用同一 BusinessError 类
 *   2. 跨 service 抛出的 BusinessError 能被 withErrorHandling 正确识别
 *   3. withRateLimit 抛出的 RATE_LIMITED 能被各 service 的 withErrorHandling 正确透传
 *   4. shim 文件保持单源：所有 *Service/common/errors.js 内容相同
 *
 * 关联：
 *   - scripts/audit-errors-singleton.js (CI 门禁)
 *   - docs/SPRINT_19_DELIVERY.md
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'cloudfunctions')
const SINGLE_SOURCE_PATH = path.join(ROOT, 'common', 'errors.js')
const SINGLE_SOURCE = require(SINGLE_SOURCE_PATH)

describe('Sprint 19: BusinessError 跨模块单源', () => {
  test('单源文件存在且导出 BusinessError', () => {
    expect(SINGLE_SOURCE.BusinessError).toBeDefined()
    expect(typeof SINGLE_SOURCE.BusinessError).toBe('function')
  })

  test('单源文件导出 err 工厂函数', () => {
    expect(typeof SINGLE_SOURCE.err).toBe('function')
    const e = SINGLE_SOURCE.err('INVALID_PARAMS')
    expect(e).toBeInstanceOf(SINGLE_SOURCE.BusinessError)
    expect(e.code).toBe('INVALID_PARAMS')
  })

  test('单源文件导出 withErrorHandling', () => {
    expect(typeof SINGLE_SOURCE.withErrorHandling).toBe('function')
  })
})

describe('Sprint 19: 各 service shim 引用同一 BusinessError', () => {
  const SERVICES = [
    'activityService',
    'adminService',
    'couponService',
    'favoriteService',
    'feedingService',
    'hostService',
    'mallService',
    'orderService',
    'partnerService',
    'paymentService',
    'petService',
    'tuanService',
    'userService',
    'utilityService',
  ]

  test.each(SERVICES)('%s/common/errors.js 指向单源', (service) => {
    const shimPath = path.join(ROOT, service, 'common', 'errors.js')
    expect(fs.existsSync(shimPath)).toBe(true)

    // 加载 shim
    const shim = require(shimPath)

    // BusinessError 类必须 === 单源
    expect(shim.BusinessError).toBe(SINGLE_SOURCE.BusinessError)
    expect(shim.err).toBe(SINGLE_SOURCE.err)
    expect(shim.withErrorHandling).toBe(SINGLE_SOURCE.withErrorHandling)
    expect(shim.isBusinessError).toBe(SINGLE_SOURCE.isBusinessError)
    expect(shim.toResponse).toBe(SINGLE_SOURCE.toResponse)
    expect(shim.wrapUnknown).toBe(SINGLE_SOURCE.wrapUnknown)
    expect(shim.BusinessErrors).toBe(SINGLE_SOURCE.BusinessErrors)
  })

  test.each(SERVICES)('%s 抛出的 BusinessError 能被单源 withErrorHandling 识别', (service) => {
    const shim = require(path.join(ROOT, service, 'common', 'errors.js'))
    const e = shim.err('RATE_LIMITED', '测试限流', { remaining: 0 })
    expect(e).toBeInstanceOf(SINGLE_SOURCE.BusinessError)
    expect(e).toBeInstanceOf(shim.BusinessError)
    expect(e.code).toBe('RATE_LIMITED')
  })
})

describe('Sprint 19: 跨模块 withRateLimit + withErrorHandling 协作', () => {
  // 模拟 Sprint 18 场景：risk-rate-limit 抛 RATE_LIMITED，
  // 各 service 的 withErrorHandling 必须能识别（不再退化为 INTERNAL_ERROR）
  const SERVICES = [
    'paymentService',
    'orderService',
    'adminService',
  ]

  test.each(SERVICES)('%s: RATE_LIMITED 应被 withErrorHandling 正确序列化', (service) => {
    const shim = require(path.join(ROOT, service, 'common', 'errors.js'))
    const { withErrorHandling, err } = shim

    const handler = withErrorHandling(async () => {
      throw err('RATE_LIMITED', 'rate limit reason', { remaining: 0 })
    })

    return handler({}, {}, {}).then(response => {
      expect(response.code).not.toBe(0)
      expect(response.error.type).toBe('RATE_LIMITED')
      // 关键断言：错误类型必须是 RATE_LIMITED，而不是被错误包装为 INTERNAL_ERROR
      expect(response.error.type).not.toBe('INTERNAL_ERROR')
    })
  })

  test('真实场景：risk-rate-limit 抛错 → paymentService withErrorHandling 接收', async () => {
    const real = require(path.join(ROOT, 'common', 'risk-rate-limit'))
    real._resetStore()

    const pay = require(path.join(ROOT, 'paymentService', 'common', 'errors'))
    const { handleSuccess } = require(path.join(ROOT, 'common', 'utils'))

    let attempts = 0
    const handler = pay.withErrorHandling(async (event, context, auth) => {
      attempts++
      // 调用真实 withRateLimit，targetId 固定，超过 5 次触发 RATE_LIMITED
      const data = await real.withRateLimit(
        { userId: 'test-user', type: 'integration-test', targetId: 'tgt-1' },
        async () => ({ ok: true, attempt: attempts })
      )
      return handleSuccess(data, 'ok')
    })

    // 前 5 次应成功
    for (let i = 0; i < 5; i++) {
      const r = await handler({}, {}, { openid: 'test-user' })
      expect(r.code).toBe(0)
      expect(r.data.attempt).toBe(i + 1)
    }

    // 第 6 次应被 RATE_LIMITED 拦截
    const blocked = await handler({}, {}, { openid: 'test-user' })
    expect(blocked.code).not.toBe(0)
    expect(blocked.error.type).toBe('RATE_LIMITED')
    expect(blocked.error.type).not.toBe('INTERNAL_ERROR')

    real._resetStore()
  })

  test('真实场景：risk-rate-limit 抛错 → orderService withErrorHandling 接收', async () => {
    const real = require(path.join(ROOT, 'common', 'risk-rate-limit'))
    real._resetStore()

    const ord = require(path.join(ROOT, 'orderService', 'common', 'errors'))
    const { handleSuccess } = require(path.join(ROOT, 'common', 'utils'))

    const handler = ord.withErrorHandling(async () => {
      const data = await real.withRateLimit(
        { userId: 'o-user', type: 'integration-test', targetId: 'tgt-2' },
        async () => ({ ok: true })
      )
      return handleSuccess(data, 'ok')
    })

    for (let i = 0; i < 5; i++) {
      const r = await handler({}, {}, {})
      expect(r.code).toBe(0)
    }

    const blocked = await handler({}, {}, {})
    expect(blocked.code).not.toBe(0)
    expect(blocked.error.type).toBe('RATE_LIMITED')
    expect(blocked.error.type).not.toBe('INTERNAL_ERROR')

    real._resetStore()
  })

  test('真实场景：risk-rate-limit 抛错 → adminService withErrorHandling 接收', async () => {
    const real = require(path.join(ROOT, 'common', 'risk-rate-limit'))
    real._resetStore()

    const adm = require(path.join(ROOT, 'adminService', 'common', 'errors'))
    const { handleSuccess } = require(path.join(ROOT, 'common', 'utils'))

    const handler = adm.withErrorHandling(async () => {
      const data = await real.withRateLimit(
        { userId: 'a-user', type: 'integration-test', targetId: 'tgt-3' },
        async () => ({ ok: true })
      )
      return handleSuccess(data, 'ok')
    })

    for (let i = 0; i < 5; i++) {
      const r = await handler({}, {}, {})
      expect(r.code).toBe(0)
    }

    const blocked = await handler({}, {}, {})
    expect(blocked.code).not.toBe(0)
    expect(blocked.error.type).toBe('RATE_LIMITED')
    expect(blocked.error.type).not.toBe('INTERNAL_ERROR')

    real._resetStore()
  })
})

describe('Sprint 19: shim 文件内容一致性', () => {
  test('所有 service 的 shim 文件应该内容相同（指向单源）', () => {
    const SERVICES = [
      'activityService', 'adminService', 'couponService', 'favoriteService',
      'feedingService', 'hostService', 'mallService', 'orderService',
      'partnerService', 'paymentService', 'petService', 'tuanService',
      'userService', 'utilityService',
    ]

    const contents = SERVICES.map(s => {
      const p = path.join(ROOT, s, 'common', 'errors.js')
      return { service: s, content: fs.readFileSync(p, 'utf8') }
    })

    const first = contents[0].content
    for (const { service, content } of contents) {
      expect(content).toBe(first)
    }
  })
})
