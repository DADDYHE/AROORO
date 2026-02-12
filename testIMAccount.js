/**
 * IM服务账号测试脚本
 * 用于验证寄养家庭身份的IM服务ID是否已正确注册
 */

const IMAccountChecker = require('./utils/imAccountChecker');

/**
 * 测试寄养家庭身份的IM服务账号注册状态
 */
async function testHostIMAccount() {
  try {
    console.log('=== 开始测试寄养家庭身份IM服务账号 ===');

    // 测试1: 检查寄养家庭身份的IM服务账号状态
    console.log('\n1. 检查寄养家庭身份的IM服务账号状态:');
    const hostResult = await IMAccountChecker.checkCurrentUserIMAccount('host');
    console.log('寄养家庭账号检查结果:', hostResult);

    if (hostResult.success) {
      const { data } = hostResult;
      console.log('\n寄养家庭账号详细信息:');
      console.log('  用户ID:', data.userID);
      console.log('  角色类型:', data.roleType);
      console.log('  账号状态:', data.accountStatus);
      console.log('  状态描述:', IMAccountChecker.getAccountStatusDescription(data.accountStatus));
      console.log('  UserSig生成:', data.userSigGenerated ? '成功' : '失败');
      console.log('  UserSig长度:', data.userSigLength);
      console.log('  数据库检查:');
      console.log('    有用户记录:', data.databaseCheck.hasUserRecord);
      console.log('    有角色记录:', data.databaseCheck.hasRoleRecord);
      console.log('  权限配置:');
      console.log('    可发送消息:', data.permissions.canSendMessage);
      console.log('    可接收消息:', data.permissions.canReceiveMessage);
      console.log('    可创建会话:', data.permissions.canCreateConversation);
    }

    // 测试2: 对比检查宠物主人身份的IM服务账号状态
    console.log('\n2. 对比检查宠物主人身份的IM服务账号状态:');
    const ownerResult = await IMAccountChecker.checkCurrentUserIMAccount('owner');
    console.log('宠物主人账号检查结果:', ownerResult);

    if (ownerResult.success) {
      const { data } = ownerResult;
      console.log('\n宠物主人账号详细信息:');
      console.log('  用户ID:', data.userID);
      console.log('  角色类型:', data.roleType);
      console.log('  账号状态:', data.accountStatus);
      console.log('  状态描述:', IMAccountChecker.getAccountStatusDescription(data.accountStatus));
    }

    // 测试3: 批量检查两个角色的账号状态
    console.log('\n3. 批量检查两个角色的账号状态:');
    const batchResult = await IMAccountChecker.batchCheckIMAccounts(['host', 'owner']);
    console.log('批量检查结果:', batchResult);

    // 测试4: 验证寄养家庭账号是否已激活
    console.log('\n4. 验证寄养家庭账号是否已激活:');
    if (hostResult.success && hostResult.data) {
      const isActivated = await IMAccountChecker.isIMAccountActivated(
        hostResult.data.userID,
        hostResult.data.databaseCheck.roleRecord?.openid || '',
        'host'
      );
      console.log('寄养家庭账号激活状态:', isActivated ? '已激活' : '未激活');
    }

    console.log('\n=== 测试完成 ===');

    // 生成测试报告
    const testReport = {
      timestamp: new Date().toISOString(),
      hostAccount: hostResult,
      ownerAccount: ownerResult,
      batchCheck: batchResult,
      summary: {
        hostStatus: hostResult.success ? hostResult.data?.accountStatus : '检查失败',
        ownerStatus: ownerResult.success ? ownerResult.data?.accountStatus : '检查失败',
        hostActivated: hostResult.success && hostResult.data?.accountStatus === '已激活',
        ownerActivated: ownerResult.success && ownerResult.data?.accountStatus === '已激活'
      }
    };

    console.log('\n=== 测试报告 ===');
    console.log(JSON.stringify(testReport, null, 2));

    return testReport;
  } catch (error) {
    console.error('测试IM服务账号时出错:', error);
    return {
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// 运行测试
if (require.main === module) {
  testHostIMAccount().then(report => {
    console.log('\n测试结果:', report);
  }).catch(error => {
    console.error('测试失败:', error);
  });
}

module.exports = { testHostIMAccount };
