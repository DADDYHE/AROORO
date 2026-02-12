/**
 * 虚拟列表优化工具
 * 
 * 功能：
 * 1. 实现虚拟滚动，只渲染可视区域内的消息
 * 2. 支持消息缓存，提升滚动性能
 * 3. 支持动态高度计算
 * 4. 支持懒加载图片
 * 
 * 设计原则：
 * - 性能优先：最大限度减少DOM节点数量
 * - 流畅滚动：避免滚动时的卡顿
 * - 内存友好：合理控制缓存大小
 */

class VirtualListOptimizer {
  constructor(options = {}) {
    // 配置参数
    this._config = {
      // 缓冲区大小（可视区域外的额外渲染数量）
      bufferSize: options.bufferSize || 5,
      // 预加载区域大小（提前加载的消息数量）
      preloadSize: options.preloadSize || 10,
      // 默认消息高度（像素）
      defaultItemHeight: options.defaultItemHeight || 80,
      // 最大缓存消息数量
      maxCacheSize: options.maxCacheSize || 200,
      // 是否启用图片懒加载
      lazyLoadImages: options.lazyLoadImages !== false,
      // 是否启用高度缓存
      enableHeightCache: options.enableHeightCache !== false,
    }
    
    // 消息列表数据
    this._items = []
    this._itemHeightMap = new Map() // 消息高度缓存
    this._positionMap = new Map() // 消息位置缓存
    
    // 滚动状态
    this._scrollTop = 0
    this._viewportHeight = 0
    this._startIndex = 0
    this._endIndex = 0
    this._totalHeight = 0
    
    // 图片懒加载状态
    this._lazyLoadObserver = null
    this._loadedImages = new Set()
    
    // 事件监听器
    this._eventHandlers = new Map()
    
    // 观察器（Intersection Observer）
    this._observer = null
    
    console.log('[VirtualListOptimizer] 初始化完成')
  }
  
  /**
   * 设置消息列表
   * @param {Array} items - 消息列表
   */
  setItems(items) {
    try {
      this._items = items || []
      this._calculatePositions()
      console.log(`[VirtualListOptimizer] 设置消息列表，共 ${this._items.length} 条消息`)
    } catch (error) {
      console.error('[VirtualListOptimizer] 设置消息列表失败:', error)
    }
  }
  
  /**
   * 添加消息
   * @param {Object|Array} item - 单条消息或消息数组
   */
  addItems(item) {
    try {
      const itemsToAdd = Array.isArray(item) ? item : [item]
      this._items.push(...itemsToAdd)
      this._calculatePositions()
      console.log(`[VirtualListOptimizer] 添加 ${itemsToAdd.length} 条消息`)
    } catch (error) {
      console.error('[VirtualListOptimizer] 添加消息失败:', error)
    }
  }
  
  /**
   * 计算所有消息的位置
   * @private
   */
  _calculatePositions() {
    try {
      let offset = 0
      
      this._items.forEach((item, index) => {
        const height = this._getItemHeight(item, index)
        this._positionMap.set(index, {
          offset,
          height,
          bottom: offset + height,
        })
        offset += height
      })
      
      this._totalHeight = offset
    } catch (error) {
      console.error('[VirtualListOptimizer] 计算消息位置失败:', error)
    }
  }
  
  /**
   * 获取消息高度
   * @private
   * @param {Object} item - 消息对象
   * @param {number} index - 消息索引
   * @returns {number} 消息高度
   */
  _getItemHeight(item, index) {
    try {
      // 如果启用了高度缓存且已缓存，直接返回
      if (this._config.enableHeightCache && this._itemHeightMap.has(index)) {
        return this._itemHeightMap.get(index)
      }
      
      // 根据消息类型计算高度
      let height = this._config.defaultItemHeight
      
      if (item.type === 'TIMTextElem') {
        // 文本消息：根据内容长度估算
        const textLength = item.payload?.text?.length || 0
        height = Math.min(Math.max(40, textLength * 2 + 40), 300)
      } else if (item.type === 'TIMImageElem') {
        // 图片消息：固定高度或根据图片比例
        const imageInfo = item.payload?.imageInfoArray?.[0]
        if (imageInfo) {
          const aspectRatio = imageInfo.width / imageInfo.height
          height = Math.min(300, 200 / aspectRatio)
        } else {
          height = 200
        }
      } else if (item.type === 'TIMSoundElem') {
        // 语音消息：固定高度
        height = 60
      } else if (item.type === 'TIMCustomElem') {
        // 自定义消息：根据内容判断
        height = 100
      }
      
      // 缓存高度
      if (this._config.enableHeightCache) {
        this._itemHeightMap.set(index, height)
      }
      
      return height
    } catch (error) {
      console.error('[VirtualListOptimizer] 获取消息高度失败:', error)
      return this._config.defaultItemHeight
    }
  }
  
  /**
   * 更新消息高度
   * @param {number} index - 消息索引
   * @param {number} height - 消息高度
   */
  updateItemHeight(index, height) {
    try {
      this._itemHeightMap.set(index, height)
      this._calculatePositions()
      console.log(`[VirtualListOptimizer] 更新消息 ${index} 高度为 ${height}px`)
    } catch (error) {
      console.error('[VirtualListOptimizer] 更新消息高度失败:', error)
    }
  }
  
  /**
   * 计算可视区域的消息索引
   * @returns {Object} {startIndex, endIndex, items}
   */
  calculateVisibleRange() {
    try {
      const { bufferSize } = this._config
      
      // 计算起始索引
      let startIndex = 0
      for (let i = 0; i < this._items.length; i++) {
        const position = this._positionMap.get(i)
        if (position && position.bottom > this._scrollTop) {
          startIndex = i
          break
        }
      }
      
      // 计算结束索引
      let endIndex = startIndex
      const viewportBottom = this._scrollTop + this._viewportHeight
      
      for (let i = startIndex; i < this._items.length; i++) {
        const position = this._positionMap.get(i)
        if (position && position.offset > viewportBottom) {
          endIndex = i
          break
        }
        endIndex = i + 1
      }
      
      // 应用缓冲区
      this._startIndex = Math.max(0, startIndex - bufferSize)
      this._endIndex = Math.min(this._items.length, endIndex + bufferSize)
      
      // 获取可视区域的消息
      const visibleItems = this._items.slice(this._startIndex, this._endIndex)
      
      return {
        startIndex: this._startIndex,
        endIndex: this._endIndex,
        items: visibleItems,
        totalHeight: this._totalHeight,
        offsetBefore: this._positionMap.get(this._startIndex)?.offset || 0,
        offsetAfter: this._totalHeight - (this._positionMap.get(this._endIndex)?.bottom || 0),
      }
    } catch (error) {
      console.error('[VirtualListOptimizer] 计算可视区域失败:', error)
      return {
        startIndex: 0,
        endIndex: 0,
        items: [],
        totalHeight: 0,
        offsetBefore: 0,
        offsetAfter: 0,
      }
    }
  }
  
  /**
   * 处理滚动事件
   * @param {Object} scrollInfo - 滚动信息
   * @param {number} scrollInfo.scrollTop - 滚动位置
   * @param {number} scrollInfo.scrollHeight - 滚动高度
   * @param {number} scrollInfo.clientHeight - 视口高度
   * @returns {Object} 可视区域信息
   */
  handleScroll(scrollInfo) {
    try {
      this._scrollTop = scrollInfo.scrollTop || 0
      this._viewportHeight = scrollInfo.clientHeight || 0
      
      const visibleRange = this.calculateVisibleRange()
      
      this._emitEvent('scroll', {
        ...visibleRange,
        scrollTop: this._scrollTop,
      })
      
      return visibleRange
    } catch (error) {
      console.error('[VirtualListOptimizer] 处理滚动事件失败:', error)
      return this.calculateVisibleRange()
    }
  }
  
  /**
   * 初始化图片懒加载
   * @param {string} selector - 图片选择器
   */
  initLazyLoadImages(selector = '.lazy-image') {
    try {
      if (!this._config.lazyLoadImages) {
        return
      }
      
      // 在微信小程序中使用 IntersectionObserver
      if (typeof wx.createIntersectionObserver === 'function') {
        this._observer = wx.createIntersectionObserver(this, {
          observeAll: true,
          thresholds: [0.1],
          nativeMode: true // 启用原生模式，提高性能
        })
        
        this._observer.relativeToViewport().observe(selector, (res) => {
          if (res.intersectionRatio > 0) {
            const dataset = res.target.dataset
            if (dataset && dataset.src) {
              this._loadImage(res.target, dataset.src)
            }
          }
        })
        
        console.log('[VirtualListOptimizer] 图片懒加载初始化成功，已启用 nativeMode 提高性能')
      }
    } catch (error) {
      console.error('[VirtualListOptimizer] 初始化图片懒加载失败:', error)
    }
  }
  
  /**
   * 加载图片
   * @private
   * @param {Object} target - 图片元素
   * @param {string} src - 图片地址
   */
  _loadImage(target, src) {
    try {
      const imageKey = src
      
      // 如果已经加载过，跳过
      if (this._loadedImages.has(imageKey)) {
        return
      }
      
      // 标记为已加载
      this._loadedImages.add(imageKey)
      
      // 加载图片
      wx.getImageInfo({
        src,
        success: () => {
          this._emitEvent('imageLoaded', { src })
        },
        fail: (error) => {
          console.warn('[VirtualListOptimizer] 图片加载失败:', src, error)
        },
      })
    } catch (error) {
      console.error('[VirtualListOptimizer] 加载图片失败:', error)
    }
  }
  
  /**
   * 清理图片缓存
   */
  clearImageCache() {
    try {
      this._loadedImages.clear()
      console.log('[VirtualListOptimizer] 图片缓存已清理')
    } catch (error) {
      console.error('[VirtualListOptimizer] 清理图片缓存失败:', error)
    }
  }
  
  /**
   * 预加载消息图片
   * @param {Array} items - 消息列表
   */
  preloadImages(items) {
    try {
      if (!this._config.lazyLoadImages) {
        return
      }
      
      const preloadItems = items.slice(0, this._config.preloadSize)
      
      preloadItems.forEach((item) => {
        if (item.type === 'TIMImageElem') {
          const imageInfo = item.payload?.imageInfoArray?.[0]
          if (imageInfo && imageInfo.url) {
            this._loadImage(null, imageInfo.url)
          }
        }
      })
    } catch (error) {
      console.error('[VirtualListOptimizer] 预加载图片失败:', error)
    }
  }
  
  /**
   * 清理缓存
   */
  clearCache() {
    try {
      // 清理高度缓存
      this._itemHeightMap.clear()
      
      // 清理位置缓存
      this._positionMap.clear()
      
      // 清理图片缓存
      this._loadedImages.clear()
      
      console.log('[VirtualListOptimizer] 缓存已清理')
    } catch (error) {
      console.error('[VirtualListOptimizer] 清理缓存失败:', error)
    }
  }
  
  /**
   * 滚动到指定消息
   * @param {number} index - 消息索引
   * @param {boolean} smooth - 是否平滑滚动
   * @returns {number} 滚动位置
   */
  scrollToItem(index, smooth = true) {
    try {
      const position = this._positionMap.get(index)
      if (!position) {
        console.warn(`[VirtualListOptimizer] 消息 ${index} 不存在`)
        return 0
      }
      
      const scrollTop = position.offset - (this._viewportHeight / 2) + (position.height / 2)
      
      this._emitEvent('scrollTo', {
        scrollTop: Math.max(0, scrollTop),
        smooth,
      })
      
      return scrollTop
    } catch (error) {
      console.error('[VirtualListOptimizer] 滚动到消息失败:', error)
      return 0
    }
  }
  
  /**
   * 滚动到底部
   * @param {boolean} smooth - 是否平滑滚动
   * @returns {number} 滚动位置
   */
  scrollToBottom(smooth = true) {
    try {
      const scrollTop = this._totalHeight - this._viewportHeight
      
      this._emitEvent('scrollTo', {
        scrollTop: Math.max(0, scrollTop),
        smooth,
      })
      
      return scrollTop
    } catch (error) {
      console.error('[VirtualListOptimizer] 滚动到底部失败:', error)
      return 0
    }
  }
  
  /**
   * 滚动到顶部
   * @param {boolean} smooth - 是否平滑滚动
   * @returns {number} 滚动位置
   */
  scrollToTop(smooth = true) {
    try {
      this._emitEvent('scrollTo', {
        scrollTop: 0,
        smooth,
      })
      
      return 0
    } catch (error) {
      console.error('[VirtualListOptimizer] 滚动到顶部失败:', error)
      return 0
    }
  }
  
  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      totalItems: this._items.length,
      visibleItems: this._endIndex - this._startIndex,
      cachedHeights: this._itemHeightMap.size,
      loadedImages: this._loadedImages.size,
      totalHeight: this._totalHeight,
      scrollTop: this._scrollTop,
    }
  }
  
  /**
   * 销毁优化器
   */
  destroy() {
    try {
      // 清理观察器
      if (this._observer) {
        this._observer.disconnect()
        this._observer = null
      }
      
      // 清理缓存
      this.clearCache()
      
      // 清理事件监听器
      this._eventHandlers.clear()
      
      console.log('[VirtualListOptimizer] 优化器已销毁')
    } catch (error) {
      console.error('[VirtualListOptimizer] 销毁优化器失败:', error)
    }
  }
  
  /**
   * 注册事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} handler - 处理函数
   */
  on(eventName, handler) {
    if (!this._eventHandlers.has(eventName)) {
      this._eventHandlers.set(eventName, [])
    }
    this._eventHandlers.get(eventName).push(handler)
  }
  
  /**
   * 移除事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} handler - 处理函数
   */
  off(eventName, handler) {
    const handlers = this._eventHandlers.get(eventName)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }
  
  /**
   * 触发事件
   * @private
   * @param {string} eventName - 事件名称
   * @param {Object} data - 事件数据
   */
  _emitEvent(eventName, data) {
    const handlers = this._eventHandlers.get(eventName)
    if (handlers && handlers.length > 0) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`[VirtualListOptimizer] 事件处理器错误 (${eventName}):`, error)
        }
      })
    }
  }
}

module.exports = VirtualListOptimizer
