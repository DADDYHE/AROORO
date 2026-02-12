// pages/favorites/index.js
import loginModule from '../../../src/modules/auth/index'
const TouchHandler = require('../../../utils/touch-handler')

Page({
  data: {
    favoriteFamilies: [],
    hostList: [],
    isLoading: true,
    errorMessage: '',
    showAllHosts: false,
    isLoggedIn: false
  },

  // 触摸处理器实例
  touchHandler: null,

  onLoad() {
    // 初始化触摸处理器
    this.touchHandler = new TouchHandler()
    this.checkLoginAndLoadData()
  },
  
  onShow() {
    console.log('收藏页面显示，开始刷新数据...')
    
    // 页面显示时强制清除旧数据并重新加载，确保收藏列表是最新的
    this.setData({
      favoriteFamilies: [], // 强制清空收藏列表
      hostList: [], // 强制清空全部寄养家庭列表
      showAllHosts: false, // 重置showAllHosts状态
      isLoading: true // 显示加载状态
    })
    
    // 使用setTimeout确保页面状态更新后再加载数据，避免UI渲染问题
    setTimeout(() => {
      this.checkLoginAndLoadData()
    }, 50)
  },

  // 检查登录状态并加载数据
  async checkLoginAndLoadData() {
    try {
      const isLoggedIn = await loginModule.checkLoginStatusValid()
      this.setData({ isLoggedIn })
      
      if (!isLoggedIn) {
        console.log('未登录状态，显示登录提示')
        this.setData({
          isLoading: false,
          errorMessage: '请先登录'
        })
        return
      }
      
      this.loadData()
    } catch (error) {
      console.error('检查登录状态失败:', error)
      this.setData({
        isLoggedIn: false,
        isLoading: false,
        errorMessage: '登录状态检查失败'
      })
    }
  },

  // 加载数据
  async loadData() {
    try {
      console.log('开始加载数据...')
      this.setData({
        isLoading: true,
        errorMessage: '',
        showAllHosts: false // 重置showAllHosts状态，确保用户返回收藏列表时只看到收藏列表
      })

      // 从完整地址中提取城市和区县信息
      function extractCityAndDistrict(address) {
        if (!address) return '成都市';
        
        // 常见的地址格式："成都市武侯区某某街道"或"成都市锦江区某某路"
        // 提取前两级行政区划
        const addressParts = address.split(/[市县区]/).filter(part => part);
        if (addressParts.length >= 2) {
          return `${addressParts[0]}市${addressParts[1]}区`;
        } else if (addressParts.length >= 1) {
          return `${addressParts[0]}市`;
        } else {
          return '成都市';
        }
      }
      
      // 同时获取收藏列表和全部寄养家庭列表
      const [favoriteResult, hostResult] = await Promise.all([
        this.getFavoriteFamilies(),
        this.getHostList()
      ])

      console.log('获取收藏列表结果:', favoriteResult)
      let processedFavorites = []
      
      if (favoriteResult.code === 0 && favoriteResult.data) {
processedFavorites = favoriteResult.data.map(host => ({
        id: host._id || host.id,
        name: host.hostName || '未设置名称',
        avatarUrl: host.avatarUrl || '',
        rating: host.rating || 0,
        reviews: host.reviewCount || 0,
        price: host.pricePerDay || 0,
        location: extractCityAndDistrict(host.address),
        tags: ['有经验', '爱干净', '可上门'],
        isAcceptingOrders: host.isAcceptingOrders !== undefined ? host.isAcceptingOrders : true
      }))

        console.log('处理后的收藏列表:', processedFavorites)
        this.setData({
          favoriteFamilies: processedFavorites
        })
      }

      if (hostResult.code === 0 && hostResult.data) {
        // 获取已收藏的寄养家庭ID列表
        const favoriteIds = processedFavorites.map(host => host.id)
        
        // 过滤掉已收藏的寄养家庭，只保留未收藏的
        const processedHosts = hostResult.data
          .filter(host => !favoriteIds.includes(host._id || host.id)) // 过滤条件：不在收藏列表中
          .map(host => ({
            id: host._id || host.id,
            name: host.hostName || '未设置名称',
            avatarUrl: host.avatarUrl || '',
            rating: host.rating || 0,
            reviews: host.reviewCount || 0,
            price: host.pricePerDay || 0,
            location: extractCityAndDistrict(host.address),
            tags: ['有经验', '爱干净', '可上门'],
            isAcceptingOrders: host.isAcceptingOrders !== undefined ? host.isAcceptingOrders : true
          }))

        console.log('处理后的全部寄养家庭列表:', processedHosts)
        this.setData({
          hostList: processedHosts
        })
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      this.setData({
        errorMessage: '加载数据失败，请重试'
      })
    } finally {
      this.setData({
        isLoading: false
      })
    }
  },

  // 获取收藏的寄养家庭列表
  async getFavoriteFamilies() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'getFavorites',
        data: {
          _t: Date.now() // 添加时间戳参数，避免缓存
        },
        success: res => {
          console.log('获取收藏列表成功:', res.result)
          resolve(res.result)
        },
        fail: err => {
          console.error('获取收藏列表失败:', err)
          reject(err)
        }
      })
    })
  },

  // 获取全部寄养家庭列表
  async getHostList() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'getHostList',
        data: {
          _t: Date.now() // 添加时间戳参数，避免缓存
        },
        success: res => {
          console.log('获取寄养家庭列表成功:', res.result)
          resolve(res.result)
        },
        fail: err => {
          console.error('获取寄养家庭列表失败:', err)
          reject(err)
        }
      })
    })
  },

  // 检查是否是收藏的寄养家庭
  isFavorite(hostId) {
    return this.data.favoriteFamilies.some(host => host.id === hostId)
  },

  // 处理收藏/取消收藏点击事件
  async handleFavoriteTap(e) {
    const hostId = e.currentTarget.dataset.id
    // 从自定义组件的toggle事件中获取当前的激活状态
    const isFavorited = e.detail?.isActive || this.isFavorite(hostId)
    
    // 找到对应的寄养家庭信息
    const host = this.data.hostList.find(item => item.id === hostId) || 
                 this.data.favoriteFamilies.find(item => item.id === hostId)
    if (!host) return

    try {
      // 先在本地更新数据，实现实时效果
      if (isFavorited) {
        // 取消收藏：从收藏列表中移除
        const updatedFavorites = this.data.favoriteFamilies.filter(item => item.id !== hostId)
        this.setData({
          favoriteFamilies: updatedFavorites
        })
        
        // 将取消收藏的寄养家庭添加回全部寄养家庭列表
        const updatedHostList = [...this.data.hostList, host]
        this.setData({
          hostList: updatedHostList
        })
        
        // 然后调用云函数取消收藏
        await this.removeFavorite(hostId)
      } else {
        // 添加收藏：将寄养家庭添加到收藏列表
        const updatedFavorites = [...this.data.favoriteFamilies, host]
        this.setData({
          favoriteFamilies: updatedFavorites
        })
        
        // 从全部寄养家庭列表中移除已收藏的寄养家庭
        const updatedHostList = this.data.hostList.filter(item => item.id !== hostId)
        this.setData({
          hostList: updatedHostList
        })
        
        // 然后调用云函数添加收藏
        await this.addFavorite(hostId)
      }
    } catch (error) {
      console.error('处理收藏操作失败:', error)
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      })
      
      // 操作失败时，恢复本地数据
      await this.loadData()
    }
  },

  // 添加收藏
  async addFavorite(hostId) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'addFavorite',
        data: { hostProfileId: hostId },
        success: res => {
          console.log('添加收藏成功:', res.result)
          if (res.result.code === 0) {
            wx.showToast({
              title: '收藏成功',
              icon: 'success'
            })
            resolve(res.result)
          } else {
            wx.showToast({
              title: res.result.message,
              icon: 'none'
            })
            reject(new Error(res.result.message))
          }
        },
        fail: err => {
          console.error('添加收藏失败:', err)
          wx.showToast({
            title: '添加收藏失败',
            icon: 'none'
          })
          reject(err)
        }
      })
    })
  },

  // 取消收藏
  async removeFavorite(hostId) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'removeFavorite',
        data: { hostProfileId: hostId },
        success: res => {
          console.log('取消收藏成功:', res.result)
          if (res.result.code === 0) {
            wx.showToast({
              title: '取消收藏成功',
              icon: 'success'
            })
            resolve(res.result)
          } else {
            wx.showToast({
              title: res.result.message,
              icon: 'none'
            })
            reject(new Error(res.result.message))
          }
        },
        fail: err => {
          console.error('取消收藏失败:', err)
          wx.showToast({
            title: '取消收藏失败',
            icon: 'none'
          })
          reject(err)
        }
      })
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

  // 寄养家庭列表项开始触摸
  onHostItemTouchStart(e) {
    this.touchHandler.onTouchStart(e)
  },

  // 寄养家庭列表项结束触摸
  onHostItemTouchEnd(e) {
    const isSwiping = this.touchHandler.onTouchEnd(e)
    const hostId = e.currentTarget.dataset.id
    
    // 如果不是滑动，才执行点击事件
    if (!isSwiping) {
      this.selectHost(e)
    }
  },

  // 选择寄养家庭
  selectHost(e) {
    const hostId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/subpackages/booking/host-detail?id=${hostId}`
    })
  },

  // 显示全部寄养家庭
  showAllHosts() {
    this.setData({
      showAllHosts: true
    })
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 阻止事件冒泡，防止点击按钮时触发父元素的点击事件
  },

  // 头像加载失败时的处理函数
  onAvatarLoadError(e) {
    console.error('寄养家庭头像加载失败:', e.detail)
    const index = e.currentTarget.dataset.index
    const listKey = this.data.showAllHosts ? 'hostList' : 'favoriteFamilies'
    const list = [...this.data[listKey]]
    list[index].avatarUrl = '/images/default-avatar.svg'
    this.setData({
      [listKey]: list
    })
  }
})
