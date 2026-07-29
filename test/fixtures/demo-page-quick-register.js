/**
 * 演示用最小表单页（F29 demo fixture）
 *
 * 结构与真实 quick-register 一致：Page({ data, methods }) + 纯表单校验逻辑。
 * 不依赖任何外部模块（无 getApp / wx / services / behaviors），
 * 因此可在纯 Jest（node 环境）下，仅用 global.Page 桩 + 假实例即可测试。
 *
 * 这不是 app.json 注册的页面，仅用于验证小程序前端逻辑的轻量测试可行性，
 * 证明无需 miniprogram-simulate 等重依赖即可覆盖关键交互 / 表单校验分支。
 */
const PHONE_RE = /^1[3-9]\d{9}$/
const CODE_RE = /^\d{4,6}$/

Page({
  data: {
    form: { phone: '', code: '', nickname: '' },
    submitting: false,
    errors: {},
  },

  onPhoneInput(e) {
    this.setData({ 'form.phone': e.detail.value })
  },

  onCodeInput(e) {
    this.setData({ 'form.code': e.detail.value })
  },

  onNicknameInput(e) {
    this.setData({ 'form.nickname': e.detail.value })
  },

  validateForm() {
    const { phone, code, nickname } = this.data.form
    const errors = {}
    if (!phone) {
      errors.phone = '请输入手机号'
    } else if (!PHONE_RE.test(phone)) {
      errors.phone = '手机号格式不正确'
    }
    if (!code) {
      errors.code = '请输入验证码'
    } else if (!CODE_RE.test(code)) {
      errors.code = '验证码格式不正确'
    }
    if (!nickname || nickname.trim().length === 0) {
      errors.nickname = '请输入昵称'
    }
    this.setData({ errors })
    return Object.keys(errors).length === 0
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.validateForm()) {
      this.setData({ submitting: false })
      return
    }
    this.setData({ submitting: true })
    try {
      await this._doRegister()
      this.setData({ submitting: false })
    } catch (err) {
      this.setData({ submitting: false, errors: { form: '提交失败，请重试' } })
    }
  },

  // 真实页面调用 authService.register；测试中由假实例桩掉
  async _doRegister() {
    return Promise.resolve({ code: 0 })
  },
})
