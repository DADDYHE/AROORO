/**
 * searchService/index.js - 聚合搜索服务
 *
 * 功能：跨数据源关键词搜索，合并评分排序
 *
 * 数据源与搜索字段：
 *   - 商品 (products)      → name、subTitle、category
 *   - 团购 (tuan_deals)    → title
 *   - 活动 (activities)    → title、location
 *   - 寄养 (hostProfiles)  → hostName、address
 *
 * 评分算法：
 *   精确匹配 ×3 / 前缀匹配 ×2 / 包含匹配 ×1  ×  字段权重
 *   同分时按销量/热度 → 创建时间排序
 */

const { initCloud, handleSuccess, handleError, escapeRegExp } = require('./common/utils')
const { createLogger } = require('./common/logger')

const { cloud, db } = initCloud()
const _ = db.command
const logger = createLogger('searchService')

const KEYWORD_MAX_LENGTH = 50
const SEARCH_LIMIT = 20 // 每个数据源最多返回条数

// 各数据源搜索字段权重
const FIELD_WEIGHTS = {
  product: { name: 10, subTitle: 5, category: 2 },
  tuan: { title: 10 },
  activity: { title: 10, location: 3 },
  host: { hostName: 10, address: 5 },
}

// 各数据源辅助排序字段（同分时用）
const SORT_FIELDS = {
  product: 'soldCount',
  tuan: 'totalOrders',
  activity: 'currentParticipants',
  host: 'averageRating',
}

// =====================================================================
// 评分函数
// =====================================================================

/**
 * 计算单条记录的相关性得分
 * @param {string} keyword 搜索关键词
 * @param {Object} record 数据记录
 * @param {Object} weights 字段权重配置 { fieldName: weight }
 * @returns {number} 得分
 */
function computeScore(keyword, record, weights) {
  let score = 0
  const lowerKeyword = keyword.toLowerCase()

  for (const [field, weight] of Object.entries(weights)) {
    const value = record[field]
    if (!value || typeof value !== 'string') continue

    const lowerValue = value.toLowerCase()
    if (lowerValue === lowerKeyword) {
      score += weight * 3 // 精确匹配
    } else if (lowerValue.startsWith(lowerKeyword)) {
      score += weight * 2 // 前缀匹配
    } else if (lowerValue.includes(lowerKeyword)) {
      score += weight * 1 // 包含匹配
    }
  }
  return score
}

/**
 * 为每条记录附加得分并排序
 */
function scoreAndSort(list, keyword, type) {
  const weights = FIELD_WEIGHTS[type] || {}
  const sortField = SORT_FIELDS[type]

  return list
    .map((item) => ({
      ...item,
      _score: computeScore(keyword, item, weights),
    }))
    .sort((a, b) => {
      // 相关性得分降序
      if (b._score !== a._score) return b._score - a._score
      // 辅助排序字段降序（销量/热度）
      const aSort = Number(a[sortField]) || 0
      const bSort = Number(b[sortField]) || 0
      if (bSort !== aSort) return bSort - aSort
      // 创建时间降序
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return bTime - aTime
    })
}

// =====================================================================
// 数据源搜索函数
// =====================================================================

async function searchProducts(keyword) {
  const safeKeyword = escapeRegExp(keyword.slice(0, KEYWORD_MAX_LENGTH))
  const where = {
    status: 'on_sale',
    $or: [
      { name: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
      { subTitle: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
      { category: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
    ],
  }

  const result = await db
    .collection('products')
    .where(where)
    .field({
      _id: true, name: true, subTitle: true, category: true,
      coverUrl: true, coverImage: true, price: true, originalPrice: true,
      soldCount: true, status: true, createdAt: true,
    })
    .limit(SEARCH_LIMIT)
    .get()

  const list = (result.data || []).map((item) => {
    const coverUrl = item.coverUrl || item.coverImage || ''
    return { ...item, coverUrl, _type: 'product' }
  })

  return scoreAndSort(list, keyword, 'product')
}

async function searchTuanDeals(keyword) {
  const safeKeyword = escapeRegExp(keyword.slice(0, KEYWORD_MAX_LENGTH))
  const now = new Date()
  const where = {
    status: _.in(['published', 'active']),
    startTime: _.lte(now),
    endTime: _.gte(now),
    title: db.RegExp({ regexp: safeKeyword, options: 'i' }),
  }

  const result = await db
    .collection('tuan_deals')
    .where(where)
    .field({
      _id: true, title: true, coverUrl: true,
      minPrice: true, totalOrders: true,
      startTime: true, endTime: true, createdAt: true,
    })
    .limit(SEARCH_LIMIT)
    .get()

  const list = (result.data || []).map((item) => ({
    ...item,
    _type: 'tuan',
  }))

  return scoreAndSort(list, keyword, 'tuan')
}

async function searchActivities(keyword) {
  const safeKeyword = escapeRegExp(keyword.slice(0, KEYWORD_MAX_LENGTH))
  const where = {
    // P1 修复：与活动列表用户端口径一致——仅展示已发布/报名截止/已结束，
    //   原 _.neq('deleted') 会把草稿（draft）与已取消（cancelled）活动搜出来
    status: _.in(['published', 'registration_stopped', 'ended']),
    $or: [
      { title: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
      { location: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
    ],
  }

  const result = await db
    .collection('activities')
    .where(where)
    .field({
      _id: true, title: true, coverUrl: true, location: true,
      startTime: true, currentParticipants: true, status: true,
      createdAt: true,
    })
    .limit(SEARCH_LIMIT)
    .get()

  const list = (result.data || []).map((item) => ({
    ...item,
    _type: 'activity',
  }))

  return scoreAndSort(list, keyword, 'activity')
}

async function searchHosts(keyword) {
  const safeKeyword = escapeRegExp(keyword.slice(0, KEYWORD_MAX_LENGTH))
  const where = {
    status: _.in(['active', 'approved']),
    $or: [
      { hostName: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
      { address: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
    ],
  }

  const result = await db
    .collection('hostProfiles')
    .where(where)
    .field({
      _id: true, hostName: true, avatarUrl: true, address: true,
      pricePerDay: true, averageRating: true, housingType: true,
      petTypes: true, createdAt: true,
    })
    .limit(SEARCH_LIMIT)
    .get()

  const list = (result.data || []).map((item) => ({
    ...item,
    _type: 'host',
  }))

  return scoreAndSort(list, keyword, 'host')
}

// =====================================================================
// 聚合搜索主函数
// =====================================================================

async function globalSearch(event) {
  const { keyword = '', type = 'all' } = event

  if (!keyword || !keyword.trim()) {
    return handleSuccess({ list: [], total: 0 }, '获取成功')
  }

  const trimmedKeyword = keyword.trim()
  logger.info('globalSearch', { keyword: trimmedKeyword, type })

  const tasks = []
  if (type === 'all' || type === 'product') {
    tasks.push(searchProducts(trimmedKeyword).catch((e) => {
      logger.error('searchProducts', e)
      return []
    }))
  }
  if (type === 'all' || type === 'tuan') {
    tasks.push(searchTuanDeals(trimmedKeyword).catch((e) => {
      logger.error('searchTuanDeals', e)
      return []
    }))
  }
  if (type === 'all' || type === 'activity') {
    tasks.push(searchActivities(trimmedKeyword).catch((e) => {
      logger.error('searchActivities', e)
      return []
    }))
  }
  if (type === 'all' || type === 'host') {
    tasks.push(searchHosts(trimmedKeyword).catch((e) => {
      logger.error('searchHosts', e)
      return []
    }))
  }

  const results = await Promise.all(tasks)
  const merged = results.flat()

  // 跨数据源合并排序：先按得分，再按辅助字段
  merged.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score
    const typeOrder = { product: 0, tuan: 1, activity: 2, host: 3 }
    return (typeOrder[a._type] || 9) - (typeOrder[b._type] || 9)
  })

  return handleSuccess({ list: merged, total: merged.length }, '获取成功')
}

// =====================================================================
// Main 入口
// =====================================================================

exports.main = async (event) => {
  try {
    // P2 修复：公开搜索接口限流（防刷流量）。小程序调用可经 getWXContext 取 openid，
    //   匿名场景（HTTP 直调）降级为 'anon' 公共桶限流
    let userId = 'anon'
    try {
      const wxContext = cloud.getWXContext()
      if (wxContext && wxContext.OPENID) {
        userId = wxContext.OPENID
      }
    } catch (e) {
      // 取不到上下文不阻断，使用 anon 桶
    }
    const { withRateLimit } = require('./common/risk-rate-limit')
    return await withRateLimit(
      { userId, type: 'search', targetId: 'global' },
      () => globalSearch(event)
    )
  } catch (error) {
    logger.error('searchService.main', error)
    return handleError(error, '搜索失败')
  }
}
