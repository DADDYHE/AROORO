/**
 * Sprint 16: 微信小程序端 i18n 工具
 *
 * 目标：
 *   1. 让小程序可直接把 (error.type, locale) 翻译为本地化文案
 *   2. 内置精简字典：覆盖核心错误码（约 35 个）与高频业务文案
 *   3. 自动从系统语言推断 locale（zh-CN / en-US / ja-JP）
 *   4. 缺翻译时降级为 zh-CN → code 字面量
 *   5. 与云端 errors-i18n.ts 完全兼容（同一 code 体系）
 *   6. 支持 CDN 拉取合并字典（loadFromCdn），运营可热更新
 *
 * 用法：
 *   const { t, getErrorMessage, setLocale, getLocale, loadFromCdn } = require('./utils/i18n')
 *   // 业务文案
 *   wx.showToast({ title: t('OPERATION_SUCCESS') })
 *   // 错误码转文案
 *   const msg = getErrorMessage(res.error.type)  // 'RISK_PENDING' → '请求已受理，待人工审核'
 *   // 切换语言
 *   setLocale('en-US')
 *   // 启动时拉 CDN 合并字典
 *   await loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json')
 *
 * 设计取舍：
 *   - 不直接 require 云端 errors-i18n.ts（云端字典可能更大，体积对小程序首屏不友好）
 *   - 提供一个轻量子集，覆盖最常见的 35 个 code + 业务文案
 *   - 提供 applyCustomOverrides() 允许运营热更新部分文案
 *   - CDN 加载是渐进增强：失败时回落到内置字典，不阻塞首屏
 */

const STORAGE_KEY = 'app_locale'

// =====================================================================
// 业务文案字典（小程序特有，错误码字典与云端对齐）
// =====================================================================

/** 业务文案字典（key 为业务常量） */
const BIZ_I18N = {
  OPERATION_SUCCESS: {
    'zh-CN': '操作成功',
    'en-US': 'Success',
    'ja-JP': '操作成功',
  },
  OPERATION_FAILED: {
    'zh-CN': '操作失败',
    'en-US': 'Operation failed',
    'ja-JP': '操作に失敗しました',
  },
  LOADING: {
    'zh-CN': '加载中...',
    'en-US': 'Loading...',
    'ja-JP': '読み込み中...',
  },
  CONFIRM: {
    'zh-CN': '确定',
    'en-US': 'Confirm',
    'ja-JP': '確認',
  },
  CANCEL: {
    'zh-CN': '取消',
    'en-US': 'Cancel',
    'ja-JP': 'キャンセル',
  },
  RETRY: {
    'zh-CN': '重试',
    'en-US': 'Retry',
    'ja-JP': '再試行',
  },
  EMPTY_DATA: {
    'zh-CN': '暂无数据',
    'en-US': 'No data',
    'ja-JP': 'データなし',
  },
  NETWORK_ERROR: {
    'zh-CN': '网络连接失败，请检查网络',
    'en-US': 'Network unavailable, please check your connection',
    'ja-JP': 'ネットワーク接続に失敗しました',
  },
  RISK_PENDING_HINT: {
    'zh-CN': '内容已提交，正在等待运营审核',
    'en-US': 'Submitted, pending manual review',
    'ja-JP': '送信済み、人的審査待ちです',
  },
  SERVICE: {
    'zh-CN': '服务',
    'en-US': 'Service',
    'ja-JP': 'サービス',
  },
  FEEDING_SERVICE: {
    'zh-CN': '上门服务',
    'en-US': 'Feeding Service',
    'ja-JP': '上门サービス',
  },
  FEEDING_SERVICE_DESC: {
    'zh-CN': '洗护·喂养',
    'en-US': 'Grooming & Feeding',
    'ja-JP': 'グルーミング・給餌',
  },
  BOARDING_SERVICE: {
    'zh-CN': '宠物寄养',
    'en-US': 'Pet Boarding',
    'ja-JP': 'ペット保育',
  },
  BOARDING_SERVICE_DESC: {
    'zh-CN': '安心寄养家庭',
    'en-US': 'Reliable Boarding Homes',
    'ja-JP': '安心の預かり先',
  },
  WELCOME_TITLE: {
    'zh-CN': '欢迎加入AROORO',
    'en-US': 'Welcome to AROORO',
    'ja-JP': 'AROOROへようこそ',
  },
  WELCOME_SUBTITLE: {
    'zh-CN': '安心呼噜，放心托付',
    'en-US': 'Reliable care for your pets',
    'ja-JP': '安心のペットケア',
  },
  LOGIN_NOW: {
    'zh-CN': '立即登录',
    'en-US': 'Login Now',
    'ja-JP': '今すぐログイン',
  },
  VIEW_ALL_ACTIVITIES: {
    'zh-CN': '查看全部',
    'en-US': 'View All',
    'ja-JP': 'すべて見る',
  },
  ACTIVITY_SIGN_UP: {
    'zh-CN': '报名',
    'en-US': 'Sign Up',
    'ja-JP': '参加する',
  },
  NO_ACTIVITIES: {
    'zh-CN': '暂无活动',
    'en-US': 'No Activities',
    'ja-JP': '活動なし',
  },
  NO_ACTIVITIES_HINT: {
    'zh-CN': '精彩活动即将上线，敬请期待',
    'en-US': 'Exciting activities coming soon',
    'ja-JP': '素晴らしいイベントが近日公開予定',
  },
  NO_TUAN_DEALS: {
    'zh-CN': '暂无团购',
    'en-US': 'No Group Deals',
    'ja-JP': 'グループ販売なし',
  },
  NO_TUAN_DEALS_HINT: {
    'zh-CN': '精选好物即将上线',
    'en-US': 'Great deals coming soon',
    'ja-JP': 'お得な商品が近日公開予定',
  },
  ORIGINAL_PRICE: {
    'zh-CN': '原价',
    'en-US': 'Original Price',
    'ja-JP': '定価',
  },
  NO_RECENT_VIEWS: {
    'zh-CN': '暂无浏览记录',
    'en-US': 'No Recent Views',
    'ja-JP': '閲覧履歴なし',
  },
  MY_PETS: {
    'zh-CN': '我的宠物',
    'en-US': 'My Pets',
    'ja-JP': '私のペット',
  },
  ADD: {
    'zh-CN': '添加',
    'en-US': 'Add',
    'ja-JP': '追加',
  },
  VIEW_MORE: {
    'zh-CN': '查看更多',
    'en-US': 'View More',
    'ja-JP': 'もっと見る',
  },
  ADD_FIRST_PET: {
    'zh-CN': '点击添加你的第一只宠物',
    'en-US': 'Tap to add your first pet',
    'ja-JP': 'タップして最初のペットを追加',
  },
  COMING_SOON: {
    'zh-CN': '敬请期待！',
    'en-US': 'Coming Soon!',
    'ja-JP': '近日公開！',
  },
  FEATURE_ACTIVITY: {
    'zh-CN': '线下活动',
    'en-US': 'Activities',
    'ja-JP': 'イベント',
  },
  FEATURE_ACTIVITY_DESC: {
    'zh-CN': '精彩社区活动',
    'en-US': 'Community Events',
    'ja-JP': 'コミュニティイベント',
  },
  FEATURE_MALL: {
    'zh-CN': '宠物商城',
    'en-US': 'Pet Mall',
    'ja-JP': 'ペットモール',
  },
  FEATURE_MALL_DESC: {
    'zh-CN': '精选好物推荐',
    'en-US': 'Recommended Products',
    'ja-JP': 'おすすめ商品',
  },
  GROUP_DEALS: {
    'zh-CN': '宠团团',
    'en-US': 'Group Deals',
    'ja-JP': 'グループ販売',
  },
  ORIGINAL_PRICE_LABEL: {
    'zh-CN': '原价',
    'en-US': 'Original',
    'ja-JP': '定価',
  },
  RECENT_VIEWS: {
    'zh-CN': '最近浏览',
    'en-US': 'Recent Views',
    'ja-JP': '最近の閲覧',
  },
  JOINED: {
    'zh-CN': '人已团',
    'en-US': ' joined',
    'ja-JP': '人が参加',
  },
  LATEST_ACTIVITIES: {
    'zh-CN': '最新活动',
    'en-US': 'Latest Activities',
    'ja-JP': '最新のイベント',
  },
  REGISTRATION_ENDED: {
    'zh-CN': '已截止',
    'en-US': 'Ended',
    'ja-JP': '締切済み',
  },
  REGISTRATION_OPEN: {
    'zh-CN': '报名中',
    'en-US': 'Open',
    'ja-JP': '募集中',
  },
  CATEGORY_OUTDOOR: {
    'zh-CN': '户外',
    'en-US': 'Outdoor',
    'ja-JP': '屋外',
  },
  CATEGORY_SOCIAL: {
    'zh-CN': '社交',
    'en-US': 'Social',
    'ja-JP': '社交',
  },
  CATEGORY_TRAINING: {
    'zh-CN': '训练',
    'en-US': 'Training',
    'ja-JP': 'トレーニング',
  },
  CATEGORY_HEALTH: {
    'zh-CN': '健康',
    'en-US': 'Health',
    'ja-JP': '健康',
  },
  PRICE_PERSON: {
    'zh-CN': '/人',
    'en-US': '/person',
    'ja-JP': '/人',
  },
  PRICE_PET: {
    'zh-CN': '/宠',
    'en-US': '/pet',
    'ja-JP': '/ペット',
  },
  FREE: {
    'zh-CN': '免费',
    'en-US': 'Free',
    'ja-JP': '無料',
  },
  UNLIMITED: {
    'zh-CN': '不限',
    'en-US': 'Unlimited',
    'ja-JP': '無制限',
  },
  TBD: {
    'zh-CN': '待定',
    'en-US': 'TBD',
    'ja-JP': '未定',
  },
  SIGN_UP: {
    'zh-CN': '报名',
    'en-US': 'Sign Up',
    'ja-JP': '参加する',
  },
  SIGNED_UP: {
    'zh-CN': '已报名',
    'en-US': 'Signed Up',
    'ja-JP': '参加済み',
  },
  NO_ACTIVITIES_HINT_HOME: {
    'zh-CN': '精彩活动即将上线，敬请期待',
    'en-US': 'Exciting activities coming soon',
    'ja-JP': '素晴らしいイベントが近日公開予定',
  },
  FROM: {
    'zh-CN': '起',
    'en-US': 'From',
    'ja-JP': 'から',
  },
  IMMEDIATELY_EXPERIENCE: {
    'zh-CN': '立即体验',
    'en-US': 'Try Now',
    'ja-JP': '今すぐ試す',
  },

  // === 商品（mall）===
  PRODUCT_LOAD_FAILED: {
    'zh-CN': '商品不存在或加载失败',
    'en-US': 'Product not found or failed to load',
    'ja-JP': '商品が見つからないか、読み込みに失敗しました',
  },
  PRODUCT_INFO_INVALID: {
    'zh-CN': '商品信息异常',
    'en-US': 'Invalid product information',
    'ja-JP': '商品情報が異常です',
  },
  PRODUCT_OUT_OF_STOCK: {
    'zh-CN': '商品已售罄',
    'en-US': 'Out of stock',
    'ja-JP': '在庫切れ',
  },
  PRODUCT_OFF_SHELF: {
    'zh-CN': '商品已下架',
    'en-US': 'Product removed',
    'ja-JP': '商品は削除されました',
  },
  PRODUCT_SELECT_REQUIRED: {
    'zh-CN': '请选择商品',
    'en-US': 'Please select products',
    'ja-JP': '商品を選択してください',
  },
  PRODUCT_ADD_TO_CART: {
    'zh-CN': '已加入购物车',
    'en-US': 'Added to cart',
    'ja-JP': 'カートに追加しました',
  },
  PRODUCT_INVALID_CLEARED: {
    'zh-CN': '已清除失效商品',
    'en-US': 'Invalid items removed',
    'ja-JP': '無効な商品を除去しました',
  },
  PRODUCT_CART_EMPTY: {
    'zh-CN': '购物车空空如也，去逛逛吧',
    'en-US': 'Your cart is empty',
    'ja-JP': 'カートは空です',
  },
  PRODUCT_TOTAL_LABEL: {
    'zh-CN': '商品总额',
    'en-US': 'Subtotal',
    'ja-JP': '商品小計',
  },
  PRODUCT_GROUP_BUY_PRICE: {
    'zh-CN': '团购价',
    'en-US': 'Group price',
    'ja-JP': 'グループ価格',
  },
  PRODUCT_STOCK_LABEL: {
    'zh-CN': '库存',
    'en-US': 'Stock',
    'ja-JP': '在庫',
  },
  PRODUCT_DETAIL_TITLE: {
    'zh-CN': '商品详情',
    'en-US': 'Product Details',
    'ja-JP': '商品詳細',
  },

  // === 活动（activity）===
  ACTIVITY_LIST_TITLE: {
    'zh-CN': '宠物活动',
    'en-US': 'Pet Activities',
    'ja-JP': 'ペットイベント',
  },
  ACTIVITY_DETAIL_TITLE: {
    'zh-CN': '活动详情',
    'en-US': 'Activity Details',
    'ja-JP': 'イベント詳細',
  },
  ACTIVITY_MY_TITLE: {
    'zh-CN': '我的活动',
    'en-US': 'My Activities',
    'ja-JP': 'マイイベント',
  },
  ACTIVITY_EMPTY_TITLE: {
    'zh-CN': '暂无活动',
    'en-US': 'No activities yet',
    'ja-JP': 'イベントはありません',
  },
  ACTIVITY_EMPTY_DESC: {
    'zh-CN': '精彩活动即将上线，敬请期待',
    'en-US': 'Exciting activities are coming soon',
    'ja-JP': '楽しいイベントを準備中です',
  },
  ACTIVITY_JOIN_NOW: {
    'zh-CN': '立即报名',
    'en-US': 'Join Now',
    'ja-JP': '今すぐ申込',
  },
  ACTIVITY_REGISTRATION_STOPPED: {
    'zh-CN': '已停止报名',
    'en-US': 'Registration closed',
    'ja-JP': '申込受付終了',
  },
  ACTIVITY_ENDED: {
    'zh-CN': '已结束',
    'en-US': 'Ended',
    'ja-JP': '終了',
  },
  ACTIVITY_JOINED: {
    'zh-CN': '已报名',
    'en-US': 'Registered',
    'ja-JP': '申込済み',
  },
  ACTIVITY_EXPIRED_PAYMENT: {
    'zh-CN': '活动已结束，无法继续支付',
    'en-US': 'Activity ended, payment unavailable',
    'ja-JP': 'イベント終了のため、お支払いできません',
  },
  ACTIVITY_REGISTRATION_SUCCESS: {
    'zh-CN': '报名成功',
    'en-US': 'Registration successful',
    'ja-JP': '申込が完了しました',
  },
  ACTIVITY_REGISTRATION_FAILED: {
    'zh-CN': '报名失败',
    'en-US': 'Registration failed',
    'ja-JP': '申込に失敗しました',
  },
  ACTIVITY_PARTICIPANT_REQUIRED: {
    'zh-CN': '请填写参加人数',
    'en-US': 'Please enter the number of participants',
    'ja-JP': '参加人数を入力してください',
  },
  ACTIVITY_PHONE_REQUIRED: {
    'zh-CN': '请填写联系电话',
    'en-US': 'Please enter a contact phone',
    'ja-JP': '連絡先を入力してください',
  },
  DATE_END_INVALID: {
    'zh-CN': '结束时间不能早于开始时间',
    'en-US': 'End time cannot be earlier than start time',
    'ja-JP': '終了時間は開始時間より早くできません',
  },
  ACTIVITY_PET_INFO_REQUIRED: {
    'zh-CN': '请填写宠物必填信息',
    'en-US': 'Please fill in required pet info',
    'ja-JP': 'ペットの必須情報を入力してください',
  },
  ACTIVITY_FRIEND_ADDED: {
    'zh-CN': '好友信息添加成功',
    'en-US': 'Friend added',
    'ja-JP': '友達を追加しました',
  },
  ACTIVITY_FRIEND_UPDATED: {
    'zh-CN': '好友信息编辑成功',
    'en-US': 'Friend updated',
    'ja-JP': '友達情報を更新しました',
  },
  ACTIVITY_SUBMITTING: {
    'zh-CN': '提交中...',
    'en-US': 'Submitting...',
    'ja-JP': '送信中...',
  },
  ACTIVITY_FRIEND_REGISTRATION: {
    'zh-CN': '代好友报名信息',
    'en-US': 'Register for a friend',
    'ja-JP': '友達の代理申込',
  },
  ACTIVITY_OUTDOOR_SOCIAL: {
    'zh-CN': '宠物户外社交活动',
    'en-US': 'Pet Outdoor Social',
    'ja-JP': 'ペットアウトドア交流会',
  },

  // === 轮播图（Banner）===
  BANNER_LOAD_FAILED: {
    'zh-CN': '轮播图加载失败',
    'en-US': 'Failed to load banners',
    'ja-JP': 'バナーの読み込みに失敗しました',
  },
  BANNER_PLACEHOLDER_TITLE: {
    'zh-CN': '精彩推荐',
    'en-US': 'Featured',
    'ja-JP': 'おすすめ',
  },
  BANNER_PLACEHOLDER_DESC: {
    'zh-CN': '更多内容正在路上',
    'en-US': 'More content coming soon',
    'ja-JP': '近日公開予定',
  },

  // === 支付 / 订单 ===
  PAYMENT_REQUIRED_ADDRESS: {
    'zh-CN': '请填写收货地址',
    'en-US': 'Please add a shipping address',
    'ja-JP': '配送先住所を入力してください',
  },
  PAYMENT_SUCCESS: {
    'zh-CN': '支付成功',
    'en-US': 'Payment successful',
    'ja-JP': '支払いが完了しました',
  },
  PAYMENT_CANCELLED: {
    'zh-CN': '已取消支付',
    'en-US': 'Payment cancelled',
    'ja-JP': '支払いをキャンセルしました',
  },
  PAYMENT_FAILED: {
    'zh-CN': '支付失败',
    'en-US': 'Payment failed',
    'ja-JP': '支払いに失敗しました',
  },
  ORDER_PLACE_SUCCESS: {
    'zh-CN': '下单成功',
    'en-US': 'Order placed',
    'ja-JP': '注文が完了しました',
  },
  ORDER_PLACE_FAILED: {
    'zh-CN': '下单失败',
    'en-US': 'Failed to place order',
    'ja-JP': '注文に失敗しました',
  },
  COUPON_LOCK_FAILED: {
    'zh-CN': '优惠券锁定失败',
    'en-US': 'Failed to lock coupon',
    'ja-JP': 'クーポンのロックに失敗しました',
  },

  // === 寄养 / 上门（boarding / feeding）===
  DATE_REQUIRED: {
    'zh-CN': '请选择日期',
    'en-US': 'Please select a date',
    'ja-JP': '日付を選択してください',
  },
  ADDRESS_REQUIRED: {
    'zh-CN': '请选择服务地址',
    'en-US': 'Please select a service address',
    'ja-JP': 'サービス住所を選択してください',
  },
  INVALID_PARAMS: {
    'zh-CN': '参数错误',
    'en-US': 'Invalid parameters',
    'ja-JP': 'パラメータエラー',
  },
  LOAD_FAILED: {
    'zh-CN': '加载失败',
    'en-US': 'Failed to load',
    'ja-JP': '読み込みに失敗しました',
  },
  SPEC_REQUIRED: {
    'zh-CN': '请选择完整规格',
    'en-US': 'Please select all specs',
    'ja-JP': '仕様をすべて選択してください',
  },
  SERVICE_LOCATION_REQUIRED: {
    'zh-CN': '请选择服务位置',
    'en-US': 'Please select a service location',
    'ja-JP': 'サービス場所を選択してください',
  },
  SUPPORT_PHONE_MISSING: {
    'zh-CN': '暂无客服电话',
    'en-US': 'No support phone',
    'ja-JP': 'カスタマーサポート電話はありません',
  },
  LOGOUT_FAILED: {
    'zh-CN': '退出失败，请重试',
    'en-US': 'Logout failed, please retry',
    'ja-JP': 'ログアウトに失敗しました。もう一度お試しください',
  },
  LOGOUT_SUCCESS: {
    'zh-CN': '已退出登录',
    'en-US': 'Logged out',
    'ja-JP': 'ログアウトしました',
  },

  // === 通用操作结果（Sprint 18 增补）===
  DELETE_SUCCESS: { 'zh-CN': '删除成功', 'en-US': 'Deleted', 'ja-JP': '削除しました' },
  DELETE_FAILED: { 'zh-CN': '删除失败', 'en-US': 'Delete failed', 'ja-JP': '削除に失敗しました' },
  CANCEL_SUCCESS: { 'zh-CN': '取消成功', 'en-US': 'Cancelled', 'ja-JP': 'キャンセルしました' },
  CANCEL_FAILED: { 'zh-CN': '取消失败', 'en-US': 'Cancel failed', 'ja-JP': 'キャンセルに失敗しました' },
  SAVED: { 'zh-CN': '已保存', 'en-US': 'Saved', 'ja-JP': '保存しました' },
  PUBLISHED: { 'zh-CN': '已发布', 'en-US': 'Published', 'ja-JP': '公開しました' },
  DELETED: { 'zh-CN': '已删除', 'en-US': 'Deleted', 'ja-JP': '削除済み' },
  CANCELLED: { 'zh-CN': '已取消', 'en-US': 'Cancelled', 'ja-JP': 'キャンセル済み' },
  CONFIRMED_RECEIPT: { 'zh-CN': '已确认收货', 'en-US': 'Receipt confirmed', 'ja-JP': '受領確認済み' },
  SET_DEFAULT_SUCCESS: { 'zh-CN': '已设为默认', 'en-US': 'Set as default', 'ja-JP': 'デフォルトに設定しました' },
  SAVE_SUCCESS: { 'zh-CN': '保存成功', 'en-US': 'Saved successfully', 'ja-JP': '保存しました' },
  SAVE_FAILED: { 'zh-CN': '保存失败', 'en-US': 'Save failed', 'ja-JP': '保存に失敗しました' },
  SUBMIT_FAILED: { 'zh-CN': '提交失败', 'en-US': 'Submit failed', 'ja-JP': '送信に失敗しました' },
  CREATE_FAILED: { 'zh-CN': '创建失败', 'en-US': 'Create failed', 'ja-JP': '作成に失敗しました' },
  LOGIN_SUCCESS: { 'zh-CN': '登录成功', 'en-US': 'Login successful', 'ja-JP': 'ログインしました' },
  LOGIN_FAILED: { 'zh-CN': '登录失败', 'en-US': 'Login failed', 'ja-JP': 'ログインに失敗しました' },
  NAVIGATE_FAILED: { 'zh-CN': '跳转失败', 'en-US': 'Navigation failed', 'ja-JP': 'ページ遷移に失敗しました' },
  NAVIGATE_RETRY: { 'zh-CN': '跳转失败，请重试', 'en-US': 'Navigation failed, please retry', 'ja-JP': 'ページ遷移に失敗しました。再試行してください' },
  NAVIGATE_PAGE_FAILED: { 'zh-CN': '页面跳转失败', 'en-US': 'Page navigation failed', 'ja-JP': 'ページ遷移に失敗しました' },
  CHOOSE_IMAGE_FAILED: { 'zh-CN': '选择图片失败', 'en-US': 'Failed to select image', 'ja-JP': '画像の選択に失敗しました' },
  PHOTO_FAILED: { 'zh-CN': '拍照失败', 'en-US': 'Photo failed', 'ja-JP': '撮影に失敗しました' },
  CANVAS_INIT_FAILED: { 'zh-CN': 'Canvas 初始化失败', 'en-US': 'Canvas init failed', 'ja-JP': 'Canvasの初期化に失敗しました' },
  APPLICATION_SUBMITTED: { 'zh-CN': '申请已提交', 'en-US': 'Application submitted', 'ja-JP': '申請を送信しました' },
  PET_DELETED: { 'zh-CN': '宠物不存在或已被删除', 'en-US': 'Pet not found or already deleted', 'ja-JP': 'ペットが存在しないか削除済みです' },
  PET_CREATE_SUCCESS: { 'zh-CN': '宠物档案创建成功', 'en-US': 'Pet profile created', 'ja-JP': 'ペットプロフィールを作成しました' },
  PET_REQUIRED: { 'zh-CN': '请选择宠物', 'en-US': 'Please select a pet', 'ja-JP': 'ペットを選択してください' },
  PET_INDEX_REQUIRED: { 'zh-CN': '请填写第${index}只宠物的必填信息', 'en-US': 'Please fill in the required info for pet #${index}', 'ja-JP': '${index}番目のペットの必須情報を入力してください' },
  DATE_RANGE_REQUIRED: { 'zh-CN': '请选择入住和退房日期', 'en-US': 'Please select check-in and check-out dates', 'ja-JP': 'チェックイン・チェックアウト日を選択してください' },
  COUPON_LOCK_FAILED_RETRY: { 'zh-CN': '优惠券锁定失败，请重试', 'en-US': 'Coupon lock failed, please retry', 'ja-JP': 'クーポンのロックに失敗しました。再試行してください' },
  COUPON_CLAIM_SUCCESS: { 'zh-CN': '领取成功', 'en-US': 'Claimed', 'ja-JP': '受取完了' },
  COUPON_CLAIM_FAILED: { 'zh-CN': '领取失败', 'en-US': 'Claim failed', 'ja-JP': '受取に失敗しました' },
  PAYMENT_CANCELLED_KEPT: { 'zh-CN': '已取消支付，报名已保留', 'en-US': 'Payment cancelled, registration kept', 'ja-JP': '支払いをキャンセルしました。申込は保持されています' },
  ORDER_CREATED_PAY_LATER: { 'zh-CN': '订单已创建，请在订单列表完成支付', 'en-US': 'Order created, please complete payment in order list', 'ja-JP': '注文を作成しました。注文一覧から支払いを完了してください' },
  ORDER_AMOUNT_INVALID: { 'zh-CN': '订单金额异常', 'en-US': 'Invalid order amount', 'ja-JP': '注文金額が異常です' },
  GROOMER_NOT_FOUND: { 'zh-CN': '洗护师不存在', 'en-US': 'Groomer not found', 'ja-JP': 'グルーマーが見つかりません' },
  HOST_NOT_FOUND_TEXT: { 'zh-CN': '未找到该寄养家庭', 'en-US': 'Host family not found', 'ja-JP': 'ホストファミリーが見つかりません' },

  // === Sprint 18 增补：表单 / 网络 / 通用 ===
  DATE_RANGE_FULL_REQUIRED: { 'zh-CN': '请选择完整日期', 'en-US': 'Please select a complete date range', 'ja-JP': '期間全体を選択してください' },
  DATE_START_REQUIRED: { 'zh-CN': '请选择开始日期', 'en-US': 'Please select a start date', 'ja-JP': '開始日を選択してください' },
  DATE_START_TIME_REQUIRED: { 'zh-CN': '请选择开始时间', 'en-US': 'Please select a start time', 'ja-JP': '開始時間を選択してください' },
  SERVICE_DATE_REQUIRED: { 'zh-CN': '请选择服务日期', 'en-US': 'Please select a service date', 'ja-JP': 'サービス日を選択してください' },
  PRICE_REQUIRED: { 'zh-CN': '请先获取寄养家庭价格', 'en-US': 'Please fetch host price first', 'ja-JP': 'まずはホスト価格を取得してください' },
  SERVICE_PET_REQUIRED: { 'zh-CN': '请先选择服务宠物', 'en-US': 'Please select a service pet', 'ja-JP': 'サービスペットを選択してください' },
  PET_SELECT_PET_REQUIRED: { 'zh-CN': '打开宠物选择失败', 'en-US': 'Failed to open pet selector', 'ja-JP': 'ペット選択を開けませんでした' },
  PET_DELETE_REQUIRED: { 'zh-CN': '请选择要删除的宠物', 'en-US': 'Please select pets to delete', 'ja-JP': '削除するペットを選択してください' },
  PET_DATA_INVALID: { 'zh-CN': '宠物数据异常', 'en-US': 'Invalid pet data', 'ja-JP': 'ペットデータ異常' },
  PET_DATA_NOT_LOADED: { 'zh-CN': '宠物数据未加载', 'en-US': 'Pet data not loaded', 'ja-JP': 'ペットデータ未読込' },
  PET_NAME_REQUIRED: { 'zh-CN': '请输入宠物名字', 'en-US': 'Please enter a pet name', 'ja-JP': 'ペットの名前を入力してください' },
  PET_TYPE_REQUIRED: { 'zh-CN': '请选择宠物类型', 'en-US': 'Please select a pet type', 'ja-JP': 'ペットの種類を選択してください' },

  PHONE_REQUIRED: { 'zh-CN': '请填写手机号', 'en-US': 'Please enter a phone number', 'ja-JP': '電話番号を入力してください' },
  PHONE_INVALID: { 'zh-CN': '请输入正确的手机号', 'en-US': 'Please enter a valid phone number', 'ja-JP': '正しい電話番号を入力してください' },
  REAL_NAME_REQUIRED: { 'zh-CN': '请填写真实姓名', 'en-US': 'Please enter your real name', 'ja-JP': '本名を入力してください' },
  NAME_REQUIRED: { 'zh-CN': '请输入姓名', 'en-US': 'Please enter a name', 'ja-JP': '名前を入力してください' },
  ADDRESS_DETAIL_REQUIRED: { 'zh-CN': '请输入详细地址', 'en-US': 'Please enter a detailed address', 'ja-JP': '詳しい住所を入力してください' },
  REGION_REQUIRED: { 'zh-CN': '请选择所在地区', 'en-US': 'Please select a region', 'ja-JP': '地域を選択してください' },
  GENDER_REQUIRED: { 'zh-CN': '请选择性别', 'en-US': 'Please select a gender', 'ja-JP': '性別を選択してください' },
  REASON_REQUIRED: { 'zh-CN': '请填写申请理由', 'en-US': 'Please enter an application reason', 'ja-JP': '申請理由を入力してください' },
  ACTIVITY_TITLE_REQUIRED: { 'zh-CN': '请填写活动标题', 'en-US': 'Please enter an activity title', 'ja-JP': 'イベントタイトルを入力してください' },
  ACTIVITY_LOCATION_REQUIRED: { 'zh-CN': '请选择活动地点', 'en-US': 'Please select an activity location', 'ja-JP': 'イベント場所を選択してください' },
  CARD_REQUIRED: { 'zh-CN': '请先生成身份卡片', 'en-US': 'Please generate an ID card first', 'ja-JP': 'IDカードを先に生成してください' },

  FILL_ALL_REQUIRED: { 'zh-CN': '请填写完整的信息', 'en-US': 'Please fill in all required info', 'ja-JP': '必須情報をすべて入力してください' },
  FILL_REQUIRED: { 'zh-CN': '请填写必填信息', 'en-US': 'Please fill in required fields', 'ja-JP': '必須項目を入力してください' },
  HOST_ID_MISSING: { 'zh-CN': '缺少寄养家庭ID', 'en-US': 'Host ID missing', 'ja-JP': 'ホストIDがありません' },
  HOST_INFO_INVALID: { 'zh-CN': '寄养家庭信息有误', 'en-US': 'Invalid host info', 'ja-JP': 'ホスト情報が不正です' },
  HOST_NOT_EXIST: { 'zh-CN': '家庭不存在', 'en-US': 'Family not found', 'ja-JP': 'ファミリーが存在しません' },
  HOST_PAUSED: { 'zh-CN': '该家庭已暂停接单', 'en-US': 'This family has paused bookings', 'ja-JP': 'このファミリーは受付停止中です' },
  COPIED: { 'zh-CN': '已复制', 'en-US': 'Copied', 'ja-JP': 'コピーしました' },
  ALL_MARKED_READ: { 'zh-CN': '已全部标记已读', 'en-US': 'All marked as read', 'ja-JP': 'すべて既読にしました' },

  CARD_IMAGE_FAILED: { 'zh-CN': '卡片图片加载失败，请重新生成', 'en-US': 'Card image failed to load, please regenerate', 'ja-JP': 'カード画像の読込に失敗しました。再生成してください' },
  CARD_GENERATE_SUCCESS: { 'zh-CN': '卡片生成成功', 'en-US': 'Card generated', 'ja-JP': 'カード生成完了' },
  CARD_GENERATE_FAILED: { 'zh-CN': '卡片生成失败', 'en-US': 'Card generation failed', 'ja-JP': 'カードの生成に失敗しました' },
  CHAT_NOT_OPEN: { 'zh-CN': '聊天功能暂未开放', 'en-US': 'Chat is not available yet', 'ja-JP': 'チャットはまだ利用できません' },
  CONTACT_SUPPORT_WITHDRAW: { 'zh-CN': '请联系客服提现', 'en-US': 'Please contact support to withdraw', 'ja-JP': '出金についてはサポートにお問い合わせください' },

  UPLOAD_FAILED: { 'zh-CN': '上传失败', 'en-US': 'Upload failed', 'ja-JP': 'アップロードに失敗しました' },
  UPLOADING_AVATAR: { 'zh-CN': '头像上传中，请稍后', 'en-US': 'Uploading avatar, please wait', 'ja-JP': 'アバターアップロード中' },
  AVATAR_UPLOAD_FAILED: { 'zh-CN': '头像上传失败', 'en-US': 'Avatar upload failed', 'ja-JP': 'アバターのアップロードに失敗しました' },
  AVATAR_UPLOAD_SUCCESS: { 'zh-CN': '头像上传成功', 'en-US': 'Avatar uploaded', 'ja-JP': 'アバターをアップロードしました' },
  MAX_15_IMAGES: { 'zh-CN': '最多上传15张图片', 'en-US': 'Maximum 15 images', 'ja-JP': '画像は最大15枚まで' },

  PRODUCT_INVALID: { 'zh-CN': '商品已失效', 'en-US': 'Product unavailable', 'ja-JP': '商品が無効です' },
  GROUP_BUY_INVALID: { 'zh-CN': '团购数据异常', 'en-US': 'Invalid group buy data', 'ja-JP': '团购データ異常' },
  LOCATION_MISSING: { 'zh-CN': '暂无地点信息', 'en-US': 'No location info', 'ja-JP': '場所情報がありません' },
  LOCATION_PRECISE_MISSING: { 'zh-CN': '暂无精确位置信息', 'en-US': 'No precise location info', 'ja-JP': '正確な位置情報がありません' },
  CONTACT_MISSING: { 'zh-CN': '暂无联系方式', 'en-US': 'No contact info', 'ja-JP': '連絡先情報がありません' },

  NO_PERMISSION: { 'zh-CN': '暂无权限', 'en-US': 'No permission', 'ja-JP': '権限がありません' },
  STATUS_INVALID: { 'zh-CN': '当前状态无法操作', 'en-US': 'Current state does not allow this action', 'ja-JP': '現在の状態では操作できません' },
  NAVIGATE_BACK_FAILED: { 'zh-CN': '返回失败', 'en-US': 'Failed to navigate back', 'ja-JP': '戻れませんでした' },
  ALREADY_REGISTERED: { 'zh-CN': '您已报名此活动', 'en-US': 'You have already registered', 'ja-JP': '既にお申し込み済みです' },
  ALREADY_REGISTERED_LONG: { 'zh-CN': '您已经报名参加此活动', 'en-US': 'You have already joined this activity', 'ja-JP': 'このイベントに既に参加済みです' },
  REGISTRATION_CLOSED: { 'zh-CN': '报名已截止', 'en-US': 'Registration closed', 'ja-JP': '申込締切' },
  ACTIVITY_ENDED_TOAST: { 'zh-CN': '活动已结束', 'en-US': 'Activity ended', 'ja-JP': 'イベント終了' },

  ORDER_LOAD_FAILED: { 'zh-CN': '加载订单信息失败', 'en-US': 'Failed to load order info', 'ja-JP': '注文情報の読込に失敗しました' },
  RETRY_TEXT: { 'zh-CN': '请重试', 'en-US': 'Please retry', 'ja-JP': '再試行してください' },
  LATER_TEXT: { 'zh-CN': '请稍后重试', 'en-US': 'Please try again later', 'ja-JP': 'しばらくしてから再度お試しください' },
  ORDER_PLACE_RETRY: { 'zh-CN': '下单失败，请重试', 'en-US': 'Order failed, please retry', 'ja-JP': '注文に失敗しました。再試行してください' },
  CREATE_RETRY_LATER: { 'zh-CN': '创建失败，请稍后重试', 'en-US': 'Create failed, please try later', 'ja-JP': '作成に失敗しました。しばらくしてから再度お試しください' },
  SUBMIT_RETRY: { 'zh-CN': '提交失败，请重试', 'en-US': 'Submit failed, please retry', 'ja-JP': '送信に失敗しました。再試行してください' },
  OPERATION_RETRY: { 'zh-CN': '操作失败，请重试', 'en-US': 'Operation failed, please retry', 'ja-JP': '操作に失敗しました。再試行してください' },
  OPERATION_RETRY_LATER: { 'zh-CN': '操作失败，请稍后重试', 'en-US': 'Operation failed, please try later', 'ja-JP': '操作に失敗しました。しばらくしてから再度お試しください' },
  LOGIN_RETRY: { 'zh-CN': '登录失败，请重试', 'en-US': 'Login failed, please retry', 'ja-JP': 'ログインに失敗しました。再試行してください' },
  GET_FAILED: { 'zh-CN': '获取失败', 'en-US': 'Failed to fetch', 'ja-JP': '取得に失敗しました' },
  GET_RETRY: { 'zh-CN': '获取失败，请重试', 'en-US': 'Failed to fetch, please retry', 'ja-JP': '取得に失敗しました。再試行してください' },
  SET_FAILED: { 'zh-CN': '设置失败', 'en-US': 'Failed to set', 'ja-JP': '設定に失敗しました' },
  NETWORK_ERROR_RETRY: { 'zh-CN': '网络异常', 'en-US': 'Network error', 'ja-JP': 'ネットワーク異常' },
  NETWORK_ERROR_LATER: { 'zh-CN': '网络异常，请稍后重试', 'en-US': 'Network error, please try later', 'ja-JP': 'ネットワーク異常。しばらくしてから再度お試しください' },
  PAYMENT_CANCELLED_TEXT: { 'zh-CN': '支付已取消', 'en-US': 'Payment cancelled', 'ja-JP': '支払いをキャンセルしました' },
  ACTIVITY_EXPIRED_PAYMENT_TEXT: { 'zh-CN': '活动已结束，无法支付', 'en-US': 'Activity ended, payment unavailable', 'ja-JP': 'イベント終了のため、お支払いできません' },
  PAYMENT_FAILED_KEPT: { 'zh-CN': '支付失败，报名已保留', 'en-US': 'Payment failed, registration kept', 'ja-JP': '支払いに失敗しました。申込は保持されています' },
  PET_LOAD_FAILED: { 'zh-CN': '获取宠物数据失败', 'en-US': 'Failed to load pet data', 'ja-JP': 'ペットデータの取得に失敗しました' },
  PET_REQUIRED_MIN: { 'zh-CN': '请至少选择一只宠物', 'en-US': 'Please select at least one pet', 'ja-JP': '少なくとも1匹のペットを選択してください' },
  HOST_INFO_LOAD_FAILED: { 'zh-CN': '获取寄养家庭信息失败', 'en-US': 'Failed to load host info', 'ja-JP': 'ホスト情報の取得に失敗しました' },
  FAVORITE_SUCCESS: { 'zh-CN': '收藏成功', 'en-US': 'Favorited', 'ja-JP': 'お気に入り追加' },
  FAVORITE_FAILED: { 'zh-CN': '添加收藏失败', 'en-US': 'Failed to favorite', 'ja-JP': 'お気に入りの追加に失敗しました' },
  UNFAVORITE_SUCCESS: { 'zh-CN': '取消收藏成功', 'en-US': 'Unfavorited', 'ja-JP': 'お気に入り解除' },
  UNFAVORITE_FAILED: { 'zh-CN': '取消收藏失败', 'en-US': 'Failed to unfavorite', 'ja-JP': 'お気に入り解除に失敗しました' },
  HOST_ID_MISSING_TEXT: { 'zh-CN': '缺少寄养家庭 ID', 'en-US': 'Host ID missing', 'ja-JP': 'ホストIDがありません' },
  HOST_INFO_NOT_FOUND: { 'zh-CN': '未找到寄养家庭信息', 'en-US': 'Host info not found', 'ja-JP': 'ホスト情報が見つかりません' },
  IMAGE_SIZE_LIMIT: { 'zh-CN': '图片大小不能超过5MB', 'en-US': 'Image size cannot exceed 5MB', 'ja-JP': '画像サイズは5MB以下にしてください' },
  IMAGE_SIZE_MIN: { 'zh-CN': '图片尺寸不能小于200x200', 'en-US': 'Image size must be at least 200x200', 'ja-JP': '画像サイズは200x200以上にしてください' },
  CHOOSE_AVATAR_FAILED: { 'zh-CN': '选择头像失败', 'en-US': 'Failed to select avatar', 'ja-JP': 'アバターの選択に失敗しました' },
  ADDRESS_INVALID: { 'zh-CN': '地址信息无效', 'en-US': 'Invalid address', 'ja-JP': '住所情報が無効です' },
  ADDRESS_SELECTED: { 'zh-CN': '地址已选择', 'en-US': 'Address selected', 'ja-JP': '住所を選択しました' },

  BIZ_10R9BC6: {
    'zh-CN': '删除宠物档案失败',
    'en-US': '删除宠物档案失败',
    'ja-JP': '删除宠物档案失败',
  },
  BIZ_11UNVBD: {
    'zh-CN': '寄养家庭已确认您的订单',
    'en-US': '寄养家庭已确认您的订单',
    'ja-JP': '寄养家庭已确认您的订单',
  },
  BIZ_13CV4GY: {
    'zh-CN': '从相册选择',
    'en-US': '从相册选择',
    'ja-JP': '从相册选择',
  },
  BIZ_13ZGHF7: {
    'zh-CN': '确定截止报名？',
    'en-US': '确定截止报名？',
    'ja-JP': '确定截止报名？',
  },
  BIZ_13ZN79L: {
    'zh-CN': '您需要先登录才能查看宠物列表',
    'en-US': '您需要先登录才能查看宠物列表',
    'ja-JP': '您需要先登录才能查看宠物列表',
  },
  BIZ_145653V: {
    'zh-CN': '登录中...',
    'en-US': '登录中...',
    'ja-JP': '登录中...',
  },
  BIZ_14GI85L: {
    'zh-CN': '填写活动信息',
    'en-US': '填写活动信息',
    'ja-JP': '填写活动信息',
  },
  BIZ_14YNAYZ: {
    'zh-CN': '上门喂养服务',
    'en-US': '上门喂养服务',
    'ja-JP': '上门喂养服务',
  },
  BIZ_15IJZ3: {
    'zh-CN': '1 岁左右',
    'en-US': '1 岁左右',
    'ja-JP': '1 岁左右',
  },
  BIZ_17PTFP: {
    'zh-CN': '查看带货数据',
    'en-US': '查看带货数据',
    'ja-JP': '查看带货数据',
  },
  BIZ_17WX3I7: {
    'zh-CN': '可以。在预约时选择您之前合作过的服务人员即可，也可以在服务人员列表中收藏喜欢的人员方便下次选择。',
    'en-US': '可以。在预约时选择您之前合作过的服务人员即可，也可以在服务人员列表中收藏喜欢的人员方便下次选择。',
    'ja-JP': '可以。在预约时选择您之前合作过的服务人员即可，也可以在服务人员列表中收藏喜欢的人员方便下次选择。',
  },
  BIZ_188DWP4: {
    'zh-CN': '感谢您的使用',
    'en-US': '感谢您的使用',
    'ja-JP': '感谢您的使用',
  },
  BIZ_18YP595: {
    'zh-CN': '确认已收到商品吗？',
    'en-US': '确认已收到商品吗？',
    'ja-JP': '确认已收到商品吗？',
  },
  BIZ_190P12T: {
    'zh-CN': '请先选择服务地址',
    'en-US': '请先选择服务地址',
    'ja-JP': '请先选择服务地址',
  },
  BIZ_193KKBU: {
    'zh-CN': '定时喂食和喝水',
    'en-US': '定时喂食和喝水',
    'ja-JP': '定时喂食和喝水',
  },
  BIZ_19A391K: {
    'zh-CN': '安心寄养家庭',
    'en-US': '安心寄养家庭',
    'ja-JP': '安心寄养家庭',
  },
  BIZ_19DSWT: {
    'zh-CN': '所有服务人员均经过实名认证、背景调查和专业培训，确保为您提供安全可靠的服务。',
    'en-US': '所有服务人员均经过实名认证、背景调查和专业培训，确保为您提供安全可靠的服务。',
    'ja-JP': '所有服务人员均经过实名认证、背景调查和专业培训，确保为您提供安全可靠的服务。',
  },
  BIZ_19HBY7L: {
    'zh-CN': '确定要退出登录吗？',
    'en-US': '确定要退出登录吗？',
    'ja-JP': '确定要退出登录吗？',
  },
  BIZ_1B2ADFB: {
    'zh-CN': '上传中...',
    'en-US': '上传中...',
    'ja-JP': '上传中...',
  },
  BIZ_1BCURQC: {
    'zh-CN': '无法跳转到预约页面，请重试',
    'en-US': '无法跳转到预约页面，请重试',
    'ja-JP': '无法跳转到预约页面，请重试',
  },
  BIZ_1BSKZ0F: {
    'zh-CN': '商家正在为您准备商品',
    'en-US': '商家正在为您准备商品',
    'ja-JP': '商家正在为您准备商品',
  },
  BIZ_1C6WW4B: {
    'zh-CN': '上门喂养标准服务时长约30-45分钟，上门洗护约60-90分钟，遛狗按您选择的时长（30分钟或60分钟）为准。',
    'en-US': '上门喂养标准服务时长约30-45分钟，上门洗护约60-90分钟，遛狗按您选择的时长（30分钟或60分钟）为准。',
    'ja-JP': '上门喂养标准服务时长约30-45分钟，上门洗护约60-90分钟，遛狗按您选择的时长（30分钟或60分钟）为准。',
  },
  BIZ_1CQS4R9: {
    'zh-CN': '请确保家中有人或已将钥匙妥善交给服务人员，并准备好宠物的食物、用品和注意事项说明。服务人员会自备基本清洁工具。',
    'en-US': '请确保家中有人或已将钥匙妥善交给服务人员，并准备好宠物的食物、用品和注意事项说明。服务人员会自备基本清洁工具。',
    'ja-JP': '请确保家中有人或已将钥匙妥善交给服务人员，并准备好宠物的食物、用品和注意事项说明。服务人员会自备基本清洁工具。',
  },
  BIZ_1DD6L13: {
    'zh-CN': '操作失败：',
    'en-US': '操作失败：',
    'ja-JP': '操作失败：',
  },
  BIZ_1DJ8ID1: {
    'zh-CN': '请输入宠物名称',
    'en-US': '请输入宠物名称',
    'ja-JP': '请输入宠物名称',
  },
  BIZ_1DK0UP4: {
    'zh-CN': '管理服务与订单',
    'en-US': '管理服务与订单',
    'ja-JP': '管理服务与订单',
  },
  BIZ_1DLBP94: {
    'zh-CN': '确定要取消此订单吗？',
    'en-US': '确定要取消此订单吗？',
    'ja-JP': '确定要取消此订单吗？',
  },
  BIZ_1FDE0GJ: {
    'zh-CN': '监控摄像头',
    'en-US': '监控摄像头',
    'ja-JP': '监控摄像头',
  },
  BIZ_1FHXK5: {
    'zh-CN': '这家寄养家庭非常细心，对宠物照顾得很好。',
    'en-US': '这家寄养家庭非常细心，对宠物照顾得很好。',
    'ja-JP': '这家寄养家庭非常细心，对宠物照顾得很好。',
  },
  BIZ_1FNYUH3: {
    'zh-CN': '更新宠物信息失败',
    'en-US': '更新宠物信息失败',
    'ja-JP': '更新宠物信息失败',
  },
  BIZ_1H4DMEP: {
    'zh-CN': '确定要删除此订单吗？删除后不可恢复。',
    'en-US': '确定要删除此订单吗？删除后不可恢复。',
    'ja-JP': '确定要删除此订单吗？删除后不可恢复。',
  },
  BIZ_1H61CWU: {
    'zh-CN': '宠物 ID 不能为空',
    'en-US': '宠物 ID 不能为空',
    'ja-JP': '宠物 ID 不能为空',
  },
  BIZ_1IBQW7L: {
    'zh-CN': '确定要删除地址吗？',
    'en-US': '确定要删除地址吗？',
    'ja-JP': '确定要删除地址吗？',
  },
  BIZ_1ILOQLQ: {
    'zh-CN': '按时喂药服务',
    'en-US': '按时喂药服务',
    'ja-JP': '按时喂药服务',
  },
  BIZ_1KFHDTR: {
    'zh-CN': 'AROORO 宠团活动 - 精彩宠物社区活动等你来',
    'en-US': 'AROORO 宠团活动 - 精彩宠物社区活动等你来',
    'ja-JP': 'AROORO 宠团活动 - 精彩宠物社区活动等你来',
  },
  BIZ_1L4V4YD: {
    'zh-CN': '请尽快完成付款，超时订单将自动取消',
    'en-US': '请尽快完成付款，超时订单将自动取消',
    'ja-JP': '请尽快完成付款，超时订单将自动取消',
  },
  BIZ_1LMLMHL: {
    'zh-CN': '查看收入与提现',
    'en-US': '查看收入与提现',
    'ja-JP': '查看收入与提现',
  },
  BIZ_1MGFW86: {
    'zh-CN': '本地已更新，但同步到服务器失败，请检查网络后重试',
    'en-US': '本地已更新，但同步到服务器失败，请检查网络后重试',
    'ja-JP': '本地已更新，但同步到服务器失败，请检查网络后重试',
  },
  BIZ_1ML6AIQ: {
    'zh-CN': '服务已完成',
    'en-US': '服务已完成',
    'ja-JP': '服务已完成',
  },
  BIZ_1MSOYX4: {
    'zh-CN': '服务进行中',
    'en-US': '服务进行中',
    'ja-JP': '服务进行中',
  },
  BIZ_1NND441: {
    'zh-CN': '订单已取消',
    'en-US': '订单已取消',
    'ja-JP': '订单已取消',
  },
  BIZ_1NNJI51: {
    'zh-CN': '订单已确认',
    'en-US': '订单已确认',
    'ja-JP': '订单已确认',
  },
  BIZ_1O8QV30: {
    'zh-CN': '匿名寄养家庭',
    'en-US': '匿名寄养家庭',
    'ja-JP': '匿名寄养家庭',
  },
  BIZ_1OBA4CI: {
    'zh-CN': '商品不存在',
    'en-US': '商品不存在',
    'ja-JP': '商品不存在',
  },
  BIZ_1ODKPLN: {
    'zh-CN': '商品已删除',
    'en-US': '商品已删除',
    'ja-JP': '商品已删除',
  },
  BIZ_1PEC2N1: {
    'zh-CN': 'AROORO用户',
    'en-US': 'AROORO用户',
    'ja-JP': 'AROORO用户',
  },
  BIZ_1RI9QFY: {
    'zh-CN': '服务人员均接受过应急处理培训，如遇紧急情况会第一时间联系您并协助送医。平台也提供服务保障，具体可查看保障条款。',
    'en-US': '服务人员均接受过应急处理培训，如遇紧急情况会第一时间联系您并协助送医。平台也提供服务保障，具体可查看保障条款。',
    'ja-JP': '服务人员均接受过应急处理培训，如遇紧急情况会第一时间联系您并协助送医。平台也提供服务保障，具体可查看保障条款。',
  },
  BIZ_1RJIW0I: {
    'zh-CN': '请尽快完成支付',
    'en-US': '请尽快完成支付',
    'ja-JP': '请尽快完成支付',
  },
  BIZ_1TV95J2: {
    'zh-CN': '登录状态检查失败',
    'en-US': '登录状态检查失败',
    'ja-JP': '登录状态检查失败',
  },
  BIZ_1UDBLZX: {
    'zh-CN': '未设置名称',
    'en-US': '未设置名称',
    'ja-JP': '未设置名称',
  },
  BIZ_1UGW5S9: {
    'zh-CN': '宠物体重必须在 0-200kg 之间',
    'en-US': '宠物体重必须在 0-200kg 之间',
    'ja-JP': '宠物体重必须在 0-200kg 之间',
  },
  BIZ_1VT7QXX: {
    'zh-CN': '缺少hostProfileId',
    'en-US': '缺少hostProfileId',
    'ja-JP': '缺少hostProfileId',
  },
  BIZ_1VUH63C: {
    'zh-CN': '平台已接单，将安排服务人员上门',
    'en-US': '平台已接单，将安排服务人员上门',
    'ja-JP': '平台已接单，将安排服务人员上门',
  },
  BIZ_1W1XKN3: {
    'zh-CN': '精选好物推荐',
    'en-US': '精选好物推荐',
    'ja-JP': '精选好物推荐',
  },
  BIZ_1XSVTVU: {
    'zh-CN': '购物车为空',
    'en-US': '购物车为空',
    'ja-JP': '购物车为空',
  },
  BIZ_1YAL3OK: {
    'zh-CN': '订单已支付，等待寄养家庭确认',
    'en-US': '订单已支付，等待寄养家庭确认',
    'ja-JP': '订单已支付，等待寄养家庭确认',
  },
  BIZ_1Z0VNVW: {
    'zh-CN': '每日遛弯和陪伴',
    'en-US': '每日遛弯和陪伴',
    'ja-JP': '每日遛弯和陪伴',
  },
  BIZ_24KPRW: {
    'zh-CN': '请重新支付或稍后再试',
    'en-US': '请重新支付或稍后再试',
    'ja-JP': '请重新支付或稍后再试',
  },
  BIZ_2OOTHG: {
    'zh-CN': '管理活动与报名',
    'en-US': '管理活动与报名',
    'ja-JP': '管理活动与报名',
  },
  BIZ_3VOVIA: {
    'zh-CN': '订单已完成，感谢您的信任',
    'en-US': '订单已完成，感谢您的信任',
    'ja-JP': '订单已完成，感谢您的信任',
  },
  BIZ_3VZAQZ: {
    'zh-CN': '订单已完成，感谢您的购买',
    'en-US': '订单已完成，感谢您的购买',
    'ja-JP': '订单已完成，感谢您的购买',
  },
  BIZ_414LG6: {
    'zh-CN': '您需要先登录才能创建宠物档案',
    'en-US': '您需要先登录才能创建宠物档案',
    'ja-JP': '您需要先登录才能创建宠物档案',
  },
  BIZ_54TFDI: {
    'zh-CN': 'AROORO - 安心寄养，让爱宠如家',
    'en-US': 'AROORO - 安心寄养，让爱宠如家',
    'ja-JP': 'AROORO - 安心寄养，让爱宠如家',
  },
  BIZ_58QYH9: {
    'zh-CN': '跳转失败：',
    'en-US': '跳转失败：',
    'ja-JP': '跳转失败：',
  },
  BIZ_5FQ2WS: {
    'zh-CN': '每日照片和视频反馈',
    'en-US': '每日照片和视频反馈',
    'ja-JP': '每日照片和视频反馈',
  },
  BIZ_5W6CCO: {
    'zh-CN': '宠物寄养服务进行中',
    'en-US': '宠物寄养服务进行中',
    'ja-JP': '宠物寄养服务进行中',
  },
  BIZ_6RDYGY: {
    'zh-CN': '查看视频列表',
    'en-US': '查看视频列表',
    'ja-JP': '查看视频列表',
  },
  BIZ_7234ES: {
    'zh-CN': '可以临时取消预约吗？',
    'en-US': '可以临时取消预约吗？',
    'ja-JP': '可以临时取消预约吗？',
  },
  BIZ_7H4HFG: {
    'zh-CN': '商品正在配送中，请注意查收',
    'en-US': '商品正在配送中，请注意查收',
    'ja-JP': '商品正在配送中，请注意查收',
  },
  BIZ_8JZI7N: {
    'zh-CN': '服务开始前2小时可免费取消，2小时内取消将收取订单金额30%的违约金。',
    'en-US': '服务开始前2小时可免费取消，2小时内取消将收取订单金额30%的违约金。',
    'ja-JP': '服务开始前2小时可免费取消，2小时内取消将收取订单金额30%的违约金。',
  },
  BIZ_8LTG81: {
    'zh-CN': '创建宠物档案失败',
    'en-US': '创建宠物档案失败',
    'ja-JP': '创建宠物档案失败',
  },
  BIZ_8PK9ZT: {
    'zh-CN': '服务人员正在为您服务',
    'en-US': '服务人员正在为您服务',
    'ja-JP': '服务人员正在为您服务',
  },
  BIZ_9570QV: {
    'zh-CN': '/images/icons/service-line.svg',
    'en-US': '/images/icons/service-line.svg',
    'ja-JP': '/images/icons/service-line.svg',
  },
  BIZ_A0D703: {
    'zh-CN': '订单已创建，您可以稍后在订单中重新支付。',
    'en-US': '订单已创建，您可以稍后在订单中重新支付。',
    'ja-JP': '订单已创建，您可以稍后在订单中重新支付。',
  },
  BIZ_A0MKA1: {
    'zh-CN': '请在个人中心联系客服',
    'en-US': '请在个人中心联系客服',
    'ja-JP': '请在个人中心联系客服',
  },
  BIZ_AGSVKI: {
    'zh-CN': '上门服务',
    'en-US': '上门服务',
    'ja-JP': '上门服务',
  },
  BIZ_AHB1BY: {
    'zh-CN': '便携水碗',
    'en-US': '便携水碗',
    'ja-JP': '便携水碗',
  },
  BIZ_AJ90BY: {
    'zh-CN': '位置权限',
    'en-US': '位置权限',
    'ja-JP': '位置权限',
  },
  BIZ_ALYIUL: {
    'zh-CN': '其他活动',
    'en-US': '其他活动',
    'ja-JP': '其他活动',
  },
  BIZ_ANBU56: {
    'zh-CN': '/人  ¥',
    'en-US': '/人  ¥',
    'ja-JP': '/人  ¥',
  },
  BIZ_AO5NVS: {
    'zh-CN': '冰垫冰窝',
    'en-US': '冰垫冰窝',
    'ja-JP': '冰垫冰窝',
  },
  BIZ_AQQA8J: {
    'zh-CN': '剪刀梳子',
    'en-US': '剪刀梳子',
    'ja-JP': '剪刀梳子',
  },
  BIZ_AR8ZM4: {
    'zh-CN': '创建活动',
    'en-US': '创建活动',
    'ja-JP': '创建活动',
  },
  BIZ_ASCZJR: {
    'zh-CN': '健骨补钙',
    'en-US': '健骨补钙',
    'ja-JP': '健骨补钙',
  },
  BIZ_AU8Z3E: {
    'zh-CN': '免费参加',
    'en-US': '免费参加',
    'ja-JP': '免费参加',
  },
  BIZ_AVA8YU: {
    'zh-CN': '确定结束此活动？',
    'en-US': '确定结束此活动？',
    'ja-JP': '确定结束此活动？',
  },
  BIZ_AVWK5P: {
    'zh-CN': '获取宠物列表失败',
    'en-US': '获取宠物列表失败',
    'ja-JP': '获取宠物列表失败',
  },
  BIZ_AWUOSE: {
    'zh-CN': '即将开始',
    'en-US': '即将开始',
    'ja-JP': '即将开始',
  },
  BIZ_AX323V: {
    'zh-CN': '即将过期',
    'en-US': '即将过期',
    'ja-JP': '即将过期',
  },
  BIZ_AX9TQ9: {
    'zh-CN': '洗澡和美容服务',
    'en-US': '洗澡和美容服务',
    'ja-JP': '洗澡和美容服务',
  },
  BIZ_AZLJXZ: {
    'zh-CN': '删除订单',
    'en-US': '删除订单',
    'ja-JP': '删除订单',
  },
  BIZ_B1DRZ9: {
    'zh-CN': '取消订单',
    'en-US': '取消订单',
    'ja-JP': '取消订单',
  },
  BIZ_B4BO8J: {
    'zh-CN': '口腔护理',
    'en-US': '口腔护理',
    'ja-JP': '口腔护理',
  },
  BIZ_B4Q6UZ: {
    'zh-CN': '商城订单',
    'en-US': '商城订单',
    'ja-JP': '商城订单',
  },
  BIZ_BCGMK6: {
    'zh-CN': '四季通用',
    'en-US': '四季通用',
    'ja-JP': '四季通用',
  },
  BIZ_BD21FW: {
    'zh-CN': '固定金额',
    'en-US': '固定金额',
    'ja-JP': '固定金额',
  },
  BIZ_BGUS51: {
    'zh-CN': '城市公园',
    'en-US': '城市公园',
    'ja-JP': '城市公园',
  },
  BIZ_BJUOQM: {
    'zh-CN': '团购订单',
    'en-US': '团购订单',
    'ja-JP': '团购订单',
  },
  BIZ_BOL76P: {
    'zh-CN': '培训课程',
    'en-US': '培训课程',
    'ja-JP': '培训课程',
  },
  BIZ_BQGK3Q: {
    'zh-CN': '修改活动信息',
    'en-US': '修改活动信息',
    'ja-JP': '修改活动信息',
  },
  BIZ_BTDW7: {
    'zh-CN': '上传中',
    'en-US': '上传中',
    'ja-JP': '上传中',
  },
  BIZ_BVKPP: {
    'zh-CN': '不存在',
    'en-US': '不存在',
    'ja-JP': '不存在',
  },
  BIZ_BVZ5QY: {
    'zh-CN': '安全围栏',
    'en-US': '安全围栏',
    'ja-JP': '安全围栏',
  },
  BIZ_BVZHVR: {
    'zh-CN': '定位失败',
    'en-US': '定位失败',
    'ja-JP': '定位失败',
  },
  BIZ_BWDGEG: {
    'zh-CN': '家中有人',
    'en-US': '家中有人',
    'ja-JP': '家中有人',
  },
  BIZ_BWKO32: {
    'zh-CN': '室内活动',
    'en-US': '室内活动',
    'ja-JP': '室内活动',
  },
  BIZ_BX1ZCE: {
    'zh-CN': '寄养家庭',
    'en-US': '寄养家庭',
    'ja-JP': '寄养家庭',
  },
  BIZ_BX46V0: {
    'zh-CN': '家庭寄养',
    'en-US': '家庭寄养',
    'ja-JP': '家庭寄养',
  },
  BIZ_BXA2JU: {
    'zh-CN': '寄养订单',
    'en-US': '寄养订单',
    'ja-JP': '寄养订单',
  },
  BIZ_BZAY35: {
    'zh-CN': '寄思物品',
    'en-US': '寄思物品',
    'ja-JP': '寄思物品',
  },
  BIZ_BZJPR5: {
    'zh-CN': '客服中心',
    'en-US': '客服中心',
    'ja-JP': '客服中心',
  },
  BIZ_C0JP5: {
    'zh-CN': '不确定',
    'en-US': '不确定',
    'ja-JP': '不确定',
  },
  BIZ_C16B6U: {
    'zh-CN': '宠物乐园',
    'en-US': '宠物乐园',
    'ja-JP': '宠物乐园',
  },
  BIZ_C179P0: {
    'zh-CN': '宠物厕所',
    'en-US': '宠物厕所',
    'ja-JP': '宠物厕所',
  },
  BIZ_C17HZL: {
    'zh-CN': '宠物商城',
    'en-US': '宠物商城',
    'ja-JP': '宠物商城',
  },
  BIZ_C18D1X: {
    'zh-CN': '宠物好物',
    'en-US': '宠物好物',
    'ja-JP': '宠物好物',
  },
  BIZ_C18KHS: {
    'zh-CN': '宠物寄养',
    'en-US': '宠物寄养',
    'ja-JP': '宠物寄养',
  },
  BIZ_C18ONP: {
    'zh-CN': '宠物尿垫',
    'en-US': '宠物尿垫',
    'ja-JP': '宠物尿垫',
  },
  BIZ_C1A91J: {
    'zh-CN': '宠物推车',
    'en-US': '宠物推车',
    'ja-JP': '宠物推车',
  },
  BIZ_C4FFD: {
    'zh-CN': '二维码',
    'en-US': '二维码',
    'ja-JP': '二维码',
  },
  BIZ_C5Q3R: {
    'zh-CN': '不锈钢',
    'en-US': '不锈钢',
    'ja-JP': '不锈钢',
  },
  BIZ_CCCOY: {
    'zh-CN': '全品类',
    'en-US': '全品类',
    'ja-JP': '全品类',
  },
  BIZ_CEG165: {
    'zh-CN': '应激舒缓',
    'en-US': '应激舒缓',
    'ja-JP': '应激舒缓',
  },
  BIZ_CFO1Q5: {
    'zh-CN': '已选: ',
    'en-US': '已选: ',
    'ja-JP': '已选: ',
  },
  BIZ_CM8YOV: {
    'zh-CN': '心脏泌尿',
    'en-US': '心脏泌尿',
    'ja-JP': '心脏泌尿',
  },
  BIZ_COOCT: {
    'zh-CN': '可上门',
    'en-US': '可上门',
    'ja-JP': '可上门',
  },
  BIZ_CRJ7BG: {
    'zh-CN': '户外活动',
    'en-US': '户外活动',
    'ja-JP': '户外活动',
  },
  BIZ_CRMVKR: {
    'zh-CN': '户外花园',
    'en-US': '户外花园',
    'ja-JP': '户外花园',
  },
  BIZ_CS596Z: {
    'zh-CN': '我报名的',
    'en-US': '我报名的',
    'ja-JP': '我报名的',
  },
  BIZ_CSIK0: {
    'zh-CN': '加载中',
    'en-US': '加载中',
    'ja-JP': '加载中',
  },
  BIZ_CSP56O: {
    'zh-CN': '报名截止',
    'en-US': '报名截止',
    'ja-JP': '报名截止',
  },
  BIZ_CT4R6R: {
    'zh-CN': '洗护·喂养',
    'en-US': '洗护·喂养',
    'ja-JP': '洗护·喂养',
  },
  BIZ_CTXL6O: {
    'zh-CN': '截止报名',
    'en-US': '截止报名',
    'ja-JP': '截止报名',
  },
  BIZ_CU6NP: {
    'zh-CN': '去登录',
    'en-US': '去登录',
    'ja-JP': '去登录',
  },
  BIZ_CV3AU4: {
    'zh-CN': '我的宠物',
    'en-US': '我的宠物',
    'ja-JP': '我的宠物',
  },
  BIZ_CXZ6Z: {
    'zh-CN': '去设置',
    'en-US': '去设置',
    'ja-JP': '去设置',
  },
  BIZ_CZKRSG: {
    'zh-CN': '成长发育',
    'en-US': '成长发育',
    'ja-JP': '成长发育',
  },
  BIZ_CZL6CF: {
    'zh-CN': '抑菌除螨',
    'en-US': '抑菌除螨',
    'ja-JP': '抑菌除螨',
  },
  BIZ_D2WZAF: {
    'zh-CN': '服务人员是否经过审核？',
    'en-US': '服务人员是否经过审核？',
    'ja-JP': '服务人员是否经过审核？',
  },
  BIZ_D3H31V: {
    'zh-CN': '支付提示',
    'en-US': '支付提示',
    'ja-JP': '支付提示',
  },
  BIZ_D402B9: {
    'zh-CN': '收入概览',
    'en-US': '收入概览',
    'ja-JP': '收入概览',
  },
  BIZ_D4AWTZ: {
    'zh-CN': '推荐用户',
    'en-US': '推荐用户',
    'ja-JP': '推荐用户',
  },
  BIZ_DCOTNR: {
    'zh-CN': '服务订单',
    'en-US': '服务订单',
    'ja-JP': '服务订单',
  },
  BIZ_DG5B5: {
    'zh-CN': '外出包',
    'en-US': '外出包',
    'ja-JP': '外出包',
  },
  BIZ_DGL1Q5: {
    'zh-CN': '智能产品',
    'en-US': '智能产品',
    'ja-JP': '智能产品',
  },
  BIZ_DIF31R: {
    'zh-CN': '未知城市',
    'en-US': '未知城市',
    'ja-JP': '未知城市',
  },
  BIZ_DIFUH0: {
    'zh-CN': '未知宠物',
    'en-US': '未知宠物',
    'ja-JP': '未知宠物',
  },
  BIZ_DIPRG1: {
    'zh-CN': '未知错误',
    'en-US': '未知错误',
    'ja-JP': '未知错误',
  },
  BIZ_DLJHN: {
    'zh-CN': '处理中',
    'en-US': '处理中',
    'ja-JP': '处理中',
  },
  BIZ_DLUR7D: {
    'zh-CN': '查看订单',
    'en-US': '查看订单',
    'ja-JP': '查看订单',
  },
  BIZ_DUE3K: {
    'zh-CN': '宠团团',
    'en-US': '宠团团',
    'ja-JP': '宠团团',
  },
  BIZ_DZO3: {
    'zh-CN': '主粮',
    'en-US': '主粮',
    'ja-JP': '主粮',
  },
  BIZ_E0X4: {
    'zh-CN': '保健',
    'en-US': '保健',
    'ja-JP': '保健',
  },
  BIZ_E15D2: {
    'zh-CN': '密码锁',
    'en-US': '密码锁',
    'ja-JP': '密码锁',
  },
  BIZ_E361: {
    'zh-CN': '保密',
    'en-US': '保密',
    'ja-JP': '保密',
  },
  BIZ_E3MR: {
    'zh-CN': '不限',
    'en-US': '不限',
    'ja-JP': '不限',
  },
  BIZ_E4OKK2: {
    'zh-CN': '活动管理',
    'en-US': '活动管理',
    'ja-JP': '活动管理',
  },
  BIZ_E4R43K: {
    'zh-CN': '活动订单',
    'en-US': '活动订单',
    'ja-JP': '活动订单',
  },
  BIZ_E5DCO: {
    'zh-CN': '已付款',
    'en-US': '已付款',
    'ja-JP': '已付款',
  },
  BIZ_E5JAZ: {
    'zh-CN': '已使用',
    'en-US': '已使用',
    'ja-JP': '已使用',
  },
  BIZ_E6EI0: {
    'zh-CN': '已发货',
    'en-US': '已发货',
    'ja-JP': '已发货',
  },
  BIZ_E6ZO47: {
    'zh-CN': '比赛赛事',
    'en-US': '比赛赛事',
    'ja-JP': '比赛赛事',
  },
  BIZ_E702: {
    'zh-CN': '健康',
    'en-US': '健康',
    'ja-JP': '健康',
  },
  BIZ_E7ADWP: {
    'zh-CN': '浴巾湿巾',
    'en-US': '浴巾湿巾',
    'ja-JP': '浴巾湿巾',
  },
  BIZ_E7HBQ: {
    'zh-CN': '已完成',
    'en-US': '已完成',
    'ja-JP': '已完成',
  },
  BIZ_E8H49A: {
    'zh-CN': '泪痕调理',
    'en-US': '泪痕调理',
    'ja-JP': '泪痕调理',
  },
  BIZ_EAE8: {
    'zh-CN': '其他',
    'en-US': '其他',
    'ja-JP': '其他',
  },
  BIZ_ECMEG: {
    'zh-CN': '已确认',
    'en-US': '已确认',
    'ja-JP': '已确认',
  },
  BIZ_EDO6J: {
    'zh-CN': '待付款',
    'en-US': '待付款',
    'ja-JP': '待付款',
  },
  BIZ_EEG0N: {
    'zh-CN': '待发布',
    'en-US': '待发布',
    'ja-JP': '待发布',
  },
  BIZ_EEPBV: {
    'zh-CN': '待发货',
    'en-US': '待发货',
    'ja-JP': '待发货',
  },
  BIZ_EGE5M: {
    'zh-CN': '已过期',
    'en-US': '已过期',
    'ja-JP': '已过期',
  },
  BIZ_EGSAB: {
    'zh-CN': '已配置',
    'en-US': '已配置',
    'ja-JP': '已配置',
  },
  BIZ_EHBDA: {
    'zh-CN': '待支付',
    'en-US': '待支付',
    'ja-JP': '待支付',
  },
  BIZ_EKX8B: {
    'zh-CN': '待确认',
    'en-US': '待确认',
    'ja-JP': '待确认',
  },
  BIZ_ELQK: {
    'zh-CN': '免费',
    'en-US': '免费',
    'ja-JP': '免费',
  },
  BIZ_EN40: {
    'zh-CN': '全部',
    'en-US': '全部',
    'ja-JP': '全部',
  },
  BIZ_ERTE: {
    'zh-CN': '发布',
    'en-US': '发布',
    'ja-JP': '发布',
  },
  BIZ_ES9K: {
    'zh-CN': '周一',
    'en-US': '周一',
    'ja-JP': '周一',
  },
  BIZ_ES9T: {
    'zh-CN': '周三',
    'en-US': '周三',
    'ja-JP': '周三',
  },
  BIZ_ESDG: {
    'zh-CN': '周二',
    'en-US': '周二',
    'ja-JP': '周二',
  },
  BIZ_ESDO: {
    'zh-CN': '周五',
    'en-US': '周五',
    'ja-JP': '周五',
  },
  BIZ_ESXX: {
    'zh-CN': '周六',
    'en-US': '周六',
    'ja-JP': '周六',
  },
  BIZ_EU0J: {
    'zh-CN': '周四',
    'en-US': '周四',
    'ja-JP': '周四',
  },
  BIZ_EU2PVY: {
    'zh-CN': '牵引套装',
    'en-US': '牵引套装',
    'ja-JP': '牵引套装',
  },
  BIZ_EUVJ9: {
    'zh-CN': '报名中',
    'en-US': '报名中',
    'ja-JP': '报名中',
  },
  BIZ_EW0SN: {
    'zh-CN': '拾便器',
    'en-US': '拾便器',
    'ja-JP': '拾便器',
  },
  BIZ_EWBD4: {
    'zh-CN': '手机号',
    'en-US': '手机号',
    'ja-JP': '手机号',
  },
  BIZ_EWZH: {
    'zh-CN': '周日',
    'en-US': '周日',
    'ja-JP': '周日',
  },
  BIZ_EYYX19: {
    'zh-CN': '环境除臭',
    'en-US': '环境除臭',
    'ja-JP': '环境除臭',
  },
  BIZ_EZIG: {
    'zh-CN': '商城',
    'en-US': '商城',
    'ja-JP': '商城',
  },
  BIZ_EZP5: {
    'zh-CN': '喂养',
    'en-US': '喂养',
    'ja-JP': '喂养',
  },
  BIZ_F0AER8: {
    'zh-CN': '独立房间',
    'en-US': '独立房间',
    'ja-JP': '独立房间',
  },
  BIZ_F58X: {
    'zh-CN': '周边',
    'en-US': '周边',
    'ja-JP': '周边',
  },
  BIZ_F5IB: {
    'zh-CN': '嘴套',
    'en-US': '嘴套',
    'ja-JP': '嘴套',
  },
  BIZ_F63VG8: {
    'zh-CN': '留在本页',
    'en-US': '留在本页',
    'ja-JP': '留在本页',
  },
  BIZ_F6CTXR: {
    'zh-CN': '存放快递柜',
    'en-US': '存放快递柜',
    'ja-JP': '存放快递柜',
  },
  BIZ_FD64DW: {
    'zh-CN': '下单过程中出现错误，订单已创建，您可以在订单中完成支付。',
    'en-US': '下单过程中出现错误，订单已创建，您可以在订单中完成支付。',
    'ja-JP': '下单过程中出现错误，订单已创建，您可以在订单中完成支付。',
  },
  BIZ_FD7PYN: {
    'zh-CN': '申请状态',
    'en-US': '申请状态',
    'ja-JP': '申请状态',
  },
  BIZ_FHYDW: {
    'zh-CN': '服务师',
    'en-US': '服务师',
    'ja-JP': '服务师',
  },
  BIZ_FI59V: {
    'zh-CN': '未使用',
    'en-US': '未使用',
    'ja-JP': '未使用',
  },
  BIZ_FJGVS: {
    'zh-CN': '未填写',
    'en-US': '未填写',
    'ja-JP': '未填写',
  },
  BIZ_FJWR: {
    'zh-CN': '团购',
    'en-US': '团购',
    'ja-JP': '团购',
  },
  BIZ_FMNGKM: {
    'zh-CN': '社交聚会',
    'en-US': '社交聚会',
    'ja-JP': '社交聚会',
  },
  BIZ_FN5PZC: {
    'zh-CN': '眼部清洁',
    'en-US': '眼部清洁',
    'ja-JP': '眼部清洁',
  },
  BIZ_FPKJOV: {
    'zh-CN': '秋冬窝垫',
    'en-US': '秋冬窝垫',
    'ja-JP': '秋冬窝垫',
  },
  BIZ_FPPWM: {
    'zh-CN': '有经验',
    'en-US': '有经验',
    'ja-JP': '有经验',
  },
  BIZ_FQWK14: {
    'zh-CN': '稍后再说',
    'en-US': '稍后再说',
    'ja-JP': '稍后再说',
  },
  BIZ_FR4W: {
    'zh-CN': '妹妹',
    'en-US': '妹妹',
    'ja-JP': '妹妹',
  },
  BIZ_FROTRU: {
    'zh-CN': '确认删除',
    'en-US': '确认删除',
    'ja-JP': '确认删除',
  },
  BIZ_FRRM3P: {
    'zh-CN': '确认操作',
    'en-US': '确认操作',
    'ja-JP': '确认操作',
  },
  BIZ_FRROCF: {
    'zh-CN': '确认支付',
    'en-US': '确认支付',
    'ja-JP': '确认支付',
  },
  BIZ_FRS0TJ: {
    'zh-CN': '确认收货',
    'en-US': '确认收货',
    'ja-JP': '确认收货',
  },
  BIZ_FTE97: {
    'zh-CN': '未配置',
    'en-US': '未配置',
    'ja-JP': '未配置',
  },
  BIZ_FXD0RZ: {
    'zh-CN': '笼子围栏',
    'en-US': '笼子围栏',
    'ja-JP': '笼子围栏',
  },
  BIZ_G20N: {
    'zh-CN': '寄养',
    'en-US': '寄养',
    'ja-JP': '寄养',
  },
  BIZ_G7NT: {
    'zh-CN': '宠物',
    'en-US': '宠物',
    'ja-JP': '宠物',
  },
  BIZ_GBGR95: {
    'zh-CN': '线下活动',
    'en-US': '线下活动',
    'ja-JP': '线下活动',
  },
  BIZ_GFJ2YH: {
    'zh-CN': '结束活动',
    'en-US': '结束活动',
    'ja-JP': '结束活动',
  },
  BIZ_GJGKZX: {
    'zh-CN': '美毛护肤',
    'en-US': '美毛护肤',
    'ja-JP': '美毛护肤',
  },
  BIZ_GLVXQO: {
    'zh-CN': '需要获取您的位置信息以选择活动地点',
    'en-US': '需要获取您的位置信息以选择活动地点',
    'ja-JP': '需要获取您的位置信息以选择活动地点',
  },
  BIZ_GMLT8O: {
    'zh-CN': '编辑活动',
    'en-US': '编辑活动',
    'ja-JP': '编辑活动',
  },
  BIZ_GNVI: {
    'zh-CN': '异宠',
    'en-US': '异宠',
    'ja-JP': '异宠',
  },
  BIZ_GOB: {
    'zh-CN': '/人',
    'en-US': '/人',
    'ja-JP': '/人',
  },
  BIZ_GP9C: {
    'zh-CN': '弟弟',
    'en-US': '弟弟',
    'ja-JP': '弟弟',
  },
  BIZ_GR05: {
    'zh-CN': '待定',
    'en-US': '待定',
    'ja-JP': '待定',
  },
  BIZ_GRKQTI: {
    'zh-CN': '肠胃调理',
    'en-US': '肠胃调理',
    'ja-JP': '肠胃调理',
  },
  BIZ_GRS2E4: {
    'zh-CN': '耳道清洁',
    'en-US': '耳道清洁',
    'ja-JP': '耳道清洁',
  },
  BIZ_GS5L6L: {
    'zh-CN': '加载活动详情失败:',
    'en-US': '加载活动详情失败:',
    'ja-JP': '加载活动详情失败:',
  },
  BIZ_GUNX5B: {
    'zh-CN': '确定重新发布此活动？',
    'en-US': '确定重新发布此活动？',
    'ja-JP': '确定重新发布此活动？',
  },
  BIZ_H0LXPY: {
    'zh-CN': '营养补充',
    'en-US': '营养补充',
    'ja-JP': '营养补充',
  },
  BIZ_H1EYQT: {
    'zh-CN': '萌宠周边',
    'en-US': '萌宠周边',
    'ja-JP': '萌宠周边',
  },
  BIZ_H6N3Z: {
    'zh-CN': '爱干净',
    'en-US': '爱干净',
    'ja-JP': '爱干净',
  },
  BIZ_H6NI7: {
    'zh-CN': '犬主粮',
    'en-US': '犬主粮',
    'ja-JP': '犬主粮',
  },
  BIZ_H70F: {
    'zh-CN': '户外',
    'en-US': '户外',
    'ja-JP': '户外',
  },
  BIZ_H8ECZ: {
    'zh-CN': '牵引绳',
    'en-US': '牵引绳',
    'ja-JP': '牵引绳',
  },
  BIZ_H99OE: {
    'zh-CN': '猫主粮',
    'en-US': '猫主粮',
    'ja-JP': '猫主粮',
  },
  BIZ_HB63: {
    'zh-CN': '折扣',
    'en-US': '折扣',
    'ja-JP': '折扣',
  },
  BIZ_HCS62: {
    'zh-CN': '犬玩具',
    'en-US': '犬玩具',
    'ja-JP': '犬玩具',
  },
  BIZ_HFEC9: {
    'zh-CN': '猫玩具',
    'en-US': '猫玩具',
    'ja-JP': '猫玩具',
  },
  BIZ_HFEI: {
    'zh-CN': '拍照',
    'en-US': '拍照',
    'ja-JP': '拍照',
  },
  BIZ_HJ6FP: {
    'zh-CN': '犬零食',
    'en-US': '犬零食',
    'ja-JP': '犬零食',
  },
  BIZ_HLSLW: {
    'zh-CN': '猫零食',
    'en-US': '猫零食',
    'ja-JP': '猫零食',
  },
  BIZ_HM4CB0: {
    'zh-CN': '确定发布此活动？',
    'en-US': '确定发布此活动？',
    'ja-JP': '确定发布此活动？',
  },
  BIZ_HN56: {
    'zh-CN': '提示',
    'en-US': '提示',
    'ja-JP': '提示',
  },
  BIZ_HSNAZU: {
    'zh-CN': '可以指定同一位服务人员吗？',
    'en-US': '可以指定同一位服务人员吗？',
    'ja-JP': '可以指定同一位服务人员吗？',
  },
  BIZ_HYHL9N: {
    'zh-CN': '宠物服务师',
    'en-US': '宠物服务师',
    'ja-JP': '宠物服务师',
  },
  BIZ_HYWFKI: {
    'zh-CN': '订单详情',
    'en-US': '订单详情',
    'ja-JP': '订单详情',
  },
  BIZ_HZCK: {
    'zh-CN': '服务',
    'en-US': '服务',
    'ja-JP': '服务',
  },
  BIZ_I008Q3: {
    'zh-CN': '请先登录',
    'en-US': '请先登录',
    'ja-JP': '请先登录',
  },
  BIZ_I0L2WR: {
    'zh-CN': '获取宠物详情失败',
    'en-US': '获取宠物详情失败',
    'ja-JP': '获取宠物详情失败',
  },
  BIZ_I1Y3: {
    'zh-CN': '昵称',
    'en-US': '昵称',
    'ja-JP': '昵称',
  },
  BIZ_I6THQ5: {
    'zh-CN': '超值拼团',
    'en-US': '超值拼团',
    'ja-JP': '超值拼团',
  },
  BIZ_I7EJ: {
    'zh-CN': '未知',
    'en-US': '未知',
    'ja-JP': '未知',
  },
  BIZ_I96IG: {
    'zh-CN': '知道了',
    'en-US': '知道了',
    'ja-JP': '知道了',
  },
  BIZ_IA1K: {
    'zh-CN': '服装',
    'en-US': '服装',
    'ja-JP': '服装',
  },
  BIZ_IDC3: {
    'zh-CN': '服饰',
    'en-US': '服饰',
    'ja-JP': '服饰',
  },
  BIZ_IE0D: {
    'zh-CN': '权限',
    'en-US': '权限',
    'ja-JP': '权限',
  },
  BIZ_IIFI5W: {
    'zh-CN': '退出登录',
    'en-US': '退出登录',
    'ja-JP': '退出登录',
  },
  BIZ_IKXBEC: {
    'zh-CN': '选择城市',
    'en-US': '选择城市',
    'ja-JP': '选择城市',
  },
  BIZ_IKY2TL: {
    'zh-CN': '选择宠物',
    'en-US': '选择宠物',
    'ja-JP': '选择宠物',
  },
  BIZ_ITBW9H: {
    'zh-CN': '重新发布',
    'en-US': '重新发布',
    'ja-JP': '重新发布',
  },
  BIZ_ITERM4: {
    'zh-CN': '重新支付',
    'en-US': '重新支付',
    'ja-JP': '重新支付',
  },
  BIZ_J171: {
    'zh-CN': '活动',
    'en-US': '活动',
    'ja-JP': '活动',
  },
  BIZ_J81: {
    'zh-CN': '/宠',
    'en-US': '/宠',
    'ja-JP': '/宠',
  },
  BIZ_JB4E: {
    'zh-CN': '满减',
    'en-US': '满减',
    'ja-JP': '满减',
  },
  BIZ_JB8C: {
    'zh-CN': '清洁',
    'en-US': '清洁',
    'ja-JP': '清洁',
  },
  BIZ_JKZ6SO: {
    'zh-CN': '领券中心',
    'en-US': '领券中心',
    'ja-JP': '领券中心',
  },
  BIZ_JL0I82: {
    'zh-CN': '领养活动',
    'en-US': '领养活动',
    'ja-JP': '领养活动',
  },
  BIZ_JNV35: {
    'zh-CN': '航空箱',
    'en-US': '航空箱',
    'ja-JP': '航空箱',
  },
  BIZ_JTUXGG: {
    'zh-CN': '香波护毛',
    'en-US': '香波护毛',
    'ja-JP': '香波护毛',
  },
  BIZ_JZNK: {
    'zh-CN': '牵引',
    'en-US': '牵引',
    'ja-JP': '牵引',
  },
  BIZ_K1Y7: {
    'zh-CN': '猫咪',
    'en-US': '猫咪',
    'ja-JP': '猫咪',
  },
  BIZ_K4BY: {
    'zh-CN': '玩具',
    'en-US': '玩具',
    'ja-JP': '玩具',
  },
  BIZ_K52LUG: {
    'zh-CN': '上门服务需要我准备什么？',
    'en-US': '上门服务需要我准备什么？',
    'ja-JP': '上门服务需要我准备什么？',
  },
  BIZ_K5WG: {
    'zh-CN': '狗狗',
    'en-US': '狗狗',
    'ja-JP': '狗狗',
  },
  BIZ_KSWYO2: {
    'zh-CN': '服务时长是多久？',
    'en-US': '服务时长是多久？',
    'ja-JP': '服务时长是多久？',
  },
  BIZ_L1YE: {
    'zh-CN': '社交',
    'en-US': '社交',
    'ja-JP': '社交',
  },
  BIZ_L2PGX: {
    'zh-CN': '请登录',
    'en-US': '请登录',
    'ja-JP': '请登录',
  },
  BIZ_LAWQ: {
    'zh-CN': '窝具',
    'en-US': '窝具',
    'ja-JP': '窝具',
  },
  BIZ_LQ5Q4: {
    'zh-CN': '进行中',
    'en-US': '进行中',
    'ja-JP': '进行中',
  },
  BIZ_LSYB42: {
    'zh-CN': '加载数据失败，请重试',
    'en-US': '加载数据失败，请重试',
    'ja-JP': '加载数据失败，请重试',
  },
  BIZ_MN6C: {
    'zh-CN': '胸背',
    'en-US': '胸背',
    'ja-JP': '胸背',
  },
  BIZ_MTVQO8: {
    'zh-CN': '数据未能保存，请检查网络连接后重试',
    'en-US': '数据未能保存，请检查网络连接后重试',
    'ja-JP': '数据未能保存，请检查网络连接后重试',
  },
  BIZ_MVYV1C: {
    'zh-CN': '商品不可购买',
    'en-US': '商品不可购买',
    'ja-JP': '商品不可购买',
  },
  BIZ_ND3U3L: {
    'zh-CN': '管理寄养家庭信息',
    'en-US': '管理寄养家庭信息',
    'ja-JP': '管理寄养家庭信息',
  },
  BIZ_NVE8AC: {
    'zh-CN': '精彩社区活动',
    'en-US': '精彩社区活动',
    'ja-JP': '精彩社区活动',
  },
  BIZ_O06W: {
    'zh-CN': '规格',
    'en-US': '规格',
    'ja-JP': '规格',
  },
  BIZ_OGC6: {
    'zh-CN': '训练',
    'en-US': '训练',
    'ja-JP': '训练',
  },
  BIZ_OUGZQX: {
    'zh-CN': '服务过程中宠物出现问题怎么办？',
    'en-US': '服务过程中宠物出现问题怎么办？',
    'ja-JP': '服务过程中宠物出现问题怎么办？',
  },
  BIZ_OXMZ0V: {
    'zh-CN': '等待寄养家庭确认您的订单',
    'en-US': '等待寄养家庭确认您的订单',
    'ja-JP': '等待寄养家庭确认您的订单',
  },
  BIZ_PADF: {
    'zh-CN': '邮箱',
    'en-US': '邮箱',
    'ja-JP': '邮箱',
  },
  BIZ_PVLULF: {
    'zh-CN': '需要获取您的位置信息以推荐附近服务',
    'en-US': '需要获取您的位置信息以推荐附近服务',
    'ja-JP': '需要获取您的位置信息以推荐附近服务',
  },
  BIZ_Q8G1: {
    'zh-CN': '陶瓷',
    'en-US': '陶瓷',
    'ja-JP': '陶瓷',
  },
  BIZ_QA05: {
    'zh-CN': '鞋子',
    'en-US': '鞋子',
    'ja-JP': '鞋子',
  },
  BIZ_QEUN: {
    'zh-CN': '项圈',
    'en-US': '项圈',
    'ja-JP': '项圈',
  },
  BIZ_QG6W: {
    'zh-CN': '食具',
    'en-US': '食具',
    'ja-JP': '食具',
  },
  BIZ_QIKS: {
    'zh-CN': '面议',
    'en-US': '面议',
    'ja-JP': '面议',
  },
  BIZ_QILL: {
    'zh-CN': '零食',
    'en-US': '零食',
    'ja-JP': '零食',
  },
  BIZ_QKB5: {
    'zh-CN': '饰品',
    'en-US': '饰品',
    'ja-JP': '饰品',
  },
  BIZ_QLGYOR: {
    'zh-CN': '上传超时，请稍后重试',
    'en-US': '上传超时，请稍后重试',
    'ja-JP': '上传超时，请稍后重试',
  },
  BIZ_R03590: {
    'zh-CN': '提供舒适的寄养环境',
    'en-US': '提供舒适的寄养环境',
    'ja-JP': '提供舒适的寄养环境',
  },
  BIZ_R2EP4: {
    'zh-CN': '查看审核进度',
    'en-US': '查看审核进度',
    'ja-JP': '查看审核进度',
  },
  BIZ_RM9YKH: {
    'zh-CN': '/images/icons/share-luxury-arrow.svg',
    'en-US': '/images/icons/share-luxury-arrow.svg',
    'ja-JP': '/images/icons/share-luxury-arrow.svg',
  },
  BIZ_TPU7LQ: {
    'zh-CN': '购物车数据异常',
    'en-US': '购物车数据异常',
    'ja-JP': '购物车数据异常',
  },
  BIZ_VOA0RD: {
    'zh-CN': '宠物名称不能超过 20 个字符',
    'en-US': '宠物名称不能超过 20 个字符',
    'ja-JP': '宠物名称不能超过 20 个字符',
  },
  BIZ_VTS3P8: {
    'zh-CN': '保存中...',
    'en-US': '保存中...',
    'ja-JP': '保存中...',
  },
  BIZ_WS2EDE: {
    'zh-CN': '您需要先登录才能编辑个人信息',
    'en-US': '您需要先登录才能编辑个人信息',
    'ja-JP': '您需要先登录才能编辑个人信息',
  },
  BIZ_XOJLY8: {
    'zh-CN': '创建中...',
    'en-US': '创建中...',
    'ja-JP': '创建中...',
  },
  BIZ_XPBL7V: {
    'zh-CN': '专业宠物寄养服务，提供24小时贴心照顾',
    'en-US': '专业宠物寄养服务，提供24小时贴心照顾',
    'ja-JP': '专业宠物寄养服务，提供24小时贴心照顾',
  },
  BIZ_YMBMOP: {
    'zh-CN': '确定要取消该订单吗？',
    'en-US': '确定要取消该订单吗？',
    'ja-JP': '确定要取消该订单吗？',
  },
  BIZ_YTA9SC: {
    'zh-CN': '猫咪+狗狗',
    'en-US': '猫咪+狗狗',
    'ja-JP': '猫咪+狗狗',
  },

  BIZ_160DFJX: {
    'zh-CN': '需要合作伙伴权限',
    'en-US': '需要合作伙伴权限',
    'ja-JP': '需要合作伙伴权限',
  },

  BIZ_1GAJRYU: {
    'zh-CN': '请填写 value',
    'en-US': '请填写 value',
    'ja-JP': '请填写 value',
  },
  BIZ_1MF0P9X: {
    'zh-CN': '不支持的 locale',
    'en-US': '不支持的 locale',
    'ja-JP': '不支持的 locale',
  },
  BIZ_E6C0B: {
    'zh-CN': '已启用',
    'en-US': '已启用',
    'ja-JP': '已启用',
  },
  BIZ_ECOJD: {
    'zh-CN': '已禁用',
    'en-US': '已禁用',
    'ja-JP': '已禁用',
  },
  BIZ_GLEHGH: {
    'zh-CN': '网络错误',
    'en-US': '网络错误',
    'ja-JP': '网络错误',
  },
  BIZ_TRMNPG: {
    'zh-CN': '请填写 key',
    'en-US': '请填写 key',
    'ja-JP': '请填写 key',
  },

  BIZ_1077CQO: {
    'zh-CN': 'AROORO 寄养家庭',
    'en-US': 'AROORO 寄养家庭',
    'ja-JP': 'AROORO 寄养家庭',
  },
  BIZ_1KPKI9Y: {
    'zh-CN': '宠物优选好物',
    'en-US': '宠物优选好物',
    'ja-JP': '宠物优选好物',
  },
  BIZ_9570QV_2: {
    'zh-CN': 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/service-line.svg',
    'en-US': 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/service-line.svg',
    'ja-JP': 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/service-line.svg',
  },
  BIZ_P8XTPQ: {
    'zh-CN': 'AROORO 宠物服务详情',
    'en-US': 'AROORO 宠物服务详情',
    'ja-JP': 'AROORO 宠物服务详情',
  },
  BIZ_RM9YKH_2: {
    'zh-CN': 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/share-luxury-arrow.svg',
    'en-US': 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/share-luxury-arrow.svg',
    'ja-JP': 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/share-luxury-arrow.svg',
  },
  BIZ_TNRJ2L: {
    'zh-CN': 'AROORO - 宠物服务一站式体验',
    'en-US': 'AROORO - 宠物服务一站式体验',
    'ja-JP': 'AROORO - 宠物服务一站式体验',
  },

  BIZ_1YDPGC: {
    'zh-CN': '无合作伙伴权限',
    'en-US': '无合作伙伴权限',
    'ja-JP': '无合作伙伴权限',
  },

  // 微信官方"确认收货"组件相关提示
  WXCONFIRM_INVOKED: {
    'zh-CN': '请在弹出的确认页面中确认',
    'en-US': 'Please confirm in the popup',
    'ja-JP': 'ポップアップで確認してください',
  },
  WXCONFIRM_SUCCESS: {
    'zh-CN': '确认收货成功',
    'en-US': 'Receipt confirmed',
    'ja-JP': '受領確認が完了しました',
  },
  WXCONFIRM_FAILED: {
    'zh-CN': '确认失败，请稍后重试',
    'en-US': 'Confirmation failed, please retry',
    'ja-JP': '確認に失敗しました。後でもう一度お試しください',
  },
  WX_UPGRADE_REQUIRED: {
    'zh-CN': '请升级到最新微信版本',
    'en-US': 'Please upgrade to the latest WeChat',
    'ja-JP': '最新版の WeChat にアップグレードしてください',
  },
  WXCONFIRM_NO_TXID: {
    'zh-CN': '订单缺少支付流水号，无法确认收货',
    'en-US': 'Missing transaction id, cannot confirm',
    'ja-JP': '取引 ID がありません。確認できません',
  },
}

/** 错误码字典（与 cloudfunctions/common/errors-i18n.ts 对齐） */
const ERROR_I18N = {
  INVALID_PARAMS: { 'zh-CN': '参数错误', 'en-US': 'Invalid parameters', 'ja-JP': 'パラメータエラー' },
  MISSING_REQUIRED: { 'zh-CN': '缺少必填项', 'en-US': 'Missing required fields', 'ja-JP': '必須項目が未入力です' },
  AUTH_REQUIRED: { 'zh-CN': '请先登录', 'en-US': 'Please sign in first', 'ja-JP': 'ログインが必要です' },
  TOKEN_EXPIRED: { 'zh-CN': '登录已过期，请重新登录', 'en-US': 'Session expired, please sign in again', 'ja-JP': 'セッションの有効期限が切れました' },
  TOKEN_INVALID: { 'zh-CN': '登录凭证无效', 'en-US': 'Invalid authentication token', 'ja-JP': '無効な認証トークンです' },
  WX_LOGIN_FAILED: { 'zh-CN': '微信登录失败', 'en-US': 'WeChat login failed', 'ja-JP': 'WeChatログインに失敗しました' },
  PERMISSION_DENIED: { 'zh-CN': '无权限操作', 'en-US': 'Permission denied', 'ja-JP': '操作権限がありません' },
  PARTNER_REQUIRED: { 'zh-CN': '需要合作伙伴身份', 'en-US': 'Partner role required', 'ja-JP': 'パートナー権限が必要です' },
  ADMIN_REQUIRED: { 'zh-CN': '需要管理员身份', 'en-US': 'Admin role required', 'ja-JP': '管理者権限が必要です' },
  SUPER_ADMIN_REQUIRED: { 'zh-CN': '需要超级管理员身份', 'en-US': 'Super admin role required', 'ja-JP': 'スーパー管理者権限が必要です' },
  NOT_FOUND: { 'zh-CN': '数据不存在', 'en-US': 'Resource not found', 'ja-JP': 'データが存在しません' },
  ORDER_NOT_FOUND: { 'zh-CN': '订单不存在', 'en-US': 'Order not found', 'ja-JP': '注文が見つかりません' },
  USER_NOT_FOUND: { 'zh-CN': '用户不存在', 'en-US': 'User not found', 'ja-JP': 'ユーザーが見つかりません' },
  HOST_NOT_FOUND: { 'zh-CN': '寄养家庭不存在', 'en-US': 'Host family not found', 'ja-JP': 'ホストファミリーが見つかりません' },
  PET_NOT_FOUND: { 'zh-CN': '宠物不存在', 'en-US': 'Pet not found', 'ja-JP': 'ペットが見つかりません' },
  PRODUCT_NOT_FOUND: { 'zh-CN': '商品不存在', 'en-US': 'Product not found', 'ja-JP': '商品が見つかりません' },
  COUPON_NOT_FOUND: { 'zh-CN': '优惠券不存在', 'en-US': 'Coupon not found', 'ja-JP': 'クーポンが見つかりません' },
  ACTIVITY_NOT_FOUND: { 'zh-CN': '活动不存在', 'en-US': 'Activity not found', 'ja-JP': 'アクティビティが見つかりません' },
  BANNER_NOT_FOUND: { 'zh-CN': '轮播图不存在', 'en-US': 'Banner not found', 'ja-JP': 'バナーが見つかりません' },
  DUPLICATE_KEY: { 'zh-CN': '数据重复', 'en-US': 'Duplicate entry', 'ja-JP': 'データの重複' },
  DB_ERROR: { 'zh-CN': '数据操作失败', 'en-US': 'Database error', 'ja-JP': 'データベースエラー' },
  DATA_ERROR: { 'zh-CN': '数据异常', 'en-US': 'Data error', 'ja-JP': 'データエラー' },
  ORDER_CREATE_FAILED: { 'zh-CN': '订单创建失败', 'en-US': 'Failed to create order', 'ja-JP': '注文の作成に失敗しました' },
  ORDER_STATUS_INVALID: { 'zh-CN': '订单状态不允许此操作', 'en-US': 'Order status does not allow this action', 'ja-JP': '注文ステータスではこの操作を実行できません' },
  ORDER_ALREADY_PAID: { 'zh-CN': '订单已支付', 'en-US': 'Order already paid', 'ja-JP': '注文はすでに支払われています' },
  ORDER_ALREADY_REFUNDED: { 'zh-CN': '订单已退款', 'en-US': 'Order already refunded', 'ja-JP': '注文はすでに返金されています' },
  ORDER_TIMEOUT: { 'zh-CN': '订单已超时', 'en-US': 'Order timed out', 'ja-JP': '注文のタイムアウト' },
  REFUND_FAILED: { 'zh-CN': '退款失败', 'en-US': 'Refund failed', 'ja-JP': '返金に失敗しました' },
  PAYMENT_CREATE_FAILED: { 'zh-CN': '支付下单失败', 'en-US': 'Failed to create payment', 'ja-JP': '支払いの作成に失敗しました' },
  PAYMENT_NOTIFY_INVALID: { 'zh-CN': '支付回调异常', 'en-US': 'Invalid payment notification', 'ja-JP': '支払い通知が無効です' },
  PAYMENT_AMOUNT_MISMATCH: { 'zh-CN': '支付金额不一致', 'en-US': 'Payment amount mismatch', 'ja-JP': '支払い金額が一致しません' },
  WECHAT_API_ERROR: { 'zh-CN': '微信接口异常', 'en-US': 'WeChat API error', 'ja-JP': 'WeChat APIエラー' },
  STOCK_INSUFFICIENT: { 'zh-CN': '库存不足', 'en-US': 'Insufficient stock', 'ja-JP': '在庫不足' },
  ENCRYPT_FAILED: { 'zh-CN': '加密失败', 'en-US': 'Encryption failed', 'ja-JP': '暗号化に失敗しました' },
  DECRYPT_FAILED: { 'zh-CN': '解密失败', 'en-US': 'Decryption failed', 'ja-JP': '復号化に失敗しました' },
  INVALID_PAYLOAD: { 'zh-CN': '数据格式错误', 'en-US': 'Invalid payload', 'ja-JP': '無効なペイロード' },
  INTERNAL_ERROR: { 'zh-CN': '服务器内部错误', 'en-US': 'Internal server error', 'ja-JP': 'サーバー内部エラー' },
  SERVICE_UNAVAILABLE: { 'zh-CN': '服务暂不可用', 'en-US': 'Service temporarily unavailable', 'ja-JP': 'サービス一時停止中' },
  RATE_LIMITED: { 'zh-CN': '操作过于频繁，请稍后再试', 'en-US': 'Too many requests, please try again later', 'ja-JP': 'リクエストが多すぎます。しばらくしてから再度お試しください' },
  IDEMPOTENT_REPLAY: { 'zh-CN': '请勿重复提交', 'en-US': 'Duplicate submission detected', 'ja-JP': '重複送信が検出されました' },
  UNKNOWN_ACTION: { 'zh-CN': '未知操作', 'en-US': 'Unknown action', 'ja-JP': '不明な操作' },
  STATE_INVALID: { 'zh-CN': '状态非法', 'en-US': 'Invalid state', 'ja-JP': '無効な状態' },
  CATEGORY_HAS_PRODUCTS: { 'zh-CN': '该分类下存在商品，无法删除', 'en-US': 'Category has products, cannot delete', 'ja-JP': 'カテゴリに商品が存在するため削除できません' },
  COUPON_LIMIT_REACHED: { 'zh-CN': '已达到领取上限', 'en-US': 'Claim limit reached', 'ja-JP': '受取上限に達しました' },
  COUPON_STATUS_INVALID: { 'zh-CN': '优惠券状态不允许此操作', 'en-US': 'Coupon status does not allow this action', 'ja-JP': 'クーポンステータスではこの操作を実行できません' },
  ACTIVITY_HAS_REGISTRATIONS: { 'zh-CN': '活动已有报名，无法删除', 'en-US': 'Activity has registrations, cannot delete', 'ja-JP': 'アクティビティに申込者が存在するため削除できません' },
  BUSINESS_ERROR: { 'zh-CN': '业务处理失败', 'en-US': 'Business error', 'ja-JP': 'ビジネス処理エラー' },
  RISK_REJECT: { 'zh-CN': '请求被风控拒绝', 'en-US': 'Request rejected by risk control', 'ja-JP': 'リスク管理により拒否されました' },
  RISK_PENDING: { 'zh-CN': '请求已受理，待人工审核', 'en-US': 'Request received, pending manual review', 'ja-JP': 'リクエストを受理しました。人的審査待ちです' },
  RISK_PASS: { 'zh-CN': '风控检查通过', 'en-US': 'Risk check passed', 'ja-JP': 'リスクチェック合格' },
}

const SUPPORTED_LOCALES = ['zh-CN', 'en-US', 'ja-JP']
const DEFAULT_LOCALE = 'zh-CN'

// =====================================================================
// Locale 推断
// =====================================================================

/**
 * 把 wx.getAppBaseInfo().language 映射到受支持 locale
 *  - 'zh_CN' / 'zh-CN' → 'zh-CN'
 *  - 'en' / 'en_US' / 'en-US' → 'en-US'
 *  - 'ja' / 'ja_JP' / 'ja-JP' → 'ja-JP'
 *  - 其他 → 'zh-CN'（默认）
 */
function _mapSystemLanguage(lang) {
  if (!lang || typeof lang !== 'string') {return DEFAULT_LOCALE}
  const lower = lang.toLowerCase().replace('_', '-')
  if (lower.startsWith('zh')) {return 'zh-CN'}
  if (lower.startsWith('en')) {return 'en-US'}
  if (lower.startsWith('ja')) {return 'ja-JP'}
  return DEFAULT_LOCALE
}

function _detectSystemLocale() {
  try {
    if (typeof wx !== 'undefined') {
      const info = wx.getAppBaseInfo
        ? wx.getAppBaseInfo()
        : (wx.getSystemInfoSync ? wx.getSystemInfoSync() : {})
      return _mapSystemLanguage(info.language)
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_LOCALE
}

// =====================================================================
// 解析函数
// =====================================================================

let _currentLocale = (() => {
  // 1. 优先使用本地存储
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const stored = wx.getStorageSync(STORAGE_KEY)
      if (stored && SUPPORTED_LOCALES.includes(stored)) {return stored}
    }
  } catch (e) { /* ignore */ }
  // 2. 推断系统语言
  return _detectSystemLocale()
})()

/**
 * 解析一个 key 的本地化文案
 * @param {string} key - 业务常量 / 错误码
 * @param {string} [locale] - 显式指定 locale（不传则使用 currentLocale）
 */
function resolveI18n(key, locale) {
  const useLocale = locale || _currentLocale
  // 业务文案优先
  const bizDict = BIZ_I18N[key]
  if (bizDict) {
    if (bizDict[useLocale]) {return bizDict[useLocale]}
    if (bizDict[DEFAULT_LOCALE]) {return bizDict[DEFAULT_LOCALE]}
    return key
  }
  // 错误码字典
  const errDict = ERROR_I18N[key]
  if (errDict) {
    if (errDict[useLocale]) {return errDict[useLocale]}
    if (errDict[DEFAULT_LOCALE]) {return errDict[DEFAULT_LOCALE]}
    return key
  }
  // 未注册 key：返回 key 字面量
  return key
}

/**
 * 业务文案翻译（与错误码区分，避免误用）
 * @example
 *   t('OPERATION_SUCCESS')  // → '操作成功'
 */
function t(key, locale) {
  return resolveI18n(key, locale)
}

/**
 * 错误码转本地化文案
 * @param {string} code - 错误码（来自 res.error.type）
 * @param {string} [locale]
 * @returns {string} 本地化文案；若 code 未注册则返回原 code
 */
function getErrorMessage(code, locale) {
  if (!code) {return ''}
  return resolveI18n(code, locale)
}

/**
 * 把云函数返回的 res 解析为本地化错误文案
 * 优先级：
 *   1. res.message（云端已本地化，或被覆盖）
 *   2. res.error.type → i18n 字典
 *   3. 兜底为 BIZ_I18N.OPERATION_FAILED
 */
function resolveCloudErrorMessage(res, locale) {
  if (!res) {return ''}
  if (res.message) {return res.message}
  if (res.error && res.error.type) {
    return getErrorMessage(res.error.type, locale)
  }
  return resolveI18n('OPERATION_FAILED', locale)
}

// =====================================================================
// Locale 切换 / 持久化
// =====================================================================

function getLocale() {
  return _currentLocale
}

function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    return false
  }
  _currentLocale = locale
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(STORAGE_KEY, locale)
    }
  } catch (e) { /* ignore */ }
  return true
}

function getSupportedLocales() {
  return SUPPORTED_LOCALES.slice()
}

// =====================================================================
// 自定义覆盖（运营后台可热更新部分文案）
// =====================================================================

let _customOverrides = {}

/**
 * 注入自定义覆盖字典（覆盖同名 key 的所有 locale）
 * @param {Object} overrides - { KEY: { 'en-US': '...' } }
 */
function applyCustomOverrides(overrides) {
  if (overrides && typeof overrides === 'object') {
    _customOverrides = Object.assign({}, overrides)
  }
}

/**
 * 内部用：合并覆盖
 */
function _resolveWithOverride(key, locale) {
  if (_customOverrides[key] && _customOverrides[key][locale]) {
    return _customOverrides[key][locale]
  }
  return resolveI18n(key, locale)
}

// 暴露给 t/getErrorMessage 的统一入口
function _t(key, locale) {
  const useLocale = locale || _currentLocale
  if (_customOverrides[key] && _customOverrides[key][useLocale]) {
    return _customOverrides[key][useLocale]
  }
  return resolveI18n(key, useLocale)
}

// =====================================================================
// CDN 加载（运营可热更新文案）
// =====================================================================

/**
 * 从 CDN 加载某个 locale 的合并字典并应用为 override
 *
 * 模板支持：
 *   - {url: 'https://cdn.example.com/i18n/merged.{{locale}}.json'}
 *     自动替换 {{locale}} → 当前 locale（zh-CN / en-US / ja-JP）
 *   - 也支持纯 URL：{url: 'https://.../merged.en-US.json'}
 *
 * 加载策略：
 *   1. 优先用 wx.request（小程序原生网络）
 *   2. 失败时回落到内置字典，不抛错
 *   3. 加载成功后将所有 key 注入 _customOverrides（覆盖默认）
 *   4. 持久化 CDN URL + 时间戳到 storage，便于下次启动时校验
 *
 * @param {string} urlTemplate - URL 模板（带 {{locale}} 占位）
 * @param {string} [locale] - 显式指定 locale（默认使用 _currentLocale）
 * @returns {Promise<{loaded: number, locale: string, url: string}>}
 */
function loadFromCdn(urlTemplate, locale) {
  return new Promise(resolve => {
    const useLocale = locale || _currentLocale
    if (!urlTemplate || typeof urlTemplate !== 'string') {
      resolve({ loaded: 0, locale: useLocale, url: '', error: 'invalid_url' })
      return
    }
    const url = urlTemplate.replace(/\{\{locale\}\}/g, useLocale)
    // 持久化最近一次 CDN URL（便于下次启动时校验）
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync('app_i18n_cdn_url', urlTemplate)
        wx.setStorageSync('app_i18n_cdn_loaded_at', Date.now())
      }
    } catch (e) { /* ignore */ }

    if (typeof wx === 'undefined' || !wx.request) {
      // 非小程序环境（测试 / 调试）：直接 resolve
      resolve({ loaded: 0, locale: useLocale, url, error: 'no_wx' })
      return
    }

    wx.request({
      url,
      method: 'GET',
      timeout: 5000,
      success(res) {
        try {
          const data = res && res.data
          if (!data || typeof data !== 'object') {
            resolve({ loaded: 0, locale: useLocale, url, error: 'invalid_payload' })
            return
          }
          // CDN JSON 是合并字典：{ CODE: '翻译' }
          // 转化为 _customOverrides[CODE] = { 'zh-CN': '翻译' } 格式
          // 简化：把整个 data 当作当前 locale 的覆盖
          const overrides = {}
          for (const [key, val] of Object.entries(data)) {
            if (typeof val === 'string') {
              if (!overrides[key]) {overrides[key] = {}}
              overrides[key][useLocale] = val
            }
          }
          // 合并到 _customOverrides（CDN 覆盖内置）
          _customOverrides = Object.assign({}, _customOverrides, overrides)
          resolve({ loaded: Object.keys(overrides).length, locale: useLocale, url })
        } catch (e) {
          resolve({ loaded: 0, locale: useLocale, url, error: 'parse_failed' })
        }
      },
      fail(err) {
        resolve({ loaded: 0, locale: useLocale, url, error: (err && err.errMsg) || 'request_failed' })
      },
    })
  })
}

module.exports = {
  // API
  t: _t,
  getErrorMessage: (code, locale) => {
    const useLocale = locale || _currentLocale
    if (_customOverrides[code] && _customOverrides[code][useLocale]) {
      return _customOverrides[code][useLocale]
    }
    return getErrorMessage(code, useLocale)
  },
  resolveCloudErrorMessage,
  // Locale 管理
  getLocale,
  setLocale,
  getSupportedLocales,
  // 运营覆盖
  applyCustomOverrides,
  // CDN 加载
  loadFromCdn,
  // 常量（测试 / 调试用）
  BIZ_I18N,
  ERROR_I18N,
  DEFAULT_LOCALE,
}
