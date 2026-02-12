// TUIKit 会话列表页面逻辑
Page({
  data: {
    // 页面数据
  },

  onLoad(options) {
    console.log('TUIKit 会话列表页面加载');
  },

  onConversationItemTap(e) {
    console.log('会话项点击:', e.detail);
    const conversation = e.detail;
    
    // 跳转到聊天页面
    wx.navigateTo({
      url: `/TUI-Messages/TUI-Chat/chat?conversationID=${conversation.conversationID}`,
    });
  },

  onError(e) {
    console.error('TUIConversation 组件错误:', e.detail);
  },

  onShow() {
    // 页面显示时逻辑
  },

  onHide() {
    // 页面隐藏时逻辑
  }
})