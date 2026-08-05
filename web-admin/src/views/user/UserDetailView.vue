<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'用户列表'" :content="user.nickName || '用户详情'" />
    <el-card style="margin-top:16px" v-if="user._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="昵称">{{ user.nickName }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ user.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="合作伙伴"><el-tag :type="user.isPartner ? 'success' : 'info'">{{ user.isPartner ? '是' : '否' }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="注册时间">{{ formatDate(user.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="订单数">{{ user.orderCount || 0 }}</el-descriptions-item>
        <el-descriptions-item label="消费总额">{{ formatMoney(user.totalSpent) }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- P1 修复：后台宠物档案管理——用户详情展示其宠物列表 -->
    <el-card style="margin-top:16px" v-if="user._id">
      <template #header>
        <div style="display:flex;align-items:center;gap:10px">
          <span>宠物档案</span>
          <el-tag size="small" type="info">{{ pets.length }} 只</el-tag>
        </div>
      </template>
      <div v-loading="petsLoading">
        <el-table :data="pets" stripe>
          <el-table-column label="头像" width="80">
            <template #default="{ row }">
              <el-avatar :size="40" :src="row.avatarUrl || '/images/default-avatar.svg'">{{ (row.name || '?')[0] }}</el-avatar>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="昵称" width="120" />
          <el-table-column label="类型" width="90">
            <template #default="{ row }">{{ PET_TYPE_MAP[row.type] || row.type || '-' }}</template>
          </el-table-column>
          <el-table-column prop="breed" label="品种" min-width="120" />
          <el-table-column label="性别" width="80">
            <template #default="{ row }">{{ row.gender === 'male' ? '弟弟' : row.gender === 'female' ? '妹妹' : row.gender === 'unknown' ? '不确定' : '-' }}</template>
          </el-table-column>
          <el-table-column prop="birthday" label="生日" width="110" />
          <el-table-column label="体重" width="100">
            <template #default="{ row }">{{ row.weight != null ? `${row.weight} kg` : '-' }}</template>
          </el-table-column>
          <el-table-column prop="note" label="备注" min-width="140" show-overflow-tooltip />
        </el-table>
        <el-empty v-if="!petsLoading && pets.length === 0" description="该用户暂无宠物档案" :image-size="60" />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getUserDetail, getUserPets } from '@/api/user'
import { formatDate, formatMoney } from '@/utils/format'

const route = useRoute()
const loading = ref(false)
const user = ref({})
const pets = ref([])
const petsLoading = ref(false)

const PET_TYPE_MAP = { dog: '狗狗', cat: '猫咪', exotic: '异宠' }

onMounted(async () => {
  if (!route.params.id) return
  loading.value = true
  try {
    const res = await getUserDetail(route.params.id)
    user.value = res.data || {}
    if (user.value._id || route.params.id) {
      petsLoading.value = true
      try {
        const petRes = await getUserPets(user.value._id || route.params.id)
        pets.value = petRes.data?.list || []
      } finally {
        petsLoading.value = false
      }
    }
  } finally {
    loading.value = false
  }
})
</script>
