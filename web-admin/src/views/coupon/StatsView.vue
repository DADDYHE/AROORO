<template>
  <div class="coupon-stats" v-loading="loading">
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
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>发放趋势</span>
              <el-radio-group v-model="trendDays" size="small" @change="loadData">
                <el-radio-button :value="7">近7天</el-radio-button>
                <el-radio-button :value="30">近30天</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div ref="trendChartRef" style="height:280px"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>使用率分布</span></template>
          <div ref="usageChartRef" style="height:280px"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="chart-section">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>各模板发放量</span></template>
          <div ref="templateChartRef" style="height:280px"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>优惠券效果</span></template>
          <div class="effect-info">
            <div class="effect-item">
              <span class="effect-label">带动订单数</span>
              <span class="effect-value">{{ stats.drivenOrders || 0 }}</span>
            </div>
            <div class="effect-item">
              <span class="effect-label">带动收入</span>
              <span class="effect-value">{{ formatMoney(stats.drivenRevenue) }}</span>
            </div>
            <div class="effect-item">
              <span class="effect-label">核销金额</span>
              <span class="effect-value">{{ formatMoney(stats.totalUsedAmount) }}</span>
            </div>
            <div class="effect-item">
              <span class="effect-label">优惠金额</span>
              <span class="effect-value">{{ formatMoney(stats.discountAmount) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <span>领取记录</span>
        </div>
      </template>
      <el-table :data="templateStats" v-loading="tableLoading" stripe row-key="templateId" default-expand-all>
        <el-table-column type="expand">
          <template #default="{ row: parent }">
            <el-table :data="parent.details" size="small" style="margin:0 40px 8px">
              <el-table-column prop="nickName" label="领取用户" min-width="160" show-overflow-tooltip />
              <el-table-column prop="source" label="领取方式" width="100" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.source === 'popup'" type="warning" size="small">弹窗领取</el-tag>
                  <el-tag v-else-if="row.source === 'claim' || row.source === 'claim-center'" type="success" size="small">领券中心</el-tag>
                  <el-tag v-else-if="row.source === 'manual'" type="primary" size="small">后台发放</el-tag>
                  <el-tag v-else type="info" size="small">{{ row.source || '未知' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="100" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.status === 'used'" type="success" size="small">已使用</el-tag>
                  <el-tag v-else-if="row.status === 'expired'" type="danger" size="small">已过期</el-tag>
                  <el-tag v-else-if="row.status === 'locked'" type="warning" size="small">锁定中</el-tag>
                  <el-tag v-else type="info" size="small">未使用</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="receivedAt" label="领取时间" width="180">
                <template #default="{ row }">{{ formatDate(row.receivedAt) }}</template>
              </el-table-column>
            </el-table>
          </template>
        </el-table-column>
        <el-table-column prop="templateName" label="优惠券名称" min-width="150" show-overflow-tooltip />
        <el-table-column prop="grantCount" label="已领取" width="80" align="center" />
        <el-table-column prop="usedCount" label="已使用" width="80" align="center" />
        <el-table-column prop="usageRate" label="使用率" width="80" align="center">
          <template #default="{ row }">{{ row.usageRate }}%</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { getCouponStats } from '@/api/coupon-stats'
import { formatDate, formatMoney } from '@/utils/format'

const loading = ref(false)
const tableLoading = ref(false)
const trendDays = ref(7)
const trendChartRef = ref()
const usageChartRef = ref()
const templateChartRef = ref()
let trendChart = null
let usageChart = null
let templateChart = null

const stats = ref({
  totalGranted: 0,
  totalUsed: 0,
  totalUsedAmount: 0,
  usageRate: 0,
  drivenOrders: 0,
  drivenRevenue: 0,
  discountAmount: 0,
  byTemplate: [],
  trend: [],
})

const summaryCards = computed(() => [
  { key: 'totalGranted', label: '已发放', value: stats.value.totalGranted, icon: 'Ticket', bgColor: '#E3F2FD', color: '#2196F3' },
  { key: 'totalUsed', label: '已使用', value: stats.value.totalUsed, icon: 'CircleCheck', bgColor: '#E8F5E9', color: '#4CAF50' },
  { key: 'totalUsedAmount', label: '核销金额', value: formatMoney(stats.value.totalUsedAmount), icon: 'Money', bgColor: '#FFF3E0', color: '#FF9800' },
  { key: 'usageRate', label: '使用率', value: (stats.value.usageRate || 0).toFixed(1) + '%', icon: 'TrendCharts', bgColor: '#FCE4EC', color: '#E91E63' },
])

const templateStats = ref([])

async function loadData() {
  loading.value = true
  try {
    const res = await getCouponStats({ days: trendDays.value })
    const data = res.data || {}
    stats.value = data
    await nextTick()
    renderTrendChart(data.trend || [])
    renderUsageChart(data.totalUsed || 0, data.totalGranted || 0)
    renderTemplateChart(data.byTemplate || [])
  } catch (e) {
    console.error('加载统计失败', e)
  } finally {
    loading.value = false
  }
}

function renderTrendChart(data) {
  if (!trendChartRef.value) return
  if (!trendChart) trendChart = echarts.init(trendChartRef.value)
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    legend: { data: ['发放数', '使用数'], top: '5%' },
    xAxis: { type: 'category', data: data.map(d => d.date?.split('-').slice(1).join('/') || ''), axisLine: { lineStyle: { color: '#E0E0E0' } }, axisLabel: { color: '#666' } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#F0F0F0' } }, axisLabel: { color: '#666' } },
    series: [
      { name: '发放数', type: 'bar', data: data.map(d => d.granted || 0), itemStyle: { color: '#4ECDC4' }, barWidth: '40%' },
      { name: '使用数', type: 'bar', data: data.map(d => d.used || 0), itemStyle: { color: '#FF6B6B' }, barWidth: '40%' },
    ],
  })
}

function renderUsageChart(used, total) {
  if (!usageChartRef.value) return
  if (!usageChart) usageChart = echarts.init(usageChartRef.value)
  const unused = Math.max(0, total - used)
  usageChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', right: '5%', top: 'center', textStyle: { color: '#666' } },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['35%', '50%'],
      data: [
        { value: used, name: '已使用', itemStyle: { color: '#4CAF50' } },
        { value: unused, name: '未使用', itemStyle: { color: '#E0E0E0' } },
      ],
    }],
  })
}

function renderTemplateChart(data) {
  if (!templateChartRef.value) return
  if (!templateChart) templateChart = echarts.init(templateChartRef.value)
  const top8 = data.slice(0, 8)
  templateChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#F0F0F0' } }, axisLabel: { color: '#666' } },
    yAxis: { type: 'category', data: top8.map(d => d.templateName || '').reverse(), axisLine: { lineStyle: { color: '#E0E0E0' } }, axisLabel: { color: '#666' } },
    series: [{
      name: '发放量',
      type: 'bar',
      data: top8.map(d => d.grantCount || 0).reverse(),
      itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#83C5BE' }, { offset: 1, color: '#4ECDC4' }]), borderRadius: [0, 4, 4, 0] },
    }],
  })
}

async function loadTemplateStats() {
  tableLoading.value = true
  try {
    const res = await getCouponStats({ days: trendDays.value })
    const byTemplate = res.data?.byTemplate || []
    templateStats.value = byTemplate
  } catch (e) {
    console.error('加载领取记录失败', e)
  } finally {
    tableLoading.value = false
  }
}

const resizeObserver = new ResizeObserver(() => {
  trendChart?.resize()
  usageChart?.resize()
  templateChart?.resize()
})

onMounted(async () => {
  await loadData()
  await loadTemplateStats()
  const el = trendChartRef.value
  // 守卫：确保是有效的 Element（el-tabs/v-if 切换时 ref 可能为 null 或组件实例）
  if (el && el.nodeType === 1 && typeof el.addEventListener === 'function') {
    resizeObserver.observe(el)
  } else if (el && el.$el) {
    // 兼容：模板里偶尔用组件 ref
    const inner = el.$el
    if (inner && inner.nodeType === 1) resizeObserver.observe(inner)
  }
})

onUnmounted(() => {
  resizeObserver.disconnect()
  trendChart?.dispose()
  usageChart?.dispose()
  templateChart?.dispose()
})
</script>

<style scoped>
.coupon-stats { display: flex; flex-direction: column; gap: var(--spacing-lg); }

.stats-summary :deep(.el-card__body) { padding: var(--spacing-md); }
.summary-item { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
.summary-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.summary-value { font-size: 20px; font-weight: 700; color: var(--text-primary); }
.summary-label { font-size: 12px; color: var(--text-tertiary); }

.chart-section { margin-top: 0; }
.card-header { display: flex; align-items: center; justify-content: space-between; font-weight: 600; }

.effect-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 10px 0; }
.effect-item { display: flex; flex-direction: column; gap: 4px; }
.effect-label { font-size: 12px; color: var(--text-tertiary); }
.effect-value { font-size: 18px; font-weight: 600; color: var(--text-primary); }

.filter-bar { display: flex; gap: 12px; margin-bottom: var(--spacing-md); flex-wrap: wrap; }
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
</style>
