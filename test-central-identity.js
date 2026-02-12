/**
 * CentralIdentityManager 简单测试
 * 验证整合后的身份管理模块核心功能
 */

// 导入集中式身份管理器
const { centralIdentityManager } = require('./utils/CentralIdentityManager');

// 模拟微信小程序环境
if (typeof wx === 'undefined') {
  global.wx = {
    setStorageSync: function(key, value) {
      console.log(`setStorageSync: ${key} =`, value);
    },
    getStorageSync: function(key) {
      console.log(`getStorageSync: ${key}`);
      return null;
    },
    removeStorageSync: function(key) {
      console.log(`removeStorageSync: ${key}`);
    },
    clearStorageSync: function() {
      console.log('clearStorageSync');
    },
  };
}

console.log('=== 开始 CentralIdentityManager 测试 ===\n');

// 测试初始化
console.log('1. 测试初始化');
try {
  centralIdentityManager.init();
  console.log('✅ 初始化成功');
} catch (error) {
  console.error('❌ 初始化失败:', error.message);
}

// 测试用户信息操作
console.log('\n2. 测试用户信息操作');
try {
  const userInfo = {
    _id: 'test_user_123',
    openid: 'test_openid_123',
    nickName: '测试用户',
    avatarUrl: 'https://example.com/avatar.jpg',
  };

  // 设置用户信息
  const setResult = centralIdentityManager.setUserInfo(userInfo);
  console.log(`✅ 设置用户信息: ${setResult}`);

  // 获取用户信息
  const retrievedUserInfo = centralIdentityManager.getUserInfo();
  console.log(`✅ 获取用户信息:`, retrievedUserInfo);
  console.log(`✅ 用户信息匹配: ${JSON.stringify(retrievedUserInfo) === JSON.stringify(userInfo)}`);
} catch (error) {
  console.error('❌ 用户信息操作失败:', error.message);
}

// 测试角色操作
console.log('\n3. 测试角色操作');
try {
  // 设置用户角色
  const setResult = centralIdentityManager.setUserRole('owner');
  console.log(`✅ 设置用户角色: ${setResult}`);

  // 获取用户角色
  const retrievedRole = centralIdentityManager.getUserRole();
  console.log(`✅ 获取用户角色: ${retrievedRole}`);
  console.log(`✅ 角色匹配: ${retrievedRole === 'owner'}`);

  // 切换角色
  const switchResult = centralIdentityManager.switchRole('host');
  console.log(`✅ 切换角色: ${switchResult}`);

  // 再次获取用户角色
  const switchedRole = centralIdentityManager.getUserRole();
  console.log(`✅ 获取切换后角色: ${switchedRole}`);
  console.log(`✅ 角色切换成功: ${switchedRole === 'host'}`);
} catch (error) {
  console.error('❌ 角色操作失败:', error.message);
}

// 测试身份上下文
console.log('\n4. 测试身份上下文');
try {
  // 获取owner上下文
  const ownerContext = centralIdentityManager.getContext('owner');
  console.log(`✅ 获取owner上下文:`, ownerContext);

  // 获取host上下文
  const hostContext = centralIdentityManager.getContext('host');
  console.log(`✅ 获取host上下文:`, hostContext);
} catch (error) {
  console.error('❌ 身份上下文操作失败:', error.message);
}

// 测试UserSig操作
console.log('\n5. 测试UserSig操作');
try {
  const userSig = 'test_user_sig_123';

  // 设置UserSig
  const setResult = centralIdentityManager.setUserSig(userSig);
  console.log(`✅ 设置UserSig: ${setResult}`);

  // 获取UserSig
  const retrievedUserSig = centralIdentityManager.getUserSig();
  console.log(`✅ 获取UserSig: ${retrievedUserSig}`);
  console.log(`✅ UserSig匹配: ${retrievedUserSig === userSig}`);
} catch (error) {
  console.error('❌ UserSig操作失败:', error.message);
}

// 测试token操作
console.log('\n6. 测试token操作');
try {
  const token = 'test_token_123';

  // 设置token
  const setResult = centralIdentityManager.setToken(token);
  console.log(`✅ 设置token: ${setResult}`);

  // 获取token
  const retrievedToken = centralIdentityManager.getToken();
  console.log(`✅ 获取token: ${retrievedToken}`);
  console.log(`✅ token匹配: ${retrievedToken === token}`);
} catch (error) {
  console.error('❌ token操作失败:', error.message);
}

// 测试存储操作
console.log('\n7. 测试存储操作');
try {
  const key = 'test_key';
  const value = 'test_value';

  // 设置存储
  const setResult = centralIdentityManager.set(key, value);
  console.log(`✅ 设置存储: ${setResult}`);

  // 获取存储
  const retrievedValue = centralIdentityManager.get(key);
  console.log(`✅ 获取存储: ${retrievedValue}`);

  // 移除存储
  const removeResult = centralIdentityManager.remove(key);
  console.log(`✅ 移除存储: ${removeResult}`);
} catch (error) {
  console.error('❌ 存储操作失败:', error.message);
}

// 测试登录和登出
console.log('\n8. 测试登录和登出');
try {
  const userInfo = {
    _id: 'test_user_123',
    openid: 'test_openid_123',
    nickName: '测试用户',
    avatarUrl: 'https://example.com/avatar.jpg',
  };

  const loginResult = centralIdentityManager.login(userInfo, 'owner');
  console.log(`✅ 登录:`, loginResult);
  console.log(`✅ 登录状态: ${centralIdentityManager.isLoggedIn()}`);

  const logoutResult = centralIdentityManager.logout();
  console.log(`✅ 登出: ${logoutResult}`);
  console.log(`✅ 登出状态: ${centralIdentityManager.isLoggedIn()}`);
} catch (error) {
  console.error('❌ 登录登出操作失败:', error.message);
}

// 测试批量身份更新
console.log('\n9. 测试批量身份更新');
try {
  const identities = [
    {
      roleType: 'owner',
      profile: {
        name: '宠物主人',
        avatarUrl: 'https://example.com/owner.jpg',
      },
      openid: 'test_openid_123',
    },
    {
      roleType: 'host',
      profile: {
        name: '寄养家庭',
        avatarUrl: 'https://example.com/host.jpg',
      },
      openid: 'test_openid_123',
    },
  ];

  const updateResult = centralIdentityManager.batchUpdateIdentities(identities);
  console.log(`✅ 批量更新身份: ${updateResult}`);
} catch (error) {
  console.error('❌ 批量身份更新失败:', error.message);
}

// 测试身份摘要
console.log('\n10. 测试身份摘要');
try {
  const userInfo = {
    _id: 'test_user_123',
    openid: 'test_openid_123',
    nickName: '测试用户',
    avatarUrl: 'https://example.com/avatar.jpg',
  };

  centralIdentityManager.setUserInfo(userInfo);
  centralIdentityManager.setUserRole('owner');

  const summary = centralIdentityManager.getIdentitySummary();
  console.log(`✅ 获取身份摘要:`, summary);
} catch (error) {
  console.error('❌ 身份摘要操作失败:', error.message);
}

// 测试身份数据验证
console.log('\n11. 测试身份数据验证');
try {
  const userInfo = {
    _id: 'test_user_123',
    openid: 'test_openid_123',
    nickName: '测试用户',
    avatarUrl: 'https://example.com/avatar.jpg',
  };

  centralIdentityManager.setUserInfo(userInfo);
  centralIdentityManager.setUserRole('owner');

  const validationResult = centralIdentityManager.validateIdentityData();
  console.log(`✅ 验证身份数据:`, validationResult);
} catch (error) {
  console.error('❌ 身份数据验证失败:', error.message);
}

// 测试身份数据修复
console.log('\n12. 测试身份数据修复');
try {
  const incompleteUserInfo = {
    _id: 'test_user_123',
    // 缺少openid
    nickName: '测试用户',
  };

  centralIdentityManager.setUserInfo(incompleteUserInfo);
  centralIdentityManager.setUserRole('owner');

  const fixResult = centralIdentityManager.fixIdentityData();
  console.log(`✅ 修复身份数据:`, fixResult);

  const fixedUserInfo = centralIdentityManager.getUserInfo();
  console.log(`✅ 修复后的用户信息:`, fixedUserInfo);
} catch (error) {
  console.error('❌ 身份数据修复失败:', error.message);
}

// 测试清除所有上下文
console.log('\n13. 测试清除所有上下文');
try {
  const clearResult = centralIdentityManager.clearAllContexts();
  console.log(`✅ 清除所有上下文: ${clearResult}`);
} catch (error) {
  console.error('❌ 清除所有上下文失败:', error.message);
}

console.log('\n=== 测试完成 ===');
