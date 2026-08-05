<template>
  <el-card>
    <div class="toolbar"><el-button type="primary" @click="$router.push('/coupon/create')">创建优惠券</el-button></div>
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="100">
        <template #default="{ row }">{{ typeMap[row.type] || row.type }}</template>
      </el-table-column>
      <el-table-column label="适用范围" width="160">
        <template #default="{ row }">
          <template v-if="!row.applicableScopes || row.applicableScopes.length === 0">
            <el-tag size="small">全模块</el-tag>
          </template>
          <template v-else>
            <el-tag v-for="s in row.applicableScopes" :key="s" size="small" style="margin:2px">{{ scopeMap[s] || s }}</el-tag>
          </template>
        </template>
      </el-table-column>
      <el-table-column prop="totalCount" label="发放总量" width="100" />
      <el-table-column prop="claimedCount" label="已领取" width="80" />
      <el-table-column prop="usedCount" label="已使用" width="80" />
      <el-table-column label="领券中心" width="90" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.claimable" @change="(val) => toggleClaimable(row._id, val)" />
        </template>
      </el-table-column>
      <el-table-column label="页面弹窗" width="160" align="center">
        <template #default="{ row }">
          <div style="display:inline-flex;align-items:center;gap:6px">
            <el-switch :model-value="row.popupEnabled" @change="(val) => togglePopup(row._id, val, row.popupPage)" />
            <!-- 弹窗仅在小程序"宠团团（discover）"页实现，其余页面值不会触发，暂不提供 -->
            <el-select v-if="row.popupEnabled" :model-value="row.popupPage || 'tuan'" size="small" style="width:110px" @change="(val) => togglePopup(row._id, true, val)">
              <el-option label="宠团团（已实现）" value="tuan" />
            </el-select>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }"><el-switch :model-value="row.status === 'active'" @change="(val) => toggleStatus(row._id, val ? 'start' : 'pause')" /></template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="success" @click="openGrantDialog(row)" :disabled="row.status !== 'active'">发放</el-button>
          <el-button link type="primary" @click="$router.push(`/coupon/${row._id}/edit`)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row._id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />

    <!-- 发放对话框 -->
    <el-dialog v-model="grantDialogVisible" title="发放优惠券" width="520px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="优惠券">
          <span>{{ grantTemplate.name }}（{{ typeMap[grantTemplate.type] || grantTemplate.type }}）</span>
        </el-form-item>
        <el-form-item label="发放方式">
          <el-radio-group v-model="grantForm.grantType">
            <el-radio value="manual_single">指定用户</el-radio>
            <el-radio value="manual_batch">批量发放</el-radio>
            <el-radio value="open_claim">开放领取</el-radio>
            <el-radio value="page_popup">页面弹窗</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- 指定用户 -->
        <template v-if="grantForm.grantType === 'manual_single'">
          <el-form-item label="用户ID">
            <el-input v-model="grantForm.userInput" placeholder="输入用户openid" />
          </el-form-item>
        </template>

        <!-- 批量发放 -->
        <template v-if="grantForm.grantType === 'manual_batch'">
          <el-form-item label="用户ID列表">
            <el-input v-model="grantForm.userInput" type="textarea" :rows="4" placeholder="每行一个用户openid" />
          </el-form-item>
        </template>

        <!-- 开放领取 -->
        <template v-if="grantForm.grantType === 'open_claim'">
          <el-form-item label="开放领取">
            <el-switch v-model="grantForm.claimable" active-text="用户可在领券中心自行领取" inactive-text="关闭后用户无法主动领取" />
          </el-form-item>
          <el-form-item label="每人限领">
            <el-input-number v-model="grantForm.perUserLimit" :min="1" controls-position="right" />
          </el-form-item>
        </template>

        <!-- 页面弹窗 -->
        <template v-if="grantForm.grantType === 'page_popup'">
          <el-form-item label="启用弹窗">
            <el-switch v-model="grantForm.popupEnabled" active-text="用户进入指定页面时弹窗发券" inactive-text="关闭后不再弹窗" />
          </el-form-item>
          <el-form-item v-if="grantForm.popupEnabled" label="触发页面">
            <el-select v-model="grantForm.popupPage" placeholder="选择触发页面">
              <!-- 弹窗仅在小程序"宠团团（discover）"页实现 -->
              <el-option label="宠团团（已实现）" value="tuan" />
            </el-select>
          </el-form-item>
        </template>

        <el-form-item v-if="grantForm.grantType !== 'open_claim' && grantForm.grantType !== 'page_popup'" label="备注">
          <el-input v-model="grantForm.note" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="grantDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="granting" @click="onGrant">确认</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { getTemplateList, toggleCouponTemplateStatus, deleteCouponTemplate, createCouponGrant, updateCouponTemplate } from '@/api/coupon'
import { usePagination } from '@/composables/usePagination'
import { ElMessage, ElMessageBox } from 'element-plus'

const typeMap = { full_reduction: '满减券', discount: '折扣券', fixed_amount: '固定金额券' }
const scopeMap = { all: '全模块', mall: '商城', tuan: '团购', feeding: '上门服务', boarding: '寄养', hosting: '寄养', activity: '活动' }

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getTemplateList)

async function toggleStatus(id, operation) {
  await toggleCouponTemplateStatus(id, operation)
  ElMessage.success('操作成功')
  fetch()
}

async function toggleClaimable(id, val) {
  await updateCouponTemplate({ templateId: id, claimable: val })
  ElMessage.success(val ? '已开放领券中心领取' : '已关闭领券中心领取')
  fetch()
}

async function togglePopup(id, enabled, page) {
  await updateCouponTemplate({ templateId: id, popupEnabled: enabled, popupPage: page || 'tuan' })
  ElMessage.success(enabled ? `已启用页面弹窗（${scopeMap[page] || page}）` : '已关闭页面弹窗')
  fetch()
}

async function onDelete(id) {
  await ElMessageBox.confirm('确定删除？', '警告', { type: 'warning' })
  await deleteCouponTemplate(id)
  ElMessage.success('已删除')
  fetch()
}

// 发放相关
const grantDialogVisible = ref(false)
const granting = ref(false)
const grantTemplate = reactive({ name: '', type: '', _id: '', claimable: false, perUserLimit: 1 })
const grantForm = reactive({ grantType: 'manual_single', userInput: '', note: '', claimable: true, perUserLimit: 1, popupEnabled: true, popupPage: 'tuan' })

function openGrantDialog(row) {
  grantTemplate.name = row.name
  grantTemplate.type = row.type
  grantTemplate._id = row._id
  grantTemplate.claimable = row.claimable || false
  grantTemplate.perUserLimit = row.perUserLimit || 1
  grantForm.grantType = 'manual_single'
  grantForm.userInput = ''
  grantForm.note = ''
  grantForm.claimable = row.claimable || false
  grantForm.perUserLimit = row.perUserLimit || 1
  grantForm.popupEnabled = row.popupEnabled || false
  grantForm.popupPage = row.popupPage || 'tuan'
  grantDialogVisible.value = true
}

async function onGrant() {
  if (grantForm.grantType === 'open_claim') {
    granting.value = true
    try {
      await updateCouponTemplate({
        templateId: grantTemplate._id,
        claimable: grantForm.claimable,
        perUserLimit: grantForm.perUserLimit,
      })
      ElMessage.success(grantForm.claimable ? '已开放领取，用户可在领券中心自行领取' : '已关闭领取')
      grantDialogVisible.value = false
      fetch()
    } finally {
      granting.value = false
    }
    return
  }

  if (grantForm.grantType === 'page_popup') {
    granting.value = true
    try {
      await updateCouponTemplate({
        templateId: grantTemplate._id,
        popupEnabled: grantForm.popupEnabled,
        popupPage: grantForm.popupPage,
      })
      ElMessage.success(grantForm.popupEnabled ? `已启用页面弹窗，用户进入${scopeMap[grantForm.popupPage] || grantForm.popupPage}时将弹窗发券` : '已关闭页面弹窗')
      grantDialogVisible.value = false
      fetch()
    } finally {
      granting.value = false
    }
    return
  }

  // 指定用户 / 批量发放
  const userIds = grantForm.grantType === 'manual_single'
    ? [grantForm.userInput.trim()]
    : grantForm.userInput.split('\n').map(s => s.trim()).filter(Boolean)

  if (!userIds.length || !userIds[0]) {
    ElMessage.warning('请输入用户ID')
    return
  }

  granting.value = true
  try {
    await createCouponGrant({
      templateId: grantTemplate._id,
      grantType: grantForm.grantType,
      userIds,
      note: grantForm.note || undefined,
    })
    ElMessage.success(`成功发放 ${userIds.length} 张优惠券`)
    grantDialogVisible.value = false
    fetch()
  } finally {
    granting.value = false
  }
}

fetch()
</script>

<style scoped>
.toolbar { margin-bottom: var(--spacing-md); }
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
</style>
