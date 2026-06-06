<template>
  <el-card>
    <div class="toolbar">
      <el-button type="primary" @click="$router.push('/tuan/create')">创建团购</el-button>
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column label="团购" min-width="240">
        <template #default="{ row }">
          <div class="deal-info">
            <el-image v-if="row.coverUrlPreview || row.coverUrl" :src="row.coverUrlPreview || row.coverUrl" fit="cover" class="deal-thumb" />
            <div v-else class="deal-thumb-placeholder">无图</div>
            <div class="deal-text">
              <div class="deal-title">{{ row.title }}</div>
              <div class="deal-sub">{{ (row.products || []).length }} 件商品</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="totalOrders" label="订单数" width="90" align="center">
        <template #default="{ row }">{{ row.totalOrders || 0 }}</template>
      </el-table-column>
      <el-table-column prop="totalAmount" label="总金额" width="100" align="center">
        <template #default="{ row }">{{ formatMoney(row.totalAmount) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="DEAL_STATUS_TYPE[row.status] || 'info'" size="small">{{ DEAL_STATUS[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="时间" width="180">
        <template #default="{ row }">
          <div class="time-range">{{ row.startTime ? formatDate(row.startTime) : '即时开始' }}</div>
          <div class="time-range">至 {{ isUnlimited(row.endTime) ? '无限期' : formatDate(row.endTime) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/tuan/${row._id}/edit`)">编辑</el-button>
          <el-button v-if="row.status === 'draft'" link type="success" @click="onPublish(row._id)">发布</el-button>
          <el-button v-if="row.status === 'published'" link type="warning" @click="onEnd(row._id)">结束</el-button>
          <el-button link type="danger" @click="onDelete(row._id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { getTuanDealList, publishTuanDeal, endTuanDeal, deleteTuanDeal } from '@/api/tuan'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const DEAL_STATUS = { draft: '草稿', published: '进行中', ended: '已结束' }
const DEAL_STATUS_TYPE = { draft: 'info', published: 'success', ended: 'warning' }

function isUnlimited(endTime) {
  if (!endTime) return true
  return new Date(endTime).getFullYear() > 2090
}

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getTuanDealList)

async function onPublish(id) { await ElMessageBox.confirm('确定发布？'); await publishTuanDeal(id); ElMessage.success('已发布'); fetch() }
async function onEnd(id) { await ElMessageBox.confirm('确定结束？'); await endTuanDeal(id); ElMessage.success('已结束'); fetch() }
async function onDelete(id) { await ElMessageBox.confirm('确定删除？', '警告', { type: 'warning' }); await deleteTuanDeal(id); ElMessage.success('已删除'); fetch() }

fetch()
</script>

<style scoped>
.toolbar { margin-bottom: var(--spacing-md); }
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
.deal-info { display: flex; align-items: center; gap: 10px; }
.deal-thumb {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  border: 1px solid var(--border-color);
}
.deal-thumb-placeholder {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  color: var(--text-placeholder);
  font-size: 11px;
  border-radius: var(--radius-sm);
}
.deal-text { flex: 1; min-width: 0; }
.deal-title { font-size: 13px; font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal-sub { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.time-range { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
</style>
