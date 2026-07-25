<template>
  <el-dialog v-model="visible" title="订单退款" width="480px" @closed="onClosed">
    <el-descriptions :column="1" border size="small" style="margin-bottom:16px">
      <el-descriptions-item label="订单号">{{ order.outTradeNo || '-' }}</el-descriptions-item>
      <el-descriptions-item label="支付金额">¥{{ formatMoney(maxRefund) }}</el-descriptions-item>
      <el-descriptions-item label="订单状态">
        <el-tag :type="order.status === 'refunded' ? 'danger' : 'success'" size="small">
          {{ order.paymentStatus === 'refunded' ? '已退款' : order.paymentStatus || order.status || '-' }}
        </el-tag>
      </el-descriptions-item>
    </el-descriptions>

    <el-form :model="form" label-width="80px">
      <el-form-item label="退款金额">
        <el-input-number
          v-model="form.refundAmount"
          :min="0.01"
          :max="maxRefund"
          :precision="2"
          :step="1"
          style="width:200px"
        />
        <el-button link type="primary" @click="form.refundAmount = maxRefund" style="margin-left:8px">全额</el-button>
      </el-form-item>
      <el-form-item label="退款原因">
        <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="选填，默认为「管理员退款」" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="danger" :loading="submitting" @click="onSubmit">确认退款</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminRefund } from '@/api/refund'
import { formatMoney } from '@/utils/format'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  order: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue', 'success'])

const visible = ref(props.modelValue)
const submitting = ref(false)
const form = ref({ refundAmount: 0, reason: '' })

watch(() => props.modelValue, (val) => { visible.value = val })
watch(visible, (val) => { emit('update:modelValue', val) })

watch(() => props.order, (val) => {
  const paid = Number(val.paidAmount || val.totalPrice || val.totalAmount || val.finalAmount || 0)
  form.value.refundAmount = paid
  form.value.reason = ''
}, { immediate: true })

const maxRefund = computed(() => {
  return Number(props.order.paidAmount || props.order.totalPrice || props.order.totalAmount || props.order.finalAmount || 0)
})

async function onSubmit() {
  if (!props.order.outTradeNo) {
    ElMessage.error('订单号缺失')
    return
  }
  if (form.value.refundAmount <= 0) {
    ElMessage.error('退款金额必须大于 0')
    return
  }
  if (form.value.refundAmount > maxRefund.value) {
    ElMessage.error('退款金额不能超过支付金额')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定退款 ¥${form.value.refundAmount.toFixed(2)} 至用户微信？此操作不可撤销。`,
      '退款确认',
      { confirmButtonText: '确认退款', cancelButtonText: '取消', type: 'warning' }
    )
    submitting.value = true
    const res = await adminRefund(props.order.outTradeNo, form.value.refundAmount, form.value.reason)
    if (res.code === 0) {
      ElMessage.success('退款成功')
      emit('success', res.data)
      visible.value = false
    } else {
      ElMessage.error(res.message || '退款失败')
    }
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message)
  } finally {
    submitting.value = false
  }
}

function onClosed() {
  form.value = { refundAmount: 0, reason: '' }
}
</script>
