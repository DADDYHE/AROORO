/**
 * order-card - 统一订单信息卡片组件
 *
 * 跨买单/寄养/活动/上门喂养四类订单详情页复用，统一内容卡片的视觉
 * （底色 / 圆角 / 边框 / 内边距 / 标题样式）。
 *
 * 纯展示组件：通过具名插槽承载卡片内容，不承载业务逻辑。
 *
 * 用法：
 *   <order-card title="订单信息">
 *     <view slot="content">
 *       ...页面的信息行内容...
 *     </view>
 *   </order-card>
 *
 * 内置标准行样式（放在 content 插槽内使用）：
 *   .order-row / .order-row--total         信息行 / 合计行
 *   .order-row__label / .order-row__value  行标签 / 行值
 *   .order-row__value--discount            折扣值（绿色）
 */
Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true,
  },

  properties: {
    title: { type: String, value: '' },
  },
})