/**
 * UserSig管理器
 * 负责生成和管理UserSig，处理UserSig缓存和过期
 */

const { TIME, ERROR_CODES } = require('./constants');
const { centralIdentityManager } = require('../../../utils/CentralIdentityManager');
const { errorHandler } = require('../../../utils/errorHandler');

class UserSigManager {
  constructor() {
    this.userSigCache = {};
    this.userSigExpiry = TIME.USER_SIG_EXPIRY;
    this.errorHandler = errorHandler;
    this.centralIdentityManager = centralIdentityManager;
  }

  /**
   * 生成缓存键名
   * @param {string} roleType - 角色类型
   * @param {string} openid - 用户openid
   * @returns {string} 缓存键名
   */
  _generateCacheKey(roleType, openid) {
    return `${roleType}_${openid}`;
  }

  /**
   * 缓存UserSig
   * @param {string} roleType - 角色类型
   * @param {string} openid - 用户openid
   * @param {string} userSig - UserSig
   */
  cacheUserSig(roleType, openid, userSig) {
    if (!userSig || userSig === 'testuser123' || userSig.length < 10) {
      console.warn('无效的userSig，不缓存');
      return;
    }
    
    const cacheKey = this._generateCacheKey(roleType, openid);
    this.userSigCache[cacheKey] = {
      userSig,
      cachedAt: Date.now(),
      expiry: Date.now() + this.userSigExpiry,
    };
    console.log('缓存userSig:', cacheKey);
    
    // 同时保存到本地存储
    try {
      wx.setStorageSync('central:userSig', userSig);
    } catch (error) {
      console.warn('保存UserSig到本地存储失败:', error);
    }
  }

  /**
   * 从缓存获取UserSig
   * @param {string} roleType - 角色类型
   * @param {string} openid - 用户openid
   * @returns {string|null} UserSig或null
   */
  getCachedUserSig(roleType, openid) {
    const cacheKey = this._generateCacheKey(roleType, openid);
    const cached = this.userSigCache[cacheKey];
    
    if (!cached) {
      // 尝试从本地存储获取
      try {
        const storedUserSig = wx.getStorageSync('central:userSig');
        if (storedUserSig) {
          console.log('从本地存储获取userSig');
          // 验证本地存储的UserSig格式
          if (!this.isValidUserSigFormat(storedUserSig)) {
            console.warn('本地存储中的UserSig格式无效，清除缓存');
            wx.setStorageSync('central:userSig', '');
            return null;
          }
          return storedUserSig;
        }
      } catch (error) {
        console.warn('从本地存储获取UserSig失败:', error);
      }
      return null;
    }

    // 检查是否过期
    if (Date.now() > cached.expiry) {
      console.log('userSig缓存过期:', cacheKey);
      delete this.userSigCache[cacheKey];
      return null;
    }

    // 验证缓存的userSig
    if (!cached.userSig || cached.userSig === 'testuser123' || cached.userSig.length < 10) {
      console.warn('缓存的userSig无效，清除缓存');
      delete this.userSigCache[cacheKey];
      return null;
    }

    // 验证UserSig格式
    if (!this.isValidUserSigFormat(cached.userSig)) {
      console.warn('缓存的UserSig格式无效，清除缓存');
      delete this.userSigCache[cacheKey];
      return null;
    }

    console.log('从缓存获取userSig:', cacheKey);
    return cached.userSig;
  }

  /**
   * 验证UserSig格式是否正确
   * @param {string} userSig - UserSig
   * @returns {boolean} 是否有效
   */
  isValidUserSigFormat(userSig) {
    try {
      // 检查UserSig基本有效性
      if (!userSig || typeof userSig !== 'string') {
        console.warn('UserSig格式无效：不是有效的字符串');
        return false;
      }
      
      // 检查长度
      if (userSig.length < 10) {
        console.warn('UserSig格式无效：长度过短');
        return false;
      }
      
      // 检查是否为测试值
      if (userSig === 'testuser123') {
        console.warn('UserSig格式无效：是测试值');
        return false;
      }
      
      // 注意：根据IM服务官方文档，UserSig格式可能与标准格式不同
      // 现在我们接受两种格式：
      // 1. 标准TLS格式（JSON结构）
      // 2. IM服务后台生成的格式（可能是压缩或加密格式）
      
      // 尝试标准TLS格式验证
      try {
        // 解码UserSig（兼容微信小程序环境）
        let decoded;
        if (typeof Buffer !== 'undefined') {
          // Node.js环境
          decoded = Buffer.from(userSig, 'base64').toString();
        } else if (typeof wx !== 'undefined' && wx.base64Decode) {
          // 微信小程序环境
          decoded = wx.base64Decode(userSig);
        } else {
          // 其他浏览器环境
          decoded = atob(userSig);
        }
        
        const userSigObj = JSON.parse(decoded);
        
        // 如果是标准TLS格式，检查必需字段
        if ('TLS.ver' in userSigObj) {
          console.log('UserSig格式：标准TLS格式');
          
          // 检查必需字段
          const requiredFields = ['TLS.ver', 'TLS.identifier', 'TLS.sdkappid', 'TLS.expire', 'TLS.time', 'TLS.random', 'TLS.sig'];
          for (const field of requiredFields) {
            if (!(field in userSigObj)) {
              console.warn('UserSig缺少必需字段:', field);
              return false;
            }
          }
          
          return true;
        }
      } catch (jsonError) {
        // JSON解析失败，可能是IM服务后台生成的其他格式
        console.log('UserSig格式：非标准JSON格式（可能是IM服务后台生成的格式）');
      }
      
      // 对于非标准格式，我们只做基本验证
      // 检查是否包含特殊字符（IM服务后台生成的UserSig可能包含*和-）
      const validChars = /^[A-Za-z0-9+\-*/=_]+$/;
      if (!validChars.test(userSig)) {
        console.warn('UserSig格式无效：包含非法字符');
        return false;
      }
      
      // 检查长度范围（IM服务后台生成的UserSig长度约为200-300字符）
      if (userSig.length < 100 || userSig.length > 500) {
        console.warn('UserSig格式无效：长度不在合理范围内');
        return false;
      }
      
      console.log('UserSig格式验证通过：非标准格式但基本有效');
      return true;
    } catch (error) {
      console.warn('UserSig格式验证失败:', error.message);
      return false;
    }
  }

  /**
   * 刷新UserSig
   * @param {string} roleType - 角色类型
   * @param {string} openid - 用户openid
   * @param {string} imUserID - IM用户ID
   * @returns {Promise<string|null>} 新的UserSig或null
   */
  async refreshUserSig(roleType, openid, imUserID = null) {
    try {
      console.log('开始刷新UserSig:', roleType, openid, 'IM用户ID:', imUserID);
      
      // 调用云函数获取新的UserSig
      const cloudRes = await wx.cloud.callFunction({
        name: 'login',
        data: {
          openid: openid,
          roleType: roleType,
          imUserID: imUserID,
          refreshUserSig: true,
        },
      });

      if (cloudRes.result.code === 0) {
        const userSig = cloudRes.result.userSig || (cloudRes.result.data && cloudRes.result.data.userSig);
        if (!userSig || userSig === 'testuser123' || userSig.length < 10) {
          console.error('刷新UserSig失败: userSig无效或为测试值');
          return null;
        }
        
        // 验证新的UserSig格式
        if (!this.isValidUserSigFormat(userSig)) {
          console.error('刷新UserSig失败: UserSig格式无效');
          return null;
        }
        
        // 缓存新的UserSig
        this.cacheUserSig(roleType, openid, userSig);
        
        console.log('UserSig刷新成功:', roleType, openid);
        console.log('新UserSig长度:', userSig.length);
        return userSig;
      } else {
        console.error('刷新UserSig失败:', cloudRes.result.message);
        return null;
      }
    } catch (error) {
      console.error('刷新UserSig异常:', error);
      return null;
    }
  }

  /**
   * 检查并刷新即将过期的UserSig
   * @param {string} openid - 用户openid
   * @returns {Promise<boolean>} 是否刷新成功
   */
  async checkAndRefreshUserSig(openid) {
    try {
      if (!openid) {
        return false;
      }
      
      const roles = ['owner', 'host'];
      
      for (const roleType of roles) {
        const userSig = this.getCachedUserSig(roleType, openid);
        if (!userSig) {
          // UserSig不存在或已过期，尝试刷新
          // 导入ID生成器
          const { generateIMUserId } = require('../../../utils/idGenerator');
          const imUserID = generateIMUserId(roleType, openid);
          await this.refreshUserSig(roleType, openid, imUserID);
        } else {
          // 检查UserSig是否即将过期（剩余时间小于1小时）
          const cacheKey = this._generateCacheKey(roleType, openid);
          const cached = this.userSigCache[cacheKey];
          if (cached) {
            const timeUntilExpiry = cached.expiry - Date.now();
            if (timeUntilExpiry < TIME.USER_SIG_REFRESH_THRESHOLD) {
              console.log('UserSig即将过期，开始刷新:', roleType);
              // 导入ID生成器
              const { generateIMUserId } = require('../../../utils/idGenerator');
              const imUserID = generateIMUserId(roleType, openid);
              await this.refreshUserSig(roleType, openid, imUserID);
            }
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('检查并刷新UserSig失败:', error);
      return false;
    }
  }

  /**
   * 清除UserSig缓存
   * @param {string} roleType - 角色类型（可选，不指定则清除所有）
   */
  clearUserSigCache(roleType = null) {
    if (roleType) {
      // 清除指定身份类型的所有缓存
      Object.keys(this.userSigCache).forEach(key => {
        if (key.startsWith(`${roleType}_`)) {
          delete this.userSigCache[key];
          console.log('清除userSig缓存:', key);
        }
      });
    } else {
      // 清除所有缓存
      this.userSigCache = {};
      console.log('清除所有userSig缓存');
      // 同时清除本地存储中的UserSig
      try {
        wx.setStorageSync('central:userSig', '');
      } catch (error) {
        console.warn('清除本地存储中的UserSig失败:', error);
      }
    }
  }

  /**
   * 获取UserSig
   * @param {string} roleType - 角色类型
   * @param {string} openid - 用户openid
   * @returns {string} UserSig
   */
  getUserSig(roleType, openid) {
    const userSig = this.getCachedUserSig(roleType, openid);
    if (userSig) {
      return userSig;
    }
    // 尝试从本地存储获取
    try {
      return wx.getStorageSync('central:userSig');
    } catch (error) {
      console.warn('从本地存储获取UserSig失败:', error);
      return null;
    }
  }

  /**
   * 验证UserSig是否有效
   * @param {string} userSig - UserSig
   * @returns {boolean} 是否有效
   */
  isValidUserSig(userSig) {
    return userSig && userSig !== 'testuser123' && userSig.length > 10;
  }

  /**
   * 获取UserSig状态
   * @param {string} roleType - 角色类型
   * @param {string} openid - 用户openid
   * @returns {object|null} UserSig状态
   */
  getUserSigStatus(roleType, openid) {
    const cacheKey = this._generateCacheKey(roleType, openid);
    const cached = this.userSigCache[cacheKey];
    
    if (!cached) {
      return null;
    }
    
    const now = Date.now();
    const timeRemaining = cached.expiry - now;
    const isExpiringSoon = timeRemaining < 60 * 60 * 1000; // 1小时内过期
    
    return {
      isExpiringSoon,
      timeRemaining,
      expiry: cached.expiry,
      cachedAt: cached.cachedAt
    };
  }
}

// 导出单例
let userSigManagerInstance = null;

function getUserSigManager() {
  if (!userSigManagerInstance) {
    userSigManagerInstance = new UserSigManager();
  }
  return userSigManagerInstance;
}

module.exports = {
  UserSigManager,
  getUserSigManager
};
