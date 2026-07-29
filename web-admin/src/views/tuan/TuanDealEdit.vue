<template>
  <div>
    <el-page-header @back="$router.back()" :title="'团购列表'" :content="isEdit ? '编辑团购' : '创建团购'" />
    <el-tabs v-model="activeSection" style="margin-top:20px">
      <el-tab-pane label="团购商品" name="products">
        <div class="section-actions">
          <el-button type="primary" @click="showProductSelector = true">从商品库导入</el-button>
        </div>
        <div v-if="form.products.length === 0" class="empty-tip">
          <el-empty description="暂无团购商品，请从商品库导入" :image-size="80" />
        </div>
        <div v-for="(product, pIdx) in form.products" :key="pIdx" class="product-card">
          <div class="product-card-header">
            <div class="product-card-info">
              <el-image v-if="product.imagePreview || product.image" :src="product.imagePreview || product.image" fit="cover" class="product-thumb" />
              <div v-else class="product-thumb-placeholder">无图</div>
              <div class="product-card-text">
                <div class="product-card-name">{{ product.name }}</div>
                <div class="product-card-sub">原价 ¥{{ product.originalPrice }} · {{ product.skuType === 'multi' ? '多规格' : '单规格' }}</div>
              </div>
            </div>
            <el-button type="danger" link @click="removeProduct(pIdx)">移除</el-button>
          </div>
          <div v-if="product.skuType === 'single'" class="single-sku-form">
            <el-form-item label="团购价" label-width="80px">
              <el-input-number v-model="product.tuanPrice" :min="0" :precision="2" :step="1" />
              <span class="form-tip">原价 ¥{{ product.originalPrice }}</span>
            </el-form-item>
            <el-form-item label="团购库存" label-width="80px">
              <el-input-number v-model="product.tuanStock" :min="0" :step="1" />
              <span class="form-tip">原库存 {{ product.stock }}</span>
            </el-form-item>
          </div>
          <div v-else class="multi-sku-form">
            <el-table :data="product.skus" size="small" border>
              <el-table-column prop="specText" label="规格" min-width="120" show-overflow-tooltip />
              <el-table-column label="图片" width="60" align="center">
                <template #default="{ row }">
                  <el-image v-if="row.imagePreview || row.image" :src="row.imagePreview || row.image" fit="cover" style="width:36px;height:36px;border-radius:4px" :preview-src-list="[row.imagePreview || row.image]" preview-teleported />
                </template>
              </el-table-column>
              <el-table-column label="原价" width="100" align="center">
                <template #default="{ row }">¥{{ row.originalPrice || row.price }}</template>
              </el-table-column>
              <el-table-column label="团购价" width="140" align="center">
                <template #header><span class="required-star">*</span>团购价</template>
                <template #default="{ row }">
                  <el-input-number v-model="row.tuanPrice" :min="0" :precision="2" :step="1" size="small" style="width:120px" />
                </template>
              </el-table-column>
              <el-table-column label="原库存" width="80" align="center">
                <template #default="{ row }">{{ row.stock }}</template>
              </el-table-column>
              <el-table-column label="团购库存" width="140" align="center">
                <template #header><span class="required-star">*</span>团购库存</template>
                <template #default="{ row }">
                  <el-input-number v-model="row.tuanStock" :min="0" :step="1" size="small" style="width:120px" />
                </template>
              </el-table-column>
              <el-table-column label="上架" width="60" align="center">
                <template #default="{ row }">
                  <el-switch v-model="row.enabled" size="small" />
                </template>
              </el-table-column>
            </el-table>
            <div class="batch-row" v-if="product.skus.length > 1">
              <span class="batch-label">批量设置</span>
              <el-input-number v-model="batchTuanPrice[pIdx]" :min="0" :precision="2" placeholder="团购价" size="small" style="width:120px" />
              <el-input-number v-model="batchTuanStock[pIdx]" :min="0" placeholder="团购库存" size="small" style="width:120px" />
              <el-button size="small" @click="applyBatch(pIdx)">应用</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="团购介绍" name="intro">
        <el-form label-width="100px" style="max-width:700px">
          <el-form-item label="团购标题" required>
            <el-input v-model="form.title" placeholder="请输入团购标题" />
          </el-form-item>
          <el-form-item label="团购描述">
            <el-input v-model="form.description" type="textarea" :rows="4" placeholder="请输入团购描述" />
          </el-form-item>
          <el-form-item label="封面图">
            <el-upload class="cover-uploader" :http-request="customUpload" :show-file-list="false" :on-success="onCoverUpload" :before-upload="beforeUpload" accept="image/*">
              <el-image v-if="form.coverUrlPreview || form.coverUrl" :src="form.coverUrlPreview || form.coverUrl" fit="cover" class="cover-preview" />
              <el-icon v-else class="cover-uploader-icon"><Plus /></el-icon>
            </el-upload>
          </el-form-item>
          <el-form-item label="详情图">
            <el-upload :http-request="customUpload" list-type="picture-card" :file-list="imageFileList" :on-success="onImageUpload" :on-remove="onImageRemove" :before-upload="beforeUpload" accept="image/*">
              <el-icon><Plus /></el-icon>
            </el-upload>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="团购设置" name="settings">
        <el-form label-width="100px" style="max-width:700px">
          <el-form-item label="开始时间">
            <el-date-picker v-model="form.startTime" type="datetime" placeholder="不填则发布时立即开始" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" clearable />
          </el-form-item>
          <el-form-item label="结束时间">
            <el-date-picker v-model="form.endTime" type="datetime" placeholder="不填则无限期" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" clearable />
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>
    <div class="form-footer">
      <el-button @click="$router.back()">取消</el-button>
      <el-button :loading="saving" @click="onSaveDraft">保存草稿</el-button>
      <el-button type="primary" :loading="saving" @click="onPublish">保存并发布</el-button>
    </div>

    <el-dialog v-model="showProductSelector" title="从商品库选择商品" width="800px" top="5vh">
      <div class="selector-toolbar">
        <el-input v-model="productSearch" placeholder="搜索商品名称" style="width:200px" clearable @input="onProductSearch" />
        <el-select v-model="productCategory" placeholder="分类" style="width:140px" clearable @change="loadProducts">
          <el-option v-for="cat in categories" :key="cat.key" :label="cat.label" :value="cat.key" />
        </el-select>
      </div>
      <el-table ref="selectorTable" :data="productList" v-loading="productLoading" @selection-change="onProductSelect" height="400" stripe size="small">
        <el-table-column type="selection" width="50" :selectable="row => !selectedProductIds.has(row._id)" />
        <el-table-column label="商品" min-width="200">
          <template #default="{ row }">
            <div class="product-info">
              <el-image v-if="row.coverImagePreview || row.coverImage || row.coverUrlPreview || row.coverUrl" :src="row.coverImagePreview || row.coverImage || row.coverUrlPreview || row.coverUrl" fit="cover" class="product-thumb-sm" />
              <div v-else class="product-thumb-placeholder-sm">无图</div>
              <div class="product-text">
                <div class="product-name">{{ row.name }}</div>
                <div class="product-sub">¥{{ row.price }} · {{ row.skuType === 'multi' ? '多规格' : '单规格' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="stock" label="库存" width="80" align="center" />
        <el-table-column prop="status" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'on_sale' ? 'success' : 'info'" size="small">{{ row.status === 'on_sale' ? '在售' : row.status }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <div class="selector-footer">
        <span>已选 {{ tempSelected.length }} 件商品</span>
        <el-button type="primary" @click="confirmProductSelect">确认导入</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTuanDealDetail, createTuanDeal, updateTuanDeal, publishTuanDeal } from '@/api/tuan'
import { getProductList } from '@/api/product'
import { listCategories } from '@/api/product'
import { uploadFile } from '@/api/upload'
import { formatDate, formatMoney } from '@/utils/format'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const isEdit = computed(() => !!route.params.id)
const saving = ref(false)
const activeSection = ref('products')

const form = reactive({
  title: '',
  description: '',
  coverUrl: '',
  coverUrlPreview: '',
  images: [],
  imagePreviews: [],
  products: [],
  startTime: '',
  endTime: '',
})

const batchTuanPrice = reactive({})
const batchTuanStock = reactive({})

const imageFileList = computed(() => form.imagePreviews.map((url, i) => ({ name: `img_${i}`, url })))

const showProductSelector = ref(false)
const productSearch = ref('')
const productCategory = ref('')
const productList = ref([])
const productLoading = ref(false)
const categories = ref([])
const tempSelected = ref([])
const selectedProductIds = computed(() => new Set(form.products.map(p => p.productId).filter(Boolean)))

onMounted(async () => {
  const catRes = await listCategories()
  if (catRes.data?.list) categories.value = catRes.data.list
  loadProducts()
  if (isEdit.value) {
    const res = await getTuanDealDetail(route.params.id)
    const data = res.data || {}
    form.title = data.title || ''
    form.description = data.description || ''
    form.coverUrl = data.coverUrl || ''
    form.coverUrlPreview = data.coverUrlPreview || data.coverUrl || ''
    form.images = data.images || []
    form.imagePreviews = data.imagesPreviews && data.imagesPreviews.length > 0 ? data.imagesPreviews : (data.imagePreviews && data.imagePreviews.length > 0 ? data.imagePreviews : [...form.images])
    form.products = data.products || []
    // 给 SKU 和 product 设置 imagePreview 回退
    if (form.products.length > 0) {
      form.products.forEach(p => {
        p.imagePreview = p.imagePreview || p.image || ''
        if (p.skus && p.skus.length > 0) {
          p.skus.forEach(s => {
            s.imagePreview = s.imagePreview || s.image || ''
          })
        }
      })
    }
    form.startTime = data.startTime && new Date(data.startTime).getFullYear() < 2090 ? data.startTime : ''
    form.endTime = data.endTime && new Date(data.endTime).getFullYear() < 2090 ? data.endTime : ''
  }
})

async function loadProducts() {
  productLoading.value = true
  try {
    const params = { status: 'on_sale', pageSize: 100 }
    if (productCategory.value) params.category = productCategory.value
    if (productSearch.value) params.keyword = productSearch.value
    const res = await getProductList(params)
    productList.value = res.data?.list || []
  } finally { productLoading.value = false }
}

let searchTimer = null
function onProductSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadProducts, 300)
}

function onProductSelect(selection) {
  tempSelected.value = selection
}

function confirmProductSelect() {
  const imported = tempSelected.value.map(item => {
    const product = {
      productId: item._id,
      name: item.name || item.title,
      image: item.coverImage || item.coverUrl || item.images?.[0] || '',
      imagePreview: item.coverImagePreview || item.coverUrlPreview || item.coverImage || item.coverUrl || '',
      images: item.images || [],
      detailImages: item.detailImages || [],
      coverImage: item.coverImage || '',
      originalPrice: Number(item.price || item.originalPrice || 0),
      tuanPrice: Number(item.price || item.originalPrice || 0),
      stock: Number(item.stock || item.totalStock || 0),
      tuanStock: Number(item.stock || item.totalStock || 0),
      skuType: item.skuType || 'single',
    }
    if (item.skuType === 'multi' && item.skus?.length > 0) {
      product.specGroups = item.specGroups || []
      product.skus = item.skus.map(sku => ({
        skuId: sku.skuId,
        specIds: sku.specIds || {},
        specText: sku.specText || '',
        price: Number(sku.price) || 0,
        originalPrice: Number(sku.originalPrice) || Number(sku.price) || 0,
        stock: Number(sku.stock) || 0,
        tuanPrice: Number(sku.price) || 0,
        tuanStock: 0,
        skuCode: sku.skuCode || '',
        image: sku.image || '',
        imagePreview: sku.imagePreview || sku.image || '',
        enabled: sku.enabled !== false,
        sold: 0,
      }))
    }
    return product
  })

  const existingIds = new Set(form.products.map(p => p.productId).filter(Boolean))
  const newProducts = imported.filter(p => !existingIds.has(p.productId))
  form.products.push(...newProducts)

  if (newProducts.length > 0 && !form.title && !form.description && form.images.length === 0) {
    const first = newProducts[0]
    form.title = form.title || first.name
    form.coverUrl = form.coverUrl || first.image
    if (first.detailImages?.length) {
      form.images = [...first.detailImages]
    } else if (first.images?.length) {
      form.images = [...first.images]
    }
  }

  showProductSelector.value = false
  tempSelected.value = []
  ElMessage.success(`已导入 ${newProducts.length} 件商品`)
}

function removeProduct(idx) {
  form.products.splice(idx, 1)
}

function applyBatch(pIdx) {
  const price = batchTuanPrice[pIdx]
  const stock = batchTuanStock[pIdx]
  const product = form.products[pIdx]
  if (price === undefined && stock === undefined) {
    ElMessage.warning('请先设置批量团购价或库存')
    return
  }
  if (product.skus) {
    product.skus.forEach(sku => {
      if (price !== undefined) sku.tuanPrice = price
      if (stock !== undefined) sku.tuanStock = stock
    })
  }
  ElMessage.success('批量设置成功')
}

function onCoverUpload(res) {
  if (res.code === 0 && res.data) {
    form.coverUrl = res.data.fileID || res.data.url || ''
    form.coverUrlPreview = res.data.previewUrl || res.data.url || ''
  } else ElMessage.error('上传失败')
}

function onImageUpload(res) {
  if (res.code === 0 && res.data) {
    form.images.push(res.data.fileID || res.data.url || '')
    form.imagePreviews.push(res.data.previewUrl || res.data.url || '')
  } else ElMessage.error('上传失败')
}

function onImageRemove(file) {
  const url = file.url || file.response?.data?.url
  const idx = form.imagePreviews.indexOf(url)
  if (idx > -1) {
    form.images.splice(idx, 1)
    form.imagePreviews.splice(idx, 1)
  } else {
    const imgIdx = form.images.indexOf(url)
    if (imgIdx > -1) form.images.splice(imgIdx, 1)
  }
}

function beforeUpload(file) {
  if (!file.type.startsWith('image/')) { ElMessage.error('只能上传图片'); return false }
  if (file.size > 5 * 1024 * 1024) { ElMessage.error('图片不能超过5MB'); return false }
  return true
}

async function customUpload(options) {
  const { file } = options
  try {
    const result = await uploadFile(file, `tuan/${Date.now()}_${file.name}`)
    return { code: 0, data: result }
  } catch (err) {
    ElMessage.error(err?.message || '上传失败')
    throw err
  }
}

function validateForm() {
  if (!form.title) { ElMessage.warning('请填写团购标题'); activeSection.value = 'intro'; return false }
  if (form.products.length === 0) { ElMessage.warning('请添加团购商品'); activeSection.value = 'products'; return false }
  for (const p of form.products) {
    if (p.skuType === 'single' && (!p.tuanPrice || p.tuanPrice <= 0)) {
      ElMessage.warning(`请设置"${p.name}"的团购价`); activeSection.value = 'products'; return false
    }
    if (p.skuType === 'multi' && p.skus) {
      for (const sku of p.skus) {
        if (sku.enabled && (!sku.tuanPrice || sku.tuanPrice <= 0)) {
          ElMessage.warning(`请设置"${p.name}" - ${sku.specText} 的团购价`); activeSection.value = 'products'; return false
        }
      }
    }
  }
  return true
}

async function onSaveDraft() {
  if (!validateForm()) return
  saving.value = true
  try {
    const { coverUrlPreview, imagePreviews, ...data } = form
    if (isEdit.value) await updateTuanDeal({ id: route.params.id, ...data })
    else {
      const res = await createTuanDeal(data)
      if (res.data?._id) router.replace(`/tuan/${res.data._id}/edit`)
    }
    ElMessage.success('保存成功')
  } finally { saving.value = false }
}

async function onPublish() {
  if (!validateForm()) return
  saving.value = true
  try {
    let dealId = route.params.id
    const { coverUrlPreview, imagePreviews, ...data } = form
    if (isEdit.value) await updateTuanDeal({ id: dealId, ...data })
    else {
      const res = await createTuanDeal(data)
      dealId = res.data?._id
    }
    if (dealId) await publishTuanDeal(dealId)
    ElMessage.success('发布成功')
    router.push('/tuan/list')
  } finally { saving.value = false }
}
</script>

<style scoped>
.section-actions { margin-bottom: var(--spacing-md); }
.empty-tip { padding: var(--spacing-xl) 0; }
.product-card {
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: 12px;
  background: #fafbfc;
  transition: border-color 0.2s;
}
.product-card:hover { border-color: var(--color-primary); }
.product-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.product-card-info { display: flex; align-items: center; gap: 10px; }
.product-thumb {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  border: 1px solid var(--border-color);
}
.product-thumb-placeholder {
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
.product-card-text { flex: 1; min-width: 0; }
.product-card-name { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.product-card-sub { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.single-sku-form { display: flex; gap: var(--spacing-lg); flex-wrap: wrap; }
.form-tip { font-size: 12px; color: var(--text-tertiary); margin-left: 8px; }
.multi-sku-form { margin-top: 8px; }
.batch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: #f5f6f8;
  border-radius: var(--radius-sm);
}
.batch-label { font-size: 13px; color: var(--text-secondary); font-weight: 500; white-space: nowrap; }
.required-star { color: var(--color-danger); margin-right: 2px; }
.form-footer {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
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
.selector-toolbar { display: flex; gap: 10px; margin-bottom: 12px; }
.product-info { display: flex; align-items: center; gap: 8px; }
.product-thumb-sm {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
}
.product-thumb-placeholder-sm {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  color: var(--text-placeholder);
  font-size: 10px;
  border-radius: 4px;
}
.product-text { flex: 1; min-width: 0; }
.product-name { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.product-sub { font-size: 11px; color: var(--text-tertiary); margin-top: 1px; }
.selector-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  font-size: 13px;
  color: var(--text-secondary);
}
:deep(.el-upload--picture-card) {
  background: #fafbfc;
  border-color: var(--border-color-strong);
  border-radius: var(--radius-sm);
  transition: border-color 0.2s;
}
:deep(.el-upload--picture-card:hover) { border-color: var(--color-primary); }
:deep(.el-upload--picture-card .el-icon) { color: var(--text-placeholder); font-size: 28px; }
</style>
