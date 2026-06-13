<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'团购订单'" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="ORDER_STATUS_TAG_TYPE[order.status]">{{ ORDER_STATUS_LABELS[order.status] || order.status }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="商品">{{ order.productName }}</el-descriptions-item>
        <el-descriptions-item label="规格">{{ order.skuText || '-' }}</el-descriptions-item>
        <el-descriptions-item label="单价">{{ formatMoney(order.unitPrice) }}</el-descriptions-item>
        <el-descriptions-item label="数量">{{ order.quantity }}</el-descriptions-item>
        <el-descriptions-item label="金额" :span="2">{{ formatMoney(order.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="买家">{{ order.buyerNickName || order.receiverName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.receiverPhone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="收货地址" :span="2">{{ order.receiverAddress || '-' }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ formatDate(order.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="支付时间">{{ formatDate(order.paidAt) }}</el-descriptions-item>
        <el-descriptions-item label="支付状态">
          <el-tag v-if="order.paymentStatus" :type="PAYMENT_STATUS_TAG_TYPE[order.paymentStatus] || 'info'" size="small">{{ PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus }}</el-tag>
          <el-tag v-else type="info" size="small">未支付</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="微信订单号" :span="2">{{ order.transactionId || order.wxTransactionId || '-' }}</el-descriptions-item>
        <el-descriptions-item v-if="order.wxOrderState" label="微信发货状态">
          wx_order_state={{ order.wxOrderState }}<span v-if="order.wxShipping?.finish_shipping">（已发货 finish_shipping=true）</span>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getTuanDealOrderDetail } from '@/api/order'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TAG_TYPE } from '@/constants/order'

const route = useRoute()
const loading = ref(false)
const order = ref({})

onMounted(async () => {
  loading.value = true
  try { const res = await getTuanDealOrderDetail(route.params.id); order.value = res.data || {} }
  finally { loading.value = false }
})
</script>
