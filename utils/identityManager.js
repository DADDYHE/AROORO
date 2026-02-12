/**
 * 统一身份管理工具
 * 用于管理用户身份，确保整个应用的身份状态一致
 */

// 获取应用实例，兼容不同环境
let app;
try {
  app = getApp();
} catch (error) {
  // 在非小程序环境中，使用全局app对象
  app = global.app || {
    globalData: {}
  };
}

// 角色优先级配置 - identityContextRole 最高优先级，确保角色切换后立即生效
const ROLE_PRIORITY = [
  'identityContextRole',   // 最高优先级 - 身份上下文管理器的当前角色
  'globalUserRole',
  'userInfoRole', 
  'storageRole'
];

// 角色类型验证
const VALID_ROLES = ['owner', 'host', 'guest'];

// 身份事件类型
const IDENTITY_EVENTS = {
  ROLE_CHANGED: 'roleChanged',
  IDENTITY_UPDATED: 'identityUpdated',
  CONSISTENCY_FIXED: 'consistencyFixed'
};

class IdentityManager {
  /**
   * 初始化身份管理器
   */
  static init() {
    console.log('IdentityManager.init - 初始化身份管理器');
    
    // 确保全局身份状态存在
    if (!app.globalData.identityManager) {
      app.globalData.identityManager = {
        events: {},
        lastSyncTime: 0,
        syncInterval: 120000 // 2分钟同步一次
      };
      
      console.log('IdentityManager.init - 创建全局身份管理器实例');
    }
    
    // 启动定期同步
    this._startSync();
  }
  
  /**
   * 启动定期同步
   * @private
   */
  static _startSync() {
    setInterval(() => {
      const now = Date.now();
      const lastSyncTime = app.globalData.identityManager?.lastSyncTime || 0;
      
      if (now - lastSyncTime > (app.globalData.identityManager?.syncInterval || 120000)) {
        this.syncIdentityState();
        app.globalData.identityManager.lastSyncTime = now;
      }
    }, 5000);
  }
  
  /**
   * 获取当前用户角色
   * @returns {string} 当前角色
   */
  static getCurrentRole() {
    // 生产环境可以注释掉这些日志
    // console.log('IdentityManager.getCurrentRole - 获取当前角色');
    
    const roleSources = {
      globalUserRole: app.globalData.userRole,
      userInfoRole: app.globalData.userInfo?.role,
      storageRole: wx.getStorageSync('userRole'),
      identityContextRole: app.globalData.identityContextManager?.getCurrentRoleType()
    };
    
    // 生产环境可以注释掉这些日志
    // console.log('IdentityManager.getCurrentRole - 角色来源:', roleSources);
    
    // 按优先级获取角色
    let currentRole = null;
    for (const source of ROLE_PRIORITY) {
      if (roleSources[source] && VALID_ROLES.includes(roleSources[source])) {
        currentRole = roleSources[source];
        break;
      }
    }
    
    // 默认角色
    if (!currentRole) {
      currentRole = 'owner';
    }
    
    // 只在开发环境输出最终角色
    // console.log('IdentityManager.getCurrentRole - 最终角色:', currentRole);
    return currentRole;
  }
  
  /**
   * 获取当前用户信息
   * @returns {object} 用户信息
   */
  static getCurrentUserInfo() {
    console.log('IdentityManager.getCurrentUserInfo - 获取当前用户信息');
    
    // 优先从全局获取，其次从存储获取
    let userInfo = app.globalData.userInfo;
    if (!userInfo) {
      try {
        userInfo = wx.getStorageSync('userInfo');
      } catch (error) {
        console.error('IdentityManager.getCurrentUserInfo - 读取存储失败:', error);
        userInfo = {};
      }
    }
    
    const userRole = this.getCurrentRole();
    
    console.log('IdentityManager.getCurrentUserInfo - 用户信息:', {
      hasUserInfo: !!userInfo,
      hasUserId: !!userInfo?._id,
      hasOpenid: !!userInfo?.openid,
      userRole: userRole
    });
    
    return {
      ...userInfo,
      role: userRole
    };
  }
  
  /**
   * 获取角色特定的用户信息
   * @returns {object} 角色特定的用户信息
   */
  static getRoleSpecificUserInfo() {
    console.log('IdentityManager.getRoleSpecificUserInfo - 获取角色特定用户信息');
    
    const userRole = this.getCurrentRole();
    let roleSpecificInfo = {};
    
    // 根据角色获取对应的特定信息
    if (userRole === 'host') {
      try {
        roleSpecificInfo = app.globalData.hostInfo || wx.getStorageSync('hostInfo') || {};
      } catch (error) {
        console.error('IdentityManager.getRoleSpecificUserInfo - 读取hostInfo失败:', error);
      }
      console.log('IdentityManager.getRoleSpecificUserInfo - 寄养家庭信息:', {
        hasHostInfo: !!Object.keys(roleSpecificInfo).length,
        hostInfoKeys: Object.keys(roleSpecificInfo)
      });
    } else {
      try {
        roleSpecificInfo = app.globalData.ownerInfo || wx.getStorageSync('ownerInfo') || {};
      } catch (error) {
        console.error('IdentityManager.getRoleSpecificUserInfo - 读取ownerInfo失败:', error);
      }
      console.log('IdentityManager.getRoleSpecificUserInfo - 宠物主人信息:', {
        hasOwnerInfo: !!Object.keys(roleSpecificInfo).length,
        ownerInfoKeys: Object.keys(roleSpecificInfo)
      });
    }
    
    // 确保返回的信息包含基本字段
    const basicUserInfo = this.getCurrentUserInfo();
    
    // 合并信息：角色特定信息优先，基础信息作为补充
    const mergedInfo = {
      ...basicUserInfo,
      ...roleSpecificInfo,
      role: userRole
    };
    
    console.log('IdentityManager.getRoleSpecificUserInfo - 最终角色特定信息:', {
      userRole: userRole,
      hasMergedInfo: !!Object.keys(mergedInfo).length,
      mergedInfoKeys: Object.keys(mergedInfo)
    });
    
    return mergedInfo;
  }
  
  /**
   * 检查用户是否已登录
   * @returns {boolean} 是否已登录
   */
  static isLoggedIn() {
    const userInfo = this.getCurrentUserInfo();
    const isLoggedIn = !!userInfo && !!userInfo._id && !!userInfo.openid;
    console.log('IdentityManager.isLoggedIn - 登录状态:', isLoggedIn);
    return isLoggedIn;
  }
  
  /**
   * 获取当前身份的完整信息
   * @returns {object} 身份信息
   */
  static getCurrentIdentity() {
    console.log('IdentityManager.getCurrentIdentity - 获取当前身份完整信息');
    
    const userRole = this.getCurrentRole();
    const userInfo = this.getCurrentUserInfo();
    const profile = this.getProfileByRole(userRole);
    const isLoggedIn = this.isLoggedIn();
    
    const identityInfo = {
      role: userRole,
      userInfo: userInfo,
      profile: profile,
      isLoggedIn: isLoggedIn,
      timestamp: Date.now(),
      sources: {
        globalUserRole: app.globalData.userRole,
        userInfoRole: app.globalData.userInfo?.role,
        storageRole: wx.getStorageSync('userRole'),
        identityContextRole: app.globalData.identityContextManager?.getCurrentRoleType()
      }
    };
    
    console.log('IdentityManager.getCurrentIdentity - 身份信息:', identityInfo);
    return identityInfo;
  }
  
  /**
   * 根据角色获取对应的profile
   * @param {string} role - 角色类型
   * @returns {object} 对应角色的profile
   */
  static getProfileByRole(role) {
    if (role === 'host') {
      return app.globalData.hostInfo || null;
    } else {
      return app.globalData.ownerInfo || null;
    }
  }
  
  /**
   * 同步身份状态到所有页面
   */
  static syncIdentityState() {
    return this.measurePerformance('syncIdentityState', () => {
      // 生产环境可以注释掉这些日志
      // console.log('IdentityManager.syncIdentityState - 同步身份状态');
      
      const currentRole = this.getCurrentRole();
      const previousRole = app.globalData.userRole;
      
      // 跟踪是否有变更
      let hasChanges = false;
      let changeDetails = {};
      
      // 确保全局userRole与当前角色一致
      if (app.globalData.userRole !== currentRole) {
        app.globalData.userRole = currentRole;
        // 只在有变更时输出日志
        console.log('IdentityManager.syncIdentityState - 更新全局userRole:', currentRole);
        hasChanges = true;
        changeDetails.roleChanged = true;
        changeDetails.previousRole = previousRole;
        changeDetails.currentRole = currentRole;
      }
      
      // 确保userInfo.role与当前角色一致
      if (app.globalData.userInfo && app.globalData.userInfo.role !== currentRole) {
        app.globalData.userInfo.role = currentRole;
        // 只在有变更时输出日志
        console.log('IdentityManager.syncIdentityState - 更新userInfo.role:', currentRole);
        hasChanges = true;
        changeDetails.userInfoUpdated = true;
      }
      
      // 保存到本地存储
      try {
        const storedRole = wx.getStorageSync('userRole');
        if (storedRole !== currentRole) {
          wx.setStorageSync('userRole', currentRole);
          // 只在有变更时输出日志
          console.log('IdentityManager.syncIdentityState - 更新存储的userRole:', currentRole);
          hasChanges = true;
          changeDetails.storageUpdated = true;
        }
      } catch (error) {
        console.error('IdentityManager.syncIdentityState - 保存到存储失败:', error);
        // 错误处理：添加到changeDetails
        changeDetails.storageError = error.message;
      }
      
      // 更新身份上下文管理器
      if (app.globalData.identityContextManager) {
        try {
          const contextRole = app.globalData.identityContextManager.getCurrentRoleType();
          if (contextRole !== currentRole) {
            app.globalData.identityContextManager.switchContext(currentRole);
            // 只在有变更时输出日志
            console.log('IdentityManager.syncIdentityState - 更新身份上下文:', currentRole);
            hasChanges = true;
            changeDetails.contextUpdated = true;
          }
        } catch (error) {
          console.error('IdentityManager.syncIdentityState - 更新身份上下文失败:', error);
          // 错误处理：添加到changeDetails
          changeDetails.contextError = error.message;
        }
      }
      
      // 只有有变更时才触发事件
      if (hasChanges) {
        // 批量触发事件，减少事件次数
        this._emitBatchEvents(changeDetails);
      }
      
      // 只在有变更时输出日志
      if (hasChanges) {
        console.log('IdentityManager.syncIdentityState - 身份状态同步完成（有变更）');
      }
      
      return { hasChanges, ...changeDetails };
    });
  }
  
  /**
   * 批量触发事件
   * @private
   * @param {object} changeDetails - 变更详情
   */
  static _emitBatchEvents(changeDetails) {
    const events = [];
    
    // 收集需要触发的事件
    if (changeDetails.roleChanged) {
      events.push({
        name: IDENTITY_EVENTS.ROLE_CHANGED,
        data: {
          previousRole: changeDetails.previousRole,
          currentRole: changeDetails.currentRole,
          timestamp: Date.now()
        }
      });
    }
    
    // 总是触发身份更新事件，包含所有变更信息
    events.push({
      name: IDENTITY_EVENTS.IDENTITY_UPDATED,
      data: {
        role: changeDetails.currentRole || this.getCurrentRole(),
        changes: changeDetails,
        timestamp: Date.now()
      }
    });
    
    // 如果有一致性修复，触发修复事件
    if (changeDetails.consistencyFixed) {
      events.push({
        name: IDENTITY_EVENTS.CONSISTENCY_FIXED,
        data: {
          role: changeDetails.currentRole || this.getCurrentRole(),
          issues: changeDetails.issues || [],
          timestamp: Date.now()
        }
      });
    }
    
    // 批量触发事件
    events.forEach(event => {
      this._emitEvent(event.name, event.data);
    });
  }
  
  /**
   * 验证身份状态一致性
   * @returns {object} 验证结果
   */
  static validateIdentityConsistency() {
    return this.measurePerformance('validateIdentityConsistency', () => {
      console.log('IdentityManager.validateIdentityConsistency - 验证身份一致性');
      
      // 缓存存储结果，减少重复读取
      let storageRole;
      try {
        storageRole = wx.getStorageSync('userRole');
      } catch (error) {
        console.error('IdentityManager.validateIdentityConsistency - 读取存储失败:', error);
        storageRole = null;
      }
      
      const roleSources = {
        globalUserRole: app.globalData.userRole,
        userInfoRole: app.globalData.userInfo?.role,
        storageRole: storageRole,
        identityContextRole: app.globalData.identityContextManager?.getCurrentRoleType()
      };
      
      // 检查所有非空角色是否一致
      const nonEmptyRoles = Object.values(roleSources).filter(role => role && VALID_ROLES.includes(role));
      const isConsistent = nonEmptyRoles.length === 0 || 
                         nonEmptyRoles.every(role => role === nonEmptyRoles[0]);
      
      const result = {
        isConsistent: isConsistent,
        sources: roleSources,
        currentRole: this.getCurrentRole(),
        issues: isConsistent ? [] : this._identifyConsistencyIssues(roleSources),
        timestamp: Date.now()
      };
      
      console.log('IdentityManager.validateIdentityConsistency - 验证结果:', result);
      return result;
    });
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
    return result;
  }
  
  /**
   * 识别身份一致性问题
   * @private
   * @param {object} roleSources 角色来源
   * @returns {array} 问题列表
   */
  static _identifyConsistencyIssues(roleSources) {
    const issues = [];
    
    // 检查各来源之间的不一致
    if (roleSources.globalUserRole && roleSources.userInfoRole && 
        roleSources.globalUserRole !== roleSources.userInfoRole) {
      issues.push('全局userRole与userInfo.role不一致');
    }
    
    if (roleSources.globalUserRole && roleSources.storageRole && 
        roleSources.globalUserRole !== roleSources.storageRole) {
      issues.push('全局userRole与本地存储不一致');
    }
    
    if (roleSources.userInfoRole && roleSources.storageRole && 
        roleSources.userInfoRole !== roleSources.storageRole) {
      issues.push('userInfo.role与本地存储不一致');
    }
    
    if (roleSources.identityContextRole && 
        roleSources.identityContextRole !== roleSources.globalUserRole &&
        roleSources.globalUserRole) {
      issues.push('身份上下文与全局角色不一致');
    }
    
    return issues;
  }
  
  /**
   * 修复身份一致性问题
   * @returns {object} 修复结果
   */
  static fixIdentityConsistency() {
    console.log('IdentityManager.fixIdentityConsistency - 修复身份一致性问题');
    
    const validation = this.validateIdentityConsistency();
    
    if (!validation.isConsistent) {
      console.log('IdentityManager.fixIdentityConsistency - 发现不一致问题，开始修复');
      
      // 使用优先级最高的角色作为标准
      const correctRole = this.getCurrentRole();
      
      // 更新所有来源
      app.globalData.userRole = correctRole;
      
      if (app.globalData.userInfo) {
        app.globalData.userInfo.role = correctRole;
      }
      
      try {
        wx.setStorageSync('userRole', correctRole);
      } catch (error) {
        console.error('IdentityManager.fixIdentityConsistency - 保存到存储失败:', error);
      }
      
      if (app.globalData.identityContextManager) {
        try {
          app.globalData.identityContextManager.switchContext(correctRole);
        } catch (error) {
          console.error('IdentityManager.fixIdentityConsistency - 更新身份上下文失败:', error);
        }
      }
      
      // 触发一致性修复事件
      this._emitEvent(IDENTITY_EVENTS.CONSISTENCY_FIXED, {
        role: correctRole,
        issues: validation.issues,
        timestamp: Date.now()
      });
      
      console.log('IdentityManager.fixIdentityConsistency - 修复完成，使用角色:', correctRole);
      
      return {
        success: true,
        role: correctRole,
        issues: validation.issues
      };
    } else {
      console.log('IdentityManager.fixIdentityConsistency - 身份状态一致，无需修复');
      return {
        success: true,
        role: validation.currentRole,
        issues: []
      };
    }
  }
  
  /**
   * 注册事件监听器
   * @param {string} eventName - 事件名称
   * @param {function} callback - 回调函数
   */
  static on(eventName, callback) {
    if (!app.globalData.identityManager) {
      this.init();
    }
    
    if (!app.globalData.identityManager.events[eventName]) {
      app.globalData.identityManager.events[eventName] = [];
    }
    
    app.globalData.identityManager.events[eventName].push(callback);
    console.log('IdentityManager.on - 注册事件监听器:', eventName);
  }
  
  /**
   * 移除事件监听器
   * @param {string} eventName - 事件名称
   * @param {function} callback - 回调函数
   */
  static off(eventName, callback) {
    if (app.globalData.identityManager && app.globalData.identityManager.events[eventName]) {
      app.globalData.identityManager.events[eventName] = app.globalData.identityManager.events[eventName].filter(cb => cb !== callback);
      console.log('IdentityManager.off - 移除事件监听器:', eventName);
    }
  }
  
  /**
   * 触发事件
   * @private
   * @param {string} eventName - 事件名称
   * @param {object} data - 事件数据
   */
  static _emitEvent(eventName, data) {
    if (app.globalData.identityManager && app.globalData.identityManager.events[eventName]) {
      app.globalData.identityManager.events[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('IdentityManager._emitEvent - 事件回调执行失败:', error);
        }
      });
      console.log('IdentityManager._emitEvent - 触发事件:', eventName, data);
    }
  }
  
  /**
   * 清除身份信息
   */
  static clearIdentity() {
    console.log('IdentityManager.clearIdentity - 清除身份信息');
    
    // 清除全局数据
    app.globalData.userRole = null;
    app.globalData.userInfo = null;
    app.globalData.hostInfo = null;
    app.globalData.ownerInfo = null;
    
    // 清除本地存储
    try {
      wx.removeStorageSync('userRole');
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('hostInfo');
      wx.removeStorageSync('ownerInfo');
    } catch (error) {
      console.error('IdentityManager.clearIdentity - 清除存储失败:', error);
    }
    
    // 清除身份上下文
    if (app.globalData.identityContextManager) {
      try {
        app.globalData.identityContextManager.clearContext();
      } catch (error) {
        console.error('IdentityManager.clearIdentity - 清除身份上下文失败:', error);
      }
    }
    
    console.log('IdentityManager.clearIdentity - 身份信息清除完成');
  }
  
  /**
   * 设置用户角色
   * @param {string} role - 角色类型
   */
  static setRole(role) {
    if (!VALID_ROLES.includes(role)) {
      console.error('IdentityManager.setRole - 无效的角色:', role);
      return;
    }
    
    console.log('IdentityManager.setRole - 设置角色:', role);
    app.globalData.userRole = role;
    this.syncIdentityState();
  }
}

// 导出单例
module.exports = IdentityManager;