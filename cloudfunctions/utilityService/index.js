const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 内联日志（避免 ../common/logger 部署问题）
function createLogger(serviceName) {
  const fmt = (level, action) => `[${new Date().toISOString()}] [${level}] [${serviceName}] [${action}]`
  return {
    info: (action, ctx) => console.log(fmt('INFO', action), ctx || {}),
    warn: (action, ctx) => console.warn(fmt('WARN', action), ctx || {}),
    error: (action, error) => console.error(fmt('ERROR', action), error?.message || error),
  }
}
const logger = createLogger('utilityService')

// Sprint 31: 统一使用 handleSuccess / handleError 替代自定义 ok/fail
const { handleSuccess, handleError } = require('../common/utils')

let _bannersCache = null
let _bannersCacheTime = 0
const BANNERS_CACHE_TTL = 300000

async function getBanners() {
  try {
    const now = Date.now()
    if (_bannersCache && now - _bannersCacheTime < BANNERS_CACHE_TTL) {
      return _bannersCache
    }

    const res = await db.collection('banners')
      .where({ status: 'active' })
      .orderBy('sortOrder', 'asc')
      .limit(10)
      .get()

    const list = (res.data || []).map(b => ({
      id: b._id,
      image: b.imageUrl,
      title: b.title,
      subtitle: b.subtitle,
      tag: b.tag || '',
      ctaText: b.ctaText || '',
      action: b.actionType || '',
      actionTarget: b.actionTarget || '',
    }))

    _bannersCache = { list }
    _bannersCacheTime = now
    return _bannersCache
  } catch (e) {
    logger.error('getBanners', e)
    return { list: [] }
  }
}

async function getHostInfo(event) {
  const { hostId } = event
  if (!hostId) {return handleError(new Error('缺少 hostId 参数'), '缺少 hostId 参数')}

  const hostRes = await db.collection('hostProfiles').doc(hostId).get()
  if (!hostRes.data) {return handleError(new Error('找不到对应的寄养家庭信息'), '找不到对应的寄养家庭信息')}

  return handleSuccess({
    openid: hostRes.data.openid,
    hostName: hostRes.data.hostName,
    pricePerDay: hostRes.data.pricePerDay,
  }, '获取成功')
}

const handlers = { getBanners, getHostInfo }

exports.main = async event => {
  try {
    const { action } = event
    if (!action || !handlers[action]) {
      return handleError(new Error(`未知 action: ${action}`), `未知 action: ${action}`)
    }
    const result = await handlers[action](event)
    if (result && typeof result === 'object' && 'code' in result) {return result}
    return handleSuccess(result, '操作成功')
  } catch (e) {
    logger.error('main', e)
    return handleError(e, e?.message || 'unknown error')
  }
}
