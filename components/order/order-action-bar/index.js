/**
 * order-action-bar - 统一订单底部操作栏组件
 *
 * 跨买单/寄养/活动/上门喂养四类订单详情页复用，统一底部固定操作栏的
 * 容器视觉（fixed 定位 / 背景 / 边框 / 内边距 / 按钮样式）。
 *
 * 纯展示组件：按钮由页面通过 actions 数组传入，点击后通过 bindaction 事件
 * 把按钮 key 回抛给页面，由页面执行对应业务逻辑。
 *
 * 用法：
 *   <order-action-bar
 *     actions="{{actions}}"
 *     disabled="{{paying}}"
 *     bindaction="onAction"
 *     tip="{{tipText}}"
 *   />
 *
 * actions 元素：{ key, text, type: 'primary'|'secondary'|'danger', show }
 * 当 actions 为空且 tip 非空时，显示 tip 文字（如活动已结束提示）。
 */
Component({
  options: {
    multipleSlots: false,
    addGlobalClass: true,
  },

  properties: {
    actions: { type: Array, value: [] },
    // 禁用全部按钮（支付中/处理中等）
    disabled: { type: Boolean, value: false },
    // 无按钮时的纯文字提示（固定底部居中）
    tip: { type: String, value: '' },
  },

  methods: {
    onTap(e) {
      const key = e.currentTarget.dataset.key
      if (!key) {return}
      this.triggerEvent('action', { action: key })
    },
  },
})