<template>
  <el-card>
    <el-page-header @back="$router.back()" :title="'活动列表'" :content="isEdit ? '编辑活动' : '创建活动'" />
    <el-form ref="formRef" :model="form" :rules="formRules" label-width="120px" style="max-width:760px;margin-top:20px">
      <el-form-item label="活动名称" prop="title">
        <el-input v-model="form.title" placeholder="如：城市公园宠物社交日" maxlength="60" />
      </el-form-item>
      <el-form-item label="分类" prop="category">
        <el-select v-model="form.category" style="width:200px">
          <el-option label="户外活动" value="outdoor" />
          <el-option label="室内活动" value="indoor" />
          <el-option label="社交聚会" value="social" />
          <el-option label="培训课程" value="training" />
          <el-option label="比赛赛事" value="competition" />
          <el-option label="领养活动" value="adoption" />
          <el-option label="其他活动" value="other" />
        </el-select>
      </el-form-item>
      <el-form-item label="开始时间" prop="startTime">
        <el-date-picker v-model="form.startTime" type="datetime" placeholder="开始报名/活动开始时间" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" clearable />
      </el-form-item>
      <el-form-item label="结束时间" prop="endTime">
        <el-date-picker v-model="form.endTime" type="datetime" placeholder="活动结束时间（留空或 2099 表示长期）" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" clearable />
      </el-form-item>
      <el-form-item label="地点" prop="location">
        <el-input v-model="form.location" placeholder="活动地点描述" />
      </el-form-item>
      <el-form-item label="经纬度">
        <div style="display:flex;gap:10px">
          <el-input-number v-model="form.latitude" :precision="6" placeholder="纬度" controls-position="right" style="width:180px" />
          <el-input-number v-model="form.longitude" :precision="6" placeholder="经度" controls-position="right" style="width:180px" />
        </div>
      </el-form-item>
      <el-form-item label="每人费用" prop="pricePerPerson">
        <el-input-number v-model="form.pricePerPerson" :min="0" :precision="2" controls-position="right" />
      </el-form-item>
      <el-form-item label="每宠费用" prop="pricePerPet">
        <el-input-number v-model="form.pricePerPet" :min="0" :precision="2" controls-position="right" />
      </el-form-item>
      <el-form-item label="名额上限" prop="maxParticipants">
        <el-input-number v-model="form.maxParticipants" :min="0" :step="1" controls-position="right" />
        <span class="hint">0 表示不限</span>
      </el-form-item>
      <el-form-item label="活动状态" prop="status">
        <!-- 创建时可选发布；编辑时状态由状态机/定时器驱动，页面不提供改状态入口 -->
        <el-select v-model="form.status" style="width:180px" :disabled="isEdit">
          <el-option label="草稿" value="draft" />
          <el-option label="发布" value="published" />
        </el-select>
        <span v-if="isEdit && !['draft', 'published'].includes(form.status)" class="hint">当前状态：{{ ACTIVITY_STATUS[form.status] || form.status }}</span>
      </el-form-item>
      <el-form-item label="封面图" prop="coverUrl">
        <el-input v-model="form.coverUrl" placeholder="图片 cloud:// 或 https:// 链接" />
      </el-form-item>
      <el-form-item label="联系方式" prop="contactPhone">
        <el-input v-model="form.contactPhone" placeholder="联系电话" style="width:220px" />
      </el-form-item>
      <el-form-item label="微信号" prop="wechatId">
        <el-input v-model="form.wechatId" placeholder="选填" style="width:220px" />
      </el-form-item>
      <el-form-item label="活动介绍" prop="description">
        <el-input v-model="form.description" type="textarea" :rows="4" placeholder="活动详情、注意事项" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getActivityDetail, createActivity, updateActivity } from '@/api/activity'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const formRef = ref()
const saving = ref(false)
const isEdit = computed(() => !!route.params.id)

const form = reactive({
  title: '', category: 'outdoor', description: '',
  startTime: '', endTime: '', location: '',
  latitude: null, longitude: null,
  maxParticipants: 0,
  pricePerPerson: 0, pricePerPet: 0,
  coverUrl: '', contactName: '', contactPhone: '', wechatId: '',
  status: 'draft',
})

const ACTIVITY_STATUS = {
  draft: '草稿',
  published: '已发布',
  registration_stopped: '已截止报名',
  ended: '已结束',
  cancelled: '已取消',
  deleted: '已删除',
}

const formRules = {
  title: [{ required: true, message: '请输入活动名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
}

onMounted(async () => {
  if (isEdit.value) {
    const res = await getActivityDetail(route.params.id)
    if (res.data) {
      Object.assign(form, res.data, {
        // 兼容历史 ISO/带秒格式：Date 对象会自动格式化为 YYYY-MM-DD HH:mm
        startTime: res.data.startTime || '',
        endTime: res.data.endTime || '',
        latitude: res.data.latitude || null,
        longitude: res.data.longitude || null,
      })
    }
  }
})

async function onSave() {
  await formRef.value.validate()
  saving.value = true
  try {
    const payload = { ...form }
    if (payload.startTime === null) { payload.startTime = '' }
    if (payload.endTime === null) { payload.endTime = '' }
    if (isEdit.value) { await updateActivity({ activityId: route.params.id, ...payload }) }
    else { await createActivity(payload) }
    ElMessage.success('保存成功')
    router.push('/activity')
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.hint { margin-left: 10px; color: #999; font-size: 12px; }
</style>
