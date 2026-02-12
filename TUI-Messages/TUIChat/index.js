// 关键：在文件最开始就初始化全局a变量
// 这样可以避免在文件评估阶段出现 'undefined is not an object (evaluating 'a.functions')' 错误

// 直接在全局作用域定义a变量，确保在任何其他代码执行之前，a变量就已经存在
a = a || {};
a.functions = a.functions || {};
a.functions.getAuthCode = a.functions.getAuthCode || function() { return Promise.resolve(''); };

console.log('TUIChat: 全局a.functions 已初始化');

// 使用require语句代替import语句，这样可以控制模块加载的顺序
// 使用相对路径，从当前文件位置开始计算
const logger = require('../utils/logger'); // 移除 .default，因为 logger 模块使用 CommonJS 格式导出
const constant = require('../utils/constant');
const TUIChatServer = require('./server'); // server.js 现在直接导出类
const TUICore = require('@tencentcloud/tui-core');
const TUIConstants = TUICore.TUIConstants;
const useChatEngine = require('../utils/useChatEngine'); // useChatEngine.js 现在直接导出函数

// 关键：在组件初始化前确保 TUICore.functions 存在
// 避免 'undefined is not an object (evaluating 'a.functions')' 错误
if (!TUICore.functions) {
  TUICore.functions = {};
  console.log('TUIChat: TUICore.functions 已初始化');
}

// eslint-disable-next-line no-undef
const app = getApp();

const inputStyle = `
  --padding: 25px
`;

let newInputStyle =  `
--padding: 0px
`;

const setNewInputStyle = (number) => {
  const height = number;
  newInputStyle = `--padding: ${height}px`;
};

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    currentConversationID: {
      type: String,
      value: '',
      observer(currentConversationID) {
        // 标准化conversationID后再设置
        const normalizedConversationID = this.normalizeConversationID(currentConversationID);
        console.log('TUIChat currentConversationID observer: 原始ID:', currentConversationID);
        console.log('TUIChat currentConversationID observer: 标准化ID:', normalizedConversationID);
        this.setData({
          conversationID: normalizedConversationID,
        });
      },
    },
    unreadCount: {
      type: Number,
      value: '',
      observer(unreadCount) {
        this.setData({
          unreadCount,
        });
      },
    },
    hasCallKit: {
      type: Boolean,
      value: false,
      observer(hasCallKit) {
        this.setData({
          hasCallKit,
        });
      },
    },
    // 新增：接收者头像URL（从外部传入）
    recipientAvatar: {
      type: String,
      value: '',
      observer(recipientAvatar) {
        this.setData({
          recipientAvatar,
        });
      },
    },
  },

  lifetimes: {
    attached() {
      if (app.globalData && app.globalData.reportType === constant.OPERATING_ENVIRONMENT) {
        this.setData({
          showTips: true,
        });
      }
    },
    ready() {
      this.setData({
        TUIChatServer: TUIChatServer.getInstance(this),
      });

      // 确保conversationID是字符串类型且格式正确
      const conversationID = this.data.conversationID;
      console.log('TUIChat ready 开始:');
      console.log('  原始conversationID:', conversationID);

      if (typeof conversationID === 'string' && conversationID.trim()) {
        // 标准化conversationID（移除MongoDB _id开头的下划线）
        const normalizedConversationID = this.normalizeConversationID(conversationID);
        console.log('  标准化后的conversationID:', normalizedConversationID);

        // 如果标准化后的ID与原始ID不同，更新数据
        if (normalizedConversationID !== conversationID) {
          this.setData({
            conversationID: normalizedConversationID,
          });
        }

        // 检查IM SDK 是否已经处于 ready 状态
        const isSDKReady = wx.$TUIKit.isReady();
        console.log('  SDK ready 状态:', isSDKReady);

        if (isSDKReady) {
          // SDK 已经 ready，直接调用 getConversationProfile
          this.loadConversationProfile(normalizedConversationID);
        } else if (wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
          // SDK 还在登录中，等待 SDK ready 事件
          console.log('  SDK 未 ready，等待 SDK_READY 事件...');
          const onSDKReady = () => {
            console.log('  收到 SDK_READY 事件');
            if (wx.$TUIKit && wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
              wx.$TUIKit.off(wx.TencentCloudChat.EVENT.SDK_READY, onSDKReady);
            }
            this.loadConversationProfile(normalizedConversationID);
          };
          wx.$TUIKit.on(wx.TencentCloudChat.EVENT.SDK_READY, onSDKReady);
        }
      } else {
        console.error('TUIChat ready: conversationID无效:', conversationID);
      }

      const query = wx.createSelectorQuery().in(this);
      query.select('.message-list').boundingClientRect((rect) => {
        if (rect) {
          this.setData({
            chatContainerHeight: rect.height,
          });
        }
      })
        .exec();
    },
  },
  /**
   * 组件的初始数据
   */
  data: {
    conversationName: '',
    conversation: {},
    messageList: [],
    isShow: false,
    showImage: false,
    showChat: true,
    conversationID: '',
    config: {
      sdkAppID: '',
      userID: '',
      userSig: '',
      type: 1,
      tim: null,
    },
    viewData: {
      style: inputStyle,
    },
    KeyboardHeight: 0,
    showTips: false,
    showGroupTips: false,
    showAll: false,
    chatContainerHeight: 0,
    newGroupProfile: {},
    currentChatType: '',
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 加载会话详情
     * @param {string} conversationID - 会话ID
     */
    async loadConversationProfile(conversationID) {
      // 确保SDK就绪后再调用getConversationProfile
      const isReady = await wx.$IMManager.waitForReady(5000)
      
      if (!isReady) {
        console.warn('[TUIChat] SDK未ready，使用默认会话对象')
        this._createDefaultConversation(conversationID)
        return
      }

      wx.$TUIKit.getConversationProfile(conversationID).then((res) => {
        console.log('TUIChat getConversationProfile 成功:');
        console.log('  res.data.conversation:', res.data.conversation);

        // IM SDK 返回的 conversation 对象中的 conversationID 可能是原始的（未标准化的）
        // 需要手动更新为标准化的 conversationID
        const conversation = res.data.conversation;
        if (conversation && conversation.conversationID !== conversationID) {
          console.log('  更新conversation对象中的conversationID:');
          console.log('    原始:', conversation.conversationID);
          console.log('    标准化后:', conversationID);
          conversation.conversationID = conversationID;
        }

        // 关键修复：标准化 userProfile 中的 userID
        if (conversation && conversation.userProfile && conversation.userProfile.userID) {
          const originalUserID = conversation.userProfile.userID;
          const normalizedUserID = this.normalizeUserID(conversation.userProfile.userID);
          if (originalUserID !== normalizedUserID) {
            console.log('  更新conversation.userProfile.userID:');
            console.log('    原始:', originalUserID);
            console.log('    标准化后:', normalizedUserID);
            conversation.userProfile.userID = normalizedUserID;
          }
        }

        if (this.data.TUIChatServer) {
          this.data.TUIChatServer.updateConversation(conversation);
        }
        // 关键修复：将获取到的会话对象设置到组件的conversation数据中
        this.setData({
          conversation: conversation,
          conversationName: this.getConversationName(conversation),
        });
        this.setChatType(conversation.type);
        // 检查 TUICore.callService 是否存在，避免错误
        if (TUICore.callService && typeof TUICore.callService === 'function') {
          TUICore.callService({
            serviceName: TUIConstants.TUICustomerServicePlugin.SERVICE.NAME,
            method: TUIConstants.TUICustomerServicePlugin.SERVICE.METHOD.ACTIVE_CONVERSATION,
            params: { conversationID: conversationID },
          });
        } else {
          console.log('TUICore.callService 方法不存在，跳过客服插件调用');
        }
      }).catch((error) => {
        // 针对2501错误进行特殊处理
        if (error.code === 2501) {
          console.warn('TUIChat getConversationProfile 2501错误: 对方用户尚未登录IM系统，这是正常情况');
          console.warn('错误详情:', error.message);
          
          this._createDefaultConversation(conversationID)
        } else {
          console.error('TUIChat getConversationProfile 失败:', error);
          // 即使失败也继续，可能对方从未登录过 IM
          // 这种情况下，发送消息时会自动创建会话
          this._createDefaultConversation(conversationID)
        }
      });
    },

    /**
     * 创建默认会话对象
     * @private
     * @param {string} conversationID 会话ID
     */
    _createDefaultConversation(conversationID) {
      const defaultConversation = {
        conversationID: conversationID,
        type: conversationID.startsWith('C2C_') ? wx.TencentCloudChat.TYPES.CONV_C2C : 
               conversationID.startsWith('GROUP_') ? wx.TencentCloudChat.TYPES.CONV_GROUP : 
               wx.TencentCloudChat.TYPES.CONV_C2C,
        userProfile: {
          userID: conversationID.replace(/^(C2C_|GROUP_)/, ''),
          nick: '用户',
          avatar: ''
        }
      };
      
      if (this.data.TUIChatServer) {
        this.data.TUIChatServer.updateConversation(defaultConversation);
      }
      // 关键修复：将默认会话对象设置到组件的conversation数据中
      this.setData({
        conversation: defaultConversation,
        conversationName: this.getConversationName(defaultConversation),
      });
      this.setChatType(defaultConversation.type);
      
      console.log('已创建默认会话对象，继续聊天流程');
    },
    /**
     * 标准化会话ID，确保符合腾讯云IM SDK的规范
     * @param {string} conversationID - 原始会话ID
     * @returns {string} - 标准化后的会话ID
     */
    normalizeConversationID(conversationID) {
      if (!conversationID) {
        return conversationID;
      }

      // C2C会话ID格式：C2C_userID
      // GROUP会话ID格式：GROUP_groupID

      if (conversationID.startsWith('C2C_')) {
        const userID = conversationID.substring(4); // 移除 'C2C_' 前缀
        const normalizedUserID = this.normalizeUserID(userID);
        return `C2C_${normalizedUserID}`;
      }

      if (conversationID.startsWith('GROUP_')) {
        const groupID = conversationID.substring(6); // 移除 'GROUP_' 前缀
        const normalizedGroupID = this.normalizeUserID(groupID);
        return `GROUP_${normalizedGroupID}`;
      }

      return conversationID;
    },

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
        // 确保用户ID长度不超过30个字符
        if (userID.length > 30) {
          console.warn('normalizeUserID: 用户ID长度超过30个字符，截断处理');
          return userID.substring(0, 30);
        }
        return userID;
      }

      // MongoDB的_id通常以_mko或_mkt开头，移除开头的下划线
      let normalizedUserID;
      if (userID.startsWith('_')) {
        normalizedUserID = userID.substring(1);
      } else if (userID.startsWith('-')) {
        normalizedUserID = userID.substring(1);
      } else {
        normalizedUserID = userID;
      }

      // 确保用户ID长度不超过30个字符
      if (normalizedUserID.length > 30) {
        console.warn('normalizeUserID: 用户ID长度超过30个字符，截断处理');
        return normalizedUserID.substring(0, 30);
      }

      return normalizedUserID;
    },

    init() {
      useChatEngine();
      
      // 检查wx.$TUIKit是否存在，避免未登录状态下的错误
      if (!wx.$TUIKit) {
        console.log('TUIChat init: wx.$TUIKit not available, skipping IM operations');
        return;
      }
      
      wx.$TUIKit.setMessageRead({ conversationID: this.data.conversationID }).then(() => {
        logger.log('| TUI-chat | setMessageRead | ok');
      });
      wx.$TUIKit.getConversationProfile(this.data.conversationID).then((res) => {
        const { conversation } = res.data;
        this.setData({
          conversationName: this.getConversationName(conversation),
          conversation,
          isShow: conversation.type === wx.TencentCloudChat.TYPES.CONV_GROUP,
        });
        if (conversation.type !== wx.TencentCloudChat.TYPES.CONV_GROUP) return;
        if (!this.data.showTips) {
          this.setData({
            showGroupTips: true,
          });
        } else {
          this.setData({
            showAll: true,
          });
        }
      });
    },
    getConversationName(conversation) {
      if (conversation.type === '@TIM#SYSTEM') {
        this.setData({
          showChat: false,
        });
        return '系统通知';
      }
      if (conversation.type === wx.TencentCloudChat.TYPES.CONV_C2C) {
        return conversation.remark || conversation.userProfile.nick || conversation.userProfile.userID;
      }
      if (conversation.type === wx.TencentCloudChat.TYPES.CONV_GROUP) {
        return conversation.groupProfile.name || conversation.groupProfile.groupID;
      }
    },
    setChatType(type) {
      this.setData({
        currentChatType: type,
      });
    },
    updateMessageList(event) {
      // 将自己发送的消息写进消息列表里面
      this.selectComponent('#MessageList').updateMessageList(event.detail.message);
    },
    showMessageErrorImage(event) {
      this.selectComponent('#MessageList').sendMessageError(event);
    },
    triggerClose() {
      this.selectComponent('#MessageInput').handleClose();
    },
    handleCall(event) {
      if (event.detail.conversationType === wx.TencentCloudChat.TYPES.CONV_GROUP) {
        this.selectComponent('#TUIGroup').callShowMoreMember(event);
      } else {
        this.triggerEvent('handleCall', event.detail);
      }
    },
    groupCall(event) {
      const { selectedUserIDList, type, groupID } = event.detail;
      const userIDList = selectedUserIDList;
      this.triggerEvent('handleCall', { userIDList, type, groupID });
    },
    goBack() {
      this.triggerEvent('showConversationList');
      wx.$TUIKit.setMessageRead({
        conversationID: this.data.conversationID,
      }).then(() => {});
    },
    showConversationList() {
      this.triggerEvent('showConversationList');
    },
    changeMemberCount(event) {
      this.selectComponent('#TUIGroup').updateMemberCount(event.detail.groupOperationType);
    },
    resendMessage(event) {
      this.selectComponent('#MessageInput').onInputValueChange(event);
    },
    // 监听键盘，获取焦点时将输入框推到键盘上方
    pullKeysBoards(event) {
      const { height } = event.detail.event.detail;
      if (height === 0) {
        setNewInputStyle(25);
      } else {
        setNewInputStyle(height);
      }
      this.setData({
        'viewData.style': newInputStyle,
      }, () => {
        const MessageListEle = this.selectComponent('#MessageList');
        if (MessageListEle && MessageListEle.updateScrollToBottom) {
          MessageListEle.updateScrollToBottom();
        }
      });
    },
    // 监听键盘，失去焦点时收起键盘
    downKeysBoards(event) {
      this.setData({
        'viewData.style': inputStyle,
      });
    },
    inputHeightChange() {
      this.selectComponent('#MessageList').updateScrollToBottom();
    },
    typing(event) {
      const { STRING_TEXT, FEAT_NATIVE_CODE } = constant;
      if (this.data.conversation.type === wx.TencentCloudChat.TYPES.CONV_C2C) {
        if (event.detail.typingMessage.typingStatus === FEAT_NATIVE_CODE.ISTYPING_STATUS && event.detail.typingMessage.actionParam === constant.TYPE_INPUT_STATUS_ING) {
          this.setData({
            conversationName: STRING_TEXT.TYPETYPING,
          });
          const timer = setTimeout(() => {
            this.setData({
              conversationName: this.getConversationName(this.data.conversation),
            });
            clearTimeout(timer);
          }, (1000 * 30));
        } else if (event.detail.typingMessage.typingStatus === FEAT_NATIVE_CODE.NOTTYPING_STATUS && event.detail.typingMessage.actionParam === constant.TYPE_INPUT_STATUS_END) {
          this.setData({
            conversationName: this.getConversationName(this.data.conversation),
          });
        }
      }
    },
    handleReport() {
      const url = '/pages/TUI-User-Center/webview/webview?url=https://cloud.tencent.com/apply/p/xc3oaubi98g';
      wx.navigateTo({
        url,
      });
    },
    handleNewGroupProfile(event) {
      const newGroupProfile = event.detail;
      for (const key in newGroupProfile) {
        // 群名称变更
        if (key === 'groupName') {
          const conversationName = newGroupProfile[key];
          this.setData({
            conversationName,
          });
        }
      }
    },
  },

});
