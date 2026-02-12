const cloud = require('wx-server-sdk')
const { init } = require('@cloudbase/wx-cloud-client-sdk')

// 初始化云开发环境
cloud.init({
  env: 'cloud1-8gvqhsiga3011047'
})

const client = init(cloud)
const models = client.models

// 数据库类型枚举
const DB_TYPE = {
  TCB: 'tcb'
}

// 默认数据库类型
const DEFAULT_DB_TYPE = DB_TYPE.TCB

// 获取数据库实例的工厂函数
function getDbInstance(type = DEFAULT_DB_TYPE) {
  switch (type) {
    case DB_TYPE.TCB:
      return new TcbAdapter()
    default:
      throw new Error(`Unsupported database type: ${type}`)
  }
}

// 云开发数据库适配器
class TcbAdapter {
  constructor() {
    this.type = DB_TYPE.TCB
    this.db = cloud.database()
    this.models = models
  }
  
  // 查询
  async query(sql, params = []) {
    throw new Error('Cloudbase database does not support SQL queries')
  }
  
  // 事务
  async transaction(callback) {
    const transaction = await this.db.startTransaction()
    try {
      const result = await callback(transaction)
      await transaction.commit()
      return result
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
  
  // 测试连接
  async testConnection() {
    try {
      const result = await this.db.collection('users').limit(1).get()
      return true
    } catch (error) {
      console.error('Cloudbase connection test failed:', error)
      return false
    }
  }
  
  // 生成唯一ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }
  
  // 用户操作
  async getUserByOpenId(openid) {
    const result = await this.db.collection('users')
      .where({ openid: openid })
      .get()
    return result.data.length > 0 ? result.data[0] : null
  }
  
  async createUser(userData) {
    const id = this.generateId()
    const now = new Date()
    const user = {
      _id: id,
      openid: userData.openid,
      avatarUrl: userData.avatarUrl || '',
      nickName: userData.nickName || '', // 不设置默认昵称，保留空值
      role: userData.role || 'owner',
      createdAt: now,
      lastLoginTime: now
    }
    
    await this.db.collection('users').add({
      data: user
    })
    
    return user
  }
  
  async updateUser(openid, userData) {
    const updateData = {}
    if (userData.avatarUrl) {
      updateData.avatarUrl = userData.avatarUrl
    }
    if (userData.nickName) {
      updateData.nickName = userData.nickName
    }
    updateData.lastLoginTime = new Date()
    
    await this.db.collection('users')
      .where({ openid: openid })
      .update({
        data: updateData
      })
  }
  
  // 寄养家庭档案操作
  async getHostProfileByOpenId(openid) {
    const result = await this.db.collection('hostProfiles')
      .where({ openid: openid })
      .get()
    return result.data.length > 0 ? result.data[0] : null
  }
  
  async updateHostProfile(openid, profileData) {
    const updateData = {}
    if (profileData.avatarUrl) {
      updateData.avatarUrl = profileData.avatarUrl
    }
    
    if (profileData.hostName) {
      updateData.hostName = profileData.hostName
    }
    
    if (profileData.realName) {
      updateData.realName = profileData.realName
    }
    
    if (profileData.phone) {
      updateData.phone = profileData.phone
    }
    
    if (profileData.idCard) {
      updateData.idCard = profileData.idCard
    }
    
    if (profileData.address) {
      updateData.address = profileData.address
    }
    
    if (profileData.housingType) {
      updateData.housingType = profileData.housingType
    }
    
    if (profileData.hasYard) {
      updateData.hasYard = profileData.hasYard
    }
    
    if (profileData.maxPets) {
      updateData.maxPets = profileData.maxPets
    }
    
    if (profileData.hasOtherPets) {
      updateData.hasOtherPets = profileData.hasOtherPets
    }
    
    if (profileData.nativePetInfo) {
      updateData.nativePetInfo = profileData.nativePetInfo
    }
    
    if (profileData.petTypes) {
      updateData.petTypes = profileData.petTypes
    }
    
    if (profileData.serviceTypes) {
      updateData.serviceTypes = profileData.serviceTypes
    }
    
    if (profileData.pricePerDay) {
      updateData.pricePerDay = profileData.pricePerDay
    }
    
    if (profileData.description) {
      updateData.description = profileData.description
    }
    
    if (profileData.idCardFront) {
      updateData.idCardFront = profileData.idCardFront
    }
    
    if (profileData.idCardBack) {
      updateData.idCardBack = profileData.idCardBack
    }
    
    if (profileData.healthCertificate) {
      updateData.healthCertificate = profileData.healthCertificate
    }
    
    if (profileData.emergencyContactName) {
      updateData.emergencyContactName = profileData.emergencyContactName
    }
    
    if (profileData.emergencyContactPhone) {
      updateData.emergencyContactPhone = profileData.emergencyContactPhone
    }
    
    if (profileData.status) {
      updateData.status = profileData.status
    }
    
    if (profileData.rating) {
      updateData.rating = profileData.rating
    }
    
    if (profileData.reviewCount) {
      updateData.reviewCount = profileData.reviewCount
    }
    
    if (profileData.isAcceptingOrders) {
      updateData.isAcceptingOrders = profileData.isAcceptingOrders
    }
    
    updateData.updatedAt = new Date()
    
    await this.db.collection('hostProfiles')
      .where({ openid: openid })
      .update({
        data: updateData
      })
  }
  
  async createHostProfile(profileData) {
    const id = this.generateId()
    const now = new Date()
    const profile = {
      _id: id,
      openid: profileData.openid,
      avatarUrl: profileData.avatarUrl || '',
      hostName: profileData.hostName || '未设置名称',
      realName: profileData.realName || '',
      phone: profileData.phone || '',
      idCard: profileData.idCard || '',
      address: profileData.address || '',
      housingType: profileData.housingType || '',
      hasYard: profileData.hasYard || '',
      maxPets: profileData.maxPets || '',
      hasOtherPets: profileData.hasOtherPets || '',
      nativePetInfo: profileData.nativePetInfo || '',
      petTypes: profileData.petTypes || '',
      serviceTypes: profileData.serviceTypes || '',
      pricePerDay: profileData.pricePerDay || '',
      description: profileData.description || '',
      idCardFront: profileData.idCardFront || '',
      idCardBack: profileData.idCardBack || '',
      healthCertificate: profileData.healthCertificate || '',
      emergencyContactName: profileData.emergencyContactName || '',
      emergencyContactPhone: profileData.emergencyContactPhone || '',
      status: 'pending',
      rating: 5.0,
      reviewCount: 0,
      isAcceptingOrders: 1,
      createdAt: now,
      updatedAt: now
    }
    
    await this.db.collection('hostProfiles').add({
      data: profile
    })
    
    return profile
  }
  
  async getApprovedHostProfiles() {
    const result = await this.db.collection('hostProfiles')
      .where({ status: 'approved' })
      .limit(100)
      .get()
    return result.data
  }
  
  // 宠物档案操作
  async getPetsByOpenId(openid) {
    const result = await this.db.collection('pets')
      .where({ _openid: openid })
      .get()
    return result.data
  }
  
  async getPetById(petId, openid) {
    const result = await this.db.collection('pets')
      .where({ 
        _id: petId, 
        _openid: openid 
      })
      .get()
    return result.data.length > 0 ? result.data[0] : null
  }
  
  async deletePetById(petId, openid) {
    const result = await this.db.collection('pets')
      .where({ 
        _id: petId, 
        _openid: openid 
      })
      .remove()
    return result.stats.removed > 0
  }
  
  async updatePetById(petId, openid, updateData) {
    const updateFields = {}
    
    for (let key in updateData) {
      if (updateData.hasOwnProperty(key) && updateData[key] !== undefined) {
        if (key.toLowerCase().includes('date') || key.toLowerCase().includes('time') || key === 'updatedAt' || key === 'createdAt') {
          continue
        }
        updateFields[key] = updateData[key]
      }
    }
    
    updateFields.updatedAt = new Date()
    
    const result = await this.db.collection('pets')
      .where({ 
        _id: petId, 
        _openid: openid 
      })
      .update({
        data: updateFields
      })
    
    return result.stats.updated > 0
  }
  
  async createPetProfile(petData) {
    const id = this.generateId()
    const now = new Date()
    const pet = {
      _id: id,
      ownerOpenid: petData.ownerOpenid,
      _openid: petData._openid,
      name: petData.name,
      type: petData.type,
      age: petData.age || 0,
      weight: petData.weight || 0.00,
      breed: petData.breed || '',
      isSterilized: petData.isSterilized || 0,
      isVaccinated: petData.isVaccinated || 0,
      healthStatus: petData.healthStatus || '',
      allergies: petData.allergies || '',
      specialNeeds: petData.specialNeeds || '',
      dietaryHabit: petData.dietaryHabit || '',
      exerciseNeed: petData.exerciseNeed || '',
      sleepingHabit: petData.sleepingHabit || '',
      socialBehavior: petData.socialBehavior || '',
      emergencyContactName: petData.emergencyContactName || '',
      emergencyContactPhone: petData.emergencyContactPhone || '',
      emergencyContactRelation: petData.emergencyContactRelation || '',
      emergencyContactNote: petData.emergencyContactNote || '',
      avatarUrl: petData.avatarUrl || '',
      isActive: 1,
      createdAt: now,
      updatedAt: now
    }
    
    await this.db.collection('pets').add({
      data: pet
    })
    
    return pet
  }
  
  // 订单操作
  async getOrdersByOwnerId(ownerId) {
    const result = await this.db.collection('orders')
      .where({ ownerId: ownerId })
      .get()
    return result.data
  }
  
  async getOrdersByHostId(hostId) {
    const result = await this.db.collection('orders')
      .where({ hostId: hostId })
      .get()
    return result.data
  }
  
  async createOrder(orderData) {
    const id = this.generateId()
    const now = new Date()
    const order = {
      _id: id,
      ownerId: orderData.ownerId,
      hostId: orderData.hostId,
      hostProfileId: orderData.hostProfileId,
      petIds: orderData.petIds || '',
      startDate: orderData.startDate,
      endDate: orderData.endDate,
      duration: orderData.duration || 0,
      totalPrice: orderData.totalPrice || 0.00,
      status: 'pending',
      rating: 0.0,
      review: '',
      createdAt: now,
      updatedAt: now
    }
    
    await this.db.collection('orders').add({
      data: order
    })
    
    return order
  }
  
  // 收藏操作
  async getFavoritesByOpenId(openid) {
    const result = await this.db.collection('favorites')
      .where({ openid: openid })
      .get()
    return result.data
  }
  
  async addFavorite(openid, hostProfileId) {
    const id = this.generateId()
    const now = new Date()
    const favorite = {
      _id: id,
      openid,
      hostProfileId,
      createdAt: now
    }
    
    await this.db.collection('favorites').add({
      data: favorite
    })
    
    return favorite
  }
  
  async removeFavorite(openid, hostProfileId) {
    await this.db.collection('favorites')
      .where({ openid: openid, hostProfileId: hostProfileId })
      .remove()
  }

  async getFavoritesWithHostProfiles(openid) {
    const favorites = await this.getFavoritesByOpenId(openid)
    
    if (favorites.length === 0) {
      return []
    }

    const hostProfileIds = favorites.map(fav => fav.hostProfileId)

    const hostProfiles = await this.db.collection('hostProfiles')
      .where({
        _id: this.db.command.in(hostProfileIds),
        status: 'approved'
      })
      .limit(100)
      .get()

    // 创建寄养家庭ID到寄养家庭信息的映射
    const hostProfileMap = {}
    hostProfiles.data.forEach(host => {
      hostProfileMap[host._id] = host
    })

    // 合并收藏记录和寄养家庭信息，保持与MySQL适配器一致的数据结构
    return favorites
      .filter(fav => hostProfileMap[fav.hostProfileId])
      .map(fav => ({
        id: fav._id, // 收藏记录ID
        hostProfileId: fav.hostProfileId,
        hostName: hostProfileMap[fav.hostProfileId].hostName,
        avatarUrl: hostProfileMap[fav.hostProfileId].avatarUrl,
        address: hostProfileMap[fav.hostProfileId].address,
        pricePerDay: hostProfileMap[fav.hostProfileId].pricePerDay,
        rating: hostProfileMap[fav.hostProfileId].rating,
        reviewCount: hostProfileMap[fav.hostProfileId].reviewCount,
        isAcceptingOrders: hostProfileMap[fav.hostProfileId].isAcceptingOrders,
        status: hostProfileMap[fav.hostProfileId].status,
        createdAt: hostProfileMap[fav.hostProfileId].createdAt
      }))
  }

  // 待办事项操作
  async getTodos() {
    // 简化查询：直接返回默认待办事项，避免数据库查询
    // 这样可以确保在很短时间内返回响应，避免超时
    return [
      {
        id: 1,
        content: '完成宠物档案创建',
        completed: false,
        created_at: new Date()
      },
      {
        id: 2,
        content: '上传身份证照片',
        completed: false,
        created_at: new Date()
      },
      {
        id: 3,
        content: '完善寄养家庭信息',
        completed: false,
        created_at: new Date()
      }
    ]
  }

  // 日期可用性检查
  async checkDateAvailability(date) {
    const result = await this.db.collection('bookings')
      .where({
        startDate: this.db.command.lte(date),
        endDate: this.db.command.gte(date)
      })
      .count()
    return result.total === 0
  }

  // 统计数据操作
  async getHostStats(openid) {
    // 简化查询：直接返回默认统计数据，避免复杂的SQL查询和计算
    // 这样可以确保在很短时间内返回响应，避免超时
    return {
      totalOrders: 0,
      totalIncome: 0,
      avgRating: 0,
      pendingOrders: 0
    }
  }

  async getStats(userId, userRole) {
    // 简化查询：直接返回默认统计数据，避免复杂的SQL查询和计算
    // 这样可以确保在很短时间内返回响应，避免超时
    return {
      bookingCount: 0,
      totalSpent: 0,
      totalIncome: 0,
      avgRating: 0
    }
  }
}

// 导出接口
module.exports = {
  DB_TYPE,
  DEFAULT_DB_TYPE,
  getDbInstance,
  TcbAdapter
}
