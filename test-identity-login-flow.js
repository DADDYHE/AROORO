// 测试身份选择登录流程
// 模拟不同场景下的登录，验证身份选择逻辑是否正确

const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: 'cloud1-8gvqhsiga3011047',
})

// 初始化全局数据库实例
const db = cloud.database()

async function testIdentityLoginFlow() {
  console.log('开始测试身份选择登录流程...')
  
  try {
    // 1. 测试场景1：新用户登录（没有身份）
    console.log('\n=== 测试场景1：新用户登录（没有身份）===')
    const newUserOpenid = `test_new_user_${Date.now()}`
    console.log('新用户openid:', newUserOpenid)
    
    // 调用登录云函数
    const newUserLoginResult = await cloud.callFunction({
      name: 'login',
      data: {
        code: 'test_code',
        userInfo: {
          nickName: '新测试用户',
          avatarUrl: 'https://example.com/avatar.png',
          role: 'owner'
        }
      }
    })
    
    console.log('新用户登录云函数返回结果:', newUserLoginResult)
    
    // 检查返回的角色列表
    const newUserRoles = (newUserLoginResult.result.data && newUserLoginResult.result.data.roles) || []
    console.log('新用户返回的角色列表:', newUserRoles)
    console.log('新用户角色数量:', newUserRoles.length)
    
    // 验证是否返回空角色列表（新用户应该没有角色）
    if (newUserRoles.length === 0) {
      console.log('✅ 测试通过：新用户返回空角色列表，将触发身份选择页面')
    } else {
      console.log('❌ 测试失败：新用户返回了角色列表，不会触发身份选择页面')
    }
    
    // 2. 测试场景2：已有单一身份的用户登录
    console.log('\n=== 测试场景2：已有单一身份的用户登录 ===')
    const singleRoleUserOpenid = `test_single_role_user_${Date.now()}`
    console.log('单一身份用户openid:', singleRoleUserOpenid)
    
    // 先创建一个用户并添加一个角色
    const createUserResult = await cloud.callFunction({
      name: 'login',
      data: {
        code: 'test_code',
        userInfo: {
          nickName: '单一身份测试用户',
          avatarUrl: 'https://example.com/avatar.png',
          role: 'owner'
        }
      }
    })
    
    if (createUserResult.result.code === 0) {
      const userId = createUserResult.result.userInfo._id
      console.log('创建的用户ID:', userId)
      
      // 为用户添加一个角色
      const newRole = {
        _id: `role_${Date.now()}`,
        userId: userId,
        openid: singleRoleUserOpenid,
        roleType: 'owner',
        profileId: `profile_${Date.now()}`,
        isActive: true,
        createdAt: new Date(),
      }
      
      await db.collection('user_roles').add({ data: newRole })
      console.log('为用户添加了一个角色:', newRole.roleType)
      
      // 再次调用登录云函数
      const singleRoleLoginResult = await cloud.callFunction({
        name: 'login',
        data: {
          code: 'test_code',
          userInfo: {
            nickName: '单一身份测试用户',
            avatarUrl: 'https://example.com/avatar.png',
            role: 'owner'
          }
        }
      })
      
      console.log('单一身份用户登录云函数返回结果:', singleRoleLoginResult)
      
      // 检查返回的角色列表
      const singleRoleUserRoles = (singleRoleLoginResult.result.data && singleRoleLoginResult.result.data.roles) || []
      console.log('单一身份用户返回的角色列表:', singleRoleUserRoles)
      console.log('单一身份用户角色数量:', singleRoleUserRoles.length)
      
      // 验证是否返回单一角色
      if (singleRoleUserRoles.length === 1) {
        console.log('✅ 测试通过：单一身份用户返回单个角色，将直接登录')
      } else {
        console.log('❌ 测试失败：单一身份用户返回了多个角色，会触发身份选择页面')
      }
    } else {
      console.error('创建测试用户失败:', createUserResult.result.message)
    }
    
    // 3. 测试场景3：已有多个身份的用户登录
    console.log('\n=== 测试场景3：已有多个身份的用户登录 ===')
    const multiRoleUserOpenid = `test_multi_role_user_${Date.now()}`
    console.log('多个身份用户openid:', multiRoleUserOpenid)
    
    // 先创建一个用户并添加多个角色
    const createMultiRoleUserResult = await cloud.callFunction({
      name: 'login',
      data: {
        code: 'test_code',
        userInfo: {
          nickName: '多个身份测试用户',
          avatarUrl: 'https://example.com/avatar.png',
          role: 'owner'
        }
      }
    })
    
    if (createMultiRoleUserResult.result.code === 0) {
      const multiRoleUserId = createMultiRoleUserResult.result.userInfo._id
      console.log('创建的多个身份用户ID:', multiRoleUserId)
      
      // 为用户添加两个角色
      const role1 = {
        _id: `role1_${Date.now()}`,
        userId: multiRoleUserId,
        openid: multiRoleUserOpenid,
        roleType: 'owner',
        profileId: `profile1_${Date.now()}`,
        isActive: true,
        createdAt: new Date(),
      }
      
      const role2 = {
        _id: `role2_${Date.now()}`,
        userId: multiRoleUserId,
        openid: multiRoleUserOpenid,
        roleType: 'host',
        profileId: `profile2_${Date.now()}`,
        isActive: false,
        createdAt: new Date(),
      }
      
      await db.collection('user_roles').add({ data: role1 })
      await db.collection('user_roles').add({ data: role2 })
      console.log('为用户添加了两个角色: owner 和 host')
      
      // 再次调用登录云函数
      const multiRoleLoginResult = await cloud.callFunction({
        name: 'login',
        data: {
          code: 'test_code',
          userInfo: {
            nickName: '多个身份测试用户',
            avatarUrl: 'https://example.com/avatar.png',
            role: 'owner'
          }
        }
      })
      
      console.log('多个身份用户登录云函数返回结果:', multiRoleLoginResult)
      
      // 检查返回的角色列表
      const multiRoleUserRoles = (multiRoleLoginResult.result.data && multiRoleLoginResult.result.data.roles) || []
      console.log('多个身份用户返回的角色列表:', multiRoleUserRoles)
      console.log('多个身份用户角色数量:', multiRoleUserRoles.length)
      
      // 验证是否返回多个角色
      if (multiRoleUserRoles.length >= 2) {
        console.log('✅ 测试通过：多个身份用户返回多个角色，将触发身份选择页面')
      } else {
        console.log('❌ 测试失败：多个身份用户返回的角色数量不足，不会触发身份选择页面')
      }
    } else {
      console.error('创建多个身份测试用户失败:', createMultiRoleUserResult.result.message)
    }
    
    console.log('\n=== 测试完成 ===')
    console.log('所有测试场景已执行完毕')
    
  } catch (error) {
    console.error('测试过程中出错:', error)
  }
}

// 运行测试
testIdentityLoginFlow().then(() => {
  console.log('测试完成')
}).catch((error) => {
  console.error('测试过程中出错:', error)
})
