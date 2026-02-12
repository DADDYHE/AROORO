// TUIKit 聊天页面逻辑
Page({
  data: {
    conversationID: ''
  },

  onLoad(options) {
    console.log('TUIKit 聊天页面加载, 参数:', options);
    
    if (options.conversationID) {
      this.setData({
        conversationID: options.conversationID
      });
    }
  },

  onError(e) {
    console.error('TUIChat 组件错误:', e.detail);
  },

  onShow() {
    // 页面显示时逻辑
  },

  onHide() {
    // 页面隐藏时逻辑
  },

  onUnload() {
    // 页面卸载时逻辑
  }
})