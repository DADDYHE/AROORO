<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'商城订单'" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="ORDER_STATUS_TAG_TYPE[order.status]">{{ ORDER_STATUS_LABELS[order.status] }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="商品">{{ order.productName }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ formatMoney(order.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="收货人">{{ order.receiverName }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.receiverPhone }}</el-descriptions-item>
        <el-descriptions-item label="收货地址" :span="2">{{ order.receiverAddress }}</el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:20px" v-if="order.status === 'confirmed' || order.status === 'paid'">
        <el-button type="primary" @click="onShip">发货</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getMallOrderDetail, shipMallOrder } from '@/api/mall-order'
import { formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/constants/order'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const loading = ref(false)
const order = ref({})

onMounted(async () => {
  loading.value = true
  try { const res = await getMallOrderDetail(route.params.id); order.value = res.data || {} }
  finally { loading.value = false }
})

async function onShip() {
  const { value } = await ElMessageBox.prompt('请输入快递单号', '发货', { inputPlaceholder: '快递单号' })
  await shipMallOrder(route.params.id, value)
  ElMessage.success('发货成功')
  const res = await getMallOrderDetail(route.params.id)
  order.value = res.data || {}
}
</script>
