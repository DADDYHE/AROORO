/**
 * 用户管理器
 * 负责管理用户基本信息，处理用户资料更新，提供用户信息查询接口
 */

import { STORAGE_KEYS, TIME } from './constants';
import { getStorageManager } from './StorageManager';
import { getErrorHandler } from './ErrorHandler';

class UserManager {
  constructor() {
    this.storageManager = getStorageManager();
    this.errorHandler = getErrorHandler();
  }

  /**
   * 获取用户信息
   * @returns {Object|null} 用户信息
   */
  getUserInfo() {
    return this.storageManager.getUserInfo();
  }

  /**
   * 设置用户信息
   * @param {Object} userInfo - 用户信息
   * @returns {boolean} 是否设置成功
   */
  setUserInfo(userInfo) {
    return this.storageManager.saveUserInfo(userInfo);
  }

  /**
   * 获取用户角色
   * @returns {string} 用户角色
   */
  getUserRole() {
    return this.storageManager.getUserRole();
  }

  /**
   * 设置用户角色
   * @param {string} userRole - 用户角色
   * @returns {boolean} 是否设置成功
   */
  setUserRole(userRole) {
    return this.storageManager.saveUserRole(userRole);
  }

  /**
   * 获取宠物主人信息
   * @returns {Object|null} 宠物主人信息
   */
  getOwnerInfo() {
    return this.storageManager.getOwnerInfo();
  }

  /**
   * 设置宠物主人信息
   * @param {Object} ownerInfo - 宠物主人信息
   * @returns {boolean} 是否设置成功
   */
  setOwnerInfo(ownerInfo) {
    return this.storageManager.saveOwnerInfo(ownerInfo);
  }

  /**
   * 获取寄养家庭信息
   * @returns {Object|null} 寄养家庭信息
   */
  getHostInfo() {
    return this.storageManager.getHostInfo();
  }

  /**
   * 设置寄养家庭信息
   * @param {Object} hostInfo - 寄养家庭信息
   * @returns {boolean} 是否设置成功
   */
  setHostInfo(hostInfo) {
    return this.storageManager.saveHostInfo(hostInfo);
  }

  /**
   * 获取用户ID
   * @returns {string} 用户ID
   */
  getUserId() {
    return this.storageManager.getUserId();
  }

  /**
   * 设置用户ID
   * @param {string} userId - 用户ID
   * @returns {boolean} 是否设置成功
   */
  setUserId(userId) {
    return this.storageManager.saveUserId(userId);
  }

  /**
   * 获取用户openid
   * @returns {string} 用户openid
   */
  getOpenid() {
    const userInfo = this.getUserInfo();
    return userInfo ? userInfo.openid : '';
  }

  /**
   * 获取用户昵称
   * @returns {string} 用户昵称
   */
  getUserName() {
    const userInfo = this.getUserInfo();
    return userInfo ? (userInfo.name || userInfo.nickName || '') : '';
  }

  /**
   * 获取用户头像
   * @returns {string} 用户头像
   */
  getUserAvatar() {
    const userInfo = this.getUserInfo();
    return userInfo ? userInfo.avatarUrl || '' : '';
  }

  /**
   * 更新用户信息
   * @param {Object} userInfo - 用户信息
   * @returns {boolean} 是否更新成功
   */
  updateUserInfo(userInfo) {
    if (!userInfo) {
      return false;
    }
    
    // 获取现有用户信息
    const existingUserInfo = this.getUserInfo() || {};
    
    // 合并用户信息
    const updatedUserInfo = {
      ...existingUserInfo,
      ...userInfo
    };
    
    // 保存更新后的用户信息
    return this.setUserInfo(updatedUserInfo);
  }

  /**
   * 保存用户信息到本地存储
   * @param {Object} userInfo - 用户信息
   * @param {string} userRole - 用户角色
   * @returns {boolean} 是否保存成功
   */
  saveUserInfoToStorage(userInfo, userRole) {
    try {
      // 保存用户信息
      this.setUserInfo(userInfo);
      
      // 保存用户角色
      this.setUserRole(userRole);
      
      // 保存到对应的身份信息存储
      if (userRole === 'owner') {
        this.setOwnerInfo(userInfo);
      } else if (userRole === 'host') {
        this.setHostInfo(userInfo);
      }
      
      // 保存最后登录时间
      this.storageManager.saveLastLoginTime();
      
      // 保存登录过期时间
      this.storageManager.saveLoginExpiry(Date.now() + TIME.LOGIN_EXPIRY);
      
      return true;
    } catch (error) {
      console.error('保存用户信息到本地存储失败:', error);
      return false;
    }
  }

  /**
   * 清除用户信息
   * @returns {boolean} 是否清除成功
   */
  clearUserInfo() {
    return this.storageManager.clearUserStorage();
  }

  /**
   * 检查用户信息是否完整
   * @param {Object} userInfo - 用户信息
   * @returns {boolean} 是否完整
   */
  isUserInfoComplete(userInfo) {
    if (!userInfo) {
      return false;
    }
    
    return !!(userInfo._id || userInfo.openid);
  }

  /**
   * 获取用户身份信息
   * @param {string} roleType - 角色类型
   * @returns {Object|null} 身份信息
   */
  getIdentityInfo(roleType) {
    if (roleType === 'owner') {
      return this.getOwnerInfo();
    } else if (roleType === 'host') {
      return this.getHostInfo();
    }
    return null;
  }

  /**
   * 设置用户身份信息
   * @param {string} roleType - 角色类型
   * @param {Object} identityInfo - 身份信息
   * @returns {boolean} 是否设置成功
   */
  setIdentityInfo(roleType, identityInfo) {
    if (roleType === 'owner') {
      return this.setOwnerInfo(identityInfo);
    } else if (roleType === 'host') {
      return this.setHostInfo(identityInfo);
    }
    return false;
  }
}

// 导出单例
let userManagerInstance = null;

export function getUserManager() {
  if (!userManagerInstance) {
    userManagerInstance = new UserManager();
  }
  return userManagerInstance;
}

export default UserManager;
