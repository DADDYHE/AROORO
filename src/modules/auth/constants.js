/**
 * 登录模块常量定义
 */

// 登录状态
export const LOGIN_STATUS = {
  LOGGED_OUT: 'logged_out',
  LOGGING_IN: 'logging_in',
  LOGGED_IN: 'logged_in',
  LOGIN_FAILED: 'login_failed'
};

// 身份类型
export const ROLE_TYPE = {
  OWNER: 'owner',
  HOST: 'host',
  GUEST: 'guest'
};

// 身份类型映射（短版本用于节省空间）
export const ROLE_TYPE_MAPPING = {
  'owner': 'own',
  'host': 'hst',
  'guest': 'gst'
};

// 存储键名
export const STORAGE_KEYS = {
  USER_INFO: 'userInfo',
  USER_ROLE: 'userRole',
  OWNER_INFO: 'ownerInfo',
  HOST_INFO: 'hostInfo',
  LAST_LOGIN_TIME: 'lastLoginTime',
  LOGIN_EXPIRY: 'loginExpiry',
  TOKEN: 'token',
  USER_SIG: 'userSig',
  USER_ID: 'userID',
  IS_LOGOUT: 'isLogout'
};

// 时间常量（毫秒）
export const TIME = {
  LOGIN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7天
  USER_SIG_EXPIRY: 24 * 60 * 60 * 1000, // 24小时
  USER_SIG_REFRESH_THRESHOLD: 60 * 60 * 1000, // 1小时
  NETWORK_CHECK_INTERVAL: 60 * 1000, // 1分钟
  DEBOUNCE_DELAY: 300 // 300毫秒
};

// 错误码
export const ERROR_CODES = {
  SUCCESS: 0,
  LOGIN_FAILED: 1001,
  NETWORK_ERROR: 1002,
  USER_INFO_ERROR: 1003,
  ROLE_ERROR: 1004,
  USER_SIG_ERROR: 1005,
  STORAGE_ERROR: 1006,
  CLOUD_FUNCTION_ERROR: 1007,
  UNKNOWN_ERROR: 9999
};

// 错误信息
export const ERROR_MESSAGES = {
  [ERROR_CODES.SUCCESS]: '操作成功',
  [ERROR_CODES.LOGIN_FAILED]: '登录失败',
  [ERROR_CODES.NETWORK_ERROR]: '网络错误',
  [ERROR_CODES.USER_INFO_ERROR]: '用户信息错误',
  [ERROR_CODES.ROLE_ERROR]: '身份错误',
  [ERROR_CODES.USER_SIG_ERROR]: 'UserSig错误',
  [ERROR_CODES.STORAGE_ERROR]: '存储错误',
  [ERROR_CODES.CLOUD_FUNCTION_ERROR]: '云函数错误',
  [ERROR_CODES.UNKNOWN_ERROR]: '未知错误'
};

// 微信云函数名称
export const CLOUD_FUNCTIONS = {
  LOGIN: 'login'
};

// 页面路径
export const PAGE_PATHS = {
  HOME: '/pages/home/index',
  CHOOSE_IDENTITY: '/pages/chooseIdentity/chooseIdentity'
};

// IM配置
export const IM_CONFIG = {
  SDKAppID: 1600123494, // 从腾讯云IM控制台获取的SDKAppID
  EXPIRE_TIME: 24 * 3600 // UserSig有效期24小时
};

// 最大用户ID长度
export const MAX_USER_ID_LENGTH = 30;
