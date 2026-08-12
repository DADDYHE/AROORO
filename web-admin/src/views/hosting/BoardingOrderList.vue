<template>
  <OrderTable ref="tableRef" :fetch-fn="fetchFn" :show-detail="false">
    <template #toolbar-left>
      <StatusFilter :options="statusOptions" v-model="statusFilter" @change="onSearch" />
    </template>
    <el-table-column prop="orderNo" label="订单号" width="160" />
    <el-table-column prop="ownerName" label="宠物主" width="120" />
    <el-table-column label="联系电话" width="130">
      <template #default="{ row }">{{ row.contactPhone || row.buyerPhone || row.phone || '-' }}</template>
    </el-table-column>
    <el-table-column prop="totalPrice" label="金额" width="100">
      <template #default="{ row }">{{ formatMoney(row.totalPrice) }}</template>
    </el-table-column>
    <el-table-column prop="status" label="状态" width="100">
      <template #default="{ row }"><el-tag :type="ORDER_STATUS_TAG_TYPE[row.status]" size="small">{{ ORDER_STATUS_LABELS[row.status] || row.status }}</el-tag></template>
    </el-table-column>
    <el-table-column prop="createdAt" label="下单时间" width="180">
      <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
    </el-table-column>
  </OrderTable>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getBoardingOrders } from '@/api/hosting'
import OrderTable from '@/components/OrderTable.vue'
import StatusFilter from '@/components/StatusFilter.vue'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/constants/order'

const BOARDING_STATUS = { pending_payment: '待支付', paid: '已支付', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消', refunded: '已退款' }
const statusFilter = ref('')
const tableRef = ref(null)
const statusOptions = computed(() => [
  { value: '', label: '全部' },
  ...Object.entries(BOARDING_STATUS).map(([value, label]) => ({ value, label })),
])

function fetchFn(params) {
  const p = { ...params }
  if (statusFilter.value) p.status = statusFilter.value
  return getBoardingOrders(p).then(res => {
    const rawList = res.data?.list || res.data || []
    return { data: { list: rawList, total: res.data?.total || 0 } }
  })
}

function onSearch() {
  tableRef.value?.onSearch()
}
</script>
