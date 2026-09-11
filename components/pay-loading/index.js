/**
 * pay-loading · 全局支付 loading（变体 A：22% 暖墨 + 金环 + 文字）
 *
 * 自管理：attached 时向 PaymentService 注册 loading 监听，
 * 页面只需挂 <pay-loading /> 一行，pay() 全程自动显隐。
 */
const { PaymentService } = require('../../services/PaymentService')

Component({
  data: {
    visible: false,
  },

  lifetimes: {
    attached() {
      PaymentService.setPayLoadingListener(visible => {
        this.setData({ visible: !!visible })
      })
    },
    detached() {
      PaymentService.setPayLoadingListener(null)
    },
  },
})
