<template>
  <div v-loading="loading">
    <el-row :gutter="20">
      <el-col :span="4" v-for="card in financeCards" :key="card.key">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </el-card>
      </el-col>
    </el-row>
    <el-card style="margin-top:20px">
      <template #header>收入构成</template>
      <div ref="chartRef" style="height:350px"></div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import * as echarts from 'echarts'
import { getFinanceOverview } from '@/api/finance'
import { formatMoney } from '@/utils/format'

const TYPE_LABELS = {
  boarding: '寄养收入',
  activity: '活动收入',
  mall: '商城收入',
  feeding: '上门服务收入',
  tuan: '团购收入',
}

const loading = ref(false)
const data = ref({})
const chartRef = ref()

const financeCards = computed(() => {
  const s = data.value.stats || {}
  const r = data.value.revenueByType || {}
  const cards = [{ key: 'totalRevenue', label: '总收入', value: formatMoney(s.totalRevenue) }]
  for (const [type, label] of Object.entries(TYPE_LABELS)) {
    cards.push({ key: type, label, value: formatMoney(r[type]) })
  }
  return cards
})

onMounted(async () => {
  loading.value = true
  try {
    const res = await getFinanceOverview()
    data.value = res.data || {}
    const chart = echarts.init(chartRef.value)
    const r = data.value.revenueByType || {}
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: ['35%', '65%'],
        data: Object.entries(TYPE_LABELS).map(([type, label]) => ({
          value: r[type] || 0, name: label,
        })),
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
      }],
    })
  } finally { loading.value = false }
})
</script>

<style scoped>
.stat-card {
  text-align: center;
  border: none;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: all 0.25s ease;
}
.stat-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1.2;
}
.stat-label {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 6px;
}
</style>
