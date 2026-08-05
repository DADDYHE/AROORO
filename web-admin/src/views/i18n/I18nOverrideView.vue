<template>
  <el-card>
    <div class="toolbar">
      <el-input v-model="prefix" placeholder="按 key 前缀过滤" style="width:200px" clearable @keyup.enter="onSearch" @clear="onSearch" />
      <el-select v-model="statusFilter" placeholder="状态" style="width:120px" clearable @change="onSearch">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="disabled" />
      </el-select>
      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button type="success" @click="openEdit()">新增覆盖</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="key" label="Key" min-width="180" show-overflow-tooltip />
      <el-table-column prop="locale" label="语言" width="100" />
      <el-table-column prop="value" label="文案" min-width="260" show-overflow-tooltip />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-switch :model-value="row.status === 'active'" @change="(val) => onToggle(row, val)" />
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" width="170">
        <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" />

    <el-dialog v-model="editVisible" :title="form.overrideId ? '编辑覆盖' : '新增覆盖'" width="520px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="Key" required>
          <el-input v-model="form.key" placeholder="如 home.title" :disabled="!!form.overrideId" />
        </el-form-item>
        <el-form-item label="语言" required>
          <el-select v-model="form.locale" style="width:160px" :disabled="!!form.overrideId">
            <el-option label="简体中文" value="zh-CN" />
            <el-option label="English" value="en-US" />
            <el-option label="日本語" value="ja-JP" />
          </el-select>
        </el-form-item>
        <el-form-item label="文案" required>
          <el-input v-model="form.value" type="textarea" :rows="3" maxlength="2000" show-word-limit />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { listI18nOverrides, upsertI18nOverride, deleteI18nOverride, toggleI18nOverrideStatus } from '@/api/i18n'
import { formatDate } from '@/utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const prefix = ref('')
const statusFilter = ref('')
const list = ref([])
const loading = ref(false)
const total = ref(0)
const pagination = reactive({ page: 1, pageSize: 50 })
const editVisible = ref(false)
const saving = ref(false)
const form = reactive({ overrideId: '', key: '', locale: 'zh-CN', value: '', note: '' })

async function fetch() {
  loading.value = true
  try {
    const params = { page: pagination.page, pageSize: pagination.pageSize }
    if (prefix.value.trim()) { params.prefix = prefix.value.trim() }
    if (statusFilter.value) { params.status = statusFilter.value }
    const res = await listI18nOverrides(params)
    list.value = res.data?.list || []
    total.value = res.data?.total || 0
  } finally {
    loading.value = false
  }
}

function onSearch() {
  pagination.page = 1
  fetch()
}

function onPageChange(page) {
  pagination.page = page
  fetch()
}

function openEdit(row) {
  Object.assign(form, {
    overrideId: row?.overrideId || row?._id || '',
    key: row?.key || '',
    locale: row?.locale || 'zh-CN',
    value: row?.value || '',
    note: row?.note || '',
  })
  editVisible.value = true
}

async function onSave() {
  if (!form.key.trim() || !form.value) {
    ElMessage.warning('请填写 Key 与文案')
    return
  }
  saving.value = true
  try {
    await upsertI18nOverride({
      key: form.key.trim(),
      locale: form.locale,
      value: form.value,
      note: form.note || undefined,
    })
    ElMessage.success('保存成功')
    editVisible.value = false
    fetch()
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function onToggle(row, val) {
  try {
    await toggleI18nOverrideStatus(row._id, val ? 'active' : 'disabled')
    ElMessage.success(val ? '已启用' : '已停用')
    fetch()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除覆盖 ${row.key}（${row.locale}）？`, '警告', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteI18nOverride(row._id)
    ElMessage.success('已删除')
    fetch()
  } catch (e) {
    ElMessage.error(e?.message || '删除失败')
  }
}

onMounted(fetch)
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.pager { margin-top: 16px; justify-content: flex-end; }
</style>
