<template>
  <el-card>
    <el-page-header @back="$router.back()" :title="'商品列表'" :content="isEdit ? '编辑商品' : '创建商品'" />
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" style="max-width:800px;margin-top:20px">

      <el-divider content-position="left">基础信息</el-divider>
      <el-form-item label="商品名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入商品名称" maxlength="60" show-word-limit />
      </el-form-item>
      <el-form-item label="副标题">
        <el-input v-model="form.subTitle" placeholder="请输入副标题" maxlength="120" show-word-limit />
      </el-form-item>
      <el-form-item label="商品分类" prop="category">
        <el-cascader v-model="categoryValue" :options="categoryCascaderOptions" :props="{ checkStrictly: true }" placeholder="选择分类" style="width:100%" @change="onCategoryChange" />
      </el-form-item>
      <el-form-item label="商品标签">
        <el-checkbox-group v-model="form.tags">
          <el-checkbox v-for="t in PRODUCT_TAGS" :key="t.value" :label="t.value">{{ t.label }}</el-checkbox>
        </el-checkbox-group>
      </el-form-item>
      <el-form-item label="排序权重">
        <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
        <span class="form-tip">数值越大越靠前</span>
      </el-form-item>

      <el-divider content-position="left">价格库存</el-divider>
      <el-form-item label="规格类型">
        <el-radio-group v-model="form.skuType" @change="onSkuTypeChange">
          <el-radio label="single">单规格</el-radio>
          <el-radio label="multi">多规格</el-radio>
        </el-radio-group>
      </el-form-item>

      <template v-if="form.skuType === 'single'">
        <el-form-item label="售价" prop="price">
          <el-input-number v-model="form.price" :min="0" :precision="2" :step="1" />
          <span class="form-tip">元</span>
        </el-form-item>
        <el-form-item label="原价">
          <el-input-number v-model="form.originalPrice" :min="0" :precision="2" :step="1" />
          <span class="form-tip">划线价，可选</span>
        </el-form-item>
        <el-form-item label="库存" prop="stock">
          <el-input-number v-model="form.stock" :min="0" />
        </el-form-item>
      </template>

      <template v-if="form.skuType === 'multi'">
        <el-form-item label="销售规格">
          <div class="spec-section">
            <div v-for="(group, gi) in form.specGroups" :key="gi" class="spec-group">
              <div class="spec-group-header">
                <span class="spec-group-label">规格{{ gi + 1 }}</span>
                <el-input v-model="group.name" placeholder="规格名称（如颜色、尺码）" style="width:180px" />
                <el-button type="danger" link @click="removeSpecGroup(gi)"><el-icon><Delete /></el-icon>删除规格</el-button>
              </div>
              <div class="spec-values">
                <el-tag v-for="(val, vi) in group.values" :key="vi" closable @close="removeSpecValue(gi, vi)" class="spec-val-tag" type="info">{{ val }}</el-tag>
                <el-input v-model="group._input" placeholder="输入规格值后回车" size="small" style="width:140px" @keyup.enter="addSpecValue(gi)" />
                <el-button size="small" type="primary" plain @click="addSpecValue(gi)">添加</el-button>
              </div>
            </div>
            <el-button v-if="form.specGroups.length < 3" type="primary" plain @click="addSpecGroup"><el-icon><Plus /></el-icon>添加规格项</el-button>
            <span v-else class="form-tip">最多3个规格项</span>
          </div>
        </el-form-item>

        <el-form-item v-if="form.skus.length > 0" label="SKU设置">
          <div class="sku-section">
            <div class="sku-batch-bar">
              <span class="batch-label">批量设置：</span>
              <el-input-number v-model="batchPrice" :min="0" :precision="2" size="small" placeholder="售价" style="width:120px" />
              <el-input-number v-model="batchStock" :min="0" size="small" placeholder="库存" style="width:120px" />
              <el-button size="small" type="primary" @click="applyBatch">应用到全部</el-button>
              <span v-if="priceRange" class="price-range">价格区间：{{ priceRange }} | 总库存：{{ totalStock }}</span>
            </div>
            <el-table :data="form.skus" border size="small" style="width:100%;margin-top:10px">
              <el-table-column v-for="(group, gi) in validSpecGroups" :key="gi" :label="group.name" min-width="100">
                <template #default="{ row }">{{ row.specIds[group.name] }}</template>
              </el-table-column>
              <el-table-column width="80" align="center">
                <template #header><span class="required-star">*</span>图片</template>
                <template #default="{ row, $index }">
                  <el-upload class="sku-img-uploader" :action="uploadUrl" :headers="uploadHeaders" :show-file-list="false" :on-success="(res) => onSkuImgSuccess(res, $index)" :before-upload="beforeUpload" accept="image/*">
                    <el-image v-if="row.imagePreview || row.image" :src="row.imagePreview || row.image" fit="cover" class="sku-img-preview" />
                    <el-icon v-else class="sku-img-icon"><Plus /></el-icon>
                  </el-upload>
                </template>
              </el-table-column>
              <el-table-column width="150">
                <template #header><span class="required-star">*</span>售价</template>
                <template #default="{ row }">
                  <el-input-number v-model="row.price" :min="0" :precision="2" size="small" style="width:120px" />
                </template>
              </el-table-column>
              <el-table-column label="原价" width="150">
                <template #default="{ row }">
                  <el-input-number v-model="row.originalPrice" :min="0" :precision="2" size="small" style="width:120px" />
                </template>
              </el-table-column>
              <el-table-column width="130">
                <template #header><span class="required-star">*</span>库存</template>
                <template #default="{ row }">
                  <el-input-number v-model="row.stock" :min="0" size="small" style="width:100px" />
                </template>
              </el-table-column>
              <el-table-column label="SKU编码" width="130">
                <template #default="{ row }">
                  <el-input v-model="row.skuCode" size="small" placeholder="可选" />
                </template>
              </el-table-column>
              <el-table-column label="启用" width="60" align="center">
                <template #default="{ row }">
                  <el-switch v-model="row.enabled" size="small" />
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-form-item>
        <el-form-item v-else label="SKU设置">
          <div class="sku-empty">请先添加规格项和规格值，系统将自动生成SKU组合</div>
        </el-form-item>
      </template>

      <el-divider content-position="left">图片管理</el-divider>
      <el-form-item label="封面图" prop="coverImage">
        <el-upload class="cover-uploader" :action="uploadUrl" :headers="uploadHeaders" :show-file-list="false" :on-success="onCoverSuccess" :before-upload="beforeUpload" accept="image/*">
          <el-image v-if="form.coverImagePreview" :src="form.coverImagePreview" fit="cover" class="cover-preview" />
          <el-icon v-else class="cover-uploader-icon"><Plus /></el-icon>
        </el-upload>
      </el-form-item>
      <el-form-item label="轮播图">
        <el-upload :action="uploadUrl" :headers="uploadHeaders" :file-list="bannerFileList" list-type="picture-card" :limit="5" :on-success="onBannerSuccess" :on-remove="onBannerRemove" :before-upload="beforeUpload" accept="image/*">
          <el-icon><Plus /></el-icon>
        </el-upload>
        <div class="form-tip">最多5张</div>
      </el-form-item>
      <el-form-item label="详情图">
        <el-upload :action="uploadUrl" :headers="uploadHeaders" :file-list="detailFileList" list-type="picture-card" :limit="9" :on-success="onDetailSuccess" :on-remove="onDetailRemove" :before-upload="beforeUpload" accept="image/*">
          <el-icon><Plus /></el-icon>
        </el-upload>
        <div class="form-tip">最多9张</div>
      </el-form-item>

      <el-divider content-position="left">商品描述</el-divider>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="5" maxlength="2000" show-word-limit placeholder="请输入商品描述" />
      </el-form-item>

      <el-divider content-position="left">发布设置</el-divider>
      <el-form-item label="发布状态">
        <el-radio-group v-model="form.status">
          <el-radio label="on_sale">立即上架</el-radio>
          <el-radio label="draft">放入草稿</el-radio>
          <el-radio label="off_sale">暂不上架</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSave">保存商品</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getProductDetail, createProduct, updateProduct, listCategories } from '@/api/product'
import { PRODUCT_TAGS } from '@/constants/product'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const formRef = ref()
const saving = ref(false)
const isEdit = computed(() => !!route.params.id)

const authStore = useAuthStore()
const uploadUrl = '/api/upload'
const uploadHeaders = computed(() => ({ Authorization: `Bearer ${authStore.token}` }))

const categoryValue = ref([])
const categoryCascaderOptions = ref([])
const batchPrice = ref(undefined)
const batchStock = ref(undefined)

async function loadCategoryOptions() {
  try {
    const res = await listCategories()
    if (res.code === 0 && res.data) {
      categoryCascaderOptions.value = res.data.map(cat => ({
        value: cat.key,
        label: cat.label,
        children: (cat.subcats || []).map(sub => ({
          value: sub.key,
          label: sub.label,
        })),
      }))
    }
  } catch (e) {
    console.error('[ProductEditView] loadCategoryOptions failed:', e)
  }
}

const form = reactive({
  name: '',
  subTitle: '',
  category: '',
  categoryId: '',
  categoryName: '',
  tags: [],
  sortOrder: 0,
  skuType: 'single',
  price: 0,
  originalPrice: 0,
  stock: 0,
  specGroups: [],
  skus: [],
  coverImage: '',
  coverImagePreview: '',
  images: [],
  imagePreviews: [],
  detailImages: [],
  detailImagePreviews: [],
  description: '',
  status: 'on_sale',
})

const rules = {
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择商品分类', trigger: 'change' }],
  coverImage: [{ required: true, message: '请上传封面图', trigger: 'change' }],
  price: [{ required: true, message: '请输入售价', trigger: 'blur' }],
  stock: [{ required: true, message: '请输入库存', trigger: 'blur' }],
}

const bannerFileList = computed(() => form.imagePreviews.map((url, i) => ({ name: `banner-${i}`, url, uid: i })))
const detailFileList = computed(() => form.detailImagePreviews.map((url, i) => ({ name: `detail-${i}`, url, uid: i })))

const validSpecGroups = computed(() => form.specGroups.filter(g => g.name && g.values.length > 0))

const priceRange = computed(() => {
  if (form.skuType !== 'multi' || form.skus.length === 0) return ''
  const prices = form.skus.filter(s => s.enabled).map(s => s.price).filter(p => p > 0)
  if (prices.length === 0) return ''
  const min = Math.min(...prices).toFixed(2)
  const max = Math.max(...prices).toFixed(2)
  return min === max ? `¥${min}` : `¥${min} ~ ¥${max}`
})

const totalStock = computed(() => {
  if (form.skuType !== 'multi') return 0
  return form.skus.filter(s => s.enabled).reduce((sum, s) => sum + (s.stock || 0), 0)
})

function onCategoryChange(val) {
  if (val && val.length > 0) {
    form.category = val[0]
    form.categoryId = val.length > 1 ? val[1] : ''
    const cat = categoryCascaderOptions.value.find(c => c.value === val[0])
    const catLabel = cat ? cat.label : val[0]
    const sub = cat ? cat.children?.find(s => s.value === val[1]) : null
    form.categoryName = sub ? `${catLabel} / ${sub.label}` : catLabel
  } else {
    form.category = ''; form.categoryId = ''; form.categoryName = ''
  }
}

function onSkuTypeChange() {
  if (form.skuType === 'single') {
    form.specGroups = []
    form.skus = []
  }
}

watch(validSpecGroups, () => {
  if (form.skuType === 'multi') generateSkus()
}, { deep: true })

function addSpecGroup() {
  form.specGroups.push({ name: '', values: [], _input: '' })
}

function removeSpecGroup(gi) {
  form.specGroups.splice(gi, 1)
  generateSkus()
}

function addSpecValue(gi) {
  const val = form.specGroups[gi]._input?.trim()
  if (!val) return
  if (form.specGroups[gi].values.includes(val)) { ElMessage.warning('规格值已存在'); return }
  form.specGroups[gi].values.push(val)
  form.specGroups[gi]._input = ''
  generateSkus()
}

function removeSpecValue(gi, vi) {
  form.specGroups[gi].values.splice(vi, 1)
  generateSkus()
}

function generateSkus() {
  const validGroups = validSpecGroups.value
  if (validGroups.length === 0) { form.skus = []; return }

  const oldSkuMap = {}
  form.skus.forEach(s => { oldSkuMap[s.specText] = s })

  const combos = cartesianProduct(validGroups.map(g => g.values))
  form.skus = combos.map(combo => {
    const specText = combo.join(' / ')
    const specIds = {}
    validGroups.forEach((g, i) => { specIds[g.name] = combo[i] })
    const existing = oldSkuMap[specText]
    return {
      skuId: existing?.skuId || `sku_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      specIds,
      specText,
      image: existing?.image || '',
      imagePreview: existing?.imagePreview || existing?.image || '',
      price: existing?.price ?? 0,
      originalPrice: existing?.originalPrice ?? 0,
      stock: existing?.stock ?? 0,
      soldCount: existing?.soldCount || 0,
      skuCode: existing?.skuCode || '',
      enabled: existing?.enabled !== undefined ? existing.enabled : true,
    }
  })
}

function applyBatch() {
  if (batchPrice.value === undefined && batchStock.value === undefined) {
    ElMessage.warning('请先设置批量价格或库存')
    return
  }
  form.skus.forEach(sku => {
    if (batchPrice.value !== undefined) sku.price = batchPrice.value
    if (batchStock.value !== undefined) sku.stock = batchStock.value
  })
  ElMessage.success('批量设置成功')
}

function cartesianProduct(arrays) {
  return arrays.reduce((acc, arr) => {
    const result = []
    acc.forEach(combo => arr.forEach(val => result.push([...combo, val])))
    return result
  }, [[]])
}

function beforeUpload(file) {
  const isImage = file.type.startsWith('image/')
  const isLt5M = file.size / 1024 / 1024 < 5
  if (!isImage) ElMessage.error('只能上传图片文件')
  if (!isLt5M) ElMessage.error('图片大小不能超过5MB')
  return isImage && isLt5M
}

function onCoverSuccess(res) {
  if (res.code === 0 && res.data) {
    form.coverImage = res.data.fileID || res.data.url || ''
    form.coverImagePreview = res.data.previewUrl || res.data.url || ''
  } else {
    ElMessage.error('上传失败')
  }
}

function onSkuImgSuccess(res, index) {
  if (res.code === 0 && res.data) {
    form.skus[index].image = res.data.fileID || res.data.url || ''
    form.skus[index].imagePreview = res.data.previewUrl || res.data.url || ''
  } else {
    ElMessage.error('上传失败')
  }
}

function onBannerSuccess(res) {
  if (res.code === 0 && res.data) {
    form.images.push(res.data.fileID || res.data.url || '')
    form.imagePreviews.push(res.data.previewUrl || res.data.url || '')
  }
}

function onBannerRemove(file) {
  const idx = form.imagePreviews.indexOf(file.url)
  if (idx > -1) {
    form.images.splice(idx, 1)
    form.imagePreviews.splice(idx, 1)
  } else {
    const imgIdx = form.images.indexOf(file.url)
    if (imgIdx > -1) form.images.splice(imgIdx, 1)
  }
}

function onDetailSuccess(res) {
  if (res.code === 0 && res.data) {
    form.detailImages.push(res.data.fileID || res.data.url || '')
    form.detailImagePreviews.push(res.data.previewUrl || res.data.url || '')
  }
}

function onDetailRemove(file) {
  const idx = form.detailImagePreviews.indexOf(file.url)
  if (idx > -1) {
    form.detailImages.splice(idx, 1)
    form.detailImagePreviews.splice(idx, 1)
  } else {
    const imgIdx = form.detailImages.indexOf(file.url)
    if (imgIdx > -1) form.detailImages.splice(imgIdx, 1)
  }
}

async function onSave() {
  await formRef.value.validate()

  if (form.skuType === 'multi') {
    if (form.skus.length === 0) {
      ElMessage.error('多规格商品请至少添加一个规格项和规格值')
      return
    }
    const enabledSkus = form.skus.filter(s => s.enabled)
    if (enabledSkus.length === 0) {
      ElMessage.error('多规格商品至少需要一个启用的SKU')
      return
    }
    const hasPrice = enabledSkus.some(s => s.price > 0)
    if (!hasPrice) {
      ElMessage.error('请在SKU表格中设置售价，或使用批量设置')
      return
    }
  }

  saving.value = true
  try {
    const payload = { ...form }
    payload.specGroups = payload.specGroups.map(g => ({ name: g.name, values: g.values }))
    payload.skus = payload.skus.map(s => {
      const { imagePreview, ...rest } = s
      return rest
    })
    delete payload.coverImagePreview
    delete payload.imagePreviews
    delete payload.detailImagePreviews

    if (payload.skuType === 'multi') {
      const enabledSkus = payload.skus.filter(s => s.enabled)
      const prices = enabledSkus.map(s => s.price).filter(p => p > 0)
      if (prices.length > 0) {
        payload.minPrice = Math.min(...prices)
        payload.maxPrice = Math.max(...prices)
        payload.price = payload.minPrice
      }
      payload.stock = enabledSkus.reduce((sum, s) => sum + (s.stock || 0), 0)
      payload.totalStock = payload.stock
    } else {
      payload.totalStock = payload.stock
    }

    if (isEdit.value) {
      await updateProduct({ productId: route.params.id, ...payload })
    } else {
      await createProduct(payload)
    }
    ElMessage.success('保存成功')
    router.push('/product')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  loadCategoryOptions()
  if (isEdit.value) {
    try {
      const res = await getProductDetail(route.params.id)
      const data = res.data
      Object.keys(form).forEach(k => {
        if (data[k] !== undefined) form[k] = data[k]
      })
      if (data.category) {
        categoryValue.value = data.categoryId ? [data.category, data.categoryId] : [data.category]
      }
      if (!data.specGroups) form.specGroups = []
      if (!data.skus) form.skus = []
      if (data.coverUrl && !data.coverImage) form.coverImage = data.coverUrl
      form.coverImagePreview = data.coverImagePreview || form.coverImagePreview || form.coverImage || ''
      form.imagePreviews = data.imagesPreviews && data.imagesPreviews.length > 0 ? data.imagesPreviews : (data.imagePreviews && data.imagePreviews.length > 0 ? data.imagePreviews : [...form.images])
      form.detailImagePreviews = data.detailImagesPreviews && data.detailImagesPreviews.length > 0 ? data.detailImagesPreviews : (data.detailImagePreviews && data.detailImagePreviews.length > 0 ? data.detailImagePreviews : [...form.detailImages])
      if (form.skus.length > 0) {
        form.skus.forEach(s => {
          s.imagePreview = s.imagePreview || s.image || ''
        })
      }
    } catch (e) {
      ElMessage.error('加载商品失败')
    }
  }
})
</script>

<style scoped>
.form-tip { font-size: 12px; color: var(--text-tertiary); margin-left: 8px; }
.spec-section { width: 100%; }
.spec-group {
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: 12px;
  background: #fafbfc;
  transition: border-color 0.2s;
}
.spec-group:hover { border-color: var(--color-primary); }
.spec-group-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.spec-group-label { font-weight: 600; font-size: 13px; color: var(--text-primary); white-space: nowrap; }
.spec-values { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.spec-val-tag { margin: 0; }
.sku-section { width: 100%; }
.sku-batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 14px;
  background: #fafbfc;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
}
.batch-label { font-size: 13px; color: var(--text-secondary); font-weight: 500; white-space: nowrap; }
.price-range { font-size: 13px; color: var(--color-danger); font-weight: 500; margin-left: auto; white-space: nowrap; }
.sku-empty {
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
  background: #fafbfc;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--border-color-strong);
}
.required-star { color: var(--color-danger); margin-right: 2px; }
.sku-img-uploader :deep(.el-upload) {
  border: 1px dashed var(--border-color-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafbfc;
  transition: border-color 0.2s;
}
.sku-img-uploader :deep(.el-upload:hover) { border-color: var(--color-primary); }
.sku-img-preview { width: 48px; height: 48px; border-radius: var(--radius-sm); }
.sku-img-icon { font-size: 18px; color: var(--text-placeholder); }
.cover-uploader :deep(.el-upload) {
  border: 1px dashed var(--border-color-strong);
  border-radius: var(--radius-md);
  cursor: pointer;
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafbfc;
  transition: border-color 0.2s;
}
.cover-uploader :deep(.el-upload:hover) { border-color: var(--color-primary); }
.cover-preview { width: 120px; height: 120px; border-radius: var(--radius-md); }
.cover-uploader-icon { font-size: 28px; color: var(--text-placeholder); }
:deep(.el-upload--picture-card) {
  background: #fafbfc;
  border-color: var(--border-color-strong);
  border-radius: var(--radius-sm);
  transition: border-color 0.2s;
}
:deep(.el-upload--picture-card:hover) { border-color: var(--color-primary); }
:deep(.el-upload--picture-card .el-icon) { color: var(--text-placeholder); font-size: 28px; }
</style>
