/**
 * 存储管理器
 * 负责管理本地存储，处理数据持久化
 */

import { STORAGE_KEYS } from './constants';

class StorageManager {
  constructor() {
    this.prefix = 'auth_';
  }

  /**
   * 生成带前缀的存储键名
   * @param {string} key - 原始键名
   * @returns {string} 带前缀的键名
   */
  _getKeyWithPrefix(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * 保存数据到本地存储
   * @param {string} key - 键名
   * @param {any} value - 值
   * @returns {boolean} 是否保存成功
   */
  set(key, value) {
    try {
      const storageKey = this._getKeyWithPrefix(key);
      wx.setStorageSync(storageKey, value);
      return true;
    } catch (error) {
      console.error(`保存数据失败 [${key}]:`, error);
      return false;
    }
  }

  /**
   * 从本地存储获取数据
   * @param {string} key - 键名
   * @param {any} defaultValue - 默认值
   * @returns {any} 获取的数据或默认值
   */
  get(key, defaultValue = null) {
    try {
      const storageKey = this._getKeyWithPrefix(key);
      const value = wx.getStorageSync(storageKey);
      return value === undefined ? defaultValue : value;
    } catch (error) {
      console.error(`获取数据失败 [${key}]:`, error);
      return defaultValue;
    }
  }

  /**
   * 从本地存储移除数据
   * @param {string} key - 键名
   * @returns {boolean} 是否移除成功
   */
  remove(key) {
    try {
      const storageKey = this._getKeyWithPrefix(key);
      wx.removeStorageSync(storageKey);
      return true;
    } catch (error) {
      console.error(`移除数据失败 [${key}]:`, error);
      return false;
    }
  }

  /**
   * 清空所有存储数据
   * @returns {boolean} 是否清空成功
   */
  clear() {
    try {
      wx.clearStorageSync();
      return true;
    } catch (error) {
      console.error('清空存储失败:', error);
      return false;
    }
  }

  /**
   * 保存用户信息到本地存储
   * @param {Object} userInfo - 用户信息
   * @returns {boolean} 是否保存成功
   */
  saveUserInfo(userInfo) {
    return this.set(STORAGE_KEYS.USER_INFO, userInfo);
  }

  /**
   * 获取用户信息
   * @returns {Object|null} 用户信息
   */
  getUserInfo() {
    return this.get(STORAGE_KEYS.USER_INFO, null);
  }

  /**
   * 保存用户角色到本地存储
   * @param {string} userRole - 用户角色
   * @returns {boolean} 是否保存成功
   */
  saveUserRole(userRole) {
    return this.set(STORAGE_KEYS.USER_ROLE, userRole);
  }

  /**
   * 获取用户角色
   * @returns {string} 用户角色
   */
  getUserRole() {
    return this.get(STORAGE_KEYS.USER_ROLE, 'owner');
  }

  /**
   * 保存宠物主人信息到本地存储
   * @param {Object} ownerInfo - 宠物主人信息
   * @returns {boolean} 是否保存成功
   */
  saveOwnerInfo(ownerInfo) {
    return this.set(STORAGE_KEYS.OWNER_INFO, ownerInfo);
  }

  /**
   * 获取宠物主人信息
   * @returns {Object|null} 宠物主人信息
   */
  getOwnerInfo() {
    return this.get(STORAGE_KEYS.OWNER_INFO, null);
  }

  /**
   * 保存寄养家庭信息到本地存储
   * @param {Object} hostInfo - 寄养家庭信息
   * @returns {boolean} 是否保存成功
   */
  saveHostInfo(hostInfo) {
    return this.set(STORAGE_KEYS.HOST_INFO, hostInfo);
  }

  /**
   * 获取寄养家庭信息
   * @returns {Object|null} 寄养家庭信息
   */
  getHostInfo() {
    return this.get(STORAGE_KEYS.HOST_INFO, null);
  }

  /**
   * 保存最后登录时间
   * @returns {boolean} 是否保存成功
   */
  saveLastLoginTime() {
    return this.set(STORAGE_KEYS.LAST_LOGIN_TIME, Date.now());
  }

  /**
   * 获取最后登录时间
   * @returns {number} 最后登录时间戳
   */
  getLastLoginTime() {
    return this.get(STORAGE_KEYS.LAST_LOGIN_TIME, 0);
  }

  /**
   * 保存登录过期时间
   * @param {number} expiryTime - 过期时间戳
   * @returns {boolean} 是否保存成功
   */
  saveLoginExpiry(expiryTime) {
    return this.set(STORAGE_KEYS.LOGIN_EXPIRY, expiryTime);
  }

  /**
   * 获取登录过期时间
   * @returns {number} 过期时间戳
   */
  getLoginExpiry() {
    return this.get(STORAGE_KEYS.LOGIN_EXPIRY, 0);
  }

  /**
   * 保存token
   * @param {string} token - token
   * @returns {boolean} 是否保存成功
   */
  saveToken(token) {
    return this.set(STORAGE_KEYS.TOKEN, token);
  }

  /**
   * 获取token
   * @returns {string} token
   */
  getToken() {
    return this.get(STORAGE_KEYS.TOKEN, '');
  }

  /**
   * 保存UserSig
   * @param {string} userSig - UserSig
   * @returns {boolean} 是否保存成功
   */
  saveUserSig(userSig) {
    return this.set(STORAGE_KEYS.USER_SIG, userSig);
  }

  /**
   * 获取UserSig
   * @returns {string} UserSig
   */
  getUserSig() {
    return this.get(STORAGE_KEYS.USER_SIG, '');
  }

  /**
   * 保存用户ID
   * @param {string} userId - 用户ID
   * @returns {boolean} 是否保存成功
   */
  saveUserId(userId) {
    return this.set(STORAGE_KEYS.USER_ID, userId);
  }

  /**
   * 获取用户ID
   * @returns {string} 用户ID
   */
  getUserId() {
    return this.get(STORAGE_KEYS.USER_ID, '');
  }

  /**
   * 保存退出状态
   * @param {boolean} isLogout - 是否退出
   * @returns {boolean} 是否保存成功
   */
  saveLogoutStatus(isLogout) {
    return this.set(STORAGE_KEYS.IS_LOGOUT, isLogout);
  }

  /**
   * 获取退出状态
   * @returns {boolean} 是否退出
   */
  getLogoutStatus() {
    return this.get(STORAGE_KEYS.IS_LOGOUT, false);
  }

  /**
   * 清除用户相关存储
   * @returns {boolean} 是否清除成功
   */
  clearUserStorage() {
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        this.remove(key);
      });
      return true;
    } catch (error) {
      console.error('清除用户存储失败:', error);
      return false;
    }
  }
}

// 导出单例
let storageManagerInstance = null;

export function getStorageManager() {
  if (!storageManagerInstance) {
    storageManagerInstance = new StorageManager();
  }
  return storageManagerInstance;
}

export default StorageManager;
