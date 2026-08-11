<template>
  <OrderTable :fetch-fn="fetchFn" detail-route="/order/boarding">
    <template #toolbar-left>
      <el-select v-model="statusFilter" placeholder="状态" style="width:120px" clearable @change="onSearch">
        <el-option v-for="(label, key) in BOARDING_STATUS" :key="key" :label="label" :value="key" />
      </el-select>
    </template>
    <el-table-column prop="orderNo" label="订单号" width="160" />
    <el-table-column prop="ownerName" label="宠物主" width="120" />
    <el-table-column label="联系电话" width="130">
      <template #default="{ row }">{{ row.contactPhone || row.buyerPhone || row.phone || '-' }}</template>
    </el-table-column>
    <el-table-column prop="totalPrice" label="金额" width="100">
      <template #default="{ row }">{{ formatMoney(row.totalPrice) }}</template>
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
  </OrderTable>
</template>

<script setup>
import { ref } from 'vue'
import { getBoardingOrders } from '@/api/hosting'
import OrderTable from '@/components/OrderTable.vue'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TAG_TYPE } from '@/constants/order'
import { normalizePaymentStatus } from '@/utils/payment-status'

const BOARDING_STATUS = { pending: '待确认', paid: '已支付', confirmed: '已确认', in_progress: '进行中', completed: '已完成' }
const statusFilter = ref('')

function fetchFn(params) {
  const p = { ...params }
  if (statusFilter.value) p.status = statusFilter.value
  return getBoardingOrders(p).then(res => {
    const rawList = res.data?.list || res.data || []
    return { data: { list: rawList.filter(item => item.status !== 'cancelled'), total: res.data?.total || 0 } }
  })
}

function onSearch() {
  // 触发 OrderTable 的搜索
}
</script>
