<template>
  <el-card>
    <div class="toolbar">
      <el-select v-model="orderTypeFilter" placeholder="订单类型" style="width:120px" clearable @change="onSearch">
        <el-option v-for="(label, key) in ORDER_TYPE_MAP" :key="key" :label="label" :value="key" />
      </el-select>
      <el-select v-model="statusFilter" placeholder="状态" style="width:120px" clearable @change="onSearch">
        <el-option label="待结算" value="pending" />
        <el-option label="已结算" value="settled" />
      </el-select>
      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button type="success" :disabled="selected.length === 0" :loading="settling" @click="onSettle">结算所选（{{ selected.length }}）</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe @selection-change="onSelectionChange">
      <el-table-column type="selection" width="45" />
      <el-table-column label="类型" width="90">
        <template #default="{ row }">{{ ORDER_TYPE_MAP[row.orderType] || row.orderType || '-' }}</template>
      </el-table-column>
      <el-table-column label="邀请人" min-width="140">
        <template #default="{ row }">{{ row.inviterNickName || row.inviterId || '-' }}</template>
      </el-table-column>
      <el-table-column label="下单用户" min-width="140">
        <template #default="{ row }">{{ row.ownerNickName || row.ownerId || '-' }}</template>
      </el-table-column>
      <el-table-column prop="orderNo" label="订单号" width="180" show-overflow-tooltip />
      <el-table-column label="佣金金额" width="110">
        <template #default="{ row }">¥{{ formatMoney(row.commissionAmount) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'settled' ? 'success' : 'warning'" size="small">{{ row.status === 'settled' ? '已结算' : row.status === 'cancelled' ? '已取消' : row.status === 'reversed' ? '已冲销' : '待结算' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" />
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getCommissionList, settleCommissions } from '@/api/commission'
import { formatDate, formatMoney } from '@/utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const ORDER_TYPE_MAP = { tuan: '团购', mall: '商城', activity: '活动', feeding: '上门服务', boarding: '寄养' }
const orderTypeFilter = ref('')
const statusFilter = ref('')
const list = ref([])
const loading = ref(false)
const total = ref(0)
const settling = ref(false)
const selected = ref([])
const pagination = reactive({ page: 1, pageSize: 20 })

async function fetch() {
  loading.value = true
  try {
    const params = { page: pagination.page, pageSize: pagination.pageSize }
    if (orderTypeFilter.value) { params.orderType = orderTypeFilter.value }
    if (statusFilter.value) { params.status = statusFilter.value }
    const res = await getCommissionList(params)
    list.value = res.data?.list || []
    total.value = res.data?.total || 0
  } finally {
    loading.value = false
  }
}

function onSearch() {
  pagination.page = 1
  fetch()
}

function onPageChange(page) {
  pagination.page = page
  fetch()
}

function onSelectionChange(rows) {
  selected.value = rows
}

async function onSettle() {
  if (selected.value.length === 0) { return }
  const ids = selected.value.map(r => r._id)
  const amount = selected.value.reduce((s, r) => s + (Number(r.commissionAmount) || 0), 0)
  try {
    await ElMessageBox.confirm(`确认结算所选 ${ids.length} 条佣金（合计 ¥${amount.toFixed(2)}）？结算后金额将计入邀请人钱包。`, '佣金结算', { type: 'warning' })
  } catch {
    return
  }
  settling.value = true
  try {
    const res = await settleCommissions(ids)
    ElMessage.success(`结算完成：成功 ${res.data?.successCount || 0} 条`)
    fetch()
  } catch (e) {
    ElMessage.error(e?.message || '结算失败')
  } finally {
    settling.value = false
  }
}

onMounted(fetch)
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
