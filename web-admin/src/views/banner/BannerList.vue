<template>
  <el-card>
    <div class="toolbar"><el-button type="primary" @click="openCreateDialog">新增轮播图</el-button></div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="title" label="标题" width="200" />
      <el-table-column prop="imageUrl" label="图片" width="120">
        <template #default="{ row }"><el-image :src="row.imageUrlPreview || row.imageUrl" style="width:80px;height:40px" fit="cover" :preview-src-list="[row.imageUrlPreview || row.imageUrl]" /></template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }"><el-switch :model-value="row.status === 'active'" @change="(val) => updateBannerStatus(row._id, val ? 'active' : 'inactive')" /></template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEditDialog(row)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row._id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showDialog" :title="isEdit ? '编辑轮播图' : '新增轮播图'" width="520px" destroy-on-close>
      <el-form :model="form" label-width="80px" :rules="rules" ref="formRef">
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" placeholder="请输入轮播图标题" />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="form.subtitle" placeholder="可选" />
        </el-form-item>
        <el-form-item label="图片" prop="imageUrl">
          <el-upload
            class="banner-uploader"
            action="#"
            name="file"
            :show-file-list="false"
            :http-request="customUpload"
            :on-success="onUploadSuccess"
            :on-error="onUploadError"
            :before-upload="beforeUpload"
            accept="image/*"
          >
            <el-image v-if="form.imagePreview" :src="form.imagePreview" fit="cover" class="upload-preview" />
            <el-icon v-else class="upload-icon"><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="form.tag" placeholder="可选，如：热门、新品" />
        </el-form-item>
        <el-form-item label="按钮文字">
          <el-input v-model="form.ctaText" placeholder="可选，如：立即预约" />
        </el-form-item>
        <el-form-item label="跳转类型">
          <el-select v-model="form.actionType" placeholder="请选择" @change="onActionTypeChange">
            <el-option-group label="列表页">
              <el-option label="寄养" value="boarding" />
              <el-option label="上门服务" value="feeding" />
              <el-option label="活动" value="activity" />
              <el-option label="商城" value="mall" />
              <el-option label="宠团团" value="tuan" />
            </el-option-group>
            <el-option-group label="详情页（需填写目标ID）">
              <el-option label="活动详情" value="activity_detail" />
              <el-option label="商品详情" value="product_detail" />
              <el-option label="团购详情" value="tuan_detail" />
            </el-option-group>
            <el-option-group label="功能页">
              <el-option label="我的优惠券" value="coupon" />
              <el-option label="合作伙伴" value="partner" />
            </el-option-group>
            <el-option-group label="其他">
              <el-option label="自定义页面" value="page" />
              <el-option label="无跳转" value="none" />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item label="跳转目标" v-if="showActionTarget">
          <el-input v-model="form.actionTarget" :placeholder="actionTargetPlaceholder" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.statusActive" active-text="启用" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">确定</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { getBannerList, createBanner, updateBanner, updateBannerStatus, deleteBanner } from '@/api/banner'
import { uploadFile } from '@/api/upload'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const list = ref([])
const loading = ref(false)
const showDialog = ref(false)
const isEdit = ref(false)
const editId = ref('')
const submitting = ref(false)
const formRef = ref(null)

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  imageUrl: [{ required: true, message: '请输入图片链接', trigger: 'blur' }],
}

const defaultForm = () => ({
  title: '',
  subtitle: '',
  imageUrl: '',
  imagePreview: '',
  tag: '',
  ctaText: '',
  actionType: 'boarding',
  actionTarget: '',
  statusActive: true,
})

const form = reactive(defaultForm())

const NEED_TARGET_TYPES = ['activity_detail', 'product_detail', 'tuan_detail', 'page']
const TARGET_PLACEHOLDERS = {
  activity_detail: '请输入活动ID',
  product_detail: '请输入商品ID',
  tuan_detail: '请输入团购ID',
  page: '请输入页面路径，如 /subpackages/booking/host-detail?id=xxx',
}

const showActionTarget = computed(() => NEED_TARGET_TYPES.includes(form.actionType))
const actionTargetPlaceholder = computed(() => TARGET_PLACEHOLDERS[form.actionType] || '')

function onActionTypeChange() {
  if (!NEED_TARGET_TYPES.includes(form.actionType)) {
    form.actionTarget = ''
  }
}

function beforeUpload(file) {
  const isImage = file.type.startsWith('image/')
  if (!isImage) ElMessage.error('只能上传图片文件')
  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isLt10M) ElMessage.error('图片大小不能超过10MB')
  return isImage && isLt10M
}

function onUploadSuccess(response) {
  if (response.code === 0) {
    form.imageUrl = response.data.url
    form.imagePreview = response.data.previewUrl || response.data.url
    ElMessage.success('上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

function onUploadError() {
  ElMessage.error('上传失败，请重试')
}

async function customUpload(options) {
  const { file, onSuccess, onError } = options
  try {
    const result = await uploadFile(file, `banners/${Date.now()}_${file.name}`)
    onSuccess({ code: 0, data: result })
  } catch (err) {
    onError(err)
  }
}

function openCreateDialog() {
  isEdit.value = false
  editId.value = ''
  Object.assign(form, defaultForm())
  showDialog.value = true
}

function openEditDialog(row) {
  isEdit.value = true
  editId.value = row._id
  Object.assign(form, {
    title: row.title || '',
    subtitle: row.subtitle || '',
    imageUrl: row.imageUrl || '',
    imagePreview: row.imageUrlPreview || row.imageUrl || '',
    tag: row.tag || '',
    ctaText: row.ctaText || '',
    actionType: row.actionType || 'boarding',
    actionTarget: row.actionTarget || '',
    statusActive: row.status === 'active',
  })
  showDialog.value = true
}

async function onSubmit() {
  if (!formRef.value) return
  await formRef.value.validate()
  submitting.value = true
  try {
    const payload = {
      title: form.title,
      subtitle: form.subtitle,
      imageUrl: form.imageUrl,
      tag: form.tag,
      ctaText: form.ctaText,
      actionType: form.actionType,
      actionTarget: form.actionTarget,
      status: form.statusActive ? 'active' : 'inactive',
    }
    if (isEdit.value) {
      payload.bannerId = editId.value
      await updateBanner(payload)
      ElMessage.success('更新成功')
    } else {
      await createBanner(payload)
      ElMessage.success('创建成功')
    }
    showDialog.value = false
    fetchList()
  } finally {
    submitting.value = false
  }
}

async function fetchList() {
  loading.value = true
  try {
    const res = await getBannerList()
    list.value = res.data?.list || res.data || []
  } finally {
    loading.value = false
  }
}

async function onDelete(id) {
  await ElMessageBox.confirm('确定删除？', '警告', { type: 'warning' })
  await deleteBanner(id)
  ElMessage.success('已删除')
  fetchList()
}

onMounted(fetchList)
</script>

<style scoped>
.toolbar { margin-bottom: var(--spacing-md); }
.banner-uploader :deep(.el-upload) {
  border: 1px dashed var(--border-color-strong);
  border-radius: var(--radius-md);
  cursor: pointer;
  width: 200px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #fafbfc;
  transition: border-color 0.2s;
}
.banner-uploader :deep(.el-upload:hover) { border-color: var(--color-primary); }
.upload-preview { width: 200px; height: 100px; }
.upload-icon { font-size: 28px; color: var(--text-placeholder); }
</style>
