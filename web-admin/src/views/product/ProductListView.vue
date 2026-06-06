<template>
  <div class="product-list">
    <div class="stat-cards">
      <el-card shadow="never" class="stat-card" v-for="s in statCards" :key="s.key" @click="onStatClick(s.key)">
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </el-card>
    </div>

    <el-card>
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="在售" name="on_sale" />
        <el-tab-pane label="下架" name="off_sale" />
        <el-tab-pane label="草稿" name="draft" />
      </el-tabs>

      <div class="toolbar">
        <div class="toolbar-left">
          <el-input v-model="keyword" placeholder="搜索商品名称/ID" style="width:220px" clearable @clear="onSearch" @keyup.enter="onSearch">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-cascader v-model="categoryFilter" :options="CATEGORY_CASCADER_OPTIONS" :props="{ checkStrictly: true }" placeholder="选择分类" clearable style="width:200px" @change="onSearch" />
          <el-button type="primary" @click="onSearch">搜索</el-button>
          <el-button @click="onResetFilter">重置</el-button>
        </div>
        <div class="toolbar-right">
          <el-button type="primary" @click="$router.push('/product/create')">
            <el-icon><Plus /></el-icon>新增商品
          </el-button>
        </div>
      </div>

      <div class="batch-bar" v-if="selectedIds.length > 0">
        <span class="batch-info">已选 {{ selectedIds.length }} 件商品</span>
        <el-button size="small" type="success" @click="onBatch('on_sale')">批量上架</el-button>
        <el-button size="small" type="warning" @click="onBatch('off_sale')">批量下架</el-button>
        <el-button size="small" type="primary" @click="onBatch('feature')">批量推荐</el-button>
        <el-button size="small" type="danger" @click="onBatch('delete')">批量删除</el-button>
      </div>

      <el-table :data="list" v-loading="loading" stripe @selection-change="onSelectionChange" row-key="_id">
        <el-table-column type="selection" width="45" />
        <el-table-column label="商品" min-width="280">
          <template #default="{ row }">
            <div class="product-info">
              <el-image class="product-thumb" :src="row.coverImagePreview || row.coverUrlPreview || row.coverImage || row.coverUrl" fit="cover" lazy>
                <template #error><div class="thumb-placeholder">无图</div></template>
              </el-image>
              <div class="product-text">
                <div class="product-name">{{ row.name }}</div>
                <div class="product-sub" v-if="row.subTitle">{{ row.subTitle }}</div>
                <div class="product-tags" v-if="row.tags && row.tags.length">
                  <el-tag v-for="t in row.tags" :key="t" size="small" type="danger" effect="plain" class="product-tag">{{ t }}</el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="120">
          <template #default="{ row }">{{ getCategoryLabel(row.category, row.categoryId) }}</template>
        </el-table-column>
        <el-table-column label="价格" width="140">
          <template #default="{ row }">
            <span class="price-text">{{ formatPrice(row) }}</span>
            <span class="original-price" v-if="row.originalPrice && row.originalPrice > row.price">¥{{ Number(row.originalPrice).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="stock" label="库存" width="80" />
        <el-table-column prop="soldCount" label="销量" width="80" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="PRODUCT_STATUS[row.status]?.tagType || 'info'" size="small">{{ PRODUCT_STATUS[row.status]?.label || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="推荐" width="70">
          <template #default="{ row }">
            <el-switch :model-value="row.isFeatured" size="small" @change="onToggleFeatured(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="70" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="$router.push(`/product/${row._id}/edit`)">编辑</el-button>
            <el-button link type="primary" @click="onClone(row._id)">复制</el-button>
            <el-button link :type="row.status === 'on_sale' ? 'warning' : 'success'" @click="onToggleStatus(row)">{{ row.status === 'on_sale' ? '下架' : '上架' }}</el-button>
            <el-button link type="danger" @click="onDelete(row._id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getProductList, deleteProduct, cloneProduct, batchUpdateProducts, getProductStats } from '@/api/product'
import { usePagination } from '@/composables/usePagination'
import { PRODUCT_STATUS, CATEGORY_CASCADER_OPTIONS, getCategoryLabel, formatPrice } from '@/constants/product'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'

const keyword = ref('')
const activeTab = ref('all')
const categoryFilter = ref([])
const selectedIds = ref([])
const stats = ref({ total: 0, on_sale: 0, off_sale: 0, draft: 0 })

const statCards = ref([
  { key: 'all', label: '商品总数', value: 0 },
  { key: 'on_sale', label: '在售', value: 0 },
  { key: 'off_sale', label: '下架', value: 0 },
  { key: 'draft', label: '草稿', value: 0 },
])

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getProductList)

function buildParams() {
  const params = { keyword: keyword.value }
  if (activeTab.value !== 'all') params.status = activeTab.value
  if (categoryFilter.value && categoryFilter.value.length > 0) {
    params.category = categoryFilter.value[0]
    if (categoryFilter.value.length > 1) params.categoryId = categoryFilter.value[1]
  }
  return params
}

function onSearch() { fetch(buildParams()) }
function onResetFilter() { keyword.value = ''; categoryFilter.value = []; activeTab.value = 'all'; onSearch() }
function onTabChange() { onSearch() }
function onStatClick(key) { activeTab.value = key; onSearch() }

function onSelectionChange(rows) { selectedIds.value = rows.map(r => r._id) }

async function onBatch(action) {
  if (selectedIds.value.length === 0) return
  const actionLabel = { on_sale: '上架', off_sale: '下架', feature: '推荐', delete: '删除' }[action]
  await ElMessageBox.confirm(`确定批量${actionLabel} ${selectedIds.value.length} 件商品？`, '批量操作')
  await batchUpdateProducts(selectedIds.value, action)
  ElMessage.success(`批量${actionLabel}成功`)
  selectedIds.value = []
  onSearch()
  loadStats()
}

async function onToggleStatus(row) {
  const newStatus = row.status === 'on_sale' ? 'off_sale' : 'on_sale'
  const label = newStatus === 'on_sale' ? '上架' : '下架'
  await ElMessageBox.confirm(`确定${label}「${row.name}」？`, label)
  await batchUpdateProducts([row._id], newStatus)
  ElMessage.success(`${label}成功`)
  onSearch()
  loadStats()
}

async function onToggleFeatured(row) {
  const action = row.isFeatured ? 'unfeature' : 'feature'
  await batchUpdateProducts([row._id], action)
  ElMessage.success(row.isFeatured ? '已取消推荐' : '已设为推荐')
  onSearch()
}

async function onClone(id) {
  await ElMessageBox.confirm('确定复制该商品？')
  await cloneProduct(id)
  ElMessage.success('复制成功')
  onSearch()
}

async function onDelete(id) {
  await ElMessageBox.confirm('确定删除该商品？此操作不可恢复。', '警告', { type: 'warning' })
  await deleteProduct(id)
  ElMessage.success('删除成功')
  onSearch()
  loadStats()
}

async function loadStats() {
  try {
    const res = await getProductStats()
    if (res.data) {
      stats.value = res.data
      statCards.value[0].value = res.data.total || 0
      statCards.value[1].value = res.data.on_sale || 0
      statCards.value[2].value = res.data.off_sale || 0
      statCards.value[3].value = res.data.draft || 0
    }
  } catch (e) { /* ignore */ }
}

onMounted(() => { onSearch(); loadStats() })
</script>

<style scoped>
.product-list { display: flex; flex-direction: column; gap: var(--spacing-md); }
.stat-cards { display: flex; gap: 12px; }
.stat-card {
  cursor: pointer;
  flex: 1;
  text-align: center;
  border: none;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: all 0.25s ease;
  overflow: hidden;
}
.stat-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
.stat-card :deep(.el-card__body) { padding: var(--spacing-md); }
.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1.2;
}
.stat-label {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
  letter-spacing: 0.5px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}
.toolbar-left { display: flex; gap: 10px; align-items: center; }
.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: var(--spacing-md);
  background: var(--color-primary-light);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(59, 184, 176, 0.15);
}
.batch-info { font-size: 13px; color: var(--color-primary); margin-right: 8px; font-weight: 500; }
.product-info { display: flex; align-items: center; gap: 10px; }
.product-thumb {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  border: 1px solid var(--border-color);
}
.thumb-placeholder {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fb;
  color: var(--text-placeholder);
  font-size: 11px;
  border-radius: var(--radius-sm);
}
.product-text { flex: 1; min-width: 0; }
.product-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.product-sub {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.product-tags { display: flex; gap: 4px; margin-top: 4px; }
.product-tag { font-size: 11px; }
.price-text { color: var(--color-danger); font-weight: 600; font-size: 14px; }
.original-price {
  font-size: 12px;
  color: var(--text-placeholder);
  text-decoration: line-through;
  margin-left: 4px;
}
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
</style>
