import { callAction } from './index'
export function adminRefund(outTradeNo, refundAmount, reason) {
  return callAction('adminRefund', { outTradeNo, refundAmount, reason })
}
