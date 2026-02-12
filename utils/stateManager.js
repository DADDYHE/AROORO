/**
 * 全局状态管理工具
 * 用于管理应用的全局状态，确保状态一致性和可追踪性
 */

// 获取应用实例，兼容不同环境
let app;
try {
  app = getApp();
  // 确保app.globalData存在
  if (!app.globalData) {
    app.globalData = {};
  }
} catch (error) {
  // 在非小程序环境中，使用全局app对象
  app = global.app || {
    globalData: {}
  };
  // 确保app.globalData存在
  if (!app.globalData) {
    app.globalData = {};
  }
}

// 导入集中式身份管理器
const { centralIdentityManager } = require('./CentralIdentityManager');

// 状态事件类型
const STATE_EVENTS = {
  STATE_UPDATED: 'stateUpdated',
  USER_INFO_CHANGED: 'userInfoChanged',
  ROLE_CHANGED: 'roleChanged',
  IM_LOGIN_STATUS_CHANGED: 'imLoginStatusChanged',
  ERROR_OCCURRED: 'errorOccurred'
};

// 状态键定义
const STATE_KEYS = {
  USER_INFO: 'userInfo',
  USER_ROLE: 'userRole',
  IM_LOGIN_STATUS: 'imLoginStatus',
  OWNER_INFO: 'ownerInfo',
  HOST_INFO: 'hostInfo',
  IDENTITY_CONTEXT: 'identityContextManager'
};

class StateManager {
  /**
   * 初始化状态管理器
   */
  static init() {
    // 避免重复初始化
    if (app.globalData.stateManager && app.globalData.stateManager.initialized) {
      console.log('StateManager.init - 状态管理器已初始化，跳过');
      return;
    }
    
    console.log('StateManager.init - 初始化状态管理器');
    
    // 确保全局状态管理器存在
    if (!app.globalData.stateManager) {
      app.globalData.stateManager = {
        events: {},
        stateHistory: [],
        maxHistorySize: 100,
        lastUpdated: {},
        pendingUpdates: [],
        pageRegistry: {},
        debounceTimers: {},
        performanceData: {},
        initialized: false
      };
      
      console.log('StateManager.init - 创建全局状态管理器实例');
    }
    
    // 初始化默认状态
    this._initDefaultState();
    
    // 标记为已初始化
    app.globalData.stateManager.initialized = true;
    console.log('StateManager.init - 状态管理器初始化完成');
  }
  
  /**
   * 初始化默认状态
   * @private
   */
  static _initDefaultState() {
    const defaultState = {
      [STATE_KEYS.USER_INFO]: null,
      [STATE_KEYS.USER_ROLE]: 'owner',
      [STATE_KEYS.IM_LOGIN_STATUS]: 'ready',
      [STATE_KEYS.OWNER_INFO]: null,
      [STATE_KEYS.HOST_INFO]: null,
      [STATE_KEYS.IDENTITY_CONTEXT]: null,
      [STATE_KEYS.IDENTITY_MANAGER]: null
    };
    
    // 初始化不存在的状态
    Object.keys(defaultState).forEach(key => {
      if (app.globalData[key] === undefined) {
        app.globalData[key] = defaultState[key];
        console.log('StateManager._initDefaultState - 初始化默认状态:', key, '=', defaultState[key]);
      }
    });
  }
  
  /**
   * 获取全局状态
   * @param {string} key - 状态键
   * @returns {*} 状态值
   */
  static get(key) {
    if (!key) {
      // 如果没有指定键，返回所有全局状态
      return app.globalData;
    }
    
    const value = app.globalData[key];
    console.log('StateManager.get - 获取状态:', key, '=', value);
    return value;
  }
  
  /**
   * 设置全局状态
   * @param {string|object} key - 状态键或状态对象
   * @param {*} value - 状态值（当key为字符串时）
   * @param {object} [options] - 选项
   * @param {boolean} [options.silent] - 是否静默更新（不触发事件）
   * @param {string} [options.source] - 更新来源
   */
  static set(key, value, options = {}) {
    if (typeof key === 'object') {
      // 批量更新
      const stateObject = key;
      const updateOptions = value || {};
      
      Object.keys(stateObject).forEach(stateKey => {
        this._updateState(stateKey, stateObject[stateKey], updateOptions);
      });
    } else {
      // 单个更新
      this._updateState(key, value, options);
    }
  }
  
  /**
   * 更新单个状态
   * @private
   * @param {string} key - 状态键
   * @param {*} value - 状态值
   * @param {object} options - 选项
   */
  static _updateState(key, value, options = {}) {
    // 确保 app.globalData 存在
    if (!app || !app.globalData) {
      console.error('StateManager._updateState - 应用实例或全局数据不存在');
      return;
    }
    
    const oldValue = app.globalData[key];
    
    // 检查值是否变化
    if (this._isEqual(oldValue, value)) {
      console.log('StateManager._updateState - 状态未变化，跳过更新:', key);
      return;
    }
    
    // 更新状态
    app.globalData[key] = value;
    
    // 确保 stateManager 和相关属性存在
    if (!app.globalData.stateManager) {
      try {
        this.init();
      } catch (error) {
        console.error('StateManager._updateState - 初始化状态管理器失败:', error);
        return;
      }
    }
    
    // 再次检查 stateManager 是否存在
    if (!app.globalData.stateManager) {
      console.error('StateManager._updateState - 状态管理器初始化失败');
      return;
    }
    
    if (!app.globalData.stateManager.lastUpdated) {
      app.globalData.stateManager.lastUpdated = {};
    }
    
    // 记录更新时间
    app.globalData.stateManager.lastUpdated[key] = Date.now();
    
    // 记录状态历史
    try {
      this._recordStateHistory(key, oldValue, value, options.source);
    } catch (error) {
      console.error('StateManager._updateState - 记录状态历史失败:', error);
    }
    
    console.log('StateManager._updateState - 更新状态:', {
      key: key,
      oldValue: oldValue,
      newValue: value,
      source: options.source,
      timestamp: Date.now()
    });
    
    // 触发事件
    if (!options.silent) {
      try {
        this._emitStateEvent(key, oldValue, value, options.source);
      } catch (error) {
        console.error('StateManager._updateState - 触发事件失败:', error);
      }
    }
  }
  
  /**
   * 检查两个值是否相等
   * @private
   * @param {*} a - 值1
   * @param {*} b - 值2
   * @returns {boolean} 是否相等
   */
  static _isEqual(a, b) {
    if (a === b) return true;
    
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      
      if (keysA.length !== keysB.length) return false;
      
      for (const key of keysA) {
        if (!keysB.includes(key) || !this._isEqual(a[key], b[key])) {
          return false;
        }
      }
      
      return true;
    }
    
    return false;
  }
  
  /**
   * 记录状态历史
   * @private
   * @param {string} key - 状态键
   * @param {*} oldValue - 旧值
   * @param {*} newValue - 新值
   * @param {string} source - 更新来源
   */
  static _recordStateHistory(key, oldValue, newValue, source) {
    const historyItem = {
      key: key,
      oldValue: oldValue,
      newValue: newValue,
      source: source || 'unknown',
      timestamp: Date.now()
    };
    
    app.globalData.stateManager.stateHistory.push(historyItem);
    
    // 限制历史记录大小
    if (app.globalData.stateManager.stateHistory.length > app.globalData.stateManager.maxHistorySize) {
      app.globalData.stateManager.stateHistory.shift();
    }
  }
  
  /**
   * 触发状态事件
   * @private
   * @param {string} key - 状态键
   * @param {*} oldValue - 旧值
   * @param {*} newValue - 新值
   * @param {string} source - 更新来源
   */
  static _emitStateEvent(key, oldValue, newValue, source) {
    const eventData = {
      key: key,
      oldValue: oldValue,
      newValue: newValue,
      source: source,
      timestamp: Date.now()
    };
    
    // 触发通用状态更新事件
    this._emitEvent(STATE_EVENTS.STATE_UPDATED, eventData);
    
    // 触发特定状态事件
    switch (key) {
      case STATE_KEYS.USER_INFO:
        this._emitEvent(STATE_EVENTS.USER_INFO_CHANGED, eventData);
        break;
      case STATE_KEYS.USER_ROLE:
        this._emitEvent(STATE_EVENTS.ROLE_CHANGED, eventData);
        break;
      case STATE_KEYS.IM_LOGIN_STATUS:
        this._emitEvent(STATE_EVENTS.IM_LOGIN_STATUS_CHANGED, eventData);
        break;
    }
  }
  
  /**
   * 注册事件监听器
   * @param {string} eventName - 事件名称
   * @param {function} callback - 回调函数
   */
  static on(eventName, callback) {
    if (!app.globalData.stateManager) {
      this.init();
    }
    
    if (!app.globalData.stateManager.events[eventName]) {
      app.globalData.stateManager.events[eventName] = [];
    }
    
    app.globalData.stateManager.events[eventName].push(callback);
    console.log('StateManager.on - 注册事件监听器:', eventName);
  }
  
  /**
   * 注册事件监听器（与on方法相同，为了兼容性）
   * @param {string} eventName - 事件名称
   * @param {function} callback - 回调函数
   */
  static addListener(eventName, callback) {
    console.log('StateManager.addListener - 注册事件监听器:', eventName);
    this.on(eventName, callback);
  }
  
  /**
   * 移除事件监听器
   * @param {string} eventName - 事件名称
   * @param {function} callback - 回调函数
   */
  static off(eventName, callback) {
    if (app.globalData.stateManager && app.globalData.stateManager.events[eventName]) {
      app.globalData.stateManager.events[eventName] = app.globalData.stateManager.events[eventName].filter(cb => cb !== callback);
      console.log('StateManager.off - 移除事件监听器:', eventName);
    }
  }
  
  /**
   * 触发事件
   * @private
   * @param {string} eventName - 事件名称
   * @param {object} data - 事件数据
   */
  static _emitEvent(eventName, data) {
    if (app.globalData.stateManager && app.globalData.stateManager.events[eventName]) {
      app.globalData.stateManager.events[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('StateManager._emitEvent - 事件回调执行失败:', error);
        }
      });
      console.log('StateManager._emitEvent - 触发事件:', eventName, data);
    }
  }
  
  /**
   * 批量更新状态
   * @param {object} stateObject - 状态对象
   * @param {object} [options] - 选项
   */
  static batchUpdate(stateObject, options = {}) {
    console.log('StateManager.batchUpdate - 批量更新状态:', Object.keys(stateObject));
    this.set(stateObject, options);
  }
  
  /**
   * 清除状态
   * @param {string} [key] - 状态键（可选，不指定则清除所有状态）
   * @param {object} [options] - 选项
   */
  static clear(key, options = {}) {
    if (key) {
      // 清除单个状态
      console.log('StateManager.clear - 清除状态:', key);
      this.set(key, null, options);
    } else {
      // 清除所有状态
      console.log('StateManager.clear - 清除所有状态');
      const stateObject = {};
      Object.values(STATE_KEYS).forEach(stateKey => {
        stateObject[stateKey] = null;
      });
      this.batchUpdate(stateObject, options);
    }
  }
  
  /**
   * 获取状态历史
   * @param {number} [limit] - 限制数量
   * @returns {array} 状态历史
   */
  static getStateHistory(limit = 50) {
    if (!app.globalData.stateManager) {
      this.init();
    }
    
    const history = app.globalData.stateManager.stateHistory;
    return history.slice(-limit);
  }
  
  /**
   * 获取状态更新时间
   * @param {string} key - 状态键
   * @returns {number|null} 更新时间戳
   */
  static getLastUpdated(key) {
    if (!app.globalData.stateManager) {
      this.init();
    }
    
    return app.globalData.stateManager.lastUpdated[key] || null;
  }
  
  /**
   * 验证状态一致性
   * @returns {object} 验证结果
   */
  static validateStateConsistency() {
    console.log('StateManager.validateStateConsistency - 验证状态一致性');
    
    const issues = [];
    const state = app.globalData;
    
    // 检查用户信息一致性
    if (state.userInfo && state.userInfo.role && state.userRole && state.userInfo.role !== state.userRole) {
      issues.push({
        type: 'role_inconsistency',
        message: 'userInfo.role 与 userRole 不一致',
        details: {
          userInfoRole: state.userInfo.role,
          userRole: state.userRole
        }
      });
    }
    
    // 检查身份管理器状态
    if (centralIdentityManager) {
      try {
        // 使用 CentralIdentityManager 检查身份一致性
        const currentRole = centralIdentityManager.getCurrentRole();
        const currentIdentity = centralIdentityManager.getCurrentIdentity();
        if (!currentRole || !currentIdentity) {
          issues.push({
            type: 'identity_inconsistency',
            message: '身份状态不一致',
            details: {
              missingRole: !currentRole,
              missingIdentity: !currentIdentity
            }
          });
        }
      } catch (error) {
        console.error('StateManager.validateStateConsistency - 验证身份状态失败:', error);
      }
    }
    
    const result = {
      isConsistent: issues.length === 0,
      issues: issues,
      timestamp: Date.now(),
      stateSummary: {
        hasUserInfo: !!state.userInfo,
        hasUserRole: !!state.userRole,
        hasImLoginStatus: !!state.imLoginStatus,
        hasOwnerInfo: !!state.ownerInfo,
        hasHostInfo: !!state.hostInfo
      }
    };
    
    console.log('StateManager.validateStateConsistency - 验证结果:', result);
    return result;
  }
  
  /**
   * 修复状态一致性问题
   * @returns {object} 修复结果
   */
  static fixStateConsistency() {
    console.log('StateManager.fixStateConsistency - 修复状态一致性问题');
    
    const validation = this.validateStateConsistency();
    const fixedIssues = [];
    
    if (!validation.isConsistent) {
      validation.issues.forEach(issue => {
        switch (issue.type) {
          case 'role_inconsistency':
            // 使用userRole作为标准
            if (app.globalData.userRole) {
              if (app.globalData.userInfo) {
                this.set(STATE_KEYS.USER_INFO, {
                  ...app.globalData.userInfo,
                  role: app.globalData.userRole
                }, {
                  source: 'StateManager.fixStateConsistency'
                });
              }
              fixedIssues.push(issue);
            }
            break;
          case 'identity_inconsistency':
            // 使用 CentralIdentityManager 修复
            if (centralIdentityManager) {
              try {
                // CentralIdentityManager 会自动处理身份一致性
                // 可以通过重新获取当前身份来确保状态正确
                const currentIdentity = centralIdentityManager.getCurrentIdentity();
                if (currentIdentity) {
                  fixedIssues.push(issue);
                }
              } catch (error) {
                console.error('StateManager.fixStateConsistency - 修复身份状态失败:', error);
              }
            }
            break;
        }
      });
    }
    
    const result = {
      success: fixedIssues.length === validation.issues.length,
      fixedIssues: fixedIssues,
      remainingIssues: validation.issues.filter(issue => 
        !fixedIssues.includes(issue)
      ),
      timestamp: Date.now()
    };
    
    console.log('StateManager.fixStateConsistency - 修复结果:', result);
    return result;
  }
  
  /**
   * 记录错误
   * @param {string} errorType - 错误类型
   * @param {string} message - 错误消息
   * @param {object} [details] - 错误详情
   */
  static recordError(errorType, message, details = {}) {
    const errorData = {
      type: errorType,
      message: message,
      details: details,
      timestamp: Date.now(),
      state: {
        userRole: app.globalData.userRole,
        imLoginStatus: app.globalData.imLoginStatus,
        hasUserInfo: !!app.globalData.userInfo
      }
    };
    
    console.error('StateManager.recordError - 记录错误:', errorData);
    
    // 触发错误事件
    this._emitEvent(STATE_EVENTS.ERROR_OCCURRED, errorData);
  }
  
  /**
   * 获取状态摘要
   * @returns {object} 状态摘要
   */
  static getStateSummary() {
    const state = app.globalData;
    
    return {
      userInfo: {
        hasUserInfo: !!state.userInfo,
        hasUserId: !!state.userInfo?._id,
        hasOpenid: !!state.userInfo?.openid,
        hasRole: !!state.userInfo?.role
      },
      userRole: state.userRole || 'owner',
      imLoginStatus: state.imLoginStatus || 'ready',
      profiles: {
        hasOwnerInfo: !!state.ownerInfo,
        hasHostInfo: !!state.hostInfo
      },
      managers: {
        hasCentralIdentityManager: !!centralIdentityManager,
        hasStateManager: !!state.stateManager
      },
      timestamp: Date.now()
    };
  }
  
  /**
   * 防抖更新状态
   * @param {string} pageName - 页面名称
   * @param {object} updates - 更新的状态
   * @param {number} [delay=100] - 延迟时间（毫秒）
   */
  static debounceUpdate(pageName, updates, delay = 100) {
    console.log('StateManager.debounceUpdate - 防抖更新状态:', pageName, Object.keys(updates));
    
    if (!app.globalData.stateManager) {
      this.init();
    }
    
    if (!app.globalData.stateManager.debounceTimers) {
      app.globalData.stateManager.debounceTimers = {};
    }
    
    const timerKey = `debounce_${pageName}`;
    clearTimeout(app.globalData.stateManager.debounceTimers[timerKey]);
    
    app.globalData.stateManager.debounceTimers[timerKey] = setTimeout(() => {
      this._updatePageState(pageName, updates);
      delete app.globalData.stateManager.debounceTimers[timerKey];
    }, delay);
  }

  /**
   * 更新页面状态
   * @private
   * @param {string} pageName - 页面名称
   * @param {object} updates - 更新的状态
   */
  static _updatePageState(pageName, updates) {
    console.log('StateManager._updatePageState - 更新页面状态:', pageName, Object.keys(updates));
    
    // 确保 stateManager 和 pageRegistry 存在
    if (!app.globalData.stateManager) {
      this.init();
    }
    
    if (!app.globalData.stateManager.pageRegistry) {
      app.globalData.stateManager.pageRegistry = {};
    }
    
    // 如果页面未注册，自动注册一个默认状态
    if (!app.globalData.stateManager.pageRegistry[pageName]) {
      console.warn('StateManager._updatePageState - 页面未注册，自动注册默认状态:', pageName);
      // 自动注册页面，使用默认状态
      this.registerPage(pageName, {
        isLoading: false,
        isLoggedIn: false,
        userInfo: {},
        userRole: 'owner'
      });
    }
    
    const pageData = app.globalData.stateManager.pageRegistry[pageName];
    const oldState = { ...pageData.currentState };
    
    // 更新当前状态
    pageData.currentState = { ...pageData.currentState, ...updates };
    const newState = { ...pageData.currentState };
    
    console.log('StateManager._updatePageState - 状态更新:', {
      pageName: pageName,
      oldState: oldState,
      newState: newState,
      updates: updates,
      timestamp: Date.now()
    });
    
    // 通知所有监听器
    pageData.listeners.forEach(callback => {
      try {
        callback(updates, newState);
      } catch (error) {
        console.error('StateManager._updatePageState - 监听器回调执行失败:', error);
      }
    });
    
    console.log('StateManager._updatePageState - 页面状态更新完成:', pageName);
  }
  
  /**
   * 测量性能
   * @param {string} name - 性能测量名称
   * @param {function} fn - 要执行的函数
   * @returns {*} 函数执行结果
   */
  static measurePerformance(name, fn) {
    const start = Date.now();
    const result = fn();
    const duration = Date.now() - start;
    console.log(`[Performance] ${name}: ${duration}ms`);
    
    // 记录性能数据
    if (!app.globalData.stateManager.performanceData) {
      app.globalData.stateManager.performanceData = {};
    }
    
    if (!app.globalData.stateManager.performanceData[name]) {
      app.globalData.stateManager.performanceData[name] = [];
    }
    
    app.globalData.stateManager.performanceData[name].push({
      duration,
      timestamp: Date.now()
    });
    
    // 限制性能数据长度
    if (app.globalData.stateManager.performanceData[name].length > 100) {
      app.globalData.stateManager.performanceData[name].shift();
    }
    
    return result;
  }
  
  /**
   * 获取性能数据
   * @param {string} [name] - 性能测量名称（可选）
   * @returns {object} 性能数据
   */
  static getPerformanceData(name) {
    if (!app.globalData.stateManager || !app.globalData.stateManager.performanceData) {
      return {};
    }
    
    if (name) {
      return app.globalData.stateManager.performanceData[name] || [];
    }
    
    return app.globalData.stateManager.performanceData;
  }
  
  /**
   * 注册页面
   * @param {string} pageName - 页面名称
   * @param {object} initialState - 初始状态
   */
  static registerPage(pageName, initialState) {
    console.log('StateManager.registerPage - 注册页面:', pageName, '初始状态:', Object.keys(initialState));

    // 确保 stateManager 已初始化
    if (!app.globalData.stateManager) {
      this.init();
    }

    // 存储页面状态
    if (!app.globalData.stateManager.pageRegistry) {
      app.globalData.stateManager.pageRegistry = {};
    }
    app.globalData.stateManager.pageRegistry[pageName] = {
      initialState: initialState,
      currentState: { ...initialState },
      listeners: []
    };

    console.log('StateManager.registerPage - 页面注册成功:', pageName);
  }

  /**
   * 添加页面状态监听器
   * @param {string} pageName - 页面名称
   * @param {function} callback - 回调函数
   * @returns {function} 取消监听函数
   */
  static addListener(pageName, callback) {
    console.log('StateManager.addListener - 添加页面状态监听器:', pageName);

    // 确保 stateManager 已初始化
    if (!app.globalData.stateManager) {
      this.init();
    }

    if (!app.globalData.stateManager.pageRegistry || !app.globalData.stateManager.pageRegistry[pageName]) {
      console.error('StateManager.addListener - 页面未注册:', pageName);
      return () => {};
    }

    app.globalData.stateManager.pageRegistry[pageName].listeners.push(callback);

    // 返回取消监听函数
    return () => {
      if (app.globalData.stateManager.pageRegistry && app.globalData.stateManager.pageRegistry[pageName]) {
        app.globalData.stateManager.pageRegistry[pageName].listeners =
          app.globalData.stateManager.pageRegistry[pageName].listeners.filter(cb => cb !== callback);
        console.log('StateManager.addListener - 移除页面状态监听器:', pageName);
      }
    };
  }

  /**
   * 取消注册页面
   * @param {string} pageName - 页面名称
   */
  static unregisterPage(pageName) {
    console.log('StateManager.unregisterPage - 取消注册页面:', pageName);
    
    if (app.globalData.stateManager.pageRegistry) {
      delete app.globalData.stateManager.pageRegistry[pageName];
      console.log('StateManager.unregisterPage - 页面取消注册成功:', pageName);
    }
  }
  
  /**
   * 设置状态（与set方法相同，为了兼容性）
   * @param {string|object} key - 状态键或状态对象
   * @param {*} value - 状态值（当key为字符串时）
   * @param {object} [options] - 选项
   */
  static setState(key, value, options = {}) {
    console.log('StateManager.setState - 设置状态');
    this.set(key, value, options);
  }
}

// 导出单例
module.exports = {
  stateManager: StateManager
};