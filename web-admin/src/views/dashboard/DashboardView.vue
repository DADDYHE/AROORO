<template>
  <div class="dashboard" ref="dashboardRef" v-loading="loading">
    <!-- 页面标题区 -->
    <div class="page-header">
      <div class="header-left">
        <p class="eyebrow">OVERVIEW</p>
        <h1 class="page-title">数据概览</h1>
      </div>
      <p class="page-date">{{ todayStr }}</p>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stat-row" ref="statRowRef">
      <el-col :span="6" v-for="(card, idx) in statCards" :key="card.key">
        <div class="stat-card luxury-card stagger-item" :class="card.theme">
          <div class="stat-card-top">
            <div class="stat-icon-wrap">
              <el-icon :size="22"><component :is="card.icon" /></el-icon>
            </div>
            <span class="stat-trend" v-if="card.trend">
              <el-icon :size="12"><CaretTop v-if="card.trend > 0" /><CaretBottom v-else /></el-icon>
              {{ Math.abs(card.trend) }}%
            </span>
          </div>
          <div class="stat-body">
            <div class="stat-value num">{{ card.displayValue }}</div>
            <div class="stat-label">{{ card.label }}</div>
          </div>
          <div class="stat-card-accent"></div>
        </div>
      </el-col>
    </el-row>

    <!-- 快捷入口 -->
    <el-row :gutter="20" class="quick-actions-row">
      <el-col :span="24">
        <div class="section-card luxury-card stagger-item">
          <div class="section-header">
            <div>
              <p class="eyebrow">QUICK ACCESS</p>
              <span class="section-title">快捷入口</span>
            </div>
            <el-tag type="info" size="small" effect="plain">待处理事项</el-tag>
          </div>
          <div class="quick-actions">
            <div class="quick-item" @click="$router.push('/order?status=pending_payment')">
              <el-badge :value="pendingStats.pendingPayment" :hidden="!pendingStats.pendingPayment" class="quick-badge">
                <div class="quick-icon-box">
                  <el-icon :size="20"><Box /></el-icon>
                </div>
              </el-badge>
              <span class="quick-label">待支付</span>
            </div>
            <div class="quick-item" @click="$router.push('/order/mall?status=confirmed')">
              <el-badge :value="pendingStats.pendingShip" :hidden="!pendingStats.pendingShip" class="quick-badge">
                <div class="quick-icon-box">
                  <el-icon :size="20"><Sell /></el-icon>
                </div>
              </el-badge>
              <span class="quick-label">待发货</span>
            </div>
            <div class="quick-item" @click="$router.push('/admin/approval')">
              <el-badge :value="pendingStats.pendingApproval" :hidden="!pendingStats.pendingApproval" class="quick-badge">
                <div class="quick-icon-box">
                  <el-icon :size="20"><DocumentChecked /></el-icon>
                </div>
              </el-badge>
              <span class="quick-label">待审核</span>
            </div>
            <div class="quick-item" @click="$router.push('/withdrawal')">
              <el-badge :value="pendingStats.pendingWithdrawal" :hidden="!pendingStats.pendingWithdrawal" class="quick-badge">
                <div class="quick-icon-box">
                  <el-icon :size="20"><Money /></el-icon>
                </div>
              </el-badge>
              <span class="quick-label">待处理提现</span>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 图表区 -->
    <el-row :gutter="20" class="chart-row">
      <el-col :span="16">
        <div class="section-card luxury-card stagger-item">
          <div class="section-header">
            <div>
              <p class="eyebrow">TREND</p>
              <span class="section-title">订单趋势</span>
            </div>
            <el-radio-group v-model="orderTrendDays" size="small" @change="onTrendDaysChange">
              <el-radio-button :value="7">近7天</el-radio-button>
              <el-radio-button :value="30">近30天</el-radio-button>
            </el-radio-group>
          </div>
          <div ref="orderChartRef" class="chart-container"></div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="section-card luxury-card stagger-item">
          <div class="section-header">
            <div>
              <p class="eyebrow">DISTRIBUTION</p>
              <span class="section-title">订单类型分布</span>
            </div>
          </div>
          <div ref="orderTypeChartRef" class="chart-container"></div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="chart-row">
      <el-col :span="12">
        <div class="section-card luxury-card stagger-item">
          <div class="section-header">
            <div>
              <p class="eyebrow">REVENUE</p>
              <span class="section-title">收入趋势</span>
            </div>
          </div>
          <div ref="revenueChartRef" class="chart-container-sm"></div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="section-card luxury-card stagger-item">
          <div class="section-header">
            <div>
              <p class="eyebrow">BREAKDOWN</p>
              <span class="section-title">收入类型分布</span>
            </div>
          </div>
          <div ref="revenueTypeChartRef" class="chart-container-sm"></div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Box, Sell, DocumentChecked, Money, CaretTop, CaretBottom, ShoppingCart, Coin, User } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { getDashboardStats } from '@/api/dashboard'
import { ORDER_TYPE_LABELS } from '@/constants/order'
import { useStaggerCards, useStatCounter } from '@/composables/useGsap'

function typeLabel(name) {
  return ORDER_TYPE_LABELS[name] || name
}

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
const dashboardRef = ref()
let orderChart = null
let revenueChart = null
let orderTypeChart = null
let revenueTypeChart = null

// 动画显示值
const animatedValues = reactive({
  todayOrders: '0',
  todayRevenue: '0',
  totalUsers: '0',
  activeHosts: '0'
})

const todayStr = computed(() => {
  const d = new Date()
  const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
  return `${d.getFullYear()}年 ${months[d.getMonth()]}${d.getDate()}日`
})

const statCards = computed(() => [
  {
    key: 'todayOrders',
    label: '今日订单',
    value: stats.value.todayOrders || 0,
    displayValue: animatedValues.todayOrders,
    icon: 'ShoppingCart',
    theme: 'theme-primary',
    trend: stats.value.orderTrendPct
  },
  {
    key: 'todayRevenue',
    label: '今日收入',
    value: stats.value.todayRevenue || 0,
    displayValue: '¥' + animatedValues.todayRevenue,
    icon: 'Coin',
    theme: 'theme-gold',
    trend: stats.value.revenueTrendPct
  },
  {
    key: 'totalUsers',
    label: '总用户数',
    value: stats.value.totalUsers || 0,
    displayValue: animatedValues.totalUsers,
    icon: 'User',
    theme: 'theme-neutral',
    trend: stats.value.userTrendPct
  },
  {
    key: 'activeHosts',
    label: '活跃寄养师',
    value: stats.value.activeHosts || 0,
    displayValue: animatedValues.activeHosts,
    icon: 'Money',
    theme: 'theme-info',
    trend: null
  },
])

// GSAP 卡片交错入场
useStaggerCards(dashboardRef, '.stagger-item', { delay: 0.15, stagger: 0.07 })

// 数字计数器
const counterTodayOrders = useStatCounter(
  { get value() { return animatedValues.todayOrders }, set value(v) { animatedValues.todayOrders = v } },
  () => stats.value.todayOrders || 0,
  { delay: 0.3, duration: 1.2 }
)
const counterTodayRevenue = useStatCounter(
  { get value() { return animatedValues.todayRevenue }, set value(v) { animatedValues.todayRevenue = v } },
  () => stats.value.todayRevenue || 0,
  { delay: 0.4, duration: 1.4, decimals: 2 }
)
const counterTotalUsers = useStatCounter(
  { get value() { return animatedValues.totalUsers }, set value(v) { animatedValues.totalUsers = v } },
  () => stats.value.totalUsers || 0,
  { delay: 0.5, duration: 1.3 }
)
const counterActiveHosts = useStatCounter(
  { get value() { return animatedValues.activeHosts }, set value(v) { animatedValues.activeHosts = v } },
  () => stats.value.activeHosts || 0,
  { delay: 0.6, duration: 1.2 }
)

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
      // 触发数字动画
      counterTodayOrders.animate()
      counterTodayRevenue.animate()
      counterTotalUsers.animate()
      counterActiveHosts.animate()
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

// ---- ECharts 奢品配色 ----
const CHART_COLORS = {
  primary: '#1F3A1F',
  primaryLight: 'rgba(31, 58, 31, 0.15)',
  gold: '#C9A24B',
  goldLight: 'rgba(201, 162, 75, 0.15)',
  neutral: '#968D7A',
  textPrimary: '#1A1A17',
  textTertiary: '#968D7A',
  border: '#E8E4D9',
  splitLine: 'rgba(232, 228, 217, 0.6)',
  palette: ['#1F3A1F', '#C9A24B', '#547F54', '#DFB85A', '#85AC85', '#96722D', '#B3CFB3', '#EBD08A'],
}

function renderCharts() {
  renderOrderChart()
  renderRevenueChart()
  renderOrderTypeChart()
  renderRevenueTypeChart()
}

function renderOrderChart() {
  if (!orderChartRef.value) return
  if (orderChart) { orderChart.dispose(); orderChart = null }
  orderChart = echarts.init(orderChartRef.value)
  const days = orderTrendDays.value
  const trendData = stats.value.orderTrend || []
  const filteredData = trendData.slice(-days)
  const dates = filteredData.map(d => d.date?.split('-').slice(1).join('/') || '')
  const counts = filteredData.map(d => d.count || 0)

  orderChart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>订单数: {c}',
      backgroundColor: '#FFFFFF',
      borderColor: CHART_COLORS.border,
      borderWidth: 1,
      textStyle: { color: CHART_COLORS.textPrimary, fontFamily: 'Noto Sans SC' },
      extraCssText: 'border-radius: 8px; box-shadow: 0 4px 16px rgba(26,26,23,0.08);',
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
      axisLabel: { color: CHART_COLORS.textTertiary, fontFamily: 'Inter' },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_COLORS.splitLine, type: 'dashed' } },
      axisLabel: { color: CHART_COLORS.textTertiary, fontFamily: 'Inter' },
    },
    series: [{
      name: '订单数',
      type: 'line',
      smooth: true,
      data: counts,
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(31, 58, 31, 0.25)' },
          { offset: 1, color: 'rgba(31, 58, 31, 0.02)' },
        ]),
      },
      lineStyle: { color: CHART_COLORS.primary, width: 2.5 },
      itemStyle: {
        color: CHART_COLORS.gold,
        borderColor: CHART_COLORS.primary,
        borderWidth: 2,
      },
      symbol: 'circle',
      symbolSize: 7,
      emphasis: {
        itemStyle: { borderWidth: 3, shadowBlur: 8, shadowColor: 'rgba(201, 162, 75, 0.3)' },
      },
    }],
  })
}

function renderRevenueChart() {
  if (!revenueChartRef.value) return
  if (revenueChart) { revenueChart.dispose(); revenueChart = null }
  revenueChart = echarts.init(revenueChartRef.value)
  const trendData = stats.value.orderTrend || []
  const dates = trendData.map(d => d.date?.split('-').slice(1).join('/') || '')
  const amounts = trendData.map(d => d.revenue || d.amount || 0)

  revenueChart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: params => `${params[0].name}<br/>收入: ¥${params[0].value.toFixed(2)}`,
      backgroundColor: '#FFFFFF',
      borderColor: CHART_COLORS.border,
      borderWidth: 1,
      textStyle: { color: CHART_COLORS.textPrimary, fontFamily: 'Noto Sans SC' },
      extraCssText: 'border-radius: 8px; box-shadow: 0 4px 16px rgba(26,26,23,0.08);',
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
      axisLabel: { color: CHART_COLORS.textTertiary, fontFamily: 'Inter' },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_COLORS.splitLine, type: 'dashed' } },
      axisLabel: {
        color: CHART_COLORS.textTertiary,
        fontFamily: 'Inter',
        formatter: v => `¥${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`,
      },
    },
    series: [{
      name: '收入',
      type: 'bar',
      data: amounts,
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: CHART_COLORS.gold },
          { offset: 1, color: 'rgba(201, 162, 75, 0.3)' },
        ]),
        borderRadius: [6, 6, 0, 0],
      },
      barWidth: '50%',
      emphasis: {
        itemStyle: { shadowBlur: 12, shadowColor: 'rgba(201, 162, 75, 0.25)' },
      },
    }],
  })
}

function renderOrderTypeChart() {
  if (!orderTypeChartRef.value) return
  if (orderTypeChart) { orderTypeChart.dispose(); orderTypeChart = null }
  orderTypeChart = echarts.init(orderTypeChartRef.value)
  const raw = stats.value.ordersByType || {}
  const data = Array.isArray(raw) ? raw : Object.values(raw)
  const merged = {}
  data.forEach(item => {
    const key = item.name || item.type
    const label = typeLabel(key)
    merged[label] = (merged[label] || 0) + (item.count || 0)
  })

  orderTypeChart.setOption({
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: '#FFFFFF',
      borderColor: CHART_COLORS.border,
      borderWidth: 1,
      textStyle: { color: CHART_COLORS.textPrimary, fontFamily: 'Noto Sans SC' },
      extraCssText: 'border-radius: 8px; box-shadow: 0 4px 16px rgba(26,26,23,0.08);',
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: CHART_COLORS.textTertiary, fontSize: 12, fontFamily: 'Noto Sans SC' },
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 12,
    },
    series: [{
      type: 'pie',
      radius: ['42%', '68%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      emphasis: {
        label: { show: true, fontSize: 14, fontWeight: 600, color: CHART_COLORS.textPrimary },
        itemStyle: { shadowBlur: 16, shadowColor: 'rgba(26, 26, 23, 0.12)' },
      },
      labelLine: { show: false },
      itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
      data: Object.entries(merged).map(([name, count], i) => ({
        value: count,
        name,
        itemStyle: { color: CHART_COLORS.palette[i % CHART_COLORS.palette.length] },
      })),
    }],
  })
}

function renderRevenueTypeChart() {
  if (!revenueTypeChartRef.value) return
  if (revenueTypeChart) { revenueTypeChart.dispose(); revenueTypeChart = null }
  revenueTypeChart = echarts.init(revenueTypeChartRef.value)
  const raw = stats.value.revenueByType || {}
  const data = Array.isArray(raw) ? raw : Object.values(raw)
  const merged = {}
  data.forEach(item => {
    const key = item.name || item.type
    const label = typeLabel(key)
    merged[label] = (merged[label] || 0) + (item.amount || item.value || 0)
  })

  revenueTypeChart.setOption({
    tooltip: {
      trigger: 'item',
      formatter: '{b}: ¥{c} ({d}%)',
      backgroundColor: '#FFFFFF',
      borderColor: CHART_COLORS.border,
      borderWidth: 1,
      textStyle: { color: CHART_COLORS.textPrimary, fontFamily: 'Noto Sans SC' },
      extraCssText: 'border-radius: 8px; box-shadow: 0 4px 16px rgba(26,26,23,0.08);',
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: CHART_COLORS.textTertiary, fontSize: 12, fontFamily: 'Noto Sans SC' },
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 12,
    },
    series: [{
      type: 'pie',
      radius: ['42%', '68%'],
      center: ['35%', '50%'],
      itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
      emphasis: {
        itemStyle: { shadowBlur: 16, shadowColor: 'rgba(26, 26, 23, 0.12)' },
      },
      label: { show: false },
      data: Object.entries(merged).map(([name, amount], i) => ({
        value: Number(amount.toFixed(2)),
        name,
        itemStyle: { color: CHART_COLORS.palette[i % CHART_COLORS.palette.length] },
      })),
    }],
  })
}

const resizeObserver = new ResizeObserver(() => {
  orderChart?.resize()
  revenueChart?.resize()
  orderTypeChart?.resize()
  revenueTypeChart?.resize()
})

onMounted(() => {
  if (orderChartRef.value) resizeObserver.observe(orderChartRef.value)
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
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

/* ---- 页面标题 ---- */
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 4px;
}
.header-left { display: flex; flex-direction: column; gap: 2px; }
.eyebrow {
  font-family: var(--font-eyebrow);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--color-accent);
  margin: 0;
}
.page-title {
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.2;
}
.page-date {
  font-family: var(--font-number);
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
}

/* ---- 统计卡片 ---- */
.stat-row .el-col { padding: 0; }
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-lg);
  position: relative;
  overflow: hidden;
  transition: transform 0.35s var(--ease-luxury), box-shadow 0.35s var(--ease-luxury);
}
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
}
.stat-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}
.stat-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s var(--ease-luxury);
}
.stat-card:hover .stat-icon-wrap {
  transform: scale(1.05);
}
.stat-trend {
  display: flex;
  align-items: center;
  gap: 2px;
  font-family: var(--font-number);
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
}

/* 主题色 */
.stat-card.theme-primary .stat-icon-wrap { background: var(--color-primary-light); color: var(--color-primary); }
.stat-card.theme-primary .stat-trend { color: var(--color-success); background: var(--color-success-light); }
.stat-card.theme-primary .stat-card-accent { background: var(--color-primary); }

.stat-card.theme-gold .stat-icon-wrap { background: var(--color-accent-lighter); color: var(--color-accent-dark); }
.stat-card.theme-gold .stat-trend { color: var(--color-success); background: var(--color-success-light); }
.stat-card.theme-gold .stat-card-accent { background: var(--color-accent); }

.stat-card.theme-neutral .stat-icon-wrap { background: rgba(150, 141, 122, 0.12); color: var(--text-secondary); }
.stat-card.theme-neutral .stat-trend { color: var(--color-success); background: var(--color-success-light); }
.stat-card.theme-neutral .stat-card-accent { background: var(--text-secondary); }

.stat-card.theme-info .stat-icon-wrap { background: var(--color-info-light); color: var(--color-info); }
.stat-card.theme-info .stat-trend { color: var(--color-success); background: var(--color-success-light); }
.stat-card.theme-info .stat-card-accent { background: var(--color-info); }

.stat-card-accent {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  opacity: 0.6;
}

.stat-body { display: flex; flex-direction: column; gap: 4px; }
.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}
.stat-label {
  font-size: 13px;
  color: var(--text-tertiary);
  font-family: var(--font-sans);
}

/* ---- Section Card ---- */
.section-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-lg);
  transition: box-shadow 0.35s var(--ease-luxury);
}
.section-card:hover { box-shadow: var(--shadow-md); }

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-lg);
}
.section-title {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}

/* ---- 快捷入口 ---- */
.quick-actions {
  display: flex;
  gap: 32px;
}
.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: transform 0.25s var(--ease-luxury);
}
.quick-item:hover { transform: translateY(-3px); }
.quick-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: var(--font-sans);
}
.quick-icon-box {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light);
  color: var(--color-primary);
  transition: all 0.3s var(--ease-luxury);
}
.quick-item:hover .quick-icon-box {
  background: var(--color-primary);
  color: var(--color-accent);
  box-shadow: 0 4px 16px rgba(31, 58, 31, 0.15);
}
.quick-badge :deep(.el-badge__content) { top: -2px; right: -2px; }

/* ---- 图表 ---- */
.chart-row { margin-top: 0; }
.chart-container { height: 320px; }
.chart-container-sm { height: 280px; }

@media (max-width: 1200px) {
  .stat-row .el-col { width: 50%; max-width: 50%; flex: 0 0 50%; margin-bottom: 16px; }
  .chart-row .el-col { width: 100%; max-width: 100%; flex: 0 0 100%; }
  .quick-actions { flex-wrap: wrap; gap: 20px; }
}
</style>
