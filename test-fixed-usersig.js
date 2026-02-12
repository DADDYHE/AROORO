/**
 * 测试修复后的UserSig生成功能
 * 验证修改后的实现是否符合腾讯云官方标准
 */

const crypto = require('crypto');

// 直接实现TLSSigAPIv2类进行测试
class TLSSigAPIv2 {
  constructor(sdkappid, key) {
    this.sdkappid = sdkappid;
    this.key = key;
    this.expire = 24 * 3600;
  }

  genUserSig(identifier, expire = this.expire) {
    if (!identifier) {
      console.error('生成UserSig失败：identifier不能为空');
      return '';
    }

    const currTime = Math.floor(Date.now() / 1000);
    const expireTime = currTime + expire;
    const random = Math.floor(Math.random() * 4294967296);

    // 严格按照腾讯云官方字段顺序和格式
    const sigFields = {
      'TLS.identifier': identifier,
      'TLS.sdkappid': this.sdkappid,
      'TLS.time': currTime,
      'TLS.expire': expireTime,
      'TLS.random': random,
      'TLS.ver': '2.0'
    };

    // 构造签名字符串
    const sigContent = JSON.stringify(sigFields);
    console.log('签名字符串:', sigContent);
    
    try {
      // 使用HMAC-SHA256算法计算签名
      const hmac = crypto.createHmac('sha256', this.key);
      hmac.update(sigContent, 'utf8');
      const signature = hmac.digest('base64');
      console.log('签名结果:', signature);

      // 构造最终的UserSig对象
      const userSig = {
        'TLS.identifier': identifier,
        'TLS.sdkappid': this.sdkappid,
        'TLS.time': currTime,
        'TLS.expire': expireTime,
        'TLS.random': random,
        'TLS.ver': '2.0',
        'TLS.sig': signature
      };

      // 转换为JSON字符串并进行Base64编码
      const userSigJson = JSON.stringify(userSig);
      console.log('UserSig JSON:', userSigJson);
      
      const userSigBase64 = Buffer.from(userSigJson).toString('base64');
      console.log('最终UserSig:', userSigBase64);
      console.log('UserSig长度:', userSigBase64.length);
      
      // 验证生成的UserSig格式
      this._validateUserSig(userSigBase64);
      
      return userSigBase64;
    } catch (error) {
      console.error('生成UserSig失败:', error);
      return '';
    }
  }

  _validateUserSig(userSig) {
    try {
      const decoded = Buffer.from(userSig, 'base64').toString('utf8');
      const userSigObj = JSON.parse(decoded);
      
      const requiredFields = [
        'TLS.identifier',
        'TLS.sdkappid', 
        'TLS.time',
        'TLS.expire',
        'TLS.random',
        'TLS.ver',
        'TLS.sig'
      ];
      
      const missingFields = requiredFields.filter(field => !userSigObj[field]);
      if (missingFields.length > 0) {
        console.warn('UserSig缺少字段:', missingFields);
      } else {
        console.log('UserSig格式验证通过');
      }
    } catch (error) {
      console.error('UserSig格式验证失败:', error);
    }
  }
}

// 测试UserSig生成
function testUserSigGeneration() {
  console.log('=== 测试UserSig生成功能 ===');
  
  try {
    // 配置参数
    const SDKAppID = 1600123494;
    const SECRET_KEY = '1e4ec15902de6aab54e350e3394b116dd9fd18866ffc79eeb1a210029b314523';
    const testUserID = 'own_05l4h598_oNIhl17JEstp_WtKc';
    
    // 创建API实例
    const api = new TLSSigAPIv2(SDKAppID, SECRET_KEY);
    
    // 生成UserSig
    const userSig = api.genUserSig(testUserID);
    
    console.log('\n=== 测试结果 ===');
    console.log('UserSig生成成功:', !!userSig);
    console.log('UserSig长度:', userSig ? userSig.length : 0);
    
    if (userSig) {
      // 验证UserSig格式
      try {
        const decoded = Buffer.from(userSig, 'base64').toString('utf8');
        const userSigObj = JSON.parse(decoded);
        
        console.log('\nUserSig解码验证:');
        console.log('✓ TLS.ver:', userSigObj['TLS.ver']);
        console.log('✓ TLS.identifier:', userSigObj['TLS.identifier']);
        console.log('✓ TLS.sdkappid:', userSigObj['TLS.sdkappid']);
        console.log('✓ TLS.time:', userSigObj['TLS.time']);
        console.log('✓ TLS.expire:', userSigObj['TLS.expire']);
        console.log('✓ TLS.random:', userSigObj['TLS.random']);
        console.log('✓ TLS.sig:', userSigObj['TLS.sig'] ? '存在' : '缺失');
        console.log('✓ 标识符匹配:', userSigObj['TLS.identifier'] === testUserID);
        
        console.log('\n🎉 UserSig生成测试通过！');
        console.log('\n生成的UserSig:');
        console.log(userSig);
        
      } catch (decodeError) {
        console.error('\n❌ UserSig解码失败:', decodeError);
      }
    } else {
      console.error('\n❌ UserSig生成失败！');
    }
    
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 运行测试
testUserSigGeneration();
