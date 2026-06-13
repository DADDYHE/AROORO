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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getUserDetail } from '@/api/user'
import { formatDate, formatMoney } from '@/utils/format'

const route = useRoute()
const loading = ref(false)
const user = ref({})

onMounted(async () => {
  if (!route.params.id) return
  loading.value = true
  try { const res = await getUserDetail(route.params.id); user.value = res.data || {} }
  finally { loading.value = false }
})
</script>
