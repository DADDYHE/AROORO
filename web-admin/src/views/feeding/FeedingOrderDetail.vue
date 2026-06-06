<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'上门服务订单'" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="ORDER_STATUS_TAG_TYPE[order.status]">{{ FEEDING_STATUS[order.status] || order.status }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="用户">{{ order.userName || order.ownerName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.userPhone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="服务师">{{ order.feederName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="服务师电话">{{ order.feederPhone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="服务地址" :span="2">{{ order.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="服务时间">{{ order.serviceDate ? formatDate(order.serviceDate) : '-' }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ formatMoney(order.totalPrice || order.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="宠物">{{ order.petName || order.petNames || '-' }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ formatDate(order.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ order.note || order.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:20px" v-if="order.status === 'pending_payment' || order.status === 'paid' || order.status === 'pending'">
        <el-button type="primary" @click="handleOrder('confirm')">确认订单</el-button>
        <el-button type="danger" @click="handleOrder('cancel')">取消</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'confirmed'">
        <el-button type="success" @click="handleOrder('start')">开始服务</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'in_progress'">
        <el-button type="success" @click="handleOrder('complete')">完成服务</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getFeedingOrderDetail, handleFeedingOrder } from '@/api/feeding'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_TAG_TYPE } from '@/utils/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const FEEDING_STATUS = { pending_payment: '待支付', paid: '已支付', pending: '待确认', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消', rejected: '已拒绝' }

const route = useRoute()
const loading = ref(false)
const order = ref({})

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

onMounted(fetchDetail)
</script>
