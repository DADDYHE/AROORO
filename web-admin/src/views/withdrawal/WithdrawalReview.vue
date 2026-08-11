<template>
  <el-card>
    <template #header>
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <span>提现审核</span>
        <div>
          <el-tag v-if="!isSuperAdmin" type="info" size="small">只读模式（对账）</el-tag>
          <el-tag v-else :type="autoTransferEnabled ? 'success' : 'warning'" size="small">
            自动打款{{ autoTransferEnabled ? '已开启' : '已关闭（总闸）' }}
          </el-tag>
        </div>
      </div>
    </template>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="_id" label="记录ID" width="190" show-overflow-tooltip />
      <el-table-column prop="nickName" label="申请人" width="100">
        <template #default="{ row }">{{ row.nickName || '-' }}</template>
      </el-table-column>
      <el-table-column prop="amount" label="申请金额" width="110">
        <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="模式" width="90">
        <template #default="{ row }">
          <el-tag :type="row.mode === 'manual' ? 'warning' : row.mode === 'auto' ? 'primary' : 'info'" size="small">{{ row.mode === 'manual' ? '人工' : row.mode === 'auto' ? '自动' : '待选择' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="收款方式" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <div v-if="row.payeeSnapshot">{{ channelLabel(row.method) }}</div>
          <div class="masked">{{ snapshotText(row.payeeSnapshot) }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }"><el-tag :type="withdrawalTagType(row.status)" size="small">{{ WITHDRAWAL_STATUS_LABELS[row.status] || row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column label="实际/差异" width="130">
        <template #default="{ row }">
          <template v-if="row.status === 'completed' && row.transferMethod === 'manual'">
            <div>{{ formatMoney(row.paidAmount) }}</div>
            <div v-if="Number(row.amountDiff)" class="diff">差 {{ formatMoney(row.amountDiff) }}</div>
          </template>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="transferError" label="转账错误" width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.transferError || '-' }}</template>
      </el-table-column>
      <el-table-column label="凭证" width="90">
        <template #default="{ row }">
          <el-link v-if="row.payEvidence" type="primary" :href="row.payEvidence" target="_blank" :underline="false">查看</el-link>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="160">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <template v-if="isSuperAdmin">
            <template v-if="row.status === 'pending'">
              <el-button link type="primary" @click="onApprove(row)">通过</el-button>
              <el-button link type="danger" @click="onReject(row._id)">拒绝</el-button>
            </template>
            <template v-else-if="row.status === 'approved' && row.mode === 'manual'">
              <el-button link type="success" @click="openConfirm(row)">确认已打款</el-button>
              <el-button link type="warning" @click="onCancel(row._id)">撤销</el-button>
            </template>
            <template v-else-if="row.status === 'approved'">
              <el-button v-if="row.method === 'wechat' && autoTransferEnabled" link type="warning" @click="onRetry(row._id, row.status)">重新转账</el-button>
              <el-button link type="success" @click="onConvert(row._id)">转人工打款</el-button>
              <el-button link type="danger" @click="onCancel(row._id)">撤销</el-button>
            </template>
            <template v-else-if="row.status === 'processing'">
              <el-button link type="warning" @click="onRetry(row._id, row.status)">对账</el-button>
            </template>
            <template v-else-if="row.status === 'cancelled'">
              <el-button link type="info" @click="openInspect(row._id)">检查</el-button>
            </template>
            <span v-else class="text-muted">已处理</span>
          </template>
          <span v-else class="text-muted">只读</span>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" layout="total, sizes, prev, pager, next" :total="total" v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" @current-change="onPageChange" @size-change="onSizeChange" />

    <!-- 审批对话框：每单二选一 -->
    <el-dialog v-model="approveVisible" title="审核提现" width="520px">
      <p>申请人：{{ current?.nickName || '-' }} ｜ 申请金额：{{ current ? formatMoney(current.amount) : '' }}</p>
      <p>收款方式：{{ channelLabel(current?.method) }} ｜ {{ snapshotText(current?.payeeSnapshot) }}</p>
      <el-radio-group v-model="approveMode">
        <el-radio value="auto" :disabled="!autoEnabledForCurrent">自动打款</el-radio>
        <el-radio value="manual">人工打款</el-radio>
      </el-radio-group>
      <div v-if="approveMode === 'manual'" style="margin-top:10px">
        <el-button link type="primary" @click="onViewFullPayee(current)">查看完整收款信息</el-button>
      </div>
      <div v-else-if="!autoEnabledForCurrent" class="hint">仅微信收款方式可自动打款，且需自动打款总闸开启</div>
      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button type="primary" :loading="approving" @click="onApproveConfirm">确认通过</el-button>
      </template>
    </el-dialog>

    <!-- 完整收款信息（super_admin 专属，审计） -->
    <el-dialog v-model="payeeVisible" title="完整收款信息" width="480px">
      <p>申请人：{{ payeeData?.nickName || '-' }}</p>
      <p>{{ payeeText(payeeData?.payee) }}</p>
      <p v-if="payeeData?.payeeSnapshot" class="hint">审批时快照：{{ snapshotText(payeeData.payeeSnapshot) }}</p>
    </el-dialog>

    <!-- 确认人工打款（事后记录） -->
    <el-dialog v-model="confirmVisible" title="确认人工打款" width="560px">
      <p>申请金额：{{ confirmRow ? formatMoney(confirmRow.amount) : '' }} ｜ 收款方式：{{ channelLabel(confirmRow?.method) }}</p>
      <p v-if="fullPayee" class="payee-line">收款账号：{{ payeeText(fullPayee.payee) }}</p>
      <p v-if="fullPayee?.payeeSnapshot" class="hint">审批时快照：{{ snapshotText(fullPayee.payeeSnapshot) }}</p>
      <el-form label-width="100px">
        <el-form-item label="打款渠道">
          <el-select v-model="confirmForm.channel" style="width:220px">
            <el-option label="微信" value="wechat" />
            <el-option label="支付宝" value="alipay" />
            <el-option label="银行卡" value="bank" />
          </el-select>
        </el-form-item>
        <el-form-item label="实际打款金额">
          <el-input-number v-model="confirmForm.paidAmount" :min="0.01" :precision="2" :controls="false" style="width:220px" />
          <span v-if="isDiff" class="diff">与申请金额不一致（{{ formatMoney(diffInfo) }}）</span>
          <span v-else class="diff-ok">与申请金额一致，可正常确认</span>
        </el-form-item>
        <el-form-item label="打款凭证" required>
          <el-input v-model="confirmForm.payEvidence" type="textarea" :rows="2" placeholder="凭证图片上传后自动填入（必填）" />
          <div class="evidence-upload">
            <el-button size="small" :loading="evidenceUploading" @click="evidenceInput?.click()">上传凭证图片</el-button>
            <span v-if="evidenceUploaded" class="hint">已上传：{{ confirmForm.payEvidence }}</span>
            <input ref="evidenceInput" type="file" accept="image/*" style="display:none" @change="onEvidenceFile" />
          </div>
        </el-form-item>
        <el-form-item :label="isDiff ? '差异原因（必填）' : '差异原因/备注'" :required="isDiff">
          <el-input
            v-model="confirmForm.note"
            type="textarea"
            :rows="2"
            :placeholder="isDiff ? '金额不一致，必须填写差异原因' : '金额一致时可选填备注'"
          />
          <span v-if="isDiff" class="diff note-req">⚠ 金额不一致，差异原因为必填项</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="confirmVisible = false">取消</el-button>
        <el-button type="success" :loading="confirming" @click="onConfirmSubmit">确认已打款</el-button>
      </template>
    </el-dialog>

    <!-- 撤销记录检查/修复（运维诊断） -->
    <el-dialog v-model="inspectVisible" title="撤销记录检查" width="520px">
      <template v-if="inspectData">
        <p>金额：{{ formatMoney(inspectData.withdrawal.amount) }} ｜ 状态：{{ WITHDRAWAL_STATUS_LABELS[inspectData.withdrawal.status] }}</p>
        <p>渠道：{{ channelLabel(inspectData.withdrawal.method) }} ｜ 钱包类型：{{ inspectData.withdrawal.walletType }}</p>
        <el-divider />
        <p>佣金钱包：余额 {{ formatMoney(inspectData.wallets.commission?.balance) }} ｜ 冻结 {{ formatMoney(inspectData.wallets.commission?.frozenAmount) }}</p>
        <p>服务收入钱包：余额 {{ formatMoney(inspectData.wallets.serviceIncome?.balance) }} ｜ 冻结 {{ formatMoney(inspectData.wallets.serviceIncome?.frozenAmount) }}</p>
        <p>该用户提现单总数：{{ inspectData.otherWithdrawalsTotal }}</p>
        <div v-if="inspectResult" class="diff">{{ inspectResult }}</div>
      </template>
      <template #footer>
        <el-button @click="inspectVisible = false">关闭</el-button>
        <el-button type="warning" :loading="repairing" @click="onRepair">修复冻结金额</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { getWithdrawalList, approveWithdrawal, rejectWithdrawal, retryTransfer, confirmManualTransfer, getFullPayeeInfo, getPayoutConfig, cancelWithdrawal, convertToManual, inspectWithdrawal, repairWithdrawalBalance } from '@/api/withdrawal'
import { uploadFile } from '@/api/upload'
import { usePagination } from '@/composables/usePagination'
import { formatDate, formatMoney } from '@/utils/format'
import { WITHDRAWAL_STATUS_LABELS } from '@/constants/order'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'

const auth = useAuthStore()
const isSuperAdmin = computed(() => auth.admin?.isSuperAdmin === true)
const autoTransferEnabled = ref(true)

const { list, loading, total, pagination, fetch, onPageChange, onSizeChange } = usePagination(getWithdrawalList)

function withdrawalTagType(status) {
  return { pending: 'warning', approved: '', processing: '', completed: 'success', rejected: 'danger', cancelled: 'info' }[status] || 'info'
}
function channelLabel(m) {
  return { wechat: '微信', alipay: '支付宝', bank: '银行卡' }[m] || (m || '-')
}
function snapshotText(s) {
  if (!s) {return '未预留'}
  if (s.channel === 'wechat' || s.channel === 'alipay') {return `${channelLabel(s.channel)} ${s.account || ''}`}
  if (s.channel === 'bank') {return `${s.bankName || ''} ${s.cardTail || ''} ${s.holder || ''}`.trim()}
  return JSON.stringify(s)
}
function payeeText(p) {
  if (!p) {return '未预留'}
  const parts = []
  if (p.wechat) {parts.push(`微信：${p.wechat}`)}
  if (p.alipay) {parts.push(`支付宝：${p.alipay}`)}
  if (p.bank && p.bank.cardNo) {parts.push(`${p.bank.bankName || ''} ${p.bank.cardNo} ${p.bank.holder || ''}`.trim())}
  return parts.join(' ｜ ') || '未预留'
}

// ===== 审批（每单二选一） =====
const approveVisible = ref(false)
const current = ref(null)
const approveMode = ref('auto')
const approving = ref(false)
const autoEnabledForCurrent = computed(() => Boolean(current.value && current.value.method === 'wechat' && autoTransferEnabled.value))

function onApprove(row) {
  current.value = row
  approveMode.value = 'auto'
  approveVisible.value = true
}

async function onApproveConfirm() {
  approving.value = true
  try {
    await approveWithdrawal(current.value._id, approveMode.value)
    ElMessage.success(approveMode.value === 'manual' ? '已通过，进入人工打款队列' : '已通过')
    approveVisible.value = false
    fetch()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    approving.value = false
  }
}

async function onReject(id) {
  const { value } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝提现', { inputPlaceholder: '拒绝原因' })
  await rejectWithdrawal(id, value)
  ElMessage.success('已拒绝')
  fetch()
}

// ===== 完整收款信息 =====
const payeeVisible = ref(false)
const payeeData = ref(null)
async function onViewFullPayee(row) {
  try {
    const res = await getFullPayeeInfo(row._id)
    payeeData.value = res.data || null
    payeeVisible.value = true
  } catch (e) {
    ElMessage.error(e?.message || '获取收款信息失败')
  }
}

// ===== 确认人工打款 =====
const confirmVisible = ref(false)
const confirmRow = ref(null)
const confirmForm = reactive({ channel: 'wechat', paidAmount: 0, payEvidence: '', note: '' })
const fullPayee = ref(null)
const confirming = ref(false)
const evidenceInput = ref(null)
const evidenceUploading = ref(false)
const evidenceUploaded = ref(false)
const diffInfo = computed(() => Math.round((Number(confirmForm.paidAmount || 0) - Number(confirmRow.value?.amount || 0)) * 100) / 100)
const isDiff = computed(() => Math.abs(diffInfo.value) > 0.01)

async function openConfirm(row) {
  confirmRow.value = row
  confirmForm.channel = row.method || 'wechat'
  confirmForm.paidAmount = Number(row.amount) || 0
  confirmForm.payEvidence = ''
  confirmForm.note = ''
  fullPayee.value = null
  evidenceUploaded.value = false
  confirmVisible.value = true
  try {
    const res = await getFullPayeeInfo(row._id)
    fullPayee.value = res.data || null
  } catch (e) {
    console.warn('[WithdrawalReview] getFullPayeeInfo failed:', e?.message)
  }
}

async function onEvidenceFile(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) {return}
  if (!file.type || !file.type.startsWith('image/')) {
    ElMessage.warning('请上传图片凭证（如打款截图）')
    e.target.value = ''
    return
  }
  evidenceUploading.value = true
  try {
    const ext = (file.name.match(/\.[a-zA-Z0-9]+$/) || ['.jpg'])[0]
    const data = await uploadFile(file, `withdrawal-evidence/${Date.now()}${ext}`)
    confirmForm.payEvidence = data.fileID || data.url || ''
    evidenceUploaded.value = true
    ElMessage.success('凭证已上传')
  } catch (err) {
    ElMessage.error(err?.message || '上传失败')
  } finally {
    evidenceUploading.value = false
    if (evidenceInput.value) {evidenceInput.value.value = ''}
  }
}

async function onConfirmSubmit() {
  if (!confirmForm.payEvidence.trim()) {
    ElMessage.warning('请填写打款凭证/流水号')
    return
  }
  if (Math.abs(diffInfo.value) > 0.01 && !confirmForm.note.trim()) {
    ElMessage.warning('实际金额与申请金额不一致，请填写差异原因')
    return
  }
  confirming.value = true
  try {
    await confirmManualTransfer({
      withdrawalId: confirmRow.value._id,
      payoutChannel: confirmForm.channel,
      paidAmount: confirmForm.paidAmount,
      payEvidence: confirmForm.payEvidence.trim(),
      manualNote: confirmForm.note.trim(),
    })
    ElMessage.success('已确认人工打款')
    confirmVisible.value = false
    fetch()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    confirming.value = false
  }
}

// ===== 重新转账 / 转人工 / 撤销 =====
async function onRetry(id, status = 'approved') {
  const actionText = status === 'processing' ? '对账' : '重新发起转账'
  await ElMessageBox.confirm(`确定${actionText}？`, { type: 'warning' })
  const res = await retryTransfer(id)
  if (res?.transferError) {
    ElMessage.warning(`转账失败：${res.transferError}`)
  } else {
    ElMessage.success(res?.data?.message || res?.message || '操作成功')
  }
  fetch()
}

async function onConvert(id) {
  await ElMessageBox.confirm('确定将该记录转为人工打款？需要用户已预留收款账号。', { type: 'warning' })
  await convertToManual(id)
  ElMessage.success('已转为人工打款')
  fetch()
}

async function onCancel(id) {
  const { value } = await ElMessageBox.prompt('请确认尚未打款，否则会造成资金双失。填写撤销原因：', '撤销提现', {
    inputPlaceholder: '撤销原因（必填）',
    inputValidator: v => (v && v.trim() ? true : '请填写撤销原因'),
    type: 'warning',
  })
  await cancelWithdrawal(id, value)
  ElMessage.success('已撤销，冻结金额已退回')
  fetch()
}

// ===== 撤销记录检查/修复 =====
const inspectVisible = ref(false)
const inspectData = ref(null)
const inspectResult = ref('')
const repairing = ref(false)

async function openInspect(id) {
  inspectResult.value = ''
  try {
    const res = await inspectWithdrawal(id)
    inspectData.value = res.data || null
    inspectVisible.value = true
  } catch (e) {
    ElMessage.error(e?.message || '检查失败')
  }
}

async function onRepair() {
  if (!inspectData.value) {return}
  repairing.value = true
  try {
    const res = await repairWithdrawalBalance(inspectData.value.withdrawal._id)
    inspectResult.value = res.data?.repaired
      ? `已回补 ${formatMoney(res.data.before ? (res.data.after.balance - res.data.before.balance) : 0)}：余额 ${formatMoney(res.data.after.balance)}，冻结 ${formatMoney(res.data.after.frozenAmount)}`
      : `无需修复（余额 ${formatMoney(res.data.after?.balance)}，冻结 ${formatMoney(res.data.after?.frozenAmount)}）`
    // 刷新检查数据与列表
    const res2 = await inspectWithdrawal(inspectData.value.withdrawal._id)
    inspectData.value = res2.data || inspectData.value
    fetch()
  } catch (e) {
    ElMessage.error(e?.message || '修复失败')
  } finally {
    repairing.value = false
  }
}

onMounted(async () => {
  try {
    const res = await getPayoutConfig()
    autoTransferEnabled.value = res.data?.autoTransferEnabled !== false
  } catch (e) {
    console.warn('[WithdrawalReview] getPayoutConfig failed:', e?.message)
  }
  fetch()
})
</script>

<style scoped>
.pager { margin-top: var(--spacing-md); justify-content: flex-end; }
.text-muted { color: var(--text-placeholder); }
.masked { font-size: 12px; color: var(--text-secondary); }
.diff { color: #f56c6c; font-size: 12px; margin-left: 8px; }
.diff-ok { color: #67c23a; font-size: 12px; margin-left: 8px; }
.hint { color: var(--text-tertiary); font-size: 12px; margin-top: 6px; }
.payee-line { font-weight: 500; }
.evidence-upload { margin-top: 8px; display: flex; align-items: center; gap: 10px; }
</style>
