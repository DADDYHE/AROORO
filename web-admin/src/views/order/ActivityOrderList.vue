<template>
  <OrderTable ref="tableRef" :fetch-fn="fetchFn" @detail="openDetail">
    <template #toolbar-left>
      <StatusFilter :options="statusOptions" v-model="statusFilter" @change="onSearch" />
    </template>
    <el-table-column prop="orderNo" label="订单号" width="160" />
    <el-table-column prop="buyerNickName" label="买家" width="120" />
    <el-table-column label="联系电话" width="130">
      <template #default="{ row }">{{ row.contactPhone || row.buyerPhone || row.phone || '-' }}</template>
    </el-table-column>
    <el-table-column prop="activityTitle" label="活动" min-width="180" show-overflow-tooltip />
    <el-table-column prop="totalAmount" label="金额" width="100">
      <template #default="{ row }">{{ formatMoney(row.totalAmount || row.totalPrice) }}</template>
    </el-table-column>
    <el-table-column prop="status" label="状态" width="100">
      <template #default="{ row }"><el-tag :type="ORDER_STATUS_TAG_TYPE[row.status]" size="small">{{ ORDER_STATUS_LABELS[row.status] || row.status }}</el-tag></template>
    </el-table-column>
    <el-table-column prop="createdAt" label="下单时间" width="180">
      <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
    </el-table-column>
  </OrderTable>

  <OrderDetailDialog v-model:visible="detailVisible" order-type="activity" :order-id="detailId" @updated="onSearch" />
</template>

<script setup>
import { ref, computed } from 'vue'
import { getActivityOrders } from '@/api/order'
import OrderTable from '@/components/OrderTable.vue'
import OrderDetailDialog from '@/components/OrderDetailDialog.vue'
import StatusFilter from '@/components/StatusFilter.vue'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/constants/order'

// V5: 活动订单统一五态（pending_payment/paid/completed/cancelled/refunded，死状态 confirmed 已移除）
const ACTIVITY_STATUS = { pending_payment: '待支付', paid: '已支付', completed: '已完成', cancelled: '已取消', refunded: '已退款' }
const statusFilter = ref('')
const tableRef = ref(null)
const statusOptions = computed(() => [
  { value: '', label: '全部' },
  ...Object.entries(ACTIVITY_STATUS).map(([value, label]) => ({ value, label })),
])

// 详情弹窗
const detailVisible = ref(false)
const detailId = ref('')
function openDetail(row) {
  detailId.value = row._id || row.orderId || ''
  detailVisible.value = true
}

function fetchFn(params) {
  const p = { ...params }
  if (statusFilter.value) p.status = statusFilter.value
  return getActivityOrders(p).then(res => {
    // P3 修复：不再前端过滤 cancelled（会导致 total 与列表不一致），状态筛选走后端参数
    return { data: { list: res.data?.list || res.data || [], total: res.data?.total || 0 } }
  })
}

function onSearch() {
  tableRef.value?.onSearch()
}
</script>
