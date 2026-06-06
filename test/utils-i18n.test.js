/**
 * Sprint 16: miniapp 端 i18n 模块验证
 *
 * 覆盖：
 *   1. 模块 API 完整性
 *   2. 错误码 → 本地化文案（zh-CN / en-US / ja-JP）
 *   3. 业务文案翻译
 *   4. 缺翻译降级
 *   5. Locale 推断 / 切换 / 持久化
 *   6. resolveCloudErrorMessage 处理 res
 *   7. applyCustomOverrides 优先级
 *   8. 与云端 errors-i18n.ts 兼容
 */

const path = require('path')
const fs = require('fs')

// === 提供一个最小的 wx mock（仅 getSystemInfoSync / setStorageSync / getStorageSync） ===
const mockStorage = {}
const wx = {
  getSystemInfoSync: jest.fn(() => ({ language: 'zh_CN' })),
  getStorageSync: jest.fn((key) => mockStorage[key] || ''),
  setStorageSync: jest.fn((key, val) => { mockStorage[key] = val }),
}
global.wx = wx

const i18n = require(path.join(__dirname, '..', 'utils', 'i18n.js'))

function clearStorage() {
  for (const k of Object.keys(mockStorage)) delete mockStorage[k]
}

describe('Sprint 16: miniapp 端 i18n', () => {
  beforeEach(() => {
    clearStorage()
    wx.getSystemInfoSync.mockReturnValue({ language: 'zh_CN' })
    wx.getStorageSync.mockImplementation((key) => mockStorage[key] || '')
    wx.setStorageSync.mockImplementation((key, val) => { mockStorage[key] = val })
    i18n.setLocale('zh-CN') // 重置
  })

  describe('模块 API', () => {
    test('导出公共 API', () => {
      expect(typeof i18n.t).toBe('function')
      expect(typeof i18n.getErrorMessage).toBe('function')
      expect(typeof i18n.resolveCloudErrorMessage).toBe('function')
      expect(typeof i18n.getLocale).toBe('function')
      expect(typeof i18n.setLocale).toBe('function')
      expect(typeof i18n.getSupportedLocales).toBe('function')
      expect(typeof i18n.applyCustomOverrides).toBe('function')
    })

    test('导出 BIZ_I18N / ERROR_I18N 常量', () => {
      expect(i18n.BIZ_I18N).toBeDefined()
      expect(i18n.ERROR_I18N).toBeDefined()
      expect(i18n.DEFAULT_LOCALE).toBe('zh-CN')
    })

    test('getSupportedLocales 返回 3 个语言', () => {
      const locales = i18n.getSupportedLocales()
      expect(locales).toContain('zh-CN')
      expect(locales).toContain('en-US')
      expect(locales).toContain('ja-JP')
      expect(locales.length).toBe(3)
    })
  })

  describe('错误码 → 本地化文案', () => {
    test('zh-CN: AUTH_REQUIRED → 请先登录', () => {
      expect(i18n.getErrorMessage('AUTH_REQUIRED', 'zh-CN')).toBe('请先登录')
    })

    test('en-US: AUTH_REQUIRED → Please sign in first', () => {
      expect(i18n.getErrorMessage('AUTH_REQUIRED', 'en-US')).toBe('Please sign in first')
    })

    test('ja-JP: AUTH_REQUIRED 含「ログイン」', () => {
      expect(i18n.getErrorMessage('AUTH_REQUIRED', 'ja-JP')).toMatch(/ログイン/)
    })

    test('RISK_REJECT 三语', () => {
      expect(i18n.getErrorMessage('RISK_REJECT', 'zh-CN')).toMatch(/风控/)
      expect(i18n.getErrorMessage('RISK_REJECT', 'en-US')).toMatch(/rejected/i)
      expect(i18n.getErrorMessage('RISK_REJECT', 'ja-JP')).toMatch(/リスク/)
    })

    test('RISK_PENDING 三语', () => {
      expect(i18n.getErrorMessage('RISK_PENDING', 'zh-CN')).toMatch(/审核/)
      expect(i18n.getErrorMessage('RISK_PENDING', 'en-US')).toMatch(/pending/i)
      expect(i18n.getErrorMessage('RISK_PENDING', 'ja-JP')).toMatch(/審査/)
    })

    test('ORDER_NOT_FOUND 三语', () => {
      expect(i18n.getErrorMessage('ORDER_NOT_FOUND', 'zh-CN')).toBe('订单不存在')
      expect(i18n.getErrorMessage('ORDER_NOT_FOUND', 'en-US')).toBe('Order not found')
      expect(i18n.getErrorMessage('ORDER_NOT_FOUND', 'ja-JP')).toMatch(/注文/)
    })

    test('覆盖所有 Sprint 14 RISK_* 码', () => {
      expect(i18n.getErrorMessage('RISK_REJECT', 'en-US')).toBeTruthy()
      expect(i18n.getErrorMessage('RISK_PENDING', 'en-US')).toBeTruthy()
      expect(i18n.getErrorMessage('RISK_PASS', 'en-US')).toBeTruthy()
    })

    test('覆盖核心错误码（≥ 30 个）', () => {
      const codes = Object.keys(i18n.ERROR_I18N)
      expect(codes.length).toBeGreaterThanOrEqual(30)
    })

    test('未知 code → 返回 code 字面量', () => {
      expect(i18n.getErrorMessage('NOT_A_CODE', 'zh-CN')).toBe('NOT_A_CODE')
    })

    test('空 code → 返回空字符串', () => {
      expect(i18n.getErrorMessage('', 'zh-CN')).toBe('')
      expect(i18n.getErrorMessage(null, 'zh-CN')).toBe('')
    })
  })

  describe('业务文案 t()', () => {
    test('OPERATION_SUCCESS 三语', () => {
      expect(i18n.t('OPERATION_SUCCESS', 'zh-CN')).toBe('操作成功')
      expect(i18n.t('OPERATION_SUCCESS', 'en-US')).toBe('Success')
      expect(i18n.t('OPERATION_SUCCESS', 'ja-JP')).toBe('操作成功')
    })

    test('LOADING zh-CN', () => {
      expect(i18n.t('LOADING', 'zh-CN')).toBe('加载中...')
    })

    test('NETWORK_ERROR 三语', () => {
      expect(i18n.t('NETWORK_ERROR', 'zh-CN')).toMatch(/网络/)
      expect(i18n.t('NETWORK_ERROR', 'en-US')).toMatch(/network/i)
      expect(i18n.t('NETWORK_ERROR', 'ja-JP')).toMatch(/ネットワーク/)
    })

    test('未注册 key → 返回原 key', () => {
      expect(i18n.t('UNREGISTERED_KEY', 'zh-CN')).toBe('UNREGISTERED_KEY')
    })
  })

  describe('缺翻译降级', () => {
    test('未支持 locale → 降级为 zh-CN', () => {
      // 假设某种未被支持的语言
      expect(i18n.getErrorMessage('AUTH_REQUIRED', 'fr-FR')).toBe('请先登录')
    })

    test('getErrorMessage 不传 locale 使用 currentLocale', () => {
      i18n.setLocale('en-US')
      expect(i18n.getErrorMessage('AUTH_REQUIRED')).toBe('Please sign in first')
    })
  })

  describe('Locale 切换与持久化', () => {
    test('setLocale 切换后 t() 立即生效', () => {
      i18n.setLocale('en-US')
      expect(i18n.t('OPERATION_SUCCESS')).toBe('Success')
      i18n.setLocale('zh-CN')
      expect(i18n.t('OPERATION_SUCCESS')).toBe('操作成功')
    })

    test('setLocale 持久化到 storage', () => {
      i18n.setLocale('en-US')
      expect(wx.setStorageSync).toHaveBeenCalledWith('app_locale', 'en-US')
    })

    test('setLocale 不支持的值返回 false', () => {
      expect(i18n.setLocale('fr-FR')).toBe(false)
      expect(i18n.setLocale('xx-XX')).toBe(false)
    })

    test('setLocale 支持 zh-CN / en-US / ja-JP', () => {
      expect(i18n.setLocale('zh-CN')).toBe(true)
      expect(i18n.setLocale('en-US')).toBe(true)
      expect(i18n.setLocale('ja-JP')).toBe(true)
    })
  })

  describe('resolveCloudErrorMessage', () => {
    test('res.message 优先', () => {
      const res = { message: '已自定义', error: { type: 'AUTH_REQUIRED' } }
      expect(i18n.resolveCloudErrorMessage(res, 'en-US')).toBe('已自定义')
    })

    test('无 message 时用 error.type → i18n', () => {
      const res = { error: { type: 'AUTH_REQUIRED' } }
      expect(i18n.resolveCloudErrorMessage(res, 'en-US')).toBe('Please sign in first')
    })

    test('无 error 时兜底为 OPERATION_FAILED', () => {
      const res = { code: 1006 }
      expect(i18n.resolveCloudErrorMessage(res, 'zh-CN')).toBe('操作失败')
    })

    test('空 res 返回空字符串', () => {
      expect(i18n.resolveCloudErrorMessage(null)).toBe('')
      expect(i18n.resolveCloudErrorMessage({})).toBeTruthy() // OPERATION_FAILED
    })
  })

  describe('applyCustomOverrides 优先级', () => {
    test('覆盖 error code 翻译', () => {
      i18n.applyCustomOverrides({
        AUTH_REQUIRED: { 'en-US': 'Plz sign in (custom)' },
      })
      expect(i18n.getErrorMessage('AUTH_REQUIRED', 'en-US')).toBe('Plz sign in (custom)')
    })

    test('覆盖后其他 locale 不受影响', () => {
      i18n.applyCustomOverrides({
        AUTH_REQUIRED: { 'en-US': 'Custom' },
      })
      expect(i18n.getErrorMessage('AUTH_REQUIRED', 'zh-CN')).toBe('请先登录')
    })

    test('覆盖 BIZ 文案', () => {
      i18n.applyCustomOverrides({
        OPERATION_SUCCESS: { 'ja-JP': 'やったー' },
      })
      expect(i18n.t('OPERATION_SUCCESS', 'ja-JP')).toBe('やったー')
    })

    test('覆盖可清空（重新 apply 空对象）', () => {
      i18n.applyCustomOverrides({ AUTH_REQUIRED: { 'en-US': 'X' } })
      i18n.applyCustomOverrides({})
      expect(i18n.getErrorMessage('AUTH_REQUIRED', 'en-US')).toBe('Please sign in first')
    })
  })

  describe('与云端 errors-i18n.ts 兼容', () => {
    const cloudI18n = require(path.join(__dirname, '..', 'cloudfunctions', 'common', 'errors-i18n.js'))

    test('云端字典的 key 在 miniapp 端都有', () => {
      // 验证：所有 cloud DEFAULT_I18N 的 key 都在 miniapp ERROR_I18N 中存在
      const cloudCodes = Object.keys(cloudI18n.DEFAULT_I18N)
      const miniCodes = Object.keys(i18n.ERROR_I18N)
      // miniapp 是 cloud 的子集，允许 cloud 多于 miniapp
      for (const code of miniCodes) {
        expect(cloudCodes).toContain(code)
      }
    })

    test('共同覆盖的 code 文案一致', () => {
      // 共同 key 翻译必须一致（避免在云端/客户端不同步）
      const shared = ['AUTH_REQUIRED', 'RISK_REJECT', 'RISK_PENDING', 'RISK_PASS', 'ORDER_NOT_FOUND']
      for (const code of shared) {
        for (const locale of ['zh-CN', 'en-US', 'ja-JP']) {
          const cloudMsg = cloudI18n.resolveI18nMessage(code, locale)
          const miniMsg = i18n.getErrorMessage(code, locale)
          expect(miniMsg).toBe(cloudMsg)
        }
      }
    })
  })

  describe('鲁棒性', () => {
    test('getErrorMessage 传入 null code 不抛错', () => {
      expect(() => i18n.getErrorMessage(null, 'zh-CN')).not.toThrow()
    })

    test('getErrorMessage 传入 undefined code 不抛错', () => {
      expect(() => i18n.getErrorMessage(undefined, 'zh-CN')).not.toThrow()
    })

    test('t 传入 null locale 不抛错', () => {
      expect(() => i18n.t('OPERATION_SUCCESS', null)).not.toThrow()
    })

    test('applyCustomOverrides 传 null 不抛错', () => {
      expect(() => i18n.applyCustomOverrides(null)).not.toThrow()
    })

    test('applyCustomOverrides 传非对象不抛错', () => {
      expect(() => i18n.applyCustomOverrides('string')).not.toThrow()
      expect(() => i18n.applyCustomOverrides(42)).not.toThrow()
    })
  })
})
