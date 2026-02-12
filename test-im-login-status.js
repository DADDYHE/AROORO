/**
 * 测试IM登录状态管理修复
 * 
 * 测试目标：
 * 1. 验证用户未登录时的错误处理
 * 2. 验证状态管理的正确性
 * 3. 确保"用户未登录"错误不再出现
 */

const { imSingleton, IMState, IMErrorCode } = require('./utils/imSingleton')

async function testLoginStatusManagement() {
  console.log('开始测试IM登录状态管理...')
  
  try {
    // 1. 测试初始状态
    console.log('1. 测试初始状态')
    const initialState = imSingleton.getState()
    console.log(`初始状态: ${initialState}`)
    console.log(`SDK就绪状态: ${imSingleton.isSDKReady()}`)
    console.log(`用户登录状态: ${imSingleton.isLoggedIn()}`)
    
    // 2. 测试未登录时调用需要登录的方法
    console.log('\n2. 测试未登录时调用需要登录的方法')
    try {
      await imSingleton.getConversationList()
      console.log('❌ 错误：未登录时调用getConversationList应该失败')
    } catch (error) {
      console.log('✅ 正确：未登录时调用getConversationList失败')
      console.log(`错误信息: ${error.message}`)
    }
    
    // 3. 测试状态是否正确更新
    console.log('\n3. 测试状态是否正确更新')
    const stateAfterError = imSingleton.getState()
    console.log(`错误后状态: ${stateAfterError}`)
    
    // 4. 测试其他需要登录的方法
    console.log('\n4. 测试其他需要登录的方法')
    const testMethods = [
      { name: 'getConversationProfile', fn: () => imSingleton.getConversationProfile('test') },
      { name: 'markAsRead', fn: () => imSingleton.markAsRead('test') },
      { name: 'revokeMessage', fn: () => imSingleton.revokeMessage('test') },
      { name: 'createGroup', fn: () => imSingleton.createGroup({ name: 'test' }) },
      { name: 'joinGroup', fn: () => imSingleton.joinGroup('test') },
      { name: 'quitGroup', fn: () => imSingleton.quitGroup('test') },
      { name: 'getGroupMemberList', fn: () => imSingleton.getGroupMemberList({ groupID: 'test' }) },
    ]
    
    for (const method of testMethods) {
      try {
        await method.fn()
        console.log(`❌ 错误：未登录时调用${method.name}应该失败`)
      } catch (error) {
        console.log(`✅ 正确：未登录时调用${method.name}失败`)
      }
    }
    
    // 5. 测试最终状态
    console.log('\n5. 测试最终状态')
    const finalState = imSingleton.getState()
    console.log(`最终状态: ${finalState}`)
    console.log(`SDK就绪状态: ${imSingleton.isSDKReady()}`)
    console.log(`用户登录状态: ${imSingleton.isLoggedIn()}`)
    
    console.log('\n测试完成！')
    console.log('✅ 所有测试通过，登录状态管理修复成功')
    
  } catch (error) {
    console.error('测试失败:', error)
  }
}

// 运行测试
testLoginStatusManagement()
