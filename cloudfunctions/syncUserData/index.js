const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-8gvqhsiga3011047'
})

/**
 * 通用用户数据同步云函数
 * 用于同步和修复用户角色和档案数据
 * 合并了 syncUserRoles 和 fixMissingProfiles 的功能
 * 
 * 参考文档：
 * - 微信云开发官方文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html
 */

// 内部工具函数，避免外部依赖
const generateId = (prefix = '') => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 8)
  let userId = prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`
  
  // 确保长度不超过32字节
  if (userId.length > 32) {
    userId = userId.substring(0, 32)
  }
  
  // 确保只包含允许的字符（字母、数字、下划线）
  userId = userId.replace(/[^a-zA-Z0-9_]/g, '')
  
  return userId
}

const handleError = (error, customMessage = null) => {
  console.error('错误信息:', error.message)
  console.error('错误堆栈:', error.stack)
  
  return {
    code: 9999,
    message: customMessage || '同步用户数据失败',
    error: error.message
  }
}

const handleSuccess = (data = null, message = null) => {
  return {
    code: 0,
    message: message || '操作成功',
    data: data
  }
}

// 批量处理数据的辅助函数
const batchProcess = async (data, handler, batchSize = 10) => {
  const results = []
  
  // 分批处理数据
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          return await handler(item)
        } catch (error) {
          console.error('批量处理错误:', error)
          return { success: false, error: error.message }
        }
      })
    )
    
    results.push(...batchResults)
  }
  
  return results
}

exports.main = async (event, _) => {
  try {
    console.log('开始同步用户数据')
    
    const db = cloud.database()
    
    // 1. 初始化分页参数
    const { pageSize = 100 } = event
    
    // 2. 获取用户总数
    const countResult = await db.collection('users').count()
    const totalUsers = countResult.total
    console.log('总用户数量:', totalUsers)
    
    // 3. 统计结果
    let usersWithRoles = 0
    let rolesCreated = 0
    let usersWithProfiles = 0
    let profilesCreated = 0
    let rolesUpdated = 0
    let errors = []
    
    // 4. 分页获取并处理用户数据
    let hasMore = true
    let currentPage = 1
    
    while (hasMore) {
      // 获取当前页用户数据
      const usersResult = await db.collection('users')
        .skip((currentPage - 1) * pageSize)
        .limit(pageSize)
        .get()
      
      const users = usersResult.data
      console.log(`第 ${currentPage} 页用户数量: ${users.length}`)
      
      // 处理当前页用户数据，使用批量处理优化性能
      await batchProcess(users, async (user) => {
        if (!user._id || !user.openid) {
          console.warn('跳过无效用户（缺少_id或openid）:', user)
          return
        }
        
        console.log(`处理用户 ${user._id}，openid: ${user.openid}`)
        
        try {
          // 4.1 检查并创建角色记录
          // 使用limit(10)优化查询，最多处理10个角色
          const rolesRes = await db.collection('user_roles').where({ userId: user._id }).limit(10).get()
          const userRoles = rolesRes.data || []
          
          if (userRoles.length === 0) {
            // 没有角色记录，创建默认的 owner 角色
            console.log(`用户 ${user._id} 没有角色记录，创建默认 owner 角色`)
            
            // 使用事务处理角色和档案的创建
            const transaction = await db.startTransaction()
            
            try {
              // 检查是否存在 ownerProfiles 记录
              let profileId
              const profileRes = await transaction.collection('ownerProfiles').where({ userId: user._id }).limit(1).get()
              
              if (profileRes.data && profileRes.data.length > 0) {
                // 已有档案记录
                profileId = profileRes.data[0]._id
                usersWithProfiles++
                console.log(`找到已存在的 ownerProfile，profileId: ${profileId}`)
              } else {
                // 没有档案记录，创建新的
                const newProfile = {
                  _id: generateId('ownerprofile'),
                  openid: user.openid,
                  userId: user._id,
                  ownerName: user.nickName || '未设置名称',
                  avatarUrl: user.avatarUrl || '',
                  createdAt: new Date(),
                  updatedAt: new Date()
                }
                
                await transaction.collection('ownerProfiles').add({ data: newProfile })
                profileId = newProfile._id
                profilesCreated++
                usersWithProfiles++
                console.log(`创建 ownerProfile 成功，记录ID: ${profileId}`)
              }
              
              // 创建角色记录
              const newRole = {
                _id: generateId('user_role'),
                userId: user._id,
                openid: user.openid,
                roleType: user.role || 'owner',
                profileId: profileId,
                isActive: true,
                createdAt: new Date()
              }
              
              const addRoleRes = await transaction.collection('user_roles').add({ data: newRole })
              console.log(`创建 user_role 成功，记录ID: ${addRoleRes._id}`)
              
              // 提交事务
              await transaction.commit()
              
              rolesCreated++
              usersWithRoles++
            } catch (txError) {
              // 回滚事务
              await transaction.rollback()
              console.error(`处理用户 ${user._id} 事务回滚:`, txError.message)
              throw txError
            }
          } else {
            // 已有角色记录
            usersWithRoles++
            console.log(`用户 ${user._id} 已有角色记录，数量: ${userRoles.length}`)
            
            // 使用事务处理角色更新
            const transaction = await db.startTransaction()
            
            try {
              // 确保每个角色都有 openid 字段
              for (const role of userRoles) {
                if (!role.openid) {
                  console.log(`为角色 ${role._id} 添加 openid 字段`)
                  await transaction.collection('user_roles').doc(role._id).update({
                    data: {
                      openid: user.openid
                    }
                  })
                  rolesUpdated++
                }
                
                // 检查并创建缺失的档案记录
                if (role.roleType === 'owner') {
                  // 检查是否存在对应的 ownerProfiles 记录
                  const profileRes = await transaction.collection('ownerProfiles').where({ _id: role.profileId }).limit(1).get()
                  if (profileRes.data.length === 0) {
                    // 没有档案记录，创建新的
                    console.log(`用户 ${user._id} 的角色 ${role._id} 缺少 ownerProfile，创建新的`)
                    const newProfile = {
                      _id: generateId('ownerprofile'),
                      openid: user.openid,
                      userId: user._id,
                      ownerName: user.nickName || '未设置名称',
                      avatarUrl: user.avatarUrl || '',
                      createdAt: new Date(),
                      updatedAt: new Date()
                    }
                    
                    await transaction.collection('ownerProfiles').add({ data: newProfile })
                    console.log(`创建 ownerProfile 成功，记录ID: ${newProfile._id}`)
                    
                    // 更新角色记录，关联到新创建的档案
                    await transaction.collection('user_roles').doc(role._id).update({
                      data: {
                        profileId: newProfile._id
                      }
                    })
                    profilesCreated++
                    usersWithProfiles++
                    rolesUpdated++
                  } else {
                    usersWithProfiles++
                  }
                }
              }
              
              // 提交事务
              await transaction.commit()
            } catch (txError) {
              // 回滚事务
              await transaction.rollback()
              console.error(`更新用户 ${user._id} 角色事务回滚:`, txError.message)
              // 继续执行，单个用户失败不影响整体流程
            }
          }
        } catch (error) {
          console.error(`处理用户 ${user._id} 时出错:`, error.message)
          errors.push({
            userId: user._id,
            error: error.message
          })
        }
      }, 10) // 每批处理10个用户
      
      // 检查是否还有更多数据
      currentPage++
      hasMore = users.length === pageSize && currentPage * pageSize <= totalUsers
    }
    
    // 5. 统计最终结果
    const finalResult = {
      totalUsers,
      usersWithRoles,
      rolesCreated,
      usersWithProfiles,
      profilesCreated,
      rolesUpdated,
      errors,
      success: true,
      message: '用户数据同步完成'
    }
    
    console.log('用户数据同步完成，结果:', finalResult)
    
    return handleSuccess(finalResult, '用户数据同步成功')
  } catch (error) {
    return handleError(error, '同步用户数据失败')
  }
}