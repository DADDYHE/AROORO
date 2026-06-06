/**
 * 加密工具（AES-256-GCM）
 *
 * 目标：
 *   1. 替代 cloudfunctions/hostService/index.js 的 AES-CBC（弱加密）
 *   2. 替代 cloudfunctions/paymentService/services/notify.js 的内嵌实现
 *   3. 统一所有敏感字段（idCard / phone / bankCard）的加解密入口
 *
 * 加密格式（v2.0）：
 *   base64(iv).base64(authTag).base64(ciphertext)
 *   12 + 16 + N 字节，分别 base64 后用 '.' 拼接
 *
 * Key 派生：
 *   scrypt(passphrase, salt, 32) —— 慢哈希，防爆破
 *
 * 兼容性：
 *   - 旧 AES-CBC 数据保留 6 个月，本模块不处理旧格式
 *   - 旧模块路径 cloudfunctions/hostService/index.js 内部仍可继续运行
 */

const crypto = require('crypto')
const { err } = require('./errors')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM 推荐 12 字节
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }

/**
 * 从口令派生 32 字节 key
 * @param {string} passphrase - 原始口令
 * @param {string} [salt] - 盐值；不传则生成并返回（用于持久化）
 * @returns {{key: Buffer, salt: string}}
 */
function deriveKey(passphrase, salt = null) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error('passphrase 不能为空')
  }
  const useSalt = salt || crypto.randomBytes(16).toString('hex')
  const key = crypto.scryptSync(passphrase, useSalt, KEY_LENGTH, SCRYPT_PARAMS)
  return { key, salt: useSalt }
}

/**
 * 加密（返回 base64.iv.base64.tag.base64.cipher）
 * @param {string} plaintext - 明文
 * @param {Buffer} key - 32 字节 key
 * @returns {string} 三段式 base64
 */
function encrypt(plaintext, key) {
  if (typeof plaintext !== 'string') {throw err('INVALID_PARAMS', 'plaintext 必须为字符串')}
  if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
    throw err('INVALID_PARAMS', `key 必须为 ${KEY_LENGTH} 字节 Buffer`)
  }
  try {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.')
  } catch (e) {
    throw err('ENCRYPT_FAILED', `加密失败：${e.message}`)
  }
}

/**
 * 解密
 * @param {string} payload - 三段式 base64
 * @param {Buffer} key
 * @returns {string} 明文
 */
function decrypt(payload, key) {
  if (typeof payload !== 'string') {throw err('INVALID_PARAMS', 'payload 必须为字符串')}
  if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
    throw err('INVALID_PARAMS', `key 必须为 ${KEY_LENGTH} 字节 Buffer`)
  }
  const parts = payload.split('.')
  if (parts.length !== 3) {throw err('INVALID_PARAMS', 'payload 格式错误（应为 iv.tag.cipher 三段）')}
  try {
    const iv = Buffer.from(parts[0], 'base64')
    const authTag = Buffer.from(parts[1], 'base64')
    const ciphertext = Buffer.from(parts[2], 'base64')
    if (iv.length !== IV_LENGTH) {throw new Error('iv 长度错误')}
    if (authTag.length !== AUTH_TAG_LENGTH) {throw new Error('authTag 长度错误')}
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  } catch (e) {
    throw err('DECRYPT_FAILED', `解密失败：${e.message}`)
  }
}

/**
 * 计算字符串 SHA-256（用于幂等键、缓存 key）
 * @param {string|object} input
 * @returns {string} hex
 */
function sha256(input) {
  const data = typeof input === 'string' ? input : JSON.stringify(input)
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex')
}

/**
 * HMAC-SHA256 签名（用于微信支付 v3 回调验签）
 * @param {string} data
 * @param {string|Buffer} secret
 * @returns {string} hex
 */
function hmacSha256(data, secret) {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex')
}

/**
 * 时间安全比较（防止时序攻击）
 * @param {string|Buffer} a
 * @param {string|Buffer} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  if (typeof a !== typeof b) {return false}
  if (typeof a === 'string') {return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))}
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) {return crypto.timingSafeEqual(a, b)}
  return false
}

/**
 * 生成随机字符串（指定长度，base64url 编码）
 * @param {number} [bytes=16]
 * @returns {string}
 */
function randomString(bytes = 16) {
  return crypto.randomBytes(bytes).toString('base64url')
}

module.exports = {
  ALGORITHM,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  KEY_LENGTH,
  deriveKey,
  encrypt,
  decrypt,
  sha256,
  hmacSha256,
  safeEqual,
  randomString,
}
