const ACCENT_COLORS = {
  fixed_amount: '#C4956A',
  discount: '#8BA4B8',
  full_reduction: '#D4A853',
}

function getAccentColor(type) {
  return ACCENT_COLORS[type] || '#C4956A'
}

const SCOPE_MAP = {
  all: '全品类',
  mall: '商城',
  tuan: '团购',
  feeding: '上门服务',
  hosting: '寄养',
  activity: '活动',
}

function translateScopes(scopes) {
  if (!scopes || !scopes.length) {return ['全品类']}
  return scopes.map(s => SCOPE_MAP[s] || s)
}

function isTemplateExpired(template) {
  const now = Date.now()
  if (template.validFrom && new Date(template.validFrom).getTime() > now) {return true}
  if (template.validTo && new Date(template.validTo).getTime() < now) {return true}
  return false
}

function getClaimBtnState(template) {
  if (!template.canClaim) {return { text: '已领取', disabled: true }}
  if (isTemplateExpired(template)) {return { text: '不可领取', disabled: true }}
  return { text: '可领取', disabled: false }
}

function mapCouponTemplates(list) {
  return list.map(t => ({
    ...t,
    accentColor: getAccentColor(t.type),
    scopeLabels: translateScopes(t.scopes),
  }))
}

module.exports = { ACCENT_COLORS, SCOPE_MAP, getAccentColor, translateScopes, isTemplateExpired, getClaimBtnState, mapCouponTemplates }
