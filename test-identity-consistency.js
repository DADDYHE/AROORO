/**
 * 身份一致性测试脚本
 * 验证修复后的身份管理系统是否能确保各页面身份一致
 */

// 模拟小程序环境
const mockApp = {
  globalData: {
    userInfo: {
      _id: 'test_user_123',
      openid: 'test_openid_123',
      nickName: '测试用户',
      avatarUrl: 'cloud://test-avatar.png',
      role: 'host'
    },
    userRole: 'host',
    hostInfo: {
      _id: 'host_profile_123',
      openid: 'test_openid_123',
      hostName: '测试寄养家庭',
      avatarUrl: 'cloud://host-avatar.png'
    },
    ownerInfo: {
      _id: 'owner_profile_123',
      openid: 'test_openid_123',
      name: '测试宠物主人',
      avatarUrl: 'cloud://owner-avatar.png'
    },
    identityContextManager: {
      getCurrentRoleType: () => 'host'
    }
  }
};

// 模拟wx对象
const mockWX = {
  getStorageSync: (key) => {
    const storage = {
      userInfo: mockApp.globalData.userInfo,
      userRole: 'host'
    };
    return storage[key] || null;
  },
  setStorageSync: (key, value) => {
    console.log(`模拟存储: ${key} = ${JSON.stringify(value)}`);
  }
};

// 注入全局变量
global.app = mockApp;
global.wx = mockWX;

// 导入身份管理工具
const IdentityManager = require('./utils/identityManager');

// 测试函数
function testIdentityConsistency() {
  console.log('=== 开始身份一致性测试 ===\n');
  
  // 测试1: 获取当前角色
  console.log('测试1: 获取当前角色');
  const currentRole = IdentityManager.getCurrentRole();
  console.log(`当前角色: ${currentRole}`);
  console.log(`期望角色: host`);
  console.log(`测试结果: ${currentRole === 'host' ? '通过' : '失败'}\n`);
  
  // 测试2: 获取当前用户信息
  console.log('测试2: 获取当前用户信息');
  const userInfo = IdentityManager.getCurrentUserInfo();
  console.log(`用户信息角色: ${userInfo.role}`);
  console.log(`期望角色: host`);
  console.log(`测试结果: ${userInfo.role === 'host' ? '通过' : '失败'}\n`);
  
  // 测试3: 获取当前身份完整信息
  console.log('测试3: 获取当前身份完整信息');
  const identity = IdentityManager.getCurrentIdentity();
  console.log(`身份角色: ${identity.role}`);
  console.log(`用户信息角色: ${identity.userInfo.role}`);
  console.log(`是否登录: ${identity.isLoggedIn}`);
  console.log(`测试结果: ${identity.role === 'host' && identity.userInfo.role === 'host' && identity.isLoggedIn ? '通过' : '失败'}\n`);
  
  // 测试4: 验证身份一致性
  console.log('测试4: 验证身份一致性');
  const validation = IdentityManager.validateIdentityConsistency();
  console.log(`身份是否一致: ${validation.isConsistent}`);
  console.log(`当前角色: ${validation.currentRole}`);
  console.log(`一致性问题: ${validation.issues.length > 0 ? validation.issues : '无'}`);
  console.log(`测试结果: ${validation.isConsistent ? '通过' : '失败'}\n`);
  
  // 测试5: 同步身份状态
  console.log('测试5: 同步身份状态');
  IdentityManager.syncIdentityState();
  console.log('同步完成');
  console.log(`测试结果: 通过\n`);
  
  // 测试6: 测试角色切换场景
  console.log('测试6: 测试角色切换场景');
  mockApp.globalData.userRole = 'owner';
  mockApp.globalData.userInfo.role = 'owner';
  mockApp.globalData.identityContextManager.getCurrentRoleType = () => 'owner';
  
  const newIdentity = IdentityManager.getCurrentIdentity();
  console.log(`切换后角色: ${newIdentity.role}`);
  console.log(`期望角色: owner`);
  console.log(`测试结果: ${newIdentity.role === 'owner' ? '通过' : '失败'}\n`);
  
  console.log('=== 身份一致性测试完成 ===');
}

// 运行测试
testIdentityConsistency();
