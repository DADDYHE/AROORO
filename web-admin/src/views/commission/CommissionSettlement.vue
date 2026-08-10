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
      <el-button type="info" @click="onInspect">财务诊断</el-button>
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

    <el-dialog v-model="inspectVisible" title="合作伙伴财务诊断" width="680px">
      <template v-if="inspectData">
        <p>合作伙伴 openid：{{ inspectData.inviterId }}</p>
        <p>
          佣金钱包：余额 ¥{{ formatMoney(inspectData.wallets.commission?.balance) }} ｜ 冻结 ¥{{ formatMoney(inspectData.wallets.commission?.frozenAmount) }} ｜ 累计收入 ¥{{ formatMoney(inspectData.wallets.commission?.totalIncome) }}
          ｜ 服务收入钱包：余额 ¥{{ formatMoney(inspectData.wallets.serviceIncome?.balance) }} ｜ 冻结 ¥{{ formatMoney(inspectData.wallets.serviceIncome?.frozenAmount) }}
        </p>
        <el-divider>佣金记录（{{ inspectData.commissions.length }} 条）</el-divider>
        <el-table :data="inspectData.commissions" size="small" max-height="220">
          <el-table-column label="类型" width="80">
            <template #default="{ row }">{{ ORDER_TYPE_MAP[row.orderType] || row.orderType || '-' }}</template>
          </el-table-column>
          <el-table-column prop="orderNo" label="订单号" width="160" show-overflow-tooltip />
          <el-table-column label="金额" width="90">
            <template #default="{ row }">¥{{ formatMoney(row.commissionAmount) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 'settled' ? 'success' : 'warning'" size="small">{{ row.status === 'settled' ? '已结算' : row.status === 'cancelled' ? '已取消' : row.status === 'reversed' ? '已冲销' : '待结算' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="150">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <el-divider>提现单（{{ inspectData.withdrawals.length }} 条）</el-divider>
        <el-table :data="inspectData.withdrawals" size="small" max-height="180">
          <el-table-column label="金额" width="90">
            <template #default="{ row }">¥{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90" />
          <el-table-column prop="mode" label="模式" width="80" />
          <el-table-column prop="method" label="渠道" width="80" />
          <el-table-column prop="createdAt" label="创建时间" width="150">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </template>
      <template #footer>
        <el-button @click="inspectVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getCommissionList, settleCommissions, inspectPartnerFinance } from '@/api/commission'
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
const inspectVisible = ref(false)
const inspectData = ref(null)

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

async function onInspect() {
  let openid = selected.value[0]?.inviterId || ''
  if (!openid) {
    const { value } = await ElMessageBox.prompt('未选中记录，请输入合作伙伴 openid（inviterId）', '财务诊断', { inputPlaceholder: 'openid' })
    openid = (value || '').trim()
  }
  if (!openid) {return}
  try {
    const res = await inspectPartnerFinance(openid)
    inspectData.value = res.data || null
    inspectVisible.value = true
  } catch (e) {
    ElMessage.error(e?.message || '诊断失败')
  }
}

onMounted(fetch)
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
