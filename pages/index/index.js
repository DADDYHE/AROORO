const app = getApp()
const { enhanceWithIdentity } = require('../../utils/identityPageEnhancer')
const messageService = require('../../utils/messageService').default

Page(enhanceWithIdentity({
  data: {
    // identityEnhancer 会自动添加以下字段：
    // - userRole: 当前角色
    // - userProfile: 当前用户资料
    // - isLoggedIn: 登录状态
    // - userInfo: 用户信息
  },

  onLoad() {
    console.log('首页加载')
    this.initEventListeners()
    this.loadConversationsIfLoggedIn()
  },

  onShow() {
    console.log('首页onShow触发')
    // 身份状态已由 enhanceWithIdentity 自动管理
    this.loadConversationsIfLoggedIn()
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

  loadConversationsIfLoggedIn() {
    console.log('首页checkLoginStatus - 检查登录状态:', {
      isLoggedIn: this.data.isLoggedIn,
      userRole: this.data.userRole
    })

    // 如果用户已登录，尝试加载会话列表
    if (this.data.isLoggedIn) {
      console.log('首页 - 用户已登录，尝试加载会话列表')
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
}))
