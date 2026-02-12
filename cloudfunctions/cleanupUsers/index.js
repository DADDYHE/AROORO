const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-8gvqhsiga3011047'
})

const db = cloud.database()

// 内部工具函数，避免外部依赖
const handleError = (error, customMessage = null) => {
  console.error('错误信息:', error.message)
  console.error('错误堆栈:', error.stack)
  
  return {
    code: 9999,
    message: customMessage || '清理用户记录失败',
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

// 分页获取数据的辅助函数
const paginate = async (collection, options = {}) => {
  const { page = 1, pageSize = 100, where = {}, orderBy = { field: '_id', direction: 'asc' } } = options
  
  const offset = (page - 1) * pageSize
  
  // 构建查询
  let query = collection.where(where)
  
  // 添加排序
  query = query.orderBy(orderBy.field, orderBy.direction)
  
  // 获取总数
  const countResult = await query.count()
  const total = countResult.total
  
  // 获取数据
  const dataResult = await query.skip(offset).limit(pageSize).get()
  
  return {
    data: dataResult.data,
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: Math.ceil(total / pageSize),
    hasNext: page * pageSize < total
  }
}

// 清理异常用户记录的云函数
exports.main = async (event, context) => {
  try {
    console.log('开始清理异常用户记录')
    
    // 1. 初始化参数
    const pageSize = 100 // 每页处理100个用户
    let cleanedCount = 0
    const cleanedUsers = []
    let totalUsers = 0
    
    // 2. 使用分页查询处理所有用户
    let hasMore = true
    let currentPage = 1
    
    while (hasMore) {
      console.log(`处理第 ${currentPage} 页，每页 ${pageSize} 个用户`)
      
      // 使用分页查询获取用户数据
      const pageResult = await paginate(db.collection('users'), {
        page: currentPage,
        pageSize: pageSize,
        orderBy: { field: '_id', direction: 'asc' }
      })
      
      totalUsers = pageResult.total
      const users = pageResult.data
      
      console.log(`第 ${currentPage} 页查询到 ${users.length} 个用户`)
      
      // 遍历当前页用户记录，清理异常记录
      for (const user of users) {
        console.log('检查用户:', user._id)
        
        let shouldClean = false
        let reason = ''
        
        // 检查是否缺少openid
        if (!user.openid || user.openid === '') {
          shouldClean = true
          reason = '缺少openid'
        } 
        // 检查是否是临时用户
        else if (user._id && user._id.startsWith('temp_')) {
          shouldClean = true
          reason = '临时用户记录'
        }
        // 检查是否是重复用户（通过openid判断）
        else if (user.openid) {
          const duplicateResult = await db.collection('users')
            .where({ openid: user.openid })
            .orderBy('createdAt', 'asc')
            .get()
          
          if (duplicateResult.data && duplicateResult.data.length > 1) {
            // 保留最早创建的用户记录，删除其他重复记录
            const earliestUser = duplicateResult.data[0]
            if (user._id !== earliestUser._id) {
              shouldClean = true
              reason = '重复用户记录'
            }
          }
        }
        
        if (shouldClean) {
          console.log('清理用户:', user._id, '原因:', reason)
          // 删除异常用户记录
          await db.collection('users').doc(user._id).remove()
          cleanedCount++
          cleanedUsers.push({
            _id: user._id,
            reason: reason
          })
        }
      }
      
      // 检查是否还有更多数据
      hasMore = pageResult.hasNext
      currentPage++
    }
    
    console.log('清理完成，共清理:', cleanedCount, '个异常用户记录')
    
    return handleSuccess({
      totalUsers: totalUsers,
      cleanedUsers: cleanedCount,
      cleanedDetails: cleanedUsers
    }, '清理异常用户记录成功')
  } catch (error) {
    console.error('清理异常用户记录失败:', error)
    return handleError(error, '清理异常用户记录失败')
  }
}