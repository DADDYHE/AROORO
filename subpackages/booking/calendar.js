const app = getApp()
const db = wx.cloud.database({
  env: app.globalData.envId
})
import loginModule from '../../src/modules/auth/index'
const { enhancePage } = require('../../utils/base-page')

Page(enhancePage({
  data: {
    showCalendar: false,
    minDate: new Date().getTime(),
    maxDate: new Date(new Date().getFullYear(), new Date().getMonth() + 6, new Date().getDate()).getTime(),
    defaultDate: null,
    selectedStartDate: '',
    selectedEndDate: '',
    days: 0,
    isLoggedIn: false,
    selectedPetsCount: 0,
    selectedLocation: '', // 新增位置选择数据
    dailyPrice: 100, // 假设每日价格为100元
    estimatedTotal: 0,
    userRole: 'owner', // 用户角色，默认为宠物主人
    hostOrders: [] // 寄养家庭的订单列表
  },

  onLoad() {
    // 检查用户是否已登录
    this.checkLoginStatus()
    // 获取用户角色
    this.getUserInfo()
    
    // 初始化默认日期（今天和明天）
    const today = new Date()
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
    this.setData({
      defaultDate: [today, tomorrow]
    })
    this.updateSelectedDates(today, tomorrow)
    
    // 检查是否有已选择的宠物
    this.checkSelectedPets()
  },
  
  // 检查登录状态
  async checkLoginStatus() {
    try {
      const isLoggedIn = await loginModule.checkLoginStatusValid()
      this.setData({
        isLoggedIn: isLoggedIn
      })
      
      if (!isLoggedIn) {
        // 引导用户登录
        const loginResult = await loginModule.login()
        if (loginResult.success) {
          this.setData({
            isLoggedIn: true
          })
        }
      }
    } catch (error) {
      console.error('检查登录状态失败:', error)
      this.setData({
        isLoggedIn: false
      })
    }
  },
  
  // 获取用户信息
  async getUserInfo() {
    try {
      // 使用标准登录模块获取用户信息
      const userInfo = loginModule.getUserInfo()
      const userRole = loginModule.getUserRole() || 'owner'
      
      if (userInfo) {
        this.setData({
          userRole: userRole
        })
        
        // 根据用户角色加载不同的数据
        if (userRole === 'host') {
          this.getHostOrders()
        }
        return
      }
      
      // 如果没有用户信息，尝试登录
      console.log('getUserInfo - 没有用户信息，尝试登录获取')
      const loginResult = await loginModule.login()
      
      if (loginResult.success) {
        const newUserInfo = loginModule.getUserInfo()
        const newUserRole = loginModule.getUserRole() || 'owner'
        
        this.setData({
          userRole: newUserRole
        })
        
        // 根据用户角色加载不同的数据
        if (newUserRole === 'host') {
          this.getHostOrders()
        }
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  },
  
  // 获取寄养家庭的订单数据
  getHostOrders() {
    // 调用云函数获取订单数据
    wx.cloud.callFunction({
      name: 'getHostOrders',
      success: (res) => {
        console.log('获取寄养家庭订单数据成功:', res.result)
        
        if (res.result.code === 0 && res.result.data) {
          this.setData({
            hostOrders: res.result.data
          })
        } else {
          console.error('获取寄养家庭订单数据失败:', res.result.message)
          // 使用模拟数据作为备用
          this.setData({
            hostOrders: [
              {
                id: '1',
                petName: '小白',
                ownerName: '张三',
                startDate: '2024-01-15',
                endDate: '2024-01-20',
                status: 'pending',
                price: 500
              },
              {
                id: '2',
                petName: '旺财',
                ownerName: '李四',
                startDate: '2024-01-25',
                endDate: '2024-01-30',
                status: 'confirmed',
                price: 600
              }
            ]
          })
        }
      },
      fail: (error) => {
        console.error('调用云函数 getHostOrders 失败:', error)
        // 使用模拟数据作为备用
        this.setData({
          hostOrders: [
            {
              id: '1',
              petName: '小白',
              ownerName: '张三',
              startDate: '2024-01-15',
              endDate: '2024-01-20',
              status: 'pending',
              price: 500
            },
            {
              id: '2',
              petName: '旺财',
              ownerName: '李四',
              startDate: '2024-01-25',
              endDate: '2024-01-30',
              status: 'confirmed',
              price: 600
            }
          ]
        })
      }
    })
  },

  // 打开日期选择器
  openDateSelector() {
    this.setData({
      showCalendar: true
    })
  },

  // 打开位置选择器
  openLocationSelector() {
    // 这里可以实现位置选择功能，比如调用地图选择或者显示位置列表
    // 暂时使用模拟数据 - 只开放成都市
    const locations = ['成都市']
    
    wx.showActionSheet({
      itemList: locations,
      success: (res) => {
        const selectedLocation = locations[res.tapIndex]
        this.setData({
          selectedLocation: selectedLocation
        })
        
        // 保存到全局变量，根据用户角色保存到对应的身份数据中
        const userRole = app.globalData.userRole || 'owner'
        if (userRole === 'owner') {
          app.globalData.ownerData.selectedLocation = selectedLocation
        } else {
          app.globalData.hostData.selectedLocation = selectedLocation
        }
      },
      fail: (res) => {
        console.error('位置选择失败:', res)
      }
    })
  },

  // 跳转到宠物选择页面
  async jumpToPetSelect() {
    wx.navigateTo({
      url: '/subpackages/booking/pet-select'
    })
  },

  // 找寄养
  findHost() {

    if (!this.data.selectedStartDate || !this.data.selectedEndDate) {
      wx.showToast({
        title: '请选择入住和退房日期',
        icon: 'none'
      })
      return
    }

    if (!this.data.selectedLocation) {
      wx.showToast({
        title: '请选择寄养位置',
        icon: 'none'
      })
      return
    }

    if (this.data.selectedPetsCount === 0) {
      wx.showToast({
        title: '请选择宠物',
        icon: 'none'
      })
      return
    }

    // 跳转到寄养家庭列表页面
    wx.navigateTo({
      url: '/subpackages/booking/host-list'
    })
  },

  // 检查已选择的宠物数量
  checkSelectedPets() {
    // 获取当前用户角色和对应的选中宠物数据
    const userRole = app.globalData.userRole || 'owner'
    const selectedPets = userRole === 'owner' ? app.globalData.ownerData.selectedPets : app.globalData.hostData.selectedPets
    
    if (selectedPets && selectedPets.length > 0) {
      this.setData({
        selectedPetsCount: selectedPets.length
      })
    }
  },

  // 检查用户登录状态
  // 使用增强页面提供的方法

  // 微信登录
  // 使用增强页面提供的方法

  onConfirm(event) {
    console.log('日期选择器确定按钮点击事件触发:', event)
    // 处理 van-calendar 组件的 confirm 事件参数
    // 对于 type="range"，参数结构是：{ value: [startDate, endDate] }
    let startDate, endDate;
    
    // 兼容不同的事件参数结构
    if (event.detail && Array.isArray(event.detail) && event.detail.length === 2) {
      // 旧版结构：event.detail 直接是数组
      startDate = event.detail[0]
      endDate = event.detail[1]
    } else if (event.detail && event.detail.value && Array.isArray(event.detail.value) && event.detail.value.length === 2) {
      // 新版结构：event.detail.value 是数组
      startDate = event.detail.value[0]
      endDate = event.detail.value[1]
    } else {
      console.error('日期选择器事件参数错误:', event)
      wx.showToast({
        title: '日期选择失败',
        icon: 'none'
      })
      return
    }
    
    // 更新选中的日期
    this.updateSelectedDates(startDate, endDate)
    // 关闭日历
    this.setData({
      showCalendar: false
    })
  },

  onCancel() {
    this.setData({
      showCalendar: false
    })
  },

  updateSelectedDates(startDate, endDate) {
    const formatDate = date => {
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      const weekDay = weekDays[date.getDay()]
      return `${month}月${day}日 <span class="week-day">${weekDay}</span>`
    }

    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
    
    // 获取当前用户角色和对应的选中宠物数据
    const userRole = app.globalData.userRole || 'owner'
    const selectedPets = userRole === 'owner' ? app.globalData.ownerData.selectedPets : app.globalData.hostData.selectedPets
    
    // 计算预估总费用，考虑宠物数量折扣
    const petCount = selectedPets.length
    
    // 计算基础费用
    let estimatedTotal = days * this.data.dailyPrice
    
    // 根据宠物数量计算折扣（每增加一只宠物，总费用打 9 折）
    if (petCount > 1) {
      estimatedTotal = estimatedTotal * (0.9 ** (petCount - 1))
    }
    
    // 计算最终价格（保留整数）
    estimatedTotal = Math.floor(estimatedTotal)

    this.setData({
      selectedStartDate: formatDate(startDate),
      selectedEndDate: formatDate(endDate),
      days: days,
      estimatedTotal: estimatedTotal,
      selectedPetsCount: petCount
    })

    // 保存到全局变量，根据用户角色保存到对应的身份数据中
    const selectedDates = {
      start: formatDate(startDate),
      end: formatDate(endDate),
      days: days,
      dailyPrice: this.data.dailyPrice,
      estimatedTotal: estimatedTotal
    }
    
    if (userRole === 'owner') {
      app.globalData.ownerData.selectedDates = selectedDates
    } else {
      app.globalData.hostData.selectedDates = selectedDates
    }
  },

  nextStep() {

    if (!this.data.selectedStartDate || !this.data.selectedEndDate) {
      wx.showToast({
        title: '请选择入住和退房日期',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: '/subpackages/booking/pet-select'
    })
  },

  // 检查日期可用性
  async checkDateAvailability(date) {
    try {
      const formatDate = date => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      const formattedDate = formatDate(date)
      
      // 调用云函数检查日期可用性
      const result = await wx.cloud.callFunction({
        name: 'checkDateAvailability',
        data: {
          date: formattedDate
        }
      })
      
      if (result.result.code === 0) {
        return result.result.data.isAvailable
      } else {
        console.error('检查日期可用性失败:', result.result.message)
        return true // 默认返回可用
      }
    } catch (error) {
      console.error('检查日期可用性失败:', error)
      return true // 默认返回可用
    }
  },

  // 标记可用日期
  async markAvailableDates() {
    // 这里可以通过扩展 van-calendar 组件来实现日期标记功能
    // 或者使用自定义日历组件
    console.log('标记可用日期')
  },

  // 设置 tabBar 选中状态
  setTabBarSelected() {
    // 调用增强页面提供的方法
    this.setTabBarIndex(1)
  },

  // 页面显示时更新登录状态和 tabBar 选中状态
  onShow() {
    console.log('Booking page onShow - 开始更新登录状态')
    // 检查并更新登录状态
    this.checkLoginStatus()
    // 获取用户角色
    this.getUserInfo()
    // 检查已选择的宠物数量
    this.checkSelectedPets()
    // 设置 tabBar 选中状态
    this.setTabBarSelected()
    
    // 强制更新找寄养按钮样式
    this.updateFindHostButtonStyle()
  },
  
  // 强制更新找寄养按钮样式
  updateFindHostButtonStyle() {
    // 使用 setTimeout 确保 DOM 已渲染完成
    setTimeout(() => {
      // 尝试获取页面所有 custom-button 元素
      const query = wx.createSelectorQuery()
      query.selectAll('.custom-button')
        .fields({
          rect: true,
          dataset: true,
          properties: ['style']
        })
        .exec((res) => {
          if (res && res[0] && res[0].length > 0) {
            console.log('找到按钮:', res[0])
            // 尝试强制设置按钮样式
            // 在微信小程序中，我们可以通过 setData 或直接修改样式
            // 这里我们尝试添加一个强制类名或直接修改样式
            this.setData({
              forceButtonStyle: true
            })
          } else {
            console.log('未找到按钮')
          }
        })
    }, 100)
  }
}))