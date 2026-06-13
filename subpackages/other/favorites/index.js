const app = getApp()
const { FavoriteService, HostService } = require('../../../services/CloudFunctionService')
const { extractCityAndDistrict } = require('../../../utils/addressUtils')
const { authService } = require('../../../services/AuthService')
const cloudImageBehavior = require('../../../behaviors/cloudImageBehavior')

const SWIPE_THRESHOLD = 10

const pageI18n = require('../../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],
  data: {
    favoriteFamilies: [],
    hostList: [],
    isLoading: true,
    errorMessage: '',
    showAllHosts: false,
    isLoggedIn: false,
    touchedBookButton: false,
    animationComplete: false,
    _touchStartX: 0,
    _touchStartY: 0,
    _isSwiping: false,
  },

  onLoad() {
    setTimeout(() => {
      this.checkLoginAndLoadData()
    }, 800)
  },

  onShow() {
    this.setData({
      favoriteFamilies: [],
      hostList: [],
      showAllHosts: false,
      isLoading: true,
      animationComplete: false,
    })

    setTimeout(() => {
      this.checkLoginAndLoadData()
    }, 50)
  },

  // 检查登录状态并加载数据
  async checkLoginAndLoadData() {
    try {
      const isLoggedIn = authService.isLoggedIn()
      this.setData({ isLoggedIn })

      if (!isLoggedIn) {
        this.setData({
          isLoading: false,
          errorMessage: '请先登录',
        })
        return
      }

      this.loadData()
    } catch (error) {
      console.error('[APP] 检查登录状态失败:', error)
      this.setData({
        isLoggedIn: false,
        isLoading: false,
        errorMessage: '登录状态检查失败',
      })
    }
  },

  // 加载数据
  async loadData() {
    try {
      this.setData({
        isLoading: true,
        errorMessage: '',
        showAllHosts: false,
      })

      const favoriteResult = await this.getFavoriteFamilies()

      let processedFavorites = []

      if (favoriteResult.code === 0 && favoriteResult.data) {
        const favoriteList = favoriteResult.data.list || favoriteResult.data
        const favoriteHostIds = favoriteList.map(item => item.hostProfileId || item._id || item.id).filter(Boolean)

        if (favoriteHostIds.length > 0) {
          const hostResult = await HostService.getHostList({ ids: favoriteHostIds, pageSize: favoriteHostIds.length })
          if (hostResult.code === 0 && hostResult.data) {
            const hostList = hostResult.data.list || hostResult.data || []
            processedFavorites = hostList.map(host => ({
              id: host._id || host.id,
              name: host.hostName || '未设置名称',
              avatarUrl: (host.avatarUrl && host.avatarUrl !== '/images/default-avatar.png' && host.avatarUrl !== '/images/default-pet-avatar.png') ? host.avatarUrl : '/images/default-avatar.svg',
              price: host.pricePerDay || 0,
              location: extractCityAndDistrict(host.address),
              tags: host.tags || ['有经验', '爱干净', '可上门'],
              isAcceptingOrders: host.isAcceptingOrders !== undefined ? host.isAcceptingOrders : true,
            })).filter(host => host.name && host.name !== '未设置名称')
          }
        }
      }

      this.setData({
        favoriteFamilies: processedFavorites,
        hostList: [],
        animationComplete: true,
        isLoading: false,
      })
    } catch (error) {
      console.error('[APP] 加载数据失败:', error)
      this.setData({
        errorMessage: '加载数据失败，请重试',
        animationComplete: true,
        isLoading: false,
      })
    }
  },

  // 获取收藏的寄养家庭列表
  async getFavoriteFamilies() {
    try {
      const result = await FavoriteService.getFavorites({
        _t: Date.now(), // 添加时间戳参数，避免缓存
      })
      return result
    } catch (error) {
      console.error('[APP] 获取收藏列表失败:', error)
      throw error
    }
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

    // 找到对应的寄养家庭信息，只从hostList中查找，确保获取完整的寄养家庭对象
    let host = this.data.hostList.find(item => item.id === hostId)
    if (!host) {
      // 如果在hostList中找不到，从favoriteFamilies中查找
      const favoriteHost = this.data.favoriteFamilies.find(item => item.id === hostId)
      if (!favoriteHost) {
        console.error('[APP] 未找到寄养家庭信息:', hostId)
        return
      }
      // 使用favoriteHost，但确保它是完整的
      if (!favoriteHost.name || favoriteHost.name === '未设置名称') {
        console.error('[APP] 寄养家庭信息不完整:', favoriteHost)
        return
      }
      // 使用favoriteHost
      host = favoriteHost
    }

    try {
      // 添加动画效果
      const animation = wx.createAnimation({
        duration: 300,
        timingFunction: 'ease-in-out',
      })

      // 先在本地更新数据，实现实时效果
      if (isFavorited) {
        // 取消收藏：从收藏列表中移除
        const updatedFavorites = this.data.favoriteFamilies.filter(item => item.id !== hostId)
        this.setData({
          favoriteFamilies: updatedFavorites,
        })

        // 将取消收藏的寄养家庭添加回全部寄养家庭列表
        const updatedHostList = [...this.data.hostList, host]
        this.setData({
          hostList: updatedHostList,
        })

        // 然后调用云函数取消收藏
        await this.removeFavorite(hostId)
      } else {
        // 添加收藏：将寄养家庭添加到收藏列表
        const updatedFavorites = [...this.data.favoriteFamilies, host]
        this.setData({
          favoriteFamilies: updatedFavorites,
        })

        // 从全部寄养家庭列表中移除已收藏的寄养家庭
        const updatedHostList = this.data.hostList.filter(item => item.id !== hostId)
        this.setData({
          hostList: updatedHostList,
        })

        // 然后调用云函数添加收藏
        await this.addFavorite(hostId)
      }
    } catch (error) {
      console.error('[APP] 处理收藏操作失败:', error)
      this.error('OPERATION_RETRY')

      // 操作失败时，恢复本地数据
      await this.loadData()
    }
  },

  // 添加收藏
  async addFavorite(hostId) {
    try {
      const result = await FavoriteService.addFavorite({ hostProfileId: hostId })

      if (result.code === 0) {
        this.toast('FAVORITE_SUCCESS')
        return result
      } else {
        this.error(() => result.message)
        throw new Error(result.message)
      }
    } catch (error) {
      console.error('[APP] 添加收藏失败:', error)
      this.error('FAVORITE_FAILED')
      throw error
    }
  },

  // 取消收藏
  async removeFavorite(hostId) {
    try {
      const result = await FavoriteService.removeFavorite({ hostProfileId: hostId })

      if (result.code === 0) {
        this.toast('UNFAVORITE_SUCCESS')
        return result
      } else {
        this.error(() => result.message)
        throw new Error(result.message)
      }
    } catch (error) {
      console.error('[APP] 取消收藏失败:', error)
      this.error('UNFAVORITE_FAILED')
      throw error
    }
  },

  onListTouchStart(e) {
    if (e.touches[0]) {
      this.setData({
        _touchStartX: e.touches[0].clientX,
        _touchStartY: e.touches[0].clientY,
        _isSwiping: false,
      })
    }
  },

  onListTouchMove(e) {
    if (e.touches[0]) {
      const deltaX = Math.abs(e.touches[0].clientX - this.data._touchStartX)
      const deltaY = Math.abs(e.touches[0].clientY - this.data._touchStartY)
      if (deltaX > SWIPE_THRESHOLD || deltaY > SWIPE_THRESHOLD) {
        this.setData({ _isSwiping: true })
      }
    }
  },

  onListTouchEnd() {
    this.setData({ _isSwiping: false })
  },

  onHostItemTouchStart(e) {
    const targetDataset = e.target?.dataset || {}
    const isBookButton = targetDataset.isBookButton || targetDataset['is-book-button']
    this.setData({ touchedBookButton: Boolean(isBookButton) })
    if (e.touches[0]) {
      this.setData({
        _touchStartX: e.touches[0].clientX,
        _touchStartY: e.touches[0].clientY,
        _isSwiping: false,
      })
    }
  },

  onHostItemTouchEnd(e) {
    const isSwiping = this.data._isSwiping
    if (!isSwiping && !this.data.touchedBookButton) {
      this.selectHost(e)
    }
    this.setData({ touchedBookButton: false, _isSwiping: false })
  },

  // 选择寄养家庭
  selectHost(e) {
    const hostId = e.currentTarget.dataset.id
    // 添加页面跳转动画
    wx.navigateTo({
      url: `/subpackages/booking/host-detail?id=${hostId}`,
      success: () => {
      },
    })
  },

  // 预约寄养家庭
  bookHost(e) {

    // 从 dataset 中获取 hostId
    const hostId = e.currentTarget?.dataset?.id || e.mark?.id

    if (!hostId) {
      console.error('[APP] hostId 为空')
      this.error('HOST_ID_MISSING_TEXT')
      return
    }

    // 找到对应的寄养家庭信息
    const host = this.data.favoriteFamilies.find(item => item.id === hostId) ||
                 this.data.hostList.find(item => item.id === hostId)


    if (!host) {
      console.error('[APP] 未找到寄养家庭信息:', hostId)
      this.error('HOST_INFO_NOT_FOUND')
      return
    }

    const url = `/subpackages/booking/confirm?id=${hostId}`

    // 跳转到确认订单页面
    wx.navigateTo({
      url,
      success: () => {
      },
      fail: err => {
        console.error('[APP] ❌ 跳转失败:', err)
        this.error(() => `跳转失败：${err.errMsg || '未知错误'}`)
      },
    })
  },

  // 显示全部寄养家庭
  showAllHosts() {
    // 添加动画效果
    this.setData({
      showAllHosts: true,
    })
  },

  onAvatarLoadError(e) {
    console.error('[APP] 寄养家庭头像加载失败:', e.detail)
    const index = e.currentTarget.dataset.index
    const listKey = this.data.showAllHosts ? 'hostList' : 'favoriteFamilies'
    const list = [...this.data[listKey]]
    list[index].avatarUrl = '/images/default-avatar.svg'
    this.setData({
      [listKey]: list,
    })
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },
})
