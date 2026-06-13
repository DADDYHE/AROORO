<template>
  <el-card>
    <div class="toolbar">
      <slot name="toolbar-left" />
      <el-switch v-model="autoRefresh" active-text="自动刷新" style="margin-left:auto" />
    </div>
    <el-table :data="list" v-loading="loading" stripe>
      <slot />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="onDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
  </el-card>
</template>

<script setup>
import { watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePagination } from '@/composables/usePagination'
import { useAutoRefresh } from '@/composables/useAutoRefresh'

const props = defineProps({
  fetchFn: { type: Function, required: true },
  detailRoute: { type: String, default: '' },
})

const emit = defineEmits(['detail'])

const router = useRouter()
const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(props.fetchFn)

const { autoRefresh, startAutoRefresh, stopAutoRefresh } = useAutoRefresh(() => {
  fetch()
}, 30000)

function onSearch(params = {}) {
  fetch(params)
}

function onDetail(row) {
  if (props.detailRoute) {
    router.push(`${props.detailRoute}/${row._id}`)
  }
  emit('detail', row)
}

onMounted(() => {
  onSearch()
  startAutoRefresh()
})

defineExpose({ onSearch, fetch })
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: var(--spacing-md); align-items: center; }
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
</style>
