const { err } = require('./common/errors')
const { initCloud, handleSuccess, handleError, ERROR_CODES } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { getCache, setCache, deleteCache } = require('./common/cache')
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')
const { deriveKey, encrypt: gcmEncrypt, decrypt: gcmDecrypt } = require('./common/crypto')

const { db } = initCloud()
const logger = createLogger('hostService')
const _ = db.command

// 敏感字段加密方案已由 AES-256-CBC 升级为 AES-256-GCM（Sprint 2）
//
// 密钥派生：
//   - 从环境变量 ENCRYPT_KEY 派生 32 字节 key（scrypt 慢哈希）
//   - salt 持久化在进程内（重启后保持一致）
//   - 也可显式通过 ENCRYPT_SALT 注入固定 salt（多副本部署需保持一致）
//
// 密文格式：
//   - v2（GCM）: base64(iv).base64(tag).base64(cipher)，12+16+N 字节
//   - v1（CBC）: base64(iv):base64(cipher)，16+N 字节（仅用于迁移期解密）
//
// 双写策略（开启 ENABLE_CBC_DUAL_WRITE=true 时）：
//   - 加密时同时写 v1 与 v2 两份（v1 字段后缀 _v1，v2 字段后缀 _v2）
//   - 解密时优先读 v2，失败回退 v1

const CBC_ALGORITHM = 'aes-256-cbc'
const CBC_IV_LENGTH = 16
const LEGACY_PREFIX = 'legacy_cbc:'
const KEY_VERSION = {
  V1_CBC: 1,
  V2_GCM: 2,
}

let _derivedKey = null

function _getKey() {
  if (_derivedKey) {return _derivedKey}
  const passphrase = process.env.ENCRYPT_KEY
  if (!passphrase || passphrase.length < 16) {
    throw new Error('ENCRYPT_KEY 环境变量未配置或长度不足（至少 16 字符），无法加密敏感数据')
  }
  const salt = process.env.ENCRYPT_SALT || 'hostService-default-salt'
  const { key } = deriveKey(passphrase, salt)
  _derivedKey = key
  return key
}

/**
 * v2 AES-256-GCM 加密（推荐）
 * @param {string} value 明文
 * @returns {string} 形如 `gcm:base64(iv).base64(tag).base64(cipher)`
 */
function _encryptSensitive(value) {
  if (!value) {return ''}
  const key = _getKey()
  const payload = gcmEncrypt(value, key)
  return `gcm:${payload}`
}

/**
 * v1 AES-256-CBC 加密（迁移期使用，需显式开启双写）
 * 输出格式：base64(iv):base64(cipher)
 */
function _encryptSensitiveCBC(value) {
  if (!value) {return ''}
  const crypto = require('crypto')
  const key = _getKey()
  const iv = crypto.randomBytes(CBC_IV_LENGTH)
  const cipher = crypto.createCipheriv(CBC_ALGORITHM, key, iv)
  let encrypted = cipher.update(value, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return `${LEGACY_PREFIX}${iv.toString('base64')}:${encrypted}`
}

/**
 * 双写加密：同时返回 v1 与 v2
 * 启用条件：process.env.ENABLE_CBC_DUAL_WRITE === 'true'
 * @returns {{v1?: string, v2: string}}
 */
function _encryptDual(value) {
  const v2 = _encryptSensitive(value)
  if (process.env.ENABLE_CBC_DUAL_WRITE === 'true') {
    return { v1: _encryptSensitiveCBC(value), v2 }
  }
  return { v2 }
}

/**
 * 解密敏感数据：自动识别 v1 / v2 格式
 * @param {string} payload 密文
 * @returns {string} 明文
 */
function _decryptSensitive(payload) {
  if (!payload) {return ''}
  const key = _getKey()

  if (payload.startsWith('gcm:')) {
    return gcmDecrypt(payload.slice(4), key)
  }
  if (payload.startsWith(LEGACY_PREFIX)) {
    return _decryptCBC(payload.slice(LEGACY_PREFIX.length), key)
  }
  // 兼容历史纯 base64(iv):base64(cipher) 格式（v1 未加前缀）
  if (payload.includes(':')) {
    try {
      return _decryptCBC(payload, key)
    } catch (e) {
      logger.warn('_decryptSensitive.fallbackCBC', { msg: e.message })
    }
  }
  throw new Error('无法识别的密文格式')
}

function _decryptCBC(payload, key) {
  const crypto = require('crypto')
  const parts = payload.split(':')
  if (parts.length !== 2) {throw new Error('CBC payload 格式错误')}
  const iv = Buffer.from(parts[0], 'base64')
  if (iv.length !== CBC_IV_LENGTH) {throw new Error('CBC iv 长度错误')}
  const ciphertext = parts[1]
  const decipher = crypto.createDecipheriv(CBC_ALGORITHM, key, iv)
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

const HOST_LIST_FIELDS = {
  _id: true, openid: true, hostName: true, avatarUrl: true, name: true,
  address: true, hasYard: true, housingType: true, maxPets: true,
  petTypes: true, pricePerDay: true, averageRating: true,
  isAcceptingOrders: true, status: true, description: true, createdAt: true, updatedAt: true,
  roomType: true, petLimit: true, tags: true, isRecommended: true, photos: true,
}

const HOST_DETAIL_PUBLIC_FIELDS = {
  _id: true, hostName: true, avatarUrl: true, name: true,
  address: true, hasYard: true, housingType: true, maxPets: true,
  petTypes: true, pricePerDay: true,
  isAcceptingOrders: true, status: true, description: true,
  hasOtherPets: true, nativePetInfo: true, serviceTypes: true,
  photos: true, videos: true, createdAt: true, updatedAt: true,
}

const KEYWORD_MAX_LENGTH = 50
const REGEXP_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g

function escapeRegExp(str) {
  return str.replace(REGEXP_SPECIAL_CHARS, '\\$&')
}

const handlers = {
  createHostProfile,
  updateHostProfile,
  getHostList,
  getHostDetail,
  getHostProfile,
  updateHostAcceptingOrders,
  getHostStats,
}

exports.main = async (event, context) => {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  try {
    const requireLogin = !['getHostList', 'getHostDetail'].includes(action)
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    const code = error.code || ERROR_CODES.BUSINESS
    return handleError(error, error.message, code)
  }
}

async function createHostProfile(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { hostName, realName, phone, idCard, address, housingType, hasYard, maxPets, hasOtherPets, nativePetInfo, petTypes, serviceTypes, pricePerDay, description, photos, idCardFront, idCardBack, healthCertificate, emergencyContactName, emergencyContactPhone } = event

  if (!hostName) {throw err('INVALID_PARAMS', '请填写寄养家庭名称')}
  if (!phone) {throw err('INVALID_PARAMS', '请填写手机号')}

  const existingProfiles = await db.collection('hostProfiles')
    .where({ phone, status: _.in(['active', 'pending_review']) }).count()
  if (existingProfiles.total > 0) {
    throw err('BUSINESS_ERROR', '该手机号已注册寄养家庭')
  }

  const profileData = {
    openid,
    hostName,
    realName: realName || '',
    phone,
    idCard: idCard || '',
    address: address || '',
    housingType: housingType || '',
    hasYard: hasYard || '',
    maxPets: Number(maxPets) || 0,
    hasOtherPets: hasOtherPets || '',
    nativePetInfo: nativePetInfo || '',
    petTypes: petTypes || '',
    serviceTypes: serviceTypes || [],
    pricePerDay: Number(pricePerDay) || 0,
    description: description || '',
    photos: photos || [],
    idCardFront: idCardFront || '',
    idCardBack: idCardBack || '',
    healthCertificate: healthCertificate || '',
    emergencyContactName: emergencyContactName || '',
    emergencyContactPhone: emergencyContactPhone || '',
    status: 'pending_review',
    rating: 5.0,
    isAcceptingOrders: true,
    isActive: 1,
    createdBy: auth.openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  const res = await db.collection('hostProfiles').doc(openid).set({ data: profileData })
  return handleSuccess({ id: openid }, '寄养家庭创建成功，等待管理员审核')
}

async function updateHostProfile(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { updateType, description, photos, videos } = event

  let existingResult
  try {
    existingResult = await db.collection('hostProfiles').doc(openid).get()
  } catch (e) {
    throw err('NOT_FOUND', '您尚未创建寄养家庭配置')
  }

  const updateData = { updatedAt: db.serverDate() }

  if (updateType === 'basicInfo') {
    Object.assign(updateData, filterFields(FIELD_WHITELISTS.hostBasic, event))
    if (event.hostName !== undefined && event.hostName !== null) {
      updateData.name = event.hostName
    }
  } else if (updateType === 'description') {
    if (description !== undefined && description !== null) {updateData.description = description}
    if (event.avatarUrl !== undefined && event.avatarUrl !== null) {updateData.avatarUrl = event.avatarUrl}
  } else if (photos) {
    updateData.photos = photos
  } else if (videos) {
    updateData.videos = videos
  } else {
    Object.assign(updateData, filterFields(FIELD_WHITELISTS.hostDefault, event))
  }

  if (Object.keys(updateData).length > 1) {
    await db.collection('hostProfiles').doc(openid).update({ data: updateData })
    deleteCache('host_list')
  }

  return handleSuccess(null, '更新成功')
}

async function getHostList(event) {
  const { page = 1, pageSize = 20, keyword = '', sort = 'default', filters = {} } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)
  const skip = (page - 1) * safePageSize

  const filterKey = JSON.stringify({ keyword, sort, filters })
  const cacheKey = `host_list_p${page}_s${safePageSize}_${Buffer.from(filterKey).toString('base64').slice(0, 16)}`
  const cachedList = getCache(cacheKey)
  if (cachedList) {return handleSuccess({ list: cachedList.list, total: cachedList.total, page, pageSize: safePageSize }, '获取成功')}

  const baseQuery = { status: _.in(['active', 'approved']) }

  if (keyword) {
    const safeKeyword = escapeRegExp(keyword.slice(0, KEYWORD_MAX_LENGTH))
    baseQuery.$or = [
      { hostName: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
      { address: db.RegExp({ regexp: safeKeyword, options: 'i' }) },
    ]
  }

  if (filters && filters.roomType) {
    baseQuery.roomType = filters.roomType
  }
  if (filters && filters.minPrice !== undefined) {
    baseQuery.pricePerDay = baseQuery.pricePerDay || {}
    baseQuery.pricePerDay = _.gte(Number(filters.minPrice))
  }
  if (filters && filters.maxPrice !== undefined) {
    baseQuery.pricePerDay = _.lte(Number(filters.maxPrice))
  }

  const countResult = await db.collection('hostProfiles').where(baseQuery).count()

  let sortField = 'createdAt'
  let sortOrder = 'desc'
  if (sort === 'price_asc') {
    sortField = 'pricePerDay'
    sortOrder = 'asc'
  } else if (sort === 'price_desc') {
    sortField = 'pricePerDay'
    sortOrder = 'desc'
  }

  const result = await db.collection('hostProfiles')
    .field(HOST_LIST_FIELDS)
    .where(baseQuery)
    .orderBy(sortField, sortOrder)
    .skip(skip)
    .limit(safePageSize)
    .get()

  const data = result.data.map(host => ({
    ...host,
    isAcceptingOrders: host.isAcceptingOrders !== undefined ? host.isAcceptingOrders : true,
    avatarUrl: host.avatarUrl || '/images/default-avatar.svg',
  }))

  setCache(cacheKey, { list: data, total: countResult.total }, 600)
  return handleSuccess({ list: data, total: countResult.total, page, pageSize: safePageSize, totalPages: Math.ceil(countResult.total / safePageSize) }, '获取成功')
}

async function getHostDetail(event) {
  const { hostId } = event
  if (!hostId) {throw err('INVALID_PARAMS', '缺少 hostId 参数')}

  const cacheKey = `host_detail_${hostId}`
  const cachedHost = getCache(cacheKey)
  if (cachedHost) {return handleSuccess(cachedHost, '获取成功')}

  try {
    const result = await db.collection('hostProfiles').where({ _id: hostId }).limit(1).field(HOST_DETAIL_PUBLIC_FIELDS).get()
    if (!result.data || result.data.length === 0) {
      throw err('NOT_FOUND', '未找到寄养家庭')
    }

    const hostData = result.data[0]

    if (!hostData.avatarUrl || hostData.avatarUrl === '') {
      hostData.avatarUrl = '/images/default-avatar.svg'
    }

    hostData.isAcceptingOrders = hostData.isAcceptingOrders !== undefined ? hostData.isAcceptingOrders : true

    setCache(cacheKey, hostData, 300)
    return handleSuccess(hostData, '获取成功')
  } catch (error) {
    return handleError(error, '获取寄养家庭详情失败', ERROR_CODES.DATA)
  }
}

async function getHostProfile(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  try {
    const profileResult = await db.collection('hostProfiles').doc(openid).get()

    deleteCache(`host_profile_${openid}`)
    return handleSuccess(profileResult.data, '获取成功')
  } catch (error) {
    return handleError(error, '获取寄养家庭档案失败', ERROR_CODES.DATA)
  }
}

async function updateHostAcceptingOrders(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { isAcceptingOrders } = event
  if (isAcceptingOrders === undefined) {
    throw err('INVALID_PARAMS', '缺少参数')
  }

  await db.collection('hostProfiles').doc(openid).update({
    data: { isAcceptingOrders, updatedAt: db.serverDate() },
  })

  deleteCache('host_list')
  return handleSuccess(null, '更新成功')
}

async function getHostStats(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const cacheKey = `host_stats_${openid}`
  const cachedStats = getCache(cacheKey)
  if (cachedStats) {return handleSuccess(cachedStats, '获取成功')}

  try {
    const [totalRes, completedRes, pendingRes, cancelledRes] = await Promise.all([
      db.collection('orders').where({ organizerId: openid }).count(),
      db.collection('orders').where({ organizerId: openid, status: 'completed' }).count(),
      db.collection('orders').where({ organizerId: openid, status: 'pending' }).count(),
      db.collection('orders').where({ organizerId: openid, status: 'cancelled' }).count(),
    ])

    const totalOrders = totalRes.total
    const completedOrders = completedRes.total
    const pendingOrders = pendingRes.total
    const cancellationRate = totalOrders > 0
      ? (cancelledRes.total / totalOrders * 100).toFixed(2)
      : '0.00'

    const stats = { totalOrders, completedOrders, pendingOrders, cancellationRate }
    setCache(cacheKey, stats, 300)
    return handleSuccess(stats, '获取成功')
  } catch (error) {
    return handleError(error, '获取统计数据失败', ERROR_CODES.DATA)
  }
}

// 仅供测试：暴露加密 / 双写 / 解密内部函数
// 生产路径通过 handlers 触发，不会从这里调用
if (process.env.NODE_ENV === 'test' || process.env.HOST_SERVICE_EXPOSE_INTERNALS === 'true') {
  module.exports._encryptSensitive = _encryptSensitive
  module.exports._encryptSensitiveCBC = _encryptSensitiveCBC
  module.exports._encryptDual = _encryptDual
  module.exports._decryptSensitive = _decryptSensitive
  module.exports._decryptCBC = _decryptCBC
  module.exports._getKey = _getKey
  module.exports._resetKey = () => {
    _derivedKey = null
  }
  module.exports.KEY_VERSION = KEY_VERSION
}
