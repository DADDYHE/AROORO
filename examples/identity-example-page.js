/**
 * 身份管理器使用示例页面
 * 演示如何正确使用 CentralIdentityManager
 */

const { enhanceWithIdentity, ROLE_TYPES, PERMISSIONS, IDENTITY_EVENTS } = require('../../utils/identityPageEnhancer')

Page(enhanceWithIdentity({
  data: {
    // 身份数据会自动同步到页面：
    // - isLoggedIn: 是否登录
    // - userRole: 当前角色
    // - currentRole: 当前角色
    // - userInfo: 用户信息
    // - hostProfile: 寄养家庭信息（如果是 host 角色）
    // - ownerProfile: 宠物主人信息（如果是 owner 角色）
  },

  onLoad(options) {
    console.log('=== 身份管理器使用示例 ===')
    console.log('当前角色:', this.data.userRole)
    console.log('是否登录:', this.data.isLoggedIn)
    console.log('用户信息:', this.data.userInfo)

    // 示例1：检查权限
    this._checkPermissions()

    // 示例2：显示角色特定的功能
    this._showRoleSpecificFeatures()

    // 示例3：监听身份变更
    this._setupCustomIdentityListeners()
  },

  /**
   * 示例1：检查权限
   */
  _checkPermissions() {
    console.log('\n=== 权限检查示例 ===')

    // 检查单个权限
    const canBook = this.hasPermission(PERMISSIONS.BOOK_SERVICES)
    console.log('可以预订服务:', canBook)

    const canManageHost = this.hasPermission(PERMISSIONS.MANAGE_HOST_PROFILE)
    console.log('可以管理寄养家庭:', canManageHost)

    // 批量检查权限
    const permissions = this.checkPermissions([
      PERMISSIONS.VIEW_OWN_PROFILE,
      PERMISSIONS.EDIT_OWN_PROFILE,
      PERMISSIONS.VIEW_MESSAGES,
      PERMISSIONS.SEND_MESSAGES
    ])
    console.log('基础权限:', permissions)
  },

  /**
   * 示例2：显示角色特定的功能
   */
  _showRoleSpecificFeatures() {
    console.log('\n=== 角色特定功能示例 ===')

    const currentRole = this.getCurrentRole()
    console.log('当前角色:', currentRole)

    if (currentRole === ROLE_TYPES.OWNER) {
      console.log('显示宠物主人功能：')
      console.log('  - 预订服务')
      console.log('  - 查看寄养家庭')
      console.log('  - 管理宠物')
    } else if (currentRole === ROLE_TYPES.HOST) {
      console.log('显示寄养家庭功能：')
      console.log('  - 管理寄养服务')
      console.log('  - 查看预订')
      console.log('  - 接受预订')
    }
  },

  /**
   * 示例3：自定义身份变更监听
   */
  _setupCustomIdentityListeners() {
    console.log('\n=== 自定义身份监听示例 ===')

    // 注意：enhanceWithIdentity 已经自动设置了事件监听
    // 这里只演示如何使用自定义回调

    // 页面中已定义的 onIdentityChanged 方法会在身份变更时自动调用
  },

  /**
   * 自定义身份变更回调
   * (当 identityEnhancer 检测到身份变更时自动调用)
   */
  onIdentityChanged(data) {
    console.log('>>> 自定义身份变更回调被调用')
    console.log('    变更详情:', data)
    console.log('    前一角色:', data.previousRole)
    console.log('    当前角色:', data.currentRole)

    wx.showToast({
      title: `已切换到${data.currentRole === 'owner' ? '宠物主人' : '寄养家庭'}`,
      icon: 'success'
    })
  },

  /**
   * 自定义身份更新回调
   * (当 identityEnhancer 检测到身份更新时自动调用)
   */
  onIdentityUpdated(data) {
    console.log('>>> 自定义身份更新回调被调用')
    console.log('    更新详情:', data)
  },

  /**
   * 自定义登录状态变更回调
   * (当 identityEnhancer 检测到登录状态变更时自动调用)
   */
  onLoginStateChanged(data) {
    console.log('>>> 自定义登录状态变更回调被调用')
    console.log('    登录状态:', data.isLoggedIn)

    if (!data.isLoggedIn) {
      wx.navigateTo({
        url: '/pages/login/index'
      })
    }
  },

  /**
   * 示例4：切换角色
   */
  handleSwitchRole() {
    const currentRole = this.getCurrentRole()
    const targetRole = currentRole === ROLE_TYPES.OWNER ? ROLE_TYPES.HOST : ROLE_TYPES.OWNER

    console.log('\n=== 角色切换示例 ===')
    console.log('当前角色:', currentRole)
    console.log('目标角色:', targetRole)

    const success = this.switchRole(targetRole)

    if (success) {
      console.log('角色切换成功')
    } else {
      console.error('角色切换失败')
      wx.showToast({
        title: '角色切换失败',
        icon: 'none'
      })
    }
  },

  /**
   * 示例5：检查权限后执行操作
   */
  handleBookService() {
    console.log('\n=== 权限检查后执行操作示例 ===')

    // 检查是否有权限
    if (!this.hasPermission(PERMISSIONS.BOOK_SERVICES)) {
      console.warn('无权限：预订服务')
      wx.showToast({
        title: '您没有预订服务的权限',
        icon: 'none'
      })
      return
    }

    // 有权限，执行操作
    console.log('有权限，开始预订服务')
    wx.showToast({
      title: '开始预订服务',
      icon: 'success'
    })
  },

  /**
   * 示例6：获取指定角色的身份信息
   */
  handleGetHostIdentity() {
    console.log('\n=== 获取指定角色身份信息示例 ===')

    const { centralIdentityManager } = require('../../utils/CentralIdentityManager')
    const hostIdentity = centralIdentityManager.getIdentity(ROLE_TYPES.HOST)

    console.log('寄养家庭身份信息:', hostIdentity)

    if (hostIdentity) {
      wx.showModal({
        title: '寄养家庭信息',
        content: `名称: ${hostIdentity.nickName || '未设置'}\nID: ${hostIdentity._id}`,
        showCancel: false
      })
    } else {
      wx.showToast({
        title: '暂无寄养家庭身份',
        icon: 'none'
      })
    }
  },

  /**
   * 示例7：退出登录
   */
  handleLogout() {
    console.log('\n=== 退出登录示例 ===')

    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          const success = this.logout()

          if (success) {
            console.log('退出登录成功')
            wx.showToast({
              title: '已退出登录',
              icon: 'success'
            })
          } else {
            console.error('退出登录失败')
          }
        }
      }
    })
  },

  /**
   * 示例8：查看访问日志
   */
  handleViewAccessLogs() {
    console.log('\n=== 查看访问日志示例 ===')

    const { centralIdentityManager } = require('../../utils/CentralIdentityManager')

    // 获取最近1小时的访问日志
    const logs = centralIdentityManager.getAccessLogs({
      startTime: Date.now() - 60 * 60 * 1000
    })

    console.log('访问日志:', logs)
    console.log('日志条数:', logs.length)

    if (logs.length > 0) {
      const recentLogs = logs.slice(-10) // 显示最近10条
      const logText = recentLogs.map(log =>
        `${new Date(log.timestamp).toLocaleString()} - ${log.operation}`
      ).join('\n')

      wx.showModal({
        title: '最近访问日志',
        content: logText,
        showCancel: false
      })
    } else {
      wx.showToast({
        title: '暂无访问日志',
        icon: 'none'
      })
    }
  }
}))
