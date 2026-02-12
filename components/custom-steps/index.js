// 自定义步骤指示器组件逻辑
Component({
  properties: {
    // 当前激活的步骤索引（从0开始）
    active: {
      type: Number,
      value: 0,
      observer: function(newVal, oldVal) {
        this.updateProgress()
      }
    },
    // 步骤数据
    steps: {
      type: Array,
      value: [],
      observer: function(newVal, oldVal) {
        this.updateProgress()
      }
    }
  },
  
  data: {
    progress: 0
  },
  
  lifetimes: {
    attached() {
      // 立即更新
      this.updateProgress()
    }
  },
  
  methods: {
    updateProgress() {
      const { active, steps } = this.properties
      const totalSteps = steps.length
      
      if (totalSteps > 1 && active < totalSteps) {
        const progress = (active / (totalSteps - 1)) * 100
        this.setData({
          progress: progress
        })
      } else {
        this.setData({
          progress: 0
        })
      }
    }
  }
})
