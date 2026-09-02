// zy-skeleton · 轻量骨架屏组件
// 底色走 theme-teal 令牌 --skeleton-base（亮 #ECE8DE / 暗态同名覆盖 #23251E，自动适配）；
// 扫光层复用 booking/confirm.wxss .confirm-btn::before 已验证的 Skyline 模式
// （伪元素 + absolute + 父级 overflow:hidden + translateX 动画），keyframes 自带不依赖全局。
Component({
  properties: {
    // list: 列表行（头像+两行） | grid: 两列卡片网格 | detail: 大图+标题+段落
    type: { type: String, value: 'list' },
    // 重复单元个数（list 行数 / grid 卡片数），1~12
    count: { type: Number, value: 3 },
    // detail 型头图高度（rpx），随页面 hero 比例调整
    heroHeight: { type: Number, value: 420 },
  },

  data: {
    items: [1, 2, 3],
  },

  observers: {
    'count, type': function (count) {
      const c = Math.max(1, Math.min(12, Number(count) || 3))
      this.setData({ items: Array.from({ length: c }, (_, i) => i + 1) })
    },
  },
})
