<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="hostName" label="家庭名称" width="160" />
      <el-table-column prop="address" label="地址" min-width="200" show-overflow-tooltip />
      <el-table-column prop="isAcceptingOrders" label="接单状态" width="100">
        <template #default="{ row }"><el-switch :model-value="row.isAcceptingOrders" @change="(val) => toggleAccepting(row._id, val)" /></template>
      </el-table-column>
      <el-table-column prop="status" label="服务状态" width="100">
        <template #default="{ row }"><el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">{{ HOST_SERVICE_STATUS_LABELS[row.status] || row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link :type="row.status === 'active' ? 'danger' : 'success'" @click="toggleStatus(row)">{{ row.status === 'active' ? '停用' : '启用' }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getActiveHosts, toggleHostStatus, toggleHostAccepting } from '@/api/hosting'
import { usePagination } from '@/composables/usePagination'
import { HOST_SERVICE_STATUS_LABELS } from '@/constants/order'
import { ElMessage } from 'element-plus'

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getActiveHosts)

async function toggleAccepting(hostId, val) { await toggleHostAccepting(hostId, val); ElMessage.success('操作成功'); fetch() }
async function toggleStatus(row) { const s = row.status === 'active' ? 'disabled' : 'active'; await toggleHostStatus(row._id, s); ElMessage.success('操作成功'); fetch() }

fetch()
</script>

<style scoped>
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
</style>
