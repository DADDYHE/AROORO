// TUIKitWChat/Chat/index.js

// 关键：必须在最开头导入 a.js，确保全局变量 a 和 a.functions 在任何其他模块加载前已经初始化
// 这样可以避免 'undefined is not an object (evaluating 'a.functions')' 错误
require('./a');

// 使用require语句代替import语句，这样可以控制模块加载的顺序
const constant = require('./utils/constant');
const TUICore = require('@tencentcloud/tui-core');
const TUIConstants = TUICore.TUIConstants;

// 关键：确保 TUICore.functions 存在
// 避免 'undefined is not an object (evaluating 'a.functions')' 错误
if (!TUICore.functions) {
  TUICore.functions = {};
  console.log('TUI-Messages/index.js: TUICore.functions 已初始化');
}

const app = getApp();
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    conversationID: {
      type: String,
      value: '',
      observer(conversationID) {
        this.setData({
          outsideConversation: true,
          currentConversationID: conversationID,
        });
      },
    },
  },

  /**
   * 组件的初始数据
   */
  data: {
    isShowConversation: false,
    isShowConversationList: false,
    currentConversationID: '',
    unreadCount: 0,
    hasCallKit: false,
    config: {
      userID: '',
      userSig: '',
      type: 1,
      tim: null,
      SDKAppID: 0,
    },
    outsideConversation: false,
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 初始化组件
     * 确保在IM服务就绪后才执行初始化操作
     */
    init() {
      console.log('TUI-Messages/index.js: 开始初始化组件');
      
      // 检查IM服务是否就绪
      if (wx.$IMManager && wx.$IMManager.isSDKReady()) {
        console.log('TUI-Messages/index.js: IM服务已就绪，直接初始化组件');
        this._initializeComponent();
      } else {
        console.log('TUI-Messages/index.js: IM服务未就绪，等待SDK就绪');
        
        // 等待IM服务就绪
        if (wx.$IMManager) {
          // 监听IM服务状态变更
          wx.$IMManager.on('stateChange', this._handleIMStateChange.bind(this));
          
          // 同时使用waitForReady方法等待
          wx.$IMManager.waitForReady(10000).then((ready) => {
            if (ready) {
              console.log('TUI-Messages/index.js: IM服务就绪，初始化组件');
              this._initializeComponent();
            } else {
              console.error('TUI-Messages/index.js: 等待IM服务就绪超时');
            }
          });
        } else {
          console.error('TUI-Messages/index.js: IM管理器未初始化');
        }
      }
    },
    
    /**
     * 处理IM服务状态变更
     */
    _handleIMStateChange(event) {
      console.log('TUI-Messages/index.js: IM状态变更:', event);
      if (event.newState === 'ready' || event.newState === 'logged_in') {
        console.log('TUI-Messages/index.js: IM服务就绪，初始化组件');
        this._initializeComponent();
        // 移除状态变更监听
        if (wx.$IMManager) {
          wx.$IMManager.off('stateChange', this._handleIMStateChange.bind(this));
        }
      }
    },
    
    /**
     * 实际执行组件初始化操作
     */
    _initializeComponent() {
      const {
        config,
      } = this.data;
      
      // 检查必要的全局变量
      if (!wx.$chat_userID || !wx.$chat_userSig || !wx.$TUIKit || !wx.$chat_SDKAppID) {
        console.error('TUI-Messages/index.js: 缺少必要的IM配置参数');
        console.log('  wx.$chat_userID:', wx.$chat_userID);
        console.log('  wx.$chat_userSig:', wx.$chat_userSig ? '已设置' : '未设置');
        console.log('  wx.$TUIKit:', wx.$TUIKit ? '已初始化' : '未初始化');
        console.log('  wx.$chat_SDKAppID:', wx.$chat_SDKAppID);
        return;
      }
      
      config.userID = wx.$chat_userID;
      config.userSig = wx.$chat_userSig;
      config.tim = wx.$TUIKit;
      config.SDKAppID = wx.$chat_SDKAppID;
      
      console.log('TUI-Messages/index.js: 组件配置:', config);
      
      if (this.data.outsideConversation) {
        this.createConversation({
          detail: {
            currentConversationID: this.data.currentConversationID,
            unreadCount: 0,
          },
        });
      } else {
        this.showConversationList();
      }
      this.setData(
        {
          config,
        },
        () => {
          this.initCallKit();
        },
      );
    },
    initCallKit() {
      if (TUICore.getService(TUIConstants.TUICalling.SERVICE.NAME)) {
        this.setData({
          hasCallKit: true,
        });
      }
    },
    createConversation(event) {
      this.setData(
        {
          isShowConversation: true,
          currentConversationID: event.detail.currentConversationID,
          unreadCount: event.detail.unreadCount,
        },
        () => {
          const TUIChat = this.selectComponent('#TUIChat');
          TUIChat.init();
          const timer = setTimeout(() => {
            const TUIConversation = this.selectComponent('#TUIConversation');
            TUIConversation.destroy();
            clearTimeout(timer);
          }, 300);
        },
      );
    },
    showConversationList() {
      if (this.data.outsideConversation) {
        this.handleBack();
      } else {
        const TUIConversation = this.selectComponent('#TUIConversation');
        TUIConversation.init();
        this.setData({
          isShowConversation: false,
        });
      }
    },
    async handleCall(event) {
      let { userIDList = [] } = event.detail;
      const { groupID = '', userID = '', type } = event.detail;
      if (userID) {
        userIDList = [userID];
      }
      TUICore.callService({
        serviceName: TUIConstants.TUICalling.SERVICE.NAME,
        method: TUIConstants.TUICalling.SERVICE.METHOD.START_CALL,
        params: {
          groupID,
          userIDList,
          type,
        },
      });
    },
    handleBack() {
      if (
        app.globalData
        && app.globalData.reportType !== constant.OPERATING_ENVIRONMENT
      ) {
        wx.navigateBack({
          delta: 1,
        });
      } else {
        wx.switchTab({
          url: '/pages/TUI-Index/index',
        });
      }
    },
    sendMessage(event) {
      this.selectComponent('#TUIChat').sendMessage(event);
    },
  },
});
