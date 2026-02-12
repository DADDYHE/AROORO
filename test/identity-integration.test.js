/**
 * 身份管理系统集成测试
 * 验证整合后的身份管理模块功能
 */

// 导入测试工具
const { describe, it, beforeEach, afterEach, expect } = require('@jest/globals');

// 导入集中式身份管理器
const { centralIdentityManager } = require('../utils/CentralIdentityManager');

// 模拟微信小程序环境
if (typeof wx === 'undefined') {
  global.wx = {
    setStorageSync: jest.fn(),
    getStorageSync: jest.fn(),
    removeStorageSync: jest.fn(),
    clearStorageSync: jest.fn(),
  };
}

describe('CentralIdentityManager 集成测试', () => {
  beforeEach(() => {
    // 初始化身份管理器
    centralIdentityManager.init();
    // 清除所有数据
    centralIdentityManager.clearAllContexts();
    centralIdentityManager.logout();
  });

  afterEach(() => {
    // 清除所有数据
    centralIdentityManager.clearAllContexts();
    centralIdentityManager.logout();
  });

  it('should initialize correctly', () => {
    expect(centralIdentityManager).toBeDefined();
    expect(typeof centralIdentityManager.init).toBe('function');
    expect(typeof centralIdentityManager.login).toBe('function');
    expect(typeof centralIdentityManager.logout).toBe('function');
  });

  it('should handle user info operations', () => {
    const userInfo = {
      _id: 'test_user_123',
      openid: 'test_openid_123',
      nickName: '测试用户',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    // 设置用户信息
    const setResult = centralIdentityManager.setUserInfo(userInfo);
    expect(setResult).toBe(true);

    // 获取用户信息
    const retrievedUserInfo = centralIdentityManager.getUserInfo();
    expect(retrievedUserInfo).toEqual(userInfo);
  });

  it('should handle role operations', () => {
    // 设置用户角色
    const setResult = centralIdentityManager.setUserRole('owner');
    expect(setResult).toBe(true);

    // 获取用户角色
    const retrievedRole = centralIdentityManager.getUserRole();
    expect(retrievedRole).toBe('owner');

    // 切换角色
    const switchResult = centralIdentityManager.switchRole('host');
    expect(switchResult).toBe(true);

    // 再次获取用户角色
    const switchedRole = centralIdentityManager.getUserRole();
    expect(switchedRole).toBe('host');
  });

  it('should handle identity contexts', () => {
    // 获取owner上下文
    const ownerContext = centralIdentityManager.getContext('owner');
    expect(ownerContext).toBeDefined();
    expect(ownerContext.roleType).toBe('owner');

    // 获取host上下文
    const hostContext = centralIdentityManager.getContext('host');
    expect(hostContext).toBeDefined();
    expect(hostContext.roleType).toBe('host');
  });

  it('should update identity contexts', () => {
    const contextData = {
      profile: {
        name: '测试用户',
        avatarUrl: 'https://example.com/avatar.jpg',
      },
      openid: 'test_openid_123',
      imUserInfo: {
        userID: 'test_user_id',
        userSig: 'test_user_sig',
        isLoggedIn: false,
        lastLoginTime: null,
      },
    };

    // 更新owner上下文
    const updateResult = centralIdentityManager.updateContext('owner', contextData);
    expect(updateResult).toBe(true);

    // 获取更新后的上下文
    const updatedContext = centralIdentityManager.getContext('owner');
    expect(updatedContext.profile).toEqual(contextData.profile);
    expect(updatedContext.openid).toBe(contextData.openid);
    expect(updatedContext.imUserInfo).toEqual(contextData.imUserInfo);
  });

  it('should handle UserSig operations', () => {
    const userSig = 'test_user_sig_123';

    // 设置UserSig
    const setResult = centralIdentityManager.setUserSig(userSig);
    expect(setResult).toBe(true);

    // 获取UserSig
    const retrievedUserSig = centralIdentityManager.getUserSig();
    expect(retrievedUserSig).toBe(userSig);
  });

  it('should handle token operations', () => {
    const token = 'test_token_123';

    // 设置token
    const setResult = centralIdentityManager.setToken(token);
    expect(setResult).toBe(true);

    // 获取token
    const retrievedToken = centralIdentityManager.getToken();
    expect(retrievedToken).toBe(token);
  });

  it('should handle storage operations', () => {
    const key = 'test_key';
    const value = 'test_value';

    // 设置存储
    const setResult = centralIdentityManager.set(key, value);
    expect(setResult).toBe(true);

    // 获取存储
    const retrievedValue = centralIdentityManager.get(key);
    expect(retrievedValue).toBe(value);

    // 移除存储
    const removeResult = centralIdentityManager.remove(key);
    expect(removeResult).toBe(true);

    // 再次获取存储
    const removedValue = centralIdentityManager.get(key);
    expect(removedValue).toBe(null);
  });

  it('should handle login and logout operations', () => {
    const userInfo = {
      _id: 'test_user_123',
      openid: 'test_openid_123',
      nickName: '测试用户',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    const loginResult = centralIdentityManager.login(userInfo, 'owner');
    expect(loginResult.success).toBe(true);

    expect(centralIdentityManager.isLoggedIn()).toBe(true);

    const logoutResult = centralIdentityManager.logout();
    expect(logoutResult).toBe(true);

    expect(centralIdentityManager.isLoggedIn()).toBe(false);
  });

  it('should handle role switching', () => {
    const userInfo = {
      _id: 'test_user_123',
      openid: 'test_openid_123',
      nickName: '测试用户',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    // 登录为owner
    centralIdentityManager.login(userInfo, 'owner');
    expect(centralIdentityManager.getUserRole()).toBe('owner');

    // 切换到host
    const switchResult = centralIdentityManager.switchRole('host');
    expect(switchResult).toBe(true);
    expect(centralIdentityManager.getUserRole()).toBe('host');

    // 切换回owner
    const switchBackResult = centralIdentityManager.switchRole('owner');
    expect(switchBackResult).toBe(true);
    expect(centralIdentityManager.getUserRole()).toBe('owner');
  });

  it('should handle batch identity updates', () => {
    const identities = [
      {
        roleType: 'owner',
        profile: {
          name: '宠物主人',
          avatarUrl: 'https://example.com/owner.jpg',
        },
        openid: 'test_openid_123',
      },
      {
        roleType: 'host',
        profile: {
          name: '寄养家庭',
          avatarUrl: 'https://example.com/host.jpg',
        },
        openid: 'test_openid_123',
      },
    ];

    const updateResult = centralIdentityManager.batchUpdateIdentities(identities);
    expect(updateResult).toBe(true);

    // 检查owner身份
    const ownerContext = centralIdentityManager.getContext('owner');
    expect(ownerContext.profile.name).toBe('宠物主人');

    // 检查host身份
    const hostContext = centralIdentityManager.getContext('host');
    expect(hostContext.profile.name).toBe('寄养家庭');
  });

  it('should get identity summary', () => {
    const userInfo = {
      _id: 'test_user_123',
      openid: 'test_openid_123',
      nickName: '测试用户',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    centralIdentityManager.setUserInfo(userInfo);
    centralIdentityManager.setUserRole('owner');

    const summary = centralIdentityManager.getIdentitySummary();
    expect(summary).toBeDefined();
    expect(summary.currentRole).toBe('owner');
    expect(summary.hasUserInfo).toBe(true);
    expect(summary.contexts).toBeDefined();
  });

  it('should validate identity data', () => {
    const userInfo = {
      _id: 'test_user_123',
      openid: 'test_openid_123',
      nickName: '测试用户',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    centralIdentityManager.setUserInfo(userInfo);
    centralIdentityManager.setUserRole('owner');

    const validationResult = centralIdentityManager.validateIdentityData();
    expect(validationResult.isValid).toBe(true);
  });

  it('should handle incomplete user info', () => {
    const incompleteUserInfo = {
      _id: 'test_user_123',
      // 缺少openid
      nickName: '测试用户',
    };

    centralIdentityManager.setUserInfo(incompleteUserInfo);
    centralIdentityManager.setUserRole('owner');

    const validationResult = centralIdentityManager.validateIdentityData();
    expect(validationResult.isValid).toBe(false);
    expect(validationResult.missingFields).toContain('openid');
  });

  it('should fix identity data', () => {
    const incompleteUserInfo = {
      _id: 'test_user_123',
      // 缺少openid
      nickName: '测试用户',
    };

    centralIdentityManager.setUserInfo(incompleteUserInfo);
    centralIdentityManager.setUserRole('owner');

    const fixResult = centralIdentityManager.fixIdentityData();
    expect(fixResult.isFixed).toBe(true);

    const fixedUserInfo = centralIdentityManager.getUserInfo();
    expect(fixedUserInfo.openid).toBeDefined();
  });
});

// 测试身份管理系统的集成
describe('Identity Management System Integration', () => {
  beforeEach(() => {
    // 初始化身份管理器
    centralIdentityManager.init();
    // 清除所有数据
    centralIdentityManager.clearAllContexts();
    centralIdentityManager.logout();
  });

  afterEach(() => {
    // 清除所有数据
    centralIdentityManager.clearAllContexts();
    centralIdentityManager.logout();
  });

  it('should handle complete login flow', () => {
    const userInfo = {
      _id: 'test_user_123',
      openid: 'test_openid_123',
      nickName: '测试用户',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    const userRole = 'owner';
    const userSig = 'test_user_sig_123';
    const token = 'test_token_123';

    // 1. 登录
    const loginResult = centralIdentityManager.login(userInfo, userRole);
    expect(loginResult.success).toBe(true);

    // 2. 设置UserSig和token
    centralIdentityManager.setUserSig(userSig);
    centralIdentityManager.setToken(token);

    // 3. 验证登录状态
    expect(centralIdentityManager.isLoggedIn()).toBe(true);
    expect(centralIdentityManager.getUserRole()).toBe(userRole);
    expect(centralIdentityManager.getUserInfo()).toEqual(userInfo);
    expect(centralIdentityManager.getUserSig()).toBe(userSig);
    expect(centralIdentityManager.getToken()).toBe(token);

    // 4. 切换角色
    const switchResult = centralIdentityManager.switchRole('host');
    expect(switchResult).toBe(true);
    expect(centralIdentityManager.getUserRole()).toBe('host');

    // 5. 退出登录
    const logoutResult = centralIdentityManager.logout();
    expect(logoutResult).toBe(true);
    expect(centralIdentityManager.isLoggedIn()).toBe(false);
  });

  it('should handle multiple identities', () => {
    // 1. 登录为owner
    const ownerInfo = {
      _id: 'test_owner_123',
      openid: 'test_openid_123',
      nickName: '宠物主人',
      avatarUrl: 'https://example.com/owner.jpg',
    };

    centralIdentityManager.login(ownerInfo, 'owner');
    expect(centralIdentityManager.getUserRole()).toBe('owner');

    // 2. 切换到host
    const hostInfo = {
      _id: 'test_host_123',
      openid: 'test_openid_123',
      nickName: '寄养家庭',
      avatarUrl: 'https://example.com/host.jpg',
    };

    // 更新host上下文
    centralIdentityManager.updateContext('host', {
      profile: hostInfo,
      openid: hostInfo.openid,
      imUserInfo: {
        userID: 'test_host_user_id',
        userSig: 'test_host_user_sig',
        isLoggedIn: false,
        lastLoginTime: null,
      },
    });

    // 切换角色
    const switchResult = centralIdentityManager.switchRole('host');
    expect(switchResult).toBe(true);
    expect(centralIdentityManager.getUserRole()).toBe('host');

    // 3. 切换回owner
    const switchBackResult = centralIdentityManager.switchRole('owner');
    expect(switchBackResult).toBe(true);
    expect(centralIdentityManager.getUserRole()).toBe('owner');
  });
});
