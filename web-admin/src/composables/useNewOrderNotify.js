import { ref, watch } from 'vue'
import { ElNotification } from 'element-plus'

export function useNewOrderNotify(list, orderTypeLabel = '订单') {
  const previousCount = ref(0)
  const previousIds = ref(new Set())

  watch(list, newList => {
    if (!newList || newList.length === 0) {return}

    const currentIds = new Set(newList.map(item => item._id))
    const newItems = newList.filter(item => !previousIds.value.has(item._id))

    if (previousIds.value.size > 0 && newItems.length > 0) {
      newItems.forEach(item => {
        const orderNo = item.orderNo || item._id || ''
        const buyer = item.buyerNickName || item.userName || item.ownerName || ''
        const amount = item.totalAmount || item.totalPrice || 0
        const amountStr = (amount / 100).toFixed(2)

        ElNotification({
          title: `新${orderTypeLabel}提醒`,
          message: `订单号: ${orderNo}${buyer ? ` | 买家: ${buyer}` : ''} | 金额: ¥${amountStr}`,
          type: 'warning',
          duration: 8000,
        })
      })
    }

    previousCount.value = newList.length
    previousIds.value = currentIds
  }, { deep: false })

  function resetNotifyState() {
    previousCount.value = 0
    previousIds.value = new Set()
  }

  return { previousCount, resetNotifyState }
}
