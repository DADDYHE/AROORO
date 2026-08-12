/**
 * order-status-banner - 统一订单状态横幅组件
 *
 * 跨买单/寄养/活动/上门喂养四类订单详情页复用，统一状态区视觉。
 * 纯展示组件：状态文案、描述、倒计时、图标均由页面传入，本组件不承载业务逻辑。
 *
 * 用法：
 *   <order-status-banner
 *     status="{{order.status}}"
 *     status-text="{{order.statusText}}"
 *     status-desc="{{order.statusDesc}}"
 *     pay-countdown="{{payCountdown}}"
 *     has-icon="{{true}}"
 *     icon-src="{{iconSrc}}"
 *     centered="{{true}}"
 *   />
 */
Component({
  options: {
    multipleSlots: false,
    addGlobalClass: true,
  },

  properties: {
    // 订单状态，用于选择渐变底色（pending_payment / paid / shipped / confirmed / in_progress / completed / cancelled / rejected / refunded）
    status: { type: String, value: 'pending_payment' },
    statusText: { type: String, value: '' },
    statusDesc: { type: String, value: '' },
    // 支付倒计时文本；非空且 status=pending_payment 时展示（由页面在待支付态填充）
    payCountdown: { type: String, value: '' },
    // 是否显示状态图标（活动/上门喂养等带图标风格；买单/寄养可不传）
    hasIcon: { type: Boolean, value: false },
    iconSrc: { type: String, value: '' },
    // 是否居中排版（活动确认页等居中式；默认左对齐）
    centered: { type: Boolean, value: false },
  },
})