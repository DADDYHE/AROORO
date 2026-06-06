/**
 * Sprint 13 - idempotency.js → .ts 迁移验证测试
 *
 * 目标：
 *   1. 验证 cloudfunctions/common/idempotency.ts 存在且为源文件
 *   2. 验证编译产物 idempotency.js / idempotency.d.ts 存在
 *   3. 验证编译产物与 .ts 行为一致
 *   4. 验证类型导出与 .d.ts 一致
 *   5. 验证 buildPaymentIdempotencyKey / assertIdempotent / checkRateLimit 行为不变
 */

const fs = require('fs')
const path = require('path')

const COMMON = path.resolve(__dirname, '..', 'cloudfunctions', 'common')

describe('Sprint 13: idempotency.js → .ts 迁移', () => {
  test('idempotency.ts 源文件应存在', () => {
    expect(fs.existsSync(path.join(COMMON, 'idempotency.ts'))).toBe(true)
  })

  test('编译产物 idempotency.js 应存在', () => {
    expect(fs.existsSync(path.join(COMMON, 'idempotency.js'))).toBe(true)
  })

  test('类型声明 idempotency.d.ts 应存在', () => {
    expect(fs.existsSync(path.join(COMMON, 'idempotency.d.ts'))).toBe(true)
  })

  test('idempotency.js 顶部应有 eslint-disable 标记（tsc 产物）', () => {
    const js = fs.readFileSync(path.join(COMMON, 'idempotency.js'), 'utf8')
    expect(js.startsWith('/* eslint-disable')).toBe(true)
  })

  test('编译后的 .js 仍能正确导出所有公共 API', () => {
    const api = require(path.join(COMMON, 'idempotency.js'))
    expect(typeof api.buildIdempotencyKey).toBe('function')
    expect(typeof api.buildPaymentIdempotencyKey).toBe('function')
    expect(typeof api.isIdempotentHit).toBe('function')
    expect(typeof api.registerIdempotencyKey).toBe('function')
    expect(typeof api.checkRateLimit).toBe('function')
    expect(typeof api.assertIdempotent).toBe('function')
    expect(typeof api.assertRateLimit).toBe('function')
  })

  test('.d.ts 应包含所有公共 API 签名', () => {
    const dts = fs.readFileSync(path.join(COMMON, 'idempotency.d.ts'), 'utf8')
    expect(dts).toContain('buildIdempotencyKey')
    expect(dts).toContain('buildPaymentIdempotencyKey')
    expect(dts).toContain('isIdempotentHit')
    expect(dts).toContain('registerIdempotencyKey')
    expect(dts).toContain('checkRateLimit')
    expect(dts).toContain('assertIdempotent')
    expect(dts).toContain('assertRateLimit')
  })

  test('tsconfig.common.json 应包含 idempotency.ts', () => {
    const cfg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'tsconfig.common.json'), 'utf8')
    )
    expect(cfg.include).toContain('cloudfunctions/common/idempotency.ts')
  })

  test('build:common 应处理 idempotency.js', () => {
    const buildScript = fs.readFileSync(
      path.resolve(__dirname, '..', 'scripts', 'build-common.js'),
      'utf8'
    )
    expect(buildScript).toContain("'idempotency.js'")
  })

  test('crypto.d.ts shim 应存在（idempotency.ts 编译时需要）', () => {
    expect(fs.existsSync(path.join(COMMON, 'crypto.d.ts'))).toBe(true)
  })

  test('buildIdempotencyKey 行为与迁移前完全一致', () => {
    const { buildIdempotencyKey } = require(path.join(COMMON, 'idempotency.js'))
    const k1 = buildIdempotencyKey({ userId: 'u1', action: 'createOrder', payload: { a: 1 } })
    const k2 = buildIdempotencyKey({ userId: 'u1', action: 'createOrder', payload: { a: 1 } })
    const k3 = buildIdempotencyKey({ userId: 'u1', action: 'createOrder', payload: { a: 2 } })
    expect(k1).toBe(k2)
    expect(k1).not.toBe(k3)
    expect(k1.startsWith('u1:createOrder:')).toBe(true)

    // 显式 scope 优先级
    const k4 = buildIdempotencyKey({ userId: 'u1', action: 'a', payload: {}, scope: 'global' })
    expect(k4.startsWith('global:')).toBe(true)

    // 缺 userId 走 anonymous
    const k5 = buildIdempotencyKey({ action: 'a', payload: {} })
    expect(k5.startsWith('anonymous:')).toBe(true)
  })

  test('buildIdempotencyKey 缺 action 应抛 INVALID_PARAMS', () => {
    const { buildIdempotencyKey } = require(path.join(COMMON, 'idempotency.js'))
    expect(() => buildIdempotencyKey({ action: '' })).toThrow()
    expect(() => buildIdempotencyKey({ action: 123 })).toThrow()
  })

  test('buildPaymentIdempotencyKey 行为', () => {
    const { buildPaymentIdempotencyKey } = require(path.join(COMMON, 'idempotency.js'))
    const k = buildPaymentIdempotencyKey({ outTradeNo: 'o1', transactionId: 't1' })
    expect(k).toBe('wxpay:pay:o1:t1')

    const kRefund = buildPaymentIdempotencyKey({ outTradeNo: 'o1', transactionId: 't1', event: 'refund' })
    expect(kRefund).toBe('wxpay:refund:o1:t1')

    expect(() => buildPaymentIdempotencyKey({})).toThrow()
  })

  test('isIdempotentHit / registerIdempotencyKey 端到端', async () => {
    const { isIdempotentHit, registerIdempotencyKey } = require(path.join(COMMON, 'idempotency.js'))

    const docs = []
    const mockDb = {
      collection: () => ({
        where: () => ({ limit: () => ({ get: async () => ({ data: docs }) }) }),
        add: async ({ data }) => { docs.push(data) },
      }),
    }

    expect(await isIdempotentHit(mockDb, 'idem', 'k1')).toBe(false)
    const r1 = await registerIdempotencyKey(mockDb, 'idem', 'k1')
    expect(r1).toEqual({ ok: true, duplicate: false })
    expect(await isIdempotentHit(mockDb, 'idem', 'k1')).toBe(true)
  })

  test('registerIdempotencyKey 重复时返回 duplicate=true', async () => {
    const { registerIdempotencyKey } = require(path.join(COMMON, 'idempotency.js'))
    const mockDb = {
      collection: () => ({
        add: async () => { const e = new Error('dup'); e.errCode = 'DUPLICATE_KEY'; throw e },
      }),
    }
    const r = await registerIdempotencyKey(mockDb, 'idem', 'k1')
    expect(r).toEqual({ ok: false, duplicate: true, replayed: true })
  })

  test('assertIdempotent 命中时抛 IDEMPOTENT_REPLAY', async () => {
    const { assertIdempotent } = require(path.join(COMMON, 'idempotency.js'))
    const { isBusinessError } = require(path.join(COMMON, 'errors.js'))
    const mockDb = {
      collection: () => ({
        where: () => ({ limit: () => ({ get: async () => ({ data: [{ _id: 'k1' }] }) }) }),
      }),
    }
    try {
      await assertIdempotent(mockDb, 'idem', 'k1')
    } catch (e) {
      expect(isBusinessError(e)).toBe(true)
      expect(e.code).toBe('IDEMPOTENT_REPLAY')
    }
  })

  test('checkRateLimit / assertRateLimit 行为', async () => {
    const { checkRateLimit, assertRateLimit } = require(path.join(COMMON, 'idempotency.js'))
    const { isBusinessError } = require(path.join(COMMON, 'errors.js'))
    const mockDb = {
      collection: () => ({
        where: () => ({ count: async () => ({ total: 2 }) }),
      }),
      command: { gte: v => v },
    }
    const r = await checkRateLimit(mockDb, 'idem', 'a', 5, 1000)
    expect(r.allowed).toBe(true)
    expect(r.count).toBe(2)

    const r2 = await checkRateLimit(mockDb, 'idem', 'a', 2, 1000)
    expect(r2.allowed).toBe(false)

    try {
      await assertRateLimit(mockDb, 'idem', 'a', 2, 1000)
    } catch (e) {
      expect(isBusinessError(e)).toBe(true)
      expect(e.code).toBe('RATE_LIMITED')
    }
  })

  test('checkRateLimit 非法参数应抛 Error', async () => {
    const { checkRateLimit } = require(path.join(COMMON, 'idempotency.js'))
    const mockDb = { collection: () => ({}), command: { gte: v => v } }
    await expect(checkRateLimit(mockDb, 'idem', 'a', 0, 1000)).rejects.toThrow()
    await expect(checkRateLimit(mockDb, 'idem', 'a', 5, 0)).rejects.toThrow()
  })
})
