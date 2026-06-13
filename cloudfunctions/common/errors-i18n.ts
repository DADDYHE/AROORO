/**
 * cloudfunctions/common/errors-i18n.ts - 云端错误码多语言字典
 *
 * 迁移记录（Sprint 48 cleanup）：
 *   - 原始版本为 errors-i18n.js（CommonJS，未迁移）
 *   - Sprint 47 的 tsconfig.common.json 已加入本文件 include，但 .ts 源文件未补齐
 *   - Sprint 48 cleanup: 创建本 .ts 源文件，删除 .js（由 tsc 重新生成）
 *
 * 业务定位：
 *   - 与 miniapp 端 utils/i18n.js 的 ERROR_I18N 完全对齐（cloud ⊇ miniapp）
 *   - 用途：cloud functions 通过 resolveI18nMessage 转换错误码为本地化文案
 *   - 配合 scripts/build-i18n.js 生成 CDN 字典
 *
 * 编译方式：
 *   node scripts/build-common.js
 *   （依赖 tsconfig.common.json 的 include 配置）
 */

export type LocaleCode = 'zh-CN' | 'en-US' | 'ja-JP'

export type I18nEntry = Readonly<Record<LocaleCode, string>>

export type I18nDictionary = Readonly<Record<string, I18nEntry>>

export type ErrorCodeGroup =
  | 'AUTH'
  | 'RISK'
  | 'ORDER'
  | 'PAYMENT'
  | 'RESOURCE'
  | 'DATA'
  | 'SYSTEM'
  | 'COUPON'
  | 'ACTIVITY'
  | 'CATEGORY'
  | 'RESULT'

export const DEFAULT_I18N: I18nDictionary = {
  // === 通用 / 校验 ===
  INVALID_PARAMS: { 'zh-CN': '参数错误', 'en-US': 'Invalid parameters', 'ja-JP': 'パラメータエラー' },
  MISSING_REQUIRED: { 'zh-CN': '缺少必填项', 'en-US': 'Missing required fields', 'ja-JP': '必須項目が未入力です' },
  INVALID_PAYLOAD: { 'zh-CN': '数据格式错误', 'en-US': 'Invalid payload', 'ja-JP': '無効なペイロード' },
  STATE_INVALID: { 'zh-CN': '状态非法', 'en-US': 'Invalid state', 'ja-JP': '無効な状態' },
  UNKNOWN_ACTION: { 'zh-CN': '未知操作', 'en-US': 'Unknown action', 'ja-JP': '不明な操作' },
  IDEMPOTENT_REPLAY: { 'zh-CN': '请勿重复提交', 'en-US': 'Duplicate submission detected', 'ja-JP': '重複送信が検出されました' },

  // === 鉴权 ===
  AUTH_REQUIRED: { 'zh-CN': '请先登录', 'en-US': 'Please sign in first', 'ja-JP': 'ログインが必要です' },
  TOKEN_EXPIRED: { 'zh-CN': '登录已过期，请重新登录', 'en-US': 'Session expired, please sign in again', 'ja-JP': 'セッションの有効期限が切れました' },
  TOKEN_INVALID: { 'zh-CN': '登录凭证无效', 'en-US': 'Invalid authentication token', 'ja-JP': '無効な認証トークンです' },
  WX_LOGIN_FAILED: { 'zh-CN': '微信登录失败', 'en-US': 'WeChat login failed', 'ja-JP': 'WeChatログインに失敗しました' },
  PERMISSION_DENIED: { 'zh-CN': '无权限操作', 'en-US': 'Permission denied', 'ja-JP': '操作権限がありません' },
  PARTNER_REQUIRED: { 'zh-CN': '需要合作伙伴身份', 'en-US': 'Partner role required', 'ja-JP': 'パートナー権限が必要です' },
  ADMIN_REQUIRED: { 'zh-CN': '需要管理员身份', 'en-US': 'Admin role required', 'ja-JP': '管理者権限が必要です' },
  SUPER_ADMIN_REQUIRED: { 'zh-CN': '需要超级管理员身份', 'en-US': 'Super admin role required', 'ja-JP': 'スーパー管理者権限が必要です' },

  // === 资源未找到 ===
  NOT_FOUND: { 'zh-CN': '数据不存在', 'en-US': 'Resource not found', 'ja-JP': 'データが存在しません' },
  USER_NOT_FOUND: { 'zh-CN': '用户不存在', 'en-US': 'User not found', 'ja-JP': 'ユーザーが見つかりません' },
  HOST_NOT_FOUND: { 'zh-CN': '寄养家庭不存在', 'en-US': 'Host family not found', 'ja-JP': 'ホストファミリーが見つかりません' },
  PET_NOT_FOUND: { 'zh-CN': '宠物不存在', 'en-US': 'Pet not found', 'ja-JP': 'ペットが見つかりません' },
  PRODUCT_NOT_FOUND: { 'zh-CN': '商品不存在', 'en-US': 'Product not found', 'ja-JP': '商品が見つかりません' },
  COUPON_NOT_FOUND: { 'zh-CN': '优惠券不存在', 'en-US': 'Coupon not found', 'ja-JP': 'クーポンが見つかりません' },
  ACTIVITY_NOT_FOUND: { 'zh-CN': '活动不存在', 'en-US': 'Activity not found', 'ja-JP': 'アクティビティが見つかりません' },
  BANNER_NOT_FOUND: { 'zh-CN': '轮播图不存在', 'en-US': 'Banner not found', 'ja-JP': 'バナーが見つかりません' },
  ORDER_NOT_FOUND: { 'zh-CN': '订单不存在', 'en-US': 'Order not found', 'ja-JP': '注文が見つかりません' },

  // === 数据 / DB ===
  DUPLICATE_KEY: { 'zh-CN': '数据重复', 'en-US': 'Duplicate entry', 'ja-JP': 'データの重複' },
  DB_ERROR: { 'zh-CN': '数据操作失败', 'en-US': 'Database error', 'ja-JP': 'データベースエラー' },
  DATA_ERROR: { 'zh-CN': '数据异常', 'en-US': 'Data error', 'ja-JP': 'データエラー' },
  ENCRYPT_FAILED: { 'zh-CN': '加密失败', 'en-US': 'Encryption failed', 'ja-JP': '暗号化に失敗しました' },
  DECRYPT_FAILED: { 'zh-CN': '解密失败', 'en-US': 'Decryption failed', 'ja-JP': '復号化に失敗しました' },

  // === 订单 ===
  ORDER_CREATE_FAILED: { 'zh-CN': '订单创建失败', 'en-US': 'Failed to create order', 'ja-JP': '注文の作成に失敗しました' },
  ORDER_STATUS_INVALID: { 'zh-CN': '订单状态不允许此操作', 'en-US': 'Order status does not allow this action', 'ja-JP': '注文ステータスではこの操作を実行できません' },
  ORDER_ALREADY_PAID: { 'zh-CN': '订单已支付', 'en-US': 'Order already paid', 'ja-JP': '注文はすでに支払われています' },
  ORDER_ALREADY_REFUNDED: { 'zh-CN': '订单已退款', 'en-US': 'Order already refunded', 'ja-JP': '注文はすでに返金されています' },
  ORDER_TIMEOUT: { 'zh-CN': '订单已超时', 'en-US': 'Order timed out', 'ja-JP': '注文のタイムアウト' },
  REFUND_FAILED: { 'zh-CN': '退款失败', 'en-US': 'Refund failed', 'ja-JP': '返金に失敗しました' },

  // === 支付 / 微信 ===
  PAYMENT_CREATE_FAILED: { 'zh-CN': '支付下单失败', 'en-US': 'Failed to create payment', 'ja-JP': '支払いの作成に失敗しました' },
  PAYMENT_NOTIFY_INVALID: { 'zh-CN': '支付回调异常', 'en-US': 'Invalid payment notification', 'ja-JP': '支払い通知が無効です' },
  PAYMENT_AMOUNT_MISMATCH: { 'zh-CN': '支付金额不一致', 'en-US': 'Payment amount mismatch', 'ja-JP': '支払い金額が一致しません' },
  WECHAT_API_ERROR: { 'zh-CN': '微信接口异常', 'en-US': 'WeChat API error', 'ja-JP': 'WeChat APIエラー' },
  STOCK_INSUFFICIENT: { 'zh-CN': '库存不足', 'en-US': 'Insufficient stock', 'ja-JP': '在庫不足' },

  // === 系统 ===
  INTERNAL_ERROR: { 'zh-CN': '服务器内部错误', 'en-US': 'Internal server error', 'ja-JP': 'サーバー内部エラー' },
  SERVICE_UNAVAILABLE: { 'zh-CN': '服务暂不可用', 'en-US': 'Service temporarily unavailable', 'ja-JP': 'サービス一時停止中' },
  RATE_LIMITED: { 'zh-CN': '操作过于频繁，请稍后再试', 'en-US': 'Too many requests, please try again later', 'ja-JP': 'リクエストが多すぎます。しばらくしてから再度お試しください' },
  BUSINESS_ERROR: { 'zh-CN': '业务处理失败', 'en-US': 'Business error', 'ja-JP': 'ビジネス処理エラー' },

  // === 业务约束 ===
  CATEGORY_HAS_PRODUCTS: { 'zh-CN': '该分类下存在商品，无法删除', 'en-US': 'Category has products, cannot delete', 'ja-JP': 'カテゴリに商品が存在するため削除できません' },
  COUPON_LIMIT_REACHED: { 'zh-CN': '已达到领取上限', 'en-US': 'Claim limit reached', 'ja-JP': '受取上限に達しました' },
  COUPON_STATUS_INVALID: { 'zh-CN': '优惠券状态不允许此操作', 'en-US': 'Coupon status does not allow this action', 'ja-JP': 'クーポンステータスではこの操作を実行できません' },
  ACTIVITY_HAS_REGISTRATIONS: { 'zh-CN': '活动已有报名，无法删除', 'en-US': 'Activity has registrations, cannot delete', 'ja-JP': 'アクティビティに申込者が存在するため削除できません' },

  // === 风控 ===
  RISK_REJECT: { 'zh-CN': '请求被风控拒绝', 'en-US': 'Request rejected by risk control', 'ja-JP': 'リスク管理により拒否されました' },
  RISK_PENDING: { 'zh-CN': '请求已受理，待人工审核', 'en-US': 'Request received, pending manual review', 'ja-JP': 'リクエストを受理しました。人的審査待ちです' },
  RISK_PASS: { 'zh-CN': '风控检查通过', 'en-US': 'Risk check passed', 'ja-JP': 'リスクチェック合格' },

  // === 业务结果（仅 cloud 用，不与 miniapp ERROR_I18N 重叠）===
  OPERATION_SUCCESS: { 'zh-CN': '操作成功', 'en-US': 'Operation successful', 'ja-JP': '操作が成功しました' },
  NETWORK_ERROR: { 'zh-CN': '网络错误，请稍后重试', 'en-US': 'Network error, please try again later', 'ja-JP': 'ネットワークエラーが発生しました' },
}

// 错误码分组（用于 errors.all.json 分类展示 / 监控看板）
export const ERROR_CODE_GROUPS: Readonly<Record<ErrorCodeGroup, readonly string[]>> = {
  AUTH: ['AUTH_REQUIRED', 'TOKEN_EXPIRED', 'TOKEN_INVALID', 'WX_LOGIN_FAILED', 'PERMISSION_DENIED', 'PARTNER_REQUIRED', 'ADMIN_REQUIRED', 'SUPER_ADMIN_REQUIRED'],
  RISK: ['RISK_REJECT', 'RISK_PENDING', 'RISK_PASS'],
  ORDER: ['ORDER_NOT_FOUND', 'ORDER_CREATE_FAILED', 'ORDER_STATUS_INVALID', 'ORDER_ALREADY_PAID', 'ORDER_ALREADY_REFUNDED', 'ORDER_TIMEOUT', 'REFUND_FAILED'],
  PAYMENT: ['PAYMENT_CREATE_FAILED', 'PAYMENT_NOTIFY_INVALID', 'PAYMENT_AMOUNT_MISMATCH', 'WECHAT_API_ERROR', 'STOCK_INSUFFICIENT'],
  RESOURCE: ['NOT_FOUND', 'USER_NOT_FOUND', 'HOST_NOT_FOUND', 'PET_NOT_FOUND', 'PRODUCT_NOT_FOUND', 'COUPON_NOT_FOUND', 'ACTIVITY_NOT_FOUND', 'BANNER_NOT_FOUND'],
  DATA: ['DUPLICATE_KEY', 'DB_ERROR', 'DATA_ERROR', 'ENCRYPT_FAILED', 'DECRYPT_FAILED', 'INVALID_PARAMS', 'MISSING_REQUIRED', 'INVALID_PAYLOAD'],
  SYSTEM: ['INTERNAL_ERROR', 'SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'NETWORK_ERROR', 'BUSINESS_ERROR', 'STATE_INVALID', 'UNKNOWN_ACTION', 'IDEMPOTENT_REPLAY'],
  COUPON: ['COUPON_LIMIT_REACHED', 'COUPON_STATUS_INVALID'],
  ACTIVITY: ['ACTIVITY_HAS_REGISTRATIONS'],
  CATEGORY: ['CATEGORY_HAS_PRODUCTS'],
  RESULT: ['OPERATION_SUCCESS'],
}

export const SUPPORTED_LOCALES: readonly LocaleCode[] = ['zh-CN', 'en-US', 'ja-JP']
export const DEFAULT_LOCALE: LocaleCode = 'zh-CN'

/**
 * 解析指定 code 的 i18n 文案（cloud functions 内部使用）
 * - code 为空 / 非字符串：返回空串
 * - locale 不在 SUPPORTED_LOCALES：回退到 DEFAULT_LOCALE
 * - code 不在 DEFAULT_I18N：返回 code 本身（让上游识别为未知码）
 */
export function resolveI18nMessage(code: string | null | undefined, locale: string | null | undefined): string {
  if (!code || typeof code !== 'string') { return '' }
  const useLocale: LocaleCode = (SUPPORTED_LOCALES as readonly string[]).includes(locale || '')
    ? (locale as LocaleCode)
    : DEFAULT_LOCALE
  const entry = DEFAULT_I18N[code]
  if (!entry) { return code }
  return entry[useLocale] || entry[DEFAULT_LOCALE] || code
}

/**
 * 导出指定 locale 的扁平字典（{ CODE: '...' }），供 build-i18n.js 生成 CDN JSON
 */
export function exportLocaleDictionary(locale: string | null | undefined): Readonly<Record<string, string>> {
  const useLocale: LocaleCode = (SUPPORTED_LOCALES as readonly string[]).includes(locale || '')
    ? (locale as LocaleCode)
    : DEFAULT_LOCALE
  const dict: Record<string, string> = {}
  for (const code of Object.keys(DEFAULT_I18N)) {
    const entry = DEFAULT_I18N[code]
    dict[code] = (entry && entry[useLocale]) || (entry && entry[DEFAULT_LOCALE]) || code
  }
  return dict
}

// CommonJS 兼容导出（与 tsc 编译产物 _mod.exports 模式对齐）
const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  DEFAULT_I18N,
  ERROR_CODE_GROUPS,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  resolveI18nMessage,
  exportLocaleDictionary,
}
_mod.exports.default = _mod.exports

export default {
  DEFAULT_I18N,
  ERROR_CODE_GROUPS,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  resolveI18nMessage,
  exportLocaleDictionary,
}
