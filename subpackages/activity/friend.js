// subpackages/activity/friend.js
const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),

  /**
   * 页面的初始数据
   */
  data: {
    index: -1,
    petName: '',
    petGender: 'male',
    petBreed: '',
    phone: '',
    notes: '',
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 从URL参数中获取index
    let initialIndex = -1
    if (options.index) {
      initialIndex = parseInt(options.index, 10)
    }

    const eventChannel = this.getOpenerEventChannel()
    // 监听来自打开页面的事件
    eventChannel.on('acceptDataFromOpenerPage', data => {
      if (data.friend) {
        this.setData({
          index: data.index !== undefined ? data.index : initialIndex,
          petName: data.friend.petName || '',
          petGender: data.friend.petGender || 'male',
          petBreed: data.friend.petBreed || '',
          phone: data.friend.phone || '',
          notes: data.friend.notes || '',
        })
      }
    })
  },

  /**
   * 输入事件处理
   */
  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value })
  },

  /**
   * 选择性别
   */
  onSelectGender(e) {
    this.setData({ petGender: e.currentTarget.dataset.gender })
  },

  /**
   * 确定按钮
   */
  onConfirm() {
    const { petName, petBreed, phone } = this.data

    // 简单验证
    if (!petName || !petBreed || !phone) {
      this.error('FILL_REQUIRED')
      return
    }

    // 准备返回数据
    const friendData = {
      petName: this.data.petName,
      petGender: this.data.petGender,
      petBreed: this.data.petBreed,
      phone: this.data.phone,
      notes: this.data.notes,
    }

    // 通过 eventChannel 向打开页面发送数据
    const eventChannel = this.getOpenerEventChannel()
    eventChannel.emit('acceptDataFromOpenedPage', {
      friend: friendData,
      index: this.data.index,
    })

    // 返回上一页
    wx.navigateBack()
  },

  /**
   * 取消按钮
   */
  onCancel() {
    wx.navigateBack()
  },
})
