const app = getApp()
const IdentityManager = require('../../utils/identityManager')
const messageService = require('../../utils/messageService').default

Page({
  data: {
    userInfo: null,
    userRole: 'owner',
    isLoggedIn: false
  },
  onLoad() {
    console.log('首页加载')
    this.checkLoginStatus()
    this.initEventListeners()
  },
  
  onShow() {
    console.log('首页onShow触发')
    this.checkLoginStatus()
  },
  
  onUnload() {
    // 移除事件监听
    app.off('imLoginSuccess', this.handleIMLoginSuccess)
  },
  
  initEventListeners() {
    console.log('首页初始化事件监听器')
    // 监听IM登录成功事件
    app.on('imLoginSuccess', this.handleIMLoginSuccess.bind(this))
  },
  
  handleIMLoginSuccess(event) {
    console.log('首页收到IM登录成功事件:', event)
    // 登录成功后重新加载会话列表
    this.loadConversations()
  },
  
  checkLoginStatus() {
    console.log('首页checkLoginStatus - 检查登录状态')
    
    // 使用统一身份管理工具获取身份信息
    const identity = IdentityManager.getCurrentIdentity()
    
    console.log('首页checkLoginStatus - 身份信息:', identity)
    
    this.setData({
      userInfo: identity.userInfo,
      userRole: identity.role,
      isLoggedIn: identity.isLoggedIn
    })
    
    console.log('首页checkLoginStatus - 更新页面数据:', {
      userRole: this.data.userRole,
      isLoggedIn: this.data.isLoggedIn
    })
    
    // 如果用户已登录，尝试加载会话列表
    if (identity.isLoggedIn) {
      console.log('首页checkLoginStatus - 用户已登录，尝试加载会话列表')
      this.loadConversations()
    }
  },
  
  async loadConversations() {
    console.log('开始加载会话列表 - 使用IM SDK')
    try {
      const result = await messageService.getConversations()
      if (result.code === 0) {
        console.log('会话列表加载成功:', result.data.length)
        // 这里可以更新页面数据
      } else {
        console.error('会话列表加载失败:', result.error)
      }
    } catch (error) {
      console.error('会话列表加载失败:', error)
    }
  }
})
