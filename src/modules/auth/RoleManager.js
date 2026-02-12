/**
 * 身份管理器
 * 负责管理用户身份信息，处理身份切换，提供身份相关操作接口
 */

import { ROLE_TYPE, ROLE_TYPE_MAPPING } from './constants';
import { getErrorHandler } from './ErrorHandler';
import { getUserManager } from './UserManager';

// 导入身份上下文管理器
const { identityContextManager } = require('../../../utils/identityContextManager');

class RoleManager {
  constructor() {
    this.errorHandler = getErrorHandler();
    this.userManager = getUserManager();
    this.roles = [];
  }

  /**
   * 设置角色列表
   * @param {Array} roles - 角色列表
   */
  setRoles(roles) {
    this.roles = roles || [];
    
    // 更新身份上下文管理器中的角色信息
    if (identityContextManager) {
      this.roles.forEach(role => {
        if (role.roleType && role.profile) {
          identityContextManager.updateContext(role.roleType, {
            profile: role.profile,
            updatedAt: Date.now()
          });
        }
      });
    }
  }

  /**
   * 获取角色列表
   * @returns {Array} 角色列表
   */
  getRoles() {
    return this.roles;
  }

  /**
   * 获取角色数量
   * @returns {number} 角色数量
   */
  getRoleCount() {
    return this.roles.length;
  }

  /**
   * 获取指定类型的角色
   * @param {string} roleType - 角色类型
   * @returns {Object|null} 角色信息
   */
  getRoleByType(roleType) {
    return this.roles.find(role => role.roleType === roleType) || null;
  }

  /**
   * 检查是否有指定类型的角色
   * @param {string} roleType - 角色类型
   * @returns {boolean} 是否有指定类型的角色
   */
  hasRole(roleType) {
    return this.getRoleByType(roleType) !== null;
  }

  /**
   * 获取当前活跃角色
   * @returns {Object|null} 当前活跃角色
   */
  getActiveRole() {
    return this.roles.find(role => role.isActive) || null;
  }

  /**
   * 获取当前活跃角色类型
   * @returns {string} 当前活跃角色类型
   */
  getActiveRoleType() {
    const activeRole = this.getActiveRole();
    return activeRole ? activeRole.roleType : this.roles.length > 0 ? this.roles[0].roleType : 'owner';
  }

  /**
   * 切换角色
   * @param {string} roleType - 角色类型
   * @returns {Promise<boolean>} 是否切换成功
   */
  async switchRole(roleType) {
    try {
      console.log('[RoleManager] 切换角色:', roleType);

      // 检查角色是否存在
      const role = this.getRoleByType(roleType);
      if (!role) {
        console.error('[RoleManager] 切换角色失败: 角色不存在');
        return false;
      }

      // 更新角色活跃状态
      this.roles.forEach(r => {
        r.isActive = r.roleType === roleType;
      });

      // 更新用户角色
      this.userManager.setUserRole(roleType);

      // 更新全局变量中的用户角色
      try {
        const appInstance = getApp();
        if (appInstance && appInstance.globalData) {
          appInstance.globalData.userRole = roleType;
          console.log('[RoleManager] 更新全局用户角色:', roleType);
        }
      } catch (error) {
        console.error('[RoleManager] 更新全局用户角色失败:', error);
      }

      // 切换身份上下文
      if (identityContextManager) {
        identityContextManager.switchContext(roleType);
        console.log('[RoleManager] 已切换身份上下文:', roleType);
      } else {
        console.warn('[RoleManager] identityContextManager 未初始化');
      }

      // 触发角色切换事件
      if (getApp().triggerEvent) {
        getApp().triggerEvent('roleChanged', { roleType });
      }

      console.log('[RoleManager] 角色切换成功:', roleType);
      return true;
    } catch (error) {
      console.error('[RoleManager] 切换角色失败:', error);
      return false;
    }
  }

  /**
   * 创建角色
   * @param {string} roleType - 角色类型
   * @param {Object} roleInfo - 角色信息
   * @returns {Promise<boolean>} 是否创建成功
   */
  async createRole(roleType, roleInfo) {
    try {
      console.log('创建角色:', roleType, roleInfo);
      
      // 检查角色类型是否有效
      if (!ROLE_TYPE[roleType.toUpperCase()]) {
        console.error('创建角色失败: 无效的角色类型');
        return false;
      }
      
      // 检查角色是否已存在
      if (this.hasRole(roleType)) {
        console.error('创建角色失败: 角色已存在');
        return false;
      }
      
      // 调用云函数创建角色
      const result = await wx.cloud.callFunction({
        name: 'login',
        data: {
          createRole: true,
          roleType,
          roleInfo
        }
      });
      
      if (result.result.code === 0) {
        // 更新角色列表
        this.setRoles(result.result.data.roles || []);
        
        // 更新用户角色并设置为新创建的角色
        this.userManager.setUserRole(roleType);
        
        // 更新全局变量中的用户角色
        try {
          const appInstance = getApp();
          if (appInstance && appInstance.globalData) {
            appInstance.globalData.userRole = roleType;
            console.log('更新全局用户角色为新创建的角色:', roleType);
          }
        } catch (error) {
          console.error('更新全局用户角色失败:', error);
        }
        
        console.log('角色创建成功:', roleType);
        return true;
      } else {
        console.error('创建角色失败:', result.result.message);
        return false;
      }
    } catch (error) {
      console.error('创建角色失败:', error);
      return false;
    }
  }

  /**
   * 删除角色
   * @param {string} roleType - 角色类型
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteRole(roleType) {
    try {
      console.log('删除角色:', roleType);
      
      // 检查角色是否存在
      if (!this.hasRole(roleType)) {
        console.error('删除角色失败: 角色不存在');
        return false;
      }
      
      // 检查是否是最后一个角色
      if (this.getRoleCount() === 1) {
        console.error('删除角色失败: 不能删除最后一个角色');
        return false;
      }
      
      // 调用云函数删除角色
      const result = await wx.cloud.callFunction({
        name: 'login',
        data: {
          deleteRole: true,
          roleType
        }
      });
      
      if (result.result.code === 0) {
        // 更新角色列表
        this.setRoles(result.result.data.roles || []);
        console.log('角色删除成功:', roleType);
        return true;
      } else {
        console.error('删除角色失败:', result.result.message);
        return false;
      }
    } catch (error) {
      console.error('删除角色失败:', error);
      return false;
    }
  }

  /**
   * 更新角色信息
   * @param {string} roleType - 角色类型
   * @param {Object} roleInfo - 角色信息
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateRole(roleType, roleInfo) {
    try {
      console.log('更新角色:', roleType, roleInfo);
      
      // 检查角色是否存在
      if (!this.hasRole(roleType)) {
        console.error('更新角色失败: 角色不存在');
        return false;
      }
      
      // 调用云函数更新角色
      const result = await wx.cloud.callFunction({
        name: 'login',
        data: {
          updateRole: true,
          roleType,
          roleInfo
        }
      });
      
      if (result.result.code === 0) {
        // 更新角色列表
        this.setRoles(result.result.data.roles || []);
        console.log('角色更新成功:', roleType);
        return true;
      } else {
        console.error('更新角色失败:', result.result.message);
        return false;
      }
    } catch (error) {
      console.error('更新角色失败:', error);
      return false;
    }
  }

  /**
   * 获取角色的短前缀
   * @param {string} roleType - 角色类型
   * @returns {string} 短前缀
   */
  getRoleShortPrefix(roleType) {
    return ROLE_TYPE_MAPPING[roleType] || roleType;
  }

  /**
   * 检查是否需要显示身份选择表单
   * @returns {boolean} 是否需要显示身份选择表单
   */
  needShowIdentitySelection() {
    return this.getRoleCount() > 1;
  }

  /**
   * 获取默认角色类型
   * @returns {string} 默认角色类型
   */
  getDefaultRoleType() {
    // 优先返回活跃角色
    const activeRole = this.getActiveRole();
    if (activeRole) {
      return activeRole.roleType;
    }
    // 否则返回第一个角色
    return this.roles.length > 0 ? this.roles[0].roleType : 'owner';
  }
}

// 导出单例
let roleManagerInstance = null;

export function getRoleManager() {
  if (!roleManagerInstance) {
    roleManagerInstance = new RoleManager();
  }
  return roleManagerInstance;
}

export default RoleManager;
