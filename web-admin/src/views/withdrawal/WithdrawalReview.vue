<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="_id" label="记录ID" width="200" show-overflow-tooltip />
      <el-table-column prop="nickName" label="申请人" width="120">
        <template #default="{ row }">{{ row.nickName || row.openid?.slice(0, 8) + '...' || '-' }}</template>
      </el-table-column>
      <el-table-column prop="amount" label="提现金额" width="120">
        <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="withdrawalTagType(row.status)" size="small">{{ WITHDRAWAL_STATUS_LABELS[row.status] || row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="transferError" label="转账错误" width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.transferError || '-' }}</template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button link type="primary" @click="onApprove(row._id)">通过</el-button>
            <el-button link type="danger" @click="onReject(row._id)">拒绝</el-button>
          </template>
          <template v-else-if="row.status === 'approved' || row.status === 'processing'">
            <el-button link type="warning" @click="onRetry(row._id, row.status)">
              {{ row.status === 'processing' ? '对账' : '重新转账' }}
            </el-button>
          </template>
          <span v-else class="text-muted">已处理</span>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getWithdrawalList, approveWithdrawal, rejectWithdrawal, retryTransfer } from '@/api/withdrawal'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { WITHDRAWAL_STATUS_LABELS } from '@/constants/order'
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

async function onRetry(id, status = 'approved') {
  const actionText = status === 'processing' ? '对账' : '重新发起转账'
  await ElMessageBox.confirm(`确定${actionText}？`, { type: 'warning' })
  const res = await retryTransfer(id)
  if (res?.transferError) {
    ElMessage.warning(`转账失败：${res.transferError}`)
  } else {
    // 后端把业务提示放在 data.message（对账成功/处理中/待确认等），避免一律误报"转账成功"
    ElMessage.success(res?.data?.message || res?.message || '操作成功')
  }
  fetch()
}

fetch()
</script>

<style scoped>
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
.text-muted { color: var(--text-placeholder); }
</style>
