<template>
  <div v-loading="loading">
    <el-page-header @back="$router.back()" :title="'商城订单'" content="订单详情" />
    <el-card style="margin-top:16px" v-if="order._id">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="ORDER_STATUS_TAG_TYPE[order.status]">{{ ORDER_STATUS_LABELS[order.status] }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="商品">{{ order.productName }}<el-tag v-if="order.items && order.items.length > 1" size="small" style="margin-left:8px">等{{ order.items.length }}件</el-tag></el-descriptions-item>
        <el-descriptions-item label="金额">{{ formatMoney(order.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="收货人">{{ order.receiverName }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ order.receiverPhone }}</el-descriptions-item>
        <el-descriptions-item label="收货地址" :span="2">{{ order.receiverAddress }}</el-descriptions-item>
        <el-descriptions-item label="快递公司" v-if="order.expressCompany">{{ getExpressCompanyLabel(order.expressCompany) }}</el-descriptions-item>
        <el-descriptions-item label="快递单号" v-if="order.expressNo">{{ order.expressNo }}</el-descriptions-item>
        <el-descriptions-item label="发货时间" v-if="order.shippedAt">{{ order.shippedAt }}</el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:20px" v-if="order.status === 'confirmed' || order.status === 'paid'">
        <el-button type="primary" @click="openShipDialog">发货</el-button>
        <el-button type="danger" @click="openRefundDialog">退款</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'shipped'">
        <el-button type="success" @click="onCompleteOrder">完成订单</el-button>
      </div>
      <div style="margin-top:20px" v-if="order.status === 'shipped' || order.status === 'completed'">
        <el-button type="warning" plain @click="openLogisticsDrawer">查看物流状态</el-button>
      </div>
    </el-card>

    <!-- 退款对话框 -->
    <el-dialog v-model="refundDialogVisible" title="订单退款" width="460px" :close-on-click-modal="false">
      <el-form :model="refundForm" label-width="90px">
        <el-form-item label="退款金额" required>
          <el-input-number v-model="refundForm.amount" :min="0.01" :max="Number(order.totalAmount) || 0" :precision="2" :step="0.01" style="width:200px" />
          <span style="margin-left:8px;color:#909399">实付 {{ formatMoney(order.totalAmount) }}</span>
        </el-form-item>
        <el-form-item label="退款原因">
          <el-input v-model="refundForm.reason" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="refundLoading" @click="onConfirmRefund">确认退款</el-button>
      </template>
    </el-dialog>

    <!-- 发货对话框 -->
    <el-dialog v-model="shipDialogVisible" title="订单发货" width="480px" :close-on-click-modal="false">
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

    <!-- 物流状态抽屉 -->
    <el-drawer v-model="logisticsDrawerVisible" title="物流状态" size="420px" :destroy-on-close="true">
      <div v-loading="logisticsLoading">
        <el-card v-if="logisticsInfo.status !== undefined" shadow="never" style="margin-bottom:16px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:14px;color:#606266">运单状态</span>
            <el-tag :color="logisticsInfo.statusColor" effect="dark" size="large">
              {{ logisticsInfo.statusLabel }}
            </el-tag>
          </div>
        </el-card>

        <el-descriptions :column="1" border size="small" style="margin-bottom:16px">
          <el-descriptions-item label="快递公司">{{ getExpressCompanyLabel(logisticsInfo.expressCompany) || '-' }}</el-descriptions-item>
          <el-descriptions-item label="运单号">{{ logisticsInfo.waybillId || '-' }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="logisticsInfo.goodsInfo && logisticsInfo.goodsInfo.length > 0">
          <div style="font-size:14px;color:#606266;margin-bottom:8px">商品信息</div>
          <div v-for="(g, i) in logisticsInfo.goodsInfo" :key="i" style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid #ebeef5">
            <el-image
              v-if="g.goodsImgUrl"
              :src="g.goodsImgUrl"
              style="width:48px;height:48px;border-radius:4px;margin-right:12px"
              fit="cover"
            />
            <span style="font-size:14px">{{ g.goodsName }}</span>
          </div>
        </div>

        <el-alert
          v-if="logisticsInfo.error"
          :title="logisticsInfo.error"
          type="error"
          :closable="false"
          style="margin-top:16px"
        />

        <div style="margin-top:20px;color:#909399;font-size:12px;line-height:1.6">
          <p>说明：微信「物流查询组件」仅返回运单当前状态，不包含详细轨迹节点。</p>
          <p>如需查看详细轨迹，请复制运单号到快递100 / 17Track 等第三方平台查询。</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="logisticsDrawerVisible = false">关闭</el-button>
        <el-button type="primary" :loading="logisticsLoading" @click="openLogisticsDrawer">刷新状态</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getMallOrderDetail, shipMallOrder, completeMallOrder, getLogisticsTrack } from '@/api/mall-order'
import { adminRefund } from '@/api/refund'
import { formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/constants/order'
import { EXPRESS_COMPANY_OPTIONS, getExpressCompanyLabel } from '@/constants/expressCompany'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const loading = ref(false)
const order = ref({})

// ============ 退款对话框 ============
const refundDialogVisible = ref(false)
const refundLoading = ref(false)
const refundForm = ref({ amount: 0, reason: '' })

function openRefundDialog() {
  refundForm.value = { amount: Number(order.value.totalAmount) || 0, reason: '' }
  refundDialogVisible.value = true
}

async function onConfirmRefund() {
  if (!refundForm.value.amount || refundForm.value.amount <= 0) {
    ElMessage.warning('请输入退款金额')
    return
  }
  try {
    await ElMessageBox.confirm(`确认对订单 ${order.value.orderNo || order.value._id} 发起退款 ¥${refundForm.value.amount.toFixed(2)}？`, '退款确认', { type: 'warning' })
  } catch {
    return
  }
  refundLoading.value = true
  try {
    await adminRefund(order.value.orderNo || order.value._id, refundForm.value.amount, refundForm.value.reason || '后台退款')
    ElMessage.success('退款申请已提交')
    refundDialogVisible.value = false
    const res = await getMallOrderDetail(route.params.id)
    order.value = res.data || {}
  } catch (e) {
    ElMessage.error(e?.message || '退款失败')
  } finally {
    refundLoading.value = false
  }
}

async function onCompleteOrder() {
  try {
    await ElMessageBox.confirm('确定将该订单标记为已完成？', '完成订单', { type: 'warning' })
  } catch {
    return
  }
  loading.value = true
  try {
    await completeMallOrder(route.params.id)
    ElMessage.success('已完成')
    const res = await getMallOrderDetail(route.params.id)
    order.value = res.data || {}
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    loading.value = false
  }
}

// ============ 发货对话框 ============
const shipDialogVisible = ref(false)
const shipLoading = ref(false)
const shipForm = ref({
  expressCompany: '',
  expressNo: '',
})
const expressFilterText = ref('')

const filteredExpressOptions = computed(() => {
  if (!expressFilterText.value) return EXPRESS_COMPANY_OPTIONS
  const keyword = expressFilterText.value.toLowerCase()
  return EXPRESS_COMPANY_OPTIONS.filter(o =>
    o.label.toLowerCase().includes(keyword) ||
    o.value.toLowerCase().includes(keyword)
  )
})

function filterExpressCompany(val) {
  expressFilterText.value = val
}

function openShipDialog() {
  shipForm.value = { expressCompany: '', expressNo: '' }
  expressFilterText.value = ''
  shipDialogVisible.value = true
}

function onExpressCompanyChange() {
  // 选择后清空过滤词，避免下次打开还保留过滤状态
  expressFilterText.value = ''
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
    await shipMallOrder(
      route.params.id,
      shipForm.value.expressNo.trim(),
      shipForm.value.expressCompany
    )
    ElMessage.success('发货成功')
    shipDialogVisible.value = false
    const res = await getMallOrderDetail(route.params.id)
    order.value = res.data || {}
  } catch (e) {
    ElMessage.error(e?.message || '发货失败')
  } finally {
    shipLoading.value = false
  }
}

// ============ 物流状态抽屉 ============
const logisticsDrawerVisible = ref(false)
const logisticsLoading = ref(false)
const logisticsInfo = ref({
  status: undefined,
  statusLabel: '',
  statusColor: '',
  waybillId: '',
  expressCompany: '',
  goodsInfo: [],
  error: '',
})

async function openLogisticsDrawer() {
  logisticsDrawerVisible.value = true
  logisticsLoading.value = true
  logisticsInfo.value = { status: undefined, statusLabel: '', statusColor: '', waybillId: '', expressCompany: '', goodsInfo: [], error: '' }
  try {
    const res = await getLogisticsTrack(route.params.id)
    if (res.code === 0 && res.data) {
      logisticsInfo.value = {
        status: res.data.status,
        statusLabel: res.data.statusLabel || '',
        statusColor: res.data.statusColor || '',
        waybillId: res.data.waybillId || '',
        expressCompany: res.data.expressCompany || order.value.expressCompany || '',
        goodsInfo: res.data.goodsInfo || [],
        error: res.data.error || '',
      }
    } else {
      logisticsInfo.value.status = -1
      logisticsInfo.value.statusLabel = '查询失败'
      logisticsInfo.value.statusColor = '#f56c6c'
      logisticsInfo.value.error = res?.message || '查询物流状态失败'
    }
  } catch (e) {
    logisticsInfo.value.status = -1
    logisticsInfo.value.statusLabel = '查询失败'
    logisticsInfo.value.statusColor = '#f56c6c'
    logisticsInfo.value.error = e?.message || '查询物流状态失败'
  } finally {
    logisticsLoading.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try { const res = await getMallOrderDetail(route.params.id); order.value = res.data || {} }
  finally { loading.value = false }
})
</script>
