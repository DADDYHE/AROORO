<template>
  <el-card>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索昵称/手机号" style="width:240px" clearable @clear="onSearch" @keyup.enter="onSearch">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-button type="primary" @click="onSearch">搜索</el-button>
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="nickName" label="昵称" width="140" />
      <el-table-column prop="phone" label="手机号" width="140" />
      <el-table-column prop="orderCount" label="订单数" width="100" />
      <el-table-column prop="totalSpent" label="消费总额" width="120">
        <template #default="{ row }">{{ formatMoney(row.totalSpent) }}</template>
      </el-table-column>
      <el-table-column label="合作伙伴" width="100" align="center">
        <template #default="{ row }"><el-tag :type="row.isPartner ? 'success' : 'info'" size="small">{{ row.isPartner ? '是' : '否' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="createdAt" label="注册时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/user/${row._id}`)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { getUserList } from '@/api/user'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'

const keyword = ref('')
const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getUserList)

function onSearch() { fetch({ keyword: keyword.value }) }

fetch()
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: var(--spacing-md); }
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
</style>
