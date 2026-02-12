const app = getApp()
const db = wx.cloud.database({
  env: app.globalData.envId
})

// 导出一个空对象，帮助微信开发者工具的代码依赖分析功能识别该文件
module.exports = {}

Page({
  data: {
    pet: {},
    editingData: {
      name: '',
      age: '',
      breed: '',
      weight: '',
      isSterilized: false,
      isVaccinated: false,
      healthStatus: '',
      allergies: '',
      specialNeeds: '',
      dietaryHabit: '',
      exerciseNeed: '',
      sleepingHabit: '',
      socialBehavior: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelation: '',
      emergencyContactNote: '',
      avatarUrl: ''
    },
    saving: false
  },

  onLoad(options) {
    console.log('update-profile onLoad options:', options)
    if (options.petId) {
      this.loadPetData(options.petId)
    } else {
      console.error('没有收到 petId 参数')
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  // 加载宠物数据
  async loadPetData(petId) {
    try {
      console.log('加载宠物数据，petId:', petId)
      // 获取用户openid
      const userInfo = wx.getStorageSync('userInfo')
      console.log('本地存储的用户信息:', userInfo)
      
      // 调用云函数获取宠物详情
      const result = await wx.cloud.callFunction({
        name: 'getPetDetail',
        data: {
          petId: petId,
          openid: userInfo.openid || ''
        }
      })
      
      console.log('getPetDetail云函数返回结果:', result)
      console.log('云函数返回结果详情:', JSON.stringify(result, null, 2))
      
      if (result.result && result.result.code === 0) {
        const petData = result.result.data
        console.log('宠物数据:', petData)
        console.log('宠物数据详情:', JSON.stringify(petData, null, 2))
        
        // 初始化editingData，为所有可能为null的字段设置默认值
        const editingData = {
          name: petData.name || '',
          age: petData.age || '',
          breed: petData.breed || '',
          weight: petData.weight || '',
          isSterilized: Boolean(petData.isSterilized),
          isVaccinated: Boolean(petData.isVaccinated),
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
          avatarUrl: petData.avatarUrl || ''
        }
        console.log('初始化的editingData:', editingData)
        
        this.setData({
          pet: petData,
          editingData: editingData
        })
        console.log('设置后的pet数据:', this.data.pet)
        console.log('设置后的editingData:', this.data.editingData)
      } else {
        console.error('获取宠物信息失败:', result.result)
        wx.showToast({
          title: result.result?.message || '您没有权限访问该宠物信息',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      }
    } catch (error) {
      console.error('加载宠物数据失败:', error)
      console.error('错误详情:', JSON.stringify(error, null, 2))
      wx.showToast({
        title: '加载宠物数据失败',
        icon: 'none'
      })
    }
  },

  // 处理输入框变化
  onInputChange(e) {
    // 安全地获取字段名称
    const field = e.currentTarget?.dataset?.field
    if (!field) {
      console.warn('未找到字段名称')
      return
    }
    
    // 安全地获取值，确保不会设置 undefined
    let value = ''
    if (e.detail && typeof e.detail === 'object') {
      // 对于对象类型的 detail，获取 value 属性
      if (e.detail.value !== undefined && e.detail.value !== null) {
        value = e.detail.value
        // 确保字符串类型的字段有默认值
        if (typeof value === 'string') {
          value = value.trim()
        }
      }
    } else if (e.detail !== undefined && e.detail !== null) {
      // 对于其他类型的 detail，直接使用
      value = e.detail
    }
    
    // 确保字段存在于 editingData 对象中
    if (this.data.editingData.hasOwnProperty(field)) {
      // 只有特定字段（age 和 weight）需要特殊处理为数字类型
      let finalValue = value
      
      if (['age', 'weight'].includes(field)) {
        // 对于年龄和体重字段，只有在用户输入有效数字时才处理为数字类型
        if (value === '' || value === null || value === undefined) {
          finalValue = ''
        } else {
          // 尝试将值转换为数字类型
          const numValue = Number(value)
          if (!isNaN(numValue)) {
            finalValue = numValue
          } else {
            // 如果转换失败，保留空字符串
            finalValue = ''
          }
        }
      } else {
        // 对于其他字段，根据原始类型设置默认值
        const fieldType = typeof this.data.editingData[field]
        
        if (fieldType === 'string' && (finalValue === undefined || finalValue === null)) {
          finalValue = ''
        } else if (fieldType === 'number' && (finalValue === undefined || finalValue === null || finalValue === '')) {
          finalValue = 0
        } else if (fieldType === 'boolean' && (finalValue === undefined || finalValue === null)) {
          finalValue = false
        }
      }
      
      this.setData({
        [`editingData.${field}`]: finalValue
      })
    } else {
      console.warn('字段不存在于 editingData 对象中:', field)
    }
  },

  // 处理选择框变化
  onSelectChange(e) {
    const field = e.currentTarget?.dataset?.field
    if (!field) {
      console.warn('未找到字段名称')
      return
    }
    
    let value = ''
    if (e.detail && typeof e.detail === 'object') {
      if (e.detail.value !== undefined && e.detail.value !== null) {
        value = e.detail.value
      }
    } else if (e.detail !== undefined && e.detail !== null) {
      value = e.detail
    }
    
    if (this.data.editingData.hasOwnProperty(field)) {
      const fieldType = typeof this.data.editingData[field]
      let finalValue = value
      
      // 处理布尔类型字段的特殊情况
      if (fieldType === 'boolean') {
        // 将字符串"true"和"false"转换为对应的布尔值
        if (value === 'true') {
          finalValue = true
        } else if (value === 'false') {
          finalValue = false
        } else if (value === undefined || value === null) {
          finalValue = false
        }
      } else if (fieldType === 'string' && (finalValue === undefined || finalValue === null)) {
        finalValue = ''
      } else if (fieldType === 'number' && (finalValue === undefined || finalValue === null || finalValue === '')) {
        finalValue = 0
      }
      
      this.setData({
        [`editingData.${field}`]: finalValue
      })
    } else {
      console.warn('字段不存在于 editingData 对象中:', field)
    }
  },

  // 保存宠物信息
  async savePetInfo() {
    try {
      this.setData({ saving: true })

      // 验证输入
      if (!this.data.editingData.name.trim()) {
        wx.showToast({
          title: '请输入宠物名字',
          icon: 'none'
        })
        this.setData({ saving: false })
        return
      }

      if (!this.data.editingData.age || this.data.editingData.age <= 0) {
        wx.showToast({
          title: '请输入有效的年龄',
          icon: 'none'
        })
        this.setData({ saving: false })
        return
      }

      console.log('准备调用updatePet云函数，petId:', this.data.pet.id)
      console.log('准备更新的数据:', this.data.editingData)
      // 调用云函数更新宠物信息
      const result = await wx.cloud.callFunction({
        name: 'updatePet',
        data: {
          petId: this.data.pet.id,
          updateData: {
            ...this.data.editingData,
            updatedAt: new Date()
          }
        }
      })
      
      if (result.result.code !== 0) {
        console.error('更新宠物信息失败:', result.result.message)
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        })
        this.setData({ saving: false })
        return
      }

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      // 延迟返回上一页，让用户看到成功提示
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (error) {
      console.error('保存宠物信息失败:', error)
      this.setData({ saving: false })
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  // 选择头像
  chooseAvatar() {
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 从相册选择
          this.chooseImageFromAlbum()
        } else if (res.tapIndex === 1) {
          // 拍照
          this.takePhoto()
        }
      },
      fail: (error) => {
        console.error('选择操作失败:', error)
      }
    })
  },

  // 从相册选择图片
  chooseImageFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        this.uploadAvatar(res.tempFiles[0].tempFilePath)
      },
      fail: (error) => {
        console.error('选择图片失败:', error)
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 拍照
  takePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        this.uploadAvatar(res.tempFiles[0].tempFilePath)
      },
      fail: (error) => {
        console.error('拍照失败:', error)
        wx.showToast({
          title: '拍照失败',
          icon: 'none'
        })
      }
    })
  },

  // 上传头像到云存储
  async uploadAvatar(tempFilePath) {
    try {
      wx.showLoading({
        title: '上传中...'
      })

      // 生成唯一文件名
      const fileName = `pet-avatarUrls/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
      
      // 上传到云存储
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: fileName,
        filePath: tempFilePath
      })

      console.log('头像上传成功:', uploadResult.fileID)

      // 修改文件权限为所有用户可读取（解决头像加载失败问题）
      try {
        const result = await wx.cloud.getTempFileURL({
          fileList: [uploadResult.fileID]
        })
        console.log('获取临时文件链接成功:', result.fileList[0].tempFileURL)
      } catch (permError) {
        console.warn('获取临时文件链接失败，可能是权限问题:', permError)
      }

      // 更新宠物数据
      this.setData({
        [`editingData.avatarUrl`]: uploadResult.fileID
      })

      wx.hideLoading()
      wx.showToast({
        title: '头像上传成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('头像上传失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '头像上传失败',
        icon: 'none'
      })
    }
  }
})
