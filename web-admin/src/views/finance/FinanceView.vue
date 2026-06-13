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
    <el-row :gutter="20" style="margin-top:20px">
      <el-col :span="14">
        <el-card>
          <template #header>收入构成</template>
          <div ref="chartRef" style="height:350px"></div>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card>
          <template #header>最近交易</template>
          <el-table :data="recentTransactions" size="small" :show-header="true" style="width:100%">
            <el-table-column prop="type" label="类型" width="90">
              <template #default="{ row }">{{ ORDER_TYPE_LABELS[row.type] || row.type }}</template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" width="100">
              <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="completedAt" label="时间">
              <template #default="{ row }">{{ formatDate(row.completedAt) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'
import { getFinanceOverview } from '@/api/dashboard'
import { formatMoney, formatDate } from '@/utils/format'
import { ORDER_ORDER_TYPE_LABELS } from '@/constants/order'

let chartInstance = null

// ORDER_ORDER_TYPE_LABELS imported from @/constants/order

const loading = ref(false)
const data = ref({})
const chartRef = ref()

const financeCards = computed(() => {
  const s = data.value.stats || {}
  const r = data.value.revenueByType || {}
  const cards = [
    { key: 'totalRevenue', label: '总收入', value: formatMoney(s.totalRevenue) },
    { key: 'monthlyRevenue', label: '本月收入', value: formatMoney(s.monthlyRevenue) },
  ]
  for (const [type, label] of Object.entries(ORDER_TYPE_LABELS)) {
    cards.push({ key: type, label, value: formatMoney(r[type]) })
  }
  return cards
})

const recentTransactions = computed(() => data.value.recentTransactions || [])

onMounted(async () => {
  loading.value = true
  try {
    const res = await getFinanceOverview()
    data.value = res.data || {}
    if (chartRef.value) {
      chartInstance = echarts.init(chartRef.value)
      const r = data.value.revenueByType || {}
      chartInstance.setOption({
        tooltip: { trigger: 'item' },
        series: [{
          type: 'pie', radius: ['35%', '65%'],
          data: Object.entries(ORDER_TYPE_LABELS).map(([type, label]) => ({
            value: Number(r[type]) || 0, name: label,
          })),
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
        }],
      })
    }
  } finally { loading.value = false }
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
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
