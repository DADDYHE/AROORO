<template>
  <div class="product-list">
    <div class="stat-cards">
      <el-card shadow="never" class="stat-card" v-for="s in statCards" :key="s.key" @click="onStatClick(s.key)">
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </el-card>
    </div>

    <div class="list-layout">
      <aside class="category-panel">
        <div class="panel-head">
          <span>商品分类</span>
          <el-button link type="primary" size="small" @click="$router.push('/product/category')">管理</el-button>
        </div>
        <div class="cat-scroll">
          <div class="cat-node" :class="{ active: activeCatKey === 'all' }" @click="onSelectCategory({ key: 'all', label: '全部商品' })">
            <span class="cat-name">全部商品</span>
            <span class="cat-count">{{ statCards[0].value }}</span>
          </div>
          <template v-for="cat in categoryTree" :key="cat.key">
            <div class="cat-node" :class="{ active: activeCatKey === cat.key }" @click="onSelectCategory(cat)">
              <span class="cat-name">{{ cat.label }}</span>
              <span class="cat-count">{{ cat.count }}</span>
            </div>
            <div
              v-for="sub in cat.children"
              :key="sub.key"
              class="cat-node sub"
              :class="{ active: activeCatKey === sub.key }"
              @click="onSelectCategory(sub)"
            >
              <span class="cat-name">{{ sub.label }}</span>
              <span class="cat-count">{{ sub.count }}</span>
            </div>
          </template>
        </div>
      </aside>

      <el-card class="list-main">
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
            <el-button type="primary" @click="onSearch">搜索</el-button>
            <el-button @click="onResetFilter">重置</el-button>
            <span class="current-cat">当前：{{ activeCatLabel }}</span>
          </div>
          <div class="toolbar-right">
            <el-button type="primary" @click="$router.push('/product/create')">
              <el-icon><Plus /></el-icon>新增商品
            </el-button>
          </div>
        </div>

        <div class="filter-bar">
          <div class="filter-group">
            <span class="filter-label">价格</span>
            <el-input-number v-model="priceRange[0]" :min="0" :controls="false" placeholder="最低价" style="width:110px" @keyup.enter="onSearch" />
            <span class="filter-sep">-</span>
            <el-input-number v-model="priceRange[1]" :min="0" :controls="false" placeholder="最高价" style="width:110px" @keyup.enter="onSearch" />
          </div>
          <div class="filter-group">
            <span class="filter-label">库存</span>
            <el-input-number v-model="stockRange[0]" :min="0" :controls="false" placeholder="最低库存" style="width:110px" @keyup.enter="onSearch" />
            <span class="filter-sep">-</span>
            <el-input-number v-model="stockRange[1]" :min="0" :controls="false" placeholder="最高库存" style="width:110px" @keyup.enter="onSearch" />
          </div>
          <div class="filter-group">
            <span class="filter-label">推荐</span>
            <el-select v-model="featuredFilter" style="width:110px" @change="onSearch">
              <el-option label="全部" value="all" />
              <el-option label="推荐" value="featured" />
              <el-option label="未推荐" value="not_featured" />
            </el-select>
          </div>
          <div class="filter-group">
            <span class="filter-label">标签</span>
            <el-input v-model="tagFilter" placeholder="标签关键字" clearable style="width:140px" @clear="onSearch" @keyup.enter="onSearch" />
          </div>
          <div class="filter-group">
            <span class="filter-label">排序</span>
            <el-select v-model="sortBy" style="width:120px" @change="onSearch">
              <el-option label="默认排序" value="sortOrder" />
              <el-option label="创建时间" value="createdAt" />
              <el-option label="价格" value="price" />
              <el-option label="销量" value="soldCount" />
            </el-select>
            <el-select v-model="sortOrder" style="width:100px" @change="onSearch">
              <el-option label="降序" value="desc" />
              <el-option label="升序" value="asc" />
            </el-select>
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
            <template #default="{ row }">{{ row.categoryName || getCategoryLabel(row.category, row.categoryId) }}</template>
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getProductList, deleteProduct, cloneProduct, batchUpdateProducts, getProductStats, getCategoryStats, listCategories } from '@/api/product'
import { usePagination } from '@/composables/usePagination'
import { PRODUCT_STATUS, CATEGORY_CASCADER_OPTIONS, getCategoryLabel, formatPrice } from '@/constants/product'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'

const keyword = ref('')
const activeTab = ref('all')
const selectedIds = ref([])
const stats = ref({ total: 0, on_sale: 0, off_sale: 0, draft: 0 })
// 高级筛选：价格/库存区间、推荐、标签、排序
const priceRange = ref([null, null])
const stockRange = ref([null, null])
const featuredFilter = ref('all')
const tagFilter = ref('')
const sortBy = ref('sortOrder')
const sortOrder = ref('desc')
// 左侧分类树：activeCatKey 为当前选中分类 key（'all' 表示全部），activeCatParentKey 为空表示选中的是一级分类
const activeCatKey = ref('all')
const activeCatParentKey = ref('')
const activeCatLabel = ref('全部商品')
// 分类树数据源：优先使用后端动态分类（与分类管理/小程序保持一致），失败时回退静态配置
const categoryTree = ref([])

const statCards = ref([
  { key: 'all', label: '商品总数', value: 0 },
  { key: 'on_sale', label: '在售', value: 0 },
  { key: 'off_sale', label: '下架', value: 0 },
  { key: 'draft', label: '草稿', value: 0 },
])

const { list, loading, total, pagination, fetch } = usePagination(getProductList)

function buildParams() {
  const params = { keyword: keyword.value }
  if (activeTab.value !== 'all') params.status = activeTab.value
  // 分类树筛选：子分类同时带父级 key（商品 category 恒为一级 key，categoryId 仅在挂子分类时有）
  if (activeCatKey.value !== 'all') {
    params.category = activeCatParentKey.value || activeCatKey.value
    if (activeCatParentKey.value) params.categoryId = activeCatKey.value
  }
  const [minPrice, maxPrice] = priceRange.value
  if (minPrice != null && minPrice !== '') params.minPrice = Number(minPrice)
  if (maxPrice != null && maxPrice !== '') params.maxPrice = Number(maxPrice)
  const [minStock, maxStock] = stockRange.value
  if (minStock != null && minStock !== '') params.minStock = Number(minStock)
  if (maxStock != null && maxStock !== '') params.maxStock = Number(maxStock)
  if (featuredFilter.value !== 'all') params.isFeatured = featuredFilter.value === 'featured'
  const tag = tagFilter.value.trim()
  if (tag) params.tags = [tag]
  params.sortBy = sortBy.value
  params.sortOrder = sortOrder.value
  return params
}

function onSearch() { fetch(buildParams()) }
// 分页切换/改每页条数必须带上筛选条件，否则筛选会被清掉
function onPageChange(page) { pagination.page = page; fetch(buildParams()) }
function onSizeChange(size) { pagination.pageSize = size; pagination.page = 1; fetch(buildParams()) }
function onResetFilter() {
  keyword.value = ''
  activeTab.value = 'all'
  priceRange.value = [null, null]
  stockRange.value = [null, null]
  featuredFilter.value = 'all'
  tagFilter.value = ''
  sortBy.value = 'sortOrder'
  sortOrder.value = 'desc'
  // 重置不回到「全部商品」，保留当前分类，避免在某个分类下管理时被跳走
  onSearch()
}

function onSelectCategory(cat) {
  activeCatKey.value = cat.key
  activeCatParentKey.value = cat.parentKey || ''
  activeCatLabel.value = cat.label
  pagination.page = 1
  fetch(buildParams())
}
function onTabChange() { onSearch() }
function onStatClick(key) { activeTab.value = key; onSearch() }

function onSelectionChange(rows) { selectedIds.value = rows.map(r => r._id) }

async function onBatch(action) {
  if (selectedIds.value.length === 0) return
  // 映射前端操作名到后端操作名
  const actionMap = {
    on_sale: 'on_shelf',
    off_sale: 'off_shelf',
    feature: 'set_featured',
    unfeature: 'unset_featured',
    delete: 'delete',
  }
  const backendAction = actionMap[action] || action
  const actionLabel = { on_sale: '上架', off_sale: '下架', feature: '推荐', delete: '删除' }[action]
  await ElMessageBox.confirm(`确定批量${actionLabel} ${selectedIds.value.length} 件商品？`, '批量操作')
  await batchUpdateProducts(selectedIds.value, backendAction)
  ElMessage.success(`批量${actionLabel}成功`)
  selectedIds.value = []
  onSearch()
  loadStats()
}

async function onToggleStatus(row) {
  const newStatus = row.status === 'on_sale' ? 'off_shelf' : 'on_shelf'
  const label = newStatus === 'on_shelf' ? '上架' : '下架'
  await ElMessageBox.confirm(`确定${label}「${row.name}」？`, label)
  await batchUpdateProducts([row._id], newStatus)
  ElMessage.success(`${label}成功`)
  onSearch()
  loadStats()
}

async function onToggleFeatured(row) {
  const action = row.isFeatured ? 'unset_featured' : 'set_featured'
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
  // 统计刷新时同步左侧分类商品数（增删改/上下架后计数才准）
  loadCategoryTree()
}

// 左侧分类树：分类结构来自 listCategories，商品数来自 getCategoryStats
// （一级分类计数包含其所有子分类，子分类计数只算挂在该子类的商品）
async function loadCategoryTree() {
  try {
    const [catRes, statsRes] = await Promise.all([listCategories(), getCategoryStats()])
    const raw = (catRes.code === 0 ? catRes.data : []) || []
    const statsData = (statsRes.code === 0 ? statsRes.data : {}) || {}
    if (raw.length > 0) {
      categoryTree.value = raw.map(cat => ({
        key: cat.key,
        label: cat.label,
        count: statsData[cat.key] || 0,
        children: (cat.subcats || []).map(sub => ({
          key: sub.key,
          label: sub.label,
          parentKey: cat.key,
          count: statsData[sub.key] || 0,
        })),
      }))
      return
    }
    // 动态分类为空/拉取失败时回退静态配置（无商品数）
    categoryTree.value = CATEGORY_CASCADER_OPTIONS.map(c => ({
      key: c.value,
      label: c.label,
      count: 0,
      children: (c.children || []).map(s => ({ key: s.value, label: s.label, parentKey: c.value, count: 0 })),
    }))
  } catch (e) {
    categoryTree.value = []
  }
}

onMounted(() => { loadCategoryTree(); onSearch(); loadStats() })
</script>

<style scoped>
.product-list { display: flex; flex-direction: column; gap: var(--spacing-md); }
.list-layout { display: flex; gap: var(--spacing-md); align-items: flex-start; }
.category-panel {
  width: 220px;
  flex-shrink: 0;
  background: #fff;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.cat-scroll { max-height: 620px; overflow-y: auto; padding: 6px 0; }
.cat-node {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  border-left: 3px solid transparent;
  transition: background 0.2s ease;
}
.cat-node:hover { background: var(--color-primary-light); }
.cat-node.active {
  background: var(--color-primary-light);
  border-left-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}
.cat-node.sub { padding-left: 28px; font-size: 12px; color: var(--text-secondary, #606266); }
.cat-node.sub.active { color: var(--color-primary); }
.cat-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-count { font-size: 12px; color: var(--text-placeholder); flex-shrink: 0; }
.cat-node.active .cat-count { color: var(--color-primary); }
.list-main { flex: 1; min-width: 0; }
.current-cat {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: 4px;
}
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
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-bottom: var(--spacing-md);
  padding: 10px 14px;
  background: var(--color-primary-light);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(59, 184, 176, 0.15);
}
.filter-group { display: flex; align-items: center; gap: 6px; }
.filter-label { font-size: 12px; color: var(--text-tertiary); flex-shrink: 0; }
.filter-sep { color: var(--text-placeholder); }
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
