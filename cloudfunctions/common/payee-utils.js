/**
 * payee-utils.js - 提现收款账号共享工具
 *
 * 用途：
 *   - PAYOUT_CHANNELS：收款方式白名单 wechat / alipay / bank
 *   - validatePayee：格式校验（前端即时 + 后端权威）
 *   - hasPayeeChannel：某渠道是否已预留账号
 *   - maskPayee：脱敏快照（渠道 + 账号摘要 + 姓名），日志/列表/审计一律用脱敏
 *
 * 安全约定：
 *   - 完整账号仅存 users.payee；withdrawals.payeeSnapshot / paidToSnapshot 只存脱敏；
 *   - 列表/详情接口响应体零完整账号字段。
 */

const PAYOUT_CHANNELS = ['wechat', 'alipay', 'bank']

/** 邮箱格式 */
function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim())
}

/** 11 位手机号 */
function isPhone(v) {
  return /^1\d{10}$/.test(String(v || '').trim())
}

/** 银行卡 Luhn 校验 */
function luhnCheck(cardNo) {
  const s = String(cardNo || '').replace(/\s+/g, '')
  if (!/^\d{12,19}$/.test(s)) {return false}
  let sum = 0
  let double = false
  for (let i = s.length - 1; i >= 0; i--) {
    let d = Number(s[i])
    if (double) {
      d *= 2
      if (d > 9) {d -= 9}
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

/**
 * 校验 payee 结构，返回 { ok, error }
 * 规则：至少一个渠道非空即合法（允许全空时由调用方决定是否放行）；
 * 非空渠道必须格式正确：wechat 非空、alipay 邮箱或手机号、bank 三项齐全且卡号过 Luhn。
 */
function validatePayee(payee) {
  const p = payee && typeof payee === 'object' ? payee : {}
  const wechat = String(p.wechat || '').trim()
  const alipay = String(p.alipay || '').trim()
  const bank = (p.bank && typeof p.bank === 'object') ? p.bank : {}
  const bankName = String(bank.bankName || '').trim()
  const cardNo = String(bank.cardNo || '').trim()
  const holder = String(bank.holder || '').trim()

  if (wechat) {
    if (wechat.length < 3 || wechat.length > 64) {
      return { ok: false, error: '微信号/手机号长度不合法' }
    }
  }
  if (alipay) {
    if (!isEmail(alipay) && !isPhone(alipay)) {
      return { ok: false, error: '支付宝账号需为邮箱或 11 位手机号' }
    }
  }
  if (bankName || cardNo || holder) {
    if (!bankName) {return { ok: false, error: '请填写开户行' }}
    if (!holder) {return { ok: false, error: '请填写持卡人姓名' }}
    if (!luhnCheck(cardNo)) {return { ok: false, error: '银行卡号校验失败，请核对' }}
  }
  return { ok: true, error: '' }
}

/** 某渠道是否已预留账号 */
function hasPayeeChannel(payee, channel) {
  const p = payee && typeof payee === 'object' ? payee : {}
  if (channel === 'wechat') {return Boolean(String(p.wechat || '').trim())}
  if (channel === 'alipay') {return Boolean(String(p.alipay || '').trim())}
  if (channel === 'bank') {
    return Boolean(
      p.bank &&
      String(p.bank.bankName || '').trim() &&
      String(p.bank.cardNo || '').trim() &&
      String(p.bank.holder || '').trim()
    )
  }
  return false
}

/** 账号脱敏（不含姓名/开户行敏感信息以外的可辨识信息） */
function maskAccount(value, kind) {
  const s = String(value || '').trim()
  if (!s) {return ''}
  if (kind === 'phone' || /^1\d{10}$/.test(s)) {
    return `${s.slice(0, 3)}****${s.slice(-4)}`
  }
  if (kind === 'email' || s.includes('@')) {
    const [name, domain] = s.split('@')
    return `${name.slice(0, 1)}***@${domain || ''}`
  }
  if (kind === 'card' || /^\d{8,}$/.test(s)) {
    return `尾号${s.slice(-4)}`
  }
  // 微信号等：保留首尾
  if (s.length <= 4) {return '****'}
  return `${s.slice(0, 2)}****${s.slice(-2)}`
}

/**
 * 生成某渠道的脱敏快照
 * @returns {{channel:string, account?:string, bankName?:string, cardTail?:string, holder?:string} | null}
 */
function maskPayee(payee, channel) {
  const p = payee && typeof payee === 'object' ? payee : {}
  if (channel === 'wechat') {
    const v = String(p.wechat || '').trim()
    return v ? { channel: 'wechat', account: maskAccount(v, /^1\d{10}$/.test(v) ? 'phone' : 'wx') } : null
  }
  if (channel === 'alipay') {
    const v = String(p.alipay || '').trim()
    return v ? { channel: 'alipay', account: maskAccount(v, isEmail(v) ? 'email' : (isPhone(v) ? 'phone' : 'wx')) } : null
  }
  if (channel === 'bank' && p.bank) {
    const cardNo = String(p.bank.cardNo || '').trim()
    return {
      channel: 'bank',
      bankName: String(p.bank.bankName || '').trim(),
      cardTail: cardNo ? `尾号${cardNo.slice(-4)}` : '',
      holder: String(p.bank.holder || '').trim(),
    }
  }
  return null
}

module.exports = {
  PAYOUT_CHANNELS,
  isEmail,
  isPhone,
  luhnCheck,
  validatePayee,
  hasPayeeChannel,
  maskAccount,
  maskPayee,
}
