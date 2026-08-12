<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="720px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    @update:model-value="emit('update:visible', $event)"
  >
    <div v-loading="loading" style="min-height:200px">
      <template v-if="order._id">
        <!-- 状态操作区 -->
        <div class="op-bar" v-if="opButtons.length">
          <el-button
            v-for="btn in opButtons"
            :key="btn.label"
            :type="btn.type"
            :plain="btn.plain"
            @click="btn.handler"
          >{{ btn.label }}</el-button>
        </div>

        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ order.orderNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="orderStatusTagType(order.status)">{{ orderStatusLabel(order.status) }}</el-tag>
          </el-descriptions-item>

          <!-- 商城/团购：收货人 -->
          <template v-if="orderType === 'mall'">
            <el-descriptions-item label="商品">{{ order.productName }}<el-tag v-if="order.items && order.items.length > 1" size="small" style="margin-left:8px">等{{ order.items.length }}件</el-tag></el-descriptions-item>
            <el-descriptions-item label="金额">{{ formatMoney(order.totalAmount) }}</el-descriptions-item>
            <el-descriptions-item label="收货人">{{ order.receiverName }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ order.receiverPhone }}</el-descriptions-item>
            <el-descriptions-item label="收货地址" :span="2">{{ order.receiverAddress }}</el-descriptions-item>
            <el-descriptions-item label="快递公司" v-if="order.expressCompany">{{ getExpressCompanyLabel(order.expressCompany) }}</el-descriptions-item>
            <el-descriptions-item label="快递单号" v-if="order.expressNo">{{ order.expressNo }}</el-descriptions-item>
            <el-descriptions-item label="发货时间" v-if="order.shippedAt">{{ order.shippedAt }}</el-descriptions-item>
          </template>

          <template v-if="orderType === 'tuan'">
            <el-descriptions-item label="商品">{{ order.productName }}</el-descriptions-item>
            <el-descriptions-item label="规格">{{ order.skuText || '-' }}</el-descriptions-item>
            <el-descriptions-item label="单价">{{ formatMoney(order.unitPrice) }}</el-descriptions-item>
            <el-descriptions-item label="数量">{{ order.quantity }}</el-descriptions-item>
            <el-descriptions-item label="金额" :span="2">{{ formatMoney(order.totalAmount) }}</el-descriptions-item>
            <el-descriptions-item label="买家">{{ order.buyerNickName || order.receiverName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ order.receiverPhone || '-' }}</el-descriptions-item>
            <el-descriptions-item label="收货地址" :span="2">{{ order.receiverAddress || '-' }}</el-descriptions-item>
            <el-descriptions-item v-if="order.expressCompany" label="快递公司">{{ getExpressCompanyLabel(order.expressCompany) }}</el-descriptions-item>
            <el-descriptions-item v-if="order.expressNo" label="快递单号">{{ order.expressNo }}</el-descriptions-item>
          </template>

          <template v-if="orderType === 'feeding'">
            <el-descriptions-item label="用户">{{ order.userName || order.ownerName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ order.contactPhone || order.userPhone || order.buyerPhone || '-' }}</el-descriptions-item>
            <el-descriptions-item label="服务地址" :span="2">{{ order.address || '-' }}</el-descriptions-item>
            <el-descriptions-item label="服务时间">{{ order.startDate ? formatDate(order.startDate) : '-' }}</el-descriptions-item>
            <el-descriptions-item label="金额">{{ formatMoney(order.totalPrice || order.totalAmount) }}</el-descriptions-item>
            <el-descriptions-item label="宠物">{{ petNamesText }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ order.note || order.remark || '-' }}</el-descriptions-item>
          </template>

          <template v-if="orderType === 'activity'">
            <el-descriptions-item label="活动">{{ order.activityTitle || '-' }}</el-descriptions-item>
            <el-descriptions-item label="用户">{{ order.buyerNickName || order.ownerName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ order.contactPhone || order.buyerPhone || order.phone || '-' }}</el-descriptions-item>
            <el-descriptions-item label="实付金额">{{ formatMoney(order.totalPrice || order.totalAmount || order.finalAmount) }}</el-descriptions-item>
            <el-descriptions-item label="优惠券抵扣">{{ order.couponDiscount ? `-¥${order.couponDiscount}` : '-' }}</el-descriptions-item>
            <el-descriptions-item label="参与人数">{{ order.participantCount || 1 }} 人</el-descriptions-item>
            <el-descriptions-item label="宠物">{{ petNamesText }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ order.notes || '-' }}</el-descriptions-item>
          </template>

          <el-descriptions-item label="下单时间">{{ formatDate(order.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatDate(order.paidAt) }}</el-descriptions-item>
        </el-descriptions>
      </template>
      <el-empty v-else-if="!loading" description="未找到订单" />
    </div>

    <template #footer>
      <el-button @click="emit('update:visible', false)">关闭</el-button>
    </template>

    <!-- 物流状态抽屉 -->
    <el-drawer v-model="logisticsDrawerVisible" title="物流状态" size="420px" :destroy-on-close="true">
      <div v-loading="logisticsLoading">
        <el-card v-if="logisticsInfo.status !== undefined" shadow="never" style="margin-bottom:16px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:14px;color:#606266">运单状态</span>
            <el-tag :color="logisticsInfo.statusColor" effect="dark" size="large">{{ logisticsInfo.statusLabel }}</el-tag>
          </div>
        </el-card>
        <el-descriptions :column="1" border size="small" style="margin-bottom:16px">
          <el-descriptions-item label="快递公司">{{ getExpressCompanyLabel(logisticsInfo.expressCompany) || '-' }}</el-descriptions-item>
          <el-descriptions-item label="运单号">{{ logisticsInfo.waybillId || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="logisticsInfo.goodsInfo && logisticsInfo.goodsInfo.length > 0">
          <div style="font-size:14px;color:#606266;margin-bottom:8px">商品信息</div>
          <div v-for="(g, i) in logisticsInfo.goodsInfo" :key="i" style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid #ebeef5">
            <el-image v-if="g.goodsImgUrl" :src="g.goodsImgUrl" style="width:48px;height:48px;border-radius:4px;margin-right:12px" fit="cover" />
            <span style="font-size:14px">{{ g.goodsName }}</span>
          </div>
        </div>
        <el-alert v-if="logisticsInfo.error" :title="logisticsInfo.error" type="error" :closable="false" style="margin-top:16px" />
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

    <!-- 退款对话框 -->
    <el-dialog v-model="refundDialogVisible" :title="`${typeLabel}退款`" width="460px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="退款金额" required>
          <el-input-number v-model="refundForm.amount" :min="0.01" :precision="2" :max="maxRefundAmount" controls-position="right" style="width:220px" />
          <span class="hint">最多 ¥{{ maxRefundAmount }}</span>
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
    <el-dialog v-model="shipDialogVisible" :title="`${typeLabel}发货`" width="480px" :close-on-click-modal="false">
      <el-form :model="shipForm" label-width="90px" @submit.prevent>
        <el-form-item label="快递公司" required>
          <el-select v-model="shipForm.expressCompany" placeholder="请选择快递公司" filterable :filter-method="filterExpressCompany" style="width: 100%" @change="onExpressCompanyChange">
            <el-option v-for="item in filteredExpressOptions" :key="item.value" :label="`${item.label}（${item.value}）`" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="快递单号" required>
          <el-input v-model="shipForm.expressNo" placeholder="请输入快递单号" clearable maxlength="50" show-word-limit @keyup.enter="onConfirmShip" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shipDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading" @click="onConfirmShip">确认发货</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { getMallOrderDetail, shipMallOrder, completeMallOrder, getLogisticsTrack } from '@/api/mall-order'
import { getTuanDealOrderDetail, handleTuanOrder } from '@/api/order'
import { getFeedingOrderDetail, handleFeedingOrder } from '@/api/feeding'
import { getActivityOrderDetail } from '@/api/activity'
import { adminRefund } from '@/api/refund'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TAG_TYPE } from '@/constants/order'
import { EXPRESS_COMPANY_OPTIONS, getExpressCompanyLabel } from '@/constants/expressCompany'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({
  visible: { type: Boolean, default: false },
  orderType: { type: String, required: true }, // mall / tuan / feeding / activity
  orderId: { type: String, default: '' },
})
const emit = defineEmits(['update:visible', 'updated'])

const loading = ref(false)
const actionLoading = ref(false)
const order = ref({})

const TYPE_TITLE = { mall: '商城订单', tuan: '团购订单', feeding: '上门服务订单', activity: '活动订单' }
const typeLabel = computed(() => TYPE_TITLE[props.orderType] || '订单')
const title = computed(() => `${typeLabel.value}详情`)

async function fetchDetail() {
  loading.value = true
  try {
    const fns = {
      mall: getMallOrderDetail,
      tuan: getTuanDealOrderDetail,
      feeding: getFeedingOrderDetail,
      activity: getActivityOrderDetail,
    }
    const fn = fns[props.orderType]
    if (!fn || !props.orderId) return
    const res = await fn(props.orderId)
    order.value = res.data || {}
  } finally {
    loading.value = false
  }
}

watch(() => props.visible, (v) => {
  if (v) {
    order.value = {}
    fetchDetail()
  }
})

function orderStatusLabel(s) {
  if (props.orderType === 'feeding') {
    return FEEDING_STATUS[s] || s
  }
  return ORDER_STATUS_LABELS[s] || s
}
function orderStatusTagType(s) {
  return ORDER_STATUS_TAG_TYPE[s] || 'info'
}

const FEEDING_STATUS = { pending_payment: '待支付', paid: '已支付', confirmed: '已确认', in_progress: '进行中', completed: '已完成', rejected: '已拒绝', cancelled: '已取消', refunded: '已退款' }

// ============ 宠物名 ============
const petNamesText = computed(() => {
  const details = order.value.petDetails || order.value.petsInfo || order.value.pets || []
  if (details.length > 0) {
    return details.map(p => p.name || p.petName || p.nickName || '').filter(Boolean).join('、') || '-'
  }
  return order.value.petName || order.value.petNames || '-'
})

// ============ 操作按钮 ============
const opButtons = computed(() => {
  const btns = []
  const s = order.value.status
  const t = props.orderType
  if (t === 'mall') {
    if (s === 'paid') {
      btns.push({ label: '发货', type: 'primary', handler: openShipDialog })
      btns.push({ label: '退款', type: 'danger', handler: openRefundDialog })
    }
    if (s === 'shipped') btns.push({ label: '完成订单', type: 'success', handler: onCompleteOrder })
    if (s === 'shipped' || s === 'completed') btns.push({ label: '查看物流状态', type: 'warning', plain: true, handler: openLogisticsDrawer })
  } else if (t === 'tuan') {
    if (s === 'paid') {
      btns.push({ label: '发货', type: 'primary', handler: openShipDialog })
      btns.push({ label: '取消订单', type: 'danger', handler: onCancelOrder })
    }
    if (s === 'shipped') btns.push({ label: '完成订单', type: 'success', handler: onCompleteOrder })
    if (s === 'pending_payment') btns.push({ label: '取消订单', type: 'danger', handler: onCancelOrder })
  } else if (t === 'feeding') {
    if (s === 'paid') btns.push({ label: '确认订单', type: 'primary', handler: () => handleOrder('confirm') })
    if (s === 'pending_payment') btns.push({ label: '取消', type: 'danger', handler: () => handleOrder('cancel') })
    if (s === 'confirmed') btns.push({ label: '开始服务', type: 'success', handler: () => handleOrder('start') })
    if (s === 'in_progress') btns.push({ label: '完成服务', type: 'success', handler: () => handleOrder('complete') })
    if ((s === 'paid' || s === 'confirmed' || s === 'in_progress') && order.value.paymentStatus === 'paid') btns.push({ label: '退款', type: 'danger', handler: openRefundDialog })
  } else if (t === 'activity') {
    if (s === 'paid' && order.value.paymentStatus === 'paid') btns.push({ label: '退款', type: 'danger', handler: openRefundDialog })
  }
  return btns
})

async function handleOrder(operation) {
  const labels = { confirm: '确认', start: '开始', complete: '完成', cancel: '取消' }
  try {
    await ElMessageBox.confirm(`确定${labels[operation]}该订单？`)
  } catch { return }
  actionLoading.value = true
  try {
    await handleFeedingOrder(props.orderId, operation)
    ElMessage.success('操作成功')
    emit('updated')
    await fetchDetail()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    actionLoading.value = false
  }
}

async function onCompleteOrder() {
  try {
    await ElMessageBox.confirm('确定将该订单标记为已完成？', '完成订单', { type: 'warning' })
  } catch { return }
  actionLoading.value = true
  try {
    if (props.orderType === 'mall') {
      await completeMallOrder(props.orderId)
    } else {
      await handleTuanOrder(props.orderId, 'complete')
    }
    ElMessage.success('已完成')
    emit('updated')
    await fetchDetail()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    actionLoading.value = false
  }
}

async function onCancelOrder() {
  try {
    await ElMessageBox.confirm('确定取消该订单？已支付订单将发起退款。', '取消订单', { type: 'warning' })
  } catch { return }
  actionLoading.value = true
  try {
    await handleTuanOrder(props.orderId, 'cancel')
    ElMessage.success('已取消')
    emit('updated')
    await fetchDetail()
  } catch (e) {
    ElMessage.error(e?.message || '取消失败')
  } finally {
    actionLoading.value = false
  }
}

// ============ 退款 ============
const refundDialogVisible = ref(false)
const refundLoading = ref(false)
const refundForm = ref({ amount: 0, reason: '' })
const maxRefundAmount = computed(() => Number(order.value.paidAmount || order.value.totalAmount || order.value.totalPrice || order.value.finalAmount || 0))

function openRefundDialog() {
  refundForm.value = { amount: maxRefundAmount.value, reason: '' }
  refundDialogVisible.value = true
}

async function onConfirmRefund() {
  if (!refundForm.value.amount || refundForm.value.amount <= 0) {
    ElMessage.warning('请输入退款金额')
    return
  }
  const tradeNo = order.value.outTradeNo || order.value.orderNo
  if (!tradeNo) {
    ElMessage.warning('该订单缺少微信支付单号，无法退款')
    return
  }
  try {
    await ElMessageBox.confirm(`确认对订单 ${tradeNo} 发起退款 ¥${refundForm.value.amount.toFixed(2)}？`, '退款确认', { type: 'warning' })
  } catch { return }
  refundLoading.value = true
  try {
    await adminRefund(tradeNo, refundForm.value.amount, refundForm.value.reason || '后台退款')
    ElMessage.success('退款申请已提交')
    refundDialogVisible.value = false
    emit('updated')
    await fetchDetail()
  } catch (e) {
    ElMessage.error(e?.message || '退款失败')
  } finally {
    refundLoading.value = false
  }
}

// ============ 发货 ============
const shipDialogVisible = ref(false)
const shipForm = ref({ expressCompany: '', expressNo: '' })
const expressFilterText = ref('')
const filteredExpressOptions = computed(() => {
  const kw = expressFilterText.value.trim()
  if (!kw) return EXPRESS_COMPANY_OPTIONS
  return EXPRESS_COMPANY_OPTIONS.filter(i => i.label.includes(kw) || i.value.includes(kw))
})

function openShipDialog() {
  shipForm.value = { expressCompany: '', expressNo: '' }
  expressFilterText.value = ''
  shipDialogVisible.value = true
}
function filterExpressCompany(val) { expressFilterText.value = val }
function onExpressCompanyChange() { expressFilterText.value = '' }

async function onConfirmShip() {
  if (!shipForm.value.expressCompany) { ElMessage.warning('请选择快递公司'); return }
  if (!shipForm.value.expressNo || !shipForm.value.expressNo.trim()) { ElMessage.warning('请输入快递单号'); return }
  actionLoading.value = true
  try {
    if (props.orderType === 'mall') {
      await shipMallOrder(props.orderId, shipForm.value.expressNo.trim(), shipForm.value.expressCompany)
    } else {
      await handleTuanOrder(props.orderId, 'ship', { expressCompany: shipForm.value.expressCompany, expressNo: shipForm.value.expressNo.trim() })
    }
    ElMessage.success('发货成功')
    shipDialogVisible.value = false
    emit('updated')
    await fetchDetail()
  } catch (e) {
    ElMessage.error(e?.message || '发货失败')
  } finally {
    actionLoading.value = false
  }
}

// ============ 物流 ============
const logisticsDrawerVisible = ref(false)
const logisticsLoading = ref(false)
const logisticsInfo = ref({ status: undefined, statusLabel: '', statusColor: '', waybillId: '', expressCompany: '', goodsInfo: [], error: '' })

async function openLogisticsDrawer() {
  logisticsDrawerVisible.value = true
  logisticsLoading.value = true
  logisticsInfo.value = { status: undefined, statusLabel: '', statusColor: '', waybillId: '', expressCompany: '', goodsInfo: [], error: '' }
  try {
    const res = await getLogisticsTrack(props.orderId)
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
</script>

<style scoped>
.op-bar { margin-bottom: 16px; }
.hint { margin-left: 10px; color: #999; font-size: 12px; }
</style>