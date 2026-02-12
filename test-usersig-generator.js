/**
 * 测试UserSig生成功能
 * 验证TLSSigAPIv2是否能正确生成UserSig
 */

const { Api: TLSSigAPIv2 } = require('./cloudfunctions/login/TLSSigAPIv2');

// 测试配置
const TEST_CONFIG = {
  SDKAppID: 1600123494,
  SECRET_KEY: '1e4ec15902de6aab54e350e3394b116dd9fd18866ffc79eeb1a210029b314523',
  EXPIRE_TIME: 24 * 3600,
  TEST_IDENTIFIER: 'own_05l4h598_oNIhl17JEstp_WtKc' // 正确格式的IM用户ID
};

// 测试函数
async function testUserSigGenerator() {
  console.log('=== 开始测试UserSig生成 ===');
  console.log('测试配置:', {
    SDKAppID: TEST_CONFIG.SDKAppID,
    SECRET_KEY: TEST_CONFIG.SECRET_KEY ? '已配置' : '未配置',
    EXPIRE_TIME: TEST_CONFIG.EXPIRE_TIME,
    TEST_IDENTIFIER: TEST_CONFIG.TEST_IDENTIFIER
  });

  try {
    // 初始化API
    const api = new TLSSigAPIv2(TEST_CONFIG.SDKAppID, TEST_CONFIG.SECRET_KEY);
    console.log('初始化API成功');

    // 生成UserSig
    const userSig = api.genUserSig(TEST_CONFIG.TEST_IDENTIFIER, TEST_CONFIG.EXPIRE_TIME);
    console.log('生成UserSig成功');
    console.log('UserSig长度:', userSig.length);
    console.log('UserSig前50字符:', userSig.substring(0, 50) + '...');

    // 验证UserSig
    const verifyResult = api.verifyUserSig(userSig, TEST_CONFIG.TEST_IDENTIFIER);
    console.log('验证UserSig结果:', verifyResult);

    if (verifyResult.valid) {
      console.log('=== 测试通过: UserSig生成和验证成功 ===');
    } else {
      console.error('=== 测试失败: UserSig验证失败 ===');
      console.error('错误信息:', verifyResult.error);
    }

    return {
      success: verifyResult.valid,
      userSig: userSig,
      verifyResult: verifyResult
    };
  } catch (error) {
    console.error('=== 测试失败: 发生错误 ===');
    console.error('错误信息:', error.message);
    console.error('错误堆栈:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

// 运行测试
if (require.main === module) {
  testUserSigGenerator().then(result => {
    console.log('测试结果:', result);
  }).catch(error => {
    console.error('测试执行失败:', error);
  });
}

module.exports = { testUserSigGenerator };