// 将 cloud:// URL 直接转换为 CDN HTTPS URL
// cloud://<env-id>.<bucket-id>/<path> -> https://<bucket-id>.tcb.qcloud.la/<path>
// 静态托管环境无服务端代理，需要前端直接拼接 CDN 地址

let urlCache = new Map()

export function resolveCloudUrl(url) {
  if (!url || typeof url !== 'string') return url
  if (!url.startsWith('cloud://')) return url
  if (urlCache.has(url)) return urlCache.get(url)
  const match = url.match(/^cloud:\/\/[^/]+\.([^/]+)\/(.+)$/)
  let resolved
  if (match) {
    resolved = `https://${match[1]}.tcb.qcloud.la/${match[2]}`
  } else {
    resolved = url
  }
  urlCache.set(url, resolved)
  return resolved
}

export function resolveCloudUrls(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (obj instanceof Date) return obj
  if (Array.isArray(obj)) return obj.map(item => typeof item === 'string' ? resolveCloudUrl(item) : resolveCloudUrls(item))
  const result = {}
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    if (typeof val === 'string') {
      result[key] = resolveCloudUrl(val)
    } else if (typeof val === 'object' && val !== null) {
      result[key] = resolveCloudUrls(val)
    } else {
      result[key] = val
    }
  }
  return result
}
