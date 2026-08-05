<template>
  <el-card>
    <div class="toolbar">
      <el-select v-model="statusFilter" placeholder="状态" style="width:140px" clearable @change="onSearch">
        <el-option v-for="(label, key) in ACTIVITY_STATUS" :key="key" :label="label" :value="key" />
      </el-select>
      <el-input v-model="keyword" placeholder="搜索活动标题" style="width:220px" clearable @keyup.enter="onSearch" @clear="onSearch" />
      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button type="success" @click="$router.push('/activity/create')">创建活动</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="title" label="活动名称" min-width="180" show-overflow-tooltip />
      <el-table-column label="分类" width="100">
        <template #default="{ row }">{{ CATEGORY_MAP[row.category] || row.category || '-' }}</template>
      </el-table-column>
      <el-table-column label="时间" min-width="210">
        <template #default="{ row }">{{ row.startTime || '待定' }}{{ row.endTime ? ` ~ ${row.endTime}` : '' }}</template>
      </el-table-column>
      <el-table-column label="费用" width="120">
        <template #default="{ row }">
          <span v-if="(row.pricePerPerson || 0) > 0 && (row.pricePerPet || 0) > 0">¥{{ row.pricePerPerson }}/人 ¥{{ row.pricePerPet }}/宠</span>
          <span v-else-if="(row.pricePerPerson || 0) > 0">¥{{ row.pricePerPerson }}/人</span>
          <span v-else-if="(row.pricePerPet || 0) > 0">¥{{ row.pricePerPet }}/宠</span>
          <span v-else class="free-text">免费</span>
        </template>
      </el-table-column>
      <el-table-column label="名额" width="110">
        <template #default="{ row }">{{ row.currentParticipants || 0 }}/{{ row.maxParticipants || '不限' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG[row.status] || 'info'" size="small">{{ ACTIVITY_STATUS[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/activity/${row._id}/edit`)">编辑</el-button>
          <el-button link type="success" @click="$router.push(`/activity/${row._id}/registrations`)">报名管理</el-button>
          <el-button link type="warning" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getActivityList, deleteActivity } from '@/api/activity'
import { usePagination } from '@/composables/usePagination'
import { ElMessage, ElMessageBox } from 'element-plus'

const ACTIVITY_STATUS = {
  draft: '草稿',
  published: '已发布',
  registration_stopped: '已截止报名',
  ended: '已结束',
  cancelled: '已取消',
  deleted: '已删除',
}
const STATUS_TAG = {
  draft: 'info',
  published: 'success',
  registration_stopped: 'warning',
  ended: 'info',
  cancelled: 'danger',
  deleted: 'info',
}
const CATEGORY_MAP = {
  outdoor: '户外活动',
  indoor: '室内活动',
  social: '社交聚会',
  training: '培训课程',
  competition: '比赛赛事',
  adoption: '领养活动',
  other: '其他活动',
}

const statusFilter = ref('')
const keyword = ref('')
const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getActivityList)

function onSearch() {
  const params = {}
  if (statusFilter.value) { params.status = statusFilter.value }
  if (keyword.value.trim()) { params.keyword = keyword.value.trim() }
  fetch(params)
}

async function onDelete(row) {
  await ElMessageBox.confirm(`确定删除活动「${row.title}」？删除为软删除，仅超级管理员可操作。`, '警告', { type: 'warning' })
  try {
    await deleteActivity(row._id)
    ElMessage.success('已删除')
    onSearch()
  } catch (e) {
    ElMessage.error(e?.message || '删除失败')
  }
}

onMounted(() => fetch())
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.free-text { color: #67C23A; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
