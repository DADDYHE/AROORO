<template>
  <el-card>
    <template #header>
      <div class="card-header">
        <span>商品分类管理</span>
        <el-button type="primary" size="small" @click="onAddRoot"><el-icon><Plus /></el-icon>新增一级分类</el-button>
      </div>
    </template>

    <div class="sort-tip">
      <el-icon><Rank /></el-icon>
      <span>拖动 <b>⋮⋮</b> 手柄可自由调整分类 / 子分类顺序，松手后自动保存</span>
    </div>

    <div v-loading="loading" class="cat-list" ref="rootListEl">
      <div v-for="cat in categories" :key="cat.key" class="cat-item">
        <div class="cat-row">
          <span class="drag-handle" title="拖动排序"><el-icon><Rank /></el-icon></span>
          <span class="cat-label">{{ cat.label }}</span>
          <span class="cat-key">{{ cat.key }}</span>
          <span class="cat-count">{{ cat.count || 0 }} 商品</span>
          <span class="row-actions">
            <el-button link type="primary" @click="onAddSub(cat)">添加子分类</el-button>
            <el-button link type="primary" @click="onEdit(cat)">编辑</el-button>
            <el-button link type="danger" @click="onDelete(cat)">删除</el-button>
          </span>
        </div>
        <div class="sub-list" :data-parent="cat.key">
          <div v-for="sub in cat.children" :key="sub.key" class="sub-row">
            <span class="drag-handle" title="拖动排序"><el-icon><Rank /></el-icon></span>
            <span class="cat-label sub-label">{{ sub.label }}</span>
            <span class="cat-key">{{ sub.key }}</span>
            <span class="cat-count">{{ sub.count || 0 }} 商品</span>
            <span class="row-actions">
              <el-button link type="primary" @click="onEdit(sub)">编辑</el-button>
              <el-button link type="danger" @click="onDelete(sub)">删除</el-button>
            </span>
          </div>
        </div>
      </div>
      <el-empty v-if="!loading && categories.length === 0" description="暂无分类" />
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="450px" destroy-on-close>
      <el-form ref="dialogFormRef" :model="dialogForm" :rules="dialogRules" label-width="80px">
        <el-form-item label="分类名称" prop="label">
          <el-input v-model="dialogForm.label" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="分类Key" prop="key">
          <el-input v-model="dialogForm.key" placeholder="英文标识，如 dogfood" :disabled="isEditDialog" />
        </el-form-item>
        <el-form-item label="排序" v-if="false">
          <!-- 已被拖拽排序取代，保留字段兼容旧数据，不展示 -->
          <el-input-number v-model="dialogForm.sortOrder" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSaveCategory">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, onBeforeUnmount } from 'vue'
import Sortable from 'sortablejs'
import { listCategories, createCategory, updateCategory, deleteCategory, getCategoryStats } from '@/api/product'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Rank } from '@element-plus/icons-vue'

const categories = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const dialogFormRef = ref()
const isEditDialog = ref(false)
const editingRow = ref(null)

const dialogForm = reactive({ label: '', key: '', sortOrder: 0 })
const dialogRules = {
  label: [{ required: true, message: '请输入分类名称', trigger: 'blur' }],
  key: [{ required: true, message: '请输入分类Key', trigger: 'blur' }],
}

const dialogTitle = computed(() => isEditDialog.value ? '编辑分类' : '新增分类')

// ---------- 拖拽排序 ----------
const rootListEl = ref(null)
let rootSortable = null
const subSortables = new Map()

function destroySortables() {
  if (rootSortable) { rootSortable.destroy(); rootSortable = null }
  subSortables.forEach(s => s.destroy())
  subSortables.clear()
}

function setupSortables() {
  destroySortables()
  if (!rootListEl.value) return
  rootSortable = new Sortable(rootListEl.value, {
    draggable: '.cat-item',
    handle: '.drag-handle',
    animation: 150,
    onEnd: onRootDragEnd,
  })
  rootListEl.value.querySelectorAll('.sub-list').forEach(el => {
    const parentKey = el.dataset.parent
    if (!parentKey || subSortables.has(parentKey)) return
    subSortables.set(parentKey, new Sortable(el, {
      handle: '.drag-handle',
      animation: 150,
      onEnd: evt => onSubDragEnd(parentKey, evt),
    }))
  })
}

// 拖拽后还原 DOM，交给 Vue 按 key 重排，避免与虚拟 DOM 冲突
function revertDom(evt) {
  const { item, from, oldIndex } = evt
  if (oldIndex == null) return
  const ref = from.children[oldIndex]
  if (ref && ref !== item) { from.insertBefore(item, ref) } else { from.appendChild(item) }
}

async function onRootDragEnd(evt) {
  const { oldIndex, newIndex } = evt
  if (oldIndex == null || newIndex == null || oldIndex === newIndex) return
  revertDom(evt)
  const arr = [...categories.value]
  const [moved] = arr.splice(oldIndex, 1)
  arr.splice(newIndex, 0, moved)
  categories.value = arr
  try {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].sortOrder !== i) {
        await updateCategory({ categoryId: arr[i]._id, sortOrder: i })
        arr[i].sortOrder = i
      }
    }
    ElMessage.success('排序已保存')
  } catch (e) {
    ElMessage.error(e.message || '排序保存失败')
  } finally {
    loadCategories()
  }
}

async function onSubDragEnd(parentKey, evt) {
  const { oldIndex, newIndex } = evt
  const parent = categories.value.find(c => c.key === parentKey)
  if (!parent || oldIndex == null || newIndex == null || oldIndex === newIndex) return
  revertDom(evt)
  const children = [...(parent.children || [])]
  const [moved] = children.splice(oldIndex, 1)
  children.splice(newIndex, 0, moved)
  parent.children = children
  try {
    await updateCategory({
      categoryId: parent._id,
      subcats: children.map((c, i) => ({ key: c.key, label: c.label, sortOrder: i })),
    })
    ElMessage.success('排序已保存')
  } catch (e) {
    ElMessage.error(e.message || '排序保存失败')
  } finally {
    loadCategories()
  }
}

// ---------- 分类数据 ----------
function buildCategoryTree(rawCategories, statsData) {
  const statsMap = statsData || {}
  return rawCategories.map(cat => ({
    key: cat.key,
    label: cat.label,
    sortOrder: cat.sortOrder || 0,
    _id: cat._id,
    count: statsMap[cat.key] || 0,
    _isSub: false,
    children: (cat.subcats || [])
      .map(sub => ({ key: sub.key, label: sub.label, sortOrder: sub.sortOrder || 0, count: statsMap[sub.key] || 0, _isSub: true, parentKey: cat.key, parent_id: cat._id }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }))
}

async function loadCategories() {
  loading.value = true
  try {
    const [catRes, statsRes] = await Promise.all([
      listCategories(),
      getCategoryStats(),
    ])
    const rawCategories = (catRes.code === 0 ? catRes.data : []) || []
    const statsData = (statsRes.code === 0 ? statsRes.data : {}) || {}
    categories.value = buildCategoryTree(rawCategories, statsData)
  } catch (e) {
    console.error('[CategoryView] loadCategories failed:', e)
    categories.value = []
  } finally {
    loading.value = false
  }
  await nextTick()
  setupSortables()
}

// ---------- 增删改 ----------
function onAddRoot() {
  isEditDialog.value = false
  editingRow.value = null
  Object.assign(dialogForm, { label: '', key: '', sortOrder: categories.value.length })
  dialogVisible.value = true
}

function onAddSub(row) {
  isEditDialog.value = false
  editingRow.value = row
  Object.assign(dialogForm, { label: '', key: '', sortOrder: row.children ? row.children.length : 0 })
  dialogVisible.value = true
}

function onEdit(row) {
  isEditDialog.value = true
  editingRow.value = row
  Object.assign(dialogForm, { label: row.label, key: row.key, sortOrder: row.sortOrder })
  dialogVisible.value = true
}

async function onDelete(row) {
  if (row.count > 0) {
    ElMessage.warning(`该分类下有 ${row.count} 个商品，无法删除`)
    return
  }
  if (row._isSub) {
    const parent = categories.value.find(c => c.key === row.parentKey)
    if (parent && parent.children && parent.children.length <= 1) {
      ElMessage.warning('至少保留一个子分类')
      return
    }
  }
  await ElMessageBox.confirm(`确定删除分类「${row.label}」？`, '警告', { type: 'warning' })
  try {
    if (row._isSub) {
      const parent = categories.value.find(c => c.key === row.parentKey)
      if (parent) {
        const newSubcats = parent.children
          .filter(c => c.key !== row.key)
          .map(c => ({ key: c.key, label: c.label, sortOrder: c.sortOrder || 0 }))
        await updateCategory({ categoryId: parent._id, subcats: newSubcats })
      }
    } else {
      await deleteCategory(row._id, row.key)
    }
    ElMessage.success('删除成功')
    loadCategories()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

async function onSaveCategory() {
  await dialogFormRef.value.validate()
  saving.value = true
  try {
    if (isEditDialog.value) {
      const row = editingRow.value
      if (row._isSub) {
        const parent = categories.value.find(c => c.key === row.parentKey)
        if (parent) {
          const newSubcats = parent.children.map(c => {
            if (c.key === row.key) {
              return { key: row.key, label: dialogForm.label, sortOrder: c.sortOrder || 0 }
            }
            return { key: c.key, label: c.label, sortOrder: c.sortOrder || 0 }
          })
          await updateCategory({ categoryId: parent._id, subcats: newSubcats })
        }
      } else {
        await updateCategory({
          categoryId: row._id,
          label: dialogForm.label,
          sortOrder: row.sortOrder,
        })
      }
      ElMessage.success('更新成功')
    } else {
      if (editingRow.value) {
        const parent = editingRow.value
        const newSubcat = { key: dialogForm.key, label: dialogForm.label, sortOrder: dialogForm.sortOrder }
        const existingSubcats = (parent.children || []).map(c => ({ key: c.key, label: c.label, sortOrder: c.sortOrder || 0 }))
        existingSubcats.push(newSubcat)
        await updateCategory({ categoryId: parent._id, subcats: existingSubcats })
      } else {
        await createCategory({
          key: dialogForm.key,
          label: dialogForm.label,
          sortOrder: dialogForm.sortOrder,
          subcats: [],
        })
      }
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadCategories()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadCategories)
onBeforeUnmount(destroySortables)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-header span {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
}
.sort-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary, #909399);
  margin-bottom: 12px;
}
.cat-list {
  min-height: 120px;
}
.cat-item {
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 6px;
  margin-bottom: 10px;
  background: #fff;
}
.cat-row,
.sub-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}
.cat-row {
  border-bottom: 1px solid var(--border-lighter, #ebeef5);
}
.sub-row {
  padding-left: 38px;
}
.sub-row + .sub-row {
  border-top: 1px dashed var(--border-lighter, #ebeef5);
}
.drag-handle {
  cursor: grab;
  color: #c0c4cc;
  display: flex;
  align-items: center;
  font-size: 16px;
}
.drag-handle:active {
  cursor: grabbing;
}
.cat-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary, #303133);
  min-width: 100px;
}
.sub-label {
  font-weight: 500;
}
.cat-key {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  font-family: monospace;
}
.cat-count {
  font-size: 12px;
  color: var(--text-secondary, #909399);
}
.row-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
/* Sortable 拖拽中的占位样式 */
:deep(.sortable-ghost) {
  opacity: 0.4;
  background: var(--el-color-primary-light-9, #ecf5ff);
}
</style>
