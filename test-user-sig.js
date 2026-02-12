/**
 * 测试UserSig生成功能
 * 验证官方SDK是否能正确生成UserSig
 */

/**
 * 测试官方SDK的UserSig生成
 */
async function testOfficialSDK() {
  try {
    console.log('=== 测试官方SDK的UserSig生成 ===');
    
    const { genUserSig } = require('tls-sig-api-v2');
    
    // 腾讯云IM配置
    const IM_CONFIG = {
      SDKAppID: 1600123494,
      SECRET_KEY: '1e4ec15902de6aab54e350e3394b116dd9fd18866ffc79eeb1a210029b314523',
      EXPIRE_TIME: 24 * 3600,
    };
    
    const testUserID = 'own_05l4h598_oNIhl17JEstp_WtKc';
    const userSig = genUserSig(IM_CONFIG.SDKAppID, IM_CONFIG.SECRET_KEY, testUserID, IM_CONFIG.EXPIRE_TIME);
    
    console.log('官方SDK生成UserSig结果:', {
      userSigLength: userSig.length,
      userSigPrefix: userSig.substring(0, 100),
      userSigSuffix: userSig.substring(userSig.length - 100)
    });
    
    // 验证UserSig格式
    try {
      const decoded = Buffer.from(userSig, 'base64').toString();
      const userSigObj = JSON.parse(decoded);
      
      console.log('UserSig解码结果:', {
        hasTLSVer: !!userSigObj['TLS.ver'],
        hasTLSIdentifier: !!userSigObj['TLS.identifier'],
        hasTLSSdkappid: !!userSigObj['TLS.sdkappid'],
        hasTLSExpire: !!userSigObj['TLS.expire'],
        hasTLSTime: !!userSigObj['TLS.time'],
        hasTLSRandom: !!userSigObj['TLS.random'],
        hasTLSSig: !!userSigObj['TLS.sig']
      });
      
      return true;
    } catch (decodeError) {
      console.error('UserSig解码失败:', decodeError);
      return false;
    }
    
  } catch (error) {
    console.error('测试官方SDK失败:', error);
    return false;
  }
}

/**
 * 运行测试
 */
async function runTests() {
  console.log('开始测试UserSig生成功能...');
  
  try {
    // 测试官方SDK
    const officialSDKSuccess = await testOfficialSDK();
    
    console.log('=== 测试完成 ===');
    console.log('测试结果:', {
      officialSDKSuccess: officialSDKSuccess
    });
    
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 运行测试
runTests();
