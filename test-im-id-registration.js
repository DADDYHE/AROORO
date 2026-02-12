/**
 * IM服务ID注册验证测试脚本
 * 
 * 功能：验证标准格式的30位ID是否能在IM服务中成功注册
 * 流程：
 * 1. 生成标准格式的30位ID
 * 2. 通过云函数获取userSig
 * 3. 尝试登录IM服务
 * 4. 测试基本功能
 * 5. 记录结果
 */

// 使用项目中已经配置好的IM单例
const { imSingleton } = require('./utils/imSingleton');
const { IMUserIdGenerator } = require('./utils/imUserIdGenerator');

// 生成标准格式的30位ID
const generateStandardId = (prefix = 'test', openid = 'test_openid_' + Date.now()) => {
  // 计算前缀长度
  const prefixLength = prefix ? (prefix.length + 1) : 0; // +1 for the underscore
  
  // 生成openid哈希（8位）
  let openidHash = '';
  if (openid) {
    // 使用简单的哈希方法生成openid的8位哈希值
    let hash = 0;
    for (let i = 0; i < openid.length; i++) {
      const char = openid.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    // 将哈希值转换为36进制，并确保长度为8位
    openidHash = Math.abs(hash).toString(36).padStart(8, '0').substr(0, 8);
  } else {
    // 如果没有openid，生成8位随机字符串
    openidHash = Math.random().toString(36).substr(2, 8).padEnd(8, '0').substr(0, 8);
  }
  
  // 生成时间戳（8位）
  const timestamp = Date.now().toString(36).padStart(8, '0').substr(0, 8);
  
  // 计算需要的随机字符串长度
  const randomPartLength = 30 - prefixLength - 8 - 8; // 8位openid哈希 + 8位时间戳
  
  // 生成随机字符串
  let random = '';
  while (random.length < randomPartLength) {
    random += Math.random().toString(36).substr(2, randomPartLength - random.length);
  }
  random = random.substring(0, randomPartLength);
  
  // 组合ID
  let userId = prefix ? `${prefix}_${openidHash}${timestamp}${random}` : `${openidHash}${timestamp}${random}`;
  
  // 确保只包含允许的字符（字母、数字、下划线）
  userId = userId.replace(/[^a-zA-Z0-9_]/g, '');
  
  // 最终确保长度为30位
  if (userId.length < 30) {
    // 如果长度不足，添加随机字符
    const paddingLength = 30 - userId.length;
    const padding = Math.random().toString(36).substr(2, paddingLength);
    userId += padding;
  } else if (userId.length > 30) {
    // 如果长度超过，截取到30位
    userId = userId.substring(0, 30);
  }
  
  return userId;
};

// 模拟云函数调用获取userSig
const getCloudUserSig = async (userID, openid) => {
  console.log('模拟调用云函数获取userSig...');
  console.log('  userID:', userID);
  console.log('  openid:', openid);
  
  // 注意：在实际环境中，这里应该调用真实的云函数
  // 由于我们在本地测试，这里返回一个模拟的userSig
  // 真实环境中，请使用以下代码：
  /*
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  
  const result = await cloud.callFunction({
    name: 'login',
    data: {
      openid: openid,
      imUserID: userID
    }
  });
  
  return result.result.userSig;
  */
  
  // 模拟返回一个有效的userSig格式
  // 注意：这只是一个格式模拟，实际使用时需要调用真实的云函数
  return 'eJwtzDEOgjAQBe_C...' + Math.random().toString(36).substr(2, 20);
};

// 测试IM服务ID注册
const testIMIdRegistration = async () => {
  console.log('====================================');
  console.log('开始测试IM服务ID注册验证');
  console.log('====================================');
  
  try {
    // 1. 生成标准格式的30位ID
    console.log('\n1. 生成标准格式的30位ID');
    const testOpenid = 'test_openid_' + Date.now();
    const standardId = generateStandardId('test', testOpenid);
    console.log('  生成的标准ID:', standardId);
    console.log('  ID长度:', standardId.length);
    console.log('  ID格式验证:', standardId.length === 30 ? '✓ 通过' : '✗ 失败');
    
    // 2. 获取userSig
    console.log('\n2. 获取userSig');
    const userSig = await getCloudUserSig(standardId, testOpenid);
    console.log('  获取userSig成功');
    console.log('  userSig长度:', userSig.length);
    console.log('  userSig类型:', typeof userSig);
    
    // 3. 检查IM SDK是否就绪
    console.log('\n3. 检查IM SDK是否就绪');
    const isSDKReady = await imSingleton.waitForReady(10000);
    console.log('  SDK就绪状态:', isSDKReady ? '✓ 就绪' : '✗ 未就绪');
    
    if (!isSDKReady) {
      console.error('  SDK未就绪，测试终止');
      return;
    }
    
    // 4. 尝试登录
    console.log('\n4. 尝试登录IM服务');
    console.log('  登录参数:');
    console.log('    userID:', standardId);
    console.log('    userSig长度:', userSig.length);
    
    try {
      const loginResult = await imSingleton.login({
        userID: standardId,
        userSig: userSig
      });
      
      console.log('  登录结果:', loginResult);
      console.log('  登录成功:', '✓ 成功');
      
      // 5. 测试基本功能
      console.log('\n5. 测试基本功能');
      
      // 5.1 获取会话列表
      console.log('  5.1 获取会话列表');
      try {
        const conversationList = await imSingleton.getConversationList();
        console.log('    会话列表获取成功');
        console.log('    会话数量:', conversationList.data.conversationList ? conversationList.data.conversationList.length : 0);
      } catch (error) {
        console.warn('    会话列表获取失败:', error.message);
      }
      
      // 5.2 获取当前用户信息
      console.log('  5.2 获取当前用户信息');
      try {
        const tim = imSingleton.getSDK();
        const userInfo = await tim.getMyProfile();
        console.log('    用户信息获取成功');
        console.log('    用户ID:', userInfo.data.userID);
      } catch (error) {
        console.warn('    用户信息获取失败:', error.message);
      }
      
      // 6. 登出
      console.log('\n6. 登出IM服务');
      await imSingleton.logout();
      console.log('  登出成功');
      
    } catch (loginError) {
      console.error('  登录失败:', loginError.message);
      console.error('  错误详情:', loginError);
      
      // 分析错误原因
      if (loginError.code === 70002) {
        console.log('  错误分析: 无效的用户ID');
      } else if (loginError.code === 70004) {
        console.log('  错误分析: 无效的userSig');
      } else if (loginError.code === 70009) {
        console.log('  错误分析: userSig过期');
      } else if (loginError.code === 70020) {
        console.log('  错误分析: 已登录');
      } else if (loginError.code === 2024) {
        console.log('  错误分析: SDK初始化错误，可能是环境配置问题');
      } else {
        console.log('  错误分析: 其他错误');
      }
    }
    
    console.log('\n====================================');
    console.log('测试完成');
    console.log('====================================');
    
  } catch (error) {
    console.error('测试过程中发生错误:', error);
    console.error('错误详情:', error.stack);
  }
};

// 运行测试
if (require.main === module) {
  testIMIdRegistration();
}

// 导出测试函数
module.exports = {
  testIMIdRegistration,
  generateStandardId,
  getCloudUserSig
};
