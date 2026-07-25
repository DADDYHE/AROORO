<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" title="活动订单" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo || order._id }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="ORDER_STATUS_TAG_TYPE[order.status]">{{ STATUS_MAP[order.status] || order.status }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="用户">{{ order.buyerNickName || order.ownerName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.contactPhone || order.buyerPhone || order.ownerPhone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="活动标题">{{ order.title || order.activityTitle || '-' }}</el-descriptions-item>
        <el-descriptions-item label="活动地点">{{ order.location || order.activityLocation || '-' }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ formatMoney(order.totalAmount || order.finalAmount || order.totalPrice || 0) }}</el-descriptions-item>
        <el-descriptions-item label="优惠券抵扣">{{ formatMoney(order.couponDiscount || 0) }}</el-descriptions-item>
        <el-descriptions-item label="宠物数量">{{ order.petCount || '-' }}</el-descriptions-item>
        <el-descriptions-item label="参与人数">{{ order.participantCount || '-' }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ formatDate(order.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="微信支付订单号" :span="2">{{ order.transactionId || order.wxTransactionId || '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ order.notes || order.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
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
import { getActivityOrderDetail } from '@/api/order'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_TAG_TYPE } from '@/constants/order'
import RefundDialog from '@/components/RefundDialog.vue'

const STATUS_MAP = { pending_payment: '待支付', confirmed: '已确认', completed: '已完成', cancelled: '已取消', refunded: '已退款' }

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

async function fetchDetail() {
  loading.value = true
  try {
    const res = await getActivityOrderDetail(route.params.id)
    order.value = res.data || {}
  } finally {
    loading.value = false
  }
}

onMounted(fetchDetail)
</script>
