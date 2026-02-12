/**
 * 加密管理器
 * 用于对敏感数据进行加密和解密
 * 
 * 参考文档：
 * - 微信小程序官方文档：https://developers.weixin.qq.com/miniprogram/dev/framework/
 */

class CryptoManager {
  constructor() {
    this.logger = console;
    this.secretKey = this._generateSecretKey();
    this.iv = this._generateIV();
  }

  /**
   * 生成密钥
   * @private
   * @returns {string} 密钥
   */
  _generateSecretKey() {
    // 实际项目中，密钥应该从安全的地方获取，例如云函数
    // 这里为了演示，使用固定的密钥
    // 注意：在生产环境中，应该使用动态生成的密钥，并通过安全通道传递
    return 'zuoyoujia20240122';
  }

  /**
   * 生成初始化向量
   * @private
   * @returns {string} 初始化向量
   */
  _generateIV() {
    // 实际项目中，IV应该随机生成
    // 这里为了演示，使用固定的IV
    return 'zuoyoujiaiv2024';
  }

  /**
   * 加密数据
   * @param {any} data - 要加密的数据
   * @returns {string} 加密后的数据
   */
  encrypt(data) {
    try {
      // 将数据转换为字符串
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      
      // 这里使用简单的加密方法
      // 实际项目中，应该使用更安全的加密算法，例如AES
      let encrypted = '';
      for (let i = 0; i < dataStr.length; i++) {
        const charCode = dataStr.charCodeAt(i) ^ this.secretKey.charCodeAt(i % this.secretKey.length);
        encrypted += String.fromCharCode(charCode);
      }
      
      // 将加密后的数据转换为Base64编码
      return this._encodeBase64(encrypted);
    } catch (error) {
      this.logger.error('加密数据失败：', error);
      return null;
    }
  }

  /**
   * 解密数据
   * @param {string} encryptedData - 加密后的数据
   * @returns {any} 解密后的数据
   */
  decrypt(encryptedData) {
    try {
      // 将Base64编码的数据解码
      const decodedData = this._decodeBase64(encryptedData);
      
      // 解密数据
      let decrypted = '';
      for (let i = 0; i < decodedData.length; i++) {
        const charCode = decodedData.charCodeAt(i) ^ this.secretKey.charCodeAt(i % this.secretKey.length);
        decrypted += String.fromCharCode(charCode);
      }
      
      // 尝试将解密后的数据转换为对象
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      this.logger.error('解密数据失败：', error);
      return null;
    }
  }

  /**
   * Base64编码
   * @private
   * @param {string} str - 要编码的字符串
   * @returns {string} Base64编码后的字符串
   */
  _encodeBase64(str) {
    if (typeof wx !== 'undefined' && wx.base64Encode) {
      return wx.base64Encode(str);
    } else {
      // 降级方案
      return btoa(unescape(encodeURIComponent(str)));
    }
  }

  /**
   * Base64解码
   * @private
   * @param {string} str - 要解码的字符串
   * @returns {string} Base64解码后的字符串
   */
  _decodeBase64(str) {
    if (typeof wx !== 'undefined' && wx.base64Decode) {
      return wx.base64Decode(str);
    } else {
      // 降级方案
      return decodeURIComponent(escape(atob(str)));
    }
  }

  /**
   * 加密存储数据
   * @param {string} key - 存储键
   * @param {any} value - 存储值
   * @param {string} [roleType] - 身份类型
   * @returns {boolean} 是否存储成功
   */
  encryptStorage(key, value, roleType = null) {
    try {
      const encryptedValue = this.encrypt(value);
      if (!encryptedValue) {
        return false;
      }

      // 构建存储键
      const storageKey = roleType ? `${roleType}_${key}` : key;
      
      // 存储加密后的数据
      wx.setStorageSync(storageKey, encryptedValue);
      this.logger.debug(`加密存储数据成功：${storageKey}`);
      return true;
    } catch (error) {
      this.logger.error('加密存储数据失败：', error);
      return false;
    }
  }

  /**
   * 解密存储数据
   * @param {string} key - 存储键
   * @param {any} [defaultValue] - 默认值
   * @param {string} [roleType] - 身份类型
   * @returns {any} 解密后的数据或默认值
   */
  decryptStorage(key, defaultValue = null, roleType = null) {
    try {
      // 构建存储键
      const storageKey = roleType ? `${roleType}_${key}` : key;
      
      // 获取加密后的数据
      const encryptedValue = wx.getStorageSync(storageKey);
      if (!encryptedValue) {
        return defaultValue;
      }

      // 解密数据
      const decryptedValue = this.decrypt(encryptedValue);
      if (decryptedValue === null) {
        return defaultValue;
      }

      this.logger.debug(`解密存储数据成功：${storageKey}`);
      return decryptedValue;
    } catch (error) {
      this.logger.error('解密存储数据失败：', error);
      return defaultValue;
    }
  }

  /**
   * 检查数据是否已加密
   * @param {any} data - 要检查的数据
   * @returns {boolean} 是否已加密
   */
  isEncrypted(data) {
    if (typeof data !== 'string') {
      return false;
    }
    
    // 检查是否为Base64编码
    try {
      this._decodeBase64(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 加密对象中的敏感字段
   * @param {object} obj - 要加密的对象
   * @param {array} sensitiveFields - 敏感字段列表
   * @returns {object} 加密后的对象
   */
  encryptSensitiveFields(obj, sensitiveFields) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const encryptedObj = { ...obj };
    
    sensitiveFields.forEach(field => {
      if (encryptedObj[field] !== undefined) {
        encryptedObj[field] = this.encrypt(encryptedObj[field]);
      }
    });

    return encryptedObj;
  }

  /**
   * 解密对象中的敏感字段
   * @param {object} obj - 要解密的对象
   * @param {array} sensitiveFields - 敏感字段列表
   * @returns {object} 解密后的对象
   */
  decryptSensitiveFields(obj, sensitiveFields) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const decryptedObj = { ...obj };
    
    sensitiveFields.forEach(field => {
      if (decryptedObj[field] !== undefined) {
        decryptedObj[field] = this.decrypt(decryptedObj[field]);
      }
    });

    return decryptedObj;
  }
}

// 导出单例实例
const cryptoManager = new CryptoManager();

module.exports = {
  CryptoManager,
  cryptoManager
};
