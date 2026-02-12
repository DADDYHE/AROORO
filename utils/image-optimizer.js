// 图片性能优化工具
const ImageOptimizer = {
  // 预加载图片
  preloadImages(imageUrls, options = {}) {
    const defaultOptions = {
      priority: 'low', // low, medium, high
      timeout: 3000,
      maxConcurrent: 3
    }
    
    const finalOptions = { ...defaultOptions, ...options }
    const preloadPromises = []
    
    // 过滤掉空的图片URL
    const validImageUrls = imageUrls.filter(url => url && typeof url === 'string' && url.trim() !== '')
    
    if (validImageUrls.length === 0) {
      console.log('没有需要预加载的图片')
      return Promise.resolve([])
    }
    
    console.log(`开始预加载 ${validImageUrls.length} 张图片`)
    
    // 分批处理，控制并发数
    const batchLoad = (urls, batchSize) => {
      const batches = []
      for (let i = 0; i < urls.length; i += batchSize) {
        batches.push(urls.slice(i, i + batchSize))
      }
      
      return batches.reduce((prev, batch) => {
        return prev.then(() => {
          return Promise.all(batch.map(url => this.preloadImage(url, finalOptions)))
        })
      }, Promise.resolve())
    }
    
    return batchLoad(validImageUrls, finalOptions.maxConcurrent)
  },
  
  // 预加载单张图片
  preloadImage(url, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // 验证URL
        if (!url || typeof url !== 'string' || url.trim() === '') {
          console.warn('无效的图片URL，跳过预加载')
          resolve(false)
          return
        }
        
        // 检查微信环境
        if (typeof wx === 'undefined') {
          console.warn('非微信环境，跳过预加载:', url)
          resolve(false)
          return
        }
        
        // 检查 wx.createImage 是否可用
        if (typeof wx.createImage === 'function') {
          const image = wx.createImage()
          let timeoutId
          
          if (options.timeout > 0) {
            timeoutId = setTimeout(() => {
              console.warn('图片预加载超时:', url)
              resolve(false)
            }, options.timeout)
          }
          
          image.onload = () => {
            clearTimeout(timeoutId)
            console.log('图片预加载成功:', url)
            resolve(true)
          }
          
          image.onerror = () => {
            clearTimeout(timeoutId)
            console.warn('图片预加载失败:', url)
            resolve(false)
          }
          
          image.src = url
        } else {
          // 降级方案：使用 wx.getImageInfo 进行预加载
          if (typeof wx.getImageInfo === 'function') {
            console.log('使用 wx.getImageInfo 进行图片预加载:', url)
            
            let timeoutId
            if (options.timeout > 0) {
              timeoutId = setTimeout(() => {
                console.warn('图片预加载超时:', url)
                resolve(false)
              }, options.timeout)
            }
            
            wx.getImageInfo({
              src: url,
              success: () => {
                clearTimeout(timeoutId)
                console.log('图片预加载成功:', url)
                resolve(true)
              },
              fail: (error) => {
                clearTimeout(timeoutId)
                console.warn('图片预加载失败:', url, error)
                resolve(false)
              }
            })
          } else {
            // 完全降级：直接返回成功，不进行预加载
            console.warn('图片预加载API不可用，跳过预加载:', url)
            resolve(false)
          }
        }
      } catch (error) {
        console.error('图片预加载失败:', error)
        resolve(false)
      }
    })
  },
  
  // 渐进式加载图片（先加载低质量占位图，再加载原图）
  progressiveLoad(imageUrl, placeholderUrl, options = {}) {
    const defaultOptions = {
      threshold: 0.8, // 滚动阈值
      rootMargin: '50px'
    }
    
    const finalOptions = { ...defaultOptions, ...options }
    
    return new Promise((resolve) => {
      // 验证URL
      if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim() === '') {
        console.warn('无效的原图URL')
        resolve(null)
        return
      }
      
      // 检查微信环境
      if (typeof wx === 'undefined') {
        console.warn('非微信环境，直接返回原图URL')
        resolve(imageUrl)
        return
      }
      
      // 先加载占位图
      if (placeholderUrl && typeof placeholderUrl === 'string' && placeholderUrl.trim() !== '') {
        // 检查 wx.createImage 是否可用
        if (typeof wx.createImage === 'function') {
          const placeholderImage = wx.createImage()
          placeholderImage.onload = () => {
            console.log('占位图加载成功:', placeholderUrl)
            
            // 使用 IntersectionObserver 监听元素是否进入视口
            if (wx.createIntersectionObserver) {
              console.log('支持 IntersectionObserver，准备监听图片进入视口')
              // 示例: const observer = wx.createIntersectionObserver(this, { nativeMode: true })
              // observer.relativeTo('.image-container').observe('.image-item', (res) => {
              //   if (res.intersectionRatio > finalOptions.threshold) {
              //     // 加载原图
              //     loadOriginalImage()
              //     observer.disconnect()
              //   }
              // })
            } else {
              // 不支持 IntersectionObserver 的环境，直接加载原图
              this.loadOriginalImage(imageUrl, resolve)
            }
          }
          
          placeholderImage.onerror = () => {
            console.warn('占位图加载失败，直接加载原图:', placeholderUrl)
            this.loadOriginalImage(imageUrl, resolve)
          }
          
          placeholderImage.src = placeholderUrl
        } else {
          // wx.createImage 不可用，直接加载原图
          console.warn('wx.createImage 不可用，直接加载原图')
          this.loadOriginalImage(imageUrl, resolve)
        }
      } else {
        // 没有占位图，直接加载原图
        this.loadOriginalImage(imageUrl, resolve)
      }
    })
  },
  
  // 加载原图
  loadOriginalImage(url, resolve) {
    // 验证URL
    if (!url || typeof url !== 'string' || url.trim() === '') {
      console.warn('无效的图片URL')
      resolve(null)
      return
    }
    
    // 检查微信环境
    if (typeof wx === 'undefined') {
      console.warn('非微信环境，直接返回URL')
      resolve(url)
      return
    }
    
    // 检查 wx.createImage 是否可用
    if (typeof wx.createImage === 'function') {
      const image = wx.createImage()
      image.onload = () => {
        console.log('原图加载成功:', url)
        resolve(url)
      }
      
      image.onerror = () => {
        console.warn('原图加载失败:', url)
        resolve(null)
      }
      
      image.src = url
    } else {
      // wx.createImage 不可用，使用 wx.getImageInfo
      if (typeof wx.getImageInfo === 'function') {
        wx.getImageInfo({
          src: url,
          success: () => {
            console.log('原图加载成功:', url)
            resolve(url)
          },
          fail: (error) => {
            console.warn('原图加载失败:', url, error)
            resolve(null)
          }
        })
      } else {
        // 完全降级：直接返回URL
        console.warn('图片加载API不可用，直接返回URL')
        resolve(url)
      }
    }
  },
  
  // 生成图片缩略图URL（如果后端支持）
  getThumbnailUrl(originalUrl, size = '100x100') {
    // 验证URL
    if (!originalUrl || typeof originalUrl !== 'string' || originalUrl.trim() === '') {
      return null
    }
    
    // 这里需要根据后端API格式调整
    // 示例: return originalUrl.replace(/(\.\w+)$/, `_${size}$1`)
    return originalUrl
  },
  
  // 优化图片加载顺序
  optimizeLoadOrder(images, containerHeight) {
    // 验证参数
    if (!Array.isArray(images)) {
      console.warn('无效的图片数组')
      return []
    }
    
    // 如果没有提供containerHeight，使用新的API获取
    if (!containerHeight) {
      try {
        const windowInfo = wx.getWindowInfo()
        containerHeight = windowInfo.windowHeight
      } catch (error) {
        console.warn('使用新API获取窗口高度失败，使用默认值:', error)
        containerHeight = 667 // 默认窗口高度
      }
    }
    
    // 根据图片在视口中的位置排序，优先加载可见区域的图片
    return images.sort((a, b) => {
      const positionA = a.offsetTop || 0
      const positionB = b.offsetTop || 0
      
      // 计算与视口中心的距离
      const distanceA = Math.abs(positionA - containerHeight / 2)
      const distanceB = Math.abs(positionB - containerHeight / 2)
      
      return distanceA - distanceB
    })
  }
}

module.exports = ImageOptimizer