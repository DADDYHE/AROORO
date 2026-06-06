/**
 * errors-i18n.ts - 业务错误码国际化字典（Sprint 15）
 *
 * 目标：
 *   - 把 errors.ts 注册表中的 code 翻译为多语言文案
 *   - 前端按 (code, locale) 拉字典，避免在业务代码中硬编码文案
 *   - 与 toResponse() 协同：error.type → 前端 → i18n(message)
 *
 * 设计原则：
 *   - 静态字典：code → { zh-CN, en-US }
 *   - 不与 errors.ts 重复：i18n 字典独立维护，错误码注册表只含中文默认
 *   - 缺翻译时降级为中文（不抛错）
 *   - 支持覆盖：可传入自定义字典覆盖默认值
 *
 * 用法（推荐）：
 *   const { resolveI18nMessage } = require('./common/errors-i18n')
 *   const i18nMessage = resolveI18nMessage('RISK_PENDING', 'en-US')
 *   // → 'Request received, pending manual review'
 *
 * 配套前端：
 *   miniprogram/utils/i18n.ts → 按 locale 拉对应字典
 */

import type { BusinessErrorCode } from './types'

// =====================================================================
// 类型定义
// =====================================================================

/** 支持的语言 */
export type Locale = 'zh-CN' | 'en-US' | 'ja-JP'

/** 翻译字典：code → 各语言文案 */
export type I18nDictionary = Record<BusinessErrorCode, Record<Locale, string>>

/** 错误码分组（便于按功能浏览） */
export type ErrorGroup =
  | 'validation' | 'auth' | 'not_found' | 'permission'
  | 'order' | 'payment' | 'refund' | 'risk' | 'system' | 'other'

// =====================================================================
// 内置字典
// =====================================================================

/**
 * 默认字典（覆盖核心错误码）
 * 任何未在此列出的 code 都会 fallback 到 errors.ts 的中文 message
 */
export const DEFAULT_I18N: I18nDictionary = {
  // === 验证 ===
  INVALID_PARAMS: {
    'zh-CN': '参数错误',
    'en-US': 'Invalid parameters',
    'ja-JP': 'パラメータエラー',
  },
  MISSING_REQUIRED: {
    'zh-CN': '缺少必填项',
    'en-US': 'Missing required fields',
    'ja-JP': '必須項目が未入力です',
  },

  // === 认证 ===
  AUTH_REQUIRED: {
    'zh-CN': '请先登录',
    'en-US': 'Please sign in first',
    'ja-JP': 'ログインが必要です',
  },
  TOKEN_EXPIRED: {
    'zh-CN': '登录已过期，请重新登录',
    'en-US': 'Session expired, please sign in again',
    'ja-JP': 'セッションの有効期限が切れました',
  },
  TOKEN_INVALID: {
    'zh-CN': '登录凭证无效',
    'en-US': 'Invalid authentication token',
    'ja-JP': '無効な認証トークンです',
  },
  WX_LOGIN_FAILED: {
    'zh-CN': '微信登录失败',
    'en-US': 'WeChat login failed',
    'ja-JP': 'WeChatログインに失敗しました',
  },
  PERMISSION_DENIED: {
    'zh-CN': '无权限操作',
    'en-US': 'Permission denied',
    'ja-JP': '操作権限がありません',
  },
  PARTNER_REQUIRED: {
    'zh-CN': '需要合作伙伴身份',
    'en-US': 'Partner role required',
    'ja-JP': 'パートナー権限が必要です',
  },
  ADMIN_REQUIRED: {
    'zh-CN': '需要管理员身份',
    'en-US': 'Admin role required',
    'ja-JP': '管理者権限が必要です',
  },
  SUPER_ADMIN_REQUIRED: {
    'zh-CN': '需要超级管理员身份',
    'en-US': 'Super admin role required',
    'ja-JP': 'スーパー管理者権限が必要です',
  },

  // === 资源未找到 ===
  NOT_FOUND: {
    'zh-CN': '数据不存在',
    'en-US': 'Resource not found',
    'ja-JP': 'データが存在しません',
  },
  ORDER_NOT_FOUND: {
    'zh-CN': '订单不存在',
    'en-US': 'Order not found',
    'ja-JP': '注文が見つかりません',
  },
  USER_NOT_FOUND: {
    'zh-CN': '用户不存在',
    'en-US': 'User not found',
    'ja-JP': 'ユーザーが見つかりません',
  },
  HOST_NOT_FOUND: {
    'zh-CN': '寄养家庭不存在',
    'en-US': 'Host family not found',
    'ja-JP': 'ホストファミリーが見つかりません',
  },
  PET_NOT_FOUND: {
    'zh-CN': '宠物不存在',
    'en-US': 'Pet not found',
    'ja-JP': 'ペットが見つかりません',
  },
  PRODUCT_NOT_FOUND: {
    'zh-CN': '商品不存在',
    'en-US': 'Product not found',
    'ja-JP': '商品が見つかりません',
  },
  COUPON_NOT_FOUND: {
    'zh-CN': '优惠券不存在',
    'en-US': 'Coupon not found',
    'ja-JP': 'クーポンが見つかりません',
  },
  ACTIVITY_NOT_FOUND: {
    'zh-CN': '活动不存在',
    'en-US': 'Activity not found',
    'ja-JP': 'アクティビティが見つかりません',
  },
  BANNER_NOT_FOUND: {
    'zh-CN': '轮播图不存在',
    'en-US': 'Banner not found',
    'ja-JP': 'バナーが見つかりません',
  },

  // === 订单 / 支付 ===
  DUPLICATE_KEY: {
    'zh-CN': '数据重复',
    'en-US': 'Duplicate entry',
    'ja-JP': 'データの重複',
  },
  DB_ERROR: {
    'zh-CN': '数据操作失败',
    'en-US': 'Database error',
    'ja-JP': 'データベースエラー',
  },
  DATA_ERROR: {
    'zh-CN': '数据异常',
    'en-US': 'Data error',
    'ja-JP': 'データエラー',
  },
  ORDER_CREATE_FAILED: {
    'zh-CN': '订单创建失败',
    'en-US': 'Failed to create order',
    'ja-JP': '注文の作成に失敗しました',
  },
  ORDER_STATUS_INVALID: {
    'zh-CN': '订单状态不允许此操作',
    'en-US': 'Order status does not allow this action',
    'ja-JP': '注文ステータスではこの操作を実行できません',
  },
  ORDER_ALREADY_PAID: {
    'zh-CN': '订单已支付',
    'en-US': 'Order already paid',
    'ja-JP': '注文はすでに支払われています',
  },
  ORDER_ALREADY_REFUNDED: {
    'zh-CN': '订单已退款',
    'en-US': 'Order already refunded',
    'ja-JP': '注文はすでに返金されています',
  },
  ORDER_TIMEOUT: {
    'zh-CN': '订单已超时',
    'en-US': 'Order timed out',
    'ja-JP': '注文のタイムアウト',
  },
  REFUND_FAILED: {
    'zh-CN': '退款失败',
    'en-US': 'Refund failed',
    'ja-JP': '返金に失敗しました',
  },
  PAYMENT_CREATE_FAILED: {
    'zh-CN': '支付下单失败',
    'en-US': 'Failed to create payment',
    'ja-JP': '支払いの作成に失敗しました',
  },
  PAYMENT_NOTIFY_INVALID: {
    'zh-CN': '支付回调异常',
    'en-US': 'Invalid payment notification',
    'ja-JP': '支払い通知が無効です',
  },
  PAYMENT_AMOUNT_MISMATCH: {
    'zh-CN': '支付金额不一致',
    'en-US': 'Payment amount mismatch',
    'ja-JP': '支払い金額が一致しません',
  },
  WECHAT_API_ERROR: {
    'zh-CN': '微信接口异常',
    'en-US': 'WeChat API error',
    'ja-JP': 'WeChat APIエラー',
  },
  STOCK_INSUFFICIENT: {
    'zh-CN': '库存不足',
    'en-US': 'Insufficient stock',
    'ja-JP': '在庫不足',
  },

  // === 加密 ===
  ENCRYPT_FAILED: {
    'zh-CN': '加密失败',
    'en-US': 'Encryption failed',
    'ja-JP': '暗号化に失敗しました',
  },
  DECRYPT_FAILED: {
    'zh-CN': '解密失败',
    'en-US': 'Decryption failed',
    'ja-JP': '復号化に失敗しました',
  },
  INVALID_PAYLOAD: {
    'zh-CN': '数据格式错误',
    'en-US': 'Invalid payload',
    'ja-JP': '無効なペイロード',
  },

  // === 系统 ===
  INTERNAL_ERROR: {
    'zh-CN': '服务器内部错误',
    'en-US': 'Internal server error',
    'ja-JP': 'サーバー内部エラー',
  },
  SERVICE_UNAVAILABLE: {
    'zh-CN': '服务暂不可用',
    'en-US': 'Service temporarily unavailable',
    'ja-JP': 'サービス一時停止中',
  },
  RATE_LIMITED: {
    'zh-CN': '操作过于频繁，请稍后再试',
    'en-US': 'Too many requests, please try again later',
    'ja-JP': 'リクエストが多すぎます。しばらくしてから再度お試しください',
  },
  IDEMPOTENT_REPLAY: {
    'zh-CN': '请勿重复提交',
    'en-US': 'Duplicate submission detected',
    'ja-JP': '重複送信が検出されました',
  },
  UNKNOWN_ACTION: {
    'zh-CN': '未知操作',
    'en-US': 'Unknown action',
    'ja-JP': '不明な操作',
  },

  // === 业务 ===
  STATE_INVALID: {
    'zh-CN': '状态非法',
    'en-US': 'Invalid state',
    'ja-JP': '無効な状態',
  },
  CATEGORY_HAS_PRODUCTS: {
    'zh-CN': '该分类下存在商品，无法删除',
    'en-US': 'Category has products, cannot delete',
    'ja-JP': 'カテゴリに商品が存在するため削除できません',
  },
  COUPON_LIMIT_REACHED: {
    'zh-CN': '已达到领取上限',
    'en-US': 'Claim limit reached',
    'ja-JP': '受取上限に達しました',
  },
  COUPON_STATUS_INVALID: {
    'zh-CN': '优惠券状态不允许此操作',
    'en-US': 'Coupon status does not allow this action',
    'ja-JP': 'クーポンステータスではこの操作を実行できません',
  },
  ACTIVITY_HAS_REGISTRATIONS: {
    'zh-CN': '活动已有报名，无法删除',
    'en-US': 'Activity has registrations, cannot delete',
    'ja-JP': 'アクティビティに申込者が存在するため削除できません',
  },
  BUSINESS_ERROR: {
    'zh-CN': '业务处理失败',
    'en-US': 'Business error',
    'ja-JP': 'ビジネス処理エラー',
  },

  // === 风控（Sprint 14） ===
  RISK_REJECT: {
    'zh-CN': '请求被风控拒绝',
    'en-US': 'Request rejected by risk control',
    'ja-JP': 'リスク管理により拒否されました',
  },
  RISK_PENDING: {
    'zh-CN': '请求已受理，待人工审核',
    'en-US': 'Request received, pending manual review',
    'ja-JP': 'リクエストを受理しました。人的審査待ちです',
  },
  RISK_PASS: {
    'zh-CN': '风控检查通过',
    'en-US': 'Risk check passed',
    'ja-JP': 'リスクチェック合格',
  },
}

// =====================================================================
// 错误码分组（用于按功能浏览）
// =====================================================================

/** 错误码 → 业务分组（用于运营后台按组过滤） */
export const ERROR_CODE_GROUPS: Record<BusinessErrorCode, ErrorGroup> = {
  INVALID_PARAMS: 'validation',
  MISSING_REQUIRED: 'validation',
  AUTH_REQUIRED: 'auth',
  TOKEN_EXPIRED: 'auth',
  TOKEN_INVALID: 'auth',
  WX_LOGIN_FAILED: 'auth',
  PERMISSION_DENIED: 'permission',
  PARTNER_REQUIRED: 'permission',
  ADMIN_REQUIRED: 'permission',
  SUPER_ADMIN_REQUIRED: 'permission',
  NOT_FOUND: 'not_found',
  ORDER_NOT_FOUND: 'not_found',
  USER_NOT_FOUND: 'not_found',
  HOST_NOT_FOUND: 'not_found',
  PET_NOT_FOUND: 'not_found',
  PRODUCT_NOT_FOUND: 'not_found',
  COUPON_NOT_FOUND: 'not_found',
  ACTIVITY_NOT_FOUND: 'not_found',
  BANNER_NOT_FOUND: 'not_found',
  DUPLICATE_KEY: 'system',
  DB_ERROR: 'system',
  DATA_ERROR: 'system',
  ORDER_CREATE_FAILED: 'order',
  ORDER_STATUS_INVALID: 'order',
  ORDER_ALREADY_PAID: 'order',
  ORDER_ALREADY_REFUNDED: 'refund',
  ORDER_TIMEOUT: 'order',
  REFUND_FAILED: 'refund',
  PAYMENT_CREATE_FAILED: 'payment',
  PAYMENT_NOTIFY_INVALID: 'payment',
  PAYMENT_AMOUNT_MISMATCH: 'payment',
  WECHAT_API_ERROR: 'payment',
  STOCK_INSUFFICIENT: 'order',
  ENCRYPT_FAILED: 'system',
  DECRYPT_FAILED: 'system',
  INVALID_PAYLOAD: 'system',
  INTERNAL_ERROR: 'system',
  SERVICE_UNAVAILABLE: 'system',
  RATE_LIMITED: 'system',
  IDEMPOTENT_REPLAY: 'system',
  UNKNOWN_ACTION: 'other',
  STATE_INVALID: 'other',
  CATEGORY_HAS_PRODUCTS: 'other',
  COUPON_LIMIT_REACHED: 'other',
  COUPON_STATUS_INVALID: 'other',
  ACTIVITY_HAS_REGISTRATIONS: 'other',
  BUSINESS_ERROR: 'other',
  RISK_REJECT: 'risk',
  RISK_PENDING: 'risk',
  RISK_PASS: 'risk',
}

// =====================================================================
// 解析函数
// =====================================================================

/**
 * 按 code + locale 解析本地化文案
 * 优先级：
 *   1. customOverrides[code]?.[locale]（最高）
 *   2. DEFAULT_I18N[code]?.[locale]
 *   3. 降级为 zh-CN（中文默认）
 *   4. 再次降级为 code 字面量
 */
export function resolveI18nMessage(
  code: BusinessErrorCode,
  locale: Locale = 'zh-CN',
  customOverrides?: Partial<Record<BusinessErrorCode, Partial<Record<Locale, string>>>>
): string {
  // 1. custom overrides
  if (customOverrides?.[code]?.[locale]) {
    return customOverrides[code]![locale]!
  }
  // 2. default dictionary
  if (DEFAULT_I18N[code]?.[locale]) {
    return DEFAULT_I18N[code][locale]
  }
  // 3. fallback to zh-CN
  if (DEFAULT_I18N[code]?.['zh-CN']) {
    return DEFAULT_I18N[code]['zh-CN']
  }
  // 4. literal code
  return code
}

/**
 * 批量获取某个 locale 下的全部翻译（用于前端构建期注入）
 */
export function exportLocaleDictionary(
  locale: Locale,
  customOverrides?: Partial<Record<BusinessErrorCode, Partial<Record<Locale, string>>>>
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const code of Object.keys(DEFAULT_I18N) as BusinessErrorCode[]) {
    result[code] = resolveI18nMessage(code, locale, customOverrides)
  }
  return result
}

/**
 * 按 group 过滤错误码（用于按功能浏览）
 */
export function getCodesByGroup(group: ErrorGroup): BusinessErrorCode[] {
  return (Object.keys(ERROR_CODE_GROUPS) as BusinessErrorCode[])
    .filter(code => ERROR_CODE_GROUPS[code] === group)
}
