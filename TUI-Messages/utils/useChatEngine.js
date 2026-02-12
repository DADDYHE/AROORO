// 关键：在文件最开始初始化全局a变量
a = a || {};
a.functions = a.functions || {};
a.functions.getAuthCode = a.functions.getAuthCode || function() { return Promise.resolve(''); };

console.log('useChatEngine: 全局a.functions 已初始化');

// 使用require语句代替import语句
const TUIChatEngine = require('@tencentcloud/chat-uikit-engine');

function useChatEngine() {
  const isReady = TUIChatEngine.isReady();
  if(isReady) {
    return
  }
  
  // 检查必要的依赖是否存在，避免未登录状态下的错误
  if (!wx.$TUIKit || !wx.$chat_userID || !wx.$chat_userSig) {
    console.log('Chat engine dependencies not ready, skipping login');
    return;
  }
  
  TUIChatEngine.login({
    chat: wx.$TUIKit,
    sdkAppID: wx.$chat_SDKAppID,
    userID: wx.$chat_userID,
    userSig: wx.$chat_userSig,
  })
}

module.exports = useChatEngine;