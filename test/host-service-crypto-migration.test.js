/**
 * cloudfunctions/hostService 加密迁移测试
 *
 * 目标：
 *   1. 验证 AES-256-GCM (v2) 加密 + 解密 双向正确
 *   2. 验证 v1 (AES-256-CBC) 仍可解密（兼容旧数据）
 *   3. 验证双写模式在开启环境变量后同时返回 v1 + v2
 *   4. 验证密文格式可被 _decryptSensitive 自动识别
 *
 * 说明：hostService/index.js 在 NODE_ENV=test 时会暴露内部函数
 */

process.env.NODE_ENV = 'test'
process.env.ENCRYPT_KEY = 'test-passphrase-1234567890' // 至少 16 字符
process.env.ENCRYPT_SALT = 'test-salt-fixed'

const path = require('path')
const hostIndexPath = path.resolve(__dirname, '../cloudfunctions/hostService/index.js')
const host = require(hostIndexPath)

describe('hostService 加密迁移 v1(CBC) → v2(GCM)', () => {
  beforeEach(() => {
    host._resetKey()
  })

  describe('v2 GCM 加密/解密', () => {
    test('加密结果以 gcm: 前缀开头', () => {
      const enc = host._encryptSensitive('13800000000')
      expect(enc.startsWith('gcm:')).toBe(true)
    })

    test('加密后可解密回原文', () => {
      const plaintext = '13800000000'
      const enc = host._encryptSensitive(plaintext)
      expect(host._decryptSensitive(enc)).toBe(plaintext)
    })

    test('同一明文两次加密结果不同（IV 随机）', () => {
      const a = host._encryptSensitive('abc')
      const b = host._encryptSensitive('abc')
      expect(a).not.toBe(b)
      expect(host._decryptSensitive(a)).toBe('abc')
      expect(host._decryptSensitive(b)).toBe('abc')
    })

    test('明文相同密文不同时篡改后应解密失败', () => {
      const enc = host._encryptSensitive('secret')
      const tampered = enc.replace(/.$/, 'A')
      expect(() => host._decryptSensitive(tampered)).toThrow()
    })

    test('空字符串应返回空', () => {
      expect(host._encryptSensitive('')).toBe('')
      expect(host._decryptSensitive('')).toBe('')
    })
  })

  describe('v1 CBC 兼容（迁移期解密）', () => {
    test('legacy_cbc: 前缀密文应能解密', () => {
      const cbcEnc = host._encryptSensitiveCBC('old-data-123')
      expect(cbcEnc.startsWith('legacy_cbc:')).toBe(true)
      expect(host._decryptSensitive(cbcEnc)).toBe('old-data-123')
    })
  })

  describe('双写模式（ENABLE_CBC_DUAL_WRITE）', () => {
    test('未开启双写时仅返回 v2', () => {
      const original = process.env.ENABLE_CBC_DUAL_WRITE
      delete process.env.ENABLE_CBC_DUAL_WRITE
      const result = host._encryptDual('idcard-110101')
      expect(result.v2).toBeDefined()
      expect(result.v2.startsWith('gcm:')).toBe(true)
      expect(result.v1).toBeUndefined()
      if (original !== undefined) {process.env.ENABLE_CBC_DUAL_WRITE = original}
    })

    test('开启双写时同时返回 v1 + v2', () => {
      const original = process.env.ENABLE_CBC_DUAL_WRITE
      process.env.ENABLE_CBC_DUAL_WRITE = 'true'
      try {
        const result = host._encryptDual('idcard-110101')
        expect(result.v1).toBeDefined()
        expect(result.v2).toBeDefined()
        expect(result.v1.startsWith('legacy_cbc:')).toBe(true)
        expect(result.v2.startsWith('gcm:')).toBe(true)
        // 两份都能解密到相同明文
        expect(host._decryptSensitive(result.v1)).toBe('idcard-110101')
        expect(host._decryptSensitive(result.v2)).toBe('idcard-110101')
      } finally {
        if (original !== undefined) {
          process.env.ENABLE_CBC_DUAL_WRITE = original
        } else {
          delete process.env.ENABLE_CBC_DUAL_WRITE
        }
      }
    })
  })

  describe('密钥派生', () => {
    test('缺少 ENCRYPT_KEY 应抛错', () => {
      const original = process.env.ENCRYPT_KEY
      delete process.env.ENCRYPT_KEY
      host._resetKey()
      try {
        expect(() => host._encryptSensitive('x')).toThrow(/ENCRYPT_KEY/)
      } finally {
        process.env.ENCRYPT_KEY = original
        host._resetKey()
      }
    })

    test('ENCRYPT_KEY 长度不足应抛错', () => {
      const original = process.env.ENCRYPT_KEY
      process.env.ENCRYPT_KEY = 'short'
      host._resetKey()
      try {
        expect(() => host._encryptSensitive('x')).toThrow(/ENCRYPT_KEY/)
      } finally {
        process.env.ENCRYPT_KEY = original
        host._resetKey()
      }
    })
  })

  describe('KEY_VERSION 常量', () => {
    test('V1_CBC 应为 1，V2_GCM 应为 2', () => {
      expect(host.KEY_VERSION.V1_CBC).toBe(1)
      expect(host.KEY_VERSION.V2_GCM).toBe(2)
    })
  })
})
