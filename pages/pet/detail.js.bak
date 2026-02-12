const PetCardGenerator = require('../../utils/generatePetCard')
const app = getApp()

Page({
  // 返回上一页
  goBack() {
    wx.navigateBack()
  },
  data: {
    pet: {},
    userInfo: {},
    isLoggedIn: false,
    showEditModal: false,
    saving: false,
    editData: {
      name: '',
      age: ''
    },
    editingName: false,
    editingAge: false,
    showNameInput: false,
    showAgeInput: false,
    fromPetSelect: false // 是否来自选择宠物页面
  },

  onLoad(options) {
    // 检查用户登录状态
    this.checkLoginStatus()
    // 获取用户信息
    this.getUserInfo()
    
    // 判断是否来自选择宠物页面
    if (options.fromPetSelect) {
      this.setData({
        fromPetSelect: true
      })
    }
    
    if (options.petId) {
      this.loadPetData(options.petId)
    }
  },

  onShow() {
    // 每次页面显示时重新检查登录状态
    this.checkLoginStatus()
    this.getUserInfo()
    
    // 每次页面显示时重新加载宠物数据，确保数据是最新的
    const petId = this.data.pet._id || this.data.pet.id
    if (petId) {
      this.loadPetData(petId)
    }
  },

  // 检查用户登录状态
  checkLoginStatus() {
    const isLoggedIn = app.globalData.loginManager.checkLoginStatusValid()
    this.setData({
      isLoggedIn: isLoggedIn
    })
  },

  // 获取用户信息（从云函数获取最新数据）
  getUserInfo() {
    try {
      wx.cloud.callFunction({
        name: 'login',
        success: res => {
          if (res.result.code === 0 && res.result.userInfo) {
            const userInfo = res.result.userInfo
            this.setData({
              userInfo: {
                avatarUrl: userInfo.avatarUrl,
                nickName: userInfo.nickName,
                role: userInfo.role || 'owner'
              }
            })
            console.log('获取用户信息成功:', userInfo.nickName || userInfo.role)
          } else {
            console.warn('获取用户信息失败:', res.result.message || '用户信息获取失败')
          }
        },
        fail: error => {
          console.error('调用 login 云函数失败:', error)
        }
      })
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  },

  // 微信快捷登录
  loginWithWechat() {
    wx.showLoading({
      title: '登录中...'
    })
    
    // 使用标准登录模块
    app.globalData.loginManager.login()
      .then(result => {
        if (result.success) {
          console.log('登录成功:', result.message)
          
          // 获取用户信息
          const userInfo = app.globalData.loginManager.getUserInfo()
          
          // 更新页面数据
          this.setData({
            userInfo: userInfo,
            isLoggedIn: true
          })
          
          wx.hideLoading()
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          })
        } else {
          console.error('登录失败:', result.message)
          wx.hideLoading()
          wx.showToast({
            title: '登录失败',
            icon: 'none'
          })
        }
      })
      .catch(error => {
        console.error('登录失败:', error)
        wx.hideLoading()
        wx.showToast({
          title: '登录失败',
          icon: 'none'
        })
      })
  },

  // 加载宠物数据
  async loadPetData(petId) {
    try {
      console.log('调用云函数获取宠物数据，petId:', petId)
      const result = await wx.cloud.callFunction({
        name: 'getPetDetail',
        data: {
          petId: petId
          // 不需要传递 openid，云函数会从 wxContext 中自动获取
        }
      })
      
      console.log('云函数返回结果:', result)
      
      if (result.result && result.result.code === 0) {
        const petData = result.result.data
        this.setData({
          pet: petData,
          editData: {
            name: petData.name,
            age: petData.age
          }
        })
      } else {
        console.error('获取宠物数据失败:', result.result)
        wx.showToast({
          title: result.result?.message || '加载宠物数据失败',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      }
    } catch (error) {
      console.error('加载宠物数据失败:', error)
      wx.showToast({
        title: '加载宠物数据失败',
        icon: 'none'
      })
    }
  },

  // 点击编辑按钮
  editPetInfo() {
    this.setData({
      showEditModal: true
    })
  },

  // 切换编辑宠物名字的状态
  toggleEditName() {
    this.setData({
      editingName: !this.data.editingName,
      editingAge: false
    })
  },

  // 编辑宠物名字
  editPetName() {
    wx.showModal({
      title: '修改宠物名字',
      editable: true,
      placeholderText: '请输入宠物名字',
      content: this.data.editData.name,
      success: (res) => {
        if (res.confirm && res.content.trim()) {
          this.setData({
            'editData.name': res.content.trim()
          })
        }
      }
    })
  },

  // 编辑宠物年龄
  editPetAge() {
    wx.showModal({
      title: '修改宠物年龄',
      editable: true,
      placeholderText: '请输入宠物年龄',
      content: String(this.data.editData.age),
      success: (res) => {
        if (res.confirm && res.content.trim()) {
          this.setData({
            'editData.age': res.content.trim()
          })
        }
      }
    })
  },

  // 关闭编辑弹窗
  onEditModalClose() {
    this.setData({
      showEditModal: false,
      editData: {
        name: this.data.pet.name,
        age: this.data.pet.age
      },
      showNameInput: false,
      showAgeInput: false
    })
  },

  // 处理宠物名字变化
  onNameChange(e) {
    this.setData({
      'editData.name': e.detail
    })
  },

  // 处理宠物年龄变化
  onAgeChange(e) {
    this.setData({
      'editData.age': e.detail
    })
  },

  // 保存宠物信息
  async savePetInfo() {
    try {
      this.setData({ saving: true })

      // 验证输入
      if (!this.data.editData.name.trim()) {
        wx.showToast({
          title: '请输入宠物名字',
          icon: 'none'
        })
        this.setData({ saving: false })
        return
      }

      if (!this.data.editData.age || this.data.editData.age <= 0) {
        wx.showToast({
          title: '请输入有效的年龄',
          icon: 'none'
        })
        this.setData({ saving: false })
        return
      }

      // 更新宠物数据
      const updateResult = await wx.cloud.callFunction({
        name: 'updatePet',
        data: {
          petId: this.data.pet._id || this.data.pet.id,
          updateData: {
            name: this.data.editData.name.trim(),
            age: Number(this.data.editData.age),
            updatedAt: new Date()
          }
          // 不需要传递 openid，云函数会从 wxContext 中自动获取
        }
      })

      console.log('更新宠物数据结果:', updateResult)

      if (updateResult.result && updateResult.result.code === 0) {
        // 更新本地数据
        const updatedPet = {
          ...this.data.pet,
          name: this.data.editData.name.trim(),
          age: Number(this.data.editData.age)
        }
        this.setData({
          pet: updatedPet,
          showEditModal: false,
          saving: false
        })

        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
      } else {
        console.error('更新宠物数据失败:', updateResult.result)
        this.setData({ saving: false })
        wx.showToast({
          title: updateResult.result?.message || '保存失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('保存宠物信息失败:', error)
      this.setData({ saving: false })
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  // 生成宠物身份卡片
  async generatePetCard() {
    try {
      // 检查 Canvas 2D 实例是否已获取
      if (!this.canvas) {
        console.error('Canvas 2D 实例未获取')
        wx.showToast({
          title: 'Canvas 初始化失败',
          icon: 'none'
        })
        return
      }

      this.setData({ loading: true })

      const cardImage = await PetCardGenerator.generate(this.canvas, this.data.pet)

      this.setData({
        cardImage,
        loading: false
      })

      wx.showToast({
        title: '卡片生成成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('生成宠物身份卡片失败:', error)
      this.setData({ loading: false })
      wx.showToast({
        title: '卡片生成失败',
        icon: 'none'
      })
    }
  },

  // 卡片图片加载失败时的处理函数
  onCardImageLoadError(e) {
    console.error('宠物卡片图片加载失败:', e.detail)
    
    // 卡片图片加载失败时，清除当前的卡片图片，让用户可以重新生成
    this.setData({
      cardImage: ''
    })
    
    wx.showToast({
      title: '卡片图片加载失败，请重新生成',
      icon: 'none'
    })
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
      await this.updatePetAvatar(uploadResult.fileID)

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
  },

  // 更新宠物头像数据
  async updatePetAvatar(fileID) {
    try {
      // 更新本地数据
      const updatedPet = { ...this.data.pet, avatarUrl: fileID }
      this.setData({
        pet: updatedPet
      })

      // 调用云函数更新宠物数据
      const updateResult = await wx.cloud.callFunction({
        name: 'updatePet',
        data: {
          petId: this.data.pet._id || this.data.pet.id,
          updateData: {
            avatarUrl: fileID,
            updatedAt: new Date()
          }
          // 不需要传递 openid，云函数会从 wxContext 中自动获取
        }
      })

      console.log('宠物头像更新结果:', updateResult)

      if (updateResult.result && updateResult.result.code === 0) {
        console.log('宠物头像更新成功')
      } else {
        console.error('更新宠物头像失败:', updateResult.result)
        throw new Error(updateResult.result?.message || '更新宠物头像失败')
      }
    } catch (error) {
      console.error('更新宠物头像失败:', error)
      throw error
    }
  },

  // 保存卡片到相册
  savePetCard() {
    if (!this.data.cardImage) {
      wx.showToast({
        title: '请先生成身份卡片',
        icon: 'none'
      })
      return
    }

    wx.saveImageToPhotosAlbum({
      filePath: this.data.cardImage,
      success: () => {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
      },
      fail: (error) => {
        console.error('保存卡片失败:', error)
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        })
      }
    })
  },

  // 跳转到更新宠物档案页面
  goToUpdateProfile(e) {
    console.log('点击更新按钮事件:', e)
    console.log('当前宠物数据:', this.data.pet)
    const petId = this.data.pet._id || this.data.pet.id
    console.log('宠物ID:', petId)
    
    if (!petId) {
      wx.showToast({
        title: '宠物数据未加载',
        icon: 'none'
      })
      return
    }
    
    console.log('准备跳转页面')
    // 使用相对路径
    wx.navigateTo({
      url: './update-profile?petId=' + petId,
      success: () => {
        console.log('页面跳转成功')
      },
      fail: (error) => {
        console.error('页面跳转失败:', error)
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        })
      }
    })
  },
  
  // 确认选择宠物
  confirmSelect() {
    console.log('确认选择宠物:', this.data.pet)
    
    // 返回上一页并带上宠物信息
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2] // 上一页是选择宠物页面
    
    if (prevPage) {
      console.log('prevPage.data.selectedPets:', prevPage.data.selectedPets)
      
      // 调用上一页的方法来添加选择的宠物
      // 直接设置选中的宠物，避免调用有问题的 selectPet 方法
      const selectedPets = prevPage.data.selectedPets ? [...prevPage.data.selectedPets] : []
      const petId = this.data.pet._id || this.data.pet.id
      const index = selectedPets.indexOf(petId)
      
      if (index > -1) {
        // 取消选择
        selectedPets.splice(index, 1)
      } else {
        // 添加选择
        selectedPets.push(petId)
      }
      
      console.log('修改后的 selectedPets:', selectedPets)
      
      // 同时更新 selectedPets 和 pets 数组中的 checked 属性
      const updatedPets = prevPage.data.pets.map(pet => ({
        ...pet,
        checked: selectedPets.includes(pet.id)
      }))
      
      prevPage.setData({
        selectedPets: selectedPets,
        pets: updatedPets
      })
      
      // 保存到全局变量
      const app = getApp()
      const userRole = app.globalData.userRole || 'owner'
      if (userRole === 'owner') {
        app.globalData.ownerData.selectedPets = selectedPets
      } else {
        app.globalData.hostData.selectedPets = selectedPets
      }
      app.globalData.showSelectSuccess = true // 标记需要显示选择成功的反馈
      
      console.log('app.globalData.selectedPets:', app.globalData.selectedPets)
      
      // 延迟返回，让用户看到成功提示
      setTimeout(() => {
        wx.navigateBack()
      }, 500)
    } else {
      wx.showToast({
        title: '返回失败',
        icon: 'none'
      })
    }
  }
})