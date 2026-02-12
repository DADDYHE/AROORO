// 关键：在文件最开始就初始化全局a变量
// 这样可以避免在文件评估阶段出现 'undefined is not an object (evaluating 'a.functions')' 错误

// 直接在全局作用域定义a变量，确保在任何其他代码执行之前，a变量就已经存在
a = a || {};
a.functions = a.functions || {};
a.functions.getAuthCode = a.functions.getAuthCode || function() { return Promise.resolve(''); };

console.log('MessageInput: 全局a.functions 已初始化');

// 引入 IM userID 验证工具
const ImUserIdValidator = require('../../../../utils/imUserIdValidator');
// 引入消息服务
const messageService = require('../../../../utils/messageService').default;

// 使用require语句代替import语句，这样可以控制模块加载的顺序
// 使用相对路径，从当前文件位置开始计算
const logger = require('../../../utils/logger'); // 移除 .default，因为 logger 模块使用 CommonJS 格式导出
const constant = require('../../../utils/constant');

// 关键：在组件初始化前确保全局对象存在
// 避免 'undefined is not an object (evaluating 'a.functions')' 错误
try {
  const TUICore = require('@tencentcloud/tui-core');
  if (!TUICore.functions) {
    TUICore.functions = {};
  }
  console.log('MessageInput: TUICore.functions 已初始化');
} catch (error) {
  console.warn('MessageInput: TUICore 初始化失败:', error);
}

// eslint-disable-next-line no-undef
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    conversation: {
      type: Object,
      value: {},
      observer(newVal) {
        // 关键：在设置 conversation 时，标准化其中的 conversationID
        if (newVal && newVal.conversationID) {
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
            console.log('MessageInput conversation observer: 标准化conversationID');
            console.log('  原始:', originalConversationID);
            console.log('  标准化后:', normalizedConversationID);
            newVal.conversationID = normalizedConversationID;
          }
        }

        this.setData({
          conversation: newVal,
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
    currentChatType: {
      type: String,
      value: '',
      observer(currentChatType) {
        const { CONVERSATION_TYPE } = constant;
        if (currentChatType === CONVERSATION_TYPE.CUSTOMER_SERVICE) {
          this.setData({
            showCallExtension: false,
          });
        }
      },
    },
  },

  /**
   * 组件的初始数据
   */
  data: {
    message: '',
    extensionArea: false,
    sendMessageBtn: false,
    displayFlag: '',
    isAudio: false,
    bottomVal: 0,
    startPoint: 0,
    popupToggle: false,
    isRecording: false,
    canSend: true,
    text: '按住说话',
    title: ' ',
    notShow: false,
    isShow: true,
    commonFunction: [
      { name: '常用语', key: '0' },
      { name: '发送订单', key: '1' },
      { name: '服务评价', key: '2' },
    ],
    displayServiceEvaluation: false,
    showErrorImageFlag: 0,
    messageList: [],
    isFirstSendTyping: true,
    time: 0,
    focus: false,
    isEmoji: false,
    fileList: [],
    textareaHeight: 0,
    showCallExtension: true,
    // typing消息防抖定时器
    typingTimer: null,
    // 消息重试计数器
    messageRetryCount: 0,
    // 最大重试次数
    maxRetryCount: 2,
  },
  
  /**
   * 组件的生命周期函数
   */
  lifetimes: {
    attached() {
      // 初始化最后发送时间
      this.lastSendTime = 0;
      
      // 加载声音录制管理器
      this.recorderManager = wx.getRecorderManager();
      this.recorderManager.onStop((res) => {
        wx.hideLoading();
        if (this.data.canSend) {
          if (res.duration < 1000) {
            wx.showToast({
              title: '录音时间太短',
              icon: 'none',
            });
          } else {
            // res.tempFilePath 存储录音文件的临时路径
            const to = this.getToAccount();
            const message = wx.$TUIKit.createAudioMessage({
              to: to,
              conversationType: this.data.conversation.type,
              payload: {
                file: res,
              },
            });
            // 关键：直接更新 message 对象的 to 字段为标准化的 ID
            if (message && message.to !== to) {
              console.log('录音结束: 更新message.to');
              console.log('  原始:', message.to);
              console.log('  标准化后:', to);
              message.to = to;
            }
            this.$sendTIMMessage(message);
          }
        }
        this.setData({
          startPoint: 0,
          popupToggle: false,
          isRecording: false,
          canSend: true,
          title: ' ',
          text: '按住说话',
        });
      });
    },
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 获取消息列表来判断是否发送正在输入状态
    getMessageList(conversation) {
      // 验证参数完整性
      if (!conversation || !conversation.conversationID) {
        console.warn('getMessageList: conversation对象或conversationID为空，跳过获取消息列表');
        return;
      }
      
      // 验证conversationID格式是否正确
      const conversationID = conversation.conversationID;
      if (typeof conversationID !== 'string' || conversationID.trim() === '') {
        console.warn('getMessageList: conversationID格式无效:', conversationID);
        return;
      }
      
      console.log('getMessageList: 开始获取消息列表，conversationID:', conversationID);
      
      wx.$TUIKit.getMessageList({
        conversationID: conversationID,
        nextReqMessageID: this.data.nextReqMessageID,
        count: 15,
      }).then((res) => {
        const { messageList } = res.data;
        this.setData({
          messageList,
        });
        console.log('getMessageList: 获取消息列表成功，消息数量:', messageList.length);
      }).catch((error) => {
        console.error('getMessageList: 获取消息列表失败:', error);
        // 即使失败也不影响输入框的正常使用
      });
    },

    // 打开录音开关
    switchAudio() {
      this.setData({
        isAudio: !this.data.isAudio,
        isEmoji: false,
        text: '按住说话',
        focus: false,
      });
    },

    handleTouchStart() {
      wx.getSetting({
        success: async (res) => {
          const isRecord = res.authSetting['scope.record'];
          // 首次获取权限时, isRecord === undefine， 需使用 this.recorderManager 内置调用权限功能
          // 当 isRecord === false 时，表示首次未授权，不会触发 this.recorderManager 内置调用权限功能
          // 此时需要走 wx.authorize 授权，失败指引用户自己在设置中开启
          if (isRecord === false) {
            const title = '麦克风权限授权';
            const content = '发送语音消息，需要在设置中对麦克风进行授权允许';
            wx.authorize({
              scope: 'scope.record',
              success: () => {
                this.recorderStart();
              },
              fail: () => {
                this.handleShowModal(title, content);
                wx.hideLoading();
                this.setData({
                  text: '按住说话',
                  isRecording: false,
                });
              },
            });
          } else {
            this.recorderStart();
          }
        },
      });
    },

    recorderStart() {
      this.recorderManager.start({
        duration: 60000, // 录音的时长，单位 ms，最大值 600000（10 分钟）
        sampleRate: 44100, // 采样率
        numberOfChannels: 1, // 录音通道数
        encodeBitRate: 192000, // 编码码率
        format: 'aac', // 音频格式，选择此格式创建的音频消息，可以在即时通信 IM 全平台（Android、iOS、微信小程序和Web）互通
      });
    },

    // 长按录音
    handleLongPress(e) {
      this.setData({
        startPoint: e.touches[0],
        title: '正在录音',
        notShow: true,
        isShow: false,
        isRecording: true,
        popupToggle: true,
      });
    },

    // 录音时的手势上划移动距离对应文案变化
    handleTouchMove(e) {
      if (this.data.isRecording) {
        if (this.data.startPoint.clientY - e.touches[e.touches.length - 1].clientY > 100) {
          this.setData({
            text: '抬起停止',
            title: '松开手指，取消发送',
            canSend: false,
          });
        } else if (this.data.startPoint.clientY - e.touches[e.touches.length - 1].clientY > 20) {
          this.setData({
            text: '抬起停止',
            title: '上划可取消',
            canSend: true,
          });
        } else {
          this.setData({
            text: '抬起停止',
            title: '正在录音',
            canSend: true,
          });
        }
      } else {

      }
    },

    // 手指离开页面滑动
    handleTouchEnd() {
      this.setData({
        isRecording: false,
        popupToggle: false,
      });
      wx.hideLoading();
      this.recorderManager.stop();
    },
    // 选中表情消息
    handleEmoji() {
      let targetFlag = 'emoji';
      if (this.data.displayFlag === 'emoji') {
        targetFlag = '';
      }
      this.setData({
        isAudio: false,
        isEmoji: true,
        displayFlag: targetFlag,
        focus: false,
      });
    },

    // 选自定义消息
    handleExtensions() {
      let targetFlag = 'extension';
      if (this.data.displayFlag === 'extension') {
        targetFlag = '';
      }
      this.triggerEvent('inputHeightChange', {});
      this.setData({
        displayFlag: targetFlag,
      });
    },

    error(e) {
      console.log(e.detail);
    },

    handleSendPicture() {
      this.sendMediaMessage('camera', 'image');
    },

    handleSendImage() {
      this.sendMediaMessage('album', 'image');
    },

    sendMediaMessage(type, mediaType) {
      const { fileList } = this.data;
      wx.chooseMedia({
        count: 9,
        sourceType: [type],
        mediaType: [mediaType],
        success: (res) => {
          const mediaInfoList = res.tempFiles;
          mediaInfoList.forEach((mediaInfo) => {
            fileList.push({ type: res.type, tempFiles: [{ tempFilePath: mediaInfo.tempFilePath }] });
          });
          fileList.forEach((file) => {
            if (file.type === 'image') {
              this.handleSendImageMessage(file);
            }
            if (file.type === 'video') {
              this.handleSendVideoMessage(file);
            }
          });
          this.data.fileList = [];
        },
      });
    },

    // 发送图片消息
    handleSendImageMessage(file) {
      const to = this.getToAccount();
      const message = wx.$TUIKit.createImageMessage({
        to: to,
        conversationType: this.data.conversation.type,
        payload: {
          file,
        },
        onProgress: (percent) => {
          message.percent = percent;
        },
      });
      // 关键：直接更新 message 对象的 to 字段为标准化的 ID
      if (message && message.to !== to) {
        console.log('handleSendImageMessage: 更新message.to');
        console.log('  原始:', message.to);
        console.log('  标准化后:', to);
        message.to = to;
      }
      this.$sendTIMMessage(message);
    },

    // 发送视频消息
    handleSendVideoMessage(file) {
      const to = this.getToAccount();
      const message = wx.$TUIKit.createVideoMessage({
        to: to,
        conversationType: this.data.conversation.type,
        payload: {
          file,
        },
        onProgress: (percent) => {
          message.percent = percent;
        },
      });
      // 关键：直接更新 message 对象的 to 字段为标准化的 ID
      if (message && message.to !== to) {
        console.log('handleSendVideoMessage: 更新message.to');
        console.log('  原始:', message.to);
        console.log('  标准化后:', to);
        message.to = to;
      }
      this.$sendTIMMessage(message);
    },

    handleShootVideo() {
      this.sendMediaMessage('camera', 'video');
    },

    handleSendVideo() {
      this.sendMediaMessage('album', 'video');
    },

    handleCommonFunctions(e) {
      switch (e.target.dataset.function.key) {
        case '0':
          this.setData({
            displayCommonWords: true,
          });
          break;
        case '1':
          this.setData({
            displayOrderList: true,
          });
          break;
        case '2':
          this.setData({
            displayServiceEvaluation: true,
          });
          break;
        default:
          break;
      }
    },

    handleSendOrder() {
      this.setData({
        displayOrderList: true,
      });
    },

    appendMessage(e) {
      this.setData({
        message: this.data.message + e.detail.message,
        sendMessageBtn: true,
      });
    },

    getToAccount() {
      if (!this.data.conversation || !this.data.conversation.conversationID) {
        return '';
      }

      const conversationID = this.data.conversation.conversationID;
      let toAccount = '';

      // 使用字符串前缀判断，而不是使用 TYPES 常量，避免常量值不匹配的问题
      if (conversationID.startsWith('C2C_')) {
        toAccount = conversationID.substring(4); // 移除 'C2C_' 前缀
      } else if (conversationID.startsWith('GROUP_')) {
        toAccount = conversationID.substring(6); // 移除 'GROUP_' 前缀
      } else {
        // 如果不符合预期格式，直接使用 conversationID
        toAccount = conversationID;
      }

      // 标准化ID，移除MongoDB _id开头的下划线
      const normalizedToAccount = this.normalizeUserID(toAccount);
      
      console.log('MessageInput getToAccount:');
      console.log('  原始conversationID:', conversationID);
      console.log('  提取的toAccount:', toAccount);
      console.log('  标准化后的toAccount:', normalizedToAccount);
      
      // 验证用户ID格式
      if (!this.isValidUserID(normalizedToAccount)) {
        console.error('MessageInput: 无效的用户ID:', normalizedToAccount);
        // 可以选择使用默认ID或提示用户
        // 即使无效也尝试发送，让SDK返回具体错误
      }
      
      return normalizedToAccount;
    },

    /**
     * 验证用户ID格式是否符合腾讯云IM SDK要求
     * @param {string} userID - 要验证的用户ID
     * @returns {boolean} - 用户ID是否有效
     */
    isValidUserID(userID) {
      // 腾讯云IM SDK用户ID规则：
      // 1. 长度不超过30个字符
      // 2. 只允许包含字母、数字、下划线、连字符
      // 3. 不能以连字符开头
      const userIDRegex = /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,29}$/;
      return userIDRegex.test(userID);
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
    async handleCheckAuthorize(e) {
      const type = e.currentTarget.dataset.value;
      wx.getSetting({
        success: async (res) => {
          const isRecord = res.authSetting['scope.record'];
          const isCamera = res.authSetting['scope.camera'];
          if (!isRecord && type === 1) {
            const title = '麦克风权限授权';
            const content = '使用语音通话，需要在设置中对麦克风进行授权允许';
            try {
              await wx.authorize({ scope: 'scope.record' });
              this.handleCalling(e);
            } catch (e) {
              this.handleShowModal(title, content);
            }
            return;
          }
          if ((!isRecord || !isCamera) && type === 2) {
            const title = '麦克风、摄像头权限授权';
            const content = '使用视频通话，需要在设置中对麦克风、摄像头进行授权允许';
            try {
              await wx.authorize({ scope: 'scope.record' });
              await wx.authorize({ scope: 'scope.camera' });
              this.handleCalling(e);
            } catch (e) {
              this.handleShowModal(title, content);
            }
            return;
          }
          this.handleCalling(e);
        },
      });
    },

    handleShowModal(title, content) {
      wx.showModal({
        title,
        content,
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting();
          }
        },
      });
    },

    handleCalling(e) {
      if (!this.data.hasCallKit) {
        wx.showToast({
          title: '请先集成 TUICallKit 组件',
          icon: 'none',
        });
        return;
      }
      const type = e.currentTarget.dataset.value;
      const conversationType = this.data.conversation.type;
      if (conversationType === wx.TencentCloudChat.TYPES.CONV_GROUP) {
        this.triggerEvent('handleCall', {
          type,
          conversationType,
        });
      }
      if (conversationType === wx.TencentCloudChat.TYPES.CONV_C2C) {
        const { userID } = this.data.conversation.userProfile;
        this.triggerEvent('handleCall', {
          conversationType,
          type,
          userID,
        });
      }
      this.setData({
        displayFlag: '',
      });
    },

    sendTextMessage(msg, flag) {
      // 验证会话对象是否完整
      if (!this.data.conversation || !this.data.conversation.type) {
        console.warn('sendTextMessage: conversation对象不完整，无法发送消息');
        wx.showToast({
          title: '会话未准备好，请稍后重试',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      const to = this.getToAccount();
      
      // 验证to参数是否有效
      if (!to || to.trim() === '') {
        console.warn('sendTextMessage: to参数无效，无法发送消息');
        wx.showToast({
          title: '无法确定接收方，请稍后重试',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      const text = flag ? msg : this.data.message;
      const { FEAT_NATIVE_CODE } = constant;
      
      // 确保使用正确的会话类型常量
      let conversationType = this.data.conversation.type;
      if (typeof conversationType === 'string') {
        // 如果会话类型是字符串，转换为数字常量
        if (conversationType === 'C2C') {
          conversationType = wx.TencentCloudChat.TYPES.CONV_C2C;
        } else if (conversationType === 'GROUP') {
          conversationType = wx.TencentCloudChat.TYPES.CONV_GROUP;
        }
      }

      console.log('sendTextMessage: 开始发送消息');
      console.log('  to:', to);
      console.log('  conversationType:', conversationType);
      console.log('  text:', text);

      // 符合IM SDK规范：参数验证
      if (!to || to.trim() === '') {
        console.error('sendTextMessage: to参数无效，无法发送消息');
        wx.showToast({
          title: '无法确定接收方，请稍后重试',
          icon: 'none',
          duration: 2000
        });
        return;
      }

      // 验证接收方 userID 格式
      console.log('[MessageInput] 验证接收方 userID:', to);
      const toValidation = ImUserIdValidator.validateUserID(to);
      if (!toValidation.valid) {
        console.error('sendTextMessage: 接收方 userID 格式无效:', toValidation.error);

        // 暂时禁用自动修复，直接使用从会话ID中提取的用户ID
        // 问题：自动修复会生成与正确ID不一致的结果
        console.log('[MessageInput] 禁用自动修复，直接使用原始ID:', to);
        
        // 不进行自动修复，直接使用原始ID
        // 这样可以确保使用的是从会话ID中提取的正确ID
      }

      if (!conversationType) {
        console.error('sendTextMessage: conversationType参数无效，无法发送消息');
        wx.showToast({
          title: '会话类型错误，请稍后重试',
          icon: 'none',
          duration: 2000
        });
        return;
      }

      // 验证会话对象是否完整
      if (!this.data.conversation || !this.data.conversation.conversationID) {
        console.error('sendTextMessage: conversation对象不完整，无法发送消息');
        wx.showToast({
          title: '会话未准备好，请稍后重试',
          icon: 'none',
          duration: 2000
        });
        return;
      }

      // 验证文本内容
      if (!text || text.trim() === '') {
        console.warn('sendTextMessage: 文本内容为空，跳过发送');
        return;
      }

      try {
        const message = wx.$TUIKit.createTextMessage({
          to,
          conversationType,
          payload: {
            text,
          },
          cloudCustomData: JSON.stringify({ messageFeature:
          {
            needTyping: FEAT_NATIVE_CODE.FEAT_TYPING,
            version: FEAT_NATIVE_CODE.NATIVE_VERSION,
          },
          }),
        });

        // 关键：直接更新 message 对象的 to 字段为标准化的 ID
        if (message && message.to !== to) {
          console.log('sendTextMessage: 更新message.to');
          console.log('  原始:', message.to);
          console.log('  标准化后:', to);
          message.to = to;
        }
        
        // 关键：确保 message.conversationID 格式正确（添加下划线）
        if (message && message.conversationID) {
          const originalConversationID = message.conversationID;
          let normalizedConversationID = originalConversationID;
          
          // 修复 C2C 会话ID格式（添加下划线）
          if (originalConversationID.startsWith('C2C') && !originalConversationID.startsWith('C2C_')) {
            normalizedConversationID = `C2C_${originalConversationID.substring(3)}`;
          }
          // 修复 GROUP 会话ID格式（添加下划线）
          else if (originalConversationID.startsWith('GROUP') && !originalConversationID.startsWith('GROUP_')) {
            normalizedConversationID = `GROUP_${originalConversationID.substring(5)}`;
          }
          
          if (normalizedConversationID !== originalConversationID) {
            console.log('sendTextMessage: 修复message.conversationID格式');
            console.log('  原始:', originalConversationID);
            console.log('  修复后:', normalizedConversationID);
            message.conversationID = normalizedConversationID;
          }
        }
        
        // 关键修复：确保 message.to 字段被正确设置
        if (message && message.to !== to) {
          console.log('sendTextMessage: 强制设置message.to字段');
          console.log('  原始:', message.to);
          console.log('  正确值:', to);
          message.to = to;
        }
        
        // 额外验证：确保消息对象的关键字段都已设置
        console.log('sendTextMessage: 消息对象验证');
        console.log('  message.to:', message.to);
        console.log('  message.conversationID:', message.conversationID);
        console.log('  message.conversationType:', message.conversationType);

        this.setData({
          message: '',
          sendMessageBtn: false,
        });
        this.$sendTIMMessage(message);
      } catch (error) {
        console.error('sendTextMessage: 创建消息失败:', error);
        wx.showToast({
          title: '消息发送失败，请稍后重试',
          icon: 'none',
          duration: 2000
        });
      }
    },

    // 监听输入框value值变化
    onInputValueChange(event) {
      const query = wx.createSelectorQuery().in(this);
      query.select('#textarea').boundingClientRect();
      query.exec((res) => {
        // 获取 textarea 组件的实际高度
        const { height } = res[0];
        if (this.data.textareaHeight !== height) {
          this.triggerEvent('inputHeightChange', {});
          this.setData({
            textareaHeight: height,
          });
        }
      });
      if (event.detail.message || event.detail.value) {
        this.setData({
          message: event.detail.message || event.detail.value,
          sendMessageBtn: true,
        });
      } else {
        this.setData({
          sendMessageBtn: false,
        });
      }
      event.detail.value && this.sendTypingStatusMessage();
    },

    // 发送正在输入状态消息（带防抖机制，符合IM SDK最佳实践）
    sendTypingStatusMessage() {
      // 验证conversation对象是否完整
      if (!this.data.conversation || !this.data.conversation.type) {
        console.warn('sendTypingStatusMessage: conversation对象不完整，跳过发送typing消息');
        return;
      }
      if (this.data.conversation.type === wx.TencentCloudChat.TYPES.CONV_GROUP) {
        return;
      }

      // 符合IM SDK最佳实践：防抖机制，避免频繁发送typing消息
      // 如果已有定时器，清除它
      if (this.data.typingTimer) {
        clearTimeout(this.data.typingTimer);
      }

      // 设置新的定时器，延迟1秒后发送typing消息
      this.setData({
        typingTimer: setTimeout(() => {
          this.doSendTypingStatusMessage();
          this.setData({ typingTimer: null });
        }, 1000) // 1秒内只发送一次typing消息
      });
    },

    // 实际发送typing消息的内部方法
    doSendTypingStatusMessage() {
      const to = this.getToAccount();
      const { BUSINESS_ID_TEXT, FEAT_NATIVE_CODE } = constant;
      // 创建正在输入状态消息, "typingStatus":1,正在输入中1,  输入结束0, "version": 1 兼容老版本,userAction:0, // 14表示正在输入,actionParam:"EIMAMSG_InputStatus_Ing" //"EIMAMSG_InputStatus_Ing" 表示正在输入, "EIMAMSG_InputStatus_End" 表示输入结束
      const typingMessage = wx.$TUIKit.createCustomMessage({
        to: to,
        conversationType: this.data.conversation.type,
        payload: {
          data: JSON.stringify({
            businessID: BUSINESS_ID_TEXT.USER_TYPING,
            typingStatus: FEAT_NATIVE_CODE.ISTYPING_STATUS,
            version: FEAT_NATIVE_CODE.NATIVE_VERSION,
            userAction: FEAT_NATIVE_CODE.ISTYPING_ACTION,
            actionParam: constant.TYPE_INPUT_STATUS_ING,
          }),
          description: '',
          extension: '',
        },
        cloudCustomData: JSON.stringify({
          messageFeature: {
            needTyping: FEAT_NATIVE_CODE.FEAT_TYPING,
            version: FEAT_NATIVE_CODE.NATIVE_VERSION,
          },
        }),
      });
      // 关键：直接更新 message 对象的 to 字段为标准化的 ID
      if (typingMessage && typingMessage.to !== to) {
        console.log('sendTypingStatusMessage: 更新message.to');
        console.log('  原始:', typingMessage.to);
        console.log('  标准化后:', to);
        typingMessage.to = to;
      }
        // 在消息列表中过滤出对方的消息，并且获取最新消息的时间。
      const inList =  this.data.messageList.filter(item => item.flow === 'in');
      if (inList.length === 0) return;
      const sortList = inList.sort((firstItem, secondItem) => secondItem.time - firstItem.time);
      const newMessageTime = sortList[0].time * 1000;
      // 发送正在输入状态消息的触发条件。
      const isSendTypingMessage = this.data.messageList.every((item) => {
        try {
          const sendTypingMessage = JSON.parse(item.cloudCustomData);
          return sendTypingMessage.messageFeature.needTyping;
        } catch (error) {
          return false;
        }
      });
        // 获取当前编辑时间，与收到对方最新的一条消息时间相比，时间小于30s则发送正在输入状态消息/
      const now = new Date().getTime();
      const timeDifference =  (now  - newMessageTime);

      if (isSendTypingMessage && timeDifference > (1000 * 30)) return;
      if (this.data.isFirstSendTyping) {
        this.$sendTypingMessage(typingMessage);
        this.setData({
          isFirstSendTyping: false,
        });
      } else {
        this.data.time = setTimeout(() => {
          this.$sendTypingMessage(typingMessage);
        }, (1000 * 4));
      }
    },

    // 监听是否获取焦点，有焦点则向父级传值，动态改变input组件的高度。
    inputBindFocus(event) {
      const inputEvent = event;
      // 兼容(webview 渲染模式正常) skyline 渲染模式下，键盘高度失效，event.detail.height = 0;
      inputEvent.detail.height = inputEvent.detail.height > 0 ? inputEvent.detail.height : 350;
      this.setData({
        focus: true,
      });
      
      // 验证conversation对象是否完整，避免getMessageList参数错误
      if (this.data.conversation && this.data.conversation.conversationID) {
        this.getMessageList(this.data.conversation);
      } else {
        console.warn('inputBindFocus: conversation对象不完整，跳过getMessageList调用');
      }
      
      this.triggerEvent('pullKeysBoards', {
        event: inputEvent,
      });
      // 有焦点则关闭除键盘之外的操作界面，例如表情组件。
      this.handleClose();
    },

    // 监听是否失去焦点
    inputBindBlur(event) {
      // 验证conversation对象是否完整
      if (!this.data.conversation || !this.data.conversation.type) {
        console.warn('inputBindBlur: conversation对象不完整，跳过发送typing消息');
        return;
      }
      const { BUSINESS_ID_TEXT, FEAT_NATIVE_CODE } = constant;
      const typingMessage = wx.$TUIKit.createCustomMessage({
        to: this.getToAccount(),
        conversationType: this.data.conversation.type,
        payload: {
          data: JSON.stringify({
            businessID: BUSINESS_ID_TEXT.USER_TYPING,
            typingStatus: FEAT_NATIVE_CODE.NOTTYPING_STATUS,
            version: FEAT_NATIVE_CODE.NATIVE_VERSION,
            userAction: FEAT_NATIVE_CODE.NOTTYPING_ACTION,
            actionParam: constant.TYPE_INPUT_STATUS_END,
          }),
          cloudCustomData: JSON.stringify({ messageFeature:
              {
                needTyping: FEAT_NATIVE_CODE.FEAT_TYPING,
                version: FEAT_NATIVE_CODE.NATIVE_VERSION,
              },
          }),
          description: '',
          extension: '',
        },
      });
      this.$sendTypingMessage(typingMessage);
      this.setData({
        isFirstSendTyping: true,
      });
      clearTimeout(this.data.time);
      this.triggerEvent('downKeysBoards', {
        event,
      });
    },

    $handleSendTextMessage(event) {
      this.sendTextMessage(event.detail.message, true);
      this.setData({
        displayCommonWords: false,
      });
    },

    $handleSendCustomMessage(e) {
      // 验证会话对象是否完整
      if (!this.data.conversation || !this.data.conversation.type) {
        console.warn('$handleSendCustomMessage: conversation对象不完整，无法发送消息');
        wx.showToast({
          title: '会话未准备好，请稍后重试',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      const to = this.getToAccount();
      
      // 验证to参数是否有效
      if (!to || to.trim() === '') {
        console.warn('$handleSendCustomMessage: to参数无效，无法发送消息');
        wx.showToast({
          title: '无法确定接收方，请稍后重试',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      try {
        const message = wx.$TUIKit.createCustomMessage({
          to: to,
          conversationType: this.data.conversation.type,
          payload: e.detail.payload,
        });
        // 关键：直接更新 message 对象的 to 字段为标准化的 ID
        if (message && message.to !== to) {
          console.log('$handleSendCustomMessage: 更新message.to');
          console.log('  原始:', message.to);
          console.log('  标准化后:', to);
          message.to = to;
        }
        this.$sendTIMMessage(message);
        this.setData({
          displayOrderList: false,
          displayCommonWords: false,
        });
      } catch (error) {
        console.error('$handleSendCustomMessage: 创建自定义消息失败:', error);
        wx.showToast({
          title: '消息发送失败，请稍后重试',
          icon: 'none',
          duration: 2000
        });
      }
    },

    $handleCloseCards(e) {
      switch (e.detail.key) {
        case '0':
          this.setData({
            displayCommonWords: false,
          });
          break;
        case '1':
          this.setData({
            displayOrderList: false,
          });
          break;
        case '2':
          this.setData({
            displayServiceEvaluation: false,
          });
          break;
        default:
          break;
      }
    },
    // 发送正在输入消息
    $sendTypingMessage(message) {
      if (this.data.conversation.type === wx.TencentCloudChat.TYPES.CONV_GROUP) {
        return;
      }

      // 关键：确保 message.to 字段使用标准化的用户 ID
      const to = this.getToAccount();
      if (message && message.to !== to) {
        console.log('$sendTypingMessage: 修正message.to字段');
        console.log('  原始:', message.to);
        console.log('  标准化后:', to);
        message.to = to;
      }

      wx.$TUIKit.sendMessage(message, {
        onlineUserOnly: true,
      });
    },

    /**
     * 等待SDK就绪（符合IM SDK规范要求）
     * 所有SDK API调用前必须等待SDK_READY事件
     */
    async waitForSDKReady() {
      // 如果SDK已经就绪，直接返回
      if (wx.$IMManager && wx.$IMManager.isReady()) {
        return true;
      }

      // 如果SDK管理器不存在，返回false
      if (!wx.$IMManager) {
        console.warn('waitForSDKReady: IM管理器未初始化');
        return false;
      }

      // 等待SDK就绪
      console.log('waitForSDKReady: 等待SDK就绪...');
      try {
        const isReady = await wx.$IMManager.waitForReady(5000); // 最多等待5秒
        if (isReady) {
          console.log('waitForSDKReady: SDK已就绪');
        } else {
          console.warn('waitForSDKReady: SDK就绪超时');
        }
        return isReady;
      } catch (error) {
        console.error('waitForSDKReady: 等待SDK就绪失败:', error);
        return false;
      }
    },

    $sendTIMMessage(message, retryCount = 0) {
      // 符合IM SDK规范：发送消息前等待SDK就绪
      this.waitForSDKReady().then((isReady) => {
        if (!isReady) {
          console.warn('$sendTIMMessage: SDK未就绪，无法发送消息');
          wx.showToast({
            title: 'SDK未就绪，请稍后重试',
            icon: 'none',
            duration: 2000
          });
          return;
        }

        // 关键：确保 message.to 字段使用标准化的用户 ID
        const to = this.getToAccount();
        if (message && message.to !== to) {
          console.log('$sendTIMMessage: 修正message.to字段');
          console.log('  原始:', message.to);
          console.log('  标准化后:', to);
          message.to = to;
        }

        console.log('$sendTIMMessage: 开始发送消息');
        console.log('  message:', message);
        console.log('  message.to:', message.to);
        console.log('  message.conversationID:', message.conversationID);

        this.triggerEvent('sendMessage', {
          message,
        });
        wx.$TUIKit.sendMessage(message, {
          offlinePushInfo: {
            disablePush: true,
          },
        }).then((res) => {
          // 发送成功，重置重试计数器
          console.log('$sendTIMMessage: 消息发送成功');
          console.log('  res:', res);
          this.setData({ messageRetryCount: 0 });
          this.triggerEvent('sendMessage', {
            message: res.data.message,
          });
          
          console.log('$sendTIMMessage: 消息发送成功，使用IM SDK存储');
          console.log('  消息ID:', res.data.message.ID);
          console.log('  会话ID:', res.data.message.conversationID);
        }).catch((error) => {
          console.error('$sendTIMMessage: 消息发送失败:', error);

          // 符合IM SDK规范：智能错误处理和自动重试
          const shouldRetry = this.shouldRetryOnError(error, retryCount);

          if (shouldRetry) {
            const newRetryCount = retryCount + 1;
            console.log(`$sendTIMMessage: 准备第${newRetryCount}次重试`);

            // 延迟1秒后重试
            setTimeout(() => {
              this.$sendTIMMessage(message, newRetryCount);
            }, 1000);
          } else {
            // 不重试或超过最大重试次数，显示错误
            this.triggerEvent('showMessageErrorImage', {
              showErrorImageFlag: error.code,
              message,
            });

            // 符合IM SDK规范：友好的错误提示
            this.showUserFriendlyError(error, message.to);
          }
        });
        this.setData({
          displayFlag: '',
        });
      });
    },
    
    /**
     * 判断是否应该重试（符合IM SDK规范）
     * @param {Object} error 错误对象
     * @param {number} currentRetryCount 当前重试次数
     * @returns {boolean} 是否应该重试
     */
    shouldRetryOnError(error, currentRetryCount) {
      // 检查是否超过最大重试次数
      if (currentRetryCount >= this.data.maxRetryCount) {
        console.log('$sendTIMMessage: 已达到最大重试次数，不再重试');
        return false;
      }

      // 符合IM SDK规范：只对特定错误码进行重试
      const retryableErrorCodes = [
        70051, // 网络错误
        70163, // 超时
      ];

      const errorCode = error.code || error.data?.code;
      const shouldRetry = retryableErrorCodes.includes(errorCode);

      if (shouldRetry) {
        console.log(`$sendTIMMessage: 错误码${errorCode}可重试`);
      } else {
        console.log(`$sendTIMMessage: 错误码${errorCode}不可重试`);
      }

      return shouldRetry;
    },

    /**
     * 显示友好的错误提示（符合IM SDK规范）
     * @param {Object} error 错误对象
     */
    showUserFriendlyError(error, receiver) {
      const errorCode = error.code || error.data?.code;
      let errorMessage = '消息发送失败，请稍后重试';

      // 符合IM SDK规范：根据错误码提供精确的提示
      switch (errorCode) {
        case 20003:
          errorMessage = '用户ID无效，无法发送消息';
          console.error('MessageInput: 发送者或接收者ID无效:', {
            sender: wx.$IMManager?.getCurrentUser()?.userID || '未知',
            receiver: receiver || error.data?.to || '未知'
          });
          break;
        case 70001:
          errorMessage = 'SDK未就绪，请稍后再试';
          break;
        case 70009:
          errorMessage = '登录已过期，请重新登录';
          break;
        case 70051:
          errorMessage = '网络连接失败，请检查网络';
          break;
        case 70163:
          errorMessage = '请求超时，请重试';
          break;
        default:
          if (error.message) {
            console.error('MessageInput: 发送消息失败:', error.message);
          }
      }

      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 2000
      });
    },

    handleClose() {
      this.setData({
        displayFlag: '',
      });
    },

    handleServiceEvaluation() {
      this.setData({
        displayServiceEvaluation: true,
      });
    },

    // 发送位置消息
    async handleSendLocation() {
      try {
        // 引入腾讯地图SDK
        const QQMap = require('../../../utils/qqmap');

        // 调用位置选择
        wx.showLoading({
          title: '选择位置...',
          mask: true
        });

        const location = await QQMap.chooseLocation();

        wx.hideLoading();

        if (!location) {
          // 用户取消选择
          return;
        }

        // 验证会话对象是否完整
        if (!this.data.conversation || !this.data.conversation.type) {
          console.warn('handleSendLocation: conversation对象不完整，无法发送位置消息');
          wx.showToast({
            title: '会话未准备好，请稍后重试',
            icon: 'none',
            duration: 2000
          });
          return;
        }

        const to = this.getToAccount();

        // 验证to参数是否有效
        if (!to || to.trim() === '') {
          console.warn('handleSendLocation: to参数无效，无法发送消息');
          wx.showToast({
            title: '无法确定接收方，请稍后重试',
            icon: 'none',
            duration: 2000
          });
          return;
        }

        // 创建位置消息
        const message = wx.$TUIKit.createLocationMessage({
          to,
          conversationType: this.data.conversation.type,
          payload: {
            description: location.address || location.name,
            longitude: String(location.longitude),
            latitude: String(location.latitude)
          }
        });

        // 关键：直接更新 message 对象的 to 字段为标准化的 ID
        if (message && message.to !== to) {
          console.log('handleSendLocation: 更新message.to');
          console.log('  原始:', message.to);
          console.log('  标准化后:', to);
          message.to = to;
        }

        // 发送消息
        this.$sendTIMMessage(message);

        // 关闭扩展面板
        this.setData({
          displayFlag: ''
        });

        console.log('handleSendLocation: 位置消息发送成功', location);
      } catch (error) {
        wx.hideLoading();
        console.error('handleSendLocation: 发送位置失败', error);
        wx.showToast({
          title: '发送位置失败',
          icon: 'none'
        });
      }
    },

    // 符合IM SDK规范：组件销毁时清理资源
    detached() {
      // 清理typing定时器，防止内存泄漏
      if (this.data.typingTimer) {
        clearTimeout(this.data.typingTimer);
        this.setData({ typingTimer: null });
        console.log('MessageInput: 清理typing定时器');
      }
    },
  },
});
