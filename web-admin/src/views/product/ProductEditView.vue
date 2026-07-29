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
          <el-checkbox v-for="t in PRODUCT_TAGS" :key="t.value" :value="t.value">{{ t.label }}</el-checkbox>
        </el-checkbox-group>
      </el-form-item>
      <el-form-item label="排序权重">
        <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
        <span class="form-tip">数值越大越靠前</span>
      </el-form-item>

      <el-divider content-position="left">价格库存</el-divider>
      <el-form-item label="规格类型">
        <el-radio-group v-model="form.skuType" @change="onSkuTypeChange">
          <el-radio value="single">单规格</el-radio>
          <el-radio value="multi">多规格</el-radio>
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
            <div class="spec-toolbar">
              <el-button v-if="form.specGroups.length < 3" type="primary" plain size="small" @click="addSpecGroup"><el-icon><Plus /></el-icon>添加规格项</el-button>
              <span v-else class="form-tip">最多3个规格项</span>
              <el-button type="success" plain size="small" @click="onImportCsvClick"><el-icon><Upload /></el-icon>导入CSV</el-button>
              <el-button type="info" link size="small" @click="onDownloadTemplate">下载模板</el-button>
              <input ref="csvFileInput" type="file" accept=".csv" style="display:none" @change="onCsvFileChange" />
            </div>
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
                  <el-upload class="sku-img-uploader" :http-request="customUpload" :show-file-list="false" :on-success="(res) => onSkuImgSuccess(res, $index)" :before-upload="beforeUpload" accept="image/*">
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
              <el-table-column label="操作" width="60" align="center" fixed="right">
                <template #default="{ $index }">
                  <el-button type="danger" link size="small" @click="removeSkuRow($index)"><el-icon><Delete /></el-icon></el-button>
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
        <el-upload class="cover-uploader" :http-request="customUpload" :show-file-list="false" :on-success="onCoverSuccess" :before-upload="beforeUpload" accept="image/*">
          <el-image v-if="form.coverImagePreview" :src="form.coverImagePreview" fit="cover" class="cover-preview" />
          <el-icon v-else class="cover-uploader-icon"><Plus /></el-icon>
        </el-upload>
      </el-form-item>
      <el-form-item label="轮播图">
        <el-upload :http-request="customUpload" :file-list="bannerFileList" list-type="picture-card" :limit="5" :on-success="onBannerSuccess" :on-remove="onBannerRemove" :before-upload="beforeUpload" accept="image/*">
          <el-icon><Plus /></el-icon>
        </el-upload>
        <div class="form-tip">最多5张</div>
      </el-form-item>
      <el-form-item label="详情图">
        <el-upload :http-request="customUpload" :file-list="detailFileList" list-type="picture-card" :limit="9" :on-success="onDetailSuccess" :on-remove="onDetailRemove" :before-upload="beforeUpload" accept="image/*">
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
          <el-radio value="on_sale">立即上架</el-radio>
          <el-radio value="draft">放入草稿</el-radio>
          <el-radio value="off_sale">暂不上架</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSave">保存商品</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </el-form-item>
    </el-form>

    <!-- CSV 导入规则配置弹窗 -->
    <el-dialog v-model="csvImportVisible" title="CSV 导入预览" width="800px" :close-on-click-modal="false">
      <template v-if="csvParseResult">
        <el-form label-width="100px" style="margin-bottom:16px">
          <el-form-item label="拆分分隔符">
            <el-input v-model="csvSplitDelimiter" style="width:120px" placeholder="如 +" @input="updateSplitPreview" />
            <span class="form-tip">将 SKU名称 按此分隔符拆分为多个规格维度</span>
          </el-form-item>
          <el-form-item label="数据行数">
            <span>{{ csvParseResult.rawRows.length }} 行</span>
          </el-form-item>
        </el-form>
        <el-table :data="csvSplitPreview" border size="small" max-height="360" style="width:100%">
          <el-table-column label="原 SKU名称" min-width="260">
            <template #default="{ row }">{{ row.skuName }}</template>
          </el-table-column>
          <el-table-column v-for="(_, i) in (csvSplitPreview[0]?.parts || [])" :key="i" :label="`规格${i + 1}`" min-width="140">
            <template #default="{ row }">{{ row.parts[i] || '-' }}</template>
          </el-table-column>
          <el-table-column label="售价" width="90" align="center">
            <template #default="{ $index }">¥{{ csvParseResult.rawRows[$index].price.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="原价" width="90" align="center">
            <template #default="{ $index }">¥{{ csvParseResult.rawRows[$index].originalPrice.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="库存" width="80" align="center">
            <template #default="{ $index }">{{ csvParseResult.rawRows[$index].stock }}</template>
          </el-table-column>
        </el-table>
      </template>
      <template #footer>
        <el-button @click="cancelCsvImport">取消</el-button>
        <el-button type="primary" @click="confirmCsvImport">确认导入</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getProductDetail, createProduct, updateProduct, listCategories } from '@/api/product'
import { uploadFile } from '@/api/upload'
import { PRODUCT_TAGS } from '@/constants/product'
import { ElMessage } from 'element-plus'
import { Plus, Delete, Upload } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const formRef = ref()
const saving = ref(false)
const csvFileInput = ref()
const isEdit = computed(() => !!route.params.id)
const isCsvImporting = ref(false)

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
  if (form.skuType === 'multi' && !isCsvImporting.value) generateSkus()
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

function removeSkuRow(index) {
  form.skus.splice(index, 1)
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

async function customUpload(options) {
  const { file } = options
  try {
    const result = await uploadFile(file, `products/${Date.now()}_${file.name}`)
    return { code: 0, data: result }
  } catch (err) {
    ElMessage.error(err?.message || '上传失败')
    throw err
  }
}

/* ============================================================
 * CSV 导入 SKU（支持 1688 / 商品平台导出格式）
 *
 * 流程：上传文件 → 配置规格拆分规则 → 预览 → 确认导入
 *
 * CSV 表头示例（1688 导出）：
 *   商品标题,商品ID,SKU ID,SKU名称,SKU图链接,原价（元）,计算价格,库存
 *   宠物磨牙牛皮鸡鸭肉甜甜圈中小型犬,936058055887,58289998796410,1包+鸡肉白芝麻甜甜圈40g±2g,https://...,4.5,4.5,9716
 *
 * 规格拆分：默认按 "+" 拆分 SKU名称 为多个规格维度
 *   例如 "1包+鸡肉白芝麻甜甜圈40g±2g" → 规格1="1包", 规格2="鸡肉白芝麻甜甜圈40g±2g"
 *
 * 多列名匹配：getCell 支持候选列名数组，跳过空值继续匹配
 *   price 候选: 计算价格、计算价格（元）、原价（元）、原价、price
 *   originalPrice 候选: 划线价、划线价（元）、originalPrice
 * ============================================================ */

// CSV 导入状态
const csvImportVisible = ref(false)
const csvParseResult = ref(null)      // 解析后的临时结果 { specGroups, skus, rawRows, headers }
const csvSplitDelimiter = ref('+')    // SKU名称 拆分分隔符，默认 +
const csvSplitPreview = ref([])       // 拆分预览：[{ skuName, parts: [] }]

function onImportCsvClick() {
  csvFileInput.value?.click()
}

function onCsvFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  isCsvImporting.value = true
  parseCsvFile(file).then(result => {
    csvParseResult.value = result
    // 默认按 + 拆分，生成预览
    updateSplitPreview()
    csvImportVisible.value = true
  }).catch(err => {
    ElMessage.error(err?.message || 'CSV 解析失败')
  }).finally(() => {
    setTimeout(() => { isCsvImporting.value = false }, 100)
  })
  e.target.value = ''
}

// 更新拆分预览
function updateSplitPreview() {
  if (!csvParseResult.value) return
  const delim = csvSplitDelimiter.value || '+'
  csvSplitPreview.value = csvParseResult.value.rawRows.map(row => {
    const skuName = row.skuName || ''
    const parts = skuName.split(delim).map(p => p.trim()).filter(Boolean)
    return { skuName, parts }
  })
}

// 确认拆分规则并应用导入
function confirmCsvImport() {
  if (!csvParseResult.value) return
  const delim = csvSplitDelimiter.value || '+'
  const { rawRows, headers, colMap } = csvParseResult.value

  // 根据拆分结果构建 specGroups 和 skus
  const specGroups = []
  const skuList = []

  // 第一遍：确定规格维度数量和名称
  let maxParts = 0
  rawRows.forEach(row => {
    const parts = (row.skuName || '').split(delim).map(p => p.trim()).filter(Boolean)
    if (parts.length > maxParts) maxParts = parts.length
  })
  if (maxParts === 0) {
    ElMessage.error('未识别到有效的 SKU 名称')
    return
  }
  // 生成规格组名（规格1、规格2...）
  for (let i = 0; i < maxParts; i++) {
    specGroups.push({ name: `规格${i + 1}`, values: [], _input: '' })
  }

  // 第二遍：解析每一行
  rawRows.forEach(row => {
    const parts = (row.skuName || '').split(delim).map(p => p.trim()).filter(Boolean)
    const specIds = {}
    parts.forEach((val, i) => {
      if (i < specGroups.length) {
        specIds[specGroups[i].name] = val
        if (!specGroups[i].values.includes(val)) {
          specGroups[i].values.push(val)
        }
      }
    })
    const specText = parts.join(' / ')
    skuList.push({
      skuId: row.skuCode || `sku_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      specIds,
      specText,
      image: row.imageUrl || '',
      imagePreview: row.imageUrl || '',
      price: row.price || 0,
      originalPrice: row.originalPrice || 0,
      stock: row.stock || 0,
      soldCount: 0,
      skuCode: row.skuCode || '',
      enabled: true,
    })
  })

  // 自动切换到多规格模式
  if (form.skuType !== 'multi') {
    form.skuType = 'multi'
  }
  form.specGroups = specGroups
  form.skus = skuList
  csvImportVisible.value = false
  csvParseResult.value = null
  ElMessage.success(`已导入 ${skuList.length} 个 SKU`)
}

function cancelCsvImport() {
  csvImportVisible.value = false
  csvParseResult.value = null
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        let text = String(reader.result || '')
        // 处理 BOM 头（1688 导出的 CSV 通常带 BOM）
        if (text.charCodeAt(0) === 0xFEFF) {
          text = text.slice(1)
        }
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) {
          throw new Error('CSV 内容至少需要表头 + 1 行数据')
        }
        const headers = parseCsvLine(lines[0])
        const colMap = {}
        headers.forEach((h, i) => { colMap[h] = i })

        console.log('[CSV Debug] headers =', headers)
        console.log('[CSV Debug] colMap =', colMap)

        // 多列名匹配函数：跳过空值继续匹配
        const getCell = (cells, candidates) => {
          for (const name of candidates) {
            const idx = colMap[name]
            if (idx === undefined) continue
            const val = (cells[idx] || '').trim()
            if (val !== '') return val
          }
          return ''
        }

        // 列名匹配
        const skuNameCandidates = ['SKU名称', 'SKU名', 'sku名称', 'skuName', 'name']
        const skuIdCandidates = ['SKU ID', 'SKU编号', 'SKU编码', 'skuId', 'skuCode']
        const imageCandidates = ['SKU图链接', 'SKU图', '图片', '图片链接', 'image', 'imageUrl']
        const priceCandidates = ['计算价格', '计算价格（元）', '原价（元）', '原价', 'price', '售价']
        const originalPriceCandidates = ['划线价', '划线价（元）', 'originalPrice', '原价（元）']
        const stockCandidates = ['库存', 'stock', '可售库存']

        // 解析数据行
        const rawRows = lines.slice(1).map(line => parseCsvLine(line)).map(cells => {
          const skuName = getCell(cells, skuNameCandidates)
          const skuCode = getCell(cells, skuIdCandidates)
          const imageUrl = getCell(cells, imageCandidates)
          const priceStr = getCell(cells, priceCandidates)
          const originalPriceStr = getCell(cells, originalPriceCandidates)
          const stockStr = getCell(cells, stockCandidates)
          const price = parseFloat(priceStr) || 0
          const originalPrice = parseFloat(originalPriceStr) || 0
          const stock = parseInt(stockStr, 10) || 0
          return { skuName, skuCode, imageUrl, price, originalPrice, stock }
        })

        // 调试日志
        console.log('[CSV Debug] first row =', rawRows[0])
        console.log('[CSV Debug] total rows =', rawRows.length)
        console.log('[CSV Debug] prices =', rawRows.slice(0, 3).map(r => r.price))
        console.log('[CSV Debug] originalPrices =', rawRows.slice(0, 3).map(r => r.originalPrice))
        console.log('[CSV Debug] stocks =', rawRows.slice(0, 3).map(r => r.stock))

        if (rawRows.length === 0) throw new Error('未解析到有效数据行')
        if (!rawRows[0].skuName) throw new Error('未识别到 SKU名称 列，请检查表头')

        resolve({ rawRows, headers, colMap })
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file, 'UTF-8')
  })
}

function parseCsvLine(line) {
  const cells = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else { inQuotes = false }
      } else { cur += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { cells.push(cur); cur = '' }
      else { cur += ch }
    }
  }
  cells.push(cur)
  return cells
}

function onDownloadTemplate() {
  const bom = '\uFEFF'
  const headers = ['商品标题', '商品ID', 'SKU ID', 'SKU名称', 'SKU图链接', '原价（元）', '计算价格', '库存']
  const sample = [
    ['宠物磨牙牛皮鸡鸭肉甜甜圈中小型犬', '936058055887', '58289998796410', '1包+鸡肉白芝麻甜甜圈40g±2g', 'https://cbu01.alicdn.com/xxx.jpg', '4.5', '4.5', '9716'],
    ['宠物磨牙牛皮鸡鸭肉甜甜圈中小型犬', '936058055887', '58289998796411', '1包+大号鸡肉甜甜圈1支装【11cm中大型犬适用】', 'https://cbu01.alicdn.com/xxx.jpg', '4.5', '4.5', '0'],
    ['宠物磨牙牛皮鸡鸭肉甜甜圈中小型犬', '936058055887', '58289998796412', '2包+鸭肉白芝麻甜甜圈40g±2g', 'https://cbu01.alicdn.com/xxx.jpg', '8.5', '8.5', '500'],
  ]
  const csv = bom + [headers, ...sample].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sku_template.csv'
  a.click()
  URL.revokeObjectURL(url)
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
.spec-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--border-color);
}
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
