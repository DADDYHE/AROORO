<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'上门服务订单'" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="ORDER_STATUS_TAG_TYPE[order.status]">{{ FEEDING_STATUS[order.status] || order.status }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="用户">{{ order.userName || order.ownerName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.contactPhone || order.userPhone || order.buyerPhone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="服务地址" :span="2">{{ order.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="服务时间">{{ order.startDate ? formatDate(order.startDate) : '-' }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ formatMoney(order.totalPrice || order.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="宠物">{{ petNamesText }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ formatDate(order.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ order.note || order.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:20px" v-if="order.status === 'paid'">
        <el-button type="primary" @click="handleOrder('confirm')">确认订单</el-button>
        <el-button type="danger" @click="handleOrder('cancel')">取消</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'confirmed'">
        <el-button type="success" @click="handleOrder('start')">开始服务</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'in_progress'">
        <el-button type="success" @click="handleOrder('complete')">完成服务</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.paymentStatus === 'paid'">
        <el-button type="danger" @click="openRefundDialog">退款</el-button>
      </div>
    </el-card>

    <!-- 退款对话框 -->
    <el-dialog v-model="refundDialogVisible" title="喂养订单退款" width="460px" :close-on-click-modal="false">
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
import { getFeedingOrderDetail, handleFeedingOrder } from '@/api/feeding'
import { adminRefund } from '@/api/refund'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_TAG_TYPE } from '@/constants/order'
import { ElMessage, ElMessageBox } from 'element-plus'

// 上门服务订单统一状态集：pending_payment → paid → confirmed → in_progress → completed；终态 rejected/cancelled/refunded
const FEEDING_STATUS = { pending_payment: '待支付', paid: '已支付', confirmed: '已确认', in_progress: '进行中', completed: '已完成', rejected: '已拒绝', cancelled: '已取消', refunded: '已退款' }

const route = useRoute()
const loading = ref(false)
const order = ref({})
const refundDialogVisible = ref(false)
const refundLoading = ref(false)
const refundForm = ref({ amount: 0, reason: '' })
const maxRefundAmount = computed(() => Number(order.value.paidAmount || order.value.totalAmount || order.value.totalPrice || 0))
// P3-6 修复：feedingOrders 实际字段为 petDetails（数组），startDate 为服务开始日期
const petNamesText = computed(() => {
  const details = order.value.petDetails || []
  if (details.length > 0) {
    return details.map(p => p.name || p.petName || p.nickName || '').filter(Boolean).join('、') || '-'
  }
  return order.value.petName || order.value.petNames || '-'
})

async function fetchDetail() {
  loading.value = true
  try {
    const res = await getFeedingOrderDetail(route.params.id)
    order.value = res.data || {}
  } finally {
    loading.value = false
  }
}

async function handleOrder(operation) {
  const labels = { confirm: '确认', start: '开始', complete: '完成', reject: '拒绝' }
  await ElMessageBox.confirm(`确定${labels[operation]}该订单？`)
  await handleFeedingOrder(route.params.id, operation)
  ElMessage.success('操作成功')
  await fetchDetail()
}

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
    ElMessage.warning('该订单缺少微信支付单号，无法退款')
    return
  }
  try {
    await ElMessageBox.confirm(`确认对喂养订单 ${tradeNo} 发起退款 ¥${refundForm.value.amount.toFixed(2)}？`, '退款确认', { type: 'warning' })
  } catch {
    return
  }
  refundLoading.value = true
  try {
    await adminRefund(tradeNo, refundForm.value.amount, refundForm.value.reason || '后台退款')
    ElMessage.success('退款申请已提交')
    refundDialogVisible.value = false
    await fetchDetail()
  } catch (e) {
    ElMessage.error(e?.message || '退款失败')
  } finally {
    refundLoading.value = false
  }
}

onMounted(fetchDetail)
</script>

<style scoped>
.hint { margin-left: 10px; color: #999; font-size: 12px; }
</style>
