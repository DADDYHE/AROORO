<template>
  <el-card>
    <div class="toolbar">
      <el-select v-model="orderType" placeholder="订单类型" style="width:140px" @change="onTypeChange">
        <el-option label="寄养订单" value="boarding" />
        <el-option label="商城订单" value="mall" />
        <el-option label="上门服务订单" value="feeding" />
        <el-option label="团购订单" value="tuan" />
        <el-option label="活动订单" value="activity" />
      </el-select>
      <el-select v-model="statusFilter" placeholder="状态" style="width:120px" clearable @change="onSearch">
        <el-option v-for="(label, key) in currentStatusMap" :key="key" :label="label" :value="key" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width:260px" value-format="YYYY-MM-DD" @change="onSearch" />
      <el-button type="primary" @click="onExport">
        <el-icon><Download /></el-icon> 导出
      </el-button>
      <el-switch v-model="autoRefresh" active-text="自动刷新" style="margin-left:auto" />
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="orderNo" label="订单号" width="160" />
      <el-table-column prop="buyerNickName" label="买家" width="120" />
      <el-table-column prop="productName" label="商品/服务" min-width="180" show-overflow-tooltip />
      <el-table-column prop="totalAmount" label="金额" width="100">
        <template #default="{ row }">{{ formatMoney(row.totalAmount || row.totalPrice) }}</template>
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
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getBoardingOrders, getMallOrders, getFeedingOrders, getTuanDealOrders, getActivityOrders } from '@/api/order'
import { usePagination } from '@/composables/usePagination'
import { useNewOrderNotify } from '@/composables/useNewOrderNotify'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TAG_TYPE } from '@/utils/constants'

const orderType = ref('boarding')
const statusFilter = ref('')
const dateRange = ref(null)
const autoRefresh = ref(true)
let refreshTimer = null

const ORDER_TYPE_LABELS = { boarding: '寄养', mall: '商城', feeding: '上门服务', tuan: '团购', activity: '活动' }

const STATUS_MAPS = {
  boarding: { pending: '待确认', paid: '已支付', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消' },
  mall: { pending_payment: '待支付', paid: '已支付', confirmed: '已确认', shipped: '已发货', completed: '已完成', cancelled: '已取消' },
  feeding: { pending: '待确认', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消', rejected: '已拒绝' },
  tuan: { pending: '待确认', pending_payment: '待支付', paid: '已支付', confirmed: '已确认', completed: '已完成', cancelled: '已取消' },
  activity: { pending_payment: '待支付', confirmed: '已确认', completed: '已完成', cancelled: '已取消' },
}

const currentStatusMap = computed(() => STATUS_MAPS[orderType.value] || {})
const fetchFns = { boarding: getBoardingOrders, mall: getMallOrders, feeding: getFeedingOrders, tuan: getTuanDealOrders, activity: getActivityOrders }
const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination((params) => fetchFns[orderType.value](params))

const { resetNotifyState } = useNewOrderNotify(list, ORDER_TYPE_LABELS[orderType.value] || '订单')

function onSearch() {
  const params = {}
  if (statusFilter.value) params.status = statusFilter.value
  if (dateRange.value) {
    params.startDate = dateRange.value[0]
    params.endDate = dateRange.value[1]
  }
  fetch(params)
}

function onTypeChange() {
  statusFilter.value = ''
  resetNotifyState()
  onSearch()
}

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

async function onExport() {
  try {
    const orders = list.value
    if (!orders || orders.length === 0) {
      ElMessage.warning('暂无数据可导出')
      return
    }

    const headers = ['订单号', '类型', '买家', '商品/服务', '金额', '订单状态', '支付状态', '下单时间']
    const rows = orders.map(o => [
      o.orderNo || o._id,
      ORDER_TYPE_LABELS[orderType.value] || orderType.value,
      o.buyerNickName || o.userNickName || '',
      o.productName || o.title || o.serviceName || '',
      (o.totalAmount || o.totalPrice || 0).toFixed(2),
      ORDER_STATUS_LABELS[o.status] || o.status,
      PAYMENT_STATUS_LABELS[o.paymentStatus] || o.paymentStatus || '未支付',
      formatDate(o.createdAt)
    ])

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${ORDER_TYPE_LABELS[orderType.value] || '订单'}_${new Date().toISOString().slice(0,10)}.csv`
    link.click()
    ElMessage.success('导出成功')
  } catch (e) {
    console.error('导出失败', e)
    ElMessage.error('导出失败')
  }
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
