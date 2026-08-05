<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'活动订单'" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="ORDER_STATUS_TAG_TYPE[order.status] || 'info'" size="small">{{ ORDER_STATUS_LABELS[order.status] || order.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="活动">{{ order.activityTitle || '-' }}</el-descriptions-item>
        <el-descriptions-item label="用户">{{ order.buyerNickName || order.ownerName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.contactPhone || order.buyerPhone || order.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="实付金额">{{ formatMoney(order.totalPrice || order.totalAmount || order.finalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="优惠券抵扣">{{ order.couponDiscount ? `-¥${order.couponDiscount}` : '-' }}</el-descriptions-item>
        <el-descriptions-item label="支付状态">
          <el-tag v-if="order.paymentStatus" :type="PAYMENT_STATUS_TAG_TYPE[order.paymentStatus] || 'info'" size="small">{{ PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus }}</el-tag>
          <el-tag v-else type="info" size="small">未支付</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="参与人数">{{ order.participantCount || 1 }} 人</el-descriptions-item>
        <el-descriptions-item label="宠物">{{ petNamesText }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ formatDate(order.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ order.notes || '-' }}</el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:20px" v-if="order.paymentStatus === 'paid'">
        <el-button type="danger" @click="openRefundDialog">退款</el-button>
      </div>
    </el-card>

    <!-- 退款对话框 -->
    <el-dialog v-model="refundDialogVisible" title="活动订单退款" width="460px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="退款金额" required>
          <el-input-number v-model="refundForm.amount" :min="0.01" :precision="2" :max="maxRefundAmount" controls-position="right" style="width:220px" />
          <span class="hint">最多 ¥{{ maxRefundAmount }}</span>
        </el-form-item>
        <el-form-item label="退款原因">
          <el-input v-model="refundForm.reason" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="refundLoading" @click="onConfirmRefund">确认退款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getActivityOrderDetail } from '@/api/activity'
import { adminRefund } from '@/api/refund'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TAG_TYPE } from '@/constants/order'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const loading = ref(false)
const order = ref({})
const refundDialogVisible = ref(false)
const refundLoading = ref(false)
const refundForm = ref({ amount: 0, reason: '' })

const maxRefundAmount = computed(() => Number(order.value.paidAmount || order.value.totalPrice || order.value.totalAmount || 0))

const petNamesText = computed(() => {
  const details = order.value.petsInfo || order.value.pets || []
  return details.map(p => p.name || p.petName || '').filter(Boolean).join('、') || '-'
})

function openRefundDialog() {
  refundForm.value = { amount: maxRefundAmount.value, reason: '' }
  refundDialogVisible.value = true
}

async function onConfirmRefund() {
  if (!refundForm.value.amount || refundForm.value.amount <= 0) {
    ElMessage.warning('请输入退款金额')
    return
  }
  const tradeNo = order.value.outTradeNo || order.value.orderNo
  if (!tradeNo) {
    ElMessage.warning('该订单缺少微信支付单号（历史订单需人工处理）')
    return
  }
  try {
    await ElMessageBox.confirm(`确认对活动订单 ${tradeNo} 发起退款 ¥${refundForm.value.amount.toFixed(2)}？`, '退款确认', { type: 'warning' })
  } catch {
    return
  }
  refundLoading.value = true
  try {
    await adminRefund(tradeNo, refundForm.value.amount, refundForm.value.reason || '后台退款')
    ElMessage.success('退款申请已提交')
    refundDialogVisible.value = false
    const res = await getActivityOrderDetail(route.params.id)
    order.value = res.data || {}
  } catch (e) {
    ElMessage.error(e?.message || '退款失败')
  } finally {
    refundLoading.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await getActivityOrderDetail(route.params.id)
    order.value = res.data || {}
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.hint { margin-left: 10px; color: #999; font-size: 12px; }
</style>
