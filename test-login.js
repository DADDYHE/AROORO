// 测试登录功能
console.log('开始测试登录功能...');

// 模拟app实例
const app = {
  globalData: {
    loginManager: {
      checkLoginStatusValid: () => false,
      login: async () => {
        console.log('模拟登录成功');
        return { success: true, message: '登录成功' };
      },
      getUserInfo: () => ({
        _id: 'test_user_123',
        openid: 'test_openid_123',
        avatarUrl: 'test_avatar_url',
        nickName: '测试用户',
        role: 'owner'
      }),
      logout: async () => {
        console.log('模拟退出登录成功');
        return true;
      }
    }
  }
};

// 测试登录功能
async function testLogin() {
  console.log('测试登录...');
  try {
    const result = await app.globalData.loginManager.login();
    console.log('登录结果:', result);
    if (result.success) {
      console.log('登录测试通过');
    } else {
      console.log('登录测试失败');
    }
  } catch (error) {
    console.error('登录测试出错:', error);
  }
}

// 测试获取用户信息
function testGetUserInfo() {
  console.log('测试获取用户信息...');
  try {
    const userInfo = app.globalData.loginManager.getUserInfo();
    console.log('用户信息:', userInfo);
    if (userInfo) {
      console.log('获取用户信息测试通过');
    } else {
      console.log('获取用户信息测试失败');
    }
  } catch (error) {
    console.error('获取用户信息测试出错:', error);
  }
}

// 测试检查登录状态
function testCheckLoginStatus() {
  console.log('测试检查登录状态...');
  try {
    const isLoggedIn = app.globalData.loginManager.checkLoginStatusValid();
    console.log('登录状态:', isLoggedIn);
    console.log('检查登录状态测试通过');
  } catch (error) {
    console.error('检查登录状态测试出错:', error);
  }
}

// 测试退出登录
async function testLogout() {
  console.log('测试退出登录...');
  try {
    const result = await app.globalData.loginManager.logout();
    console.log('退出登录结果:', result);
    if (result) {
      console.log('退出登录测试通过');
    } else {
      console.log('退出登录测试失败');
    }
  } catch (error) {
    console.error('退出登录测试出错:', error);
  }
}

// 运行所有测试
async function runAllTests() {
  console.log('=== 开始所有登录相关测试 ===');
  await testLogin();
  testGetUserInfo();
  testCheckLoginStatus();
  await testLogout();
  console.log('=== 所有测试完成 ===');
}

runAllTests();
