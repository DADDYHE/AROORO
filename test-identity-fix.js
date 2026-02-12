/**
 * 测试身份不一致修复
 * 验证修复后的身份管理系统是否能够正确处理身份一致性问题
 */

// 模拟应用实例
const mockApp = {
  globalData: {
    identityContextManager: {
      getCurrentRoleType: () => 'owner',
      getCurrentContext: () => {
        return {
          roleType: 'owner',
          profile: {
            openid: 'oNIhl17JEstp_WtKcSq',
            name: '宠物主人'
          },
          imUserInfo: {
            userID: 'owner_oNIhl17JEstp_WtKcSq',
            userSig: 'test_user_sig',
            isLoggedIn: true
          },
          permissions: {}
        };
      },
      getContext: (roleType) => {
        return {
          roleType,
          profile: {
            openid: 'oNIhl17JEstp_WtKcSq',
            name: roleType === 'owner' ? '宠物主人' : '寄养家庭'
          },
          imUserInfo: {
            userID: `${roleType}_oNIhl17JEstp_WtKcSq`,
            userSig: 'test_user_sig',
            isLoggedIn: true
          },
          permissions: {}
        };
      },
      switchContext: (roleType) => {
        console.log('切换身份上下文:', roleType);
        mockApp.globalData.identityContextManager.getCurrentRoleType = () => roleType;
        mockApp.globalData.identityContextManager.getCurrentContext = () => {
          return {
            roleType,
            profile: {
              openid: 'oNIhl17JEstp_WtKcSq',
              name: roleType === 'owner' ? '宠物主人' : '寄养家庭'
            },
            imUserInfo: {
              userID: `${roleType}_oNIhl17JEstp_WtKcSq`,
              userSig: 'test_user_sig',
              isLoggedIn: true
            },
            permissions: {}
          };
        };
        return true;
      },
      hasContext: (roleType) => true
    },
    currentRole: {
      roleType: 'owner',
      profile: {
        openid: 'oNIhl17JEstp_WtKcSq',
        name: '宠物主人'
      }
    },
    currentProfile: {
      openid: 'oNIhl17JEstp_WtKcSq',
      name: '宠物主人'
    },
    userRole: 'owner',
    ownerInfo: {
      openid: 'oNIhl17JEstp_WtKcSq',
      name: '宠物主人'
    },
    hostInfo: {
      openid: 'oNIhl17JEstp_WtKcSq',
      name: '寄养家庭'
    }
  }
};

// 测试身份一致性修复
async function testIdentityFix() {
  console.log('=== 测试身份不一致修复 ===\n');
  
  // 导入身份工具函数
  const { 
    getCurrentRoleType, 
    getCurrentIdentity, 
    isIdentityConsistent, 
    fixIdentityInconsistency,
    getRoleDisplayName
  } = require('./utils/identityUtils');
  
  // 测试1: 正常情况 - 身份一致
  console.log('测试1: 正常情况 - 身份一致');
  console.log('当前身份类型:', getCurrentRoleType(mockApp));
  console.log('身份是否一致:', isIdentityConsistent(mockApp));
  console.log('当前身份信息:', getCurrentIdentity(mockApp));
  console.log('');
  
  // 测试2: 模拟身份不一致情况
  console.log('测试2: 模拟身份不一致情况');
  // 修改globalData，模拟身份不一致
  mockApp.globalData.currentRole.roleType = 'host';
  mockApp.globalData.userRole = 'host';
  // 但身份上下文管理器仍然返回owner
  mockApp.globalData.identityContextManager.getCurrentRoleType = () => 'owner';
  
  console.log('修改后:');
  console.log('  身份上下文管理器:', mockApp.globalData.identityContextManager.getCurrentRoleType());
  console.log('  currentRole.roleType:', mockApp.globalData.currentRole.roleType);
  console.log('  userRole:', mockApp.globalData.userRole);
  console.log('  身份是否一致:', isIdentityConsistent(mockApp));
  console.log('');
  
  // 测试3: 修复身份不一致
  console.log('测试3: 修复身份不一致');
  const fixedRole = fixIdentityInconsistency(mockApp);
  console.log('修复后的身份类型:', fixedRole);
  console.log('修复后身份是否一致:', isIdentityConsistent(mockApp));
  console.log('');
  
  // 测试4: 获取身份显示名称
  console.log('测试4: 获取身份显示名称');
  console.log('owner 显示名称:', getRoleDisplayName('owner'));
  console.log('host 显示名称:', getRoleDisplayName('host'));
  console.log('');
  
  // 测试5: 模拟页面获取身份信息
  console.log('测试5: 模拟页面获取身份信息');
  
  // 模拟首页获取身份信息
  function getHomePageIdentity(app) {
    const { getCurrentRoleType, getCurrentIdentity } = require('./utils/identityUtils');
    const roleType = getCurrentRoleType(app);
    const identity = getCurrentIdentity(app);
    return {
      page: '首页',
      roleType,
      roleDisplayName: getRoleDisplayName(roleType),
      profileName: identity.profile.name
    };
  }
  
  // 模拟其他页面获取身份信息
  function getOtherPageIdentity(app) {
    const { getCurrentRoleType, getCurrentIdentity } = require('./utils/identityUtils');
    const roleType = getCurrentRoleType(app);
    const identity = getCurrentIdentity(app);
    return {
      page: '其他页面',
      roleType,
      roleDisplayName: getRoleDisplayName(roleType),
      profileName: identity.profile.name
    };
  }
  
  const homeIdentity = getHomePageIdentity(mockApp);
  const otherIdentity = getOtherPageIdentity(mockApp);
  
  console.log('首页身份:', homeIdentity);
  console.log('其他页面身份:', otherIdentity);
  console.log('身份是否一致:', homeIdentity.roleType === otherIdentity.roleType);
  console.log('');
  
  // 测试6: 切换身份
  console.log('测试6: 切换身份');
  
  // 模拟身份切换
  function simulateRoleSwitch(app, targetRoleType) {
    // 导入身份工具函数
    const { fixIdentityInconsistency } = require('./utils/identityUtils');
    
    // 更新身份上下文管理器
    app.globalData.identityContextManager.switchContext(targetRoleType);
    
    // 更新globalData
    app.globalData.currentRole.roleType = targetRoleType;
    app.globalData.userRole = targetRoleType;
    app.globalData.currentProfile = {
      openid: 'oNIhl17JEstp_WtKcSq',
      name: targetRoleType === 'owner' ? '宠物主人' : '寄养家庭'
    };
    
    // 修复身份一致性
    return fixIdentityInconsistency(app);
  }
  
  // 切换到寄养家庭身份
  const switchedRole = simulateRoleSwitch(mockApp, 'host');
  console.log('切换后身份类型:', switchedRole);
  
  // 再次检查页面身份
  const homeIdentityAfterSwitch = getHomePageIdentity(mockApp);
  const otherIdentityAfterSwitch = getOtherPageIdentity(mockApp);
  
  console.log('切换后首页身份:', homeIdentityAfterSwitch);
  console.log('切换后其他页面身份:', otherIdentityAfterSwitch);
  console.log('切换后身份是否一致:', homeIdentityAfterSwitch.roleType === otherIdentityAfterSwitch.roleType);
  
  console.log('\n=== 测试完成 ===');
}

// 运行测试
testIdentityFix().catch(console.error);
