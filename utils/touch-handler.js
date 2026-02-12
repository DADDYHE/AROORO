// 触摸事件处理器，用于区分点击和滑动
class TouchHandler {
  constructor() {
    this.touchStartX = 0
    this.touchStartY = 0
    this.touchEndX = 0
    this.touchEndY = 0
    this.touchStartTime = 0
    this.touchEndTime = 0
    this.isSwiping = false
    this.swipeThreshold = 20 // 滑动阈值，单位：px
    this.tapThreshold = 300 // 点击时间阈值，单位：ms
  }

  // 记录触摸开始位置和时间
  onTouchStart(e) {
    this.touchStartX = e.touches[0].clientX
    this.touchStartY = e.touches[0].clientY
    this.touchStartTime = Date.now()
    this.isSwiping = false
  }

  // 记录触摸结束位置和时间
  onTouchEnd(e) {
    this.touchEndX = e.changedTouches[0].clientX
    this.touchEndY = e.changedTouches[0].clientY
    this.touchEndTime = Date.now()
    
    // 计算滑动距离
    const deltaX = Math.abs(this.touchEndX - this.touchStartX)
    const deltaY = Math.abs(this.touchEndY - this.touchStartY)
    const deltaTime = this.touchEndTime - this.touchStartTime
    
    // 判断是否为滑动
    if ((deltaX > this.swipeThreshold || deltaY > this.swipeThreshold) && deltaTime < this.tapThreshold * 2) {
      this.isSwiping = true
    } else {
      this.isSwiping = false
    }
    
    return this.isSwiping
  }

  // 重置触摸状态
  reset() {
    this.touchStartX = 0
    this.touchStartY = 0
    this.touchEndX = 0
    this.touchEndY = 0
    this.touchStartTime = 0
    this.touchEndTime = 0
    this.isSwiping = false
  }

  // 获取滑动方向
  getSwipeDirection() {
    const deltaX = this.touchEndX - this.touchStartX
    const deltaY = this.touchEndY - this.touchStartY
    
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX > 0 ? 'right' : 'left'
    } else {
      return deltaY > 0 ? 'down' : 'up'
    }
  }

  // 检查是否为点击
  isTap() {
    const deltaX = Math.abs(this.touchEndX - this.touchStartX)
    const deltaY = Math.abs(this.touchEndY - this.touchStartY)
    const deltaTime = this.touchEndTime - this.touchStartTime
    
    return deltaX < this.swipeThreshold && deltaY < this.swipeThreshold && deltaTime < this.tapThreshold
  }

  // 静态方法，用于创建实例
  static create() {
    return new TouchHandler()
  }
}

module.exports = TouchHandler
