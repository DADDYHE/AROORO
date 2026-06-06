<template>
  <el-card>
    <div class="filter-bar">
      <el-radio-group v-model="statusFilter" @change="onFilterChange">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="pending">待审核</el-radio-button>
        <el-radio-button value="approved">已通过</el-radio-button>
        <el-radio-button value="rejected">已拒绝</el-radio-button>
      </el-radio-group>
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="nickName" label="申请人昵称" width="140" />
      <el-table-column label="申请类型" width="120">
        <template #default>
          <el-tag size="small">合作伙伴</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="申请理由" min-width="200" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType[row.status]" size="small">{{ statusLabels[row.status] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button link type="primary" @click="onApprove(row._id)">通过</el-button>
            <el-button link type="danger" @click="onReject(row._id)">拒绝</el-button>
          </template>
          <span v-else class="text-muted">已处理</span>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { getApplicationList, approveApplication, rejectApplication } from '@/api/admin'
import { usePagination } from '@/composables/usePagination'
import { formatDate } from '@/utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const statusFilter = ref('')
const statusLabels = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
const statusTagType = { pending: 'warning', approved: 'success', rejected: 'danger' }

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange, resetAndFetch } = usePagination(getApplicationList)

function onFilterChange() {
  resetAndFetch(statusFilter.value ? { status: statusFilter.value } : {})
}

async function onApprove(id) {
  await ElMessageBox.confirm('确定通过该申请？通过后可在管理员管理中分配权限')
  await approveApplication(id)
  ElMessage.success('已通过，请在管理员管理中分配权限')
  fetch(statusFilter.value ? { status: statusFilter.value } : {})
  window.dispatchEvent(new CustomEvent('approval-changed'))
}

async function onReject(id) {
  const { value } = await ElMessageBox.prompt('请输入拒绝理由', '拒绝申请', { inputPlaceholder: '拒绝理由' })
  await rejectApplication(id, value)
  ElMessage.success('已拒绝')
  fetch(statusFilter.value ? { status: statusFilter.value } : {})
  window.dispatchEvent(new CustomEvent('approval-changed'))
}

fetch()
</script>

<style scoped>
.filter-bar { margin-bottom: var(--spacing-md); }
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
.text-muted { color: var(--text-tertiary); }
</style>
