/**
 * 测试前端登录模块
 * 验证前端登录模块是否能够正确处理登录云函数的响应
 */

// 模拟微信云函数调用
function mockWXCloudCallFunction(name, data) {
  console.log('模拟微信云函数调用:', name, data);
  
  // 模拟登录云函数的响应
  if (name === 'login') {
    return Promise.resolve({
      result: {
        code: 0,
        message: '登录成功',
        data: {
          userInfo: {
            _id: 'test_user_id',
            openid: 'test_openid',
            avatarUrl: 'https://example.com/avatar.jpg',
            nickName: '测试用户',
            role: 'owner',
            userID: 'own_test123_test_openid',
            profile: {
              _id: 'test_profile_id',
              openid: 'test_openid',
              userId: 'test_user_id',
              ownerName: '测试用户',
              avatarUrl: 'https://example.com/avatar.jpg',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          },
          roles: [
            {
              _id: 'test_role_id',
              userId: 'test_user_id',
              openid: 'test_openid',
              roleType: 'owner',
              profileId: 'test_profile_id',
              isActive: true,
              createdAt: new Date().toISOString(),
              profile: {
                _id: 'test_profile_id',
                openid: 'test_openid',
                userId: 'test_user_id',
                ownerName: '测试用户',
                avatarUrl: 'https://example.com/avatar.jpg',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            }
          ],
          currentRole: {
            _id: 'test_role_id',
            userId: 'test_user_id',
            openid: 'test_openid',
            roleType: 'owner',
            profileId: 'test_profile_id',
            isActive: true,
            createdAt: new Date().toISOString(),
            profile: {
              _id: 'test_profile_id',
              openid: 'test_openid',
              userId: 'test_user_id',
              ownerName: '测试用户',
              avatarUrl: 'https://example.com/avatar.jpg',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          },
          currentProfile: {
            _id: 'test_profile_id',
            openid: 'test_openid',
            userId: 'test_user_id',
            ownerName: '测试用户',
            avatarUrl: 'https://example.com/avatar.jpg',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          wxContext: {
            OPENID: 'test_openid',
            APPID: 'test_appid',
            UNIONID: 'test_unionid'
          }
        }
      }
    });
  }
  
  return Promise.reject(new Error('未模拟的云函数: ' + name));
}

// 模拟微信登录
function mockWXLogin() {
  console.log('模拟微信登录');
  return Promise.resolve({
    code: 'test_login_code'
  });
}

// 模拟应用实例
const mockAppInstance = {
  globalData: {
    userInfo: null,
    userRole: null,
    ownerInfo: null,
    hostInfo: null,
    identityContextManager: {
      updateContext: (roleType, context) => {
        console.log('更新身份上下文:', roleType, context);
      },
      clearAllContexts: () => {
        console.log('清除所有身份上下文');
      }
    },
    imManager: {
      logout: () => {
        console.log('模拟IM退出登录');
        return Promise.resolve();
      }
    }
  },
  switchRole: (roleType) => {
    console.log('模拟切换角色:', roleType);
    return Promise.resolve();
  },
  triggerEvent: (event, data) => {
    console.log('模拟触发事件:', event, data);
  }
};

// 模拟全局函数
global.wx = {
  cloud: {
    callFunction: mockWXCloudCallFunction
  },
  login: mockWXLogin,
  navigateTo: (options) => {
    console.log('模拟导航到:', options.url);
  },
  switchTab: (options) => {
    console.log('模拟切换标签页:', options.url);
  },
  showModal: (options) => {
    console.log('模拟显示模态框:', options);
    setTimeout(() => {
      options.success({ confirm: true });
    }, 100);
  }
};

global.getApp = () => mockAppInstance;

// 导入登录模块
const path = require('path');
const { AuthModule } = require('./src/modules/auth/index.js');

// 测试登录流程
async function testLoginFlow() {
  try {
    console.log('=== 测试前端登录模块开始 ===');
    
    // 初始化登录模块
    AuthModule.init(mockAppInstance);
    console.log('✅ 登录模块初始化成功');
    
    // 测试登录
    console.log('开始测试登录...');
    const loginResult = await AuthModule.login();
    console.log('登录结果:', loginResult);
    console.log('✅ 登录测试成功');
    
    // 测试获取用户信息
    const userInfo = AuthModule.getUserInfo();
    console.log('获取到的用户信息:', userInfo);
    console.log('✅ 获取用户信息测试成功');
    
    // 测试获取角色
    const userRole = AuthModule.getUserRole();
    console.log('获取到的用户角色:', userRole);
    console.log('✅ 获取用户角色测试成功');
    
    // 测试获取角色列表
    const roles = AuthModule.getRoles();
    console.log('获取到的角色列表:', roles);
    console.log('✅ 获取角色列表测试成功');
    
    // 测试退出登录
    console.log('开始测试退出登录...');
    const logoutResult = await AuthModule.logout(false);
    console.log('退出登录结果:', logoutResult);
    console.log('✅ 退出登录测试成功');
    
    console.log('=== 测试前端登录模块结束 ===');
    console.log('✅ 所有测试通过');
  } catch (error) {
    console.error('测试失败:', error);
    console.log('=== 测试前端登录模块结束 ===');
  }
}

// 运行测试
testLoginFlow();
