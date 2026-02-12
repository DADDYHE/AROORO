// 强制在文件最开始初始化全局a变量
try {
  a = a || {};
  a.functions = a.functions || {};
  a.functions.getAuthCode = a.functions.getAuthCode || function() { return Promise.resolve(''); };
  console.log('MessageList: 全局a.functions 已初始化');
} catch (error) {
  console.error('MessageList: 初始化全局a变量失败:', error);
  // 即使初始化失败，也要确保a变量存在
  a = {};
  a.functions = {};
  a.functions.getAuthCode = function() { return Promise.resolve(''); };
  console.log('MessageList: 全局a变量已强制初始化');
}

// 使用require语句代替import语句，这样可以控制模块加载的顺序
// 使用相对路径，从当前文件位置开始计算
const dayjs = require('../../../utils/dayjs');
const logger = require('../../../utils/logger'); // 移除 .default，因为 logger 模块使用 CommonJS 格式导出
const constant = require('../../../utils/constant');

// 关键：在组件初始化前确保TUICore对象存在
try {
  const TUICore = require('@tencentcloud/tui-core');
  if (!TUICore.functions) {
    TUICore.functions = {};
  }
  console.log('MessageList: TUICore.functions 已初始化');
} catch (error) {
  console.warn('MessageList: TUICore 初始化失败:', error);
}

// eslint-disable-next-line no-undef
const app = getApp();
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    conversation: {
      type: Object,
      value: {},
      observer(newVal) {
        if (!newVal.conversationID) return;

        // 关键：在设置 conversation 时，标准化其中的 conversationID
        const originalConversationID = newVal.conversationID;
        let normalizedConversationID = originalConversationID;

        // 如果是 C2C 格式，提取 userID 并标准化
        if (originalConversationID.startsWith('C2C_')) {
          const userID = originalConversationID.substring(4);
          const normalizedUserID = this.normalizeUserID(userID);
          normalizedConversationID = `C2C_${normalizedUserID}`;
        }
        // 如果是 GROUP 格式，提取 groupID 并标准化
        else if (originalConversationID.startsWith('GROUP_')) {
          const groupID = originalConversationID.substring(6);
          const normalizedGroupID = this.normalizeUserID(groupID);
          normalizedConversationID = `GROUP_${normalizedGroupID}`;
        }

        // 如果标准化后的ID与原始ID不同，更新conversation对象
        if (normalizedConversationID !== originalConversationID) {
          console.log('MessageList conversation observer: 标准化conversationID');
          console.log('  原始:', originalConversationID);
          console.log('  标准化后:', normalizedConversationID);
          newVal.conversationID = normalizedConversationID;
        }

        this.setData({
          conversation: newVal,
        }, () => {
          this.getMessageList(this.data.conversation);
        });
      },
    },
    unreadCount: {
      type: Number,
      value: '',
      observer(newVal) {
        this.setData({
          unreadCount: newVal,
        });
      },
    },
    chatContainerHeight: {
      type: Number,
      value: '',
      observer(newVal) {
        this.setData({
          chatContainerHeight: newVal,
        });
      },
    },
    avatarUrl: {
      type: String,
      value: '/images/default-avatar.svg',
      observer(newVal) {
        this.setData({
          avatarUrl: newVal,
        });
      },
    },
  },

  /**
   * 组件的初始数据
   */
  data: {
    isLostsOfUnread: false,
    // 自己的 ID 用于区分历史消息中，哪部分是自己发出的
    scrollView: '',
    triggered: true,
    nextReqMessageID: '', // 下一条消息标志
    isCompleted: false, // 当前会话消息是否已经请求完毕
    messagepopToggle: false,
    messageID: '',
    checkID: '',
    selectedMessage: {},
    deleteMessage: '',
    RevokeID: '', // 撤回消息的ID用于处理对方消息展示界面
    showName: '',
    showUnreadMessageCount: false,
    showUpJump: false,
    jumpAim: '',
    messageIndex: '',
    isShow: false,
    Show: false,
    UseData: '',
    chargeLastmessage: '',
    groupOperationType: 0,
    newMessageCount: [],
    messageTimeID: {},
    showMessageError: false,
    personalProfile: {},
    showPersonalProfile: false,
    resendMessage: {},
    showOnlyOnce: false,
    lastMessageSequence: '',
    isRewrite: false,
    isMessageTime: {},
    newArr: {},
    typingMessage: {},
    // 是否在最底部
    isScrollToBottom: true,
    // 修改的群资料
    newGroupProfile: {},
    refreshStatus: false,
    // 消息列表，初始为空数组
    messageList: [],
    // 头像缓存，减少重复的云函数调用
    avatarCache: {},
  },

  lifetimes: {
    attached() {
      // 初始化头像更新队列和节流定时器
      this._avatarUpdateQueue = new Map();
      this._avatarUpdateTimer = null;
      
      // 检查SDK状态
      const isSDKReady = wx.$TUIKit.isReady();
      console.log('MessageList: 组件初始化时SDK ready状态:', isSDKReady);
      if (isSDKReady && this.data.conversation && this.data.conversation.conversationID) {
        this.getMessageList(this.data.conversation);
      } else {
        // 监听SDK_READY事件
        this.listenForSDKReady();
      }
    },
    ready() {
      if (this.data.unreadCount > 12) {
        if (this.data.unreadCount > 99) {
          this.setData({
            isLostsOfUnread: true,
            showUpJump: true,
          });
        } else {
          this.setData({
            showUpJump: true,
          });
        }
      }
      wx.$TUIKit.on(wx.TencentCloudChat.EVENT.MESSAGE_RECEIVED, this.$onMessageReceived, this);
      wx.$TUIKit.on(wx.TencentCloudChat.EVENT.MESSAGE_READ_BY_PEER, this.$onMessageReadByPeer, this);
      wx.$TUIKit.on(wx.TencentCloudChat.EVENT.MESSAGE_REVOKED, this.$onMessageRevoked, this);
      // 监听SDK断开连接事件
      if (wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
        wx.$TUIKit.on(wx.TencentCloudChat.EVENT.SDK_NOT_READY, this.$onSDKNotReady, this);
      }
    },

    detached() {
      // 安全地移除事件监听，避免无效的handler错误
      try {
        if (wx.$TUIKit && this.$onMessageReceived && wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
          wx.$TUIKit.off(wx.TencentCloudChat.EVENT.MESSAGE_RECEIVED, this.$onMessageReceived);
        }
        if (wx.$TUIKit && this.$onMessageReadByPeer && wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
          wx.$TUIKit.off(wx.TencentCloudChat.EVENT.MESSAGE_READ_BY_PEER, this.$onMessageReadByPeer);
        }
        if (wx.$TUIKit && this.$onMessageRevoked && wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
          wx.$TUIKit.off(wx.TencentCloudChat.EVENT.MESSAGE_REVOKED, this.$onMessageRevoked);
        }
        if (wx.$TUIKit && this.$onSDKNotReady && wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
          wx.$TUIKit.off(wx.TencentCloudChat.EVENT.SDK_NOT_READY, this.$onSDKNotReady);
        }
        if (this._sdkReadyListener && wx.$TUIKit && wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
          wx.$TUIKit.off(wx.TencentCloudChat.EVENT.SDK_READY, this._sdkReadyListener);
        }
      } catch (error) {
        console.warn('移除事件监听时出错:', error);
      }
    },
  },

  methods: {
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
      } else if (conversationID.startsWith('C2C') && !conversationID.startsWith('C2C_')) {
        // 处理缺少下划线的情况：C2Chst_00ex29s6_oNIhl145nrucUDLOpPo -> C2C_hst_00ex29s6_oNIhl145nrucUDLOpPo
        const userID = conversationID.substring(3); // 移除 'C2C' 前缀
        const normalizedUserID = this.normalizeUserID(userID);
        return `C2C_${normalizedUserID}`;
      }

      if (conversationID.startsWith('GROUP_')) {
        const groupID = conversationID.substring(6); // 移除 'GROUP_' 前缀
        const normalizedGroupID = this.normalizeUserID(groupID);
        return `GROUP_${normalizedGroupID}`;
      } else if (conversationID.startsWith('GROUP') && !conversationID.startsWith('GROUP_')) {
        // 处理缺少下划线的情况：GROUPhst_00ex29s6_oNIhl145nrucUDLOpPo -> GROUP_hst_00ex29s6_oNIhl145nrucUDLOpPo
        const groupID = conversationID.substring(5); // 移除 'GROUP' 前缀
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
    // 刷新消息列表
    refresh() {
      this.setData({
        refreshStatus: true,
      }, () => {
        if (this.data.isCompleted) {
          this.setData({
            refreshStatus: false,
          })
          return;
        }
        this.getMessageList(this.data.conversation);
        this.setData({
          refreshStatus: false,
        })
      })
    },
    /**
     * 预加载头像
     * @param {Array} messages - 消息列表
     * @private
     */
    _preloadAvatars(messages) {
      if (!messages || messages.length === 0) return;
      
      // 收集所有需要预加载的头像URL
      const avatarsToPreload = new Set();
      
      messages.forEach(message => {
        if (message.avatar && !this.data.avatarCache[message.avatar]) {
          avatarsToPreload.add(message.avatar);
        }
      });
      
      // 预加载头像（使用微信小程序支持的API）
      avatarsToPreload.forEach(avatarUrl => {
        try {
          // 使用wx.getImageInfo()预加载图片
          wx.getImageInfo({
            src: avatarUrl,
            success: (res) => {
              // 加载成功时更新缓存
              this.setData({
                [`avatarCache.${avatarUrl}`]: true
              });
            },
            fail: (error) => {
              // 加载失败时更新缓存
              console.warn('预加载头像失败:', avatarUrl, error);
              this.setData({
                [`avatarCache.${avatarUrl}`]: false
              });
            }
          });
        } catch (error) {
          console.error('预加载头像失败:', error);
          // 发生异常时也更新缓存，避免重复尝试
          this.setData({
            [`avatarCache.${avatarUrl}`]: false
          });
        }
      });
    },

    // 获取消息列表
    getMessageList(conversation) {
      // 验证conversation对象是否完整
      if (!conversation || !conversation.conversationID) {
        console.warn('getMessageList: conversation对象不完整，跳过获取消息列表');
        return;
      }
      // 标准化conversationID
      const normalizedConversationID = this.normalizeConversationID(conversation.conversationID);
      console.log('MessageList: 原始conversationID:', conversation.conversationID);
      console.log('MessageList: 标准化后的conversationID:', normalizedConversationID);

      // 首先尝试从本地缓存加载会话记录
      const cachedMessageList = this.getConversationFromCache(normalizedConversationID);
      if (cachedMessageList.length > 0) {
        console.log('从本地缓存加载会话记录:', cachedMessageList.length);
        this.setData({
          messageList: cachedMessageList
        });
        // 预加载缓存消息的头像
        this._preloadAvatars(cachedMessageList);
      }

      // 检查IM SDK 是否已经处于 ready 状态
      const isSDKReady = wx.$TUIKit.isReady();
      console.log('MessageList: SDK ready 状态:', isSDKReady);

      if (!isSDKReady) {
        console.log('MessageList: SDK 未 ready，等待 SDK ready 事件');
        // SDK 还在登录中，等待 SDK ready 事件
        this.listenForSDKReady();
        return;
      }

      if (!this.data.isCompleted) {
        wx.$TUIKit.getMessageList({
          conversationID: normalizedConversationID,
          nextReqMessageID: this.data.nextReqMessageID,
          count: 15,
        }).then(async (res) => {
          this.showMoreHistoryMessageTime(res.data.messageList);
          let { messageList } = res.data; // 消息列表。
          
          // 从云函数获取用户头像数据
          messageList = await this.processMessageListWithAvatars(messageList);
          
          this.setData({
            nextReqMessageID: res.data.nextReqMessageID, // 用于续拉，分页续拉时需传入该字段。
            isCompleted: res.data.isCompleted, // 表示是否已经拉完所有消息。
          })
          // 检查messageList是否存在且是数组
          if (messageList.length > 0 && this.data.messageList && Array.isArray(this.data.messageList) && this.data.messageList.length < this.data.unreadCount) {
            this.getMessageList(conversation);
          }
          this.$handleMessageRender(messageList);
          
          // 预加载新获取的消息头像
          this._preloadAvatars(messageList);
          
          // 保存最新的会话记录到本地缓存
          if (messageList.length > 0) {
            const updatedMessageList = [...messageList, ...this.data.messageList];
            this.saveConversationToCache(normalizedConversationID, updatedMessageList);
          }
        }).catch((error) => {
          console.error('MessageList: getMessageList 失败:', error);
          // 即使获取失败，也使用本地缓存的会话记录
          const cachedMessageList = this.getConversationFromCache(normalizedConversationID);
          if (cachedMessageList.length > 0) {
            console.log('获取消息失败，使用本地缓存会话记录:', cachedMessageList.length);
            this.setData({
              messageList: cachedMessageList
            });
          }
        });
      }
    },
    // 历史消息渲染
    $handleMessageRender(historyMessageList = []) {
      if (historyMessageList.length === 0) {
        return;
      }
      this.showHistoryMessageTime(historyMessageList);
      const messageList = [...historyMessageList, ...this.data.messageList];
      const lastHistoryMessageID = historyMessageList[historyMessageList.length - 1].ID;
      if (this.data.conversation.type === '@TIM#SYSTEM') {
        return this.filterRepateSystemMessage(messageList);
      }
      this.setData({
        messageList,
      }, () => {
        this.setData({
          // 消息ID前拼接字符串为了解决 scroll-into-view，无法跳转以数字开头的 ID。
          jumpAim: `ID-${this.filterSystemMessageID(lastHistoryMessageID)}`,
        });
      });
    },
    // 系统消息去重
    filterRepateSystemMessage(messageList) {
      const noRepateMessage = [];
      for (let index = 0;  index < messageList.length; index++) {
        if (!noRepateMessage.some(item => item && item.ID === messageList[index].ID)) {
          noRepateMessage.push(messageList[index]);
        }
      }
      this.setData({
        messageList: noRepateMessage,
      });
    },
    // 消息已读更新
    $onMessageReadByPeer(event) {
      this.updateReadByPeer(event);
    },
    updateScrollToBottom() {
      // 检查messageList是否存在且是数组
      if (!this.data.messageList || !Array.isArray(this.data.messageList)) {
        console.log('updateScrollToBottom: messageList不存在或不是数组，跳过滚动操作');
        return;
      }
      
      // 获取最后一条消息的ID
      const lastMessage = this.data.messageList[this.data.messageList.length - 1];
      const lastMessageID = lastMessage?.ID;
      const ID = `ID-${this.filterSystemMessageID(lastMessageID)}`;
      
      this.setData({
        jumpAim: '',
      }, () => {
        this.setData({
          jumpAim: ID,
        });
      });
    },
    // 更新已读更新
    updateReadByPeer(event) {
      // 检查messageList是否存在且是数组
      if (!this.data.messageList || !Array.isArray(this.data.messageList)) {
        console.warn('updateReadByPeer: messageList不存在或不是数组，跳过更新');
        return;
      }
      
      event.data.forEach((item) => {
        const index = this.data.messageList.findIndex(element => element.ID === item.ID);
        if (index > -1) {
          this.data.messageList[index] = item;
          this.setData({
            messageList: this.data.messageList,
          });
        }
      });
    },

    // 收到的消息
    async $onMessageReceived(value) {
      const message = value.data[0];
      // 使用标准化的conversationID
      const normalizedConversationID = this.normalizeConversationID(this.data.conversation.conversationID);
      wx.$TUIKit.setMessageRead({ conversationID: normalizedConversationID }).then(() => {
        logger.log('| MessageList | setMessageRead | ok');
      });
      const { BUSINESS_ID_TEXT, MESSAGE_TYPE_TEXT } = constant;
      this.messageTimeForShow(message);
      this.setData({
        UseData: value,
      });
      value.data.forEach((item) => {
        switch (item.type) {
          // 群提示消息
          case 'TIMGroupTipElem':
            this.handleGroupTipMessage(item);
            break;
          // 群系统消息
          case 'TIMGroupSystemNoticeElem':
            this.handleGroupSystemNoticeMessage(item);
            break;
          default:
            break;
        }
      });
      // 若需修改消息，需将内存的消息复制一份，不能直接更改消息，防止修复内存消息，导致其他消息监听处发生消息错误
      // 将收到的消息存入messageList之前需要进行过滤，正在输入状态消息不用存入messageList.
      const list = [];
      value.data.forEach((item) => {
        if (item.conversationID === normalizedConversationID && item.type === MESSAGE_TYPE_TEXT.TIM_CUSTOM_ELEM) {
          try {
            const typingMessage = JSON.parse(item.payload.data);
            if (typingMessage.businessID !== BUSINESS_ID_TEXT.USER_TYPING) {
              list.push(item);
            } else {
              this.triggerEvent('typing', {
                typingMessage,
              });
            }
          } catch (error) {
          }
        } else if (item.conversationID === normalizedConversationID) {
          list.push(item);
        }
      });

      // 从云函数获取用户头像数据
      const processedList = await this.processMessageListWithAvatars(list);

      this.data.messageList = this.data.messageList.concat(processedList);
      this.setData({
        messageList: this.data.messageList,
      });
      if (processedList.length > 0) {
        // 当滚轮在最底部的时候
        if (this.data.isScrollToBottom) {
          // 跳转到最新的消息
          setTimeout(() => {
            this.handleJumpNewMessage();
          }, 300);
        } else {
          // 不在最底部的时候弹出未读消息
          const newMessageCount = this.data.newMessageCount.concat(processedList);
          this.setData({
            newMessageCount,
            showUnreadMessageCount: true,
          });
        }
      }
      if (this.data.conversation.type === 'GROUP') {
        // 检查messageList是否存在且不为空
        if (this.data.messageList && this.data.messageList.length > 0) {
          const lastMessage = this.data.messageList.slice(-1)[0];
          const groupOperationType = lastMessage?.payload?.operationType || 0;
          this.triggerEvent('changeMemberCount', {
            groupOperationType,
          });
        }
      }
    },
    // 自己的消息上屏
    updateMessageList(message) {
      // 验证message对象是否完整
      if (!message || !message.conversationID) {
        console.warn('updateMessageList: message对象不完整，跳过更新');
        return;
      }
      
      // 验证conversation对象是否完整
      if (!this.data.conversation || !this.data.conversation.conversationID) {
        console.warn('updateMessageList: conversation对象不完整，跳过更新');
        return;
      }
      
      // 使用标准化的conversationID进行比较
      const normalizedMessageConversationID = this.normalizeConversationID(message.conversationID);
      const normalizedConversationID = this.normalizeConversationID(this.data.conversation.conversationID);
      
      console.log('updateMessageList: 比较conversationID');
      console.log('  消息conversationID:', message.conversationID);
      console.log('  标准化后的消息conversationID:', normalizedMessageConversationID);
      console.log('  会话conversationID:', this.data.conversation.conversationID);
      console.log('  标准化后的会话conversationID:', normalizedConversationID);
      
      if (normalizedMessageConversationID !== normalizedConversationID) {
        console.warn('updateMessageList: conversationID不匹配，跳过更新');
        return;
      }
      
      // 检查messageList是否存在且是数组
      if (!this.data.messageList || !Array.isArray(this.data.messageList)) {
        console.warn('updateMessageList: messageList不存在或不是数组，跳过更新');
        return;
      }
      
      const index = this.data.messageList.findIndex((item) => item.ID === message.ID)
      if (index > -1) {
        this.data.messageList[index] = message;
        this.setData({
          messageList: this.data.messageList,
        })
        return;
      }

      wx.$TUIKit.setMessageRead({ conversationID: normalizedConversationID }).then(() => {
        logger.log('| MessageList | setMessageRead | ok');
      });
      const { BUSINESS_ID_TEXT, MESSAGE_TYPE_TEXT } = constant;
      this.messageTimeForShow(message);
      if (message.type === MESSAGE_TYPE_TEXT.TIM_CUSTOM_ELEM) {
        const typingMessage = JSON.parse(message.payload.data);
        if (typingMessage.businessID === BUSINESS_ID_TEXT.USER_TYPING) {
          this.setData({
            messageList: this.data.messageList,
          });
        } else {
          this.data.messageList.push(message);
        }
      } else {
        this.data.messageList.push(message);
      }
      
      // 检查messageList是否为空
      if (this.data.messageList.length > 0) {
        this.setData({
          lastMessageSequence: this.data.messageList.slice(-1)[0].sequence,
          messageList: this.data.messageList,
          jumpAim: `ID-${this.filterSystemMessageID(this.data.messageList[this.data.messageList.length - 1]?.ID)}`,
        }, () => {
          this.setData({
            messageList: this.data.messageList,
          });
        });
      }
    },

    handleGroupTipMessage(msg) {
      // 群资料改变
      if (msg.payload.operationType === 6) {
        const { newGroupProfile } = msg.payload;
        this.setData({
          newGroupProfile,
        });
        this.triggerEvent('handleNewGroupProfile', this.data.newGroupProfile);
      }
    },

    handleGroupSystemNoticeMessage(msg) {
      // 被群主踢出群组
      if (msg.payload.operationType === 4) {
        // 跳转到聊天列表页面
        wx.navigateTo({
          url: '../../../../../../TUI-CustomerService/pages/index',
        });
        this.showToast(`您已被${msg.payload.operatorID}踢出群组！`);
      }
    },

    // 兼容 scrollView
    filterSystemMessageID(messageID) {
      if (!messageID) {
        return;
      }
      const index = messageID.indexOf('@TIM#');
      const groupIndex = messageID.indexOf('@TGS#');
      if (index === 0) {
        messageID =  messageID.replace('@TIM#', '');
      }
      if (groupIndex === 0) {
        messageID =  messageID.replace('@TGS#', '');
      }
      return messageID;
    },
    // 获取消息ID
    handleLongPress(e) {
      // 检查messageList是否存在且是数组
      if (!this.data.messageList || !Array.isArray(this.data.messageList)) {
        console.warn('handleLongPress: messageList不存在或不是数组，跳过操作');
        return;
      }
      
      for (let index = 0; index < this.data.messageList.length; index++) {
        if (this.data.messageList[index].status === 'success') {
          const { index: datasetIndex } = e.currentTarget.dataset;
          this.setData({
            messageID: e.currentTarget.id,
            selectedMessage: this.data.messageList[datasetIndex],
            Show: true,
          });
        }
      }
    },
    // 更新 messagelist
    updateMessageByID(deleteMessageID) {
      // 检查messageList是否存在且是数组
      if (!this.data.messageList || !Array.isArray(this.data.messageList)) {
        console.warn('updateMessageByID: messageList不存在或不是数组，返回空数组');
        return [];
      }
      
      const { messageList } = this.data;
      const deleteMessageArr = messageList.filter(item => item.ID === deleteMessageID);
      this.setData({
        messageList,
      });
      return deleteMessageArr;
    },
    // 删除消息
    deleteMessage() {
      wx.$TUIKit.deleteMessage([this.data.selectedMessage])
        .then((imResponse) => {
          this.updateMessageByID(imResponse.data.messageList[0].ID);
          wx.showToast({
            title: '删除成功!',
            duration: 800,
            icon: 'none',
          });
        })
        .catch(() => {
          wx.showToast({
            title: '删除失败!',
            duration: 800,
            icon: 'error',
          });
        });
    },
    // 下载
    downloadMessage() {
      wx.downloadFile({
        url: this.data.selectedMessage.payload.fileUrl,
        success(res) {
          const filePath = res.tempFilePath;
          wx.openDocument({
            filePath,
            success() {
            },
          });
        },
      });
    },
    // 撤回消息
    revokeMessage() {
      wx.$TUIKit.revokeMessage(this.data.selectedMessage)
        .then((imResponse) => {
          this.setData({
            resendMessage: imResponse.data.message,
          });
          this.updateMessageByID(imResponse.data.message.ID);
          // 消息撤回成功
        })
        .catch((imError) => {
          wx.showToast({
            title: '超过2分钟消息不支持撤回',
            duration: 800,
            icon: 'none',
          }),
          this.setData({
            Show: false,
          });
          // 消息撤回失败
          console.warn('revokeMessage error:', imError);
        });
    },
    // 撤回消息重新发送
    resendMessage(e) {
      this.triggerEvent('resendMessage', {
        message: e.detail.message,
      });
    },
    // 关闭弹窗
    handleEditToggleAvatar() {
      this.setData({
        Show: false,
      });
    },
    // 向对方通知消息撤回事件
    $onMessageRevoked(event) {
      this.updateMessageByID(event.data[0].ID);
    },
    // 复制消息
    copyMessage() {
      wx.setClipboardData({
        data: this.data.selectedMessage.payload.text,
        success() {
          wx.getClipboardData({
            success(res) {
              logger.log(`| TUI-chat | message-list | copyMessage: ${res.data} `);
            },
          });
        },
      });
      this.setData({
        Show: false,
      });
    },
    // 消息跳转到最新
    handleJumpNewMessage() {
      // 检查messageList是否存在且不为空
      if (!this.data.messageList || !Array.isArray(this.data.messageList) || this.data.messageList.length === 0) {
        console.warn('handleJumpNewMessage: messageList不存在或为空，跳过跳转');
        this.setData({
          showUnreadMessageCount: false,
          newMessageCount: [],
          isScrollToBottom: true,
        });
        return;
      }
      
      this.setData({
        jumpAim: `ID-${this.filterSystemMessageID(this.data.messageList[this.data.messageList.length - 1]?.ID)}`,
        showUnreadMessageCount: false,
        newMessageCount: [],
        isScrollToBottom: true,
      });
    },
    // 消息跳转到最近未读
    handleJumpUnreadMessage() {
      // 检查messageList是否存在且是数组
      if (!this.data.messageList || !Array.isArray(this.data.messageList)) {
        console.warn('handleJumpUnreadMessage: messageList不存在或不是数组，跳过跳转');
        this.setData({
          showUpJump: false,
        });
        return;
      }
      
      this.getMessageList(this.data.conversation);
      
      // 检查messageList是否为空
      if (this.data.messageList.length === 0) {
        console.warn('handleJumpUnreadMessage: messageList为空，跳过跳转');
        this.setData({
          showUpJump: false,
        });
        return;
      }
      
      this.setData({
        jumpAim: `ID-${this.filterSystemMessageID(this.data.messageList[this.data.messageList.length - this.data.unreadCount]?.ID)}`,
        showUpJump: false,
      });
    },
    // 滑动到最底部置跳转事件为false
    scrollHandler() {
      this.setData({
        showUnreadMessageCount: false,
        newMessageCount: [],
        isScrollToBottom: true,
      });
    },
    // 删除处理掉的群通知消息
    changeSystemMessageList(event) {
      this.updateMessageByID(event.detail.message.ID);
    },
    // 展示消息时间
    messageTimeForShow(messageTime) {
      const interval = 5 * 60 * 1000;
      const nowTime = Math.floor(messageTime.time / 10) * 10 * 1000;
      // 检查messageList是否存在且不为空
      if (this.data.messageList && Array.isArray(this.data.messageList) && this.data.messageList.length > 0) {
        const lastTime = this.data.messageList.slice(-1)[0].time * 1000;
        if (nowTime  - lastTime > interval) {
          Object.assign(messageTime, {
            isShowHistoryTime: true,
            historyTime: dayjs(nowTime).format('YYYY-MM-DD HH:mm:ss')
          });
        }
      }
    },
    // 渲染历史消息时间
    showHistoryMessageTime(messageList) {
      const cut = 30 * 60 * 1000;
      if (messageList.length < 1) {
        return;
      }
      for (let index = 1; index < messageList.length; index++) {
        const currentMessageTime = Math.floor(messageList[index].time / 10) * 10 * 1000;
        const preMessageTime = messageList[index - 1].time * 1000;
        if (currentMessageTime - preMessageTime > cut) {
          Object.assign(messageList[index], {
            isShowHistoryTime: true,
            historyTime: dayjs(currentMessageTime).format('YYYY-MM-DD HH:mm:ss'),
          });
        }
      }
    },
    // 拉取更多历史消息渲染时间
    showMoreHistoryMessageTime(messageList) {
      if (messageList.length > 0) {
        const showHistoryTime = messageList[0].time * 1000;
        Object.assign(messageList[0], {
          isShowMoreHistoryTime: true,
        });
        this.data.newArr[messageList[0].ID] = dayjs(showHistoryTime).format('YYYY-MM-DD HH:mm:ss');
        this.setData({
          newArr: this.data.newArr,
        });
      }
    },
    // 消息发送失败
    sendMessageError(event) {
      this.updateMessageList(event.detail.message);
      const errorCode = event.detail.showErrorImageFlag;
      this.handleErrorCode(errorCode);
    },
    // 消息发送失败后重新发送
    ResendMessage(event) {
      const ID = event.target.dataset.value;
      const { TOAST_TITLE_TEXT } = constant;
      wx.showModal({
        content: '确认重发该消息？',
        success: (res) => {
          if (!res.confirm) {
            return;
          }
          const failMessage = this.data.messageList.find(item => (item.ID === ID));
          wx.$TUIKit.resendMessage(failMessage) // 传入需要重发的消息实例
            .then((res) => {
              this.updateMessageList(res.data.message);
              this.showToast(TOAST_TITLE_TEXT.RESEND_SUCCESS);
              this.setData({
                showMessageError: false,
              });
            })
            .catch((imError) => {
              this.handleErrorCode(imError.code);
            });
        },
      });
    },
    // 处理错误码信息
    handleErrorCode(errorCode) {
      const { MESSAGE_ERROR_CODE, TOAST_TITLE_TEXT } = constant;
      switch (errorCode) {
        case MESSAGE_ERROR_CODE.DIRTY_WORDS:
          this.showToast(TOAST_TITLE_TEXT.DIRTY_WORDS);
          break;
        case MESSAGE_ERROR_CODE.UPLOAD_FAIL:
          this.showToast(TOAST_TITLE_TEXT.UPLOAD_FAIL);
          break;
        case MESSAGE_ERROR_CODE.REQUESTOR_TIME || MESSAGE_ERROR_CODE.DISCONNECT_NETWORK:
          this.showToast(TOAST_TITLE_TEXT.CONNECT_ERROR);
          break;
        case MESSAGE_ERROR_CODE.DIRTY_MEDIA:
          this.showToast(TOAST_TITLE_TEXT.DIRTY_MEDIA);
          break;
        case MESSAGE_ERROR_CODE.UNUPLOADED_PICTURE:
          this.showToast(TOAST_TITLE_TEXT.UNUPLOADED_PICTURE);
          break;
        case MESSAGE_ERROR_CODE.UNUPLOADED_MEDIA:
          this.showToast(TOAST_TITLE_TEXT.UNUPLOADED_MEDIA);
          break;
        case MESSAGE_ERROR_CODE.BLACKLIST_MEMBER:
          this.showToast(TOAST_TITLE_TEXT.BLACKLIST_MEMBER);
          break;
        case MESSAGE_ERROR_CODE.NOT_GROUP_MEMBER:
          this.showToast(TOAST_TITLE_TEXT.NOT_GROUP_MEMBER);
          break;
        default:
          break;
      }
    },
    showToast(toastTitle) {
      if (this.data.showMessageError) {
        wx.showToast({
          title: toastTitle,
          duration: 800,
          icon: 'none',
        });
      } else {
        this.setData({
          showMessageError: true,
        });
        wx.showToast({
          title: toastTitle,
          duration: 800,
          icon: 'none',
        });
      }
    },
    // 点击购买链接跳转
    handleJumpLink(e) {
      if (app.globalData && app.globalData.reportType !== constant.OPERATING_ENVIRONMENT) return;
      const { BUSINESS_ID_TEXT }  = constant;
      const dataLink = JSON.parse(e.currentTarget.dataset.value.payload.data);
      if (dataLink.businessID === BUSINESS_ID_TEXT.ORDER || dataLink.businessID === BUSINESS_ID_TEXT.LINK) {
        const url = `/pages/TUI-User-Center/webview/webview?url=${dataLink.link}&wechatMobile`;
        wx.navigateTo({
          url: encodeURI(url),
        });
      }
    },
    onScroll(event) {
      let isScrollToBottom = false;
      // 滚动条在底部
      const currentScorollPos = Math.round(event.detail.scrollTop + this.data.chatContainerHeight);
      if (event.detail.scrollHeight - currentScorollPos <= 0) {
        isScrollToBottom = true;
      }
      this.setData({
        isScrollToBottom,
      });
    },

    /**
     * 从云函数获取用户头像数据
     * @param {string} userID - 用户ID
     * @returns {Promise<string>} - 用户头像URL
     */
    async getUserAvatarFromCloud(userID) {
      try {
        // 首先检查缓存中是否已经有用户的头像
        if (this.data.avatarCache[userID]) {
          console.log('从缓存获取用户头像数据:', userID);
          return this.data.avatarCache[userID];
        }
        
        console.log('从云函数获取用户头像数据:', userID);
        const result = await wx.cloud.callFunction({
          name: 'getUserInfo',
          data: { userID: userID }
        });
        
        console.log('getUserInfo云函数返回结果:', result);
        
        if (result.result && result.result.code === 0 && result.result.data && result.result.data.userInfo && result.result.data.userInfo.avatarUrl) {
          const avatarUrl = result.result.data.userInfo.avatarUrl;
          // 将获取到的头像URL存入缓存
          this.setData({
            [`avatarCache.${userID}`]: avatarUrl
          });
          return avatarUrl;
        }
        return '';
      } catch (error) {
        console.error('从云函数获取用户头像失败:', error);
        return '';
      }
    },

    /**
     * 处理消息列表，为每条消息添加头像信息
     * 方案3优化：优先使用 IM SDK 中的头像，移除云函数获取
     * @param {Array} messageList - 消息列表
     */
    async processMessageListWithAvatars(messageList) {
      if (!messageList || messageList.length === 0) {
        return messageList;
      }

      // 创建一个集合来存储已经处理过的用户ID，避免重复处理
      const processedUserIDs = new Set();

      // 为每条消息处理头像信息
      for (let i = 0; i < messageList.length; i++) {
        const message = messageList[i];

        // 方案3优化：优先使用 IM SDK 中的头像
        // 如果消息已经有头像（来自 IM SDK），直接使用
        if (message.avatar) {
          // 标记头像为未加载状态，这样会显示加载动画
          message.avatarLoaded = false;
          continue;
        }

        // 方案3优化：如果消息没有头像，尝试从 userProfile 获取
        if (message.userProfile && message.userProfile.avatar) {
          message.avatar = message.userProfile.avatar;
          message.avatarLoaded = false;
          continue;
        }

        // 方案3优化：移除云函数获取头像的逻辑
        // 原因：
        // 1. 增加不必要的云函数调用
        // 2. 可能导致数据不一致
        // 3. IM SDK 已经提供了完整的用户资料管理
        // 4. 头像应该在跳转前通过 imProfileManager 更新

        // 如果仍然没有头像，留空，让组件使用默认头像
        // 默认头像通过 avatarUrl 属性传入
      }

      return messageList;
    },

    /**
     * 头像加载失败处理
     * @param {Object} e - 事件对象
     */
    handleAvatarLoadError(e) {
      try {
        // 获取消息数据
        const message = e.currentTarget.dataset.value;
        if (!message || !message.ID) return;
        
        // 将更新添加到队列
        this._avatarUpdateQueue.set(message.ID, {
          avatar: ''
        });
        
        // 同时更新缓存，避免下次再加载失败的头像
        if (message.from || message.fromAccount) {
          const userID = message.from || message.fromAccount;
          this.setData({
            [`avatarCache.${userID}`]: ''
          });
        }
        
        // 同时缓存失败的头像URL，避免重复尝试加载
        if (message.avatar) {
          this.setData({
            [`avatarCache.${message.avatar}`]: false
          });
        }
        
        // 节流处理，避免频繁更新
        if (this._avatarUpdateTimer) {
          clearTimeout(this._avatarUpdateTimer);
        }
        this._avatarUpdateTimer = setTimeout(() => {
          this._processAvatarUpdates();
          this._avatarUpdateTimer = null;
        }, 50); // 50ms节流
      } catch (error) {
        console.error('处理头像加载失败时出错:', error);
      }
    },

    /**
     * 批量处理头像更新
     * @private
     */
    _processAvatarUpdates() {
      if (this._avatarUpdateQueue.size === 0) return;
      
      const updatedMessageList = [...this.data.messageList];
      let hasUpdates = false;
      
      // 处理队列中的所有更新
      this._avatarUpdateQueue.forEach((updateData, messageID) => {
        const index = updatedMessageList.findIndex(item => item.ID === messageID);
        if (index === -1) return;
        
        // 应用更新
        if (updateData.avatar !== undefined) {
          updatedMessageList[index].avatar = updateData.avatar;
        }
        if (updateData.avatarLoaded !== undefined) {
          updatedMessageList[index].avatarLoaded = updateData.avatarLoaded;
        }
        
        hasUpdates = true;
      });
      
      // 清空队列
      this._avatarUpdateQueue.clear();
      
      // 执行批量更新
      if (hasUpdates) {
        this.setData({
          messageList: updatedMessageList
        });
      }
    },

    /**
     * 头像加载成功处理
     * @param {Object} e - 事件对象
     */
    handleAvatarLoadSuccess(e) {
      try {
        // 获取消息数据
        const message = e.currentTarget.dataset.value;
        if (!message || !message.ID || !message.avatar) return;
        
        // 更新头像缓存
        if (message.from || message.fromAccount) {
          const userID = message.from || message.fromAccount;
          this.setData({
            [`avatarCache.${userID}`]: message.avatar
          });
        }
        
        // 同时缓存头像URL，避免重复加载
        this.setData({
          [`avatarCache.${message.avatar}`]: true
        });
        
        // 将更新添加到队列
        this._avatarUpdateQueue.set(message.ID, {
          avatarLoaded: true
        });
        
        // 节流处理，避免频繁更新
        if (this._avatarUpdateTimer) {
          clearTimeout(this._avatarUpdateTimer);
        }
        this._avatarUpdateTimer = setTimeout(() => {
          this._processAvatarUpdates();
          this._avatarUpdateTimer = null;
        }, 50); // 50ms节流
      } catch (error) {
        console.error('处理头像加载成功时出错:', error);
      }
    },

    /**
     * 处理SDK_READY事件
     * @private
     */
    _handleSDKReady() {
      console.log('MessageList: 收到 SDK_READY 事件，重新获取消息列表');
      if (this._sdkReadyListener) {
        wx.$TUIKit.off(wx.TencentCloudChat.EVENT.SDK_READY, this._sdkReadyListener);
        this._sdkReadyListener = null;
      }
      // SDK ready 后重新获取消息列表
      if (this.data.conversation && this.data.conversation.conversationID) {
        this.getMessageList(this.data.conversation);
      }
    },

    /**
     * 监听SDK_READY事件
     */
    listenForSDKReady() {
      if (!this._sdkReadyListener && wx.$TUIKit && wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
        // 使用具名函数作为事件处理器（符合SDK官方建议）
        this._sdkReadyListener = this._handleSDKReady.bind(this);
        wx.$TUIKit.on(wx.TencentCloudChat.EVENT.SDK_READY, this._sdkReadyListener);
      }
    },

    /**
     * SDK断开连接事件处理
     */
    $onSDKNotReady() {
      console.log('MessageList: SDK断开连接，等待SDK重新ready');
      // 重新监听SDK_READY事件
      this.listenForSDKReady();
    },

    /**
     * 保存会话记录到本地缓存
     * @param {string} conversationID - 会话ID
     * @param {Array} messageList - 消息列表
     */
    saveConversationToCache(conversationID, messageList) {
      try {
        const cacheKey = `conversation_${conversationID}`;
        const cacheData = {
          messageList,
          timestamp: Date.now()
        };
        wx.setStorageSync(cacheKey, cacheData);
        console.log('会话记录已保存到本地缓存:', messageList.length);
      } catch (error) {
        console.error('保存会话记录到缓存失败:', error);
      }
    },

    /**
     * 从本地缓存获取会话记录
     * @param {string} conversationID - 会话ID
     * @returns {Array} - 消息列表
     */
    getConversationFromCache(conversationID) {
      try {
        const cacheKey = `conversation_${conversationID}`;
        const cacheData = wx.getStorageSync(cacheKey);
        if (cacheData && cacheData.messageList) {
          console.log('从本地缓存加载会话记录:', cacheData.messageList.length);
          return cacheData.messageList;
        }
      } catch (error) {
        console.error('从缓存获取会话记录失败:', error);
      }
      return [];
    },
  },

});
