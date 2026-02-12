/**
 * 登录管理器
 * 负责微信小程序登录流程，处理身份选择逻辑，协调其他模块工作，提供统一的登录接口
 */

import { CLOUD_FUNCTIONS, PAGE_PATHS, TIME } from './constants';
import { getUserSigManager } from './UserSigManager';
const { errorHandler } = require('../../../utils/errorHandler');

// 导入集中式身份管理器
const { centralIdentityManager, AUTH_EVENTS } = require('../../../utils/CentralIdentityManager');

// 导入监控管理器
const { monitoringManager, MONITORING_EVENTS, LOG_LEVELS } = require('../../../utils/monitoringManager');

// 导入统一ID生成模块
import { generateIMUserId } from '../../../utils/idGenerator';

// 登录状态
const LOGIN_STATES = {
  LOGGED_IN: 'logged_in',
  LOGGED_OUT: 'logged_out',
  LOGGING_IN: 'logging_in',
  LOGGING_OUT: 'logging_out'
};

// 状态键定义
const STATE_KEYS = {
  USER_INFO: 'userInfo',
  USER_ROLE: 'userRole',
  IM_LOGIN_STATUS: 'imLoginStatus',
  OWNER_INFO: 'ownerInfo',
  HOST_INFO: 'hostInfo'
};

class LoginManager {
  constructor(appInstance) {
    this.app = appInstance;
    this.errorHandler = errorHandler;
    this.userSigManager = getUserSigManager();
    this.isInitialized = false;
    this.eventListeners = {};
    this.performanceData = {};
  }

  /**
   * 微信小程序官方最新推荐的登录流程
   * @param {Object} options - 登录选项
   * @returns {Promise<Object>} 登录结果
   */
  async login(options = {}) {
    const loginStartTime = Date.now();
    const loginType = options.type || 'normal';
    const skipIdentityCheck = options.skipIdentityCheck || false;
    
    // 记录登录开始事件
    monitoringManager.recordEvent(MONITORING_EVENTS.LOGIN_START, {
      type: loginType,
      timestamp: loginStartTime,
      skipIdentityCheck: skipIdentityCheck
    });

    try {
      // 重置退出状态，允许登录
      if (this.app && this.app.globalData) {
        this.app.globalData.isLogout = false;
      }

      // 注意：登录时不在这里设置状态
      // 状态会在后续登录流程中自动设置

      // 检查是否已有有效的登录状态
      if (this.checkLoginStatusValid()) {
        const result = await this._handleExistingLoginState(loginType, skipIdentityCheck, loginStartTime);
        if (result) {
          return result;
        }
      }

      // 步骤1：直接调用 wx.login() 获取临时登录凭证 code
      return new Promise((resolve, reject) => {
        wx.login({
          success: async loginRes => {
            try {
              if (loginRes.code) {
                // 步骤2：将 code 传递给云函数，不传递用户信息
                const loginResult = await this.callLoginCloudFunction(loginRes.code, null);
                
                const loginEndTime = Date.now();
                const loginDuration = loginEndTime - loginStartTime;
                
                // 记录登录成功事件
                monitoringManager.recordEvent(MONITORING_EVENTS.LOGIN_SUCCESS, {
                  type: loginType,
                  duration: loginDuration,
                  message: '登录成功',
                  timestamp: loginEndTime
                });

                // 触发登录成功事件
                this._emitEvent(AUTH_EVENTS.LOGIN_SUCCESS, {
                  userInfo: this.currentUser,
                  userRole: this.currentRole,
                  duration: loginDuration,
                  timestamp: loginEndTime
                });
                
                resolve(loginResult);
              } else {
                console.error('wx.login 失败：', loginRes.errMsg);
                const loginEndTime = Date.now();
                const loginDuration = loginEndTime - loginStartTime;
                
                // 记录登录失败事件
                monitoringManager.recordEvent(MONITORING_EVENTS.LOGIN_FAILURE, {
                  type: loginType,
                  duration: loginDuration,
                  error: loginRes.errMsg,
                  timestamp: loginEndTime
                });

                // 触发登录失败事件
                this._emitEvent(AUTH_EVENTS.LOGIN_FAILURE, {
                  error: loginRes.errMsg,
                  duration: loginDuration,
                  timestamp: loginEndTime
                });
                
                reject(this.errorHandler.handleLoginError(loginRes.errMsg));
              }
            } catch (error) {
              const loginEndTime = Date.now();
              const loginDuration = loginEndTime - loginStartTime;
              
              // 记录登录失败事件
              monitoringManager.recordEvent(MONITORING_EVENTS.LOGIN_FAILURE, {
                type: loginType,
                duration: loginDuration,
                error: error.message || '未知错误',
                timestamp: loginEndTime
              });

              // 触发登录失败事件
              this._emitEvent(AUTH_EVENTS.LOGIN_FAILURE, {
                error: error.message || '未知错误',
                duration: loginDuration,
                timestamp: loginEndTime
              });
              
              reject(error);
            }
          },
          fail: error => {
            console.error('wx.login 调用失败：', error);
            const loginEndTime = Date.now();
            const loginDuration = loginEndTime - loginStartTime;
            
            // 记录登录失败事件
            monitoringManager.recordEvent(MONITORING_EVENTS.LOGIN_FAILURE, {
              type: loginType,
              duration: loginDuration,
              error: error.message || '网络错误',
              timestamp: loginEndTime
            });

            // 触发登录失败事件
            this._emitEvent(AUTH_EVENTS.LOGIN_FAILURE, {
              error: error.message || '网络错误',
              duration: loginDuration,
              timestamp: loginEndTime
            });
            
            reject(this.errorHandler.handleNetworkError('登录失败，请检查网络连接'));
          },
        });
      });
    } catch (error) {
      const loginEndTime = Date.now();
      const loginDuration = loginEndTime - loginStartTime;
      
      // 记录登录失败事件
      monitoringManager.recordEvent(MONITORING_EVENTS.LOGIN_FAILURE, {
        type: loginType,
        duration: loginDuration,
        error: error.message || '未知错误',
        timestamp: loginEndTime
      });

      // 触发登录失败事件
      this._emitEvent(AUTH_EVENTS.LOGIN_FAILURE, {
        error: error.message || '未知错误',
        duration: loginDuration,
        timestamp: loginEndTime
      });

      // 使用 handleError 方法处理错误
      this.errorHandler.handleError('LoginError', error, {
        level: 'error',
        context: { loginType, duration: loginDuration }
      });

      // 重新抛出错误
      throw error;
    }
  }

  /**
   * 处理已有的登录状态
   * @private
   * @param {string} loginType - 登录类型
   * @param {boolean} skipIdentityCheck - 是否跳过身份检查
   * @param {number} startTime - 开始时间戳
   * @returns {Promise<object|null>} 登录结果或null
   */
  async _handleExistingLoginState(loginType, skipIdentityCheck, startTime) {
    const currentIdentity = centralIdentityManager.getCurrentIdentity();
    const userInfo = currentIdentity ? { ...currentIdentity, ...currentIdentity.commonData } : null;
    const userRole = centralIdentityManager.getCurrentRole();
    
    // 检查用户是否已经选择了身份
    if (!skipIdentityCheck && (!userRole || userRole === 'guest')) {
      return this._handleIdentitySelection();
    }
    
    // 更新全局数据
    this._updateGlobalData(userInfo, userRole);
    
    // 更新IM用户资料
    await this._updateIMUserProfile();
    
    // 检查并刷新即将过期的UserSig
    const openid = currentIdentity?.commonData?.openid;
    if (openid) {
      await this.userSigManager.checkAndRefreshUserSig(openid);
    }
    
    // 登录状态由CentralIdentityManager管理
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // 记录性能数据
    this._recordPerformance('login', duration);
    
    // 记录登录成功事件
    monitoringManager.recordEvent(MONITORING_EVENTS.LOGIN_SUCCESS, {
      type: loginType,
      duration: duration,
      message: '登录状态有效，已更新相关数据',
      timestamp: endTime
    });

    // 触发登录成功事件
    this._emitEvent(AUTH_EVENTS.LOGIN_SUCCESS, {
      userInfo: userInfo,
      userRole: userRole,
      duration: duration,
      timestamp: endTime
    });
    
    return { success: true, message: '登录状态有效，已更新相关数据' };
  }

  /**
   * 处理身份选择
   * @private
   * @returns {object} 登录结果
   */
  _handleIdentitySelection() {
    console.log('[LoginManager] 用户未选择身份，需要重新选择身份');
    
    // 获取用户的所有身份角色
    let roles = [];
    try {
      // 尝试从集中式身份管理器获取角色列表
      roles = centralIdentityManager.getRoles();
      console.log('[LoginManager] 从集中式身份管理器获取的角色列表:', roles);
    } catch (error) {
      console.error('获取角色列表失败:', error);
    }
    
    // 跳转到首页并显示身份选择表单
    wx.switchTab({
      url: PAGE_PATHS.HOME,
      success: function(res) {
        setTimeout(function() {
          const homePage = getCurrentPages().find(page => page.route === 'pages/home/index');
          if (homePage && homePage.showIdentityForm) {
            homePage.showIdentityForm();
          }
        }, 500);
      }
    });
    
    // 直接返回，等待用户选择身份
    return { success: true, message: '需要选择身份' };
  }

  /**
   * 完成登录成功的后续操作
   * @private
   * @param {string} loginType - 登录类型
   * @param {number} startTime - 开始时间戳
   */
  async _finalizeLoginSuccess(loginType, startTime) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // 记录性能数据
    this._recordPerformance('login', duration);
    
    // 记录登录成功事件
    monitoringManager.recordEvent(MONITORING_EVENTS.LOGIN_SUCCESS, {
      type: loginType,
      duration: duration,
      message: '登录成功',
      timestamp: endTime
    });
    
    // 触发登录成功事件
    this._emitEvent(AUTH_EVENTS.LOGIN_SUCCESS, {
      userInfo: this.currentUser,
      userRole: this.currentRole,
      duration: duration,
      timestamp: endTime
    });
  }

  /**
   * 调用登录云函数
   * @param {string} code - 登录凭证
   * @param {Object} userInfo - 用户信息
   * @returns {Promise<Object>} 登录结果
   */
  async callLoginCloudFunction(code, userInfo = null) {
    try {
      const data = { code };
      if (userInfo) {
        data.userInfo = userInfo;
      }

      const cloudRes = await wx.cloud.callFunction({
        name: CLOUD_FUNCTIONS.LOGIN,
        data,
      });

      if (cloudRes.result.code === 0) {
        // 尝试从多个可能的位置获取用户信息
        let userInfoResult = cloudRes.result.userInfo || (cloudRes.result.data && cloudRes.result.data.userInfo);

        // 检查返回的用户信息是否完整
        if (userInfoResult && (userInfoResult._id || userInfoResult.openid)) {
          // 默认角色为guest，需要用户选择
          const userRole = 'guest';

          // 更新全局数据
          this._updateGlobalData(userInfoResult, userRole);

          // 处理身份信息和IM登录
          const roles = this._extractRolesFromResult(cloudRes.result);
          
          // 更新集中式身份管理器
          centralIdentityManager.setRoles(roles);

          // 保存用户信息和token到本地存储
          const identityInfo = {
            ...userInfoResult,
            role: userRole
          };
          centralIdentityManager.setIdentity(userRole, identityInfo);

          // 保存token
          if (cloudRes.result.token) {
            const currentIdentity = centralIdentityManager.getCurrentIdentity();
            if (currentIdentity) {
              centralIdentityManager.setIdentity(userRole, {
                ...currentIdentity,
                token: cloudRes.result.token
              });
            }
          }

          // 保存UserSig
          const userSig = cloudRes.result.userSig || (cloudRes.result.data && cloudRes.result.data.userSig) || '';
          if (userSig) {
            this.userSigManager.cacheUserSig(userRole, userInfoResult.openid, userSig);
          }

          // 检查用户是否已有身份及身份数量
          const hasRoles = roles && roles.length > 0;
          const roleCount = roles ? roles.length : 0;
          console.log('[LoginManager] 用户角色数量:', roleCount);
          console.log('[LoginManager] 是否已有身份:', hasRoles);

          // 根据身份数量决定下一步操作
          if (!hasRoles || roleCount > 1) {
            // 为每个身份初始化上下文
            if (hasRoles) {
              this._initIdentityContexts(roles, userInfoResult, userSig, cloudRes.result);
            }

            // 跳转到首页并显示身份选择表单
            wx.switchTab({
              url: PAGE_PATHS.HOME,
              success: function(res) {
                setTimeout(function() {
                  const homePage = getCurrentPages().find(page => page.route === 'pages/home/index');
                  if (homePage && homePage.showIdentityForm) {
                    homePage.showIdentityForm();
                  }
                }, 500);
              }
            });
            
            // 重要：跳转到首页并显示身份选择表单后，直接返回
            return cloudRes.result;
          } else if (roleCount === 1) {
            // 如果用户只有单一身份，直接登录并跳转到首页
            console.log('[LoginManager] 用户只有单一身份，直接登录并跳转到首页');
            // 切换到唯一的身份
            const singleRoleType = roles[0].roleType;
            await centralIdentityManager.switchRole(singleRoleType);
            console.log('单一身份登录成功:', singleRoleType);
            
            // 为每个身份初始化上下文
            this._initIdentityContexts(roles, userInfoResult, userSig, cloudRes.result);

            // 登录成功后返回到首页
            wx.switchTab({
              url: PAGE_PATHS.HOME
            });
          } else {
            // 为每个身份初始化上下文
            this._initIdentityContexts(roles, userInfoResult, userSig, cloudRes.result);

            // 切换到默认身份
            const defaultRoleType = centralIdentityManager.getDefaultRoleType();
            if (this.app && this.app.switchRole) {
              await this.app.switchRole(defaultRoleType);
              console.log('默认身份登录成功:', defaultRoleType);
            }
          }

          // 登录成功后，更新IM用户资料
          await this._updateIMUserProfile();

          // 触发登录状态变更事件
          if (this.app && this.app.triggerEvent) {
            this.app.triggerEvent('loginStatusChanged', { status: 'logged_in', userInfo: userInfoResult });
          }

          return { success: true, message: '登录成功', data: cloudRes.result.data };
        } else {
          // 处理不完整的用户信息
          return this._handleIncompleteUserInfo(cloudRes.result);
        }
      } else {
        console.error('云函数返回登录失败：', cloudRes.result.message);
        throw this.errorHandler.handleLoginError(cloudRes.result.message);
      }
    } catch (error) {
      console.error('云函数 login 调用失败：', error);
      throw this.errorHandler.handleCloudFunctionError('登录失败，请稍后重试');
    }
  }

  /**
   * 从登录结果中提取角色列表
   * @private
   * @param {object} result - 登录结果
   * @returns {array} 角色列表
   */
  _extractRolesFromResult(result) {
    let roles = [];
    
    if (result.data && result.data.data && result.data.data.roles) {
      roles = result.data.data.roles;
      console.log('[LoginManager] 从 cloudRes.result.data.data.roles 获取角色');
    } else if (result.data && result.data.roles) {
      roles = result.data.roles;
      console.log('[LoginManager] 从 cloudRes.result.data.roles 获取角色');
    } else if (result.roles) {
      roles = result.roles;
      console.log('[LoginManager] 从 cloudRes.result.roles 获取角色');
    }
    
    return roles;
  }

  /**
   * 初始化身份上下文
   * @private
   * @param {array} roles - 角色列表
   * @param {object} userInfoResult - 用户信息
   * @param {string} userSig - UserSig
   * @param {object} cloudResult - 云函数返回结果
   */
  _initIdentityContexts(roles, userInfoResult, userSig, cloudResult) {
    roles.forEach(role => {
      const roleType = role.roleType;
      const openid = userInfoResult.openid;
      
      // 生成IM用户ID
      const imUserID = userInfoResult.userID || generateIMUserId(roleType, openid);
      console.log('[LoginManager] 使用的IM用户ID:', imUserID);

      // 获取身份专属的userSig
      const roleUserSig = 
        (cloudResult.data && cloudResult.data.userSig) ||
        cloudResult.userSig ||
        userSig ||
        '';

      // 获取身份上下文（如果不存在会自动创建）
      const context = centralIdentityManager.getContext(roleType);
      console.log('[LoginManager] 获取身份上下文:', roleType);

      // 更新身份上下文
      centralIdentityManager.updateContext(roleType, {
        profile: role.profile || {},
        openid: openid,
        imUserInfo: {
          userID: imUserID,
          userSig: roleUserSig,
          isLoggedIn: false,
          lastLoginTime: null,
        },
      });
      
      // 同时设置身份信息
      const identityInfo = {
        ...(role.profile || {}),
        _id: userInfoResult._id || userInfoResult.openid,
        openid: openid
      };
      centralIdentityManager.setIdentity(roleType, identityInfo);
    });
  }

  /**
   * 处理不完整的用户信息
   * @private
   * @param {object} result - 登录结果
   * @returns {object} 处理后的结果
   */
  _handleIncompleteUserInfo(result) {
    // 尝试获取openid
    const openid = 
      (result.tcbContext && result.tcbContext.OPENID) ||
      (result.wxContext && result.wxContext.OPENID);

    if (openid) {
      const basicUserInfo = {
        _id: `temp_${openid}`,
        openid: openid,
        avatarUrl: '',
        nickName: '',
        role: 'owner',
      };

      // 更新全局数据
      this._updateGlobalData(basicUserInfo, 'owner');

      // 保存基本用户信息和token到本地存储
      const identityInfo = {
        ...basicUserInfo,
        role: 'owner'
      };
      centralIdentityManager.setIdentity('owner', identityInfo);
      
      // 保存token
      if (result.token) {
        const currentIdentity = centralIdentityManager.getCurrentIdentity();
        if (currentIdentity) {
          centralIdentityManager.setIdentity('owner', {
            ...currentIdentity,
            token: result.token
          });
        }
      }

      // 触发登录状态变更事件
      if (this.app && this.app.triggerEvent) {
        this.app.triggerEvent('loginStatusChanged', { status: 'logged_in', userInfo: basicUserInfo });
      }

      return { success: true, message: '登录成功（基本信息）', data: { userInfo: basicUserInfo } };
    } else {
      // 即使没有openid，也创建一个临时用户信息对象
      console.warn('无法获取用户身份信息，创建临时用户');
      const basicUserInfo = {
        _id: `temp_${Date.now()}`,
        openid: `temp_${Date.now()}`,
        avatarUrl: '',
        nickName: '',
        role: 'owner',
      };

      // 更新全局数据
      this._updateGlobalData(basicUserInfo, 'owner');

      // 保存基本用户信息和token到本地存储
      const identityInfo = {
        ...basicUserInfo,
        role: 'owner'
      };
      centralIdentityManager.setIdentity('owner', identityInfo);
      
      // 保存token
      if (result.token) {
        const currentIdentity = centralIdentityManager.getCurrentIdentity();
        if (currentIdentity) {
          centralIdentityManager.setIdentity('owner', {
            ...currentIdentity,
            token: result.token
          });
        }
      }

      // 触发登录状态变更事件
      if (this.app && this.app.triggerEvent) {
        this.app.triggerEvent('loginStatusChanged', { status: 'logged_in', userInfo: basicUserInfo });
      }

      return { success: true, message: '登录成功（临时用户）', data: { userInfo: basicUserInfo } };
    }
  }

  /**
   * 检查登录状态是否有效
   * @returns {boolean} 登录状态是否有效
   */
  checkLoginStatusValid() {
    try {
      console.log('[LoginManager] 开始检查登录状态...');
      
      // 检查退出状态
      const isLogout = centralIdentityManager.getLogoutStatus();
      if (isLogout) {
        console.log('[LoginManager] 登录状态检查：用户已退出登录');
        return false;
      }
      
      // 检查用户信息
      const currentIdentity = centralIdentityManager.getCurrentIdentity();
      const userInfo = currentIdentity ? { ...currentIdentity, ...currentIdentity.commonData } : null;
      console.log('[LoginManager] 登录状态检查：用户信息存在:', !!userInfo);
      console.log('[LoginManager] 登录状态检查：用户信息包含_id:', userInfo && (userInfo._id || userInfo.userId));
      console.log('[LoginManager] 登录状态检查：用户信息包含openid:', userInfo && userInfo.openid);
      
      if (!userInfo || (!userInfo._id && !userInfo.userId && !userInfo.openid)) {
        console.log('[LoginManager] 登录状态检查：用户信息不完整');
        return false;
      }

      // 检查登录过期时间
      const loginExpiry = centralIdentityManager.getLoginExpiry();
      console.log('[LoginManager] 登录状态检查：登录过期时间:', loginExpiry);
      console.log('[LoginManager] 登录状态检查：当前时间:', Date.now());
      
      if (loginExpiry) {
        // 检查是否已过期
        const now = Date.now();
        const isExpired = now > loginExpiry;
        console.log('[LoginManager] 登录状态检查：是否过期:', isExpired);
        
        if (isExpired) {
          console.log('[LoginManager] 登录状态检查：登录已过期');
          return false;
        }
      } else {
        console.log('[LoginManager] 登录状态检查：未设置过期时间，使用默认有效状态');
      }

      // 检查集中式身份管理器的登录状态
      if (!centralIdentityManager.isLoggedIn()) {
        console.log('[LoginManager] 登录状态检查：身份管理器登录状态无效');
        return false;
      }

      console.log('[LoginManager] 登录状态检查：登录状态有效');
      return true;
    } catch (error) {
      console.error('检查登录状态失败:', error);
      return false;
    }
  }

  /**
   * 更新全局数据
   * @private
   * @param {object} userInfo - 用户信息
   * @param {string} userRole - 用户角色
   */
  _updateGlobalData(userInfo, userRole) {
    if (this.app && this.app.globalData) {
      this.app.globalData.userInfo = userInfo;
      this.app.globalData.userRole = userRole;
      
      // 保存到对应的身份信息存储
      if (userRole === 'owner') {
        this.app.globalData.ownerInfo = userInfo;
      } else if (userRole === 'host') {
        this.app.globalData.hostInfo = userInfo;
      }

      // 更新状态管理
      this.set(STATE_KEYS.USER_INFO, userInfo);
      this.set(STATE_KEYS.USER_ROLE, userRole);
    }
  }

  /**
   * 更新IM用户资料
   * @private
   */
  async _updateIMUserProfile() {
    try {
      const currentIdentity = centralIdentityManager.getCurrentIdentity();
      const userName = currentIdentity ? (currentIdentity.nickName || currentIdentity.name || '') : '';
      const avatarUrl = currentIdentity ? currentIdentity.avatarUrl || '' : '';
      
      // 检查IM SDK是否就绪
      const isIMSDKReady = wx.$TUIKit && wx.$TUIKit.isReady && wx.$TUIKit.isReady();
      if (!isIMSDKReady) {
        console.log('[LoginManager] IM SDK未就绪，跳过资料更新');
        return;
      }
      
      // 调用app的方法更新IM用户资料
      if (this.app && this.app.updateIMUserProfile) {
        const success = await this.app.updateIMUserProfile(userName, avatarUrl);
        console.log('[LoginManager] IM用户资料更新结果:', { success, userName, avatarUrl });
      }
    } catch (error) {
      console.error('[LoginManager] 更新IM用户资料失败:', error);
    }
  }

  /**
   * 保存状态到存储
   * @private
   * @deprecated 状态现在由CentralIdentityManager管理
   */
  _saveStateToStorage() {
    console.log('[LoginManager] _saveStateToStorage: 状态现在由CentralIdentityManager管理');
  }

  /**
   * 记录性能数据
   * @private
   * @param {string} type - 性能类型
   * @param {number} duration - 持续时间
   */
  _recordPerformance(type, duration) {
    if (!this.performanceData) {
      this.performanceData = {
        loginTimes: [],
        logoutTimes: [],
        stateUpdateTimes: [],
        eventTriggerTimes: []
      };
    }

    switch (type) {
      case 'login':
        this.performanceData.loginTimes.push({
          duration,
          timestamp: Date.now()
        });
        break;
      case 'logout':
        this.performanceData.logoutTimes.push({
          duration,
          timestamp: Date.now()
        });
        break;
      case 'stateUpdate':
        this.performanceData.stateUpdateTimes.push({
          duration,
          timestamp: Date.now()
        });
        break;
      case 'eventTrigger':
        this.performanceData.eventTriggerTimes.push({
          duration,
          timestamp: Date.now()
        });
        break;
    }

    // 限制性能数据长度
    Object.keys(this.performanceData).forEach(key => {
      const data = this.performanceData[key];
      if (Array.isArray(data) && data.length > 100) {
        this.performanceData[key] = data.slice(-100);
      }
    });
  }

  /**
   * 触发事件
   * @private
   * @param {string} eventName - 事件名称
   * @param {object} data - 事件数据
   */
  _emitEvent(eventName, data) {
    // 检查是否有监听器注册
    if (!this.eventListeners[eventName] || this.eventListeners[eventName].length === 0) {
      return;
    }

    const startTime = Date.now();

    // 触发事件回调
    this.eventListeners[eventName].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('[LoginManager] 事件回调执行失败:', error);
      }
    });
    console.log('[LoginManager] 触发事件:', eventName, data);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // 记录事件触发性能
    this._recordPerformance('eventTrigger', duration);
  }

  /**
   * 注册事件监听器
   * @param {string} eventName - 事件名称
   * @param {function} callback - 回调函数
   */
  on(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = [];
    }

    this.eventListeners[eventName].push(callback);
    console.log('[LoginManager] 注册事件监听器:', eventName);
  }

  /**
   * 移除事件监听器
   * @param {string} eventName - 事件名称
   * @param {function} callback - 回调函数
   */
  off(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      return;
    }

    this.eventListeners[eventName] = this.eventListeners[eventName].filter(cb => cb !== callback);
    console.log('[LoginManager] 移除事件监听器:', eventName);
  }

  /**
   * 获取全局状态
   * @param {string} key - 状态键
   * @returns {*} 状态值
   */
  get(key) {
    if (!key) {
      // 如果没有指定键，返回所有全局状态
      return this.app.globalData;
    }
    
    const value = this.app.globalData[key];
    console.log('[LoginManager] 获取状态:', key, '=', value);
    return value;
  }
  
  /**
   * 设置全局状态
   * @param {string|object} key - 状态键或状态对象
   * @param {*} value - 状态值（当key为字符串时）
   */
  set(key, value) {
    if (typeof key === 'object') {
      // 批量更新
      const stateObject = key;
      Object.keys(stateObject).forEach(stateKey => {
        this._updateState(stateKey, stateObject[stateKey]);
      });
    } else {
      // 单个更新
      this._updateState(key, value);
    }
  }
  
  /**
   * 更新单个状态
   * @private
   * @param {string} key - 状态键
   * @param {*} value - 状态值
   */
  _updateState(key, value) {
    // 确保 app.globalData 存在
    if (!this.app || !this.app.globalData) {
      console.warn('LoginManager._updateState - 应用实例或全局数据不存在，跳过状态更新');
      return;
    }
    
    const oldValue = this.app.globalData[key];
    
    // 检查值是否变化
    if (this._isEqual(oldValue, value)) {
      console.log('LoginManager._updateState - 状态未变化，跳过更新:', key);
      return;
    }
    
    // 更新状态
    this.app.globalData[key] = value;
    
    // 记录更新时间
    this.lastUpdated[key] = Date.now();
  }

  /**
   * 检查两个值是否相等
   * @private
   * @param {*} a - 第一个值
   * @param {*} b - 第二个值
   * @returns {boolean} 是否相等
   */
  _isEqual(a, b) {
    if (a === b) return true;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      if (a.constructor !== b.constructor) return false;
      const keys = Object.keys(a);
      if (keys.length !== Object.keys(b).length) return false;
      for (const key of keys) {
        if (!this._isEqual(a[key], b[key])) return false;
      }
      return true;
    }
    return false;
  }

  /**
   * 自动处理登录过期
   * @returns {Promise<boolean>} 是否处理成功
   */
  async handleLoginExpiry() {
    try {
      const currentIdentity = centralIdentityManager.getCurrentIdentity();
      const loginExpiry = centralIdentityManager.getLoginExpiry();

      if (!currentIdentity || !currentIdentity._id) {
        return false;
      }

      // 检查登录是否即将过期（剩余时间小于1小时）
      const now = Date.now();
      const timeUntilExpiry = loginExpiry - now;

      if (timeUntilExpiry > TIME.USER_SIG_REFRESH_THRESHOLD) {
        // 登录状态还有足够时间，无需处理
        return true;
      }

      // 尝试重新登录
      const loginResult = await this.login();
      return loginResult && loginResult.success;
    } catch (error) {
      console.error('处理登录过期失败:', error);
      return false;
    }
  }

  /**
   * 退出登录
   * @param {boolean} showConfirm - 是否显示确认对话框
   * @returns {Promise<boolean>} 是否退出成功
   */
  logout(showConfirm = true) {
    return new Promise((resolve, reject) => {
      try {
        // 显示退出登录确认
        if (showConfirm) {
          wx.showModal({
            title: '确认退出',
            content: '确定要退出登录吗？',
            success: res => {
              if (res.confirm) {
                this._performLogout().then(resolve).catch(reject);
              } else {
                reject(new Error('用户取消退出登录'));
              }
            },
            fail: error => {
              console.error('显示退出登录确认失败:', error);
              this._performLogout().then(resolve).catch(reject);
            },
          });
        } else {
          this._performLogout().then(resolve).catch(reject);
        }
      } catch (error) {
        console.error('退出登录失败:', error);
        reject(error);
      }
    });
  }

  /**
   * 执行退出登录操作
   * @returns {Promise<boolean>} 是否执行成功
   */
  async _performLogout() {
    const startTime = Date.now();

    try {
      // 清除本地存储的用户信息
      centralIdentityManager.logout();

      // 清除全局变量
      if (this.app && this.app.globalData) {
        this.app.globalData.userInfo = null;
        this.app.globalData.userRole = null;
        this.app.globalData.ownerInfo = null;
        this.app.globalData.hostInfo = null;
        this.app.globalData.isLogout = true;
        this.app.globalData.currentRole = null;
        this.app.globalData.currentProfile = null;

        // 清除集中式身份管理器中的数据
        centralIdentityManager.clearAllContexts();
        centralIdentityManager.logout();

        // 退出腾讯云IM登录
        if (this.app.globalData.imManager) {
          try {
            await this.app.globalData.imManager.logout();
          } catch (error) {
            console.error('腾讯云IM退出登录失败:', error);
            // 即使IM退出失败，也继续执行退出流程
          }
        }
      }

      // 清除UserSig缓存
      this.userSigManager.clearUserSigCache();

      // 使用 CentralIdentityManager 的 logout 方法清除状态
      centralIdentityManager.logout();

      // 清除性能数据
      this.performanceData = {
        loginTimes: [],
        logoutTimes: [],
        stateUpdateTimes: [],
        eventTriggerTimes: []
      };

      // 触发登出成功事件
      this._emitEvent(AUTH_EVENTS.LOGOUT_SUCCESS, {
        timestamp: Date.now()
      });

      // 触发登录状态变更事件
      if (this.app && this.app.triggerEvent) {
        this.app.triggerEvent('loginStatusChanged', { status: 'logged_out' });
      }

      // 触发退出登录完成事件
      if (this.app && this.app.triggerEvent) {
        this.app.triggerEvent('logoutComplete');
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 记录性能数据
      this._recordPerformance('logout', duration);

      return true;
    } catch (error) {
      console.error('执行退出登录操作失败:', error);

      // 重置登录状态
      this.loginStatus = LOGIN_STATES.LOGGED_OUT;
      this._saveStateToStorage();

      // 触发登出失败事件
      this._emitEvent(AUTH_EVENTS.LOGOUT_FAILURE, {
        error: error.message || '未知错误',
        timestamp: Date.now()
      });

      throw error;
    }
  }

  /**
   * 清除状态管理数据
   * @deprecated 状态现在由CentralIdentityManager管理
   */
  clear() {
    console.log('[LoginManager] clear: 状态现在由CentralIdentityManager管理');
    this.performanceData = {
      loginTimes: [],
      logoutTimes: [],
      stateUpdateTimes: [],
      eventTriggerTimes: []
    };
  }

  /**
   * 获取登录状态
   * @returns {string} 登录状态
   */
  getLoginStatus() {
    if (centralIdentityManager.isLoggedIn()) {
      return LOGIN_STATES.LOGGED_IN;
    } else {
      return LOGIN_STATES.LOGGED_OUT;
    }
  }

  /**
   * 设置登录状态
   * @param {string} status - 登录状态
   * @deprecated 登录状态由CentralIdentityManager管理
   */
  setLoginStatus(status) {
    console.log('[LoginManager] setLoginStatus: 登录状态由CentralIdentityManager管理');
  }

  /**
   * 检查用户是否已登录
   * @returns {boolean} 是否已登录
   */
  isLoggedIn() {
    return this.checkLoginStatusValid();
  }

  /**
   * 获取身份信息
   * @returns {object} 身份信息
   */
  getIdentityInfo() {
    try {
      const currentIdentity = centralIdentityManager.getCurrentIdentity();
      const userRole = centralIdentityManager.getCurrentRole();
      return {
        roleType: userRole,
        profile: currentIdentity,
        userId: currentIdentity?.userID || currentIdentity?._id
      };
    } catch (error) {
      console.error('获取身份信息失败:', error);
      return {};
    }
  }
}

// 导出单例
let loginManagerInstance = null;

export function getLoginManager(appInstance) {
  // 如果没有实例，尝试获取应用实例
  if (!loginManagerInstance) {
    if (!appInstance) {
      try {
        appInstance = getApp();
      } catch (error) {
        console.error('无法获取应用实例:', error);
        return null;
      }
    }
    if (appInstance) {
      loginManagerInstance = new LoginManager(appInstance);
    }
  }
  return loginManagerInstance;
}

export default LoginManager;
