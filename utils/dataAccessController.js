/**
 * 数据访问控制工具
 * 用于实现严格的数据访问权限控制，确保用户只能访问当前登录身份对应的数据
 */

const IdentityManager = require('./identityManager')
const { permissionManager } = require('./permissionManager')

class DataAccessController {
  constructor() {
    this.accessLog = []
    this.maxLogSize = 1000
  }

  /**
   * 检查数据访问权限
   * @param {string} dataType - 数据类型 (pet, order, message, profile, host, owner)
   * @param {string} action - 操作类型 (view, create, edit, delete, list)
   * @param {object} data - 数据对象（用于验证所有权）
   * @returns {object} 权限检查结果 { allowed: boolean, reason: string }
   */
  checkAccess(dataType, action, data = null) {
    // 获取当前角色
    const currentRole = IdentityManager.getCurrentRole()
    console.log(`[DataAccess] 检查数据访问权限: ${dataType}.${action}, 角色: ${currentRole}`)

    // 检查登录状态
    if (!IdentityManager.isLoggedIn()) {
      this._logAccess('DENIED', dataType, action, currentRole, '用户未登录')
      return {
        allowed: false,
        reason: '用户未登录'
      }
    }

    // 检查角色类型是否有效
    if (!['owner', 'host'].includes(currentRole)) {
      this._logAccess('DENIED', dataType, action, currentRole, '无效的角色类型')
      return {
        allowed: false,
        reason: '无效的角色类型'
      }
    }

    // 根据数据类型检查权限
    switch (dataType) {
    case 'pet':
      return this._checkPetAccess(currentRole, action, data)
    case 'order':
      return this._checkOrderAccess(currentRole, action, data)
    case 'message':
      return this._checkMessageAccess(currentRole, action, data)
    case 'profile':
      return this._checkProfileAccess(currentRole, action, data)
    case 'host':
      return this._checkHostAccess(currentRole, action, data)
    case 'owner':
      return this._checkOwnerAccess(currentRole, action, data)
    default:
      this._logAccess('DENIED', dataType, action, currentRole, '未知的数据类型')
      return {
        allowed: false,
        reason: '未知的数据类型'
      }
    }
  }

  /**
   * 检查宠物数据访问权限
   * @private
   */
  _checkPetAccess(role, action, data) {
    // 宠物主人角色可以管理自己的宠物
    if (role === 'owner') {
      const hasPermission = permissionManager.checkPermission('owner', 'pet', action)

      if (!hasPermission) {
        this._logAccess('DENIED', 'pet', action, role, '宠物主人没有该操作权限')
        return {
          allowed: false,
          reason: '宠物主人没有该操作权限'
        }
      }

      // 如果是查看、编辑或删除特定宠物，验证所有权
      if (data && ['view', 'edit', 'delete'].includes(action)) {
        const userInfo = IdentityManager.getCurrentUserInfo()
        if (data.ownerId && data.ownerId !== userInfo._id) {
          this._logAccess('DENIED', 'pet', action, role, '宠物不属于当前用户')
          return {
            allowed: false,
            reason: '宠物不属于当前用户'
          }
        }
      }

      this._logAccess('ALLOWED', 'pet', action, role)
      return { allowed: true }
    }

    // 寄养家庭角色只能查看宠物列表
    if (role === 'host') {
      if (action === 'list' || action === 'view') {
        const hasPermission = permissionManager.checkPermission('host', 'pet', action)
        if (hasPermission) {
          this._logAccess('ALLOWED', 'pet', action, role)
          return { allowed: true }
        }
      }

      this._logAccess('DENIED', 'pet', action, role, '寄养家庭没有该操作权限')
      return {
        allowed: false,
        reason: '寄养家庭没有该操作权限'
      }
    }

    return {
      allowed: false,
      reason: '未知角色'
    }
  }

  /**
   * 检查订单数据访问权限
   * @private
   */
  _checkOrderAccess(role, action, data) {
    // 宠物主人角色可以管理自己的订单
    if (role === 'owner') {
      const hasPermission = permissionManager.checkPermission('owner', 'order', action)

      if (!hasPermission) {
        this._logAccess('DENIED', 'order', action, role, '宠物主人没有该操作权限')
        return {
          allowed: false,
          reason: '宠物主人没有该操作权限'
        }
      }

      // 如果是查看、取消特定订单，验证所有权
      if (data && ['view', 'cancel'].includes(action)) {
        const userInfo = IdentityManager.getCurrentUserInfo()
        if (data.ownerId && data.ownerId !== userInfo._id) {
          this._logAccess('DENIED', 'order', action, role, '订单不属于当前用户')
          return {
            allowed: false,
            reason: '订单不属于当前用户'
          }
        }
      }

      this._logAccess('ALLOWED', 'order', action, role)
      return { allowed: true }
    }

    // 寄养家庭角色可以管理自己收到的订单
    if (role === 'host') {
      const hasPermission = permissionManager.checkPermission('host', 'order', action)

      if (!hasPermission) {
        this._logAccess('DENIED', 'order', action, role, '寄养家庭没有该操作权限')
        return {
          allowed: false,
          reason: '寄养家庭没有该操作权限'
        }
      }

      // 如果是查看、接受、拒绝、完成特定订单，验证所有权
      if (data && ['view', 'accept', 'reject', 'complete'].includes(action)) {
        const userInfo = IdentityManager.getCurrentUserInfo()
        if (data.hostId && data.hostId !== userInfo._id) {
          this._logAccess('DENIED', 'order', action, role, '订单不属于当前寄养家庭')
          return {
            allowed: false,
            reason: '订单不属于当前寄养家庭'
          }
        }
      }

      this._logAccess('ALLOWED', 'order', action, role)
      return { allowed: true }
    }

    return {
      allowed: false,
      reason: '未知角色'
    }
  }

  /**
   * 检查消息数据访问权限
   * @private
   */
  _checkMessageAccess(role, action, data) {
    const hasPermission = permissionManager.checkPermission(role, 'message', action)

    if (!hasPermission) {
      this._logAccess('DENIED', 'message', action, role, '没有消息访问权限')
      return {
        allowed: false,
        reason: '没有消息访问权限'
      }
    }

    // 验证消息参与者身份
    if (data && action === 'view') {
      const userInfo = IdentityManager.getCurrentUserInfo()
      const isParticipant = data.from === userInfo._id || data.to === userInfo._id

      if (!isParticipant) {
        this._logAccess('DENIED', 'message', action, role, '用户不是消息参与者')
        return {
          allowed: false,
          reason: '用户不是消息参与者'
        }
      }
    }

    this._logAccess('ALLOWED', 'message', action, role)
    return { allowed: true }
  }

  /**
   * 检查个人资料访问权限
   * @private
   */
  _checkProfileAccess(role, action, data) {
    const hasPermission = permissionManager.checkPermission(role, 'profile', action)

    if (!hasPermission) {
      this._logAccess('DENIED', 'profile', action, role, '没有个人资料访问权限')
      return {
        allowed: false,
        reason: '没有个人资料访问权限'
      }
    }

    // 验证个人资料所有权
    if (data && action === 'edit') {
      const userInfo = IdentityManager.getCurrentUserInfo()
      if (data.userId && data.userId !== userInfo._id) {
        this._logAccess('DENIED', 'profile', action, role, '个人资料不属于当前用户')
        return {
          allowed: false,
          reason: '个人资料不属于当前用户'
        }
      }
    }

    this._logAccess('ALLOWED', 'profile', action, role)
    return { allowed: true }
  }

  /**
   * 检查寄养家庭数据访问权限
   * @private
   */
  _checkHostAccess(role, action, data) {
    // 只有当前角色是寄养家庭时，才能访问寄养家庭数据
    if (role !== 'host') {
      this._logAccess('DENIED', 'host', action, role, '当前角色不是寄养家庭')
      return {
        allowed: false,
        reason: '当前角色不是寄养家庭'
      }
    }

    const hasPermission = permissionManager.checkPermission('host', 'host', action)

    if (!hasPermission) {
      this._logAccess('DENIED', 'host', action, role, '没有寄养家庭数据访问权限')
      return {
        allowed: false,
        reason: '没有寄养家庭数据访问权限'
      }
    }

    // 验证寄养家庭数据所有权
    if (data && action !== 'list') {
      const userInfo = IdentityManager.getCurrentUserInfo()
      if (data.userId && data.userId !== userInfo._id) {
        this._logAccess('DENIED', 'host', action, role, '寄养家庭数据不属于当前用户')
        return {
          allowed: false,
          reason: '寄养家庭数据不属于当前用户'
        }
      }
    }

    this._logAccess('ALLOWED', 'host', action, role)
    return { allowed: true }
  }

  /**
   * 检查宠物主人数据访问权限
   * @private
   */
  _checkOwnerAccess(role, action, data) {
    // 只有当前角色是宠物主人时，才能访问宠物主人数据
    if (role !== 'owner') {
      this._logAccess('DENIED', 'owner', action, role, '当前角色不是宠物主人')
      return {
        allowed: false,
        reason: '当前角色不是宠物主人'
      }
    }

    // 验证宠物主人数据所有权
    if (data && action !== 'list') {
      const userInfo = IdentityManager.getCurrentUserInfo()
      if (data.userId && data.userId !== userInfo._id) {
        this._logAccess('DENIED', 'owner', action, role, '宠物主人数据不属于当前用户')
        return {
          allowed: false,
          reason: '宠物主人数据不属于当前用户'
        }
      }
    }

    this._logAccess('ALLOWED', 'owner', action, role)
    return { allowed: true }
  }

  /**
   * 记录访问日志
   * @private
   */
  _logAccess(result, dataType, action, role, reason = '') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      result,
      dataType,
      action,
      role,
      reason
    }

    this.accessLog.push(logEntry)

    // 限制日志大小
    if (this.accessLog.length > this.maxLogSize) {
      this.accessLog = this.accessLog.slice(-this.maxLogSize)
    }

    console.log(`[DataAccess] ${result}: ${dataType}.${action} (${role})${reason ? ' - ' + reason : ''}`)
  }

  /**
   * 过滤数据，只返回当前角色有权访问的数据
   * @param {string} dataType - 数据类型
   * @param {string} action - 操作类型
   * @param {array} dataList - 数据列表
   * @returns {array} 过滤后的数据列表
   */
  filterData(dataType, action, dataList) {
    if (!Array.isArray(dataList)) {
      return []
    }

    const currentRole = IdentityManager.getCurrentRole()
    console.log(`[DataAccess] 过滤数据: ${dataType}.${action}, 角色: ${currentRole}, 原始数据量: ${dataList.length}`)

    const filteredData = dataList.filter(data => {
      const accessResult = this.checkAccess(dataType, action, data)
      return accessResult.allowed
    })

    console.log(`[DataAccess] 过滤后数据量: ${filteredData.length}`)

    return filteredData
  }

  /**
   * 批量检查访问权限
   * @param {array} requests - 请求列表，每个元素格式为 { dataType, action, data }
   * @returns {array} 权限检查结果列表
   */
  checkAccessBatch(requests) {
    return requests.map(request => {
      return this.checkAccess(request.dataType, request.action, request.data)
    })
  }

  /**
   * 获取访问日志
   * @param {number} limit - 返回的日志条数限制
   * @returns {array} 访问日志
   */
  getAccessLog(limit = 100) {
    return this.accessLog.slice(-limit)
  }

  /**
   * 清除访问日志
   */
  clearAccessLog() {
    this.accessLog = []
    console.log('[DataAccess] 访问日志已清除')
  }
}

// 导出单例
const dataAccessController = new DataAccessController()

module.exports = {
  DataAccessController,
  dataAccessController
}
