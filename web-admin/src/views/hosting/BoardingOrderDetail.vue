<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" title="寄养订单" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo || order._id }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="ORDER_STATUS_TAG_TYPE[order.status]">{{ STATUS_MAP[order.status] || order.status }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="用户">{{ order.buyerNickName || order.ownerName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.contactPhone || order.ownerPhone || order.buyerPhone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="寄养家庭地址" :span="2">{{ (order.hostInfo && order.hostInfo.address) || '寄养家庭地址（详见寄养档案）' }}</el-descriptions-item>
        <el-descriptions-item label="入住时间">{{ order.startDate ? formatDate(order.startDate) : '-' }}</el-descriptions-item>
        <el-descriptions-item label="离开时间">{{ order.endDate ? formatDate(order.endDate) : '-' }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ formatMoney(order.totalAmount || order.totalPrice || 0) }}</el-descriptions-item>
        <el-descriptions-item label="宠物">{{ formatPets(order.petsInfo) || order.petName || order.petNames || '-' }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ formatDate(order.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="微信支付订单号" :span="2">{{ order.transactionId || order.wxTransactionId || '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ order.notes || order.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:20px" v-if="order.status === 'pending_payment'">
        <el-button type="primary" @click="handleOrder('confirm')">确认订单</el-button>
        <el-button type="danger" @click="handleOrder('cancel')">取消</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'confirmed' || order.status === 'paid'">
        <el-button type="success" @click="handleOrder('start')">开始服务</el-button>
        <el-button type="warning" @click="handleOrder('cancel')">取消订单</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'in_progress'">
        <el-button type="success" @click="handleOrder('complete')">完成服务</el-button>
      </div>
      <div style="margin-top:20px">
        <el-button v-if="canRefund" type="danger" @click="refundVisible = true">退款</el-button>
      </div>
    </el-card>
    <RefundDialog v-model="refundVisible" :order="order" @success="fetchDetail" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { callAction } from '@/api/index'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_TAG_TYPE } from '@/constants/order'
import { ElMessage, ElMessageBox } from 'element-plus'
import RefundDialog from '@/components/RefundDialog.vue'

const STATUS_MAP = { pending_payment: '待支付', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消', refunded: '已退款' }

const route = useRoute()
const loading = ref(false)
const order = ref({})
const refundVisible = ref(false)

const canRefund = computed(() => {
  return order.value.outTradeNo
    && order.value.paymentStatus !== 'refunded'
    && order.value.status !== 'refunded'
    && order.value.status !== 'cancelled'
    && order.value.status !== 'pending_payment'
})

function formatPets(petsInfo) {
  if (!Array.isArray(petsInfo) || petsInfo.length === 0) return ''
  return petsInfo.map(p => p.name || p.petName || '').filter(Boolean).join('、')
}

async function fetchDetail() {
  loading.value = true
  try {
    const res = await callAction('getBoardingOrderDetail', { orderId: route.params.id })
    order.value = res.data || {}
  } finally {
    loading.value = false
  }
}

async function handleOrder(operation) {
  const labels = { confirm: '确认', start: '开始', complete: '完成', cancel: '取消' }
  await ElMessageBox.confirm(`确定${labels[operation]}该订单？`)
  await callAction('handleBoardingOrder', { orderId: route.params.id, operation })
  ElMessage.success('操作成功')
  await fetchDetail()
}

onMounted(fetchDetail)
</script>
