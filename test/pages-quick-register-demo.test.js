/**
 * pages/quick-register 表单页逻辑测试（F29 demo）
 *
 * 当前项目无小程序组件测试基建（无 miniprogram-simulate / jest-environment-miniprogram /
 * @wechat-miniprogram_*，test/setup.js 仅桩 wx / getApp / wx-server-sdk，未桩 Page）。
 * 真实页面依赖 Behavior/Component 全局 + services 模块，直接 require 会失败。
 *
 * 因此采用「项目可行方案」：在测试内桩 global.Page 捕获 Page({...}) 配置，
 * 用假实例（data + setData + 绑定方法）直接驱动页面方法，零新依赖即可覆盖
 * 交互 / 表单校验关键分支。该 fixture 模型与真实 quick-register 同构。
 */
let capturedConfig = null
let originalPage = undefined

beforeAll(() => {
  originalPage = global.Page
  global.Page = (config) => {
    capturedConfig = config
  }
})

afterAll(() => {
  global.Page = originalPage
})

function loadDemoPage() {
  jest.resetModules()
  capturedConfig = null
  require('./fixtures/demo-page-quick-register')
  return capturedConfig
}

function makeInstance(config) {
  const inst = {
    data: JSON.parse(JSON.stringify(config.data || {})),
    setData(patch) {
      const p = typeof patch === 'function' ? patch(this.data) : patch
      Object.keys(p).forEach((key) => {
        if (key.indexOf('.') !== -1) {
          const parts = key.split('.')
          let cur = this.data
          for (let i = 0; i < parts.length - 1; i++) {
            if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) {
              cur[parts[i]] = {}
            }
            cur = cur[parts[i]]
          }
          cur[parts[parts.length - 1]] = p[key]
        } else {
          this.data[key] = p[key]
        }
      })
    },
  }
  Object.keys(config).forEach((key) => {
    if (typeof config[key] === 'function') {
      inst[key] = config[key].bind(inst)
    }
  })
  // 桩掉真实服务调用
  inst._doRegister = jest.fn(async () => ({ code: 0 }))
  return inst
}

describe('quick-register 表单页逻辑 (F29 demo)', () => {
  let config
  beforeAll(() => {
    config = loadDemoPage()
  })

  test('初始 data 结构正确', () => {
    const inst = makeInstance(config)
    expect(inst.data.form).toEqual({ phone: '', code: '', nickname: '' })
    expect(inst.data.submitting).toBe(false)
  })

  test('onPhoneInput 更新 form.phone', () => {
    const inst = makeInstance(config)
    inst.onPhoneInput({ detail: { value: '13800138000' } })
    expect(inst.data.form.phone).toBe('13800138000')
  })

  test('validateForm：空手机号报错', () => {
    const inst = makeInstance(config)
    expect(inst.validateForm()).toBe(false)
    expect(inst.data.errors.phone).toBe('请输入手机号')
  })

  test('validateForm：手机号格式错误', () => {
    const inst = makeInstance(config)
    inst.data.form.phone = '123'
    expect(inst.validateForm()).toBe(false)
    expect(inst.data.errors.phone).toBe('手机号格式不正确')
  })

  test('validateForm：验证码格式错误', () => {
    const inst = makeInstance(config)
    inst.data.form.phone = '13800138000'
    inst.data.form.code = 'ab'
    expect(inst.validateForm()).toBe(false)
    expect(inst.data.errors.code).toBe('验证码格式不正确')
  })

  test('validateForm：全部合法返回 true 且清空 errors', () => {
    const inst = makeInstance(config)
    inst.data.form = { phone: '13800138000', code: '1234', nickname: '阿罗' }
    expect(inst.validateForm()).toBe(true)
    expect(inst.data.errors).toEqual({})
  })

  test('onSubmit：提交中防重入（不调服务）', async () => {
    const inst = makeInstance(config)
    inst.data.submitting = true
    await inst.onSubmit()
    expect(inst._doRegister).not.toHaveBeenCalled()
  })

  test('onSubmit：校验失败不提交', async () => {
    const inst = makeInstance(config)
    await inst.onSubmit()
    expect(inst._doRegister).not.toHaveBeenCalled()
    expect(inst.data.submitting).toBe(false)
  })

  test('onSubmit：校验通过则调用注册并复位 submitting', async () => {
    const inst = makeInstance(config)
    inst.data.form = { phone: '13800138000', code: '1234', nickname: '阿罗' }
    await inst.onSubmit()
    expect(inst._doRegister).toHaveBeenCalledTimes(1)
    expect(inst.data.submitting).toBe(false)
  })

  test('onSubmit：注册异常被捕获并写 errors.form', async () => {
    const inst = makeInstance(config)
    inst.data.form = { phone: '13800138000', code: '1234', nickname: '阿罗' }
    inst._doRegister = jest.fn(async () => {
      throw new Error('net')
    })
    await inst.onSubmit()
    expect(inst.data.errors.form).toBe('提交失败，请重试')
    expect(inst.data.submitting).toBe(false)
  })
})
