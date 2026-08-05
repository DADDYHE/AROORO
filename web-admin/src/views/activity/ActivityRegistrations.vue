<template>
  <el-card>
    <el-page-header @back="$router.back()" :title="'活动列表'" :content="activityTitle || '报名管理'" />

    <div class="toolbar">
      <el-select v-model="statusFilter" placeholder="状态" style="width:140px" clearable @change="onSearch">
        <el-option label="已确认" value="confirmed" />
        <el-option label="待支付" value="pending_payment" />
        <el-option label="已退款" value="refunded" />
        <el-option label="已取消" value="cancelled" />
      </el-select>
      <el-button type="success" :loading="exporting" @click="onExport">导出 CSV</el-button>
      <span class="hint">共 {{ total }} 条报名</span>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="displayName" label="用户" width="140">
        <template #default="{ row }">
          <div style="display:flex;align-items:center;gap:8px">
            <el-avatar :size="28" :src="row.userAvatar || ''">{{ (row.displayName || '?')[0] }}</el-avatar>
            <span>{{ row.displayName }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="宠物" min-width="140">
        <template #default="{ row }">{{ (row.pets || []).map(p => p.name).join('、') || '-' }}</template>
      </el-table-column>
      <el-table-column label="人数" width="80" align="center">
        <template #default="{ row }">{{ row.participantCount || 1 }} 人</template>
      </el-table-column>
      <el-table-column prop="phone" label="联系电话" width="130" />
      <el-table-column label="金额" width="110">
        <template #default="{ row }">
          <span v-if="row.finalAmount > 0">¥{{ row.finalAmount }}</span>
          <span v-else class="free-text">免费</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG[row.status] || 'info'" size="small">{{ STATUS_TEXT[row.status] || row.status }}</el-tag>
          <el-tag v-if="row.pendingReview" type="warning" size="small" style="margin-left:4px">待抽检</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="报名时间" width="160" />
      <el-table-column prop="notes" label="备注" min-width="140" show-overflow-tooltip />
    </el-table>
    <el-pagination class="pager" layout="total, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" />
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getActivityRegistrations, exportActivityRegistrations } from '@/api/activity'
import { ElMessage } from 'element-plus'

const route = useRoute()
const activityId = route.params.id
const activityTitle = ref('')

const STATUS_TEXT = {
  confirmed: '已确认',
  pending_payment: '待支付',
  refunded: '已退款',
  cancelled: '已取消',
}
const STATUS_TAG = {
  confirmed: 'success',
  pending_payment: 'warning',
  refunded: 'info',
  cancelled: 'info',
}

const statusFilter = ref('')
const list = ref([])
const loading = ref(false)
const total = ref(0)
const exporting = ref(false)
const pagination = ref({ page: 1, pageSize: 20 })

async function fetch() {
  loading.value = true
  try {
    const params = { activityId, page: pagination.value.page, pageSize: pagination.value.pageSize }
    if (statusFilter.value) { params.status = statusFilter.value }
    const res = await getActivityRegistrations(params)
    list.value = res.data.list || []
    total.value = res.data.total || 0
    if (res.data.list && res.data.list[0] && !activityTitle.value) {
      // 报名接口不返回活动标题，保持空
    }
  } finally {
    loading.value = false
  }
}

function onSearch() {
  pagination.value.page = 1
  fetch()
}

function onPageChange(page) {
  pagination.value.page = page
  fetch()
}

async function onExport() {
  exporting.value = true
  try {
    const res = await exportActivityRegistrations(activityId)
    const data = res.data || {}
    if (!data.csvContent) {
      ElMessage.warning('暂无报名数据')
      return
    }
    const blob = new Blob(['\ufeff' + data.csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.activityTitle || '活动'}_报名.csv`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`已导出 ${data.totalCount} 条`)
  } catch (e) {
    ElMessage.error(e?.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

onMounted(fetch)
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; align-items: center; }
.hint { color: #999; font-size: 12px; }
.free-text { color: #67C23A; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
