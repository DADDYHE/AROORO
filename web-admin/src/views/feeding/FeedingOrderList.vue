<template>
  <el-card>
    <div class="toolbar">
      <el-select v-model="statusFilter" placeholder="状态" style="width:120px" clearable @change="onSearch">
        <el-option v-for="(label, key) in FEEDING_STATUS" :key="key" :label="label" :value="key" />
      </el-select>
      <el-switch v-model="autoRefresh" active-text="自动刷新" style="margin-left:auto" />
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="orderNo" label="订单号" width="160" />
      <el-table-column prop="userName" label="用户" width="120" />
      <el-table-column prop="feederName" label="服务师" width="120" />
      <el-table-column prop="totalPrice" label="金额" width="100">
        <template #default="{ row }">{{ formatMoney(row.totalPrice) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="订单状态" width="100">
        <template #default="{ row }"><el-tag :type="ORDER_STATUS_TAG_TYPE[row.status]" size="small">{{ ORDER_STATUS_LABELS[row.status] || row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="paymentStatus" label="支付状态" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.paymentStatus" :type="PAYMENT_STATUS_TAG_TYPE[row.paymentStatus] || 'info'" size="small">{{ PAYMENT_STATUS_LABELS[row.paymentStatus] || row.paymentStatus }}</el-tag>
          <el-tag v-else type="info" size="small">未支付</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/order/feeding/${row._id}`)">详情</el-button>
          <el-button v-if="row.status === 'pending_payment' || row.status === 'paid' || row.status === 'pending'" link type="primary" @click="handleOrder(row._id, 'confirm')">确认</el-button>
          <el-button v-if="row.status === 'confirmed'" link type="success" @click="handleOrder(row._id, 'start')">开始</el-button>
          <el-button v-if="row.status === 'in_progress'" link type="success" @click="handleOrder(row._id, 'complete')">完成</el-button>
          <el-button v-if="row.status !== 'completed' && row.status !== 'cancelled' && row.status !== 'rejected'" link type="danger" @click="handleOrder(row._id, 'cancel')">取消</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { getFeedingOrders, handleFeedingOrder } from '@/api/feeding'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TAG_TYPE } from '@/utils/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const FEEDING_STATUS = { pending_payment: '待支付', paid: '已支付', pending: '待确认', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消', rejected: '已拒绝' }
const statusFilter = ref('')
const autoRefresh = ref(true)
let refreshTimer = null

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getFeedingOrders)

function onSearch() { const p = {}; if (statusFilter.value) p.status = statusFilter.value; fetch(p) }

function startAutoRefresh() {
  stopAutoRefresh()
  if (autoRefresh.value) {
    refreshTimer = setInterval(() => { onSearch() }, 30000)
  }
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

watch(autoRefresh, (val) => {
  if (val) startAutoRefresh()
  else stopAutoRefresh()
})

async function handleOrder(orderId, operation) {
  const labels = { confirm: '确认', start: '开始', complete: '完成', cancel: '取消' }
  await ElMessageBox.confirm(`确定${labels[operation]}该订单？`)
  await handleFeedingOrder(orderId, operation)
  ElMessage.success('操作成功')
  onSearch()
}

onMounted(() => {
  onSearch()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: var(--spacing-md); align-items: center; }
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
</style>
