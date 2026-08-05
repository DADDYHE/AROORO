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
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getActivityOrderDetail } from '@/api/activity'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TAG_TYPE } from '@/constants/order'

const route = useRoute()
const loading = ref(false)
const order = ref({})

const petNamesText = computed(() => {
  const details = order.value.petsInfo || order.value.pets || []
  return details.map(p => p.name || p.petName || '').filter(Boolean).join('、') || '-'
})

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
