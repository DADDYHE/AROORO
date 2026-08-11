<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'团购订单'" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="ORDER_STATUS_TAG_TYPE[order.status]">{{ ORDER_STATUS_LABELS[order.status] || order.status }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="商品">{{ order.productName }}</el-descriptions-item>
        <el-descriptions-item label="规格">{{ order.skuText || '-' }}</el-descriptions-item>
        <el-descriptions-item label="单价">{{ formatMoney(order.unitPrice) }}</el-descriptions-item>
        <el-descriptions-item label="数量">{{ order.quantity }}</el-descriptions-item>
        <el-descriptions-item label="金额" :span="2">{{ formatMoney(order.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="买家">{{ order.buyerNickName || order.receiverName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.receiverPhone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="收货地址" :span="2">{{ order.receiverAddress || '-' }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ formatDate(order.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="支付时间">{{ formatDate(order.paidAt) }}</el-descriptions-item>
        <el-descriptions-item label="支付状态">
          <el-tag :type="PAYMENT_STATUS_TAG_TYPE[normalizePaymentStatus(order)] || 'info'" size="small">{{ PAYMENT_STATUS_LABELS[normalizePaymentStatus(order)] || '未支付' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="微信订单号" :span="2">{{ order.transactionId || order.wxTransactionId || '-' }}</el-descriptions-item>
        <el-descriptions-item v-if="order.expressCompany" label="快递公司">{{ getExpressCompanyLabel(order.expressCompany) }}</el-descriptions-item>
        <el-descriptions-item v-if="order.expressNo" label="快递单号">{{ order.expressNo }}</el-descriptions-item>
        <el-descriptions-item v-if="order.wxOrderState" label="微信发货状态">
          wx_order_state={{ order.wxOrderState }}<span v-if="order.wxShipping?.finish_shipping">（已发货 finish_shipping=true）</span>
        </el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:20px" v-if="order.status === 'paid' || order.status === 'confirmed' || order.status === 'pending_shipment'">
        <el-button type="primary" @click="openShipDialog">发货</el-button>
        <el-button type="danger" @click="onCancelOrder">取消订单</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'shipped'">
        <el-button type="success" @click="onCompleteOrder">完成订单</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'pending_payment'">
        <el-button type="danger" @click="onCancelOrder">取消订单</el-button>
      </div>
    </el-card>

    <!-- 发货对话框 -->
    <el-dialog v-model="shipDialogVisible" title="团购订单发货" width="480px" :close-on-click-modal="false">
      <el-form :model="shipForm" label-width="90px" @submit.prevent>
        <el-form-item label="快递公司" required>
          <el-select
            v-model="shipForm.expressCompany"
            placeholder="请选择快递公司"
            filterable
            :filter-method="filterExpressCompany"
            style="width: 100%"
            @change="onExpressCompanyChange"
          >
            <el-option
              v-for="item in filteredExpressOptions"
              :key="item.value"
              :label="`${item.label}（${item.value}）`"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="快递单号" required>
          <el-input
            v-model="shipForm.expressNo"
            placeholder="请输入快递单号"
            clearable
            maxlength="50"
            show-word-limit
            @keyup.enter="onConfirmShip"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shipDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="shipLoading" @click="onConfirmShip">确认发货</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { getTuanDealOrderDetail, handleTuanOrder } from '@/api/order'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TAG_TYPE } from '@/constants/order'
import { normalizePaymentStatus } from '@/utils/payment-status'
import { EXPRESS_COMPANY_OPTIONS, getExpressCompanyLabel } from '@/constants/expressCompany'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const loading = ref(false)
const order = ref({})

// 发货对话框
const shipDialogVisible = ref(false)
const shipLoading = ref(false)
const shipForm = ref({ expressCompany: '', expressNo: '' })
const expressFilterText = ref('')
const filteredExpressOptions = computed(() => {
  const kw = expressFilterText.value.trim()
  if (!kw) return EXPRESS_COMPANY_OPTIONS
  return EXPRESS_COMPANY_OPTIONS.filter(i => i.label.includes(kw) || i.value.includes(kw))
})

async function fetchDetail() {
  loading.value = true
  try {
    const res = await getTuanDealOrderDetail(route.params.id)
    order.value = res.data || {}
  } finally {
    loading.value = false
  }
}

function openShipDialog() {
  shipForm.value = { expressCompany: '', expressNo: '' }
  expressFilterText.value = ''
  shipDialogVisible.value = true
}

function onExpressCompanyChange() {
  expressFilterText.value = ''
}

function filterExpressCompany(val) {
  expressFilterText.value = val
}

async function onConfirmShip() {
  if (!shipForm.value.expressCompany) {
    ElMessage.warning('请选择快递公司')
    return
  }
  if (!shipForm.value.expressNo || !shipForm.value.expressNo.trim()) {
    ElMessage.warning('请输入快递单号')
    return
  }
  shipLoading.value = true
  try {
    await handleTuanOrder(route.params.id, 'ship', {
      expressCompany: shipForm.value.expressCompany,
      expressNo: shipForm.value.expressNo.trim(),
    })
    ElMessage.success('发货成功')
    shipDialogVisible.value = false
    await fetchDetail()
  } catch (e) {
    ElMessage.error(e?.message || '发货失败')
  } finally {
    shipLoading.value = false
  }
}

async function onCancelOrder() {
  try {
    await ElMessageBox.confirm('确定取消该团购订单？已支付订单将发起退款。', '取消订单', { type: 'warning' })
  } catch {
    return
  }
  loading.value = true
  try {
    await handleTuanOrder(route.params.id, 'cancel')
    ElMessage.success('已取消')
    await fetchDetail()
  } catch (e) {
    ElMessage.error(e?.message || '取消失败')
  } finally {
    loading.value = false
  }
}

async function onCompleteOrder() {
  try {
    await ElMessageBox.confirm('确定将该团购订单标记为已完成？', '完成订单', { type: 'warning' })
  } catch {
    return
  }
  loading.value = true
  try {
    await handleTuanOrder(route.params.id, 'complete')
    ElMessage.success('已完成')
    await fetchDetail()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    loading.value = false
  }
}

onMounted(fetchDetail)
</script>
