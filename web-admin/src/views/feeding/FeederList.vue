<template>
  <el-card>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="name" label="姓名" width="120" />
      <el-table-column prop="serviceType" label="服务类型" width="120" />
      <el-table-column prop="phone" label="手机号" width="140" />
      <el-table-column prop="rating" label="评分" width="80" />
      <el-table-column prop="completedCount" label="完成订单" width="100" />
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getFeederList } from '@/api/feeding'
import { usePagination } from '@/composables/usePagination'
const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getFeederList)
fetch()
</script>

<style scoped>
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
</style>
