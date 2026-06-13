<template>
  <el-card>
    <el-page-header @back="$router.back()" :title="'优惠券列表'" :content="isEdit ? '编辑优惠券' : '创建优惠券'" />
    <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px" style="max-width:700px;margin-top:20px">
      <el-form-item label="名称" prop="name"><el-input v-model="form.name" placeholder="如：新用户满50减10" /></el-form-item>
      <el-form-item label="类型" prop="type">
        <el-select v-model="form.type" :disabled="isEdit">
          <el-option label="满减券" value="full_reduction" />
          <el-option label="折扣券" value="discount" />
          <el-option label="固定金额券" value="fixed_amount" />
        </el-select>
      </el-form-item>

      <!-- 满减券规则 -->
      <template v-if="form.type === 'full_reduction'">
        <el-form-item label="满减门槛"><el-input-number v-model="form.rules.threshold" :min="0" :precision="2" controls-position="right" /></el-form-item>
        <el-form-item label="减免金额"><el-input-number v-model="form.rules.reduceAmount" :min="0" :precision="2" controls-position="right" /></el-form-item>
      </template>

      <!-- 折扣券规则 -->
      <template v-if="form.type === 'discount'">
        <el-form-item label="折扣率"><el-input-number v-model="form.rules.discountRate" :min="0.01" :max="0.99" :step="0.05" :precision="2" controls-position="right" /></el-form-item>
        <el-form-item label="最高减免"><el-input-number v-model="form.rules.maxReduceAmount" :min="0" :precision="2" controls-position="right" /></el-form-item>
      </template>

      <!-- 固定金额券规则 -->
      <template v-if="form.type === 'fixed_amount'">
        <el-form-item label="减免金额"><el-input-number v-model="form.rules.reduceAmount" :min="0" :precision="2" controls-position="right" /></el-form-item>
      </template>

      <el-form-item label="适用范围" prop="applicableScopes">
        <el-checkbox-group v-model="form.applicableScopes">
          <el-checkbox label="全模块通用" value="all" @change="onAllScopeChange" />
          <el-checkbox label="商城" value="mall" :disabled="form.applicableScopes.includes('all')" />
          <el-checkbox label="团购" value="tuan" :disabled="form.applicableScopes.includes('all')" />
          <el-checkbox label="上门服务" value="feeding" :disabled="form.applicableScopes.includes('all')" />
          <el-checkbox label="寄养" value="hosting" :disabled="form.applicableScopes.includes('all')" />
          <el-checkbox label="活动" value="activity" :disabled="form.applicableScopes.includes('all')" />
        </el-checkbox-group>
      </el-form-item>

      <el-form-item label="开放领取">
        <el-switch v-model="form.claimable" active-text="用户可在领券中心自行领取" />
      </el-form-item>
      <el-form-item label="页面弹窗">
        <el-switch v-model="form.popupEnabled" active-text="用户进入指定页面时弹窗发券" />
      </el-form-item>
      <el-form-item v-if="form.popupEnabled" label="触发页面">
        <el-select v-model="form.popupPage" placeholder="选择触发页面">
          <el-option label="宠团团" value="tuan" />
          <el-option label="商城首页" value="mall" />
          <el-option label="上门服务" value="feeding" />
          <el-option label="寄养" value="hosting" />
          <el-option label="首页" value="home" />
        </el-select>
      </el-form-item>
      <el-form-item label="发放总量" prop="stock"><el-input-number v-model="form.stock" :min="1" controls-position="right" /></el-form-item>
      <el-form-item label="每人限领"><el-input-number v-model="form.perUserLimit" :min="1" controls-position="right" /></el-form-item>
      <el-form-item label="有效期(天)"><el-input-number v-model="form.validDays" :min="1" controls-position="right" /></el-form-item>
      <el-form-item label="使用说明"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
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
import { getTemplateDetail, createCouponTemplate, updateCouponTemplate } from '@/api/coupon'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const formRef = ref()
const saving = ref(false)
const isEdit = computed(() => !!route.params.id)
const form = reactive({
  name: '', type: 'full_reduction',
  rules: { threshold: 0, reduceAmount: 0, discountRate: 1, maxReduceAmount: 0 },
  applicableScopes: [], claimable: false, popupEnabled: false, popupPage: '',
  stock: 100, perUserLimit: 1, validDays: 30, description: '',
})
const formRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  applicableScopes: [{ type: 'array', required: true, message: '请选择适用范围', trigger: 'change' }],
}

function onAllScopeChange(checked) {
  if (checked) {
    form.applicableScopes = ['all']
  } else {
    form.applicableScopes = []
  }
}

onMounted(async () => {
  if (isEdit.value) {
    const res = await getTemplateDetail(route.params.id)
    if (res.data) {
      Object.assign(form, res.data)
      if (!form.applicableScopes || form.applicableScopes.length === 0) {
        form.applicableScopes = ['all']
      }
    }
  }
})

async function onSave() {
  await formRef.value.validate()
  saving.value = true
  try {
    const payload = { ...form }
    if (payload.applicableScopes.includes('all')) {
      payload.applicableScopes = []
    }
    if (isEdit.value) { await updateCouponTemplate({ templateId: route.params.id, ...payload }) }
    else { await createCouponTemplate(payload) }
    ElMessage.success('保存成功')
    router.push('/coupon')
  } finally { saving.value = false }
}
</script>
