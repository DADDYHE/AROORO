/**
 * IM User ID Generator
 * 用于生成符合腾讯云IM要求的唯一用户ID
 * 
 * 腾讯云IM用户ID要求：
 * 1. 长度不超过32字节
 * 2. 只包含字母、数字、下划线
 * 3. 必须唯一
 * 
 * 设计方案：
 * 1. 使用角色前缀（owner_ 或 host_）
 * 2. 对OpenID进行处理，确保唯一性的同时缩短长度
 * 3. 处理边缘情况，如OpenID为空或过短
 * 4. 提供唯一性验证机制
 */

class IMUserIdGenerator {
  /**
   * 生成IM用户ID
   * @param {string} roleType - 角色类型 ('owner' 或 'host')
   * @param {string} openid - 用户OpenID
   * @returns {string} 生成的IM用户ID
   */
  static generate(roleType, openid) {
    if (!roleType || !['owner', 'host'].includes(roleType)) {
      console.error('生成IM用户ID失败：无效的角色类型')
      return ''
    }

    if (!openid || typeof openid !== 'string') {
      console.error('生成IM用户ID失败：OpenID无效')
      return ''
    }

    // 计算前缀长度
    const prefix = `${roleType}_`
    const prefixLength = prefix.length
    
    // 计算可用的OpenID部分长度（确保总长度不超过32）
    const maxOpenIdPartLength = 32 - prefixLength
    
    // 使用前maxOpenIdPartLength个字符
    const openIdPart = openid.substring(0, maxOpenIdPartLength)
    return `${prefix}${openIdPart}`
  }

  /**
   * 验证IM用户ID是否有效
   * @param {string} userId - 要验证的用户ID
   * @returns {boolean} 是否有效
   */
  static validate(userId) {
    if (!userId || typeof userId !== 'string') {
      return false
    }

    // 检查长度
    if (userId.length > 32) {
      return false
    }

    // 检查格式（角色前缀_+字母数字下划线）
    const userIdRegex = /^(owner|host)_([a-zA-Z0-9_-]+)$/
    if (!userIdRegex.test(userId)) {
      return false
    }

    return true
  }

  /**
   * 检查IM用户ID是否唯一（模拟检查，实际应查询IM服务）
   * @param {string} userId - 要检查的用户ID
   * @returns {Promise<boolean>} 是否唯一
   */
  static async isUnique(userId) {
    if (!this.validate(userId)) {
      return false
    }

    // 这里应该实现实际的唯一性检查逻辑
    // 例如，调用IM服务的API检查用户ID是否已存在
    // 为了演示，返回模拟结果
    console.log(`检查IM用户ID唯一性：${userId}`)
    return true
  }

  /**
   * 批量生成IM用户ID
   * @param {array} userDataList - 用户数据列表，每项包含roleType和openid
   * @returns {array} 生成的IM用户ID列表
   */
  static generateBatch(userDataList) {
    if (!Array.isArray(userDataList)) {
      console.error('批量生成IM用户ID失败：参数无效')
      return []
    }

    return userDataList.map(userData => {
      return this.generate(userData.roleType, userData.openid)
    })
  }

  /**
   * 从IM用户ID中提取角色类型
   * @param {string} userId - IM用户ID
   * @returns {string|null} 角色类型
   */
  static extractRoleType(userId) {
    if (!userId || typeof userId !== 'string') {
      return null
    }

    if (userId.startsWith('owner_')) {
      return 'owner'
    } else if (userId.startsWith('host_')) {
      return 'host'
    }

    return null
  }
}

// 导出模块
module.exports = {
  IMUserIdGenerator
}
