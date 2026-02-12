// 关键：在文件最开始初始化全局a变量
// 这样可以避免在文件评估阶段出现 'undefined is not an object (evaluating 'a.functions')' 错误
a = a || {};
a.functions = a.functions || {};
a.functions.getAuthCode = a.functions.getAuthCode || function() { return Promise.resolve(''); };

console.log('TUIConversation: 全局a.functions 已初始化');

// 使用require语句代替import语句，这样可以控制模块加载的顺序
const constant = require('../utils/constant');
const useChatEngine = require('../utils/useChatEngine');

// 关键：确保 TUICore.functions 存在
try {
  const TUICore = require('@tencentcloud/tui-core');
  if (!TUICore.functions) {
    TUICore.functions = {};
  }
  console.log('TUIConversation: TUICore.functions 已初始化');
} catch (error) {
  console.warn('TUIConversation: TUICore 初始化失败:', error);
}

// TUIKitWChat/Conversation/index.js
const app = getApp();

Component({
  /**
   * 组件的初始数据
   */
  data: {
    conversationList: [],
    currentConversationID: '',
    showSelectTag: false,
    array: [
      { id: 1, name: '发起会话' },
      { id: 2, name: '发起群聊' },
      { id: 3, name: '加入群聊' },
    ],
    index: Number,
    unreadCount: 0,
    conversationInfomation: {},
    transChenckID: '',
    userIDList: [],
    statusList: [],
    currentUserIDList: [],
    showConversationList: true,
    showCreateConversation: false,
    showCreateGroup: false,
    showJoinGroup: false,
    handleChangeStatus: false,
    storageList: [],
    showConversation: false,
    isInit: false,
    isExistNav: false,
  },
  lifetimes: {
    attached() {
      // 组件挂载时自动初始化
      this.init();
    },
    detached() {
      // 安全地移除事件监听，避免无效的handler错误
      try {
        if (wx.$TUIKit && this.onConversationListUpdated && wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
          wx.$TUIKit.off(wx.TencentCloudChat.EVENT.CONVERSATION_LIST_UPDATED, this.onConversationListUpdated, this);
        }
        if (wx.$TUIKit && this.onUserStatusUpdate && wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
          wx.$TUIKit.off(wx.TencentCloudChat.EVENT.USER_STATUS_UPDATED, this.onUserStatusUpdate, this);
        }
        if (wx.$TUIKit && this.onSDKReady && wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
          wx.$TUIKit.off(wx.TencentCloudChat.EVENT.SDK_READY, this.onSDKReady, this);
        }
        if (wx.$TUIKit && this.onLoginSuccess && wx.TencentCloudChat && wx.TencentCloudChat.EVENT) {
          wx.$TUIKit.off(wx.TencentCloudChat.EVENT.LOGIN_SUCCESS, this.onLoginSuccess, this);
        }
      } catch (error) {
        console.warn('移除事件监听时出错:', error);
      }
      this.setData({
        isInit: false,
      });
    },
  },

  /**
   * 组件的方法列表
   */
  methods: {
    init() {
      console.log('TUIConversation: 开始初始化');
      // 检查wx.$TUIKit是否存在，避免未登录状态下的错误
      if (!wx.$TUIKit) {
        console.log('TUIConversation init: wx.$TUIKit not available, skipping IM operations');
        return;
      }
      
      console.log('TUIConversation init: wx.$TUIKit available');
      console.log('TUIConversation init: 当前conversationList:', this.data.conversationList);
      console.log('TUIConversation init: 当前isInit:', this.data.isInit);
      
      this.initEvent();
      this.setData({
        showConversation: true,
      });
      this.initUserStatus();
      this.setBackIcon();
      useChatEngine();
      
      console.log('TUIConversation: 初始化完成');
    },

    destroy() {
      this.setData({
        showConversation: false,
        isExistNav: false,
      });
    },

    initEvent() {
      if (!this.data.isInit) {
        console.log('TUIConversation initEvent: 开始初始化事件监听');
        
        // 监听会话列表更新事件
        wx.$TUIKit.on(wx.TencentCloudChat.EVENT.CONVERSATION_LIST_UPDATED, this.onConversationListUpdated, this);
        // 监听用户状态更新事件
        wx.$TUIKit.on(wx.TencentCloudChat.EVENT.USER_STATUS_UPDATED, this.onUserStatusUpdate, this);
        // 监听SDK就绪事件，确保登录成功后刷新会话列表
        wx.$TUIKit.on(wx.TencentCloudChat.EVENT.SDK_READY, this.onSDKReady, this);
        // 监听登录成功事件
        wx.$TUIKit.on(wx.TencentCloudChat.EVENT.LOGIN_SUCCESS, this.onLoginSuccess, this);
        
        // 检查当前登录状态，如果已经登录，直接刷新会话列表
        console.log('TUIConversation initEvent: 检查当前登录状态');
        try {
          const imManager = wx.$IMManager;
          if (imManager && imManager.isLoggedIn()) {
            console.log('TUIConversation initEvent: 用户已登录，立即刷新会话列表');
            this.refreshConversationList();
          } else {
            console.log('TUIConversation initEvent: 用户未登录，等待登录成功事件');
            // 初始化时获取会话列表（仅在列表为空时）
            this.getConversationList();
          }
        } catch (error) {
          console.error('TUIConversation initEvent: 检查登录状态失败:', error);
          // 初始化时获取会话列表（仅在列表为空时）
          this.getConversationList();
        }
        
        this.setData({
          isInit: true,
        });
        
        console.log('TUIConversation initEvent: 事件监听初始化完成');
      }
    },

    initUserStatus() {
      wx.getStorageInfo({
        success(res) {
          wx.setStorage({
            key: 'storageList',
            data: res.keys,
          });
        },
      });
      this.setData({
        handleChangeStatus: wx.getStorageSync(app?.globalData?.userInfo?.userID) ? wx.getStorageSync(app?.globalData?.userInfo?.userID) : true,
      }, () => {
        if (!wx.getStorageSync('storageList').includes('showOnlineStatus')) {
          this.handleChangeStatus();
        }
      });
    },

    setBackIcon() {
      const pages = getCurrentPages();
      const prevPages = pages[pages.length - 2];
      if (prevPages && prevPages.route) {
        this.setData({
          isExistNav: true,
        });
      }
    },

    goBack() {
      if (app.globalData && app.globalData.reportType !== constant.OPERATING_ENVIRONMENT) {
        wx.navigateBack();
      } else {
        wx.switchTab({
          url: '/pages/TUI-Index/index',
        });
      }
    },
    // SDK就绪事件处理
    onSDKReady(event) {
      console.log('TUIConversation: SDK_READY事件触发，刷新会话列表');
      this.refreshConversationList();
    },
    // 登录成功事件处理
    onLoginSuccess(event) {
      console.log('TUIConversation: LOGIN_SUCCESS事件触发，刷新会话列表');
      this.refreshConversationList();
    },
    // 更新会话列表
    onConversationListUpdated(event) {
      this.handleConversationList(event.data);
    },
    // 获取会话列表（仅在列表为空时）
    getConversationList() {
      console.log('TUIConversation: getConversationList调用，conversationList长度:', this.data.conversationList.length);
      if (this.data.conversationList.length === 0) {
        this.refreshConversationList();
      } else {
        console.log('TUIConversation: conversationList不为空，跳过刷新');
      }
    },
    // 刷新会话列表（强制获取最新）
    refreshConversationList() {
      console.log('TUIConversation: 刷新会话列表');
      wx.$TUIKit.getConversationList().then((imResponse) => {
        this.handleConversationList(imResponse.data.conversationList);
      }).catch((error) => {
        console.error('TUIConversation: 刷新会话列表失败:', error);
      });
    },
    handleConversationList(conversationList) {
      this.setData({
        conversationList,
      });
      this.filterUserIDList(conversationList);
    },
    // 过滤会话列表，找出C2C会话，以及需要订阅状态的userIDList
    filterUserIDList(conversationList) {
      if (conversationList.length === 0) return;
      const userIDList = [];
      conversationList.forEach((element) => {
        if (element.type === wx.TencentCloudChat.TYPES.CONV_C2C) {
          userIDList.push(element.userProfile.userID);
        }
      });
      const currentUserID = wx.getStorageSync('currentUserID');
      if (currentUserID.includes(wx.$chat_userID)) {
        const currentStatus = wx.getStorageSync(wx.$chat_userID);
        if (currentStatus) {
          this.subscribeOnlineStatus(userIDList);
        }
      } else {
        this.subscribeOnlineStatus(userIDList);
      }
    },
    transCheckID(event) {
      this.setData({
        transChenckID: event.detail.checkID,
      });
    },
    // 更新状态
    onUserStatusUpdate(event) {
      event.data.forEach((element) => {
        const index = this.data.statusList.findIndex(item => item.userID === element.userID);
        if (index === -1) {
          return;
        }
        this.data.statusList[index] = element;
        this.setData({
          statusList: this.data.statusList,
        });
      });
    },
    // 跳转到子组件需要的参数
    handleRoute(event) {
      const flagIndex = this.data.conversationList.findIndex(item => item.conversationID === event.currentTarget.id);
      this.setData({
        index: flagIndex,
      });
      this.getConversationList();
      this.setData({
        currentConversationID: event.currentTarget.id,
        unreadCount: this.data.conversationList[this.data.index].unreadCount,
      });
      this.triggerEvent('createConversation', { currentConversationID: event.currentTarget.id,
        unreadCount: this.data.conversationList[this.data.index].unreadCount });
    },
    // 展示发起会话/发起群聊/加入群聊
    showSelectedTag() {
      this.setData({
        showSelectTag: !this.data.showSelectTag,
      });
    },
    handleOnTap(event) {
      this.setData({
        showSelectTag: false,
      }, () => {
        switch (event.currentTarget.dataset.id) {
          case 1:
            this.setData({
              showCreateConversation: true,
              showConversationList: false,
            });
            break;
          case 2:
            this.setData({
              showCreateGroup: true,
              showConversationList: false,
            });
            break;
          case 3:
            this.setData({
              showJoinGroup: true,
              showConversationList: false,
            });
            break;
          default:
            break;
        }
      });
    },
    // 点击空白区域关闭showMore弹窗
    handleEditToggle() {
      this.setData({
        showSelectTag: false,
      });
    },
    toggleConversation() {
      this.setData({
        showConversationList: true,
        showCreateConversation: false,
        showCreateGroup: false,
        showJoinGroup: false,
      });
    },
    handleCreateConversation(event) {
      this.triggerEvent('createConversation', { currentConversationID: event.detail.currentConversationID });
    },
    // 处理当前登录账号是否开启在线状态
    handleChangeStatus() {
      const currentID = wx.$chat_userID;
      const cacheList = wx.getStorageSync('currentUserID');
      const nowList = [];
      nowList.push(wx.$chat_userID);
      if (cacheList.length === 0 || !cacheList.includes(wx.$chat_userID)) {
        wx.setStorage({
          key: 'currentUserID',
          data: wx.getStorageSync('currentUserID').concat(nowList),
        });
      }
      wx.setStorage({
        key: currentID,
        data: this.data.handleChangeStatus,
      });
    },
    // 订阅在线状态
    subscribeOnlineStatus(userIDList) {
      wx.$TUIKit.getUserStatus({ userIDList }).then((imResponse) => {
        const { successUserList } = imResponse.data;
        this.setData({
          statusList: successUserList,
        });
      })
        .catch((imError) => {
          console.warn('开启在线状态功能,' + '\n'
          + '1. 需要您开通旗舰版套餐：https://buy.cloud.tencent.com/avc ;' + '\n'
          + '2. 进入 IM 控制台开启“用户状态查询及状态变更通知”开关: https://console.cloud.tencent.com/im/login-message');
        });
      wx.$TUIKit.subscribeUserStatus({ userIDList });
    },
    learnMore() {
      if (app.globalData && app.globalData.reportType !== constant.OPERATING_ENVIRONMENT) return;
      wx.navigateTo({
        url: '/pages/TUI-User-Center/webview/webview?url=https://cloud.tencent.com/product/im',
      });
    },
  },
});
