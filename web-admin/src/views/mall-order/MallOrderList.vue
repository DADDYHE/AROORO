<template>
  <OrderTable ref="tableRef" :fetch-fn="fetchFn" @detail="openDetail">
    <template #toolbar-left>
      <StatusFilter :options="statusOptions" v-model="statusFilter" @change="onSearch" />
    </template>
    <el-table-column prop="orderNo" label="订单号" width="160" />
    <el-table-column label="商品明细" min-width="260">
      <template #default="{ row }">
        <div v-for="(it, i) in rowItems(row)" :key="i" class="order-item-line">
          <span class="oi-name">{{ it.productName || '-' }}</span>
          <span v-if="it.skuText" class="oi-sku">{{ it.skuText }}</span>
          <span class="oi-qty">×{{ it.quantity }}</span>
        </div>
      </template>
    </el-table-column>
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

// 商品明细：新订单 items 含每件 skuText/quantity；旧订单兜底顶层字段
function rowItems(row) {
  if (Array.isArray(row.items) && row.items.length > 0) return row.items
  return [{ productName: row.productName, skuText: row.skuText || '', quantity: row.quantity || 1 }]
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

<style scoped>
.order-item-line { display: flex; align-items: center; gap: 6px; line-height: 1.8; }
.oi-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oi-sku { flex-shrink: 0; font-size: 12px; color: #909399; background: #f4f4f5; border-radius: 3px; padding: 0 4px; }
.oi-qty { flex-shrink: 0; color: #606266; font-weight: 600; }
</style>
