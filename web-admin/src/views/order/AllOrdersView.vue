<template>
  <el-card>
    <div class="toolbar">
      <el-select v-model="orderType" placeholder="订单类型" style="width:140px" @change="onTypeChange">
        <el-option label="全部类型" value="all" />
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
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="orderTypeTagType(row._orderType)">
            {{ ORDER_TYPE_LABELS[row._orderType] || row._orderType || '-' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="orderNo" label="订单号" width="160" />
      <el-table-column prop="buyerNickName" label="买家" width="120" />
      <el-table-column label="联系电话" width="130">
        <template #default="{ row }">{{ row.contactPhone || row.buyerPhone || row.phone || row.receiverPhone || '-' }}</template>
      </el-table-column>
      <el-table-column prop="productName" label="商品/服务" min-width="180" show-overflow-tooltip />
      <el-table-column prop="totalAmount" label="金额" width="100">
        <template #default="{ row }">{{ formatMoney(row.totalAmount || row.totalPrice) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="订单状态" width="100">
        <template #default="{ row }"><el-tag :type="ORDER_STATUS_TAG_TYPE[row.status]" size="small">{{ ORDER_STATUS_LABELS[row.status] || row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="paymentStatus" label="支付状态" width="100">
        <template #default="{ row }">
          <el-tag :type="PAYMENT_STATUS_TAG_TYPE[normalizePaymentStatus(row)] || 'info'" size="small">{{ PAYMENT_STATUS_LABELS[normalizePaymentStatus(row)] || '未支付' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button v-if="['mall','tuan','feeding'].includes(row._orderType)" link type="primary" @click="goDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { getBoardingOrders } from '@/api/hosting'
import { getMallOrders } from '@/api/mall-order'
import { getFeedingOrders } from '@/api/feeding'
import { getTuanDealOrders, getActivityOrders } from '@/api/order'
import { usePagination } from '@/composables/usePagination'
import { useNewOrderNotify } from '@/composables/useNewOrderNotify'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TAG_TYPE } from '@/constants/order'
import { normalizePaymentStatus } from '@/utils/payment-status'
import { ORDER_TYPE_LABELS } from '@/constants/order'

const orderType = ref('all')
const statusFilter = ref('')
const dateRange = ref(null)

// ORDER_TYPE_LABELS imported from @/constants/order

const STATUS_MAPS = {
  boarding: { pending: '待确认', paid: '已支付', confirmed: '已确认', in_progress: '进行中', completed: '已完成' },
  mall: { pending_payment: '待支付', paid: '已支付', shipped: '已发货', completed: '已完成', cancelled: '已取消', refunded: '已退款' },
  feeding: { pending_payment: '待支付', paid: '已支付', confirmed: '已确认', in_progress: '进行中', completed: '已完成', rejected: '已拒绝', cancelled: '已取消', refunded: '已退款' },
  tuan: { pending_payment: '待支付', paid: '已支付', shipped: '已发货', completed: '已完成', cancelled: '已取消', refunded: '已退款' },
  activity: { pending_payment: '待支付', paid: '已支付', completed: '已完成', cancelled: '已取消', refunded: '已退款' },
}

// 全部类型：取所有 STATUS_MAPS 的并集（同名 key 标签一致）
const ALL_STATUS_MAP = (() => {
  const merged = {}
  for (const map of Object.values(STATUS_MAPS)) {
    for (const [key, label] of Object.entries(map)) {
      if (!merged[key]) merged[key] = label
    }
  }
  return merged
})()

const ORDER_TYPE_TAG = { boarding: 'info', mall: 'success', feeding: 'warning', tuan: 'primary', activity: 'danger' }
function orderTypeTagType(t) {
  return ORDER_TYPE_TAG[t] || 'info'
}

const currentStatusMap = computed(() => orderType.value === 'all' ? ALL_STATUS_MAP : (STATUS_MAPS[orderType.value] || {}))
const fetchFns = { boarding: getBoardingOrders, mall: getMallOrders, feeding: getFeedingOrders, tuan: getTuanDealOrders, activity: getActivityOrders }
const ALL_TYPES = Object.keys(fetchFns)

async function fetchOrders(params) {
  if (orderType.value === 'all') {
    // 并发拉取所有类型，合并 + 按 createdAt 倒序
    const results = await Promise.all(ALL_TYPES.map(type =>
      fetchFns[type]({ page: params.page, pageSize: params.pageSize, ...params })
        .then(res => ({ type, list: res.data?.list || res.data || [], total: res.data?.total || 0 }))
        .catch(() => ({ type, list: [], total: 0 }))
    ))
    const items = []
    let total = 0
    results.forEach(r => {
      // P2 修复：不再前端过滤 cancelled（total 与列表口径一致；取消订单由独立页面展示）
      r.list.forEach(item => { items.push({ ...item, _orderType: r.type }) })
      total += r.total
    })
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return { data: { list: items, total } }
  }
  const result = await fetchFns[orderType.value]({ page: params.page, pageSize: params.pageSize, ...params })
  // P2 修复：不前端过滤 cancelled（total 与列表一致；取消订单由独立页面展示）
  return result
}

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(fetchOrders)

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

const { autoRefresh, startAutoRefresh, stopAutoRefresh } = useAutoRefresh(() => {
  onSearch()
}, 30000)

function onTypeChange() {
  statusFilter.value = ''
  resetNotifyState()
  onSearch()
}

function goDetail(row) {
  const type = row._orderType
  const id = row._id || row.orderId
  const routeMap = {
    mall: `/order/mall/${id}`,
    feeding: `/order/feeding/${id}`,
    tuan: `/order/tuan/${id}`,
  }
  if (routeMap[type]) {
    router.push(routeMap[type])
  }
}

async function onExport() {
  try {
    const orders = list.value
    if (!orders || orders.length === 0) {
      ElMessage.warning('暂无数据可导出')
      return
    }

    const headers = ['类型', '订单号', '买家', '商品/服务', '金额', '订单状态', '支付状态', '下单时间']
    const rows = orders.map(o => [
      ORDER_TYPE_LABELS[o._orderType] || o._orderType || '',
      o.orderNo || o._id,
      o.buyerNickName || o.userNickName || '',
      o.productName || o.title || o.serviceName || '',
      (o.totalAmount || o.totalPrice || 0).toFixed(2),
      ORDER_STATUS_LABELS[o.status] || o.status,
      PAYMENT_STATUS_LABELS[normalizePaymentStatus(o)] || '未支付',
      formatDate(o.createdAt)
    ])

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    const fileLabel = orderType.value === 'all' ? '全部订单' : (ORDER_TYPE_LABELS[orderType.value] || '订单')
    link.download = `${fileLabel}_${new Date().toISOString().slice(0,10)}.csv`
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
