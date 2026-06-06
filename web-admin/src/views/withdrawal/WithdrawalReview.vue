<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="_id" label="记录ID" width="200" show-overflow-tooltip />
      <el-table-column prop="nickName" label="申请人" width="120" />
      <el-table-column prop="amount" label="提现金额" width="120">
        <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="withdrawalTagType(row.status)" size="small">{{ WITHDRAWAL_STATUS_LABELS[row.status] || row.status }}</el-tag></template>
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
import { getWithdrawalList, approveWithdrawal, rejectWithdrawal } from '@/api/withdrawal'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { WITHDRAWAL_STATUS_LABELS } from '@/utils/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getWithdrawalList)

function withdrawalTagType(status) {
  return { pending: 'warning', approved: '', processing: '', completed: 'success', rejected: 'danger' }[status] || 'info'
}

async function onApprove(id) {
  await ElMessageBox.confirm('确定通过该提现申请？将通过微信转账到用户零钱。')
  await approveWithdrawal(id)
  ElMessage.success('已通过')
  fetch()
}

async function onReject(id) {
  const { value } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝提现', { inputPlaceholder: '拒绝原因' })
  await rejectWithdrawal(id, value)
  ElMessage.success('已拒绝')
  fetch()
}

fetch()
</script>

<style scoped>
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
.text-muted { color: var(--text-placeholder); }
</style>
