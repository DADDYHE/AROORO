const app = getApp()
import loginModule from '../../src/modules/auth/index'
const CacheUtil = require('../../utils/cacheUtil')
const TouchHandler = require('../../utils/touch-handler')

Page({
  data: {
    petProfiles: [],
    isLoggedIn: false,
    isManaging: false,
    selectedPets: [],
    hasSelectedPets: false,
    fromCreate: false // 新增字段，用于标识是否从创建页面跳转过来
  },

  // 触摸处理器实例
  touchHandler: null,

  async onLoad(options) {
    // 初始化触摸处理器
    this.touchHandler = new TouchHandler()

    // 清除旧缓存，确保使用新格式
    CacheUtil.remove('petProfiles')
    console.log('已清除旧缓存')

    // 检查用户是否已登录
    await this.checkLoginStatus()

    // 强制刷新宠物档案数据，不使用缓存
    this.getPetProfiles(true)

    // 检查是否是从创建页面跳转过来的
    if (options.from === 'create') {
      console.log('从创建页面跳转过来')
      this.setData({
        fromCreate: true
      })
    } else {
      console.log('从其他页面跳转过来')
      this.setData({
        fromCreate: false
      })
    }
  },

  async onShow() {
    // 重新检查登录状态
    await this.checkLoginStatus()
    // 每次页面显示时重新获取宠物档案数据，确保数据最新
    this.getPetProfiles()
  },

  // 检查用户登录状态
  async checkLoginStatus() {
    try {
      const isLoggedIn = await loginModule.isLoggedIn()
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
      // 对缓存的数据也进行格式化处理，确保包含id字段
      this.processPetData(cachedData)
      return
    }
    
    // 显示加载提示
    wx.showLoading({
      title: '加载中...'
    })
    
    console.log('开始执行 getPetProfiles 函数')
    
    // 使用云函数获取宠物数据，而不是直接访问云数据库
    wx.cloud.callFunction({
      name: 'getPets',
      data: {},
      success: async (res) => {
        console.log('通过云函数获取到的宠物数据:', JSON.stringify(res.result, null, 2))
        
        if (res.result.code === 0) {
          // 使用当前用户的宠物数据
          this.processPetData(res.result.data.userPets)
          // 更新缓存
          CacheUtil.set('petProfiles', res.result.data.userPets, 60 * 5) // 缓存5分钟
        } else {
          console.error('获取宠物数据失败:', res.result.message)
          wx.hideLoading()
          wx.showToast({
            title: '获取数据失败',
            icon: 'none'
          })
        }
      },
      fail: (error) => {
        console.error('获取用户信息失败:', error)
        wx.hideLoading()
        wx.showToast({
          title: '获取用户信息失败',
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
        avatarUrl: pet.avatarUrl || '/images/default-avatar.svg',
        description: pet.description || '',
        createdAt: pet.createdAt,
        updatedAt: pet.updatedAt,
        checked: false
      }
      console.log('单个宠物格式化后:', formattedPet)
      return formattedPet
    })
    
    console.log('格式化后的宠物数据:', JSON.stringify(formattedPets, null, 2))
    
    // 直接设置数据，云函数已返回可访问的头像URL
    this.setPetData(formattedPets)
  },
  
  // 设置宠物数据到页面
  setPetData(formattedPets) {
    this.setData({
      petProfiles: formattedPets,
      hasSelectedPets: false
    })
    
    console.log('页面数据已更新，宠物数量:', formattedPets.length)
    console.log('更新后的宠物数据:', JSON.stringify(formattedPets, null, 2))
    wx.hideLoading()
  },



  // 创建新宠物档案
  createNewPet() {
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

    wx.redirectTo({
      url: '/pages/pet/create-step1'
    })
  },



  // 列表开始触摸
  onListTouchStart(e) {
    this.touchHandler.onTouchStart(e)
  },

  // 列表滑动
  onListTouchMove(e) {
    // 当检测到滑动时，设置isSwiping为true
    const deltaX = Math.abs(e.touches[0].clientX - this.touchHandler.touchStartX)
    const deltaY = Math.abs(e.touches[0].clientY - this.touchHandler.touchStartY)
    if (deltaX > this.touchHandler.swipeThreshold || deltaY > this.touchHandler.swipeThreshold) {
      this.touchHandler.isSwiping = true
    }
  },

  // 列表结束触摸
  onListTouchEnd(e) {
    this.touchHandler.onTouchEnd(e)
  },

  // 列表项开始触摸
  onItemTouchStart(e) {
    this.touchHandler.onTouchStart(e)
  },

  // 列表项结束触摸
  onItemTouchEnd(e) {
    const isSwiping = this.touchHandler.onTouchEnd(e)
    const petId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    
    // 如果不是滑动，才执行点击事件
    if (!isSwiping) {
      if (this.data.isManaging) {
        this.selectPet(e)
      } else {
        this.viewPetDetail(e)
      }
    }
  },

  // 查看宠物详情
  viewPetDetail(e) {
    const petId = e.currentTarget.dataset.id
    console.log('查看宠物详情，ID:', petId)
    
    if (!petId) {
      console.error('宠物ID为空，无法查看详情')
      wx.showToast({
        title: '宠物数据异常',
        icon: 'none'
      })
      return
    }
    
    wx.navigateTo({
      url: `/pages/pet/detail?petId=${petId}`
    })
  },

  // 宠物头像加载失败时的处理函数
  onPetAvatarLoadError(e) {
    console.error('宠物头像加载失败:', e.detail)
    
    // 找到对应的宠物项索引
    const index = e.target.dataset.index
    if (index !== undefined) {
      const petProfiles = [...this.data.petProfiles]
      // 头像加载失败时使用默认头像
      petProfiles[index].avatarUrl = '/images/default-pet-avatar.png'
      this.setData({
        petProfiles: petProfiles
      })
    }
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

  // 切换管理模式
  toggleManageMode() {
    this.setData({
      isManaging: !this.data.isManaging,
      selectedPets: [],
      hasSelectedPets: false
    })
  },

  // 选择宠物
  selectPet(e) {
    const petId = e.currentTarget.dataset.id
    const petProfiles = [...this.data.petProfiles]
    const index = petProfiles.findIndex(pet => pet.id === petId)
    
    if (index > -1) {
      petProfiles[index].checked = !petProfiles[index].checked
      const hasSelectedPets = petProfiles.some(pet => pet.checked)
      this.setData({
        petProfiles: petProfiles,
        hasSelectedPets: hasSelectedPets
      })
    }
  },

  // 删除选中的宠物
  deleteSelectedPets() {
    const selectedPets = this.data.petProfiles.filter(pet => pet.checked)
    
    if (selectedPets.length === 0) {
      wx.showToast({
        title: '请选择要删除的宠物',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedPets.length} 个宠物档案吗？`,
      success: (res) => {
        if (res.confirm) {
          this.deletePets(selectedPets)
        }
      }
    })
  },

  // 执行删除操作
  async deletePets(selectedPets) {
    wx.showLoading({
      title: '删除中...'
    })

    try {
      // 使用云函数删除宠物数据
      for (const pet of selectedPets) {
        const result = await wx.cloud.callFunction({
          name: 'deletePet',
          data: {
            petId: pet.id
          }
        })

        if (result.result.code !== 0) {
          throw new Error(`删除宠物 ${pet.name} 失败: ${result.result.message}`)
        }
      }

      wx.hideLoading()
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      })

      // 删除后清除缓存并强制刷新
      CacheUtil.remove('petProfiles')
      this.getPetProfiles(true)
      this.setData({
        isManaging: false
      })
    } catch (error) {
      console.error('删除宠物失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      })
    }
  },

  // 用户点击右上角分享
  onShareAppMessage() {
    return {
      title: '我的宠物',
      path: '/pages/pet/list'
    }
  },

  // 监听页面卸载事件，实现自定义返回逻辑
  onUnload() {
    console.log('list页面onUnload事件被触发')
    console.log('onUnload - fromCreate值:', this.data.fromCreate)
    
    // 如果是从创建页面跳转过来的，直接跳转到首页
    if (this.data.fromCreate) {
      console.log('onUnload - 从创建页面跳转过来，直接跳转到首页')
      wx.switchTab({
        url: '/pages/home/index',
        success: () => {
          console.log('onUnload - 跳转到首页成功')
        },
        fail: (error) => {
          console.error('onUnload - 跳转到首页失败:', error)
        }
      })
    }
  },

  // 监听页面导航栏返回按钮点击事件
  onBackPress(options) {
    console.log('========== onBackPress事件被触发 ==========')
    console.log('onBackPress - 参数:', options)
    
    // 检查是否正确设置了fromCreate标志
    console.log('onBackPress - fromCreate值:', this.data.fromCreate)
    
    const pages = getCurrentPages()
    
    console.log('onBackPress - 当前页面栈长度:', pages.length)
    console.log('onBackPress - 页面栈详情:', JSON.stringify(pages.map(page => page.route), null, 2))
    
    // 如果是从创建页面跳转过来的，直接返回首页
    if (this.data.fromCreate) {
      console.log('点击返回箭头，返回首页')
      
      // 计算需要返回的层数，从创建流程返回首页
      // 页面栈结构: [首页, step1, step2, step3, step4, list]
      // 我们需要返回首页，所以需要返回 pages.length - 1 层
      const delta = pages.length - 1
      console.log('需要返回的层数:', delta)
      
      wx.navigateBack({
        delta: delta,
        success: () => {
          console.log('wx.navigateBack成功，返回首页')
        },
        fail: (error) => {
          console.error('wx.navigateBack失败:', error)
          // 如果navigateBack失败，尝试使用switchTab作为备用方案
          wx.switchTab({
            url: '/pages/home/index',
            success: () => {
              console.log('wx.switchTab成功')
            },
            fail: (error) => {
              console.error('wx.switchTab失败:', error)
            }
          })
        }
      })
      
      return true // 表示已经处理了返回逻辑，阻止默认返回行为
    }
    
    // 其他情况，使用默认返回行为
    console.log('使用默认返回行为')
    return false
  },

  // 页面显示时检查是否是从创建页面跳转过来的
  onShow() {
    // 页面显示时使用缓存数据，提升用户体验
    this.getPetProfiles()
    // 重新检查登录状态
    this.checkLoginStatus()
    
    // 检查来源页面
    const pages = getCurrentPages()
    console.log('页面显示时的页面栈:', pages)
  },
})
