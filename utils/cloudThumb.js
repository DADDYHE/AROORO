// cloudThumb · tcb 云存储直链缩略参数工具
// ------------------------------------------------------------------
// 依据 deliverables/image-thumbnail-analysis-2026-09-02.md：
// tcb.qcloud.la 支持数据万象 imageMogr2 下载时处理（已实测生效），
// thumbnail/{w}x + quality/85 实测体积降 4~25 倍，清晰度按显示尺寸×DPR 出图无损感知。
//
// 纪律（CDN 缓存 key 按完整 URL 含参数区分）：全站只允许经本函数拼参，禁止散拼。

// 头像类字段显示尺寸小（44~96px），300x 足够兜住 3x 屏
const AVATAR_KEY_RE = /avatar/i
const AVATAR_WIDTH = 300
// 其余图片字段统一 1080x：兜住 3x 屏全宽，banner/详情 hero 无损感知
const DEFAULT_WIDTH = 1080

function _suffix(width) {
  return 'imageMogr2/thumbnail/' + width + 'x/quality/85'
}

/**
 * 为 tcb 云存储直链追加缩略参数
 * @param {string} url 图片 URL
 * @param {string} [key] 字段名（avatar 类字段降为 300x）
 * @returns {string} 处理后 URL；非 tcb 直链/已带参原样返回
 */
function thumbUrl(url, key) {
  if (typeof url !== 'string' || !/tcb\.qcloud\.la\//.test(url)) { return url }
  if (url.indexOf('imageMogr2') !== -1) { return url }
  const width = (key && AVATAR_KEY_RE.test(key)) ? AVATAR_WIDTH : DEFAULT_WIDTH
  return url + (url.indexOf('?') === -1 ? '?' : '&') + _suffix(width)
}

function _walk(value, key) {
  if (Array.isArray(value)) {
    return value.map(function (v) { return _walk(v, key) })
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) {
      out[k] = _walk(value[k], k)
    }
    return out
  }
  if (typeof value === 'string') {
    return thumbUrl(value, key)
  }
  return value
}

/**
 * 递归处理云函数响应中的所有图片 URL（深拷贝返回，不改入参）
 * 响应为小体积 JSON，遍历开销可忽略
 */
function applyCloudThumbs(result) {
  if (!result || typeof result !== 'object') { return result }
  return _walk(result)
}

module.exports = { thumbUrl, applyCloudThumbs }
