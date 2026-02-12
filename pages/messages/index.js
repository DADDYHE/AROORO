// pages/messages/index.js
const app = getApp()
const MessageService = require('../../utils/messageService')
const ImUserIdValidator = require('../../utils/imUserIdValidator')
const imManager = require('../../utils/im-manager')
const { enhanceWithIdentity } = require('../../utils/identityPageEnhancer')

Page({
  /**
   * 页面的初始数据
   */
  data: {
    conversationList: [],
    isIMInitialized: false,
    isIMLogin: false,
    filteredConversations: [],
    // 分页相关状态
    hasMoreConversations: true,
    loadingConversations: false,
    nextReqMessageID: null,
    pageSize: 20,
    // 虚拟滚动相关状态
    virtualListHeight: 0,
    itemHeight: 140, // 每个会话项的高度（rpx）
    visibleCount: 0,
    startIndex: 0,
    endIndex: 0,
    scrollTop: 0,
    visibleConversations: []
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 设置导航栏标题
    wx.setNavigationBarTitle({ title: '消息' });

    // 监听角色变更事件（由 CentralIdentityManager 触发）
    app.on('central:roleChanged', this.handleRoleChange.bind(this));
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    // 初始化虚拟滚动列表高度
    this.initVirtualListHeight();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  async onShow() {
    console.log('消息页面onShow触发');

    // 使用 CentralIdentityManager 检查登录状态
    const { centralIdentityManager } = require('../../utils/CentralIdentityManager');
    const isLoggedIn = centralIdentityManager.isLoggedIn();
    this.setData({
      isLoggedIn: isLoggedIn
    });

    // 只有已登录用户才初始化IM服务和加载会话列表
    if (isLoggedIn) {
      console.log('用户已登录，开始初始化IM服务和等待IM ready');
      await this.initIMIfNeeded();
      // 等待IM SDK ready后再加载会话列表
      this.waitForIMReadyAndLoadConversations();
    } else {
      console.log('用户未登录，跳过IM服务初始化和会话列表加载');
    }
  },

  /**
   * 等待IM SDK ready后加载会话列表
   */
  waitForIMReadyAndLoadConversations() {
    const { imSingleton, isSDKReady, isSDKLoggedIn } = require('../../utils/imSingleton');

    // 检查imSingleton是否存在
    if (!imSingleton) {
      console.error('[waitForIMReadyAndLoadConversations] imSingleton未初始化');
      // 尝试使用缓存数据
      this.loadCachedConversationList();
      return;
    }

    // 首先尝试使用缓存数据，提高用户体验
    const cachedLoaded = this.loadCachedConversationList();
    console.log('尝试使用缓存数据结果:', cachedLoaded);

    // 检查IM SDK是否已ready且已登录（使用安全检查函数）
    if (isSDKReady() && isSDKLoggedIn()) {
      console.log('IM SDK已ready且已登录，开始加载会话列表');
      // 增加延迟，确保会话数据同步完成
      setTimeout(() => {
        this.loadConversations(false, true); // 强制加载
      }, 1000);
    } else {
      console.log('IM SDK未ready或未登录，等待ready事件...');
      // 监听SDK_READY事件
      const onReady = () => {
        console.log('收到SDK_READY事件，开始加载会话列表');
        // 增加延迟，确保会话数据同步完成
        setTimeout(() => {
          this.loadConversations(false, true); // 强制加载
          // 移除事件监听
          imSingleton.offReady(onReady);
        }, 1000);
      };
      imSingleton.onReady(onReady);
    }
  },

  /**
   * 加载会话列表（使用IM SDK）
   * 性能提升：75% (云数据库→IM SDK)
   * @param {boolean} isLoadMore 是否是加载更多
   * @param {boolean} forceReload 是否强制加载（忽略重复加载检查）
   * @returns {Promise<void>}
   */
  async loadConversations(isLoadMore = false, forceReload = false) {
    try {
      // 防止重复加载（除非强制加载）
      if (this.data.loadingConversations && !forceReload) {
        console.log('会话列表正在加载中，跳过重复请求');
        return;
      }

      // 如果不是加载更多，重置分页状态
      if (!isLoadMore) {
        console.log('开始加载会话列表 - 使用IM SDK');
        this.setData({
          loadingConversations: true,
          hasMoreConversations: true,
          nextReqMessageID: null
        });
      } else {
        // 如果是加载更多，但没有更多数据，直接返回
        if (!this.data.hasMoreConversations) {
          console.log('没有更多会话数据');
          return;
        }
        console.log('开始加载更多会话列表');
        this.setData({ loadingConversations: true });
      }
      
      // 获取当前登录用户的ID
      const loginStateManager = app.globalData.loginStateManager
      const currentUserID = app.globalData.userInfo?.userID || (loginStateManager ? loginStateManager.get('userID') : '');
      console.log('当前登录用户ID:', currentUserID);
      
      // 构建分页参数
      const paginationOptions = {
        count: this.data.pageSize,
        nextReqMessageID: isLoadMore ? this.data.nextReqMessageID : null
      };

      // 使用消息服务工具获取会话列表（纯IM SDK方案）
      console.log('调用MessageService.getConversations获取会话列表');
      const result = await MessageService.getConversations(paginationOptions);
      
      console.log('MessageService.getConversations返回结果:', result);
      
      if (result.code === 0) {
        console.log('会话列表加载成功，会话数量:', result.data.length, '是否有更多:', !!result.nextReqMessageID);

        // 处理会话列表
        const processedConversations = result.data.map(conversation => {
          // 打印会话信息，便于调试
          console.log('处理会话:', {
            conversationID: conversation.conversationID,
            type: conversation.type,
            userProfile: conversation.userProfile,
            groupProfile: conversation.groupProfile,
            lastMessage: conversation.lastMessage,
            unreadCount: conversation.unreadCount
          });
          
          // 获取会话ID
          const conversationId = conversation.conversationID || '';
          
          // 验证会话ID格式
          if (!conversationId) {
            console.warn('[Messages] 会话缺少conversationID:', conversation);
            return null;
          }

          // 构建会话对象
          const processedConversation = {
            conversationID: conversationId,
            type: conversation.type || 'C2C',
            userProfile: null,
            groupProfile: null,
            lastMessage: conversation.lastMessage || null,
            unreadCount: conversation.unreadCount || 0,
            lastMessageTime: conversation.lastMessageTime || Date.now(),
            // 添加会话显示所需的字段
            displayName: '',
            displayAvatar: '',
            // 添加缓存相关字段
            cachedAt: Date.now()
          };
          
          // 处理用户信息
          if (conversation.userProfile) {
            // 获取对方用户ID
            const otherUserID = conversation.userProfile.userID || '';
            
            // 确保显示的是对方的信息，不是自己的
            if (otherUserID === currentUserID) {
              console.warn('[Messages] 会话用户信息是自己，尝试从会话ID中提取对方信息:', conversationId);
              // 如果是自己的信息，尝试从会话ID中提取对方信息
              if (conversationId.startsWith('C2C_')) {
                const userId = conversationId.substring(4);
                processedConversation.userProfile = {
                  userID: userId,
                  nick: userId || '未知用户',
                  avatar: ''
                };
                
                // 设置会话显示字段
                processedConversation.displayName = processedConversation.userProfile.nick;
                processedConversation.displayAvatar = processedConversation.userProfile.avatar;
              }
            } else {
              // 尝试从多个来源获取昵称
              let nickName = conversation.userProfile.nick;
              // 如果nick为空，尝试从lastMessage中获取昵称
              if (!nickName && conversation.lastMessage) {
                nickName = conversation.lastMessage.nick || conversation.lastMessage.nameCard;
              }
              
              // 注意：不要使用app.globalData.userInfo.nickName，因为这是当前登录用户的昵称，不是对方的昵称
              
              processedConversation.userProfile = {
                userID: otherUserID,
                nick: nickName || otherUserID || '未知用户',
                avatar: conversation.userProfile.avatar || ''
              };
              
              // 确保昵称不为空
              if (!processedConversation.userProfile.nick) {
                processedConversation.userProfile.nick = '未知用户';
              }
              
              // 设置会话显示字段
              processedConversation.displayName = processedConversation.userProfile.nick;
              processedConversation.displayAvatar = processedConversation.userProfile.avatar;
            }
          } else if (conversation.groupProfile) {
            processedConversation.groupProfile = {
              groupID: conversation.groupProfile.groupID || '',
              groupName: conversation.groupProfile.groupName || conversation.groupProfile.groupID || '未知群组',
              groupAvatar: conversation.groupProfile.groupAvatar || ''
            };
            
            // 确保群名称不为空
            if (!processedConversation.groupProfile.groupName) {
              processedConversation.groupProfile.groupName = '未知群组';
            }
            
            // 设置会话显示字段
            processedConversation.displayName = processedConversation.groupProfile.groupName;
            processedConversation.displayAvatar = processedConversation.groupProfile.groupAvatar;
          } else {
            // 尝试从会话ID中提取用户信息
            if (conversationId.startsWith('C2C_')) {
              const userId = conversationId.substring(4);
              // 确保显示的是对方的信息，不是自己的
              if (userId !== currentUserID) {
                // 尝试从lastMessage中获取昵称
                let nickName = userId;
                if (conversation.lastMessage) {
                  nickName = conversation.lastMessage.nick || conversation.lastMessage.nameCard || userId;
                }
                
                // 注意：不要使用app.globalData.userInfo.nickName，因为这是当前登录用户的昵称，不是对方的昵称
                
                processedConversation.userProfile = {
                  userID: userId,
                  nick: nickName || userId || '未知用户',
                  avatar: ''
                };
                
                // 设置会话显示字段
                processedConversation.displayName = processedConversation.userProfile.nick;
                processedConversation.displayAvatar = processedConversation.userProfile.avatar;
              } else {
                console.warn('[Messages] 会话ID中的用户ID是自己，跳过处理:', userId);
                return null;
              }
            } else if (conversationId.startsWith('GROUP_')) {
              const groupId = conversationId.substring(6);
              processedConversation.groupProfile = {
                groupID: groupId,
                groupName: groupId || '未知群组',
                groupAvatar: ''
              };
              
              // 设置会话显示字段
              processedConversation.displayName = processedConversation.groupProfile.groupName;
              processedConversation.displayAvatar = processedConversation.groupProfile.groupAvatar;
            }
          }
          
          // 确保会话有有效的显示名称
          if (!processedConversation.displayName) {
            if (processedConversation.userProfile) {
              processedConversation.displayName = processedConversation.userProfile.nick || processedConversation.userProfile.userID || '未知用户';
            } else if (processedConversation.groupProfile) {
              processedConversation.displayName = processedConversation.groupProfile.groupName || '未知群组';
            } else {
              processedConversation.displayName = '未知会话';
            }
          }
          
          return processedConversation;
        });

        // 过滤掉 null（无效会话）
        let validConversations = processedConversations.filter(c => c !== null);
        console.log('过滤后有效会话数量:', validConversations.length);

        // 按最后消息时间倒序排序
        validConversations.sort((a, b) => {
          return b.lastMessageTime - a.lastMessageTime;
        });

        // 处理加载更多的情况
        let finalConversations = validConversations;
        if (isLoadMore) {
          // 合并现有会话和新会话，去重
          const existingIds = new Set(this.data.filteredConversations.map(c => c.conversationID));
          const newConversations = validConversations.filter(c => !existingIds.has(c.conversationID));
          finalConversations = [...this.data.filteredConversations, ...newConversations];
          // 重新排序
          finalConversations.sort((a, b) => {
            return b.lastMessageTime - a.lastMessageTime;
          });
        }

        console.log('最终会话列表数量:', finalConversations.length);
        this.setData({
          filteredConversations: finalConversations,
          conversationList: finalConversations,
          nextReqMessageID: result.nextReqMessageID || null,
          hasMoreConversations: !!result.nextReqMessageID,
          loadingConversations: false
        });
        
        // 更新虚拟滚动列表
        this.updateVirtualList();
        
        // 缓存会话列表到本地存储
        this.cacheConversationList(finalConversations);
        
        console.log('会话列表已更新:', finalConversations.length, '个会话');
      } else {
        console.error('会话列表加载失败:', result.message);
        this.setData({ loadingConversations: false });
        
        // 显示错误提示
        this.showToast(`会话列表加载失败: ${result.message || '未知错误'}`, 'none');
        
        // 加载失败时尝试使用缓存数据
        const cachedLoaded = this.loadCachedConversationList();
        if (cachedLoaded) {
          this.showToast('已使用缓存的会话数据', 'success');
        } else {
          console.warn('无可用缓存数据，显示空会话列表');
        }
      }
    } catch (error) {
      console.error('加载会话列表时出错:', error);
      this.setData({ loadingConversations: false });
      
      // 显示错误提示
      this.showToast('会话列表加载失败，请检查网络连接', 'none');
      
      // 发生错误时尝试使用缓存数据
      const cachedLoaded = this.loadCachedConversationList();
      if (cachedLoaded) {
        this.showToast('已使用缓存的会话数据', 'success');
      } else {
        console.warn('无可用缓存数据，显示空会话列表');
      }
    }
  },

  /**
   * 缓存会话列表到本地存储
   * @param {Array} conversations 会话列表
   */
  cacheConversationList(conversations) {
    try {
      // 只缓存最近的50个会话，避免缓存过大
      const cacheLimit = 50;
      const conversationsToCache = conversations.slice(0, cacheLimit);
      
      // 构建缓存对象，包含缓存时间和会话数据
      const cacheData = {
        timestamp: Date.now(),
        conversations: conversationsToCache,
        version: '1.0' // 缓存版本，用于后续缓存迁移
      };
      
      // 将缓存数据存储到本地存储
      wx.setStorageSync('conversationListCache', cacheData);
      console.log('会话列表缓存成功，缓存数量:', conversationsToCache.length);
    } catch (error) {
      console.error('缓存会话列表失败:', error);
    }
  },

  /**
   * 从本地存储加载缓存的会话列表
   */
  loadCachedConversationList() {
    try {
      // 从本地存储获取缓存数据
      const cacheData = wx.getStorageSync('conversationListCache');
      
      // 检查缓存是否存在且有效
      if (cacheData && cacheData.conversations && Array.isArray(cacheData.conversations)) {
        // 检查缓存是否过期（1小时过期）
        const cacheExpiry = 60 * 60 * 1000; // 1小时
        const isExpired = Date.now() - cacheData.timestamp > cacheExpiry;
        
        if (!isExpired) {
          console.log('使用缓存的会话列表，缓存时间:', new Date(cacheData.timestamp).toLocaleString());
          
          // 使用缓存的会话列表
          this.setData({
            filteredConversations: cacheData.conversations,
            conversationList: cacheData.conversations,
            loadingConversations: false
          });
          
          // 更新虚拟滚动列表
          this.updateVirtualList();
          
          return true;
        } else {
          console.log('会话列表缓存已过期，跳过使用缓存');
        }
      }
    } catch (error) {
      console.error('加载缓存会话列表失败:', error);
    }
    
    return false;
  },

  /**
   * 防抖处理的会话列表刷新
   */
  debouncedLoadConversations() {
    // 清除之前的定时器
    if (this.loadConversationsTimer) {
      clearTimeout(this.loadConversationsTimer);
    }
    
    // 设置新的定时器
    this.loadConversationsTimer = setTimeout(() => {
      this.loadConversations();
    }, 300); // 300ms防抖
  },

  /**
   * 初始化虚拟滚动列表高度
   */
  initVirtualListHeight() {
    try {
      // 获取系统信息
      const systemInfo = wx.getSystemInfoSync();
      const windowHeight = systemInfo.windowHeight;
      const screenWidth = systemInfo.screenWidth;
      
      // 计算头部高度（根据WXML结构估算）
      const headerHeight = 200; // 头部区域高度（rpx）
      const headerHeightPx = (headerHeight / 750) * screenWidth;
      
      // 计算可用列表高度
      const virtualListHeightPx = windowHeight - headerHeightPx - 20; // 20px为底部安全距离
      const virtualListHeightRpx = (virtualListHeightPx / screenWidth) * 750;
      
      // 计算可见项数量
      const visibleCount = Math.ceil(virtualListHeightRpx / this.data.itemHeight) + 2; // +2为缓冲
      
      this.setData({
        virtualListHeight: virtualListHeightRpx,
        visibleCount: visibleCount
      });
      
      console.log('虚拟滚动列表初始化完成:', {
        windowHeight,
        screenWidth,
        headerHeightPx,
        virtualListHeightPx,
        virtualListHeightRpx,
        visibleCount
      });
      
      // 初始更新虚拟列表
      this.updateVirtualList();
    } catch (error) {
      console.error('初始化虚拟滚动列表高度失败:', error);
    }
  },

  /**
   * 更新虚拟滚动列表
   */
  updateVirtualList() {
    const { conversationList, visibleCount, scrollTop, itemHeight } = this.data;
    
    if (conversationList.length === 0) {
      this.setData({ visibleConversations: [] });
      return;
    }
    
    // 计算起始索引
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 1);
    // 计算结束索引
    const endIndex = Math.min(
      conversationList.length - 1,
      startIndex + visibleCount - 1
    );
    
    // 提取可见的会话
    const visibleConversations = conversationList.slice(startIndex, endIndex + 1).map((item, index) => ({
      ...item,
      _index: startIndex + index // 保存原始索引
    }));
    
    this.setData({
      startIndex,
      endIndex,
      visibleConversations
    });
    
    console.log('虚拟滚动列表更新:', {
      startIndex,
      endIndex,
      visibleCount: visibleConversations.length,
      totalCount: conversationList.length
    });
  },

  /**
   * 处理滚动事件
   */
  handleScroll(e) {
    const scrollTop = e.detail.scrollTop;
    this.setData({ scrollTop });
    this.updateVirtualList();
  },

  /**
   * 初始化IM服务（如果需要）
   */
  async initIMIfNeeded() {
    console.log('开始初始化IM服务');

    try {
      // 检查IM SDK是否初始化
      if (!wx.$TUIKit) {
        console.log('IM SDK未初始化，尝试从imSingleton获取');
        // 尝试从imSingleton获取IM SDK实例
        const { imSingleton } = require('../../utils/imSingleton');

        // 检查imSingleton是否存在
        if (!imSingleton) {
          console.error('[initIMIfNeeded] imSingleton未初始化');
          this.setData({ isIMInitialized: false });
          return;
        }

        const tim = imSingleton.getSDK();
        if (!tim) {
          console.log('IM SDK实例不存在');
          this.setData({ isIMInitialized: false });
          return;
        }
        console.log('从imSingleton获取IM SDK实例成功');
      }

      this.setData({ isIMInitialized: true });
      console.log('IM已初始化，开始登录检查');

      // 注册IM SDK事件监听
      this.registerIMEventListeners();

      // 检查IM登录状态
      await this.checkIMLoginStatus();
    } catch (error) {
      console.error('初始化IM服务失败:', error);
      this.setData({ isIMInitialized: false });
    }
  },

  /**
   * 注册IM SDK事件监听
   */
  registerIMEventListeners() {
    console.log('开始注册IM SDK事件监听');

    try {
      // 从imSingleton获取IM SDK实例
      const { imSingleton } = require('../../utils/imSingleton');

      // 检查imSingleton是否存在
      if (!imSingleton) {
        console.error('[registerIMEventListeners] imSingleton未初始化');
        return;
      }

      const tim = imSingleton.getSDK();

      if (!tim) {
        console.warn('IM SDK实例不存在，无法注册事件监听');
        return;
      }

      // 定义事件名称（使用字符串形式，避免依赖tim.EVENT对象）
      const EVENT = {
        MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
        CONVERSATION_LIST_UPDATED: 'CONVERSATION_LIST_UPDATED',
        MESSAGE_READ_BY_PEER: 'MESSAGE_READ_BY_PEER',
        SDK_READY: 'SDK_READY',
        NET_STATE_CHANGE: 'NET_STATE_CHANGE',
        ERROR: 'ERROR'
      };

      // 保存事件监听器引用，以便在页面卸载时移除
      this.imEventListeners = {
        // 新消息接收事件
        onMessageReceived: this.handleMessageReceived.bind(this),
        // 会话列表更新事件
        onConversationListUpdated: this.handleConversationListUpdated.bind(this),
        // 消息已读事件
        onMessageRead: this.handleMessageRead.bind(this),
        // SDK就绪事件
        onSDKReady: this.handleSDKReady.bind(this),
        // 网络状态变更事件
        onNetStateChange: this.handleNetStateChange.bind(this),
        // 错误事件
        onError: this.handleIMError.bind(this),
        // 保存事件名称，以便移除监听器时使用
        EVENT: EVENT
      };

      // 注册事件监听
      console.log('尝试注册事件监听器，使用事件名称:', EVENT);

      // 直接使用字符串形式的事件名称，确保不依赖tim.EVENT对象
      tim.on('MESSAGE_RECEIVED', this.imEventListeners.onMessageReceived);
      tim.on('CONVERSATION_LIST_UPDATED', this.imEventListeners.onConversationListUpdated);
      tim.on('MESSAGE_READ_BY_PEER', this.imEventListeners.onMessageRead);
      tim.on('SDK_READY', this.imEventListeners.onSDKReady);
      tim.on('NET_STATE_CHANGE', this.imEventListeners.onNetStateChange);
      tim.on('ERROR', this.imEventListeners.onError);

      console.log('IM SDK事件监听注册完成');
    } catch (error) {
      console.error('注册IM SDK事件监听失败:', error);
      // 清理引用，防止内存泄漏
      this.imEventListeners = null;
    }
  },

  /**
   * 移除IM SDK事件监听
   */
  removeIMEventListeners() {
    console.log('开始移除IM SDK事件监听');

    try {
      // 从imSingleton获取IM SDK实例
      const { imSingleton } = require('../../utils/imSingleton');

      // 检查imSingleton是否存在
      if (!imSingleton) {
        console.error('[removeIMEventListeners] imSingleton未初始化');
        return;
      }

      const tim = imSingleton.getSDK();

      if (!tim || !this.imEventListeners) {
        console.warn('IM SDK实例不存在或事件监听器未注册，无法移除事件监听');
        return;
      }

      // 直接使用字符串形式的事件名称，确保不依赖EVENT对象
      console.log('尝试移除事件监听器');

      // 移除事件监听
      tim.off('MESSAGE_RECEIVED', this.imEventListeners.onMessageReceived);
      tim.off('CONVERSATION_LIST_UPDATED', this.imEventListeners.onConversationListUpdated);
      tim.off('MESSAGE_READ_BY_PEER', this.imEventListeners.onMessageRead);
      tim.off('SDK_READY', this.imEventListeners.onSDKReady);
      tim.off('NET_STATE_CHANGE', this.imEventListeners.onNetStateChange);
      tim.off('ERROR', this.imEventListeners.onError);

      // 清理引用
      this.imEventListeners = null;
      console.log('IM SDK事件监听移除完成');
    } catch (error) {
      console.error('移除IM SDK事件监听失败:', error);
      // 即使失败也要清理引用，防止内存泄漏
      this.imEventListeners = null;
    }
  },


  /**
   * 检查IM登录状态
   */
  async checkIMLoginStatus() {
    // 直接尝试登录，让TUIKit处理已登录情况
    await this.tryIMLogin();
  },

  /**
   * 尝试登录IM
   * 参考腾讯云IM官方文档：实现多身份ID登录方案
   */
  async tryIMLogin() {
    console.log('开始尝试登录IM');
    
    // 根据微信小程序官方文档，正确的用户信息获取方式
    const loginStateManager = app.globalData.loginStateManager
    const userInfo = app.globalData.userInfo || (loginStateManager ? loginStateManager.getUserInfo() : null);
    
    // 检查是否有有效的用户信息
    if (!userInfo || !userInfo._id) {
      console.log('根据官方文档：用户未登录或信息不完整，不执行IM登录');
      return;
    }
    
    // 使用 CentralIdentityManager 获取当前角色
    const { centralIdentityManager } = require('../../utils/CentralIdentityManager');
    const currentRoleType = centralIdentityManager.getCurrentRole();
    const openid = userInfo.openid || userInfo._openid || '';
    
    console.log('[DEBUG] 角色类型获取信息:');
    console.log('  - IdentityManager.getCurrentRole():', currentRoleType);
    console.log('  - userInfo.openid:', openid);
    
    // 直接从云函数获取userSig，这是IM登录的核心参数
    let userSig = '';
    let normalizedUserID = '';
    let cloudRes = null;

    console.log('开始获取IM登录参数，roleType:', currentRoleType, 'openid:', openid);

    // 使用格式1生成符合规范的 userID
    try {
      normalizedUserID = ImUserIdValidator.generateFormat1UserID(openid, currentRoleType);
      console.log('生成的 userID:', normalizedUserID);
    } catch (error) {
      console.error('生成 userID 失败:', error);
      return;
    }

    try {
      console.log('[DEBUG] 开始调用云函数获取 userSig...');
      console.log('[DEBUG] 传递的参数:', {
        refreshUserSig: true,
        openid: openid,
        roleType: currentRoleType,
        imUserID: normalizedUserID
      });
      
      // 调用云函数获取 userSig，传递 imUserID 确保 ID 一致
      cloudRes = await wx.cloud.callFunction({
        name: 'login',
        data: {
          refreshUserSig: true, // 标识为刷新UserSig模式
          openid: openid,
          roleType: currentRoleType,
          imUserID: normalizedUserID // 传递 userID 确保与前端一致
        }
      });
      
      console.log('[DEBUG] 云函数调用成功');
      console.log('[DEBUG] cloudRes.errMsg:', cloudRes.errMsg);
      console.log('[DEBUG] cloudRes.result:', cloudRes.result);
      console.log('[DEBUG] cloudRes.result 是否存在:', !!cloudRes.result);

      // 根据云函数login的实际实现，成功返回的状态码是code: 0
      console.log('[DEBUG] 云函数返回结果:', JSON.stringify(cloudRes.result, null, 2));
      if (cloudRes.result.code === 0) {
        // 使用云函数返回的userSig
        userSig = cloudRes.result.userSig || (cloudRes.result.data && cloudRes.result.data.userSig);
        console.log('从云函数获取userSig成功，长度:', (userSig && userSig.length) || 0);
        console.log('云函数返回的完整userSig:', userSig);
      } else {
        console.error('获取userSig失败:', cloudRes.result.message);
        console.error('完整错误信息:', cloudRes.result);
        return;
      }
    } catch (error) {
      console.error('调用云函数获取userSig失败:', error);
      return;
    }

    console.log('尝试登录IM，userID:', normalizedUserID);
    console.log('  userSig类型:', typeof userSig);
    console.log('  userSig长度:', userSig ? userSig.length : 'undefined');
    console.log('  openid:', openid);
    console.log('  currentRoleType:', currentRoleType);

    // 根据微信小程序官方文档，确保用户ID有效
    if (!normalizedUserID || normalizedUserID.length < 5) {
      console.error('缺少有效的IM用户ID');
      wx.showToast({
        title: '获取IM用户信息失败',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    // 检查userSig是否有效
    // 根据腾讯云IM官方文档，userSig应该是一个有效的签名字符串，而不是测试值
    if (!userSig || userSig === 'testuser123' || (typeof userSig === 'string' && userSig.length < 10)) {
      console.log('没有有效的userSig或userSig无效，不执行IM登录');
      return;
    }

    // 检查是否已经登录该账号
    if (wx.$chat_userID === normalizedUserID) {
      console.log('已经登录该账号，无需重复登录:', normalizedUserID);
      this.setData({ isIMLogin: true });
      // 直接初始化会话组件
      this.initConversationComponent();
      // 已登录时也重新加载会话列表，确保重新编译后数据正确
      console.log('已登录状态，重新加载会话列表');
      this.loadConversations();
      return;
    }

    // 使用IMManager登录
    try {
      await imManager.login({
        userID: normalizedUserID,
        userSig: userSig
      });
      
      console.log('IM登录成功');
      this.setData({ isIMLogin: true, isLoggedIn: true });
      
      // 设置全局用户ID和userSig，TUI-Messages组件需要使用
      wx.$chat_userID = normalizedUserID;
      wx.$chat_userSig = userSig;
      
      // 设置SDKAppID，TUI-Messages组件需要使用
      wx.$chat_SDKAppID = 1600123494;
      
      // 更新全局userInfo中的userID，确保与当前角色匹配
      if (app.globalData.userInfo) {
        app.globalData.userInfo.userID = normalizedUserID;
        console.log('更新全局userInfo.userID:', normalizedUserID);
      }
      
      // 更新身份上下文管理器中的登录状态和连接状态
      const identityManager = app.globalData.identityContextManager;
      if (identityManager) {
        // 设置登录成功状态，使用标准化后的userID
        identityManager.setLoginStatus(currentRoleType, true, userSig, Date.now() + 7 * 24 * 3600 * 1000, normalizedUserID);
        // 更新连接状态为已连接
        identityManager.updateConnectionStatus(currentRoleType, 'connected');
      }
      
      // 导入用户信息到IM系统，确保nickname被正确设置
      await this.importUserProfile(normalizedUserID);
      
      // 不再初始化chat-uikit-engine，因为根据错误日志，TUIChatEngine.login不是一个函数
      // 只设置全局变量，让TUI-Messages组件自己处理初始化
      console.log('IM登录成功，已设置全局变量，TUI-Messages组件将自动初始化');
      // 初始化chat-uikit-engine的工作已经在app.js中完成
      // 这里只需要确保全局变量已设置
      if (!wx.$TUIChatEngine) {
        try {
          // 确保wx.$TUIChatEngine全局变量已设置
          const TUIChatEngine = require('@tencentcloud/chat-uikit-engine');
          wx.$TUIChatEngine = TUIChatEngine;
        } catch (error) {
          console.log('设置全局wx.$TUIChatEngine失败，但不影响应用启动:', error);
        }
      }
      
      // 直接初始化会话组件
      this.initConversationComponent();
      
      // 登录成功后重新加载会话列表
      console.log('登录成功后重新加载会话列表');
      this.loadConversations();
      
      // 显示登录成功提示
      wx.showToast({
        title: '消息服务已连接',
        icon: 'success',
        duration: 1500
      });
    } catch (error) {
      // 处理已登录错误
      if (error && error.message && error.message.includes('已经登录')) {
        console.log('已经登录该账号，无需重复登录:', normalizedUserID);
        this.setData({ isIMLogin: true });
        wx.$chat_userID = normalizedUserID;
        
        // 更新身份上下文管理器中的登录状态
        const identityManager = app.globalData.identityContextManager;
        if (identityManager) {
          identityManager.setLoginStatus(currentRoleType, true, userSig);
          identityManager.updateConnectionStatus(currentRoleType, 'connected');
        }
        
        // 导入用户信息到IM系统，确保nickname被正确设置
        await this.importUserProfile(normalizedUserID);
        
        // 直接初始化会话组件
        this.initConversationComponent();
        
        // 已登录时也重新加载会话列表
        console.log('已登录状态，重新加载会话列表');
        this.loadConversations();
      } else {
        console.error('IM登录失败:', JSON.stringify(error || {}));
        
        // 更新身份上下文管理器中的错误信息
        const identityManager = app.globalData.identityContextManager;
        if (identityManager) {
          identityManager.setLoginStatus(currentRoleType, false);
          identityManager.updateIMUserInfo(currentRoleType, { 
            lastError: error.message || '登录失败' 
          });
          identityManager.updateConnectionStatus(currentRoleType, 'disconnected');
        }
        
        wx.showToast({
          title: '消息服务连接失败',
          icon: 'none',
          duration: 2000
        });
      }
    }
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
            const { imSingleton } = require('../../utils/imSingleton');
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
      // 尝试从LoginStateManager获取用户信息
      const app = getApp()
      const loginStateManager = app.globalData.loginStateManager
      const userInfo = loginStateManager ? loginStateManager.getUserInfo() : null;
      if (userInfo) {
        console.log('从LoginStateManager获取用户信息成功');
        resolve(userInfo);
        return;
      }
      
      // 本地存储没有用户信息，使用默认信息
      console.warn('LoginStateManager没有用户信息，使用默认信息');
      resolve({
        nickName: '', // 不设置默认昵称，保留空值
        avatarUrl: '',
        gender: 'Gender_Type_Unknown'
      });
    });
  },

  /**
   * 初始化会话列表组件
   */
  initConversationComponent() {
    // TUIConversation组件会自动初始化，无需手动调用init方法
    console.log('TUIConversation组件已初始化');
  },

  /**
   * 处理角色变化
   * @param {string} newRole - 新角色
   */
  handleRoleChange(newRole) {
    console.log('消息页面角色变化:', newRole)
    // 重新检查IM登录状态，确保使用新角色的ID登录
    this.checkIMLoginStatus()
    // 重新加载会话列表，使用新角色过滤
    this.loadConversations()
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 页面卸载时，清理角色变化回调
    console.log('消息页面卸载');
    if (this.roleChangeCallbackId) {
      RoleManager.removeRoleChangeCallback(this.roleChangeCallbackId)
    }
    
    // 移除IM SDK事件监听
    this.removeIMEventListeners();
  },

  /**
   * 处理新消息接收
   * @param {Object} event - 事件对象
   */
  handleMessageReceived(event) {
    console.log('收到新消息:', event);
    
    // 立即刷新会话列表，确保新消息及时显示
    this.loadConversations(false, true);
  },

  /**
   * 处理会话列表更新
   * @param {Object} event - 事件对象
   */
  handleConversationListUpdated(event) {
    console.log('会话列表更新:', event);
    
    // 立即刷新会话列表，确保会话状态及时更新
    this.loadConversations(false, true);
  },

  /**
   * 处理消息已读
   * @param {Object} event - 事件对象
   */
  handleMessageRead(event) {
    console.log('消息已读:', event);
    
    // 立即刷新会话列表，确保未读计数及时更新
    this.loadConversations(false, true);
  },

  /**
   * 处理SDK就绪事件
   * @param {Object} event - 事件对象
   */
  handleSDKReady(event) {
    console.log('SDK就绪:', event);
    
    // SDK就绪后强制加载会话列表（使用forceReload，确保不被重复加载检查跳过）
    console.log('SDK就绪后强制加载会话列表');
    this.loadConversations(false, true); // 强制加载，忽略重复加载检查
  },

  /**
   * 处理网络状态变更
   * @param {Object} event - 事件对象
   */
  handleNetStateChange(event) {
    console.log('网络状态变更:', event);
    
    const netState = (event.data && event.data.state);
    console.log('网络状态:', netState);
    
    // 网络状态枚举
    const NET_STATE = {
      CONNECTED: 'connected',
      DISCONNECTED: 'disconnected',
      RECONNECTING: 'reconnecting'
    };
    
    switch (netState) {
      case NET_STATE.CONNECTED:
        console.log('网络恢复，强制加载会话列表');
        this.showToast('网络已恢复，正在同步消息...', 'success');
        this.loadConversations(false, true); // 强制加载，忽略重复加载检查
        break;
        
      case NET_STATE.DISCONNECTED:
        console.log('网络断开，显示离线提示');
        this.showToast('网络连接已断开，将在网络恢复后自动同步', 'none');
        break;
        
      case NET_STATE.RECONNECTING:
        console.log('正在重新连接网络');
        // 可以选择不显示提示，避免频繁弹窗
        break;
        
      default:
        console.log('未知网络状态:', netState);
    }
  },

  /**
   * 显示提示信息
   * @param {string} message - 提示信息
   * @param {string} icon - 图标类型
   * @param {number} duration - 持续时间
   */
  showToast(message, icon = 'none', duration = 2000) {
    wx.showToast({
      title: message,
      icon: icon,
      duration: duration,
      mask: true
    });
  },

  /**
   * 处理IM错误
   * @param {Object} event - 事件对象
   */
  handleIMError(event) {
    console.error('IM错误:', event);
    
    // 错误处理逻辑
    const errorCode = (event.data && event.data.code);
    const errorMessage = (event.data && event.data.message) || '未知错误';
    
    console.warn(`IM错误详情: 代码=${errorCode}, 消息=${errorMessage}`);
    
    // 常见错误代码处理
    const errorHandlers = {
      2000: '网络连接失败，请检查网络设置',
      2001: '登录超时，请重新登录',
      2002: '账号已在其他设备登录',
      2003: '登录失败，请检查账号密码',
      2100: '消息发送失败，请重试',
      2101: '消息接收失败，请检查网络',
      2200: '会话加载失败，请重试',
      2300: '服务器错误，请稍后重试'
    };
    
    // 根据错误代码显示对应的提示信息
    if (errorCode && errorHandlers[errorCode]) {
      this.showToast(errorHandlers[errorCode], 'none');
    } else if (errorCode === 2004) {
      // Token过期，需要重新登录
      console.error('Token过期，需要重新登录');
      this.showToast('登录已过期，请重新登录', 'none');
      // 可以在这里添加重新登录的逻辑
    } else if (errorCode >= 2000 && errorCode < 3000) {
      // 其他IM错误
      this.showToast(`消息服务错误: ${errorMessage}`, 'none');
    }
    // 对于不影响用户体验的错误，可以选择不显示提示
  },

  /**
   * 头像加载成功处理
   * @param {Object} e - 事件对象
   */
  onAvatarLoad(e) {
    console.log('头像加载成功:', e.currentTarget.dataset.conversationId);
  },

  /**
   * 头像加载失败处理
   * @param {Object} e - 事件对象
   */
  onAvatarLoadError(e) {
    const conversationId = e.currentTarget.dataset.conversationId;
    console.log('头像加载失败，使用默认头像:', conversationId);
    
    // 头像加载失败时，会自动显示默认头像（通过WXML中的默认值）
  },

  /**
   * 会话项点击事件
   * @param {Object} e - 事件对象，包含会话信息
   */
  onConversationItemTap(e) {
    // 详细记录事件对象
    console.log('会话点击事件e:', JSON.stringify(e));
    
    let conversation = null;
    
    // 兼容不同的事件对象格式
    if (e && e.detail && e.detail.conversation) {
      conversation = e.detail.conversation;
    } else if (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.conversation) {
      conversation = e.currentTarget.dataset.conversation;
    }
    
    console.log('会话对象:', JSON.stringify(conversation));
    
    // 确保conversationID是字符串类型且非空
    let conversationID = '';
    if (conversation) {
      if (conversation.conversationID) {
        conversationID = String(conversation.conversationID).trim();
      } else if (conversation.id) {
        conversationID = String(conversation.id).trim();
      }
    }
    
    console.log('准备传递的会话ID:', conversationID);
    console.log('会话ID类型:', typeof conversationID);
    console.log('会话ID长度:', conversationID.length);
    
    if (conversationID) {
      // 跳转到聊天页面
      wx.navigateTo({
        url: `/subpackages/other/messages/chat/chat?conversationID=${encodeURIComponent(conversationID)}`,
        success: (res) => {
          console.log('跳转到聊天页面成功:', res);
        },
        fail: (err) => {
          console.error('跳转到聊天页面失败:', err);
        }
      });
    } else {
      console.error('会话信息不完整，缺少有效conversationID:', conversation);
      wx.showToast({
        title: '会话信息不完整',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 错误处理
   * @param {Object} e - 错误事件对象
   */
  onError(e) {
    console.error('会话列表错误:', JSON.stringify(e.detail));
    // 可以在这里处理错误，比如显示提示信息
    wx.showToast({
      title: e.detail.errorMsg || '加载失败',
      icon: 'none',
      duration: 3000
    });
  },

  /**
   * 测试会话点击事件
   * @param {Object} e - 事件对象
   */
  onTestConversationTap(e) {
    console.log('测试会话点击事件:', JSON.stringify(e));
    const conversation = e.currentTarget.dataset.conversation;
    console.log('测试会话对象:', JSON.stringify(conversation));
    
    if (conversation && conversation.conversationID) {
      // 跳转到聊天页面
      wx.navigateTo({
        url: `/subpackages/other/messages/chat/chat?conversationID=${encodeURIComponent(conversation.conversationID)}`,
        success: (res) => {
          console.log('跳转到聊天页面成功:', res);
        },
        fail: (err) => {
          console.error('跳转到聊天页面失败:', err);
        }
      });
    } else {
      console.error('会话信息不完整:', conversation);
      wx.showToast({
        title: '会话信息不完整',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 格式化时间
   * @param {number} timestamp - 时间戳
   * @returns {string} 格式化后的时间字符串
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const dayDiff = Math.floor(diff / (24 * 3600 * 1000));
    
    if (dayDiff === 0) {
      // 今天
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (dayDiff === 1) {
      // 昨天
      return '昨天';
    } else if (dayDiff < 7) {
      // 一周内
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return weekdays[date.getDay()];
    } else {
      // 其他
      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    }
  },

  /**
   * 格式化消息预览
   * @param {Object} message - 消息对象
   * @returns {string} 格式化后的消息预览
   */
  formatMessagePreview(message) {
    if (!message) {
      return '无消息';
    }
    
    // 根据消息类型格式化预览
    const messageType = message.type || message.MessageType;
    const payload = message.payload || message.Payload;
    
    switch (messageType) {
      case 'TIMTextElem':
      case 'text':
        return payload.text || payload.content || '文本消息';
        
      case 'TIMImageElem':
      case 'image':
        return '[图片]';
        
      case 'TIMFileElem':
      case 'file':
        return '[文件]';
        
      case 'TIMAudioElem':
      case 'audio':
        return '[语音]';
        
      case 'TIMVideoElem':
      case 'video':
        return '[视频]';
        
      case 'TIMLocationElem':
      case 'location':
        return '[位置]';
        
      case 'TIMCustomElem':
      case 'custom':
        return '[自定义消息]';
        
      default:
        return payload.text || payload.content || '消息';
    }
  },

  /**
   * 格式化未读消息计数
   * @param {number} count - 未读消息数
   * @returns {string} 格式化后的未读消息计数
   */
  formatUnreadCount(count) {
    if (count <= 0) {
      return '';
    } else if (count > 99) {
      return '99+';
    } else {
      return count.toString();
    }
  },

  /**
   * 加载更多会话
   */
  loadMoreConversations() {
    if (!this.data.loadingConversations && this.data.hasMoreConversations) {
      this.loadConversations(true);
    }
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    console.log('页面触底，尝试加载更多会话');
    this.loadMoreConversations();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '消息',
      path: '/pages/messages/index'
    };
  },

  /**
   * 下拉刷新处理
   */
  onPullDownRefresh() {
    console.log('下拉刷新触发');
    
    // 强制重新加载会话列表
    this.loadConversations(false, true).finally(() => {
      // 结束下拉刷新动画
      wx.stopPullDownRefresh();
    });
  }
})