// 通用错误处理工具
const ErrorHandler = {
  // 处理图片加载错误 - 简化版本，直接显示默认图片
  handleImageLoadError(e, context, options = {}) {
    const defaultOptions = {
      defaultImage: '/images/default-avatar.svg',
      fieldPath: 'userInfo.avatarUrl'
    }
    
    const finalOptions = { ...defaultOptions, ...options }
    const fieldParts = finalOptions.fieldPath.split('.')
    
    // 直接显示默认图片，不做任何重试或临时文件检查
    this.showDefaultImage(context, finalOptions.fieldPath, finalOptions.defaultImage)
  },
  
  // 显示默认图片
  showDefaultImage(context, fieldPath, defaultImage) {
    const fieldParts = fieldPath.split('.')
    const updateData = {}
    
    if (fieldParts.length === 2) {
      const [parent, child] = fieldParts
      const parentData = { ...context.data[parent] }
      parentData[child] = defaultImage
      updateData[parent] = parentData
    } else {
      updateData[fieldPath] = defaultImage
    }
    
    context.setData(updateData)
    
    // 更新全局数据和本地存储
    if (fieldPath === 'userInfo.avatarUrl') {
      const app = getApp()
      if (app.globalData.userInfo) {
        app.globalData.userInfo.avatarUrl = defaultImage
        
        try {
          wx.setStorageSync('userInfo', app.globalData.userInfo)
        } catch (error) {
          console.error('更新本地存储失败:', error)
        }
      }
    }
  },
  
  // 处理网络错误
  handleNetworkError(error, options = {}) {
    const defaultOptions = {
      showToast: true,
      message: '网络连接失败，请检查网络设置后重试',
      retry: false,
      retryCallback: null
    }
    
    const finalOptions = { ...defaultOptions, ...options }
    
    console.error('网络错误:', error)
    
    if (finalOptions.showToast) {
      wx.showToast({
        title: finalOptions.message,
        icon: 'none',
        duration: 3000
      })
    }
    
    if (finalOptions.retry && finalOptions.retryCallback) {
      setTimeout(() => {
        finalOptions.retryCallback()
      }, 1000)
    }
  },
  
  // 处理API错误
  handleApiError(error, options = {}) {
    const defaultOptions = {
      showToast: true,
      message: '请求失败，请稍后重试',
      logError: true
    }
    
    const finalOptions = { ...defaultOptions, ...options }
    
    if (finalOptions.logError) {
      console.error('API错误:', error)
    }
    
    if (finalOptions.showToast) {
      const errorMessage = error.message || finalOptions.message
      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000
      })
    }
  }
}

module.exports = ErrorHandler