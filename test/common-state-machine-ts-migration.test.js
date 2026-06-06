/**
 * Sprint 13 - state-machine.js → .ts 迁移验证测试
 *
 * 目标：
 *   1. 验证 cloudfunctions/common/state-machine.ts 存在且为源文件
 *   2. 验证编译产物 state-machine.js / state-machine.d.ts 存在
 *   3. 验证编译产物与 .ts 行为一致（导入后功能可用）
 *   4. 验证类型导出与 .d.ts 一致
 *   5. 验证 IllegalTransitionError + createStateMachine + applyEvent 行为不变
 */

const fs = require('fs')
const path = require('path')

const COMMON = path.resolve(__dirname, '..', 'cloudfunctions', 'common')

describe('Sprint 13: state-machine.js → .ts 迁移', () => {
  test('state-machine.ts 源文件应存在', () => {
    expect(fs.existsSync(path.join(COMMON, 'state-machine.ts'))).toBe(true)
  })

  test('编译产物 state-machine.js 应存在', () => {
    expect(fs.existsSync(path.join(COMMON, 'state-machine.js'))).toBe(true)
  })

  test('类型声明 state-machine.d.ts 应存在', () => {
    expect(fs.existsSync(path.join(COMMON, 'state-machine.d.ts'))).toBe(true)
  })

  test('state-machine.js 顶部应有 eslint-disable 标记（tsc 产物）', () => {
    const js = fs.readFileSync(path.join(COMMON, 'state-machine.js'), 'utf8')
    expect(js.startsWith('/* eslint-disable')).toBe(true)
  })

  test('编译后的 .js 仍能正确导出所有公共 API', () => {
    const api = require(path.join(COMMON, 'state-machine.js'))
    expect(typeof api.createStateMachine).toBe('function')
    expect(typeof api.validateConfig).toBe('function')
    expect(typeof api.applyEvent).toBe('function')
    expect(typeof api.IllegalTransitionError).toBe('function')
  })

  test('.d.ts 应包含核心导出：createStateMachine / IllegalTransitionError / validateConfig / applyEvent', () => {
    const dts = fs.readFileSync(path.join(COMMON, 'state-machine.d.ts'), 'utf8')
    expect(dts).toContain('IllegalTransitionError')
    expect(dts).toContain('createStateMachine')
    expect(dts).toContain('validateConfig')
    expect(dts).toContain('applyEvent')
  })

  test('tsconfig.common.json 应包含 state-machine.ts', () => {
    const cfg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'tsconfig.common.json'), 'utf8')
    )
    expect(cfg.include).toContain('cloudfunctions/common/state-machine.ts')
  })

  test('build:common 应处理 state-machine.js（build-common.js TARGETS）', () => {
    const buildScript = fs.readFileSync(
      path.resolve(__dirname, '..', 'scripts', 'build-common.js'),
      'utf8'
    )
    expect(buildScript).toContain("'state-machine.js'")
  })

  test('IllegalTransitionError 保留三字段 + 自定义 message', () => {
    const { IllegalTransitionError } = require(path.join(COMMON, 'state-machine.js'))
    const e = new IllegalTransitionError('a', 'b', ['c', 'd'])
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('IllegalTransitionError')
    expect(e.from).toBe('a')
    expect(e.to).toBe('b')
    expect(e.allowed).toEqual(['c', 'd'])
    expect(e.message).toContain('a → b')

    const e2 = new IllegalTransitionError('a', 'b', [], 'custom')
    expect(e2.message).toBe('custom')
  })

  test('createStateMachine 行为与迁移前完全一致', () => {
    const { createStateMachine, IllegalTransitionError } = require(path.join(COMMON, 'state-machine.js'))
    const sm = createStateMachine({
      initial: 'pending',
      states: ['pending', 'paid', 'cancelled'],
      transitions: { pending: ['paid', 'cancelled'], paid: ['cancelled'], cancelled: [] },
    })

    expect(sm.initial).toBe('pending')
    expect(sm.states).toEqual(['pending', 'paid', 'cancelled'])
    expect(sm.canTransition('pending', 'paid')).toBe(true)
    expect(sm.canTransition('pending', 'cancelled')).toBe(true)
    expect(sm.canTransition('paid', 'pending')).toBe(false)
    expect(sm.canTransition('pending', 'unknown')).toBe(false)
    expect(sm.isTerminal('cancelled')).toBe(true)
    expect(sm.isTerminal('pending')).toBe(false)
    expect(sm.nextStates('pending')).toEqual(['paid', 'cancelled'])
    expect(sm.nextStates('cancelled')).toEqual([])

    expect(() => sm.assertTransition('pending', 'paid')).not.toThrow()
    expect(() => sm.assertTransition('pending', 'completed')).toThrow(IllegalTransitionError)
  })

  test('validateConfig 配置错误应抛出 BusinessError', () => {
    const { validateConfig } = require(path.join(COMMON, 'state-machine.js'))
    const { isBusinessError } = require(path.join(COMMON, 'errors.js'))

    expect(() => validateConfig(null)).toThrow()
    expect(() => validateConfig({})).toThrow()
    expect(() => validateConfig({ initial: 'a' })).toThrow()
    expect(() => validateConfig({ initial: 'a', states: ['a', 'b'] })).toThrow()

    // 配置正确但 initial 不在 states 中
    try {
      validateConfig({ initial: 'x', states: ['a', 'b'], transitions: { a: ['b'] } })
    } catch (e) {
      expect(isBusinessError(e)).toBe(true)
    }
  })

  test('applyEvent 行为：合法 next 返回目标，否则 null', () => {
    const { createStateMachine, applyEvent } = require(path.join(COMMON, 'state-machine.js'))
    const sm = createStateMachine({
      initial: 'pending',
      states: ['pending', 'paid', 'cancelled'],
      transitions: { pending: ['paid', 'cancelled'], paid: [], cancelled: [] },
    })

    expect(applyEvent(sm, 'pending', 'paid')).toBe('paid')
    expect(applyEvent(sm, 'pending', 'cancelled')).toBe('cancelled')
    expect(applyEvent(sm, 'pending', 'unknown')).toBeNull()
    expect(applyEvent(null, 'pending', 'paid')).toBeNull()
  })
})
