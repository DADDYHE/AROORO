const app = getApp()

Page({
  data: {
    addresses: [], // 地址列表
    selectedAddressId: '', // 当前选中的地址ID
    showEditPopup: false, // 是否显示编辑弹窗
    editingAddress: null, // 当前编辑的地址
    isLoading: false // 是否正在加载
  },

  onLoad(options) {
    console.log('Address page onLoad', options)
    // 初始化地址列表
    this.loadAddresses()
    // 如果有传入选中的地址ID，设置为当前选中
    if (options.selectedId) {
      this.setData({
        selectedAddressId: options.selectedId
      })
    }
  },

  onShow() {
    console.log('Address page onShow')
    // 页面显示时重新加载地址列表
    this.loadAddresses()
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 加载地址列表
  loadAddresses() {
    try {
      // 从本地存储加载地址列表
      const addresses = wx.getStorageSync('addresses') || []
      this.setData({
        addresses
      })
      console.log('加载地址列表成功:', addresses)
    } catch (error) {
      console.error('加载地址列表失败:', error)
      this.setData({
        addresses: []
      })
    }
  },

  // 保存地址列表到本地存储
  saveAddresses(addresses) {
    try {
      wx.setStorageSync('addresses', addresses)
      console.log('保存地址列表成功:', addresses)
    } catch (error) {
      console.error('保存地址列表失败:', error)
    }
  },

  // 选择地址
  selectAddress(e) {
    const addressId = e.currentTarget.dataset.id
    const address = this.data.addresses.find(item => item._id === addressId)
    if (address) {
      console.log('选择的地址:', address)
      // 保存选择的地址到全局数据
      app.globalData.selectedAddress = address
      
      // 返回上一页
      wx.navigateBack({
        delta: 1,
        success: () => {
          console.log('成功返回上一页')
          // 延迟执行，确保上一页已完全显示
          setTimeout(() => {
            // 通知上一页地址已选择
            const pages = getCurrentPages()
            console.log('当前页面栈:', pages.length)
            const prevPage = pages[pages.length - 1]
            console.log('上一页实例:', prevPage)
            if (prevPage && typeof prevPage.onAddressSelected === 'function') {
              console.log('调用上一页的onAddressSelected方法')
              prevPage.onAddressSelected(address)
            } else {
              console.error('上一页不存在onAddressSelected方法:', prevPage)
            }
          }, 100)
        },
        fail: (error) => {
          console.error('返回上一页失败:', error)
        }
      })
    }
  },

  // 添加新地址
  addAddress() {
    this.setData({
      editingAddress: null,
      showEditPopup: true
    })
  },

  // 编辑地址
  editAddress(e) {
    const addressId = e.currentTarget.dataset.id
    const address = this.data.addresses.find(item => item._id === addressId)
    if (address) {
      this.setData({
        editingAddress: { ...address },
        showEditPopup: true
      })
    }
  },

  // 删除地址
  deleteAddress(e) {
    const addressId = e.currentTarget.dataset.id
    const address = this.data.addresses.find(item => item._id === addressId)
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除地址吗？',
      success: (res) => {
        if (res.confirm) {
          // 过滤掉要删除的地址
          const addresses = this.data.addresses.filter(item => item._id !== addressId)
          // 如果删除的是默认地址，设置第一个地址为默认地址
          if (address.isDefault && addresses.length > 0) {
            addresses[0].isDefault = true
          }
          // 更新地址列表
          this.setData({
            addresses
          })
          // 保存到本地存储
          this.saveAddresses(addresses)
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          })
        }
      }
    })
  },

  // 关闭编辑弹窗
  closeEditPopup() {
    this.setData({
      showEditPopup: false,
      editingAddress: null
    })
  },

  // 姓名输入变化
  onNameChange(e) {
    this.setData({
      'editingAddress.name': e.detail.value
    })
  },

  // 手机号输入变化
  onPhoneChange(e) {
    this.setData({
      'editingAddress.phone': e.detail.value
    })
  },

  // 详细地址输入变化
  onDetailChange(e) {
    this.setData({
      'editingAddress.detail': e.detail.value
    })
  },

  // 城市列表
  cities: [
    { id: '110000', name: '北京市' },
    { id: '310000', name: '上海市' },
    { id: '440100', name: '广州市' },
    { id: '440300', name: '深圳市' },
    { id: '510100', name: '成都市' },
    { id: '500000', name: '重庆市' },
    { id: '320100', name: '南京市' },
    { id: '330100', name: '杭州市' },
    { id: '420100', name: '武汉市' },
    { id: '610100', name: '西安市' },
    { id: '370100', name: '济南市' },
    { id: '410100', name: '郑州市' },
    { id: '340100', name: '合肥市' },
    { id: '430100', name: '长沙市' },
    { id: '210100', name: '沈阳市' }
  ],

  // 选择位置（仅提供城市选择）
  chooseLocation() {
    // 显示城市选择列表
    wx.showActionSheet({
      itemList: this.cities.map(city => city.name),
      success: (res) => {
        const selectedCity = this.cities[res.tapIndex]
        console.log('选择的城市:', selectedCity)
        
        // 更新地址信息
        this.setData({
          'editingAddress.city': selectedCity.name,
          'editingAddress.province': selectedCity.name.includes('市') ? selectedCity.name : selectedCity.name + '省',
          'editingAddress.district': '',
          'editingAddress.detail': selectedCity.name
        })

        wx.showToast({
          title: '城市选择成功',
          icon: 'success'
        })
      },
      fail: (error) => {
        console.error('选择城市失败:', error)
      }
    })
  },

  // 默认地址开关变化
  onDefaultChange(e) {
    this.setData({
      'editingAddress.isDefault': e.detail.value
    })
  },

  // 保存地址
  saveAddress() {
    const { editingAddress } = this.data
    
    // 验证必填字段
    if (!editingAddress.name || !editingAddress.name.trim()) {
      wx.showToast({
        title: '请输入姓名',
        icon: 'none'
      })
      return
    }
    
    if (!editingAddress.phone || !/^1[3-9]\d{9}$/.test(editingAddress.phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      })
      return
    }
    
    if (!editingAddress.detail || !editingAddress.detail.trim()) {
      wx.showToast({
        title: '请输入详细地址',
        icon: 'none'
      })
      return
    }
    
    let addresses = [...this.data.addresses]
    
    if (editingAddress._id) {
      // 编辑现有地址
      const index = addresses.findIndex(item => item._id === editingAddress._id)
      if (index !== -1) {
        addresses[index] = editingAddress
      }
    } else {
      // 添加新地址
      // 生成唯一ID
      const newAddress = {
        ...editingAddress,
        _id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString()
      }
      addresses.push(newAddress)
    }
    
    // 如果设置了默认地址，取消其他地址的默认状态
    if (editingAddress.isDefault) {
      addresses = addresses.map(item => ({
        ...item,
        isDefault: item._id === editingAddress._id
      }))
    }
    
    // 更新地址列表
    this.setData({
      addresses,
      showEditPopup: false,
      editingAddress: null
    })
    
    // 保存到本地存储
    this.saveAddresses(addresses)
    
    wx.showToast({
      title: '保存成功',
      icon: 'success'
    })
  }
})
