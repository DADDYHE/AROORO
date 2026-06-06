<template>
  <div class="dashboard" v-loading="loading">
    <el-row :gutter="20" class="stat-row">
      <el-col :span="6" v-for="card in statCards" :key="card.key">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-icon" :style="{ backgroundColor: card.bgColor }">
            <el-icon :size="24" :color="card.color"><component :is="card.icon" /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ card.value }}</div>
            <div class="stat-label">{{ card.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="quick-actions-row">
      <el-col :span="24">
        <el-card shadow="hover" class="quick-actions-card">
          <template #header>
            <div class="quick-header">
              <span>快捷入口</span>
              <el-tag type="info" size="small">待处理事项</el-tag>
            </div>
          </template>
          <div class="quick-actions">
            <div class="quick-item" @click="$router.push('/order?status=pending_payment')">
              <el-badge :value="pendingStats.pendingPayment" :hidden="!pendingStats.pendingPayment" class="quick-badge">
                <div class="quick-icon-box" style="background:#FFF3E0">
                  <el-icon :size="20" color="#FF9800"><Box /></el-icon>
                </div>
              </el-badge>
              <span>待支付</span>
            </div>
            <div class="quick-item" @click="$router.push('/order/mall?status=confirmed')">
              <el-badge :value="pendingStats.pendingShip" :hidden="!pendingStats.pendingShip" class="quick-badge">
                <div class="quick-icon-box" style="background:#E3F2FD">
                  <el-icon :size="20" color="#2196F3"><Sell /></el-icon>
                </div>
              </el-badge>
              <span>待发货</span>
            </div>
            <div class="quick-item" @click="$router.push('/admin/approval')">
              <el-badge :value="pendingStats.pendingApproval" :hidden="!pendingStats.pendingApproval" class="quick-badge">
                <div class="quick-icon-box" style="background:#FCE4EC">
                  <el-icon :size="20" color="#E91E63"><DocumentChecked /></el-icon>
                </div>
              </el-badge>
              <span>待审核</span>
            </div>
            <div class="quick-item" @click="$router.push('/withdrawal')">
              <el-badge :value="pendingStats.pendingWithdrawal" :hidden="!pendingStats.pendingWithdrawal" class="quick-badge">
                <div class="quick-icon-box" style="background:#E8F5E9">
                  <el-icon :size="20" color="#4CAF50"><Money /></el-icon>
                </div>
              </el-badge>
              <span>待处理提现</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="chart-row">
      <el-col :span="16">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="chart-header">
              <span>订单趋势</span>
              <el-radio-group v-model="orderTrendDays" size="small" @change="onTrendDaysChange">
                <el-radio-button :value="7">近7天</el-radio-button>
                <el-radio-button :value="30">近30天</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div ref="orderChartRef" style="height:320px"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <span>订单类型分布</span>
          </template>
          <div ref="orderTypeChartRef" style="height:320px"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="chart-row">
      <el-col :span="12">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <span>收入趋势</span>
          </template>
          <div ref="revenueChartRef" style="height:280px"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <span>收入类型分布</span>
          </template>
          <div ref="revenueTypeChartRef" style="height:280px"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { getDashboardStats } from '@/api/dashboard'
import { formatMoney } from '@/utils/format'

const router = useRouter()
const loading = ref(false)
const stats = ref({})
const pendingStats = ref({
  pendingPayment: 0,
  pendingShip: 0,
  pendingApproval: 0,
  pendingWithdrawal: 0
})
const orderTrendDays = ref(7)
const orderChartRef = ref()
const revenueChartRef = ref()
const orderTypeChartRef = ref()
const revenueTypeChartRef = ref()
let orderChart = null
let revenueChart = null
let orderTypeChart = null
let revenueTypeChart = null

const statCards = computed(() => [
  {
    key: 'todayOrders',
    label: '今日订单',
    value: stats.value.todayOrders || 0,
    icon: 'ShoppingCart',
    bgColor: '#E3F2FD',
    color: '#2196F3'
  },
  {
    key: 'todayRevenue',
    label: '今日收入',
    value: formatMoney(stats.value.todayRevenue),
    icon: 'Coin',
    bgColor: '#E8F5E9',
    color: '#4CAF50'
  },
  {
    key: 'totalUsers',
    label: '总用户数',
    value: stats.value.totalUsers || 0,
    icon: 'User',
    bgColor: '#FFF3E0',
    color: '#FF9800'
  },
  {
    key: 'activeHosts',
    label: '活跃寄养师',
    value: stats.value.activeHosts || 0,
    icon: 'Money',
    bgColor: '#FCE4EC',
    color: '#E91E63'
  },
])

onMounted(async () => {
  loading.value = true
  try {
    const res = await getDashboardStats()
    if (res.code === 0 || res.data) {
      stats.value = res.data || {}
      pendingStats.value = {
        pendingPayment: stats.value.pendingPayment || 0,
        pendingShip: stats.value.pendingShip || 0,
        pendingApproval: stats.value.pendingApproval || 0,
        pendingWithdrawal: stats.value.pendingWithdrawal || 0
      }
    }
    await nextTick()
    renderCharts()
  } finally {
    loading.value = false
  }
})

function onTrendDaysChange() {
  renderOrderChart()
}

function renderCharts() {
  renderOrderChart()
  renderRevenueChart()
  renderOrderTypeChart()
  renderRevenueTypeChart()
}

function renderOrderChart() {
  if (!orderChartRef.value) return
  orderChart = echarts.init(orderChartRef.value)
  const days = orderTrendDays.value
  const trendData = stats.value.orderTrend || []
  const filteredData = trendData.slice(-days)
  const dates = filteredData.map(d => d.date?.split('-').slice(1).join('/') || '')
  const counts = filteredData.map(d => d.count || 0)

  orderChart.setOption({
    tooltip: { trigger: 'axis', formatter: '{b}<br/>订单数: {c}' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: '#E0E0E0' } }, axisLabel: { color: '#666' } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#F0F0F0' } }, axisLabel: { color: '#666' } },
    series: [{
      name: '订单数',
      type: 'line',
      smooth: true,
      data: counts,
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(78,205,196,0.4)' }, { offset: 1, color: 'rgba(78,205,196,0.05)' }]) },
      lineStyle: { color: '#4ECDC4', width: 2 },
      itemStyle: { color: '#4ECDC4' },
      symbol: 'circle',
      symbolSize: 6
    }]
  })
}

function renderRevenueChart() {
  if (!revenueChartRef.value) return
  revenueChart = echarts.init(revenueChartRef.value)
  const trendData = stats.value.orderTrend || []
  const dates = trendData.map(d => d.date?.split('-').slice(1).join('/') || '')
  const amounts = trendData.map(d => d.revenue || d.amount || 0)

  revenueChart.setOption({
    tooltip: { trigger: 'axis', formatter: params => `${params[0].name}<br/>收入: ¥${params[0].value.toFixed(2)}` },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: '#E0E0E0' } }, axisLabel: { color: '#666' } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#F0F0F0' } }, axisLabel: { color: '#666', formatter: v => `¥${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}` } },
    series: [{
      name: '收入',
      type: 'bar',
      data: amounts,
      itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#83C5BE' }, { offset: 1, color: '#4ECDC4' }]), borderRadius: [4, 4, 0, 0] },
      barWidth: '60%'
    }]
  })
}

function renderOrderTypeChart() {
  if (!orderTypeChartRef.value) return
  orderTypeChart = echarts.init(orderTypeChartRef.value)
  const raw = stats.value.ordersByType || {}
  const data = Array.isArray(raw) ? raw : Object.values(raw)

  orderTypeChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', right: '5%', top: 'center', textStyle: { color: '#666' } },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      emphasis: {
        label: { show: true, fontSize: 14, fontWeight: 'bold' }
      },
      labelLine: { show: false },
      data: data.map((item, i) => ({
        value: item.count,
        name: item.name || item.type,
        itemStyle: { color: ['#4ECDC4', '#FF6B6B', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'][i % 6] }
      }))
    }]
  })
}

function renderRevenueTypeChart() {
  if (!revenueTypeChartRef.value) return
  revenueTypeChart = echarts.init(revenueTypeChartRef.value)
  const raw = stats.value.revenueByType || {}
  const data = Array.isArray(raw) ? raw : Object.values(raw)

  revenueTypeChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: { orient: 'vertical', right: '5%', top: 'center', textStyle: { color: '#666' } },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['35%', '50%'],
      data: data.map((item, i) => ({
        value: item.amount || item.value,
        name: item.name || item.type,
        itemStyle: { color: ['#4ECDC4', '#FF6B6B', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'][i % 6] }
      }))
    }]
  })
}

const resizeObserver = new ResizeObserver(() => {
  orderChart?.resize()
  revenueChart?.resize()
  orderTypeChart?.resize()
  revenueTypeChart?.resize()
})

onMounted(() => {
  resizeObserver.observe(orderChartRef.value?.$el || orderChartRef.value)
})

onUnmounted(() => {
  resizeObserver.disconnect()
  orderChart?.dispose()
  revenueChart?.dispose()
  orderTypeChart?.dispose()
  revenueTypeChart?.dispose()
})
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: var(--spacing-lg); }
.stat-row .el-col { padding: 0; }
.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  border: none;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: all 0.25s ease;
}
.stat-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
.stat-card :deep(.el-card__body) { padding: var(--spacing-lg); width: 100%; display: flex; align-items: center; gap: 16px; }
.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-content { flex: 1; min-width: 0; }
.stat-value { font-size: 24px; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
.stat-label { font-size: 13px; color: var(--text-tertiary); margin-top: 4px; }

.quick-actions-card :deep(.el-card__header) { padding: 12px 16px; border-bottom: none; background: transparent; }
.quick-header { display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
.quick-actions { display: flex; gap: 24px; }
.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.2s;
}
.quick-item:hover { transform: translateY(-2px); }
.quick-item span { font-size: 13px; color: var(--text-secondary); }
.quick-icon-box {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.quick-badge :deep(.el-badge__content) { top: -2px; right: -2px; }

.chart-row { margin-top: 0; }
.chart-card :deep(.el-card__header) { padding: 12px 16px; border-bottom: 1px solid var(--border-color); font-weight: 600; }
.chart-header { display: flex; align-items: center; justify-content: space-between; }

.dashboard :deep(.el-card) {
  border-radius: var(--radius-md);
  border: none;
  box-shadow: var(--shadow-sm);
}

@media (max-width: 1200px) {
  .stat-row .el-col { width: 50%; max-width: 50%; flex: 0 0 50%; }
  .chart-row .el-col { width: 100%; max-width: 100%; flex: 0 0 100%; }
}
</style>
