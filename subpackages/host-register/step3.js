const app = getApp()

Page({
  data: {
    formData: {
      serviceTypes: ['allDay'],
      pricePerDay: '',
      description: ''
    },
    serviceTypeOptions: [
      { name: '日间寄养', value: 'day' },
      { name: '夜间寄养', value: 'night' },
      { name: '全天寄养', value: 'allDay' },
      { name: '上门喂养', value: 'homeVisit' },
      { name: '遛狗服务', value: 'walk' }
    ],
    currentActive: 2,
    stepsData: [
      { text: '基本信息' },
      { text: '寄养环境' },
      { text: '服务信息' },
      { text: '资质认证' }
    ]
  },

  onLoad() {
    console.log('host-register step3: 页面加载')
    
    // 强制渲染步骤指示器
    this.setData({
      currentActive: 2,
      stepsData: [
        { text: '基本信息' },
        { text: '寄养环境' },
        { text: '服务信息' },
        { text: '资质认证' }
      ]
    })

    // 检查是否有上一步的数据
    if (app.globalData.hostFormData) {
      this.setData({
        formData: { ...this.data.formData, ...app.globalData.hostFormData }
      })
    }
  },

  // 选择服务类型
  selectServiceType(e) {
    const value = e.currentTarget.dataset.value
    const serviceTypes = [...this.data.formData.serviceTypes]
    
    if (serviceTypes.includes(value)) {
      // 如果已选中，则取消选中
      const index = serviceTypes.indexOf(value)
      serviceTypes.splice(index, 1)
    } else {
      // 如果未选中，则添加到选中列表
      serviceTypes.push(value)
    }

    const formData = { ...this.data.formData }
    formData.serviceTypes = serviceTypes
    this.setData({ formData })
  },

  // 输入处理
  onPricePerDayInput(e) {
    const formData = { ...this.data.formData }
    formData.pricePerDay = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },

  onDescriptionInput(e) {
    const formData = { ...this.data.formData }
    formData.description = e.detail.value ? String(e.detail.value) : ''
    this.setData({ formData })
  },



  // 上一步
  prevStep() {
    app.globalData.hostFormData = { ...this.data.formData }
    wx.navigateTo({
      url: '/subpackages/host-register/step2'
    })
  },

  // 下一步
  nextStep() {
    const { serviceTypes, pricePerDay, description } = this.data.formData

    if (!serviceTypes.length || !pricePerDay || !description) {
      wx.showToast({
        title: '请填写完整的信息',
        icon: 'none'
      })
      return
    }

    // 保存到全局变量
    app.globalData.hostFormData = { ...this.data.formData }

    wx.navigateTo({
      url: '/subpackages/host-register/step4'
    })
  }
})
