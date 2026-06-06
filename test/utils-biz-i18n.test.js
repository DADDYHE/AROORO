/**
 * Sprint 16: 业务文案 i18n（商品 / 活动 / Banner / 支付 / 寄养）
 *
 * 覆盖：
 *   1. 商品域 11 个文案 PRODUCT_* 三语对齐
 *   2. 活动域 16 个文案 ACTIVITY_* 三语对齐
 *   3. 轮播图 3 个文案 BANNER_* 三语对齐
 *   4. 支付 / 订单 6 个文案 PAYMENT_ ORDER_ COUPON_ 三类
 *   5. 寄养 / 上门 4 个文案 DATE_ ADDRESS_ LOAD_ 等
 *   6. 字典总条目 ≥ 50 条业务文案
 *   7. 与云端 errors-i18n.ts 字典无冲突（同名 key 文案一致）
 *   8. CDN 预编译 JSON 文件含新增业务文案
 */

const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const DIST_DIR = path.join(ROOT, 'dist', 'i18n')
const MINI_I18N_PATH = path.join(ROOT, 'utils', 'i18n.js')
const CLOUD_I18N_PATH = path.join(ROOT, 'cloudfunctions', 'common', 'errors-i18n.js')

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return null }
}

// 提供一个最小的 wx mock
const mockStorage = {}
global.wx = {
  getSystemInfoSync: () => ({ language: 'zh_CN' }),
  getStorageSync: (key) => mockStorage[key] || '',
  setStorageSync: (key, val) => { mockStorage[key] = val },
}
const i18n = require(MINI_I18N_PATH)
const cloudI18n = require(CLOUD_I18N_PATH)

describe('Sprint 16: 业务文案 i18n（商品 / 活动 / Banner）', () => {
  describe('商品域（mall）11 个文案', () => {
    const PRODUCT_KEYS = [
      'PRODUCT_LOAD_FAILED',
      'PRODUCT_INFO_INVALID',
      'PRODUCT_OUT_OF_STOCK',
      'PRODUCT_OFF_SHELF',
      'PRODUCT_SELECT_REQUIRED',
      'PRODUCT_ADD_TO_CART',
      'PRODUCT_INVALID_CLEARED',
      'PRODUCT_CART_EMPTY',
      'PRODUCT_TOTAL_LABEL',
      'PRODUCT_GROUP_BUY_PRICE',
      'PRODUCT_STOCK_LABEL',
      'PRODUCT_DETAIL_TITLE',
    ]

    test('PRODUCT_* 在 BIZ_I18N 中存在（≥ 12 个）', () => {
      const productKeys = Object.keys(i18n.BIZ_I18N).filter(k => k.startsWith('PRODUCT_'))
      expect(productKeys.length).toBeGreaterThanOrEqual(12)
      for (const k of PRODUCT_KEYS) {
        expect(i18n.BIZ_I18N[k]).toBeDefined()
      }
    })

    test('PRODUCT_OUT_OF_STOCK 三语', () => {
      expect(i18n.t('PRODUCT_OUT_OF_STOCK', 'zh-CN')).toBe('商品已售罄')
      expect(i18n.t('PRODUCT_OUT_OF_STOCK', 'en-US')).toBe('Out of stock')
      expect(i18n.t('PRODUCT_OUT_OF_STOCK', 'ja-JP')).toBe('在庫切れ')
    })

    test('PRODUCT_OFF_SHELF 三语', () => {
      expect(i18n.t('PRODUCT_OFF_SHELF', 'zh-CN')).toBe('商品已下架')
      expect(i18n.t('PRODUCT_OFF_SHELF', 'en-US')).toMatch(/removed/i)
      expect(i18n.t('PRODUCT_OFF_SHELF', 'ja-JP')).toMatch(/削除/)
    })

    test('PRODUCT_LOAD_FAILED 三语', () => {
      expect(i18n.t('PRODUCT_LOAD_FAILED', 'zh-CN')).toMatch(/商品/)
      expect(i18n.t('PRODUCT_LOAD_FAILED', 'en-US')).toMatch(/product/i)
      expect(i18n.t('PRODUCT_LOAD_FAILED', 'ja-JP')).toMatch(/商品/)
    })

    test('PRODUCT_DETAIL_TITLE 导航栏标题', () => {
      expect(i18n.t('PRODUCT_DETAIL_TITLE', 'zh-CN')).toBe('商品详情')
      expect(i18n.t('PRODUCT_DETAIL_TITLE', 'en-US')).toBe('Product Details')
      expect(i18n.t('PRODUCT_DETAIL_TITLE', 'ja-JP')).toBe('商品詳細')
    })
  })

  describe('活动域（activity）16 个文案', () => {
    const ACTIVITY_KEYS = [
      'ACTIVITY_LIST_TITLE',
      'ACTIVITY_DETAIL_TITLE',
      'ACTIVITY_MY_TITLE',
      'ACTIVITY_EMPTY_TITLE',
      'ACTIVITY_EMPTY_DESC',
      'ACTIVITY_JOIN_NOW',
      'ACTIVITY_REGISTRATION_STOPPED',
      'ACTIVITY_ENDED',
      'ACTIVITY_JOINED',
      'ACTIVITY_EXPIRED_PAYMENT',
      'ACTIVITY_REGISTRATION_SUCCESS',
      'ACTIVITY_REGISTRATION_FAILED',
      'ACTIVITY_PARTICIPANT_REQUIRED',
      'ACTIVITY_PHONE_REQUIRED',
      'ACTIVITY_PET_INFO_REQUIRED',
      'ACTIVITY_FRIEND_ADDED',
      'ACTIVITY_FRIEND_UPDATED',
      'ACTIVITY_SUBMITTING',
      'ACTIVITY_FRIEND_REGISTRATION',
      'ACTIVITY_OUTDOOR_SOCIAL',
    ]

    test('ACTIVITY_* 在 BIZ_I18N 中存在（≥ 20 个）', () => {
      const activityKeys = Object.keys(i18n.BIZ_I18N).filter(k => k.startsWith('ACTIVITY_'))
      expect(activityKeys.length).toBeGreaterThanOrEqual(20)
      for (const k of ACTIVITY_KEYS) {
        expect(i18n.BIZ_I18N[k]).toBeDefined()
      }
    })

    test('ACTIVITY_JOIN_NOW 报名按钮三语', () => {
      expect(i18n.t('ACTIVITY_JOIN_NOW', 'zh-CN')).toBe('立即报名')
      expect(i18n.t('ACTIVITY_JOIN_NOW', 'en-US')).toBe('Join Now')
      expect(i18n.t('ACTIVITY_JOIN_NOW', 'ja-JP')).toMatch(/申込/)
    })

    test('ACTIVITY_REGISTRATION_STOPPED 状态三语', () => {
      expect(i18n.t('ACTIVITY_REGISTRATION_STOPPED', 'zh-CN')).toBe('已停止报名')
      expect(i18n.t('ACTIVITY_REGISTRATION_STOPPED', 'en-US')).toMatch(/closed/i)
      expect(i18n.t('ACTIVITY_REGISTRATION_STOPPED', 'ja-JP')).toMatch(/終了/)
    })

    test('ACTIVITY_ENDED 状态三语', () => {
      expect(i18n.t('ACTIVITY_ENDED', 'zh-CN')).toBe('已结束')
      expect(i18n.t('ACTIVITY_ENDED', 'en-US')).toBe('Ended')
      expect(i18n.t('ACTIVITY_ENDED', 'ja-JP')).toBe('終了')
    })

    test('ACTIVITY_JOINED 状态三语', () => {
      expect(i18n.t('ACTIVITY_JOINED', 'zh-CN')).toBe('已报名')
      expect(i18n.t('ACTIVITY_JOINED', 'en-US')).toBe('Registered')
      expect(i18n.t('ACTIVITY_JOINED', 'ja-JP')).toMatch(/申込/)
    })

    test('ACTIVITY_REGISTRATION_SUCCESS/FAILED 反馈', () => {
      expect(i18n.t('ACTIVITY_REGISTRATION_SUCCESS', 'zh-CN')).toBe('报名成功')
      expect(i18n.t('ACTIVITY_REGISTRATION_SUCCESS', 'en-US')).toMatch(/successful/i)
      expect(i18n.t('ACTIVITY_REGISTRATION_FAILED', 'zh-CN')).toBe('报名失败')
      expect(i18n.t('ACTIVITY_REGISTRATION_FAILED', 'en-US')).toMatch(/failed/i)
    })

    test('ACTIVITY_EMPTY_TITLE + ACTIVITY_EMPTY_DESC 缺省页文案', () => {
      expect(i18n.t('ACTIVITY_EMPTY_TITLE', 'zh-CN')).toBe('暂无活动')
      expect(i18n.t('ACTIVITY_EMPTY_DESC', 'zh-CN')).toMatch(/精彩/)
      expect(i18n.t('ACTIVITY_EMPTY_TITLE', 'en-US')).toMatch(/No /i)
      expect(i18n.t('ACTIVITY_EMPTY_DESC', 'en-US')).toMatch(/coming soon/i)
    })

    test('ACTIVITY_*_REQUIRED 表单校验文案', () => {
      expect(i18n.t('ACTIVITY_PARTICIPANT_REQUIRED', 'zh-CN')).toMatch(/参加人数/)
      expect(i18n.t('ACTIVITY_PHONE_REQUIRED', 'zh-CN')).toMatch(/联系电话/)
      expect(i18n.t('ACTIVITY_PET_INFO_REQUIRED', 'zh-CN')).toMatch(/宠物/)
    })
  })

  describe('轮播图（Banner）3 个文案', () => {
    test('BANNER_LOAD_FAILED 三语', () => {
      expect(i18n.t('BANNER_LOAD_FAILED', 'zh-CN')).toMatch(/轮播图/)
      expect(i18n.t('BANNER_LOAD_FAILED', 'en-US')).toMatch(/banner/i)
      expect(i18n.t('BANNER_LOAD_FAILED', 'ja-JP')).toMatch(/バナー/)
    })

    test('BANNER_PLACEHOLDER_TITLE + DESC 兜底', () => {
      expect(i18n.t('BANNER_PLACEHOLDER_TITLE', 'zh-CN')).toBe('精彩推荐')
      expect(i18n.t('BANNER_PLACEHOLDER_TITLE', 'en-US')).toBe('Featured')
      expect(i18n.t('BANNER_PLACEHOLDER_DESC', 'zh-CN')).toMatch(/更多/)
      expect(i18n.t('BANNER_PLACEHOLDER_DESC', 'en-US')).toMatch(/coming/i)
    })
  })

  describe('支付 / 订单 6 个文案', () => {
    test('PAYMENT_SUCCESS 三语', () => {
      expect(i18n.t('PAYMENT_SUCCESS', 'zh-CN')).toBe('支付成功')
      expect(i18n.t('PAYMENT_SUCCESS', 'en-US')).toBe('Payment successful')
      expect(i18n.t('PAYMENT_SUCCESS', 'ja-JP')).toMatch(/完了/)
    })

    test('PAYMENT_CANCELLED 三语', () => {
      expect(i18n.t('PAYMENT_CANCELLED', 'zh-CN')).toBe('已取消支付')
      expect(i18n.t('PAYMENT_CANCELLED', 'en-US')).toBe('Payment cancelled')
      expect(i18n.t('PAYMENT_CANCELLED', 'ja-JP')).toMatch(/キャンセル/)
    })

    test('PAYMENT_FAILED 三语', () => {
      expect(i18n.t('PAYMENT_FAILED', 'zh-CN')).toBe('支付失败')
      expect(i18n.t('PAYMENT_FAILED', 'en-US')).toBe('Payment failed')
      expect(i18n.t('PAYMENT_FAILED', 'ja-JP')).toMatch(/失敗/)
    })

    test('ORDER_PLACE_SUCCESS/FAILED 反馈', () => {
      expect(i18n.t('ORDER_PLACE_SUCCESS', 'zh-CN')).toBe('下单成功')
      expect(i18n.t('ORDER_PLACE_FAILED', 'zh-CN')).toBe('下单失败')
      expect(i18n.t('ORDER_PLACE_SUCCESS', 'en-US')).toBe('Order placed')
      expect(i18n.t('ORDER_PLACE_FAILED', 'en-US')).toMatch(/failed/i)
    })

    test('PAYMENT_REQUIRED_ADDRESS 收货地址校验', () => {
      expect(i18n.t('PAYMENT_REQUIRED_ADDRESS', 'zh-CN')).toMatch(/收货地址/)
      expect(i18n.t('PAYMENT_REQUIRED_ADDRESS', 'en-US')).toMatch(/address/i)
    })

    test('COUPON_LOCK_FAILED 三语', () => {
      expect(i18n.t('COUPON_LOCK_FAILED', 'zh-CN')).toMatch(/优惠券/)
      expect(i18n.t('COUPON_LOCK_FAILED', 'en-US')).toMatch(/coupon/i)
    })
  })

  describe('寄养 / 上门 4 个文案', () => {
    test('DATE_REQUIRED 三语', () => {
      expect(i18n.t('DATE_REQUIRED', 'zh-CN')).toBe('请选择日期')
      expect(i18n.t('DATE_REQUIRED', 'en-US')).toMatch(/date/i)
      expect(i18n.t('DATE_REQUIRED', 'ja-JP')).toMatch(/日付/)
    })

    test('ADDRESS_REQUIRED 三语', () => {
      expect(i18n.t('ADDRESS_REQUIRED', 'zh-CN')).toBe('请选择服务地址')
      expect(i18n.t('ADDRESS_REQUIRED', 'en-US')).toMatch(/address/i)
    })

    test('INVALID_PARAMS 三语', () => {
      expect(i18n.t('INVALID_PARAMS', 'zh-CN')).toBe('参数错误')
      expect(i18n.t('INVALID_PARAMS', 'en-US')).toBe('Invalid parameters')
    })

    test('LOAD_FAILED 三语', () => {
      expect(i18n.t('LOAD_FAILED', 'zh-CN')).toBe('加载失败')
      expect(i18n.t('LOAD_FAILED', 'en-US')).toBe('Failed to load')
    })
  })

  describe('字典完整性', () => {
    test('BIZ_I18N 总条目 ≥ 50', () => {
      const keys = Object.keys(i18n.BIZ_I18N)
      expect(keys.length).toBeGreaterThanOrEqual(50)
    })

    test('每个 biz key 含三语且都非空', () => {
      for (const [key, dict] of Object.entries(i18n.BIZ_I18N)) {
        for (const locale of ['zh-CN', 'en-US', 'ja-JP']) {
          expect(typeof dict[locale]).toBe('string')
          expect(dict[locale].length).toBeGreaterThan(0)
        }
      }
    })

    test('按业务域分组的 key 都存在', () => {
      const allKeys = Object.keys(i18n.BIZ_I18N)
      // 至少有 4 个域
      const domains = new Set()
      for (const k of allKeys) {
        const m = k.match(/^([A-Z]+)_/)
        if (m) domains.add(m[1])
      }
      expect(domains.has('PRODUCT')).toBe(true)
      expect(domains.has('ACTIVITY')).toBe(true)
      expect(domains.has('BANNER')).toBe(true)
      expect(domains.has('PAYMENT')).toBe(true)
    })
  })

  describe('与云端字典无冲突（同名 key 一致）', () => {
    test('INVALID_PARAMS / TOKEN_INVALID / RISK_REJECT 等交集 key 文案一致', () => {
      const shared = [
        'INVALID_PARAMS',
        'MISSING_REQUIRED',
        'AUTH_REQUIRED',
        'PERMISSION_DENIED',
        'NOT_FOUND',
        'RISK_REJECT',
        'RISK_PENDING',
        'RISK_PASS',
      ]
      for (const key of shared) {
        for (const locale of ['zh-CN', 'en-US', 'ja-JP']) {
          // miniapp 端使用 ERROR_I18N（应与云端一致）
          expect(i18n.getErrorMessage(key, locale)).toBe(cloudI18n.resolveI18nMessage(key, locale))
        }
      }
    })
  })

  describe('CDN 预编译 JSON 含业务文案', () => {
    test('merged.zh-CN.json 含 PRODUCT_OUT_OF_STOCK', () => {
      const dict = readJsonSafe(path.join(DIST_DIR, 'merged.zh-CN.json'))
      expect(dict.PRODUCT_OUT_OF_STOCK).toBe('商品已售罄')
    })

    test('merged.en-US.json 含 ACTIVITY_JOIN_NOW', () => {
      const dict = readJsonSafe(path.join(DIST_DIR, 'merged.en-US.json'))
      expect(dict.ACTIVITY_JOIN_NOW).toBe('Join Now')
    })

    test('merged.ja-JP.json 含 BANNER_LOAD_FAILED', () => {
      const dict = readJsonSafe(path.join(DIST_DIR, 'merged.ja-JP.json'))
      expect(dict.BANNER_LOAD_FAILED).toMatch(/バナー/)
    })

    test('merged.*.json 业务文案数 ≥ 50', () => {
      const merged = readJsonSafe(path.join(DIST_DIR, 'merged.zh-CN.json'))
      const bizCount = Object.keys(merged).filter(k => !cloudI18n.DEFAULT_I18N[k]).length
      expect(bizCount).toBeGreaterThanOrEqual(50)
    })

    test('biz.*.json 各含完整业务文案', () => {
      const bizZh = readJsonSafe(path.join(DIST_DIR, 'biz.zh-CN.json'))
      const bizEn = readJsonSafe(path.join(DIST_DIR, 'biz.en-US.json'))
      const bizJa = readJsonSafe(path.join(DIST_DIR, 'biz.ja-JP.json'))
      expect(Object.keys(bizZh).length).toBeGreaterThanOrEqual(50)
      expect(Object.keys(bizEn).length).toBeGreaterThanOrEqual(50)
      expect(Object.keys(bizJa).length).toBeGreaterThanOrEqual(50)
      expect(bizZh.PRODUCT_OUT_OF_STOCK).toBe('商品已售罄')
      expect(bizEn.ACTIVITY_JOIN_NOW).toBe('Join Now')
      expect(bizJa.BANNER_LOAD_FAILED).toMatch(/バナー/)
    })
  })

  describe('缺翻译降级', () => {
    test('业务文案在不支持 locale 时降级为 zh-CN', () => {
      // mock 一个新 locale 不在字典中：fr-FR
      // 行为是 fallback 到 zh-CN（通过 _currentLocale 不被支持时返回 DEFAULT_LOCALE）
      // 但 locale 作为参数传入时不应降级（保持参数 locale 不变）
      // → BIZ_I18N.PRODUCT_OUT_OF_STOCK['fr-FR'] 不存在，应 fallback 到 zh-CN
      expect(i18n.t('PRODUCT_OUT_OF_STOCK', 'fr-FR')).toBe('商品已售罄')
      expect(i18n.t('ACTIVITY_JOIN_NOW', 'fr-FR')).toBe('立即报名')
    })

    test('未注册业务 key → 返回原 key', () => {
      expect(i18n.t('UNREGISTERED_BIZ_KEY', 'zh-CN')).toBe('UNREGISTERED_BIZ_KEY')
    })
  })
})
