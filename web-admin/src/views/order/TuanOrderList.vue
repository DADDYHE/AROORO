<template>
  <OrderTable :fetch-fn="fetchFn" detail-route="/order/tuan">
    <template #toolbar-left>
      <el-select v-model="statusFilter" placeholder="状态" style="width:120px" clearable @change="onSearch">
        <el-option v-for="(label, key) in TUAN_STATUS" :key="key" :label="label" :value="key" />
      </el-select>
    </template>
    <el-table-column prop="orderNo" label="订单号" width="160" />
    <el-table-column prop="buyerNickName" label="买家" width="120" />
    <el-table-column label="联系电话" width="130">
      <template #default="{ row }">{{ row.contactPhone || row.buyerPhone || row.phone || '-' }}</template>
    </el-table-column>
    <el-table-column prop="productName" label="团购商品" min-width="180" show-overflow-tooltip />
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
  </OrderTable>
</template>

<script setup>
import { ref } from 'vue'
import { getTuanDealOrders } from '@/api/order'
import OrderTable from '@/components/OrderTable.vue'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TAG_TYPE } from '@/constants/order'
import { normalizePaymentStatus } from '@/utils/payment-status'

// 团购订单实际状态：pending_payment/paid/shipped/completed/refunded（cancelled 单有独立的"取消订单"页面，此处不下拉）
const TUAN_STATUS = { pending_payment: '待支付', paid: '已支付', shipped: '已发货', completed: '已完成', refunded: '已退款' }
const statusFilter = ref('')

function fetchFn(params) {
  const p = { ...params }
  if (statusFilter.value) p.status = statusFilter.value
  return getTuanDealOrders(p).then(res => {
    const rawList = res.data?.list || res.data || []
    return { data: { list: rawList.filter(item => item.status !== 'cancelled'), total: res.data?.total || 0 } }
  })
}

function onSearch() {
  // 触发 OrderTable 的搜索
}
</script>
