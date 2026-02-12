/**
 * 登录模块入口
 * 提供统一的登录相关功能接口
 */

import { getLoginManager } from './LoginManager';
import { getUserSigManager } from './UserSigManager';

// 导入集中式身份管理器
const { centralIdentityManager } = require('../../../utils/CentralIdentityManager');
const { errorHandler } = require('../../../utils/errorHandler');

// 全局应用实例
let appInstance = null;

// 初始化模块
function init(app) {
  appInstance = app;
  console.log('登录模块初始化成功');
}

// 登录模块
export const AuthModule = {
  /**
   * 初始化登录模块
   * @param {Object} app - 应用实例
   */
  init,

  /**
   * 登录
   * @param {Object} options - 登录选项
   * @returns {Promise<Object>} 登录结果
   */
  async login(options = {}) {
    // 确保appInstance已初始化
    if (!appInstance) {
      appInstance = getApp();
    }
    const loginManager = getLoginManager(appInstance);
    if (!loginManager) {
      throw new Error('登录模块未初始化，请先调用init方法');
    }
    return loginManager.login(options);
  },

  /**
   * 退出登录
   * @param {boolean} showConfirm - 是否显示确认对话框
   * @returns {Promise<boolean>} 是否退出成功
   */
  async logout(showConfirm = true) {
    // 确保appInstance已初始化
    if (!appInstance) {
      appInstance = getApp();
    }
    const loginManager = getLoginManager(appInstance);
    if (!loginManager) {
      throw new Error('登录模块未初始化，请先调用init方法');
    }
    return loginManager.logout(showConfirm);
  },

  /**
   * 检查登录状态是否有效
   * @returns {boolean} 登录状态是否有效
   */
  checkLoginStatusValid() {
    // 确保appInstance已初始化
    if (!appInstance) {
      appInstance = getApp();
    }
    const loginManager = getLoginManager(appInstance);
    if (!loginManager) {
      return false;
    }
    return loginManager.checkLoginStatusValid();
  },

  /**
   * 检查是否已登录
   * @returns {boolean} 是否已登录
   */
  isLoggedIn() {
    // 确保appInstance已初始化
    if (!appInstance) {
      appInstance = getApp();
    }
    const loginManager = getLoginManager(appInstance);
    if (!loginManager) {
      return false;
    }
    return loginManager.isLoggedIn();
  },

  /**
   * 获取身份信息
   * @returns {Object} 身份信息
   */
  getIdentityInfo() {
    // 确保appInstance已初始化
    if (!appInstance) {
      appInstance = getApp();
    }
    const loginManager = getLoginManager(appInstance);
    if (!loginManager) {
      return {};
    }
    return loginManager.getIdentityInfo();
  },

  /**
   * 处理登录过期
   * @returns {Promise<boolean>} 是否处理成功
   */
  async handleLoginExpiry() {
    // 确保appInstance已初始化
    if (!appInstance) {
      appInstance = getApp();
    }
    const loginManager = getLoginManager(appInstance);
    if (!loginManager) {
      return false;
    }
    return loginManager.handleLoginExpiry();
  },

  /**
   * 获取用户信息
   * @returns {Object|null} 用户信息
   */
  getUserInfo() {
    const currentIdentity = centralIdentityManager.getCurrentIdentity();
    return currentIdentity ? { ...currentIdentity, ...currentIdentity.commonData } : null;
  },

  /**
   * 更新用户信息
   * @param {Object} userInfo - 用户信息
   * @returns {boolean} 是否更新成功
   */
  updateUserInfo(userInfo) {
    if (!userInfo) {
      return false;
    }
    
    const currentRole = centralIdentityManager.getCurrentRole();
    if (!currentRole) {
      return false;
    }
    
    const currentIdentity = centralIdentityManager.getCurrentIdentity();
    const updatedIdentity = {
      ...currentIdentity,
      ...userInfo,
      updatedAt: Date.now()
    };
    
    return centralIdentityManager.setIdentity(currentRole, updatedIdentity);
  },

  /**
   * 获取用户角色
   * @returns {string} 用户角色
   */
  getUserRole() {
    return centralIdentityManager.getCurrentRole();
  },

  /**
   * 获取角色列表
   * @returns {Array} 角色列表
   */
  getRoles() {
    return centralIdentityManager.getRoles();
  },

  /**
   * 设置角色列表
   * @param {Array} roles - 角色列表
   */
  setRoles(roles) {
    centralIdentityManager.setRoles(roles);
  },

  /**
   * 切换角色
   * @param {string} roleType - 角色类型
   * @returns {Promise<boolean>} 是否切换成功
   */
  async switchRole(roleType) {
    return centralIdentityManager.switchRole(roleType);
  },

  /**
   * 创建角色
   * @param {string} roleType - 角色类型
   * @param {Object} roleInfo - 角色信息
   * @returns {Promise<boolean>} 是否创建成功
   */
  async createRole(roleType, roleInfo) {
    return centralIdentityManager.createRole(roleType, roleInfo);
  },

  /**
   * 删除角色
   * @param {string} roleType - 角色类型
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteRole(roleType) {
    return centralIdentityManager.deleteRole(roleType);
  },

  /**
   * 更新角色信息
   * @param {string} roleType - 角色类型
   * @param {Object} roleInfo - 角色信息
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateRole(roleType, roleInfo) {
    return centralIdentityManager.updateRole(roleType, roleInfo);
  },

  /**
   * 获取UserSig
   * @param {string} roleType - 角色类型
   * @param {string} openid - 用户openid
   * @returns {string} UserSig
   */
  getUserSig(roleType, openid) {
    const userSigManager = getUserSigManager();
    return userSigManager.getUserSig(roleType, openid);
  },

  /**
   * 刷新UserSig
   * @param {string} roleType - 角色类型
   * @param {string} openid - 用户openid
   * @param {string} imUserID - IM用户ID
   * @returns {Promise<string|null>} 新的UserSig或null
   */
  async refreshUserSig(roleType, openid, imUserID = null) {
    const userSigManager = getUserSigManager();
    return userSigManager.refreshUserSig(roleType, openid, imUserID);
  },

  /**
   * 检查并刷新即将过期的UserSig
   * @param {string} openid - 用户openid
   * @returns {Promise<boolean>} 是否刷新成功
   */
  async checkAndRefreshUserSig(openid) {
    const userSigManager = getUserSigManager();
    return userSigManager.checkAndRefreshUserSig(openid);
  },

  /**
   * 清除UserSig缓存
   * @param {string} roleType - 角色类型（可选，不指定则清除所有）
   */
  clearUserSigCache(roleType = null) {
    const userSigManager = getUserSigManager();
    userSigManager.clearUserSigCache(roleType);
  },

  /**
   * 保存数据到本地存储
   * @param {string} key - 键名
   * @param {any} value - 值
   * @returns {boolean} 是否保存成功
   */
  saveToStorage(key, value) {
    return centralIdentityManager.set(key, value);
  },

  /**
   * 从本地存储获取数据
   * @param {string} key - 键名
   * @param {any} defaultValue - 默认值
   * @returns {any} 获取的数据或默认值
   */
  getFromStorage(key, defaultValue = null) {
    return centralIdentityManager.get(key, defaultValue);
  },

  /**
   * 从本地存储移除数据
   * @param {string} key - 键名
   * @returns {boolean} 是否移除成功
   */
  removeFromStorage(key) {
    try {
      wx.removeStorageSync(key);
      return true;
    } catch (error) {
      console.error('移除本地存储失败:', error);
      return false;
    }
  },

  /**
   * 清除本地存储
   * @returns {boolean} 是否清除成功
   */
  clearStorage() {
    try {
      wx.clearStorageSync();
      return true;
    } catch (error) {
      console.error('清除本地存储失败:', error);
      return false;
    }
  },

  /**
   * 显示错误提示
   * @param {Error} error - 错误对象
   * @param {Object} options - 提示选项
   */
  showError(error, options = {}) {
    errorHandler.showError(error, options);
  },

  /**
   * 显示成功提示
   * @param {string} message - 提示信息
   * @param {Object} options - 提示选项
   */
  showSuccess(message = '操作成功', options = {}) {
    errorHandler.showSuccess(message, options);
  },

  /**
   * 显示加载提示
   * @param {string} message - 提示信息
   * @param {Object} options - 提示选项
   */
  showLoading(message = '加载中...', options = {}) {
    errorHandler.showLoading(message, options);
  },

  /**
   * 隐藏加载提示
   */
  hideLoading() {
    errorHandler.hideLoading();
  },

  /**
   * 显示确认对话框
   * @param {string} title - 标题
   * @param {string} content - 内容
   * @param {Function} confirmCallback - 确认回调
   * @param {Function} cancelCallback - 取消回调
   * @param {Object} options - 对话框选项
   */
  showConfirm(title, content, confirmCallback, cancelCallback, options = {}) {
    errorHandler.showConfirm(title, content, confirmCallback, cancelCallback, options);
  },

  /**
   * 获取登录管理器
   * @returns {LoginManager} 登录管理器实例
   */
  getLoginManager() {
    return getLoginManager(appInstance);
  },

  /**
   * 获取用户管理器
   * @returns {CentralIdentityManager} 集中式身份管理器实例（替代UserManager）
   */
  getUserManager() {
    return centralIdentityManager;
  },

  /**
   * 获取集中式身份管理器
   * @returns {CentralIdentityManager} 集中式身份管理器实例
   */
  getRoleManager() {
    return centralIdentityManager;
  },

  /**
   * 获取UserSig管理器
   * @returns {UserSigManager} UserSig管理器实例
   */
  getUserSigManager() {
    return getUserSigManager();
  },

  /**
   * 获取存储管理器
   * @returns {CentralIdentityManager} 存储管理器实例（使用集中式身份管理器）
   */
  getStorageManager() {
    return centralIdentityManager;
  },

  /**
   * 获取错误处理器
   * @returns {ErrorHandler} 错误处理器实例
   */
  getErrorHandler() {
    return errorHandler;
  },
};

// 导出默认模块
export default AuthModule;
