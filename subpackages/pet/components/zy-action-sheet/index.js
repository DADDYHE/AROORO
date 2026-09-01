// ================================================================
// components/zy-action-sheet · Skyline 兼容底部动作面板
// 替代 van-action-sheet，基于 zy-popup 扩展
// ================================================================

Component({
  properties: {
    // 是否显示
    show: { type: Boolean, value: false },
    // 标题
    title: { type: String, value: '' },
    // 选项列表 [{ name, subname, color, disabled, loading }]
    actions: { type: Array, value: [] },
    // 取消按钮文字，空字符串不显示
    cancelText: { type: String, value: '取消' },
    // 描述文字（标题下方）
    description: { type: String, value: '' },
    // 是否圆角
    round: { type: Boolean, value: true },
    // 关闭图标是否显示
    closeable: { type: Boolean, value: false },
    // z-index
    zIndex: { type: Number, value: 1000 },
  },

  methods: {
    // 点击选项
    // 事件载荷与 Vant action-sheet 对齐：
    //   event.detail = { name, subname, color, disabled, loading, index }
    onSelect(e) {
      const { index } = e.currentTarget.dataset
      const action = this.data.actions[index]
      if (action.disabled || action.loading) {return}
      this.triggerEvent('select', { ...action, index })
      // 默认选中后关闭
      this.triggerEvent('close', { source: 'select' })
    },

    // 点击取消
    onCancel() {
      this.triggerEvent('cancel')
      this.triggerEvent('close', { source: 'cancel' })
    },

    // 关闭
    onClose(e) {
      this.triggerEvent('close', e.detail || {})
    },

    // 阻止冒泡
    noop() {},
  },
})
