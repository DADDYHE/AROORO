<template>
  <el-card>
    <template #header>
      <div class="card-header">
        <span>商品分类管理</span>
        <el-button type="primary" size="small" @click="onAddRoot"><el-icon><Plus /></el-icon>新增一级分类</el-button>
      </div>
    </template>

    <el-table v-loading="loading" :data="categories" row-key="key" border default-expand-all :tree-props="{ children: 'children' }">
      <el-table-column prop="label" label="分类名称" min-width="200" />
      <el-table-column prop="key" label="分类Key" width="150" />
      <el-table-column label="商品数" width="100">
        <template #default="{ row }">{{ row.count || 0 }}</template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <template v-if="!row._isSub">
            <el-button link type="primary" @click="onAddSub(row)">添加子分类</el-button>
          </template>
          <el-button link type="primary" @click="onEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="450px" destroy-on-close>
      <el-form ref="dialogFormRef" :model="dialogForm" :rules="dialogRules" label-width="80px">
        <el-form-item label="分类名称" prop="label">
          <el-input v-model="dialogForm.label" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="分类Key" prop="key">
          <el-input v-model="dialogForm.key" placeholder="英文标识，如 dogfood" :disabled="isEditDialog" />
        </el-form-item>
        <el-form-item label="排序">
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
import { ref, reactive, computed, onMounted } from 'vue'
import { listCategories, createCategory, updateCategory, deleteCategory, getCategoryStats } from '@/api/product'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

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

function buildCategoryTree(rawCategories, statsData) {
  const statsMap = statsData || {}
  return rawCategories.map(cat => ({
    key: cat.key,
    label: cat.label,
    sortOrder: cat.sortOrder || 0,
    _id: cat._id,
    count: statsMap[cat.key] || 0,
    _isSub: false,
    children: (cat.subcats || []).map(sub => ({
      key: sub.key,
      label: sub.label,
      sortOrder: sub.sortOrder || 0,
      count: statsMap[sub.key] || 0,
      _isSub: true,
      parentKey: cat.key,
      parent_id: cat._id,
    })),
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
}

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
              return { key: row.key, label: dialogForm.label, sortOrder: dialogForm.sortOrder }
            }
            return { key: c.key, label: c.label, sortOrder: c.sortOrder || 0 }
          })
          await updateCategory({ categoryId: parent._id, subcats: newSubcats })
        }
      } else {
        await updateCategory({
          categoryId: row._id,
          label: dialogForm.label,
          sortOrder: dialogForm.sortOrder,
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
</style>
