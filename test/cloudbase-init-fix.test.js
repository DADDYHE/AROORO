/**
 * cloudbase.js 修复验证测试
 *
 * 验证以下修复：
 * 1. 模块加载时不会因缺少环境变量而崩溃（throw 已从模块顶层移入函数内部）
 * 2. getCloudbase() 真正懒初始化（不在模块加载时调用）
 * 3. getCloudbase() 按 CLOUDBASE_USE_API_KEY 分支分别校验对应环境变量
 * 4. initializeAppSecret() / initializeApiKey() 各自校验对应环境变量
 */

// Mock logger（jest.mock 会被提升，必须用字符串路径）
jest.mock('../cloudfunctions/common/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}))

describe('cloudbase.js 修复验证', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    // 清除所有相关环境变量
    delete process.env.CLOUDBASE_SECRET
    delete process.env.CLOUDBASE_API_KEY
    delete process.env.CLOUDBASE_USE_API_KEY
    delete process.env.CLOUDBASE_APPID
    delete process.env.CLOUDBASE_ENV
    delete process.env.CLOUDBASE_BASE_URL
    process.env.NODE_ENV = 'test'
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('模块加载安全性', () => {
    test('缺少 CLOUDBASE_SECRET 和 CLOUDBASE_API_KEY 时模块不应崩溃', () => {
      // 旧代码在这里会 throw，导致整个云函数进程崩溃
      expect(() => {
        require('../cloudfunctions/common/cloudbase')
      }).not.toThrow()
    })

    test('模块导出三个函数', () => {
      const mod = require('../cloudfunctions/common/cloudbase')
      expect(typeof mod.getCloudbase).toBe('function')
      expect(typeof mod.initializeAppSecret).toBe('function')
      expect(typeof mod.initializeApiKey).toBe('function')
    })
  })

  describe('getCloudbase() 懒初始化', () => {
    test('默认模式（AppSecret）缺少 CLOUDBASE_SECRET 时应 throw', () => {
      const mod = require('../cloudfunctions/common/cloudbase')
      expect(() => mod.getCloudbase()).toThrow('CLOUDBASE_SECRET 环境变量未配置')
    })

    test('默认模式配置 CLOUDBASE_SECRET 后应成功初始化', () => {
      process.env.CLOUDBASE_SECRET = 'test-secret-value'
      const mod = require('../cloudfunctions/common/cloudbase')
      const sdk = mod.getCloudbase()
      expect(sdk).toBeDefined()
      expect(sdk._type).toBe('app-secret-sdk')
    })

    test('API Key 模式缺少 CLOUDBASE_API_KEY 时应 throw', () => {
      process.env.CLOUDBASE_USE_API_KEY = 'true'
      const mod = require('../cloudfunctions/common/cloudbase')
      expect(() => mod.getCloudbase()).toThrow('CLOUDBASE_API_KEY 环境变量未配置')
    })

    test('API Key 模式配置 CLOUDBASE_API_KEY 后应成功初始化', () => {
      process.env.CLOUDBASE_USE_API_KEY = 'true'
      process.env.CLOUDBASE_API_KEY = 'test-api-key-value'
      const mod = require('../cloudfunctions/common/cloudbase')
      const sdk = mod.getCloudbase()
      expect(sdk).toBeDefined()
      expect(sdk._type).toBe('api-key-sdk')
    })

    test('API Key 模式不需要 CLOUDBASE_SECRET', () => {
      process.env.CLOUDBASE_USE_API_KEY = 'true'
      process.env.CLOUDBASE_API_KEY = 'test-api-key-value'
      // 不设置 CLOUDBASE_SECRET
      const mod = require('../cloudfunctions/common/cloudbase')
      expect(() => mod.getCloudbase()).not.toThrow()
    })

    test('默认模式不需要 CLOUDBASE_API_KEY', () => {
      process.env.CLOUDBASE_SECRET = 'test-secret-value'
      // 不设置 CLOUDBASE_API_KEY
      const mod = require('../cloudfunctions/common/cloudbase')
      expect(() => mod.getCloudbase()).not.toThrow()
    })

    test('单例模式：多次调用返回同一实例', () => {
      process.env.CLOUDBASE_SECRET = 'test-secret-value'
      const mod = require('../cloudfunctions/common/cloudbase')
      const sdk1 = mod.getCloudbase()
      const sdk2 = mod.getCloudbase()
      expect(sdk1).toBe(sdk2)
    })
  })

  describe('initializeAppSecret() 独立校验', () => {
    test('缺少 CLOUDBASE_SECRET 时应 throw', () => {
      const mod = require('../cloudfunctions/common/cloudbase')
      expect(() => mod.initializeAppSecret()).toThrow('CLOUDBASE_SECRET 环境变量未配置')
    })

    test('配置 CLOUDBASE_SECRET 后应成功', () => {
      process.env.CLOUDBASE_SECRET = 'test-secret-value'
      const mod = require('../cloudfunctions/common/cloudbase')
      const sdk = mod.initializeAppSecret()
      expect(sdk._type).toBe('app-secret-sdk')
    })
  })

  describe('initializeApiKey() 独立校验', () => {
    test('缺少 CLOUDBASE_API_KEY 时应 throw', () => {
      const mod = require('../cloudfunctions/common/cloudbase')
      expect(() => mod.initializeApiKey()).toThrow('CLOUDBASE_API_KEY 环境变量未配置')
    })

    test('配置 CLOUDBASE_API_KEY 后应成功', () => {
      process.env.CLOUDBASE_API_KEY = 'test-api-key-value'
      const mod = require('../cloudfunctions/common/cloudbase')
      const sdk = mod.initializeApiKey()
      expect(sdk._type).toBe('api-key-sdk')
    })
  })
})
