const app = getApp()
const db = wx.cloud.database({
  env: app.globalData.envId
})
import loginModule from '../../src/modules/auth/index'

Page({
  data: {
    selectedDates: {},
    selectedPets: [],
    selectedPetsDetails: [],
    basicPrice: 0,
    discount: 0,
    totalPrice: 0,
    loading: false,
    isLoggedIn: false
  },

  onLoad() {
    // 检查用户是否已登录
    this.checkLoginStatus()
    this.loadOrderInfo()
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

  // 微信快捷登录
  async loginWithWechat() {
    wx.showLoading({
      title: '登录中...'
    })
    
    try {
      // 使用标准登录模块登录
      const loginResult = await loginModule.login()
      
      if (loginResult.success) {
        console.log('登录成功:', loginResult)
        
        // 更新页面数据
        this.setData({
          isLoggedIn: true
        })
        
        wx.hideLoading()
        wx.showToast({
          title: '登录成功',
          icon: 'success'
        })
      } else {
        console.error('登录失败：', loginResult.message)
        wx.hideLoading()
        wx.showToast({
          title: '登录失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('登录失败：', error)
      wx.hideLoading()
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      })
    }
  },

  // 加载订单信息
  async loadOrderInfo() {
    try {
      // 获取当前用户角色
      const userRole = app.globalData.userRole || 'owner'
      // 获取对应身份的预订信息
      const selectedDates = userRole === 'owner' ? app.globalData.ownerData.selectedDates : app.globalData.hostData.selectedDates
      const selectedPets = userRole === 'owner' ? app.globalData.ownerData.selectedPets : app.globalData.hostData.selectedPets
      const selectedPetsDetails = userRole === 'owner' ? app.globalData.ownerData.selectedPetDetails : app.globalData.hostData.selectedPetDetails

      this.setData({
        selectedDates,
        selectedPets,
        selectedPetsDetails: selectedPetsDetails || []
      })

      // 获取选中宠物的详情
      if (selectedPets.length > 0 && !selectedPetsDetails) {
        try {
          const petsDetails = []
          for (const petId of selectedPets) {
            const result = await wx.cloud.callFunction({
              name: 'getPetDetail',
              data: {
                petId: petId
              }
            })
            if (result.result.code === 0) {
              petsDetails.push(result.result.data)
            }
          }
          this.setData({
            selectedPetsDetails: petsDetails
          })
        } catch (error) {
          console.error('获取宠物详情失败:', error)
          // 如果获取宠物详情失败（如集合不存在），不显示错误提示，继续执行
          this.setData({
            selectedPetsDetails: []
          })
        }
      }

      // 计算价格
      await this.calculatePrice()
    } catch (error) {
      console.error('加载订单信息失败:', error)
      // 处理集合不存在的情况
      if (error.message && error.message.includes('DATABASE_COLLECTION_NOT_EXIST')) {
        console.log('集合不存在，继续执行')
      } else {
        wx.showToast({
          title: '加载订单信息失败',
          icon: 'none'
        })
      }
    }
  },

  // 计算价格
  async calculatePrice() {
    try {
      const { selectedDates, selectedPets } = this.data

      // 调用云函数计算价格
      const result = await wx.cloud.callFunction({
        name: 'calculatePrice',
        data: {
          startDate: selectedDates.start,
          endDate: selectedDates.end,
          petCount: selectedPets.length
        }
      })

      if (result.result.code === 0) {
        const { basicPrice, discount, totalPrice } = result.result.data
        this.setData({
          basicPrice,
          discount,
          totalPrice
        })
      } else {
        console.error('计算价格失败:', result.result.message)
        wx.showToast({
          title: '计算价格失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('计算价格失败:', error)
      wx.showToast({
        title: '计算价格失败',
        icon: 'none'
      })
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 宠物头像加载失败
  onPetAvatarLoadError(e) {
    const index = e.currentTarget.dataset.index
    console.error(`宠物头像加载失败，索引: ${index}`, e.detail)
    const selectedPetsDetails = [...this.data.selectedPetsDetails]
    selectedPetsDetails[index].avatarUrl = 'https://picsum.photos/200/200?random=9'
    this.setData({ selectedPetsDetails })
  },

  // 确认预订
  async confirmBooking() {
    try {
      if (!this.data.isLoggedIn) {
        wx.showModal({
          title: '请登录',
          content: '您需要先登录才能确认预订',
          confirmText: '去登录',
          success: (res) => {
            if (res.confirm) {
              this.loginWithWechat()
            }
          }
        })
        return
      }

      this.setData({ loading: true })

      // 从云函数获取用户信息
      wx.cloud.callFunction({
        name: 'login',
        success: res => {
          if (res.result.code === 0 && res.result.userInfo) {
            const userInfo = res.result.userInfo

            // 创建订单
            const orderData = {
              userId: userInfo._id,
              startDate: this.data.selectedDates.start,
              endDate: this.data.selectedDates.end,
              days: this.data.selectedDates.days,
              petIds: this.data.selectedPets,
              requirements: app.globalData.bookingRequirements,
              basicPrice: this.data.basicPrice,
              discount: this.data.discount,
              totalPrice: this.data.totalPrice,
              status: 'pending', // pending: 待支付, paid: 已支付, confirmed: 已确认, completed: 已完成, cancelled: 已取消
              createdAt: new Date(),
              updatedAt: new Date()
            }

            // 调用云函数创建订单
            wx.cloud.callFunction({
              name: 'createBooking',
              data: orderData,
              success: result => {
                if (result.result.code !== 0) {
                  console.error('创建订单失败:', result.result.message)
                  wx.showToast({
                    title: '创建订单失败',
                    icon: 'none'
                  })
                  this.setData({ loading: false })
                  return
                }

                wx.showToast({
                  title: '预订成功',
                  icon: 'success'
                })

                // 重置全局变量
                app.globalData.selectedDates = {}
                app.globalData.selectedPets = []
                app.globalData.bookingRequirements = {}

                // 跳转到个人中心
                setTimeout(() => {
                  wx.switchTab({
                    url: '/pages/profile/index'
                  })
                }, 1500)
              },
              fail: error => {
                console.error('调用创建订单云函数失败:', error)
                wx.showToast({
                  title: '确认预订失败',
                  icon: 'none'
                })
                this.setData({ loading: false })
              }
            })
          } else {
            console.error('获取用户信息失败:', res.result.message || '用户信息获取失败')
            wx.showToast({
              title: '获取用户信息失败',
              icon: 'none'
            })
            this.setData({ loading: false })
          }
        },
        fail: error => {
          console.error('调用 login 云函数失败:', error)
          wx.showToast({
            title: '获取用户信息失败',
            icon: 'none'
          })
          this.setData({ loading: false })
        }
      })
    } catch (error) {
      console.error('确认预订过程中发生异常:', error)
      wx.showToast({
        title: '确认预订失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  }
})