/**
 * cloudfunctions/common/crypto.js 单元测试
 */

const {
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
} = require('../cloudfunctions/common/crypto')

describe('crypto.js', () => {
  const PASSPHRASE = 'unit-test-passphrase-2026'

  describe('deriveKey', () => {
    test('应返回 32 字节 Buffer', () => {
      const { key, salt } = deriveKey(PASSPHRASE)
      expect(Buffer.isBuffer(key)).toBe(true)
      expect(key.length).toBe(KEY_LENGTH)
      expect(typeof salt).toBe('string')
      expect(salt.length).toBeGreaterThan(0)
    })

    test('相同 passphrase + salt 应得到相同 key（确定性）', () => {
      const a = deriveKey(PASSPHRASE, 'salt_xyz')
      const b = deriveKey(PASSPHRASE, 'salt_xyz')
      expect(a.key.equals(b.key)).toBe(true)
    })

    test('不同 salt 应得到不同 key', () => {
      const a = deriveKey(PASSPHRASE)
      const b = deriveKey(PASSPHRASE)
      expect(a.key.equals(b.key)).toBe(false)
    })

    test('空 passphrase 应抛错', () => {
      expect(() => deriveKey('')).toThrow()
      expect(() => deriveKey(null)).toThrow()
    })
  })

  describe('encrypt + decrypt 往返', () => {
    test('明文加密后应能正确解密', () => {
      const { key } = deriveKey(PASSPHRASE)
      const plaintext = '13800138000|secret_data'
      const payload = encrypt(plaintext, key)
      const decrypted = decrypt(payload, key)
      expect(decrypted).toBe(plaintext)
    })

    test('每次加密应得到不同密文（IV 随机）', () => {
      const { key } = deriveKey(PASSPHRASE)
      const a = encrypt('same_plaintext', key)
      const b = encrypt('same_plaintext', key)
      expect(a).not.toBe(b)
      expect(decrypt(a, key)).toBe('same_plaintext')
      expect(decrypt(b, key)).toBe('same_plaintext')
    })

    test('payload 格式应为三段 base64', () => {
      const { key } = deriveKey(PASSPHRASE)
      const payload = encrypt('hello', key)
      const parts = payload.split('.')
      expect(parts).toHaveLength(3)
      // iv: 12 字节 base64
      expect(Buffer.from(parts[0], 'base64').length).toBe(IV_LENGTH)
      // authTag: 16 字节 base64
      expect(Buffer.from(parts[1], 'base64').length).toBe(AUTH_TAG_LENGTH)
    })

    test('中文 / emoji 应正确加解密', () => {
      const { key } = deriveKey(PASSPHRASE)
      const text = '宠物🐶：寄养备注'
      const payload = encrypt(text, key)
      expect(decrypt(payload, key)).toBe(text)
    })

    test('篡改 ciphertext 应抛错（GCM 完整性）', () => {
      const { key } = deriveKey(PASSPHRASE)
      const payload = encrypt('original', key)
      const parts = payload.split('.')
      // 翻转密文最后一位
      const buf = Buffer.from(parts[2], 'base64')
      buf[buf.length - 1] ^= 0xff
      const tampered = [parts[0], parts[1], buf.toString('base64')].join('.')
      expect(() => decrypt(tampered, key)).toThrow()
    })

    test('错误 key 应抛错', () => {
      const { key } = deriveKey(PASSPHRASE)
      const { key: wrongKey } = deriveKey('wrong-pass')
      const payload = encrypt('data', key)
      expect(() => decrypt(payload, wrongKey)).toThrow()
    })

    test('无效 payload 格式应抛错', () => {
      const { key } = deriveKey(PASSPHRASE)
      expect(() => decrypt('only_one_part', key)).toThrow()
      expect(() => decrypt('a.b.c.d', key)).toThrow()
    })

    test('key 长度错误应抛错', () => {
      const wrongKey = Buffer.alloc(16) // 应为 32
      expect(() => encrypt('x', wrongKey)).toThrow()
    })
  })

  describe('sha256', () => {
    test('相同输入应得到相同哈希', () => {
      expect(sha256('hello')).toBe(sha256('hello'))
    })

    test('不同输入应得到不同哈希', () => {
      expect(sha256('hello')).not.toBe(sha256('world'))
    })

    test('应接受对象（JSON 序列化）', () => {
      const a = sha256({ a: 1, b: 2 })
      const b = sha256({ a: 1, b: 2 })
      expect(a).toBe(b)
    })

    test('哈希长度应为 64 hex', () => {
      expect(sha256('test').length).toBe(64)
    })
  })

  describe('hmacSha256', () => {
    test('相同输入应得到相同签名', () => {
      const a = hmacSha256('data', 'secret')
      const b = hmacSha256('data', 'secret')
      expect(a).toBe(b)
    })

    test('不同 secret 应得到不同签名', () => {
      const a = hmacSha256('data', 'secret1')
      const b = hmacSha256('data', 'secret2')
      expect(a).not.toBe(b)
    })
  })

  describe('safeEqual', () => {
    test('相同字符串应返回 true', () => {
      expect(safeEqual('abc', 'abc')).toBe(true)
    })

    test('不同字符串应返回 false', () => {
      expect(safeEqual('abc', 'xyz')).toBe(false)
    })

    test('类型不同时应返回 false', () => {
      expect(safeEqual('abc', Buffer.from('abc'))).toBe(false)
    })

    test('Buffer 比较', () => {
      expect(safeEqual(Buffer.from('x'), Buffer.from('x'))).toBe(true)
      expect(safeEqual(Buffer.from('x'), Buffer.from('y'))).toBe(false)
    })
  })

  describe('randomString', () => {
    test('默认 16 字节', () => {
      const s = randomString()
      // base64url: 每 3 字节 → 4 字符，16 字节 → 约 22 字符
      expect(s.length).toBeGreaterThan(15)
      expect(/^[A-Za-z0-9_-]+$/.test(s)).toBe(true)
    })

    test('应支持自定义长度', () => {
      expect(randomString(8).length).toBeGreaterThan(8)
    })

    test('两次生成应不同', () => {
      expect(randomString()).not.toBe(randomString())
    })
  })

  describe('常量', () => {
    test('ALGORITHM 应为 aes-256-gcm', () => {
      expect(ALGORITHM).toBe('aes-256-gcm')
    })
    test('IV_LENGTH 12, AUTH_TAG_LENGTH 16, KEY_LENGTH 32', () => {
      expect(IV_LENGTH).toBe(12)
      expect(AUTH_TAG_LENGTH).toBe(16)
      expect(KEY_LENGTH).toBe(32)
    })
  })
})
