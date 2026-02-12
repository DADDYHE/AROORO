// pages/messages/chat/chat.js
import MessageService from '../../../../utils/messageService'
import RoleManager from '../../../../utils/roleManager'
const ImUserIdValidator = require('../../../../utils/imUserIdValidator')
const imManager = require('../../../../utils/im-manager')
import loginModule from '../../../../src/modules/auth/index'

Page({
  /**
   * 页面的初始数据
   */
  data: {
    conversationID: '',  // 会话ID
    conversationName: '聊天',
    isIMInitialized: false,
    isIMLogin: false,
    conversation: null,
    receiverId: '',
    receiverRole: '',
    recipientAvatar: '', // 接收者头像URL（传递给TUIChat组件）
    isConversationIDValid: false // 会话ID是否有效
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('聊天页面onLoad触发', options);
    
    // 注册角色变化回调
    this.roleChangeCallbackId = RoleManager.registerRoleChangeCallback(this.handleRoleChange.bind(this))
    
    // 正确绑定SDK就绪回调
    if (wx.$TUIKit) {
      console.log('绑定SDK就绪回调');
      // 使用bind方法确保this的指向正确
      this.onSDKReadyCallback = this.onSDKReady.bind(this);
      wx.$TUIKit.on('SDK_READY', this.onSDKReadyCallback);
    }
    
    // 从页面参数获取会话ID或创建会话ID
    let conversationID = '';
    let conversationName = '';
    let receiverId = '';
    let receiverRole = '';
    
    // 兼容不同的参数格式
    if (options) {
      if (options.conversationID) {
          // 情况1：直接提供了conversationID（从会话列表跳转）
          conversationID = String(options.conversationID).trim();
          console.log('原始conversationID:', conversationID);
          
          // 修复conversationID格式
          if (conversationID.startsWith('C2C') && !conversationID.startsWith('C2C_')) {
            // C2C开头但没有下划线，添加下划线
            conversationID = 'C2C_' + conversationID.substring(3);
            console.log('修复后的conversationID:', conversationID);
          }
          
          // 从会话列表跳转过来的conversationID已经是有效的，不需要标准化
          // 避免对有效的接收者ID进行不必要的修改
          console.log('从会话列表获取的conversationID，保持原样:', conversationID);
          
          // 如果提供了会话名称，设置导航栏标题
          if (options.conversationName) {
            conversationName = decodeURIComponent(options.conversationName);
            wx.setNavigationBarTitle({ title: conversationName });
          }
        } else if (options.recipientId) {
        // 情况2：提供了recipientId（从其他页面跳转，需要创建会话ID）
        const rawReceiverId = String(options.recipientId).trim();
        console.log('[Chat] 原始接收者ID:', rawReceiverId);

        // 验证并规范化 userID
        const validation = ImUserIdValidator.validateUserID(rawReceiverId);
        
        // 检查是否已经是格式1的ID（prefix_hash_identifier）
        const parts = rawReceiverId.split('_');
        console.log('[Chat] 分割后的parts:', parts);
        
        // 简化的格式1检查逻辑
        const hasValidPrefix = parts.length >= 2 && ['own', 'hst', 'gst', 'owner', 'host', 'guest'].includes(parts[0]);
        
        console.log('[Chat] ID格式检查:', {
          hasValidPrefix: hasValidPrefix,
          partsLength: parts.length,
          validationValid: validation.valid
        });
        
        // 直接使用传入的接收者ID，不重新生成
        // 这样可以确保使用的是数据库中存储的正确ID
        receiverId = rawReceiverId;
        console.log('[Chat] 直接使用传入的接收者ID:', receiverId);

        conversationID = `C2C_${receiverId}`; // 单聊会话ID格式：C2C_userID
        console.log('[Chat] 最终conversationID:', conversationID);
        
        // 设置会话名称和导航栏标题
        if (options.recipientName) {
          conversationName = decodeURIComponent(options.recipientName);
          wx.setNavigationBarTitle({ title: conversationName });
          console.log('设置导航栏标题:', conversationName);
        } else {
          // 如果没有提供名称，使用默认名称
          conversationName = '聊天';
          wx.setNavigationBarTitle({ title: conversationName });
          console.log('使用默认导航栏标题:', conversationName);
        }
        
        // 获取接收者角色
        if (options.recipientRole) {
          receiverRole = options.recipientRole;
        }
      } else if (options.id) {
        // 情况3：兼容其他可能的参数名
        conversationID = String(options.id).trim();
        // 设置默认导航栏标题
        conversationName = '聊天';
        wx.setNavigationBarTitle({ title: conversationName });
      }
      
      if (conversationID) {
        // 延迟设置数据，避免渲染引擎内部错误
        setTimeout(() => {
          // 检查conversationID是否有效
          const isConversationIDValid = typeof conversationID === 'string' && conversationID.trim() !== '';
          
          this.setData({
            conversationID: conversationID,
            conversationName: conversationName,
            receiverId: receiverId,
            receiverRole: receiverRole,
            isConversationIDValid: isConversationIDValid
          });
          
          console.log('会话ID已设置:', this.data.conversationID);
          console.log('会话ID是否有效:', isConversationIDValid);
          console.log('接收者ID已设置:', this.data.receiverId);
          console.log('接收者角色已设置:', this.data.receiverRole);
          console.log('当前导航栏标题:', this.data.conversationName);
        }, 100);
      } else {
        console.error('会话ID为空或无效，options:', options);
        wx.showToast({
          title: '缺少会话信息',
          icon: 'none',
          duration: 2000,
          success: () => {
            setTimeout(() => {
              wx.navigateBack();
            }, 2000);
          }
        });
        return;
      }
    } else {
      console.error('缺少页面参数options');
      wx.showToast({
        title: '缺少会话信息',
        icon: 'none',
        duration: 2000,
        success: () => {
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
        }
      });
      return;
    }
  },

  /**
   * SDK就绪后的回调函数
   */
  onSDKReady: function() {
    console.log('SDK就绪，执行初始化操作');
    // SDK就绪后执行的操作
    if (this.data.conversationID) {
      this.setConversationTitle(this.data.conversationID);
    }
  },


  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('聊天页面onShow触发');
    console.log('onShow时conversationID:', this.data.conversationID);
    console.log('onShow时conversationID类型:', typeof this.data.conversationID);
    
    // 显示加载动画
    this.showLoading();
    
    // 检查conversationID是否已设置
    const checkConversationID = () => {
      console.log('检查conversationID:', this.data.conversationID);
      console.log('检查isConversationIDValid:', this.data.isConversationIDValid);
      
      // 如果conversationID已设置且有效，执行初始化操作
      if (this.data.conversationID && this.data.isConversationIDValid) {
        console.log('conversationID已有效设置，开始初始化操作');
        // 延迟初始化，确保加载动画有足够的显示时间
        setTimeout(() => {
          this.initIMIfNeeded();
          this.initMessageListener();
          // 隐藏加载动画
          setTimeout(() => {
            this.hideLoading();
          }, 500);
        }, 300);
      } 
      // 如果conversationID已设置但无效，尝试修复
      else if (this.data.conversationID) {
        console.log('conversationID已设置但可能无效，尝试修复');
        // 确保conversationID是字符串类型
        if (typeof this.data.conversationID !== 'string') {
          console.error('onShow时发现conversationID类型错误:', this.data.conversationID);
          // 尝试修复：如果是对象，尝试获取其中的字符串值
          if (this.data.conversationID.toString) {
            this.setData({
              conversationID: this.data.conversationID.toString(),
              isConversationIDValid: true
            });
            console.log('已尝试修复conversationID:', this.data.conversationID);
            // 修复后继续初始化
            checkConversationID();
          } else {
            console.error('无法修复conversationID类型错误');
            this.hideLoading();
          }
        } 
        // conversationID是字符串但为空
        else if (this.data.conversationID.trim() === '') {
          console.error('conversationID为空字符串');
          this.hideLoading();
        } 
        // conversationID有效但isConversationIDValid为false，可能是延迟设置的问题
        else {
          console.log('conversationID有效但isConversationIDValid为false，更新isConversationIDValid');
          this.setData({
            isConversationIDValid: true
          });
          // 更新后继续初始化
          checkConversationID();
        }
      } 
      // 如果conversationID还没有被设置，等待100ms后再次检查
      else {
        console.log('conversationID还没有被设置，等待100ms后再次检查');
        setTimeout(() => {
          checkConversationID();
        }, 100);
      }
    };
    
    // 开始检查conversationID
    checkConversationID();
  },


  /**
   * 初始化消息监听器
   */
  initMessageListener() {
    console.log('初始化消息监听器');
    
    // 使用消息服务工具监听消息
    MessageService.listenForMessages((messages) => {
      console.log('收到过滤后的消息:', messages);
      // 消息会由 TUIChat 组件自动处理，这里只做日志记录
    });
  },

  /**
   * 初始化IM服务（如果需要）
   */
  initIMIfNeeded() {
    // 如果IM未初始化，显示错误信息
    if (!wx.$TUIKit) {
      console.error('IM SDK未初始化');
      wx.showToast({
        title: 'IM服务未初始化',
        icon: 'none',
        duration: 2000
      });
      this.setData({ isIMInitialized: false });
      return;
    }

    this.setData({ isIMInitialized: true });

    // 检查IM登录状态
    this.checkIMLoginStatus();

    // 注意：不需要在这里调用 loadHistoryMessages()
    // TUIChat 组件内部会自动加载历史消息，而且会等待 SDK ready
    // 如果在这里调用，会导致在 SDK 未 ready 时就调用 getMessageList，从而报错
  },

  /**
   * 加载历史消息
   */
  async loadHistoryMessages() {
    try {
      const receiverId = this.data.receiverId || this.data.conversationID.replace('C2C_', '');
      
      if (!receiverId) {
        console.warn('接收者ID为空，无法加载历史消息');
        return;
      }
      
      console.log('加载历史消息，接收者ID:', receiverId);
      
      // 使用消息服务工具获取历史消息
      const result = await MessageService.getMessages(receiverId);
      
      if (result.code === 0) {
        console.log('历史消息加载成功，消息数量:', result.data.length);
        
        // 这里可以将消息传递给聊天组件，或者在自定义聊天界面中显示
        // 由于使用了TUIChat组件，它会自动处理消息显示
      } else {
        console.error('历史消息加载失败:', result.message);
      }
    } catch (error) {
      console.error('加载历史消息时出错:', error);
    }
  },

  /**
   * 检查IM登录状态
   */
  checkIMLoginStatus() {
    // 使用标准登录模块检查登录状态
    this.tryIMLogin();
  },

  /**
   * 尝试登录IM
   */
  async tryIMLogin() {
    try {
      console.log('使用标准登录模块进行IM登录');
      
      // 调用标准登录模块的登录方法，跳过身份选择检查
      const loginResult = await loginModule.login({ skipIdentityCheck: true });
      
      if (loginResult.success) {
        console.log('IM登录成功');
        this.setData({ isIMLogin: true });
        
        // 验证并设置会话标题
        const convID = this.data.conversationID;
        console.log('登录成功后设置会话标题，conversationID:', convID);
        
        // 确保conversationID是字符串类型
        if (typeof convID === 'string' && convID.trim()) {
          console.log('登录成功后设置会话标题，conversationID有效:', convID);
          this.setConversationTitle(convID);
        } else {
          console.error('登录成功但conversationID无效:', convID);
        }
        
        // 显示登录成功提示
        wx.showToast({
          title: '消息服务已连接',
          icon: 'success',
          duration: 1500
        });
      } else {
        console.error('IM登录失败:', loginResult.message);
        wx.showToast({
          title: '消息服务连接失败',
          icon: 'none',
          duration: 2000
        });
      }
    } catch (error) {
      console.error('IM登录过程中发生错误:', error);
      wx.showToast({
        title: '消息服务连接失败',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 根据会话ID设置导航栏标题
   */
  setConversationTitle(conversationID) {
    // 验证conversationID类型和格式
    console.log('设置会话标题，conversationID类型:', typeof conversationID);
    console.log('conversationID值:', conversationID);

    // 确保conversationID是字符串类型且格式正确
    if (!conversationID || typeof conversationID !== 'string') {
      console.error('无效的conversationID:', conversationID);
      return;
    }

    // 确保conversationID不是"[object Object]"字符串
    if (conversationID === '[object Object]') {
      console.error('无效的conversationID:', conversationID);
      return;
    }

    // 尝试修复conversationID格式
    let fixedConversationID = conversationID;
    console.log('开始修复conversationID格式，原始值:', conversationID);
    
    // 检查并修复C2C格式
    if (conversationID.includes('C2C') && !conversationID.includes('C2C_')) {
      // 包含C2C但没有下划线，添加下划线
      if (conversationID.startsWith('C2C')) {
        fixedConversationID = 'C2C_' + conversationID.substring(3);
      } else {
        fixedConversationID = conversationID.replace('C2C', 'C2C_');
      }
      console.log('修复conversationID格式:', conversationID, '->', fixedConversationID);
    } else if (conversationID.includes('GROUP') && !conversationID.includes('GROUP_')) {
      // 包含GROUP但没有下划线，添加下划线
      if (conversationID.startsWith('GROUP')) {
        fixedConversationID = 'GROUP_' + conversationID.substring(5);
      } else {
        fixedConversationID = conversationID.replace('GROUP', 'GROUP_');
      }
      console.log('修复conversationID格式:', conversationID, '->', fixedConversationID);
    }
    
    // 特殊处理：如果是纯C2C格式（如C2Chst_xxx），确保格式正确
    if (conversationID.match(/^C2C[a-zA-Z0-9_]+$/)) {
      fixedConversationID = 'C2C_' + conversationID.substring(3);
      console.log('修复特殊格式conversationID:', conversationID, '->', fixedConversationID);
    }
    
    // 更新conversationID为修复后的值
    if (fixedConversationID !== conversationID) {
      conversationID = fixedConversationID;
      // 更新页面数据中的conversationID
      this.setData({
        conversationID: conversationID
      });
      console.log('已更新页面数据中的conversationID:', conversationID);
    }

    // 检查conversationID格式（C2C_开头表示单聊）
    const isC2C = conversationID.startsWith('C2C_');
    if (!isC2C && !conversationID.startsWith('GROUP_')) {
      console.warn('conversationID格式可能不正确，应为C2C_xxx或GROUP_xxx格式:', conversationID);
    } else {
      console.log('conversationID格式正确:', conversationID);
    }

    // 首先使用本地存储的会话名称
    if (this.data.conversationName) {
      wx.setNavigationBarTitle({ title: this.data.conversationName });
      console.log('使用本地存储的会话名称:', this.data.conversationName);
    }

    // 尝试从IM系统获取会话详情（可选，失败不影响用户体验）
    // 注意：必须等待SDK ready后再调用getConversationProfile
    if (wx.$TUIKit && isC2C) {
      // 先使用本地存储的会话名称
      if (this.data.conversationName) {
        wx.setNavigationBarTitle({ title: this.data.conversationName });
        console.log('使用本地存储的会话名称:', this.data.conversationName);
      }

      // 定义获取会话详情的函数
      const fetchConversationProfile = () => {
        try {
          wx.$TUIKit.getConversationProfile(conversationID)
            .then(({ data }) => {
              const conversation = data.conversation;
              let title = this.data.conversationName || '聊天';
              let recipientAvatar = this.data.recipientAvatar || '';

              if (conversation.type === 'C2C') {
                // 单聊，使用对方的昵称和头像
                const imTitle = conversation.userProfile?.nick || conversation.userProfile?.userID || conversation.conversationID.substring(4) || '未知用户';
                const imAvatar = conversation.userProfile?.avatar || '';

                // 只有当本地没有设置名称或本地名称是默认值时，才使用IM系统的名称
                if (!this.data.conversationName || this.data.conversationName === '聊天' || this.data.conversationName === '未知用户') {
                  title = imTitle;
                }

                // 只有当本地没有设置头像时，才使用IM系统的头像
                if (imAvatar && !this.data.recipientAvatar) {
                  recipientAvatar = imAvatar;
                  console.log('[Chat] 从IM系统获取接收者头像:', recipientAvatar);
                }
              } else if (conversation.type === 'GROUP') {
                // 群聊，使用群名称
                const imTitle = conversation.groupProfile?.name || conversation.groupProfile?.groupID || conversation.conversationID.substring(6) || '未知群组';
                if (!this.data.conversationName || this.data.conversationName === '群聊' || this.data.conversationName === '未知群组') {
                  title = imTitle;
                }
              }

              this.setData({
                conversationName: title,
                conversation: conversation,
                recipientAvatar: recipientAvatar // 更新接收者头像
              });
              wx.setNavigationBarTitle({ title: title });
              console.log('从IM系统获取会话详情成功，更新会话标题:', title);
              console.log('接收者头像已更新:', recipientAvatar);
            })
            .catch((error) => {
              // 代码2501表示找不到用户或群主，这是正常的（对方可能从未登录过IM）
              if (error.code === 2501) {
                console.log('对方尚未登录IM系统，使用本地会话名称');
              } else if (error.code === 3000) {
                console.log('SDK未ready，跳过获取会话详情，使用本地会话名称');
              } else {
                console.warn('获取会话详情失败:', error.message);
              }
              // 会话详情获取失败时，不影响聊天页面的正常使用
              // 已经使用了本地存储的会话名称
            });
        } catch (error) {
          console.warn('调用getConversationProfile失败:', error.message);
          // 发生异常时，已经使用了本地存储的会话名称
        }
      };

      // 检查SDK状态，如果已ready则直接调用，否则监听ready事件
      const checkSDKReady = () => {
        // 尝试多种方式检查SDK状态
        let isSDKReady = false;
        try {
          if (wx.$TUIKit.isReady && typeof wx.$TUIKit.isReady === 'function') {
            isSDKReady = wx.$TUIKit.isReady();
          }
        } catch (e) {
          // isReady方法可能不存在或调用失败
        }

        if (isSDKReady) {
          console.log('SDK已ready，直接获取会话详情');
          fetchConversationProfile();
        } else {
          console.log('SDK未ready，监听sdkReady事件后再获取会话详情');
          let hasFetched = false;

          // 定义sdkReady事件处理函数
          const onSDKReady = () => {
            if (!hasFetched) {
              hasFetched = true;
              console.log('收到SDK_READY事件，开始获取会话详情');
              wx.$TUIKit.off('SDK_READY', onSDKReady); // 取消订阅
              fetchConversationProfile();
            }
          };

          // 监听SDK_READY事件
          wx.$TUIKit.on('SDK_READY', onSDKReady);

          // 设置超时，如果20秒内SDK仍未ready，继续等待但记录日志
          setTimeout(() => {
            if (!hasFetched) {
              console.log('等待SDK_READY超时（20秒），继续等待SDK初始化完成');
              // 不要取消订阅，继续等待SDK_READY事件
              // wx.$TUIKit.off('SDK_READY', onSDKReady); // 取消订阅
            }
          }, 20000);
        }
      };

      // 开始检查SDK状态
      checkSDKReady();
    } else if (!isC2C) {
      console.warn('conversationID格式不正确，跳过获取IM会话详情');
    } else {
      console.warn('TUIKit未初始化，使用本地会话名称');
    }
  },

  /**
   * 错误处理
   * @param {Object} e - 错误事件对象
   */
  onError(e) {
    console.error('聊天界面错误:', e.detail);
    // 显示优雅的错误提示
    wx.showToast({
      title: e.detail.errorMsg || '加载失败',
      icon: 'none',
      duration: 2000,
      mask: true,
      success: () => {
        // 错误提示显示后，可以添加额外的处理逻辑
        console.log('错误提示已显示');
      }
    });
  },

  /**
   * 显示加载动画
   */
  showLoading() {
    if (!this.loadingTimer) {
      this.loadingTimer = setTimeout(() => {
        wx.showLoading({
          title: '加载中...',
          mask: true
        });
      }, 300); // 300ms延迟，避免短暂加载导致的闪烁
    }
  },

  /**
   * 隐藏加载动画
   */
  hideLoading() {
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer);
      this.loadingTimer = null;
    }
    wx.hideLoading();
  },

  /**
   * 显示成功提示
   * @param {string} message - 提示信息
   */
  showSuccess(message) {
    wx.showToast({
      title: message,
      icon: 'success',
      duration: 1500,
      mask: true
    });
  },

  /**
   * 显示警告提示
   * @param {string} message - 提示信息
   */
  showWarning(message) {
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2000,
      mask: true
    });
  },

  /**
   * 处理角色变化
   * @param {string} newRole - 新角色
   */
  handleRoleChange(newRole) {
    console.log('聊天页面角色变化:', newRole)
    // 角色变化时，重新加载历史消息，使用新角色过滤
    this.loadHistoryMessages()
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 页面卸载时，清理角色变化回调
    console.log('聊天页面卸载');
    if (this.roleChangeCallbackId) {
      RoleManager.removeRoleChangeCallback(this.roleChangeCallbackId)
    }
    
    // 移除SDK就绪监听
    if (wx.$TUIKit && this.onSDKReadyCallback) {
      console.log('移除SDK就绪回调');
      wx.$TUIKit.off('SDK_READY', this.onSDKReadyCallback);
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: `与${this.data.conversationName}的聊天`,
      path: `/subpackages/other/messages/chat/chat?conversationID=${this.data.conversationID}`
    };
  },

  /**
   * 导入用户信息到IM系统，防止2501错误
   */
  importUserProfile(userID) {
    return new Promise((resolve, reject) => {
      console.log('开始导入用户信息到IM系统，userID:', userID);

      // 获取用户详细信息
      this.getUserInfo(userID).then(userInfo => {
        if (!userInfo) {
          console.warn('无法获取用户信息，跳过导入');
          resolve();
          return;
        }

        // 检查SDK是否就绪
        if (!wx.$TUIKit) {
          console.warn('SDK未初始化，跳过用户信息导入');
          resolve();
          return;
        }

        // 检查SDK是否就绪
        let isSDKReady = false;
        try {
          if (wx.$TUIKit.isReady && typeof wx.$TUIKit.isReady === 'function') {
            isSDKReady = wx.$TUIKit.isReady();
          }
        } catch (e) {
          // isReady方法可能不存在或调用失败
        }

        if (isSDKReady) {
          // SDK已就绪，直接导入用户信息
          console.log('SDK已就绪，直接导入用户信息');
          this._updateMyProfile(userInfo).then(resolve).catch(resolve);
        } else {
          // SDK未就绪，使用更可靠的方式等待SDK就绪
          console.log('SDK未就绪，使用imSingleton检查并等待SDK就绪');
          
          // 尝试使用imSingleton
          try {
            const { imSingleton } = require('../../../../utils/imSingleton');
            if (imSingleton) {
              console.log('使用imSingleton等待SDK就绪');
              
              // 检查imSingleton的状态
              const currentState = imSingleton.getState();
              console.log('当前imSingleton状态:', currentState);
              
              // 无论imSingleton状态如何，都使用waitForReady方法确保SDK真正就绪
              console.log('使用imSingleton.waitForReady确保SDK真正就绪');
              let hasImported = false;
              
              // 使用imSingleton的waitForReady方法
              imSingleton.waitForReady(8000).then((ready) => {
                if (ready && !hasImported) {
                  hasImported = true;
                  console.log('imSingleton.waitForReady返回就绪，开始导入用户信息');
                  this._updateMyProfile(userInfo).then(resolve).catch(resolve);
                }
              }).catch((error) => {
                console.warn('waitForReady出错:', error);
                resolve();
              });
              
              // 设置超时
              setTimeout(() => {
                if (!hasImported) {
                  hasImported = true;
                  console.log('导入用户信息超时（8秒），跳过导入，不影响登录流程');
                  resolve();
                }
              }, 8000);
            } else {
              // 如果没有imSingleton，使用轮询检查
              console.log('没有imSingleton，使用轮询检查SDK状态');
              this._waitForSDKReadyWithPolling(userInfo, resolve);
            }
          } catch (error) {
            console.error('使用imSingleton时出错:', error);
            // 出错时使用轮询检查
            this._waitForSDKReadyWithPolling(userInfo, resolve);
          }
        }
      }).catch(error => {
        console.warn('获取用户信息失败，跳过导入:', error);
        resolve();
      });
    });
  },

  /**
   * 更新用户资料到IM系统
   * @private
   */
  _updateMyProfile(userInfo) {
    return new Promise((resolve, reject) => {
      // 定义实际的更新操作
      const actualUpdate = () => {
        try {
          wx.$TUIKit.updateMyProfile({
            nick: userInfo.nickName || '', // 不设置默认昵称，保留空值
            avatar: userInfo.avatarUrl || '',
            gender: userInfo.gender || 'Gender_Type_Unknown',
            allowType: 'AllowType_Type_AllowAny'
          }).then(() => {
            console.log('用户信息导入成功');
            resolve();
          }).catch(error => {
            console.warn('用户信息导入失败，但不影响登录:', error);
            // 导入失败不影响登录流程
            resolve();
          });
        } catch (error) {
          console.warn('导入用户信息时发生错误:', error);
          resolve();
        }
      };

      // 检查SDK是否真正就绪
      const checkSDKReadyAndUpdate = () => {
        try {
          let isReady = false;
          if (wx.$TUIKit && wx.$TUIKit.isReady && typeof wx.$TUIKit.isReady === 'function') {
            isReady = wx.$TUIKit.isReady();
          }
          console.log('真正的SDK就绪状态:', isReady);
          
          if (isReady) {
            // SDK真正就绪，执行更新
            actualUpdate();
          } else {
            // SDK未就绪，等待SDK_READY事件
            console.log('SDK未真正就绪，等待SDK_READY事件');
            let hasUpdated = false;
            
            const onSDKReady = () => {
              if (!hasUpdated) {
                hasUpdated = true;
                console.log('收到SDK_READY事件，执行更新操作');
                try {
                  wx.$TUIKit.off('SDK_READY', onSDKReady);
                  actualUpdate();
                } catch (error) {
                  console.warn('取消订阅事件时出错:', error);
                  actualUpdate();
                }
              }
            };
            
            // 监听SDK_READY事件
            wx.$TUIKit.on('SDK_READY', onSDKReady);
            
            // 设置超时
            setTimeout(() => {
              if (!hasUpdated) {
                hasUpdated = true;
                console.log('等待SDK_READY事件超时，跳过更新');
                try {
                  wx.$TUIKit.off('SDK_READY', onSDKReady);
                } catch (error) {
                  console.warn('取消订阅事件时出错:', error);
                }
                resolve();
              }
            }, 3000);
          }
        } catch (error) {
          console.warn('检查SDK就绪状态时出错:', error);
          resolve();
        }
      };

      // 开始检查
      checkSDKReadyAndUpdate();
    });
  },

  /**
   * 轮询检查SDK就绪状态
   */
  _waitForSDKReadyWithPolling(userInfo, resolve) {
    let pollingCount = 0;
    const maxPollingAttempts = 20;
    
    const pollingInterval = setInterval(() => {
      pollingCount++;
      console.log('轮询检查SDK就绪状态，尝试次数:', pollingCount);
      
      try {
        let isReady = false;
        
        // 检查SDK是否就绪
        if (wx.$TUIKit && wx.$TUIKit.isReady && typeof wx.$TUIKit.isReady === 'function') {
          isReady = wx.$TUIKit.isReady();
          console.log('SDK就绪状态:', isReady);
        } else {
          console.warn('无法检查SDK就绪状态，缺少isReady方法');
        }
        
        if (isReady) {
          clearInterval(pollingInterval);
          console.log('轮询检测到SDK就绪，开始导入用户信息');
          this._updateMyProfile(userInfo).then(resolve).catch(resolve);
        }
      } catch (error) {
        console.warn('轮询检查出错:', error);
      }
      
      if (pollingCount >= maxPollingAttempts) {
        clearInterval(pollingInterval);
        console.log('轮询超时，跳过用户信息导入');
        resolve();
      }
    }, 250); // 250ms一次轮询，总共5秒
  },

  /**
   * 获取用户详细信息
   */
  getUserInfo(userID) {
    return new Promise((resolve, reject) => {
      // 尝试从本地存储获取用户信息
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo) {
        console.log('从本地存储获取用户信息成功');
        resolve(userInfo);
        return;
      }
      
      // 本地存储没有用户信息，使用默认信息
      console.warn('本地存储没有用户信息，使用默认信息');
      resolve({
        nickName: '', // 不设置默认昵称，保留空值
        avatarUrl: '',
        gender: 'Gender_Type_Unknown'
      });
    });
  }
})