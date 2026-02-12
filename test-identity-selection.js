// 测试身份选择流程
// 模拟用户首次登录，验证是否正确触发身份选择页面

const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: 'cloud1-8gvqhsiga3011047',
})

// 初始化全局数据库实例
const db = cloud.database()

async function testIdentitySelection() {
  console.log('开始测试身份选择流程...')
  
  try {
    // 1. 创建一个测试用户（模拟新用户）
    const testOpenid = `test_${Date.now()}`
    console.log('测试用户openid:', testOpenid)
    
    // 2. 调用登录云函数
    console.log('调用登录云函数...')
    const loginResult = await cloud.callFunction({
      name: 'login',
      data: {
        code: 'test_code',
        userInfo: {
          nickName: '测试用户',
          avatarUrl: 'https://example.com/avatar.png',
          role: 'owner'
        }
      }
    })
    
    console.log('登录云函数返回结果:', loginResult)
    
    // 3. 检查返回的角色列表
    const roles = (loginResult.result.data && loginResult.result.data.roles) || []
    console.log('返回的角色列表:', roles)
    console.log('角色数量:', roles.length)
    
    // 4. 验证是否返回空角色列表（新用户应该没有角色）
    if (roles.length === 0) {
      console.log('✅ 测试通过：新用户返回空角色列表，将触发身份选择页面')
    } else {
      console.log('❌ 测试失败：新用户返回了角色列表，不会触发身份选择页面')
    }
    
    // 5. 清理测试数据
    console.log('清理测试数据...')
    // 注意：在实际测试中，可能需要清理创建的用户数据
    
  } catch (error) {
    console.error('测试失败:', error)
  }
}

// 运行测试
testIdentitySelection().then(() => {
  console.log('测试完成')
}).catch((error) => {
  console.error('测试过程中出错:', error)
})
