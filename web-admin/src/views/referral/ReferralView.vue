<template>
  <div v-loading="loading">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>合作伙伴列表</span>
        </div>
      </template>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="nickName" label="合作伙伴" width="140" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">{{ row.status === 'active' ? '正常' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="合作时间" width="170">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewDetail(row)">推广详情</el-button>
            <el-button link :type="row.status === 'active' ? 'danger' : 'success'" @click="toggleStatus(row)">{{ row.status === 'active' ? '禁用' : '启用' }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getAdminList, updateAdminStatus } from '@/api/admin'
import { formatDate } from '@/utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const loading = ref(false)
const list = ref([])

async function fetchPartners() {
  loading.value = true
  try {
    const res = await getAdminList({ pageSize: 1000 })
    const admins = res.data?.list || []
    // 只显示 isPartner=true 且不是超级管理员的记录
    // 用 roles 字段判断（基于角色），不依赖 _id 字符串耦合，避免后续 super_admin 文档 _id 变更导致推荐人列表错乱
    list.value = admins.filter(a => a.isPartner && !a.roles?.includes('super_admin'))
  } catch (e) {
    console.warn('[ReferralView] 加载合作伙伴列表失败:', e.message)
  } finally {
    loading.value = false
  }
}

function viewDetail(row) {
  router.push({ name: 'ReferralUsers', params: { targetOpenid: row._id }, query: { name: row.nickName || '' } })
}

async function toggleStatus(row) {
  const newStatus = row.status === 'active' ? 'disabled' : 'active'
  await ElMessageBox.confirm(`确定${newStatus === 'disabled' ? '禁用' : '启用'}该合作伙伴？`)
  await updateAdminStatus(row._id, newStatus)
  ElMessage.success('操作成功')
  fetchPartners()
}

onMounted(() => {
  fetchPartners()
})
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header span { font-weight: 600; font-size: 14px; color: var(--text-primary); }
</style>
