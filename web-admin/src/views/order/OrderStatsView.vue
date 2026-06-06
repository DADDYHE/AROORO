<template>
  <div class="order-stats" v-loading="loading">
    <el-card class="stats-summary">
      <el-row :gutter="20">
        <el-col :span="6" v-for="item in summaryCards" :key="item.key">
          <div class="summary-item">
            <div class="summary-icon" :style="{ backgroundColor: item.bgColor }">
              <el-icon :size="20" :color="item.color"><component :is="item.icon" /></el-icon>
            </div>
            <div class="summary-content">
              <div class="summary-value">{{ item.value }}</div>
              <div class="summary-label">{{ item.label }}</div>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <el-row :gutter="20" class="chart-section">
      <el-col :span="16">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>订单趋势</span>
              <el-radio-group v-model="trendDays" size="small" @change="loadTrendData">
                <el-radio-button :value="7">近7天</el-radio-button>
                <el-radio-button :value="30">近30天</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div ref="trendChartRef" style="height:300px"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header><span>订单类型分布</span></template>
          <div ref="typeChartRef" style="height:300px"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <span>订单明细</span>
          <el-button type="primary" size="small" @click="onExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </div>
      </template>
      <div class="filter-bar">
        <el-select v-model="filters.orderType" placeholder="订单类型" style="width:140px" clearable @change="loadOrderList">
          <el-option label="全部" value="" />
          <el-option label="寄养订单" value="boarding" />
          <el-option label="商城订单" value="mall" />
          <el-option label="喂养订单" value="feeding" />
          <el-option label="团购订单" value="tuan" />
          <el-option label="活动订单" value="activity" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" style="width:140px" clearable @change="loadOrderList">
          <el-option v-for="(label, key) in STATUS_OPTIONS" :key="key" :label="label" :value="key" />
        </el-select>
        <el-date-picker v-model="filters.dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width:260px" value-format="YYYY-MM-DD" @change="loadOrderList" />
      </div>
      <el-table :data="orderList" v-loading="tableLoading" stripe>
        <el-table-column prop="orderNo" label="订单号" width="160" />
        <el-table-column prop="orderType" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="ORDER_TYPE_TAG[row.orderType]">{{ ORDER_TYPE_LABELS[row.orderType] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="buyerNickName" label="买家" width="120" />
        <el-table-column prop="productName" label="商品/服务" min-width="180" show-overflow-tooltip />
        <el-table-column prop="totalAmount" label="金额" width="100">
          <template #default="{ row }">{{ formatMoney(row.totalAmount || row.totalPrice) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="ORDER_STATUS_TAG[row.status]">{{ ORDER_STATUS_LABELS[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="下单时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { getOrderStats, exportOrders, getOrderTrend } from '@/api/order-stats'
import { getBoardingOrders, getMallOrders, getFeedingOrders, getTuanDealOrders, getActivityOrders } from '@/api/order'
import { formatDate, formatMoney } from '@/utils/format'

const ORDER_TYPE_LABELS = { boarding: '寄养', mall: '商城', feeding: '服务', tuan: '团购', activity: '活动' }
const ORDER_TYPE_TAG = { boarding: '', mall: 'success', feeding: 'warning', tuan: 'info', activity: '' }
const ORDER_STATUS_LABELS = { pending: '待确认', pending_payment: '待支付', paid: '已支付', confirmed: '已确认', shipped: '已发货', in_progress: '进行中', completed: '已完成', cancelled: '已取消', rejected: '已拒绝' }
const ORDER_STATUS_TAG = { pending: 'warning', pending_payment: 'warning', paid: 'primary', confirmed: 'primary', shipped: '', in_progress: '', completed: 'success', cancelled: 'info', rejected: 'danger' }
const STATUS_OPTIONS = { pending: '待确认', pending_payment: '待支付', confirmed: '已确认', shipped: '已发货', in_progress: '进行中', completed: '已完成', cancelled: '已取消', rejected: '已拒绝' }

const loading = ref(false)
const tableLoading = ref(false)
const trendDays = ref(7)
const trendChartRef = ref()
const typeChartRef = ref()
let trendChart = null
let typeChart = null

const summary = ref({
  totalOrders: 0,
  totalAmount: 0,
  todayOrders: 0,
  todayAmount: 0,
  byType: []
})

const summaryCards = computed(() => [
  { key: 'totalOrders', label: '总订单数', value: summary.value.totalOrders, icon: 'Tickets', bgColor: '#E3F2FD', color: '#2196F3' },
  { key: 'totalAmount', label: '总收入', value: formatMoney(summary.value.totalAmount), icon: 'Coin', bgColor: '#E8F5E9', color: '#4CAF50' },
  { key: 'todayOrders', label: '今日订单', value: summary.value.todayOrders, icon: 'Calendar', bgColor: '#FFF3E0', color: '#FF9800' },
  { key: 'todayAmount', label: '今日收入', value: formatMoney(summary.value.todayAmount), icon: 'Money', bgColor: '#FCE4EC', color: '#E91E63' },
])

const filters = reactive({
  orderType: '',
  status: '',
  dateRange: null
})

const pagination = reactive({ page: 1, pageSize: 20 })
const total = ref(0)
const orderList = ref([])

const fetchFns = { boarding: getBoardingOrders, mall: getMallOrders, feeding: getFeedingOrders, tuan: getTuanDealOrders, activity: getActivityOrders }

async function loadSummary() {
  loading.value = true
  try {
    const params = {}
    if (filters.dateRange) {
      params.startDate = filters.dateRange[0]
      params.endDate = filters.dateRange[1]
    }
    const res = await getOrderStats(params)
    if (res.code === 0 || res.data) {
      summary.value = res.data || {}
    }
  } catch (e) {
    console.error('加载统计失败', e)
  } finally {
    loading.value = false
  }
}

async function loadTrendData() {
  await nextTick()
  if (!trendChartRef.value) return
  trendChart = echarts.init(trendChartRef.value)

  const params = { days: trendDays.value }
  const res = await getOrderTrend(params)
  const data = res?.data?.trend || []

  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: data.map(d => d.date?.split('-').slice(1).join('/') || ''), axisLine: { lineStyle: { color: '#E0E0E0' } }, axisLabel: { color: '#666' } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#F0F0F0' } }, axisLabel: { color: '#666' } },
    series: [{
      name: '订单数',
      type: 'line',
      smooth: true,
      data: data.map(d => d.count || 0),
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(78,205,196,0.4)' }, { offset: 1, color: 'rgba(78,205,196,0.05)' }]) },
      lineStyle: { color: '#4ECDC4', width: 2 },
      itemStyle: { color: '#4ECDC4' }
    }]
  })
}

async function loadTypeChart() {
  await nextTick()
  if (!typeChartRef.value) return
  typeChart = echarts.init(typeChartRef.value)

  const raw = summary.value.byType || {}
  const data = Array.isArray(raw) ? raw : Object.entries(raw).map(([type, val]) => ({ type, ...val }))
  typeChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', right: '5%', top: 'center', textStyle: { color: '#666' } },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['35%', '50%'],
      data: data.map((item, i) => ({
        value: item.count || 0,
        name: ORDER_TYPE_LABELS[item.type] || item.type,
        itemStyle: { color: ['#4ECDC4', '#FF6B6B', '#45B7D1', '#96CEB4', '#FFEAA7'][i % 5] }
      }))
    }]
  })
}

async function loadOrderList() {
  tableLoading.value = true
  try {
    const params = { page: pagination.page, pageSize: pagination.pageSize }
    if (filters.orderType && fetchFns[filters.orderType]) {
      const res = await fetchFns[filters.orderType](params)
      if (res.code === 0 || res.data) {
        orderList.value = res.data?.list || res.data?.data || []
        total.value = res.data?.total || orderList.value.length
      }
    } else {
      const promises = Object.values(fetchFns).map(fn => fn({ ...params, pageSize: 1 }))
      const results = await Promise.all(promises)
      let allOrders = []
      results.forEach((res, index) => {
        if ((res.code === 0 || res.data) && res.data?.list) {
          allOrders = allOrders.concat(res.data.list.map(o => ({ ...o, orderType: Object.keys(fetchFns)[index] })))
        }
      })
      allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      orderList.value = allOrders.slice(0, pagination.pageSize)
      total.value = allOrders.length
    }
  } catch (e) {
    console.error('加载订单列表失败', e)
  } finally {
    tableLoading.value = false
  }
}

function onPageChange() { loadOrderList() }
function onSizeChange() { pagination.page = 1; loadOrderList() }

async function onExport() {
  try {
    const params = {}
    if (filters.orderType) params.orderType = filters.orderType
    if (filters.status) params.status = filters.status
    if (filters.dateRange) {
      params.startDate = filters.dateRange[0]
      params.endDate = filters.dateRange[1]
    }

    const res = await exportOrders(params)
    if (res.code === 0 && res.data) {
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `订单导出_${new Date().toISOString().slice(0,10)}.csv`
      link.click()
      ElMessage.success('导出成功')
    } else {
      ElMessage.error(res.message || '导出失败')
    }
  } catch (e) {
    ElMessage.error('导出失败')
  }
}

const resizeObserver = new ResizeObserver(() => {
  trendChart?.resize()
  typeChart?.resize()
})

onMounted(async () => {
  await loadSummary()
  await loadTrendData()
  await loadTypeChart()
  await loadOrderList()
  resizeObserver.observe(trendChartRef.value?.$el || trendChartRef.value)
})

onUnmounted(() => {
  resizeObserver.disconnect()
  trendChart?.dispose()
  typeChart?.dispose()
})
</script>

<style scoped>
.order-stats { display: flex; flex-direction: column; gap: var(--spacing-lg); }

.stats-summary :deep(.el-card__body) { padding: var(--spacing-md); }
.summary-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}
.summary-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.summary-value { font-size: 20px; font-weight: 700; color: var(--text-primary); }
.summary-label { font-size: 12px; color: var(--text-tertiary); }

.chart-section { margin-top: 0; }

.card-header { display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
.filter-bar { display: flex; gap: 12px; margin-bottom: var(--spacing-md); flex-wrap: wrap; }
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
</style>
