const app = getApp()
const { centralIdentityManager } = require('../../../utils/CentralIdentityManager')

Page({
  data: {
    userInfo: {},
    userRole: 'owner',
    avatarUrl: '',
    nickName: '',
  },

  onLoad() {
    console.log('Settings page onLoad')
    this.loadUserInfo()
  },

  onShow() {
    console.log('Settings page onShow')
    this.loadUserInfo()
  },

  // 加载用户信息
  loadUserInfo() {
    try {
      console.log('Settings page loadUserInfo - 开始加载用户信息')
      
      // 使用 CentralIdentityManager 获取当前身份信息
      const currentIdentity = centralIdentityManager.getCurrentIdentity()
      const userRole = centralIdentityManager.getCurrentRole() || 'owner'
      
      // 提取角色特定信息
      let roleSpecificInfo = currentIdentity || {}
      
      console.log('Settings page loadUserInfo - 角色特定信息:', {
        hasRoleSpecificInfo: !!currentIdentity,
        userRole: userRole,
        infoKeys: currentIdentity ? Object.keys(currentIdentity) : []
      })
      
      this.setData({
        userInfo: roleSpecificInfo || {},
        userRole: userRole,
        avatarUrl: roleSpecificInfo?.avatarUrl || '',
        nickName: roleSpecificInfo?.nickName || roleSpecificInfo?.hostName || '',
      })
      
      console.log('Settings page loadUserInfo - 加载用户信息成功:', this.data.userInfo)
    } catch (error) {
      console.error('Settings page loadUserInfo - 加载用户信息失败:', error)
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 编辑个人信息
  editProfile() {
    console.log('编辑个人信息')
    wx.navigateTo({
      url: '/subpackages/profile/edit/index'
    })
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有缓存吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync()
            wx.showToast({
              title: '缓存清除成功',
              icon: 'success'
            })
            console.log('缓存清除成功')
          } catch (error) {
            console.error('清除缓存失败:', error)
            wx.showToast({
              title: '清除缓存失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 关于我们
  aboutUs() {
    wx.navigateTo({
      url: '/subpackages/profile/about/about'
    })
  },

  // 隐私政策
  privacyPolicy() {
    wx.navigateTo({
      url: '/subpackages/profile/privacy/privacy'
    })
  },

  // 用户协议
  userAgreement() {
    wx.navigateTo({
      url: '/subpackages/profile/agreement/agreement'
    })
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            // 调用app.js中的logout方法
            app.logout(false).then(() => {
              // 退出成功后跳转到首页
              wx.switchTab({
                url: '/pages/home/index'
              })
            }).catch((error) => {
              console.error('退出登录失败:', error)
              wx.showToast({
                title: '退出登录失败',
                icon: 'none'
              })
            })
          } catch (error) {
            console.error('退出登录失败:', error)
            wx.showToast({
              title: '退出登录失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },
})
