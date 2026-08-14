<template>
  <el-card class="splash-card">
    <template #header>
      <div class="card-head">
        <div>
          <div class="card-title">启动首屏海报</div>
          <div class="card-sub">上传 9:16 竖图作为小程序启动时的首屏海报，支持本地图片上传与比例强校验。</div>
        </div>
        <el-switch
          v-model="form.enabled"
          :disabled="!form.imageUrl"
          active-text="已启用"
          inactive-text="已停用"
          @change="onToggleEnabled"
        />
      </div>
    </template>

    <div class="splash-body">
      <!-- 左：9:16 手机预览框 -->
      <div class="preview-col">
        <div class="phone-frame" :class="{ 'is-empty': !previewSrc }">
          <img v-if="previewSrc" :src="previewSrc" class="phone-img" alt="首屏海报预览" />
          <div v-else class="phone-empty">
            <el-icon :size="34"><Picture /></el-icon>
            <span>未设置海报</span>
          </div>
          <span class="ratio-badge">9 : 16</span>
        </div>
        <div class="preview-tip">预览以 9:16 竖屏展示，实际显示由小程序端按此比例裁切。</div>
      </div>

      <!-- 右：上传与设置 -->
      <div class="setting-col">
        <el-form label-width="92px" label-position="left">
          <el-form-item label="海报图片" required>
            <el-upload
              class="splash-uploader"
              action="#"
              name="file"
              :show-file-list="false"
              :http-request="customUpload"
              :before-upload="beforeUpload"
              :on-success="onUploadSuccess"
              :on-error="onUploadError"
              accept="image/*"
            >
              <div v-if="form.imageUrl" class="upload-thumb">
                <img :src="previewSrc" alt="已上传" />
                <span class="reupload">点击替换</span>
              </div>
              <el-icon v-else class="upload-icon"><Plus /></el-icon>
            </el-upload>
            <div class="upload-meta">
              <div v-if="form.width && form.height" class="dim-line">
                尺寸 {{ form.width }} × {{ form.height }} px ·
                比例 {{ ratioText }}
                <el-tag v-if="ratioOk" size="small" type="success" effect="plain">符合 9:16</el-tag>
              </div>
              <div class="rule-line">要求：本地图片、竖屏、宽高比 9:16（误差 ±3%）、≤ 10MB</div>
            </div>
          </el-form-item>

          <el-form-item label="展示时长">
            <el-slider
              v-model="form.durationMs"
              :min="1000"
              :max="5000"
              :step="500"
              :format-tooltip="(v) => `${v / 1000}s`"
              style="width: 220px"
            />
            <span class="duration-text">{{ (form.durationMs / 1000).toFixed(1) }}s</span>
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="saving" @click="onSave">保存设置</el-button>
            <el-button @click="fetchCurrent" :disabled="saving">重置</el-button>
          </el-form-item>
        </el-form>

        <el-alert
          v-if="savedAt"
          class="save-hint"
          type="success"
          :closable="false"
          show-icon
          :title="`已于 ${savedAt} 保存`"
        />
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { getSplashPoster, updateSplashPoster } from '@/api/splashPoster'
import { uploadFile } from '@/api/upload'
import { ElMessage } from 'element-plus'
import { Plus, Picture } from '@element-plus/icons-vue'

const TARGET_RATIO = 9 / 16
const RATIO_TOLERANCE = 0.03
const MAX_SIZE_MB = 10

const loading = ref(false)
const saving = ref(false)
const savedAt = ref('')
const pendingDims = ref(null)
const ratioOk = ref(false)

const defaultForm = () => ({
  enabled: false,
  imageUrl: '',
  imagePreviewUrl: '',
  width: 0,
  height: 0,
  aspectRatio: 0,
  durationMs: 2500,
})
const form = reactive(defaultForm())

const previewSrc = computed(() => form.imagePreviewUrl || form.imageUrl || '')
const ratioText = computed(() => (form.width && form.height ? (form.width / form.height).toFixed(3) : '—'))

// 客户端 9:16 强校验：加载图片读取真实像素宽高
function readImageDims(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { width, height } = img
      const ratio = width / height
      const ok = width < height && Math.abs(ratio - TARGET_RATIO) <= RATIO_TOLERANCE
      resolve({ width, height, ratio, ok })
    }
    img.onerror = () => reject(new Error('图片解析失败'))
    img.src = URL.createObjectURL(file)
  })
}

async function beforeUpload(file) {
  const isImage = file.type.startsWith('image/')
  if (!isImage) {
    ElMessage.error('只能上传图片文件')
    return false
  }
  const isLt10M = file.size / 1024 / 1024 < MAX_SIZE_MB
  if (!isLt10M) {
    ElMessage.error(`图片大小不能超过 ${MAX_SIZE_MB}MB`)
    return false
  }
  try {
    const dim = await readImageDims(file)
    if (!dim.ok) {
      ElMessage.error(`图片需为 9:16 竖屏（当前 ${dim.width}×${dim.height}，比例 ${dim.ratio.toFixed(3)}）`)
      return false
    }
    pendingDims.value = dim
    ratioOk.value = true
    return true
  } catch (e) {
    ElMessage.error(e.message || '图片校验失败')
    return false
  }
}

async function customUpload(options) {
  const { file } = options
  try {
    const result = await uploadFile(file, `splash/${Date.now()}_${file.name}`)
    form.imageUrl = result.fileID || result.url
    form.imagePreviewUrl = result.previewUrl || form.imageUrl
    if (pendingDims.value) {
      form.width = pendingDims.value.width
      form.height = pendingDims.value.height
      form.aspectRatio = +(pendingDims.value.width / pendingDims.value.height).toFixed(4)
    }
    return { code: 0, data: result }
  } catch (err) {
    ElMessage.error(err?.message || '上传失败')
    throw err
  }
}

function onUploadSuccess() {
  ElMessage.success('上传成功，记得点「保存设置」')
}
function onUploadError() {
  ElMessage.error('上传失败，请重试')
}

async function onToggleEnabled(val) {
  // 仅切换开关时同步保存启用状态（已上传图片前提下）
  if (val && !form.imageUrl) {
    ElMessage.warning('请先上传海报图片')
    form.enabled = false
    return
  }
  saving.value = true
  try {
    // 关键：切换开关也必须带全量字段（含 imageUrl），否则后端按 enabled=true 但缺图报错
    await persist(buildPayload(val))
    ElMessage.success(val ? '已启用首屏海报' : '已停用首屏海报')
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
    form.enabled = !val
  } finally {
    saving.value = false
  }
}

// 保存/切换共用的完整载荷
function buildPayload(enabled) {
  return {
    enabled: enabled,
    imageUrl: form.imageUrl,
    imagePreviewUrl: form.imagePreviewUrl,
    width: form.width,
    height: form.height,
    aspectRatio: form.aspectRatio,
    durationMs: form.durationMs,
  }
}

async function onSave() {
  if (!form.imageUrl) {
    ElMessage.warning('请先上传海报图片')
    return
  }
  saving.value = true
  try {
    await persist(buildPayload(form.enabled))
    ElMessage.success('保存成功')
    savedAt.value = new Date().toLocaleString('zh-CN')
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function persist(payload) {
  const res = await updateSplashPoster(payload)
  const d = res.data || {}
  // 回写后端解析后的最新预览 URL 与状态
  if (d.imagePreviewUrl) form.imagePreviewUrl = d.imagePreviewUrl
  if (typeof d.enabled === 'boolean') form.enabled = d.enabled
  if (typeof d.durationMs === 'number') form.durationMs = d.durationMs
  if (d.width) form.width = d.width
  if (d.height) form.height = d.height
  return res
}

async function fetchCurrent() {
  loading.value = true
  try {
    const res = await getSplashPoster()
    const d = res.data || {}
    Object.assign(form, {
      enabled: d.enabled === true,
      imageUrl: d.imageUrl || '',
      imagePreviewUrl: d.imagePreviewUrl || '',
      width: d.width || 0,
      height: d.height || 0,
      aspectRatio: d.aspectRatio || 0,
      durationMs: d.durationMs || 2500,
    })
    ratioOk.value = !!(form.width && form.height && Math.abs(form.width / form.height - TARGET_RATIO) <= RATIO_TOLERANCE)
    savedAt.value = ''
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(fetchCurrent)
</script>

<style scoped>
.splash-card { max-width: 920px; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.card-title { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.card-sub { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; }
.splash-body { display: flex; gap: 32px; flex-wrap: wrap; padding-top: 8px; }
.preview-col { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.phone-frame {
  position: relative;
  width: 180px;
  aspect-ratio: 9 / 16;
  border-radius: 18px;
  overflow: hidden;
  background: #f3f1ec;
  border: 1px solid var(--border-color-strong);
  box-shadow: 0 8px 24px rgba(31, 58, 31, 0.12);
  display: flex; align-items: center; justify-content: center;
}
.phone-frame.is-empty { border-style: dashed; }
.phone-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.phone-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-placeholder); font-size: 12px; }
.ratio-badge {
  position: absolute; right: 8px; bottom: 8px;
  background: rgba(31, 58, 31, 0.78); color: #f7f5ef;
  font-size: 10px; letter-spacing: 1px; padding: 2px 7px; border-radius: 10px;
}
.preview-tip { font-size: 11px; color: var(--text-tertiary); max-width: 180px; text-align: center; line-height: 1.5; }
.setting-col { flex: 1; min-width: 320px; }
.upload-meta { margin-top: 10px; }
.dim-line { font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rule-line { font-size: 11px; color: var(--text-tertiary); margin-top: 4px; }
.duration-text { margin-left: 10px; font-size: 13px; color: var(--text-secondary); }
.save-hint { margin-top: 8px; }

.splash-thumb,
.upload-thumb { position: relative; width: 96px; height: 128px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color-strong); }
.upload-thumb img { width: 100%; height: 100%; object-fit: cover; }
.reupload {
  position: absolute; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); color: #fff; font-size: 11px; text-align: center; padding: 3px 0;
}
.splash-uploader :deep(.el-upload) {
  border: 1px dashed var(--border-color-strong);
  border-radius: var(--radius-md);
  cursor: pointer;
  width: 96px; height: 128px;
  display: flex; align-items: center; justify-content: center;
  background: #fafbfc; transition: border-color 0.2s;
}
.splash-uploader :deep(.el-upload:hover) { border-color: var(--color-primary); }
.upload-icon { font-size: 26px; color: var(--text-placeholder); }
</style>
