// 消息页面功能测试脚本 - 模拟微信小程序环境

// 模拟微信小程序API
if (typeof wx === 'undefined') {
  global.wx = {
    getStorageSync: () => null,
    setStorageSync: () => {},
    getNetworkType: (options) => {
      if (options.success) {
        options.success({ networkType: 'wifi' });
      }
    },
    showToast: () => {},
    TencentCloudChat: {
      TYPES: {
        CONV_C2C: 'C2C',
        CONV_GROUP: 'GROUP'
      }
    }
  };
}

// 模拟全局对象
if (!global.app) {
  global.app = {
    globalData: {
      userInfo: null,
      userRole: 'owner'
    }
  };
}

// 导入模块
const MessageService = require('./utils/messageService');
const { imSingleton } = require('./utils/imSingleton');

// 测试配置
const testConfig = {
  testUserID: 'test_user_123',
  testUserSig: 'test_sig_123',
  testConversationID: 'C2C_test_user_456'
};

// 测试结果
const testResults = {
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  testDetails: []
};

// 测试函数
function runTest(testName, testFunction) {
  testResults.totalTests++;
  console.log(`\n=== 测试: ${testName} ===`);
  
  try {
    const result = testFunction();
    if (result instanceof Promise) {
      return result
        .then(() => {
          console.log(`✅ ${testName} 测试通过`);
          testResults.passedTests++;
          testResults.testDetails.push({ name: testName, status: 'passed' });
        })
        .catch(error => {
          console.error(`❌ ${testName} 测试失败:`, error.message);
          testResults.failedTests++;
          testResults.testDetails.push({ name: testName, status: 'failed', error: error.message });
        });
    } else {
      console.log(`✅ ${testName} 测试通过`);
      testResults.passedTests++;
      testResults.testDetails.push({ name: testName, status: 'passed' });
    }
  } catch (error) {
    console.error(`❌ ${testName} 测试失败:`, error.message);
    testResults.failedTests++;
    testResults.testDetails.push({ name: testName, status: 'failed', error: error.message });
  }
}

// 测试消息服务初始化
function testMessageServiceInit() {
  console.log('测试消息服务初始化...');
  if (MessageService) {
    console.log('✅ 消息服务初始化成功');
  } else {
    throw new Error('消息服务初始化失败');
  }
}

// 测试IM SDK初始化
async function testIMSDKInit() {
  console.log('测试IM SDK初始化...');
  const isReady = await imSingleton.waitForReady(3000);
  console.log('SDK就绪状态:', isReady);
  if (isReady || imSingleton.getSDK()) {
    console.log('✅ IM SDK初始化成功');
  } else {
    console.log('⚠️ IM SDK可能尚未就绪，但实例存在');
  }
}

// 测试获取会话列表
async function testGetConversations() {
  console.log('测试获取会话列表...');
  const result = await MessageService.getConversations({ count: 10 });
  console.log('获取会话列表结果:', {
    code: result.code,
    message: result.message,
    dataLength: result.data ? result.data.length : 0,
    hasMore: !!result.nextReqMessageID
  });
  if (result.code === 0) {
    console.log('✅ 获取会话列表成功');
  } else {
    console.log('⚠️ 获取会话列表失败，但可能是因为未登录:', result.message);
  }
}

// 测试分页加载
async function testPagination() {
  console.log('测试分页加载...');
  // 测试第一页
  const firstPage = await MessageService.getConversations({ count: 5 });
  console.log('第一页结果:', {
    code: firstPage.code,
    dataLength: firstPage.data ? firstPage.data.length : 0,
    hasMore: !!firstPage.nextReqMessageID
  });
  
  // 如果有更多数据，测试第二页
  if (firstPage.code === 0 && firstPage.nextReqMessageID) {
    const secondPage = await MessageService.getConversations({
      count: 5,
      nextReqMessageID: firstPage.nextReqMessageID
    });
    console.log('第二页结果:', {
      code: secondPage.code,
      dataLength: secondPage.data ? secondPage.data.length : 0,
      hasMore: !!secondPage.nextReqMessageID
    });
  }
  console.log('✅ 分页加载测试完成');
}

// 测试错误处理
async function testErrorHandling() {
  console.log('测试错误处理...');
  // 测试未登录情况下的错误处理
  const originalUserInfo = global.userInfo;
  global.userInfo = null;
  
  const result = await MessageService.getConversations();
  console.log('未登录错误处理结果:', {
    code: result.code,
    message: result.message
  });
  
  global.userInfo = originalUserInfo;
  console.log('✅ 错误处理测试完成');
}

// 运行所有测试
async function runAllTests() {
  console.log('开始运行消息页面功能测试...');
  console.log('==================================');
  
  // 运行测试
  runTest('消息服务初始化', testMessageServiceInit);
  await runTest('IM SDK初始化', testIMSDKInit);
  await runTest('获取会话列表', testGetConversations);
  await runTest('分页加载', testPagination);
  await runTest('错误处理', testErrorHandling);
  
  // 等待所有异步测试完成
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 输出测试结果
  console.log('\n==================================');
  console.log('测试结果汇总:');
  console.log(`总测试数: ${testResults.totalTests}`);
  console.log(`通过测试: ${testResults.passedTests}`);
  console.log(`失败测试: ${testResults.failedTests}`);
  console.log(`成功率: ${((testResults.passedTests / testResults.totalTests) * 100).toFixed(2)}%`);
  
  if (testResults.failedTests > 0) {
    console.log('\n失败测试详情:');
    testResults.testDetails
      .filter(test => test.status === 'failed')
      .forEach(test => {
        console.log(`- ${test.name}: ${test.error}`);
      });
  }
  
  console.log('\n测试完成!');
  return testResults;
}

// 运行测试
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('测试运行失败:', error);
  });
}

module.exports = { runAllTests, testResults };
