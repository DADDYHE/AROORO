<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="hostName" label="家庭名称" width="160" />
      <el-table-column prop="hostAddress" label="地址" min-width="200" show-overflow-tooltip />
      <el-table-column prop="serviceStatus" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="row.serviceStatus === 'pending_review' ? 'warning' : 'success'" size="small">{{ HOST_SERVICE_STATUS_LABELS[row.serviceStatus] || row.serviceStatus }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="onReview(row._id, 'active')">通过</el-button>
          <el-button link type="danger" @click="onReview(row._id, 'rejected')">拒绝</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup>
import { getPendingHostReviews, reviewHost } from '@/api/hosting'
import { usePagination } from '@/composables/usePagination'
import { HOST_SERVICE_STATUS_LABELS } from '@/constants/order'
import { ElMessage, ElMessageBox } from 'element-plus'

const { list, loading, fetch } = usePagination(getPendingHostReviews)

async function onReview(hostId, status) {
  await ElMessageBox.confirm(`确定${status === 'active' ? '通过' : '拒绝'}该审核？`)
  await reviewHost({ hostId, operation: status })
  ElMessage.success('操作成功')
  fetch()
}

fetch()
</script>
