/**
 * 测试消息页面会话列表显示
 * 模拟发送消息，验证会话列表是否能正确显示
 */

const app = {
  globalData: {
    userInfo: {
      _id: 'test_user_123',
      openid: 'test_openid_123',
      userID: 'own_test_openid_123',
      nickName: '测试用户',
      avatarUrl: 'https://example.com/avatar.jpg',
      role: 'owner'
    },
    userRole: 'owner'
  }
};

// 模拟wx对象
global.wx = {
  getStorageSync: (key) => {
    if (key === 'userInfo') {
      return app.globalData.userInfo;
    }
    return null;
  },
  setStorageSync: (key, value) => {
    console.log(`设置存储: ${key} = ${JSON.stringify(value)}`);
  },
  showToast: (options) => {
    console.log(`显示提示: ${options.title}`);
  }
};

// 导入MessageService
const MessageService = require('./utils/messageService');

async function testConversationList() {
  console.log('开始测试消息页面会话列表显示...');
  
  try {
    // 1. 测试获取空会话列表
    console.log('\n1. 测试获取空会话列表:');
    const emptyResult = await MessageService.getConversations({ count: 20 });
    console.log('空会话列表结果:', emptyResult);
    
    if (emptyResult.code === 0 && emptyResult.data.length === 0) {
      console.log('✅ 空会话列表获取成功');
    } else {
      console.log('❌ 空会话列表获取失败');
    }
    
    // 2. 测试发送消息创建会话
    console.log('\n2. 测试发送消息创建会话:');
    const sendResult = await MessageService.sendMessage('测试消息内容', 'hst_test_openid_456', 'host');
    console.log('消息发送结果:', sendResult);
    
    if (sendResult.code === 0) {
      console.log('✅ 消息发送成功，应该创建了会话');
    } else {
      console.log('❌ 消息发送失败:', sendResult.message);
    }
    
    // 3. 测试获取会话列表（应该有一个会话）
    console.log('\n3. 测试获取会话列表（应该有一个会话）:');
    const conversationResult = await MessageService.getConversations({ count: 20 });
    console.log('会话列表结果:', conversationResult);
    
    if (conversationResult.code === 0) {
      console.log(`✅ 会话列表获取成功，会话数量: ${conversationResult.data.length}`);
      
      if (conversationResult.data.length > 0) {
        console.log('✅ 会话列表不为空，显示正确');
        // 打印第一个会话的详细信息
        const firstConversation = conversationResult.data[0];
        console.log('第一个会话信息:', {
          conversationID: firstConversation.conversationID,
          type: firstConversation.type,
          userProfile: firstConversation.userProfile,
          lastMessage: firstConversation.lastMessage,
          unreadCount: firstConversation.unreadCount
        });
      } else {
        console.log('⚠️  会话列表仍然为空，可能需要等待IM SDK同步');
      }
    } else {
      console.log('❌ 会话列表获取失败:', conversationResult.message);
    }
    
    console.log('\n测试完成！');
    
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

// 运行测试
testConversationList();
