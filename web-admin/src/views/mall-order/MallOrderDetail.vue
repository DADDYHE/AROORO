<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'商城订单'" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="ORDER_STATUS_TAG_TYPE[order.status]">{{ ORDER_STATUS_LABELS[order.status] }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="商品">{{ order.productName }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ formatMoney(order.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="收货人">{{ order.receiverName }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.receiverPhone }}</el-descriptions-item>
        <el-descriptions-item label="收货地址" :span="2">{{ order.receiverAddress }}</el-descriptions-item>
        <el-descriptions-item label="快递公司" v-if="order.expressCompany">{{ order.expressCompany }}</el-descriptions-item>
        <el-descriptions-item label="快递单号" v-if="order.expressNo">{{ order.expressNo }}</el-descriptions-item>
        <el-descriptions-item label="发货时间" v-if="order.shippedAt">{{ order.shippedAt }}</el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:20px" v-if="order.status === 'confirmed' || order.status === 'paid'">
        <el-button type="primary" @click="onShip">发货</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getMallOrderDetail, shipMallOrder } from '@/api/mall-order'
import { formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/constants/order'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const loading = ref(false)
const order = ref({})

const EXPRESS_COMPANY_OPTIONS = [
  { value: 'ZTO', label: '中通快递' },
  { value: 'SF', label: '顺丰速运' },
  { value: 'YTO', label: '圆通速递' },
  { value: 'STO', label: '申通快递' },
  { value: 'HTKY', label: '百世快递' },
  { value: 'JD', label: '京东物流' },
  { value: 'EMS', label: 'EMS' },
  { value: 'ZJS', label: '宅急送' },
  { value: 'DBL', label: '德邦快递' },
  { value: 'POSTB', label: '邮政包裹' },
  { value: 'OTHER', label: '其他' },
]

onMounted(async () => {
  loading.value = true
  try { const res = await getMallOrderDetail(route.params.id); order.value = res.data || {} }
  finally { loading.value = false }
})

async function onShip() {
  // 简化版：先 prompt 快递公司编码，再 prompt 快递单号
  const optionsText = EXPRESS_COMPANY_OPTIONS.map(o => `${o.value}=${o.label}`).join(' / ')
  const { value: companyCode } = await ElMessageBox.prompt(
    `请输入快递公司编码（${optionsText}）`,
    '发货 - 快递公司',
    { inputPlaceholder: '如 ZTO' }
  ).catch(() => ({ value: null }))
  if (!companyCode) return

  const matched = EXPRESS_COMPANY_OPTIONS.find(o => o.value === companyCode.toUpperCase())
  if (!matched) {
    ElMessage.error(`快递公司编码无效：${companyCode}`)
    return
  }

  const { value: expressNo } = await ElMessageBox.prompt(
    `请输入 ${matched.label} 的快递单号`,
    '发货 - 快递单号',
    { inputPlaceholder: '快递单号' }
  ).catch(() => ({ value: null }))
  if (!expressNo) return

  await shipMallOrder(route.params.id, expressNo, matched.value)
  ElMessage.success('发货成功')
  const res = await getMallOrderDetail(route.params.id)
  order.value = res.data || {}
}
</script>
