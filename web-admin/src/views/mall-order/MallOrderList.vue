<template>
  <OrderTable ref="tableRef" :fetch-fn="fetchFn" @detail="openDetail">
    <template #toolbar-left>
      <StatusFilter :options="statusOptions" v-model="statusFilter" @change="onSearch" />
    </template>
    <el-table-column prop="orderNo" label="订单号" width="160" />
    <el-table-column prop="productName" label="商品" min-width="180" show-overflow-tooltip />
    <el-table-column prop="receiverName" label="收货人" width="100" />
    <el-table-column label="联系电话" width="130">
      <template #default="{ row }">{{ row.contactPhone || row.receiverPhone || row.buyerPhone || '-' }}</template>
    </el-table-column>
    <el-table-column prop="totalAmount" label="金额" width="100">
      <template #default="{ row }">{{ formatMoney(row.totalAmount) }}</template>
    </el-table-column>
    <el-table-column prop="status" label="状态" width="100">
      <template #default="{ row }"><el-tag :type="ORDER_STATUS_TAG_TYPE[row.status]" size="small">{{ ORDER_STATUS_LABELS[row.status] || row.status }}</el-tag></template>
    </el-table-column>
    <el-table-column prop="createdAt" label="下单时间" width="180">
      <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
    </el-table-column>
  </OrderTable>

  <OrderDetailDialog v-model:visible="detailVisible" order-type="mall" :order-id="detailId" @updated="onSearch" />
</template>

<script setup>
import { ref, computed } from 'vue'
import { getMallOrders } from '@/api/mall-order'
import OrderTable from '@/components/OrderTable.vue'
import OrderDetailDialog from '@/components/OrderDetailDialog.vue'
import StatusFilter from '@/components/StatusFilter.vue'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/constants/order'

const MALL_STATUS = { pending_payment: '待支付', paid: '已支付', shipped: '已发货', completed: '已完成', cancelled: '已取消', refunded: '已退款' }
const statusFilter = ref('')
const tableRef = ref(null)
const statusOptions = computed(() => [
  { value: '', label: '全部' },
  ...Object.entries(MALL_STATUS).map(([value, label]) => ({ value, label })),
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
  return getMallOrders(p).then(res => {
    const rawList = res.data?.list || res.data || []
    // 默认隐藏已取消订单；主动选择 cancelled 筛选时不过滤
    const list = statusFilter.value === 'cancelled'
      ? rawList
      : rawList.filter(item => item.status !== 'cancelled')
    return { data: { list, total: res.data?.total || 0 } }
  })
}

function onSearch() {
  tableRef.value?.onSearch()
}
</script>
