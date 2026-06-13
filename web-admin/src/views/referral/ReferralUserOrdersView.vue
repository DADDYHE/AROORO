<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" title="推广收入详情" :content="`${userName} 的订单`" />

    <el-card style="margin-top:16px">
      <template #header>
        <div class="card-header">
          <span>推广订单列表</span>
          <el-radio-group v-model="activeTab" size="small">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="mall">商城</el-radio-button>
            <el-radio-button value="hosting">寄养</el-radio-button>
            <el-radio-button value="feeding">上门服务</el-radio-button>
            <el-radio-button value="tuan">团购</el-radio-button>
            <el-radio-button value="activity">活动</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-table :data="orderList" v-loading="orderLoading" stripe>
        <el-table-column prop="orderNo" label="订单号" width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.orderNo || row._id }}</template>
        </el-table-column>
        <el-table-column label="订单类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ ORDER_TYPE_LABELS[row.orderType] || row.orderType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }">{{ formatMoney(row.totalPrice || row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="orderStatusType(row.status)" size="small">{{ ORDER_STATUS_LABELS[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
      </el-table>

      <div v-if="orderList.length === 0 && !loading" style="text-align:center;padding:40px 0;color:var(--text-tertiary)">
        暂无订单
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getReferralOrders } from '@/api/referral'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS } from '@/constants/order'
import { ORDER_TYPE_LABELS } from '@/constants/order'

// ORDER_TYPE_LABELS imported from @/constants/order

const route = useRoute()
const loading = ref(false)
const orderLoading = ref(false)
const userName = ref('')
const activeTab = ref('')
const orderList = ref([])

function orderStatusType(status) {
  return { pending_payment: 'warning', paid: 'primary', shipped: '', completed: 'success', cancelled: 'info', confirmed: 'primary' }[status] || 'info'
}

async function loadOrders() {
  orderLoading.value = true
  try {
    const params = {
      page: 1,
      pageSize: 100,
      targetOpenid: route.params.targetOpenid,
      invitedUserOpenid: route.query.openid,
    }
    if (activeTab.value) params.type = activeTab.value
    const res = await getReferralOrders(params)
    orderList.value = res.data?.list || []
  } catch (e) {
    console.warn('[ReferralUserOrdersView] 加载订单失败:', e.message)
  } finally {
    orderLoading.value = false
  }
}

watch(activeTab, () => { loadOrders() })

onMounted(async () => {
  userName.value = route.query.name || ''
  loading.value = true
  try {
    await loadOrders()
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header span { font-weight: 600; font-size: 14px; color: var(--text-primary); }
</style>
