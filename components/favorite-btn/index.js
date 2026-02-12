// 收藏按钮组件逻辑
Component({
  properties: {
    // 是否激活状态
    isActive: {
      type: Boolean,
      value: false
    }
  },
  
  observers: {
    // 监听激活状态变化，确保样式正确
    isActive(newActive) {
      this.setIconColor(newActive)
    }
  },
  
  lifetimes: {
    // 组件加载完成后设置初始颜色
    ready() {
      this.setIconColor(this.properties.isActive)
    }
  },
  
  methods: {
    // 设置图标颜色
    setIconColor(isActive) {
      const query = this.createSelectorQuery()
      query.select('.heart-icon')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (res && res[0] && res[0].node) {
            const node = res[0].node
            node.style.color = isActive ? '#000000' : '#999999'
          }
        })
    },
    
    // 处理点击事件
    handleToggle() {
      // 切换激活状态
      const newActive = !this.properties.isActive
      
      // 触发自定义事件
      this.triggerEvent('toggle', { isActive: newActive })
    }
  }
})