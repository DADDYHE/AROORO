// 检查用户信息的云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-8gvqhsiga3011047'
})

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    console.log('开始获取用户信息...')
    
    // 查询所有用户信息
    const result = await db.collection('users').get()
    console.log('获取用户信息结果:', result)
    
    if (result.data && result.data.length > 0) {
      console.log('找到用户数量:', result.data.length)
      
      // 打印每个用户的头像URL
      result.data.forEach((user, index) => {
        console.log(`用户 ${index + 1}:`)
        console.log('  _id:', user._id)
        console.log('  openid:', user.openid)
        console.log('  avatarUrl:', user.avatarUrl)
        console.log('  nickName:', user.nickName)
        console.log('  role:', user.role)
        console.log('  头像URL类型:', typeof user.avatarUrl)
        console.log('  头像URL是否以cloud://开头:', user.avatarUrl && user.avatarUrl.startsWith('cloud://'))
        console.log('  头像URL是否以http://开头:', user.avatarUrl && user.avatarUrl.startsWith('http://'))
        console.log('  头像URL是否包含tmp:', user.avatarUrl && user.avatarUrl.includes('tmp'))
      })
    } else {
      console.log('未找到用户信息')
    }
    
    return {
      code: 0,
      message: '获取用户信息成功',
      data: result.data
    }
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return {
      code: -1,
      message: '获取用户信息失败',
      error: error.message
    }
  }
}
