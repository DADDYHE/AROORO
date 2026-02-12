// 关键：在文件最开始初始化全局a变量
// 这样可以避免在文件评估阶段出现 'undefined is not an object (evaluating 'a.functions')' 错误
a = a || {};
a.functions = a.functions || {};
a.functions.getAuthCode = a.functions.getAuthCode || function() { return Promise.resolve(''); };

console.log('TUIChat/Server: 全局a.functions 已初始化');

// 使用require语句代替import语句，这样可以控制模块加载的顺序
const TUICoreModule = require('@tencentcloud/tui-core');
// 获取正确的TUICore实例
const TUICore = TUICoreModule.TUICore || TUICoreModule.default || TUICoreModule;
const TUIConstants = TUICoreModule.TUIConstants || TUICore.TUIConstants;

// 关键：确保 TUICore.functions 存在
if (!TUICore.functions) {
  TUICore.functions = {};
  console.log('TUIChat/Server: TUICore.functions 已初始化');
}

class TUIChatServer {
  static instance;
  currentConversation = {};
  TUIChat = undefined;

  constructor() {
    // register service - 添加兼容性检查
    if (typeof TUICore.registerService === 'function') {
      try {
        TUICore.registerService(TUIConstants.TUIChat.SERVICE.NAME, this);
        console.log('TUIChat/Server: 服务注册成功');
      } catch (error) {
        console.warn('TUIChat/Server: 服务注册失败:', error.message);
        // 即使注册失败，也继续执行
      }
    } else {
      console.warn('TUIChat/Server: TUICore.registerService 方法不存在，跳过服务注册');
      // 模拟注册成功，确保后续功能正常
      if (!global.tuiServiceRegistry) {
        global.tuiServiceRegistry = {};
      }
      global.tuiServiceRegistry[TUIConstants.TUIChat.SERVICE.NAME] = this;
    }
  }

  static getInstance(TUIChat) {
    if (!TUIChatServer.instance) {
      TUIChatServer.instance = new TUIChatServer();
    }
    TUIChatServer.instance.updateChat(TUIChat);
    return TUIChatServer.instance;
  }

  updateChat(chat) {
    this.TUIChat = chat;
  }

  updateConversation(conversation) {
    this.currentConversation = conversation;
  }

  /**
   * 标准化用户ID，确保符合腾讯云IM SDK的规范
   * @param {string} userID - 原始用户ID
   * @returns {string} - 标准化后的用户ID
   */
  normalizeUserID(userID) {
    if (!userID) {
      return userID;
    }

    // 如果已经是标准格式（不以_或-开头），直接返回
    if (!userID.startsWith('_') && !userID.startsWith('-')) {
      return userID;
    }

    // MongoDB的_id通常以_mko或_mkt开头，移除开头的下划线
    if (userID.startsWith('_')) {
      return userID.substring(1);
    }

    if (userID.startsWith('-')) {
      return userID.substring(1);
    }

    return userID;
  }

  onCall(method, params = {}, callback) {
    let customMessage;
    let textMessage;
    const conversationID = this.currentConversation.conversationID;
    let to = '';

    // 使用字符串前缀判断，而不是使用 TYPES 常量，避免常量值不匹配的问题
    if (conversationID.startsWith('C2C_')) {
      to = conversationID.substring(4); // 移除 'C2C_' 前缀
    } else if (conversationID.startsWith('GROUP_')) {
      to = conversationID.substring(6); // 移除 'GROUP_' 前缀
    } else {
      // 如果不符合预期格式，直接使用 conversationID
      to = conversationID;
    }

    // 标准化接收方ID
    const normalizedTo = this.normalizeUserID(to);

    const currentMessage = {
      to: normalizedTo,
      conversationType: this.currentConversation.type,
      payload: params?.payload,
    };
    switch (method) {
      case TUIConstants.TUIChat.SERVICE.METHOD.UPDATE_MESSAGE_LIST:
        if (params?.message?.conversationID === this.currentConversation.conversationID) {
          this.TUIChat.updateMessageList({
            detail: {
              message: params.message,
            },
          });
        }
        break;
      case TUIConstants.TUIChat.SERVICE.METHOD.SEND_CUSTOM_MESSAGE:
        customMessage = wx.$TUIKit.createCustomMessage(currentMessage);
        this.TUIChat.updateMessageList({
          detail: {
            message: customMessage,
          },
        });
        wx.$TUIKit.sendMessage(customMessage).then((res) => {
          callback && callback(res);
        });
        break;
      case TUIConstants.TUIChat.SERVICE.METHOD.SEND_TEXT_MESSAGE:
        textMessage = wx.$TUIKit.createTextMessage(currentMessage);
        this.TUIChat.updateMessageList({
          detail: {
            message: textMessage,
          },
        });
        wx.$TUIKit.sendMessage(textMessage).then((res) => {
          callback && callback(res);
        });
        break;
      case TUIConstants.TUIChat.SERVICE.METHOD.SET_CHAT_TYPE:
        this.TUIChat.setChatType(params?.chatType);
        break;
      default:
        break;
    }
  }
}

module.exports = TUIChatServer;
