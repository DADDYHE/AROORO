const cloud = require('wx-server-sdk')
const { init } = require('@cloudbase/wx-cloud-client-sdk')

cloud.init({
  env: 'cloud1-8gvqhsiga3011047'
})

const client = init(cloud)
const models = client.models

// 价格计算云函数
exports.main = async (event, context) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('计算超时，请稍后再试'))
    }, 2500) // 设置 2.5 秒超时，留出缓冲时间
  })

  const mainPromise = (async () => {
    try {
      console.log('收到价格计算请求，参数:', event)
      
      const { 
        petCount, 
        duration, 
        petType, 
        roomType, 
        extras = [] 
      } = event

      // 参数验证
      if (!petCount || !duration) {
        console.error('缺少必要参数')
        return {
          code: -1,
          message: '缺少必要参数'
        }
      }

      // 基础价格配置
      // 根据宠物类型和房间类型计算基础价格
      const basePricePerPetPerDay = {
        dog: {
          standard: 50,    // 标准房
          deluxe: 80,      // 豪华房
          premium: 120     // 高级房
        },
        cat: {
          standard: 40,
          deluxe: 60,
          premium: 90
        },
        other: {
          standard: 30,
          deluxe: 50,
          premium: 70
        }
      }

      // 确定宠物类型和房间类型的默认值
      const finalPetType = petType || 'other'
      const finalRoomType = roomType || 'standard'

      // 计算基础价格
      const basePricePerDay = basePricePerPetPerDay[finalPetType]?.[finalRoomType] || basePricePerPetPerDay.other.standard
      const basePrice = basePricePerDay * petCount * duration

      console.log('基础价格计算:', {
        petCount,
        duration,
        finalPetType,
        finalRoomType,
        basePricePerDay,
        basePrice
      })

      // 计算附加服务费用
      let extraCost = 0
      const extraPrices = {
        'bath': 20,          // 洗澡服务
        'grooming': 40,      // 美容服务
        'walk': 15,          // 散步服务
        'train': 30,         // 训练服务
        'medicine': 25,      // 喂药服务
        'play': 10,          // 玩耍服务
        'night': 15          // 夜间照顾
      }

      if (extras && extras.length > 0) {
        extras.forEach(extra => {
          if (extraPrices[extra]) {
            extraCost += extraPrices[extra] * duration
            console.log(`附加服务 ${extra} 费用: ${extraPrices[extra]} * ${duration} = ${extraPrices[extra] * duration}`)
          }
        })
      }

      // 计算总价
      const totalPrice = basePrice + extraCost
      const finalTotalPrice = Math.round(totalPrice) // 四舍五入到整数

      console.log('价格计算完成:', {
        basePrice,
        extraCost,
        totalPrice,
        finalTotalPrice
      })

      // 返回计算结果
      return {
        code: 0,
        message: '价格计算成功',
        data: {
          basePrice,
          extraCost,
          totalPrice,
          finalTotalPrice,
          breakdown: {
            basePrice,
            petCount,
            duration,
            petType: finalPetType,
            roomType: finalRoomType,
            extras: extras,
            extraCost
          }
        }
      }
    } catch (error) {
      console.error('价格计算失败:', error)
      console.error('错误详情:', JSON.stringify(error, null, 2))
      return {
        code: -1,
        message: '价格计算失败',
        error: error.message,
        stack: error.stack
      }
    }
  })()

  try {
    return await Promise.race([mainPromise, timeoutPromise])
  } catch (error) {
    console.error('计算超时或失败:', error)
    return {
      code: -1,
      message: '计算超时，请稍后再试'
    }
  }
}
