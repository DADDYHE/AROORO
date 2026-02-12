/**
 * 测试登录云函数
 * 验证重新创建的登录云函数是否正常工作
 */

const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: 'cloud1-8gvqhsiga3011047'
})

// 模拟登录云函数的调用
async function testLoginCloudFunction() {
  try {
    console.log('=== 测试登录云函数开始 ===')
    
    // 调用登录云函数
    const result = await cloud.callFunction({
      name: 'login',
      data: {
        code: 'test_code' // 测试用的code
      }
    })
    
    console.log('登录云函数调用结果:', JSON.stringify(result, null, 2))
    
    if (result.result) {
      console.log('云函数返回码:', result.result.code)
      console.log('云函数返回消息:', result.result.message)
      
      if (result.result.code === 0) {
        console.log('✅ 登录云函数调用成功')
        console.log('用户信息:', JSON.stringify(result.result.data.userInfo, null, 2))
        console.log('角色列表:', JSON.stringify(result.result.data.roles, null, 2))
        console.log('当前角色:', JSON.stringify(result.result.data.currentRole, null, 2))
        console.log('当前档案:', JSON.stringify(result.result.data.currentProfile, null, 2))
      } else {
        console.log('❌ 登录云函数调用失败:', result.result.message)
      }
    } else {
      console.log('❌ 登录云函数调用异常:', result)
    }
    
    console.log('=== 测试登录云函数结束 ===')
  } catch (error) {
    console.error('测试登录云函数失败:', error)
    console.log('=== 测试登录云函数结束 ===')
  }
}

// 运行测试
testLoginCloudFunction()
