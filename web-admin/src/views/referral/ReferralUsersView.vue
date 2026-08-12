<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" title="带货管理" :content="`推广收入详情 - ${partnerName}`" />

    <el-row :gutter="20" style="margin-top:16px;margin-bottom:20px">
      <el-col :span="8"><el-card shadow="hover" class="stat-card" @click="openUserDialog('invited')"><el-statistic title="推广用户数" :value="stats.totalInvited || 0" /></el-card></el-col>
      <el-col :span="8"><el-card shadow="hover" class="stat-card" @click="openUserDialog('consuming')"><el-statistic title="消费用户数" :value="stats.consumingCount || 0" /></el-card></el-col>
      <el-col :span="8"><el-card shadow="hover" class="stat-card" @click="openOrderDialog('')"><el-statistic title="累计消费" :value="Number(stats.totalSpent) || 0" :precision="2" prefix="¥" /></el-card></el-col>
    </el-row>

    <el-card style="margin-bottom:20px">
      <template #header>
        <div class="card-header">
          <span>推广订单统计</span>
          <span class="card-header-tip">点击卡片查看对应订单</span>
        </div>
      </template>
      <div class="order-stats-grid">
        <div v-for="item in orderTypeStatsList" :key="item.type" class="order-stats-item" @click="openOrderDialog(item.type)">
          <div class="order-stats-icon" :style="{ background: item.bgColor }">
            <el-icon :size="20" :color="item.iconColor"><component :is="item.icon" /></el-icon>
          </div>
          <div class="order-stats-info">
            <div class="order-stats-label">{{ item.label }}</div>
            <div class="order-stats-amount">{{ formatMoney(item.totalAmount) }}</div>
            <div class="order-stats-count">{{ item.totalCount }} 笔订单</div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card style="margin-bottom:20px">
      <template #header>
        <div class="card-header">
          <span>分成比例配置</span>
          <div class="card-header-actions">
            <el-tag v-if="commissionHasCustom" type="warning" size="small" style="margin-right:8px">已自定义</el-tag>
            <el-tag v-else type="info" size="small" style="margin-right:8px">使用全局默认</el-tag>
            <el-button type="primary" size="small" @click="onSaveCommission" :loading="commissionSaving">保存</el-button>
          </div>
        </div>
      </template>
      <el-form label-width="100px" v-loading="commissionLoading">
        <el-row :gutter="20">
          <el-col :span="8" v-for="item in ORDER_TYPES" :key="item.type">
            <el-form-item :label="item.rateLabel">
              <div class="rate-input-row">
                <el-input-number v-model="commissionRates[item.type]" :min="0" :max="100" :precision="1" :step="0.5" style="flex:1" />
                <span class="rate-suffix">%</span>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <el-card>
      <template #header>
        <div class="card-header">
          <span>推广用户列表</span>
        </div>
      </template>
      <el-table :data="pagedList" stripe>
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">
            <div style="display:flex;align-items:center;gap:8px">
              <el-avatar :size="32" :src="row.avatarUrlPreview || row.avatarUrl" />
              <span>{{ row.nickName || '未知用户' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="注册时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="orderCount" label="订单数" width="100" align="center" />
        <el-table-column prop="totalSpent" label="消费总额" width="140">
          <template #default="{ row }">{{ formatMoney(row.totalSpent) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewUserOrders(row)">查看订单</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="userPageSize"
          :total="userTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="onSizeChange"
          @current-change="onPageChange"
        />
      </div>

      <div v-if="userList.length === 0 && !loading" style="text-align:center;padding:40px 0;color:var(--text-tertiary)">
        暂无推广用户
      </div>
    </el-card>

    <el-dialog v-model="orderDialogVisible" :title="`${orderDialogTitle}订单`" width="900px" top="6vh">
      <el-table :data="orderDialogList" v-loading="orderDialogLoading" stripe height="60vh">
        <el-table-column prop="orderNo" label="订单号" width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.orderNo || row._id }}</template>
        </el-table-column>
        <el-table-column label="订单类型" width="110">
          <template #default="{ row }">
            <el-tag size="small">{{ ORDER_TYPE_LABELS[row.orderType] || row.orderType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }">{{ formatMoney(row.totalPrice || row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column label="佣金" width="110" align="center">
          <template #default="{ row }">
            <span :style="{ color: (Number(row.commissionAmount) || 0) > 0 ? '#f56c6c' : '#52c41a', fontWeight: 600 }">¥{{ formatMoney(row.commissionAmount || 0) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="orderStatusType(row.status)" size="small">{{ ORDER_STATUS_LABELS[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="下单时间" min-width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <div v-if="orderDialogList.length === 0 && !orderDialogLoading" style="text-align:center;padding:40px 0;color:var(--text-tertiary)">
        暂无订单
      </div>
    </el-dialog>

    <el-dialog v-model="userDialogVisible" :title="userDialogTitle" width="700px" top="6vh">
      <el-table :data="userDialogList" stripe height="60vh">
        <el-table-column label="用户" min-width="200">
          <template #default="{ row }">
            <div style="display:flex;align-items:center;gap:8px">
              <el-avatar :size="32" :src="row.avatarUrlPreview || row.avatarUrl" />
              <span>{{ row.nickName || '未知用户' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="注册时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="orderCount" label="订单数" width="100" align="center" />
        <el-table-column prop="totalSpent" label="消费总额" width="140">
          <template #default="{ row }">{{ formatMoney(row.totalSpent) }}</template>
        </el-table-column>
      </el-table>
      <div v-if="userDialogList.length === 0" style="text-align:center;padding:40px 0;color:var(--text-tertiary)">
        暂无数据
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getReferralStats, getReferralOrderStats, getInvitedUsersByAdmin, getReferralOrders, getPartnerCommissionRates, updatePartnerCommissionRates } from '@/api/referral'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from '@/constants/order'
import { Goods, House, Service, Connection, Trophy } from '@element-plus/icons-vue'

const ORDER_TYPES = [
  { type: 'mall', label: '商城订单', rateLabel: '商城', icon: 'Goods', bgColor: '#ecf5ff', iconColor: '#409eff' },
  { type: 'hosting', label: '寄养订单', rateLabel: '寄养', icon: 'House', bgColor: '#f0f9eb', iconColor: '#67c23a' },
  { type: 'feeding', label: '上门服务', rateLabel: '上门服务', icon: 'Service', bgColor: '#fdf6ec', iconColor: '#e6a23c' },
  { type: 'tuan', label: '团购订单', rateLabel: '团购', icon: 'Connection', bgColor: '#fef0f0', iconColor: '#f56c6c' },
  { type: 'activity', label: '活动订单', rateLabel: '活动', icon: 'Trophy', bgColor: '#f4f4f5', iconColor: '#909399' },
]

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const partnerName = ref('')

const stats = ref({})
const orderStatsMap = ref({})

const commissionRates = ref({})
const commissionHasCustom = ref(false)
const commissionLoading = ref(false)
const commissionSaving = ref(false)

const userList = ref([])
const userTotal = ref(0)
const currentPage = ref(1)
const userPageSize = ref(20)

const orderTypeStatsList = computed(() => {
  return ORDER_TYPES.map(t => ({
    ...t,
    totalAmount: orderStatsMap.value[t.type]?.totalAmount || 0,
    totalCount: orderStatsMap.value[t.type]?.totalCount || 0,
    commissionRate: orderStatsMap.value[t.type]?.commissionRate || 0,
    estimatedCommission: orderStatsMap.value[t.type]?.estimatedCommission || 0,
  }))
})

const pagedList = computed(() => {
  const start = (currentPage.value - 1) * userPageSize.value
  return userList.value.slice(start, start + userPageSize.value)
})

function onSizeChange() {
  currentPage.value = 1
}

function onPageChange() {}

const orderDialogVisible = ref(false)
const orderDialogTitle = ref('')
const orderDialogList = ref([])
const orderDialogLoading = ref(false)

const userDialogVisible = ref(false)
const userDialogTitle = ref('')
const userDialogList = ref([])

function orderStatusType(status) {
  return { pending_payment: 'warning', paid: 'primary', shipped: '', completed: 'success', cancelled: 'info', confirmed: 'primary', in_progress: 'warning' }[status] || 'info'
}

async function openOrderDialog(type) {
  const item = ORDER_TYPES.find(t => t.type === type)
  orderDialogTitle.value = item ? item.label : '全部消费'
  orderDialogVisible.value = true
  orderDialogList.value = []
  orderDialogLoading.value = true
  try {
    const res = await getReferralOrders({
      type,
      page: 1,
      pageSize: 100,
      targetOpenid: route.params.targetOpenid,
    })
    orderDialogList.value = res.data?.list || []
  } catch (e) {
    console.warn('[ReferralUsersView] 加载订单失败:', e.message)
  } finally {
    orderDialogLoading.value = false
  }
}

function viewUserOrders(row) {
  router.push({
    name: 'ReferralUserOrders',
    params: { targetOpenid: route.params.targetOpenid, invitedUserId: row._id },
    query: { name: row.nickName || '', openid: row.openid || '' },
  })
}

function openUserDialog(mode) {
  if (mode === 'invited') {
    userDialogTitle.value = '推广用户'
    userDialogList.value = userList.value
  } else {
    userDialogTitle.value = '消费用户'
    userDialogList.value = userList.value.filter(u => u.orderCount > 0)
  }
  userDialogVisible.value = true
}

async function loadStats() {
  try {
    const res = await getReferralStats({ targetOpenid: route.params.targetOpenid })
    stats.value = res.data || {}
  } catch (e) {
    console.warn('[ReferralUsersView] 加载统计失败:', e.message)
  }
}

async function loadOrderStats() {
  try {
    const results = await Promise.all(
      ORDER_TYPES.map(t => getReferralOrderStats({ type: t.type, targetOpenid: route.params.targetOpenid }).catch(() => ({ data: {} })))
    )
    const map = {}
    ORDER_TYPES.forEach((t, i) => {
      map[t.type] = results[i].data || {}
    })
    orderStatsMap.value = map
  } catch (e) {
    console.warn('[ReferralUsersView] 加载订单统计失败:', e.message)
  }
}

async function loadCommissionRates() {
  commissionLoading.value = true
  try {
    const res = await getPartnerCommissionRates({ targetOpenid: route.params.targetOpenid })
    const rates = res.data?.rates || {}
    const init = {}
    ORDER_TYPES.forEach(t => { init[t.type] = rates[t.type] || 0 })
    commissionRates.value = init
    commissionHasCustom.value = res.data?.hasCustomRates || false
  } catch (e) {
    console.warn('[ReferralUsersView] 加载佣金比例失败:', e.message)
  } finally {
    commissionLoading.value = false
  }
}

async function onSaveCommission() {
  commissionSaving.value = true
  try {
    await updatePartnerCommissionRates({ targetOpenid: route.params.targetOpenid, rates: commissionRates.value })
    commissionHasCustom.value = true
    ElMessage.success('分成比例已保存')
    loadOrderStats()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    commissionSaving.value = false
  }
}

async function loadInvitedUsers() {
  try {
    const res = await getInvitedUsersByAdmin({ targetOpenid: route.params.targetOpenid })
    userList.value = res.data?.list || []
    userTotal.value = userList.value.length
  } catch (e) {
    console.warn('[ReferralUsersView] 加载推广用户失败:', e.message)
  }
}

onMounted(async () => {
  partnerName.value = route.query.name || ''
  loading.value = true
  try {
    await Promise.all([
      loadStats(),
      loadOrderStats(),
      loadCommissionRates(),
      loadInvitedUsers(),
    ])
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.stat-card { cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; }
.stat-card:hover { transform: translateY(-2px); }
.card-header span { font-weight: 600; font-size: 14px; color: var(--text-primary); }
.card-header-tip { font-size: 12px; font-weight: 400; color: var(--text-tertiary); }
.card-header-actions { display: flex; align-items: center; }
.order-stats-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}
.order-stats-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  transition: background 0.2s;
  cursor: pointer;
}
.order-stats-item:hover {
  background: var(--el-fill-color);
}
.order-stats-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.order-stats-info {
  min-width: 0;
}
.order-stats-label {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}
.order-stats-amount {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}
.order-stats-count {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}
.rate-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rate-suffix {
  color: var(--text-tertiary);
  font-size: 13px;
  flex-shrink: 0;
}
</style>
