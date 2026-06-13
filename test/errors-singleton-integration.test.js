/**
 * Sprint 39: 业务异常模块跨服务识别一致性测试
 *
 * 验证：
 *   1. 顶级 cloudfunctions/common/errors.js 仍导出 BusinessError + err + withErrorHandling
 *   2. 所有 service common/errors.js 与顶级源文件内容一致（md5 相同 → 部署完整）
 *   3. 跨 service 抛出的 BusinessError 能被其他 service 的 withErrorHandling 正确识别
 *      （基于鸭子类型 isBusinessError，不再依赖 class identity）
 *   4. withRateLimit 抛出的 RATE_LIMITED 能被各 service 的 withErrorHandling 正确透传
 *
 * Sprint 39 重要变更（相对 Sprint 19）：
 *   - 不再要求所有 service 共用同一个 BusinessError class
 *   - 每个云函数独立部署，副本即为完整文件，无 require('../../common/...') 跨级引用
 *   - 跨服务识别改为鸭子类型：name === 'BusinessError' && typeof code === 'string'
 *
 * 关联：
 *   - scripts/audit-errors-singleton.js (CI 门禁：md5 hash 一致性)
 *   - scripts/sync-cloud-common.js (sync:common 同步完整副本)
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..', 'cloudfunctions')
const SINGLE_SOURCE_PATH = path.join(ROOT, 'common', 'errors.js')
const SINGLE_SOURCE = require(SINGLE_SOURCE_PATH)

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

function md5(content) {
  return crypto.createHash('md5').update(content).digest('hex')
}

describe('Sprint 39: 业务异常模块跨服务部署完整性', () => {
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

  test('单源文件导出 isBusinessError（鸭子类型守卫）', () => {
    expect(typeof SINGLE_SOURCE.isBusinessError).toBe('function')
    const e = SINGLE_SOURCE.err('RATE_LIMITED')
    expect(SINGLE_SOURCE.isBusinessError(e)).toBe(true)
    expect(SINGLE_SOURCE.isBusinessError(new Error('plain'))).toBe(false)
    expect(SINGLE_SOURCE.isBusinessError(null)).toBe(false)
    expect(SINGLE_SOURCE.isBusinessError('string')).toBe(false)
  })

  test('单源文件导出 wrapUnknown / toResponse', () => {
    expect(typeof SINGLE_SOURCE.wrapUnknown).toBe('function')
    expect(typeof SINGLE_SOURCE.toResponse).toBe('function')
  })
})

describe('Sprint 39: 各 service errors.js 副本与单源内容一致', () => {
  const sourceContent = fs.readFileSync(SINGLE_SOURCE_PATH, 'utf8')
  const sourceHash = md5(sourceContent)

  test.each(SERVICES)('%s/common/errors.js 存在且 md5 与单源一致', service => {
    const copyPath = path.join(ROOT, service, 'common', 'errors.js')
    expect(fs.existsSync(copyPath)).toBe(true)

    const copyContent = fs.readFileSync(copyPath, 'utf8')
    const copyHash = md5(copyContent)

    // Sprint 39：副本 = 完整副本，md5 必须等于单源
    // 若 hash 不等：sync:common 未运行，或副本被手动修改
    expect(copyHash).toBe(sourceHash)
  })

  test.each(SERVICES)('%s/common/errors.js 包含 class BusinessError extends Error 定义', service => {
    const copyPath = path.join(ROOT, service, 'common', 'errors.js')
    const content = fs.readFileSync(copyPath, 'utf8')
    expect(/class\s+BusinessError\s+extends\s+Error/.test(content)).toBe(true)
  })

  test.each(SERVICES)('%s/common/errors.js 不含跨级 shim 引用 require(\'../../common/...\')', service => {
    const copyPath = path.join(ROOT, service, 'common', 'errors.js')
    const content = fs.readFileSync(copyPath, 'utf8')

    // 防御性检查：副本不应再含 ../../common/... 跨级 shim 实际 require 调用
    // （云函数部署包不包含上级目录，这种引用会在 require 时失败）
    // 注意：JSDoc 注释中可能提到历史问题，需要排除以 `*` 开头的行
    const lines = content.split('\n')
    const actualShimRefs = lines.filter(line => {
      // 跳过 JSDoc 注释行 / 单行注释
      const trimmed = line.trim()
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        return false
      }
      return /require\(['"]\.\.\/\.\.\/common\//.test(line)
    })

    expect(actualShimRefs).toEqual([])
  })
})

describe('Sprint 39: 跨 service 鸭子类型识别 BusinessError', () => {
  test.each(SERVICES)('%s 抛出的 BusinessError 能被单源 isBusinessError 识别', service => {
    const otherMod = require(path.join(ROOT, service, 'common', 'errors.js'))
    const e = otherMod.err('RATE_LIMITED', '测试限流', { remaining: 0 })

    // 关键断言：单源的鸭子类型守卫能识别来自任何 service 的 BusinessError
    expect(SINGLE_SOURCE.isBusinessError(e)).toBe(true)
    expect(e.code).toBe('RATE_LIMITED')
    expect(e.name).toBe('BusinessError')
  })

  test.each(SERVICES)('%s 抛出的 BusinessError 能被其他 service 的 isBusinessError 识别', service => {
    // 选出另一个 service（取模确保 ≠ 当前 service）
    const otherService = SERVICES[(SERVICES.indexOf(service) + 1) % SERVICES.length]
    const producer = require(path.join(ROOT, service, 'common', 'errors.js'))
    const consumer = require(path.join(ROOT, otherService, 'common', 'errors.js'))

    const e = producer.err('INVALID_PARAMS', '测试参数', { field: 'foo' })

    // 关键断言：service A 抛出的错误，service B 也能识别
    expect(consumer.isBusinessError(e)).toBe(true)
  })

  test.each(SERVICES)('%s 的 withErrorHandling 能识别其他 service 抛出的 BusinessError', async service => {
    const otherService = SERVICES[(SERVICES.indexOf(service) + 1) % SERVICES.length]
    const producer = require(path.join(ROOT, service, 'common', 'errors.js'))
    const consumer = require(path.join(ROOT, otherService, 'common', 'errors.js'))

    const handler = consumer.withErrorHandling(async () => {
      throw producer.err('RATE_LIMITED', 'cross-service rate limit', { remaining: 0 })
    })

    const response = await handler({}, {}, {})

    // 关键断言：跨 service 抛错不被退化为 INTERNAL_ERROR
    expect(response.code).not.toBe(0)
    expect(response.error.type).toBe('RATE_LIMITED')
    expect(response.error.type).not.toBe('INTERNAL_ERROR')
  })
})

describe('Sprint 39: 跨模块 withRateLimit + withErrorHandling 协作', () => {
  // 模拟 Sprint 18 场景：risk-rate-limit 抛 RATE_LIMITED，
  // 各 service 的 withErrorHandling 必须能识别（不再退化为 INTERNAL_ERROR）
  const RATE_LIMIT_SERVICES = [
    'paymentService',
    'orderService',
    'adminService',
  ]

  test.each(RATE_LIMIT_SERVICES)('%s: RATE_LIMITED 应被 withErrorHandling 正确序列化', service => {
    const mod = require(path.join(ROOT, service, 'common', 'errors.js'))
    const { withErrorHandling, err } = mod

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

describe('Sprint 39: 副本完整性综合检查（CI 门禁模拟）', () => {
  test('所有副本与单源 md5 一致（汇总）', () => {
    const sourceContent = fs.readFileSync(SINGLE_SOURCE_PATH, 'utf8')
    const sourceHash = md5(sourceContent)

    const mismatches = []
    for (const service of SERVICES) {
      const copyPath = path.join(ROOT, service, 'common', 'errors.js')
      if (!fs.existsSync(copyPath)) {
        mismatches.push(`${service}: 文件不存在`)
        continue
      }
      const copyContent = fs.readFileSync(copyPath, 'utf8')
      if (md5(copyContent) !== sourceHash) {
        mismatches.push(`${service}: md5 不一致`)
      }
    }

    expect(mismatches).toEqual([])
  })
})
