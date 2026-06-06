<template>
  <el-card>
    <div class="toolbar">
      <el-select v-model="statusFilter" placeholder="状态" style="width:120px" clearable @change="onSearch">
        <el-option v-for="(label, key) in ACTIVITY_STATUS" :key="key" :label="label" :value="key" />
      </el-select>
      <el-switch v-model="autoRefresh" active-text="自动刷新" style="margin-left:auto" />
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="orderNo" label="订单号" width="160" />
      <el-table-column prop="buyerNickName" label="买家" width="120" />
      <el-table-column prop="activityTitle" label="活动" min-width="180" show-overflow-tooltip />
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
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { getActivityOrders } from '@/api/order'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TAG_TYPE } from '@/utils/constants'

const ACTIVITY_STATUS = { pending_payment: '待支付', confirmed: '已确认', completed: '已完成', cancelled: '已取消' }
const statusFilter = ref('')
const autoRefresh = ref(true)
let refreshTimer = null

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getActivityOrders)

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
