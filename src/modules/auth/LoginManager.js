/**
 * 登录管理器
 * 负责微信小程序登录流程，处理身份选择逻辑，协调其他模块工作，提供统一的登录接口
 */

import { CLOUD_FUNCTIONS, PAGE_PATHS, TIME } from './constants';
import { getErrorHandler } from './ErrorHandler';
import { getUserManager } from './UserManager';
import { getRoleManager } from './RoleManager';
import { getUserSigManager } from './UserSigManager';
import { getStorageManager } from './StorageManager';

// 导入监控管理器
const { monitoringManager, MONITORING_EVENTS, LOG_LEVELS } = require('../../../utils/monitoringManager');

// 导入统一ID生成模块
import { generateIMUserId } from '../../../utils/idGenerator';

class LoginManager {
  constructor(appInstance) {
    this.app = appInstance;
    this.errorHandler = getErrorHandler();
    this.userManager = getUserManager();
    this.roleManager = getRoleManager();
    this.userSigManager = getUserSigManager();
    this.storageManager = getStorageManager();
    this.loginStatus = 'logged_out';
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
    
    return new Promise(async (resolve, reject) => {
      try {
        // 重置退出状态，允许登录
        if (this.app && this.app.globalData) {
          this.app.globalData.isLogout = false;
        }

        // 清除本地存储的退出状态
        this.storageManager.saveLogoutStatus(false);

        // 检查是否已有有效的登录状态
        if (this.checkLoginStatusValid()) {
          // 即使登录状态有效，也检查用户是否已经选择了身份
          console.log('[LoginManager] 登录状态有效，检查用户是否已选择身份...');
          
          try {
            const userInfo = this.userManager.getUserInfo();
            const userRole = this.userManager.getUserRole();
            
            // 检查用户是否已经选择了身份
            if (!skipIdentityCheck && (!userRole || userRole === 'guest')) {
              console.log('[LoginManager] 用户未选择身份，需要重新选择身份');
              
              // 获取用户的所有身份角色
              let roles = [];
              try {
                // 尝试从角色管理器获取角色列表
                roles = this.roleManager.getRoles();
                console.log('[LoginManager] 从角色管理器获取的角色列表:', roles);
              } catch (error) {
                console.error('获取角色列表失败:', error);
              }
              
              // 跳转到首页并显示身份选择表单
              wx.switchTab({
                url: PAGE_PATHS.HOME,
                success: function(res) {
                  // 延迟执行，确保页面已加载
                  setTimeout(function() {
                    // 获取首页页面实例
                    const homePage = getCurrentPages().find(page => page.route === 'pages/home/index');
                    if (homePage && homePage.showIdentityForm) {
                      // 调用首页的showIdentityForm方法显示身份选择弹出表单
                      homePage.showIdentityForm();
                    }
                  }, 500);
                }
              });
              
              // 直接返回，等待用户选择身份
              resolve({ success: true, message: '需要选择身份' });
              return;
            } else if (skipIdentityCheck) {
              console.log('[LoginManager] 跳过身份选择检查');
              // 即使未选择身份，也继续执行登录流程
            }
            
            // 更新全局数据
            if (this.app && this.app.globalData) {
              this.app.globalData.userInfo = userInfo;
              this.app.globalData.userRole = userRole;
              
              // 保存到对应的身份信息存储
              if (userRole === 'owner') {
                this.app.globalData.ownerInfo = userInfo;
              } else if (userRole === 'host') {
                this.app.globalData.hostInfo = userInfo;
              }
            }
            
            // 更新IM用户资料
            const userName = this.userManager.getUserName();
            const avatarUrl = this.userManager.getUserAvatar();
            
            console.log('[LoginManager] 准备更新IM用户资料:', { 
              userName, 
              avatarUrl,
              hasUpdateMethod: this.app && this.app.updateIMUserProfile,
              userInfoExists: !!userInfo,
              userInfoContent: userInfo,
              imSdkReady: wx.$TUIKit && wx.$TUIKit.isReady && wx.$TUIKit.isReady()
            });
            
            // 检查IM SDK是否就绪
            const isIMSDKReady = wx.$TUIKit && wx.$TUIKit.isReady && wx.$TUIKit.isReady();
            if (!isIMSDKReady) {
              console.log('[LoginManager] IM SDK未就绪，跳过资料更新');
            } else {
              // 直接使用原始用户名，不添加前缀（宠物主人和寄养家庭是分别的IM账号）
              // 调用app的方法更新IM用户资料
              if (this.app && this.app.updateIMUserProfile) {
                console.log('[LoginManager] 调用updateIMUserProfile方法');
                try {
                  const success = await this.app.updateIMUserProfile(userName, avatarUrl);
                  console.log('[LoginManager] IM用户资料更新结果:', { success, userName, avatarUrl });
                } catch (error) {
                  console.error('[LoginManager] 更新IM用户资料失败:', error);
                }
              } else {
                console.error('[LoginManager] updateIMUserProfile方法不存在');
              }
            }
            
            // 检查并刷新即将过期的UserSig
            const openid = this.userManager.getOpenid();
            if (openid) {
              await this.userSigManager.checkAndRefreshUserSig(openid);
            }
            
          } catch (error) {
            console.error('更新相关数据失败:', error);
          }
          
          const loginEndTime = Date.now();
          const loginDuration = loginEndTime - loginStartTime;
          
          // 记录登录成功事件
          monitoringManager.recordEvent(MONITORING_EVENTS.LOGIN_SUCCESS, {
            type: loginType,
            duration: loginDuration,
            message: '登录状态有效，已更新相关数据',
            timestamp: loginEndTime
          });
          
          resolve({ success: true, message: '登录状态有效，已更新相关数据' });
          return;
        }

        // 步骤1：直接调用 wx.login() 获取临时登录凭证 code
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
            
            reject(this.errorHandler.handleNetworkError('登录失败，请检查网络连接'));
          },
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
        
        reject(this.errorHandler.handleUnknownError('登录失败', error));
      }
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
          // 根据角色保存到相应的身份存储
          // 注意：这里不设置全局userRole，除非用户明确选择了身份
          // 这样可以确保用户取消身份选择后，下次登录仍需要重新选择身份
          const userRole = 'guest'; // 默认为guest角色，需要用户选择

          // 更新全局数据 - 只保存用户信息，不保存角色信息
          if (this.app && this.app.globalData) {
            this.app.globalData.userInfo = userInfoResult;
            this.app.globalData.userRole = null; // 不设置角色，需要用户选择

            // 保存到对应的身份信息存储
            if (userInfoResult.role === 'owner') {
              this.app.globalData.ownerInfo = userInfoResult;
            } else if (userInfoResult.role === 'host') {
              this.app.globalData.hostInfo = userInfoResult;
            }
          }

          // 处理身份信息和IM登录
          // 尝试从多个可能的位置获取角色列表
          let roles = [];
          console.log('[LoginManager] cloudRes.result:', JSON.stringify(cloudRes.result, null, 2));
          console.log('[LoginManager] cloudRes.result.data:', cloudRes.result.data);

          if (cloudRes.result.data && cloudRes.result.data.data && cloudRes.result.data.data.roles) {
            // 从 cloudRes.result.data.data.roles 获取（根据用户提供的日志结构）
            roles = cloudRes.result.data.data.roles;
            console.log('[LoginManager] 从 cloudRes.result.data.data.roles 获取角色');
          } else if (cloudRes.result.data && cloudRes.result.data.roles) {
            // 其次从 cloudRes.result.data.roles 获取
            roles = cloudRes.result.data.roles;
            console.log('[LoginManager] 从 cloudRes.result.data.roles 获取角色');
          } else if (cloudRes.result.roles) {
            // 最后从 cloudRes.result.roles 获取
            roles = cloudRes.result.roles;
            console.log('[LoginManager] 从 cloudRes.result.roles 获取角色');
          }

          console.log('[LoginManager] 最终获取到的角色列表:', JSON.stringify(roles, null, 2));
          console.log('[LoginManager] 角色列表长度:', roles.length);
          console.log('[LoginManager] 每个角色的详细信息:', roles.map(r => ({ roleType: r.roleType, isActive: r.isActive })));
          
          // 更新角色管理器
          this.roleManager.setRoles(roles);

          // 保存用户信息和token到本地存储
          // 注意：保存为guest角色，需要用户选择身份后再更新
          this.userManager.saveUserInfoToStorage(userInfoResult, 'guest');

          // 保存token
          if (cloudRes.result.token) {
            this.storageManager.saveToken(cloudRes.result.token);
          }

          // 保存UserSig
          const userSig = cloudRes.result.userSig || (cloudRes.result.data && cloudRes.result.data.userSig) || '';
          if (userSig) {
            this.userSigManager.cacheUserSig(userRole, userInfoResult.openid, userSig);
          }

          // 保存用户ID
          if (userInfoResult.userID) {
            this.userManager.setUserId(userInfoResult.userID);
          }

          // 检查用户是否已有身份及身份数量
          const hasRoles = roles && roles.length > 0;
          const roleCount = roles ? roles.length : 0;
          console.log('[LoginManager] 用户角色数量:', roleCount);
          console.log('[LoginManager] 是否已有身份:', hasRoles);

          // 根据身份数量决定下一步操作
          if (!hasRoles || roleCount > 1) {
            // 如果用户没有身份或有多个身份，跳转到首页并显示身份选择弹出表单
            console.log('[LoginManager] 用户没有身份或有多个身份，跳转到首页并显示身份选择弹出表单');
            
            // 为每个身份初始化上下文（如果有多个身份）
            if (hasRoles && this.app && this.app.globalData && this.app.globalData.identityContextManager) {
              for (const role of roles) {
                const roleType = role.roleType;

                // 优先使用云函数返回的标准化userID，只有在没有时才生成新的ID
                const imUserID = userInfoResult.userID || generateIMUserId(roleType, userInfoResult.openid);
                console.log('[LoginManager] 使用的IM用户ID:', imUserID);
                console.log('[LoginManager] 生成IM用户ID的参数:', { roleType, openid: userInfoResult.openid });

                // 获取身份专属的userSig
                const roleUserSig =
                  (cloudRes.result.data && cloudRes.result.data.userSig) ||
                  cloudRes.result.userSig ||
                  '';

                // 获取身份上下文（如果不存在会自动创建）
                const context = this.app.globalData.identityContextManager.getContext(roleType);
                console.log('[LoginManager] 获取身份上下文:', roleType);

                // 更新身份上下文
                this.app.globalData.identityContextManager.updateContext(roleType, {
                  profile: role.profile || {},
                  openid: userInfoResult.openid,
                  imUserInfo: {
                    userID: imUserID,
                    userSig: roleUserSig,
                    isLoggedIn: false,
                    lastLoginTime: null,
                  },
                });
              }
            }

            // 跳转到首页
            wx.switchTab({
              url: PAGE_PATHS.HOME,
              success: function(res) {
                // 延迟执行，确保页面已加载
                setTimeout(function() {
                  // 获取首页页面实例
                  const homePage = getCurrentPages().find(page => page.route === 'pages/home/index');
                  if (homePage && homePage.showIdentityForm) {
                    // 调用首页的showIdentityForm方法显示身份选择弹出表单
                    homePage.showIdentityForm();
                  }
                }, 500);
              }
            });
            
            // 重要：跳转到首页并显示身份选择表单后，直接返回，不继续执行后续的身份切换逻辑
            return cloudRes.result;
          } else if (roleCount === 1) {
            // 如果用户只有单一身份，直接登录并跳转到首页
            console.log('[LoginManager] 用户只有单一身份，直接登录并跳转到首页');
            // 切换到唯一的身份并登录IM
            const singleRoleType = roles[0].roleType;
            await this.roleManager.switchRole(singleRoleType);
            console.log('单一身份登录成功:', singleRoleType);
            
            // 登录成功后返回到首页
            wx.switchTab({
              url: PAGE_PATHS.HOME,
            });
            
            // 为每个身份初始化上下文并登录IM
            if (this.app && this.app.globalData && this.app.globalData.identityContextManager) {
              for (const role of roles) {
                const roleType = role.roleType;

                // 优先使用云函数返回的标准化userID，只有在没有时才生成新的ID
                const imUserID = userInfoResult.userID || generateIMUserId(roleType, userInfoResult.openid);
                console.log('[LoginManager] 使用的IM用户ID:', imUserID);
                console.log('[LoginManager] 生成IM用户ID的参数:', { roleType, openid: userInfoResult.openid });

                // 获取身份专属的userSig
                const roleUserSig = 
                  (cloudRes.result.data && cloudRes.result.data.userSig) ||
                  cloudRes.result.userSig ||
                  '';

                // 获取身份上下文（如果不存在会自动创建）
                const context = this.app.globalData.identityContextManager.getContext(roleType);
                console.log('[LoginManager] 获取身份上下文:', roleType);
                
                // 更新身份上下文
                this.app.globalData.identityContextManager.updateContext(roleType, {
                  profile: role.profile || {},
                  openid: userInfoResult.openid,
                  imUserInfo: {
                    userID: imUserID,
                    userSig: roleUserSig,
                    isLoggedIn: false,
                    lastLoginTime: null,
                  },
                });
              }
            }
          } else {
            // 为每个身份初始化上下文并登录IM
            if (this.app && this.app.globalData && this.app.globalData.identityContextManager) {
              for (const role of roles) {
                const roleType = role.roleType;

                // 优先使用云函数返回的标准化userID，只有在没有时才生成新的ID
                const imUserID = userInfoResult.userID || generateIMUserId(roleType, userInfoResult.openid);
                console.log('[LoginManager] 使用的IM用户ID:', imUserID);
                console.log('[LoginManager] 生成IM用户ID的参数:', { roleType, openid: userInfoResult.openid });

                // 获取身份专属的userSig
                const roleUserSig = 
                  (cloudRes.result.data && cloudRes.result.data.userSig) ||
                  cloudRes.result.userSig ||
                  '';

                // 获取身份上下文（如果不存在会自动创建）
                const context = this.app.globalData.identityContextManager.getContext(roleType);
                console.log('[LoginManager] 获取身份上下文:', roleType);
                
                // 更新身份上下文
                this.app.globalData.identityContextManager.updateContext(roleType, {
                  profile: role.profile || {},
                  openid: userInfoResult.openid,
                  imUserInfo: {
                    userID: imUserID,
                    userSig: roleUserSig,
                    isLoggedIn: false,
                    lastLoginTime: null,
                  },
                });
              }
            }

            // 切换到默认身份并登录IM
            const defaultRoleType = this.roleManager.getDefaultRoleType();

            // 切换身份（会自动登录IM）
            if (this.app && this.app.switchRole) {
              await this.app.switchRole(defaultRoleType);
              console.log('默认身份登录成功:', defaultRoleType);
            }
          }

          // 登录成功后，更新IM用户资料，确保微信授权的头像和昵称同步到IM SDK
          const userName = this.userManager.getUserName();
          const avatarUrl = this.userManager.getUserAvatar();
          
          console.log('[LoginManager] 登录成功，准备更新IM用户资料:', { 
            userName, 
            avatarUrl,
            hasUpdateMethod: this.app && this.app.updateIMUserProfile,
            userInfoResultExists: !!userInfoResult,
            userInfoResultContent: userInfoResult,
            imSdkReady: wx.$TUIKit && wx.$TUIKit.isReady && wx.$TUIKit.isReady()
          });
          
          // 检查IM SDK是否就绪
          const isIMSDKReady = wx.$TUIKit && wx.$TUIKit.isReady && wx.$TUIKit.isReady();
          if (!isIMSDKReady) {
            console.log('[LoginManager] IM SDK未就绪，跳过资料更新');
          } else {
            // 直接使用原始用户名，不添加前缀（宠物主人和寄养家庭是分别的IM账号）
            // 调用app的方法更新IM用户资料
            if (this.app && this.app.updateIMUserProfile) {
              console.log('[LoginManager] 调用updateIMUserProfile方法');
              try {
                const success = await this.app.updateIMUserProfile(userName, avatarUrl);
                console.log('[LoginManager] IM用户资料更新结果:', { success, userName, avatarUrl });
              } catch (error) {
                console.error('[LoginManager] 更新IM用户资料失败:', error);
              }
            } else {
              console.error('[LoginManager] updateIMUserProfile方法不存在');
            }
          }

          // 触发登录状态变更事件
          if (this.app && this.app.triggerEvent) {
            this.app.triggerEvent('loginStatusChanged', { status: 'logged_in', userInfo: userInfoResult });
          }

          return { success: true, message: '登录成功', data: cloudRes.result.data };
        } else {
          // 即使用户信息不完整，只要有 openid，我们也可以创建一个基本的用户信息对象
          const openid = 
            (cloudRes.result.tcbContext && cloudRes.result.tcbContext.OPENID) ||
            (cloudRes.result.wxContext && cloudRes.result.wxContext.OPENID);
          if (openid) {
            const basicUserInfo = {
              _id: `temp_${openid}`,
              openid: openid,
              avatarUrl: '',
              nickName: '', // 不设置默认昵称
              role: 'owner',
            };

            // 更新全局数据
            if (this.app && this.app.globalData) {
              this.app.globalData.userInfo = basicUserInfo;
              this.app.globalData.userRole = 'owner';
              this.app.globalData.ownerInfo = basicUserInfo;
            }

            // 保存基本用户信息和token到本地存储
            this.userManager.saveUserInfoToStorage(basicUserInfo, 'owner');
            
            // 保存token
            if (cloudRes.result.token) {
              this.storageManager.saveToken(cloudRes.result.token);
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
              nickName: '', // 不设置默认昵称
              role: 'owner',
            };

            // 更新全局数据
            if (this.app && this.app.globalData) {
              this.app.globalData.userInfo = basicUserInfo;
              this.app.globalData.userRole = 'owner';
              this.app.globalData.ownerInfo = basicUserInfo;
            }

            // 保存基本用户信息和token到本地存储
            this.userManager.saveUserInfoToStorage(basicUserInfo, 'owner');
            
            // 保存token
            if (cloudRes.result.token) {
              this.storageManager.saveToken(cloudRes.result.token);
            }

            // 触发登录状态变更事件
            if (this.app && this.app.triggerEvent) {
              this.app.triggerEvent('loginStatusChanged', { status: 'logged_in', userInfo: basicUserInfo });
            }

            return { success: true, message: '登录成功（临时用户）', data: { userInfo: basicUserInfo } };
          }
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
   * 检查登录状态是否有效
   * @returns {boolean} 登录状态是否有效
   */
  checkLoginStatusValid() {
    try {
      console.log('[LoginManager] 开始检查登录状态...');
      
      // 检查退出状态
      const isLogout = this.storageManager.getLogoutStatus();
      if (isLogout) {
        console.log('[LoginManager] 登录状态检查：用户已退出登录');
        return false;
      }
      
      // 检查用户信息
      const userInfo = this.userManager.getUserInfo();
      console.log('[LoginManager] 登录状态检查：用户信息存在:', !!userInfo);
      console.log('[LoginManager] 登录状态检查：用户信息包含_id:', userInfo && userInfo._id);
      console.log('[LoginManager] 登录状态检查：用户信息包含openid:', userInfo && userInfo.openid);
      
      if (!userInfo || (!userInfo._id && !userInfo.openid)) {
        console.log('[LoginManager] 登录状态检查：用户信息不完整');
        return false;
      }

      // 检查登录过期时间
      const loginExpiry = this.storageManager.getLoginExpiry();
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

      console.log('[LoginManager] 登录状态检查：登录状态有效');
      return true;
    } catch (error) {
      console.error('检查登录状态失败:', error);
      return false;
    }
  }

  /**
   * 自动处理登录过期
   * @returns {Promise<boolean>} 是否处理成功
   */
  async handleLoginExpiry() {
    try {
      const userInfo = this.userManager.getUserInfo();
      const loginExpiry = this.storageManager.getLoginExpiry();

      if (!userInfo || !userInfo._id) {
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
    try {
      // 清除本地存储的用户信息
      this.userManager.clearUserInfo();

      // 清除全局变量
      if (this.app && this.app.globalData) {
        this.app.globalData.userInfo = null;
        this.app.globalData.userRole = null;
        this.app.globalData.ownerInfo = null;
        this.app.globalData.hostInfo = null;
        this.app.globalData.isLogout = true;
        this.app.globalData.currentRole = null;
        this.app.globalData.currentProfile = null;

        // 清除身份上下文管理器中的数据
        if (this.app.globalData.identityContextManager) {
          this.app.globalData.identityContextManager.clearAllContexts();
        }

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

      // 触发登录状态变更事件
      if (this.app && this.app.triggerEvent) {
        this.app.triggerEvent('loginStatusChanged', { status: 'logged_out' });
      }

      // 触发退出登录完成事件
      if (this.app && this.app.triggerEvent) {
        this.app.triggerEvent('logoutComplete');
      }

      return true;
    } catch (error) {
      console.error('执行退出登录操作失败:', error);
      throw error;
    }
  }

  /**
   * 获取登录状态
   * @returns {string} 登录状态
   */
  getLoginStatus() {
    return this.loginStatus;
  }

  /**
   * 设置登录状态
   * @param {string} status - 登录状态
   */
  setLoginStatus(status) {
    this.loginStatus = status;
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
      const userInfo = this.userManager.getUserInfo();
      const userRole = this.userManager.getUserRole();
      return {
        roleType: userRole,
        profile: userInfo,
        userId: userInfo.userID || userInfo._id
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
