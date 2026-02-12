// 云函数：获取微信手机号
const cloud = require('wx-server-sdk')

// 初始化云环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  console.log('getPhoneNumber云函数被调用:', event)
  
  try {
    const { code } = event
    
    if (!code) {
      return {
        success: false,
        error: '缺少code参数'
      }
    }
    
    // 调用微信官方API获取手机号
    const result = await cloud.getPhoneNumber({
      code
    })
    
    console.log('获取手机号成功:', result)
    
    return {
      success: true,
      phoneNumber: result.phoneNumber
    }
  } catch (error) {
    console.error('获取手机号失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}
