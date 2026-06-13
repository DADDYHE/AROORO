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
              <div class="header-actions">
                <el-radio-group v-model="trendDays" size="small" @change="loadTrendData">
                  <el-radio-button :value="7">近7天</el-radio-button>
                  <el-radio-button :value="30">近30天</el-radio-button>
                </el-radio-group>
                <el-button type="primary" link @click="goToAllOrders">
                  查看订单明细
                  <el-icon><ArrowRight /></el-icon>
                </el-button>
              </div>
            </div>
          </template>
          <div ref="trendChartRef" style="height:380px"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>订单类型分布</span>
              <el-button type="primary" link size="small" @click="goToAllOrders">
                管理
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <div ref="typeChartRef" style="height:380px"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { ArrowRight } from '@element-plus/icons-vue'
import { getOrderStats, getOrderTrend } from '@/api/order-stats'
import { formatMoney } from '@/utils/format'
import { ORDER_TYPE_LABELS } from '@/constants/order'

const router = useRouter()

// ORDER_TYPE_LABELS imported from @/constants/order

const loading = ref(false)
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

function goToAllOrders() {
  router.push({ name: 'AllOrders' })
}

async function loadSummary() {
  loading.value = true
  try {
    const res = await getOrderStats()
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
  // 先 dispose 旧实例，防止内存泄漏
  if (trendChart) {
    trendChart.dispose()
    trendChart = null
  }
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
  // 先 dispose 旧实例，防止内存泄漏
  if (typeChart) {
    typeChart.dispose()
    typeChart = null
  }
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

const resizeObserver = new ResizeObserver(() => {
  trendChart?.resize()
  typeChart?.resize()
})

onMounted(async () => {
  await loadSummary()
  await loadTrendData()
  await loadTypeChart()
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
.card-header .header-actions { display: flex; align-items: center; gap: 12px; }
</style>