const app = getApp()
import loginModule from '../../src/modules/auth/index'
const CacheUtil = require('../../utils/cacheUtil')

Page({
  data: {
    pets: [],
    selectedPets: [],
    isLoggedIn: false
  },

  async onLoad(options) {

    // 检查用户是否已登录
    await this.checkLoginStatus()

    // 只有登录后才获取宠物档案数据
    if (this.data.isLoggedIn) {
      // 获取宠物档案数据（支持强制刷新）
      const forceRefresh = options && options.forceRefresh === 'true'
      this.getPetProfiles(forceRefresh)
    } else {
      // 用户未登录，提示登录
      wx.showModal({
        title: '请登录',
        content: '您需要先登录才能查看宠物列表',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            // 返回上一页
            wx.navigateBack()
          }
        }
      })
    }
  },

  async onShow() {
    // 重新检查登录状态
    await this.checkLoginStatus()

    // 重置选择状态，确保用户重新进入时能看到最新状态
    this.resetSelectionStatus()
    
    // 显示选择成功的反馈
    if (app.globalData.showSelectSuccess) {
      wx.showToast({
        title: '宠物已选择',
        icon: 'success',
        duration: 1500
      })
      app.globalData.showSelectSuccess = false
    }
  },

  // 检查用户登录状态
  async checkLoginStatus() {
    try {
      const isLoggedIn = await loginModule.checkLoginStatusValid()
      this.setData({
        isLoggedIn: isLoggedIn
      })
    } catch (error) {
      console.error('检查登录状态失败:', error)
      this.setData({
        isLoggedIn: false
      })
    }
  },

  // 重置选择状态，确保用户重新进入时能看到最新状态
  resetSelectionStatus() {
    // 获取当前用户角色和对应的选中宠物数据
    const userRole = app.globalData.userRole || 'owner'
    const selectedPets = userRole === 'owner' ? app.globalData.ownerData.selectedPets : app.globalData.hostData.selectedPets
    
    console.log('重置选择状态，当前选中宠物:', selectedPets)
    
    // 确保 selectedPets 数据同步到页面显示
    if (selectedPets && this.data.pets.length > 0) {
      // 同时更新 selectedPets 和 pets 数组中的 checked 属性，直接使用 selectedPets 参数
      const updatedPets = this.data.pets.map(pet => ({
        ...pet,
        checked: selectedPets.includes(pet.id)
      }))
      
      this.setData({
        selectedPets: selectedPets,
        pets: updatedPets
      })
    }
  },

  // 获取宠物档案数据
  getPetProfiles(forceRefresh = false) {
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      console.log('未登录状态，不获取宠物数据')
      wx.hideLoading()
      return
    }

    // 检查缓存
    const cachedData = CacheUtil.get('petProfiles')
    if (cachedData && !forceRefresh) {
      console.log('使用缓存的宠物数据')
      this.processPetData(cachedData)
      return
    }

    // 显示加载提示
    wx.showLoading({
      title: '加载中...'
    })

    console.log('开始执行 getPetProfiles 函数, forceRefresh:', forceRefresh)

    // 使用云函数 getPets 来获取宠物数据，这样更可靠
    wx.cloud.callFunction({
      name: 'getPets',
      data: {},
      success: (res) => {
        wx.hideLoading()
        console.log('调用 getPets 云函数成功:', res)

        if (res.result.code === 0) {
          console.log('获取到的宠物数据:', JSON.stringify(res.result.data, null, 2))
          // 使用云函数返回的用户宠物数据
          this.processPetData(res.result.data.userPets)
          // 更新缓存
          CacheUtil.set('petProfiles', res.result.data.userPets, 60 * 5) // 缓存5分钟
        } else {
          console.error('getPets 云函数返回失败:', res.result.message)
          wx.showToast({
            title: res.result.message,
            icon: 'none'
          })
        }
      },
      fail: (error) => {
        wx.hideLoading()
        console.error('调用 getPets 云函数失败:', error)
        wx.showToast({
          title: '获取宠物数据失败',
          icon: 'none'
        })
      }
    })
  },
  
  // 处理宠物数据的公共方法
  processPetData(petData) {
    console.log('开始处理宠物数据，原始数据:', JSON.stringify(petData, null, 2))
    
    // 格式化数据以兼容现有页面显示，同时支持新旧字段名
    let formattedPets = petData.map(pet => {
      const formattedPet = {
        id: pet.id || pet._id,
        name: pet.name || pet.petName,
        type: (pet.type || pet.petType) === 'dog' ? '狗狗' : '猫咪',
        age: pet.age || pet.petAge,
        weight: pet.weight || pet.petWeight,
        breed: pet.breed || pet.petBreed,
        avatarUrl: pet.avatarUrl || '',
        description: pet.description || '',
        createdAt: pet.createdAt,
        updatedAt: pet.updatedAt,
        checked: false
      }
      console.log('单个宠物格式化后:', formattedPet)
      return formattedPet
    })
    
    console.log('格式化后的宠物数据:', JSON.stringify(formattedPets, null, 2))
    
    // 保存原始的云存储文件ID到每个宠物对象，用于后续判断是否需要重新获取临时链接
    formattedPets = formattedPets.map(pet => ({
      ...pet,
      originalAvatarFileID: pet.avatarUrl // 保存原始的云存储文件ID
    }))
    
    // 检查是否已有的宠物数据中是否已经有临时头像链接，如果有，直接使用
    // 这样可以避免重复获取临时链接导致头像看起来在随机更换
    const petsWithAvatars = formattedPets.filter(pet => pet.avatarUrl)
    if (petsWithAvatars.length > 0) {
      // 检查是否已经有临时头像链接，如果是，则直接使用，否则获取新的
      const needNewTempLinks = []
      const petsWithExistingLinks = []
      
      petsWithAvatars.forEach(pet => {
        // 检查是否是临时链接（包含 cloud.tcb.qcloud.la 或临时链接特征）
        if (pet.avatarUrl.includes('cloud.tcb.qcloud.la') || pet.avatarUrl.includes('sign=')) {
          petsWithExistingLinks.push(pet)
        } else {
          needNewTempLinks.push(pet)
        }
      })
      
      console.log('需要获取新临时链接的宠物数量:', needNewTempLinks.length)
      console.log('已有的临时链接宠物数量:', petsWithExistingLinks.length)
      
      if (needNewTempLinks.length > 0) {
        this.getTempAvatarUrls(formattedPets, needNewTempLinks)
      } else {
        // 所有宠物都已经有临时链接，直接设置数据
        this.setPetData(formattedPets)
      }
    } else {
      // 没有头像的宠物使用默认头像
      formattedPets = formattedPets.map(pet => ({
        ...pet,
        avatarUrl: '/images/default-pet-avatar.png'
      }))
      this.setPetData(formattedPets)
    }
  },
  
  // 获取临时头像链接的方法
  async getTempAvatarUrls(formattedPets, petsWithAvatars) {
    try {
      console.log('需要获取临时链接的头像FileID:', petsWithAvatars.map(pet => pet.avatarUrl))
      
      const tempUrlResult = await wx.cloud.getTempFileURL({
        fileList: petsWithAvatars.map(pet => pet.avatarUrl)
      })
      
      console.log('获取到的临时文件链接:', JSON.stringify(tempUrlResult.fileList, null, 2))
      
      // 更新宠物头像为临时访问链接
      tempUrlResult.fileList.forEach(fileInfo => {
        const petIndex = formattedPets.findIndex(pet => pet.avatarUrl === fileInfo.fileID)
        if (petIndex !== -1) {
          // 检查临时链接是否有效
          if (fileInfo.tempFileURL) {
            formattedPets[petIndex].avatarUrl = fileInfo.tempFileURL
          } else {
            formattedPets[petIndex].avatarUrl = '/images/default-pet-avatar.png'
          }
        }
      })
      
      this.setPetData(formattedPets)
    } catch (error) {
      console.error('获取宠物头像临时链接失败:', error)
      // 头像加载失败时使用默认头像
      formattedPets = formattedPets.map(pet => ({
        ...pet,
        avatarUrl: '/images/default-pet-avatar.png'
      }))
      this.setPetData(formattedPets)
    }
  },
  
  // 设置宠物数据到页面
  setPetData(formattedPets) {
    // 获取当前用户角色和对应的选中宠物数据
    const userRole = app.globalData.userRole || 'owner'
    const selectedPets = userRole === 'owner' ? app.globalData.ownerData.selectedPets : app.globalData.hostData.selectedPets
    
    // 为每个宠物添加 checked 属性，直接根据 selectedPets 数组判断
    const petsWithChecked = formattedPets.map(pet => ({
      ...pet,
      checked: selectedPets.includes(pet.id)
    }))
    
    this.setData({
      pets: petsWithChecked,
      selectedPets: selectedPets
    })
    
    console.log('页面数据已更新，宠物数量:', petsWithChecked.length)
    console.log('更新后的宠物数据:', JSON.stringify(petsWithChecked, null, 2))
    console.log('当前 selectedPets 数组:', selectedPets)
    
    // 检查是否有选中的宠物
    const selectedPetsCount = petsWithChecked.filter(pet => pet.checked).length
    console.log('选中宠物数量:', selectedPetsCount)
    
    // 重置选择状态，确保用户重新进入时能看到最新状态
    this.resetSelectionStatus()
    
    wx.hideLoading()
  },



  // 查看宠物详情
  viewPetDetail(e) {
    const petId = e.currentTarget.dataset.id
    console.log('查看宠物详情，ID:', petId)
    
    wx.navigateTo({
      url: `/pages/pet/detail?petId=${petId}&fromPetSelect=true`
    })
  },

  // 选择宠物
  selectPet(e) {
    console.log('selectPet 被调用，参数:', e)
    
    // 兼容两种调用方式：事件对象或直接传入 petId
    let petId
    
    if (typeof e === 'object' && e.currentTarget) {
      // 事件对象调用方式
      if (e.stopPropagation) {
        e.stopPropagation() // 阻止事件冒泡，避免触发viewPetDetail
      }
      petId = e.currentTarget.dataset.id
    } else {
      // 直接传入 petId 调用方式
      petId = e
    }
    
    console.log('选择宠物，ID:', petId)
    console.log('选择前 selectedPets:', this.data.selectedPets)
    
    // 创建一个新的数组，避免直接修改原数组
    let newSelectedPets = [...this.data.selectedPets]
    const index = newSelectedPets.indexOf(petId)

    if (index > -1) {
      // 取消选择
      newSelectedPets = newSelectedPets.filter(id => id !== petId)
      console.log('取消选择后 selectedPets:', newSelectedPets)
    } else {
      // 添加选择
      newSelectedPets.push(petId)
      console.log('添加选择后 selectedPets:', newSelectedPets)
    }

    // 同时更新 selectedPets 和 pets 数组
    const updatedPets = this.data.pets.map(pet => ({
      ...pet,
      checked: newSelectedPets.includes(pet.id)
    }))
    
    this.setData({
      selectedPets: newSelectedPets,
      pets: updatedPets
    })

    // 保存到全局变量，根据用户角色保存到对应的身份数据中
    const userRole = app.globalData.userRole || 'owner'
    if (userRole === 'owner') {
      app.globalData.ownerData.selectedPets = newSelectedPets
    } else {
      app.globalData.hostData.selectedPets = newSelectedPets
    }
    
    console.log('setData 后的 selectedPets:', this.data.selectedPets)
    console.log(`全局变量中 ${userRole} 身份的 selectedPets:`, userRole === 'owner' ? app.globalData.ownerData.selectedPets : app.globalData.hostData.selectedPets)
    console.log('更新后的 pets 数组:', JSON.stringify(this.data.pets, null, 2))
  },

  // 添加新宠物
  addNewPet() {
    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '请登录',
        content: '您需要先登录才能创建宠物档案',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            // 这里可以跳转到登录页面，或者在当前页面实现登录
            wx.showToast({
              title: '登录功能待实现',
              icon: 'none'
            })
          }
        }
      })
      return
    }

    wx.navigateTo({
      url: '/subpackages/pet/create-step1'
    })
  },

  // 宠物头像加载失败时的处理函数
  onPetAvatarLoadError(e) {
    console.error('宠物头像加载失败:', e.detail)
    
    // 找到对应的宠物项索引
    const index = e.target.dataset.index
    if (index !== undefined) {
      const pets = [...this.data.pets]
      // 头像加载失败时使用默认头像
      pets[index].avatarUrl = '/images/default-pet-avatar.png'
      this.setData({ pets })
    }
  },

  // 下一步
  nextStep() {
    if (this.data.selectedPets.length === 0) {
      wx.showToast({
        title: '请至少选择一只宠物',
        icon: 'none'
      })
      return
    }

    // 获取选中的宠物详细信息
    const selectedPetDetails = this.data.pets.filter(pet => 
      this.data.selectedPets.includes(pet.id)
    )
    
    // 保存到全局变量，供后续页面使用
    const userRole = app.globalData.userRole || 'owner'
    if (userRole === 'owner') {
      app.globalData.ownerData.selectedPetDetails = selectedPetDetails
    } else {
      app.globalData.hostData.selectedPetDetails = selectedPetDetails
    }
    
    wx.switchTab({
      url: '/pages/booking/calendar'
    })
  },

  // 页面相关事件处理函数--监听用户下拉动作
  onPullDownRefresh() {
    this.getPetProfiles(true) // 强制刷新
    wx.stopPullDownRefresh()
  },

  // 页面上拉触底事件的处理函数
  onReachBottom() {
    // 这里可以添加分页加载逻辑
  },

  // 判断宠物是否已选中
  isPetSelected(petId) {
    console.log('isPetSelected 被调用，petId:', petId)
    console.log('当前 selectedPets 数组:', this.data.selectedPets)
    
    // 检查类型一致性
    console.log('petId 类型:', typeof petId)
    this.data.selectedPets.forEach((id, index) => {
      console.log(`selectedPets[${index}] 类型:`, typeof id, '值:', id)
    })
    
    const isSelected = this.data.selectedPets.includes(petId)
    console.log('isPetSelected 返回:', isSelected)
    return isSelected
  },

  // 用户点击右上角分享
  onShareAppMessage() {
    return {
      title: '选择宠物',
      path: '/subpackages/booking/pet-select'
    }
  }
})