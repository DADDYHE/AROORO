// pages/hosting-services/edit.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    hostDescription: '',
    charCount: 0,
    isSaving: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 获取传递过来的家庭介绍数据
    if (options.description) {
      this.setData({
        hostDescription: options.description,
        charCount: options.description.length
      })
    }
  },

  /**
   * 处理输入框输入
   */
  onInput: function (e) {
    const value = e.detail.value
    this.setData({
      hostDescription: value,
      charCount: value.length
    })
  },

  /**
   * 保存修改
   */
  save: function () {
    const { hostDescription } = this.data
    
    // 验证输入内容
    if (!hostDescription.trim()) {
      wx.showToast({
        title: '请输入家庭介绍',
        icon: 'none'
      })
      return
    }

    // 显示保存中状态
    this.setData({
      isSaving: true
    })

    // 调用云函数更新家庭介绍
    wx.cloud.callFunction({
      name: 'updateHostProfile',
      data: {
        updateType: 'description',
        description: hostDescription
      },
      success: res => {
        console.log('更新家庭介绍成功:', res)
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
        // 保存成功后返回上一页
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      },
      fail: err => {
        console.error('更新家庭介绍失败:', err)
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        })
        // 恢复保存状态
        this.setData({
          isSaving: false
        })
      }
    })
  },

  /**
   * 取消编辑
   */
  cancel: function () {
    wx.navigateBack()
  }
})