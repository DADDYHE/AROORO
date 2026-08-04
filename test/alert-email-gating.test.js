/**
 * alert.js × notify-email 门控测试
 *
 * 验证两层门控：
 *   1. 总开关：环境变量 ALERT_EMAIL_ENABLED==='true' 才启用外部通道（默认关闭）
 *   2. 级别：开关打开后，仅 severity==='critical' 触发，warning / info 不触发
 * 并验证邮件发送失败不影响 recordAlert 主流程（best-effort）。
 */

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'test' }),
  DYNAMIC_CURRENT_ENV: 'mock',
  database: () => mockDb,
}))

jest.mock('../cloudfunctions/common/notify-email', () => ({
  sendAlertEmail: jest.fn().mockResolvedValue(true),
}))

const mockDb = {
  _docs: {},
  collection(name) {
    const self = this
    if (!self._docs[name]) self._docs[name] = { docs: [] }
    return {
      doc: id => ({
        get: async () => ({ data: self._docs[name].docs.find(d => d._id === id) || null }),
      }),
      add: async ({ data }) => {
        self._docs[name].docs.push(data)
        return { _id: 'aid' }
      },
    }
  },
  serverDate: () => new Date(),
}

// 开关在模块加载时求值，必须先于 require 设置（以下用例覆盖"开启态"行为）
process.env.ALERT_EMAIL_ENABLED = 'true'

const { recordAlert } = require('../cloudfunctions/common/alert')
const notifyEmail = require('../cloudfunctions/common/notify-email')

beforeEach(() => {
  mockDb._docs = {}
  notifyEmail.sendAlertEmail.mockClear()
})

test('critical → 触发 sendAlertEmail（传入 payload 与 db）', async () => {
  await recordAlert('critical', 'refund.failed', '退款同步失败', { orderId: 'O1' })
  expect(notifyEmail.sendAlertEmail).toHaveBeenCalledTimes(1)
  const [payload, db] = notifyEmail.sendAlertEmail.mock.calls[0]
  expect(payload.severity).toBe('critical')
  expect(payload.action).toBe('refund.failed')
  expect(db).toBe(mockDb)
})

test('总开关关闭（默认态）→ critical 也不触发 sendAlertEmail，但告警照常落库', async () => {
  const prev = process.env.ALERT_EMAIL_ENABLED
  delete process.env.ALERT_EMAIL_ENABLED
  let recordAlertOff
  jest.isolateModules(() => {
    recordAlertOff = require('../cloudfunctions/common/alert').recordAlert
  })
  await recordAlertOff('critical', 'refund.failed', '退款同步失败')
  expect(notifyEmail.sendAlertEmail).not.toHaveBeenCalled()
  // 证明 recordAlert 确实执行了（否则上面的 not.toHaveBeenCalled 无意义）
  expect(mockDb._docs.alerts.docs.length).toBe(1)
  if (prev === undefined) delete process.env.ALERT_EMAIL_ENABLED
  else process.env.ALERT_EMAIL_ENABLED = prev
})

test('warning → 不触发 sendAlertEmail', async () => {
  await recordAlert('warning', 'refund.retry', '可恢复异常')
  expect(notifyEmail.sendAlertEmail).not.toHaveBeenCalled()
})

test('info → 不触发 sendAlertEmail', async () => {
  await recordAlert('info', 'refund.notice', '提示')
  expect(notifyEmail.sendAlertEmail).not.toHaveBeenCalled()
})

test('邮件发送失败不影响 recordAlert 主流程（告警仍落库）', async () => {
  notifyEmail.sendAlertEmail.mockRejectedValueOnce(new Error('smtp down'))
  await recordAlert('critical', 'pay.callback.failed', '支付回调失败')
  expect(notifyEmail.sendAlertEmail).toHaveBeenCalledTimes(1)
  // 主流程：告警应已写入 alerts 集合
  expect(mockDb._docs.alerts.docs.length).toBe(1)
  expect(mockDb._docs.alerts.docs[0].severity).toBe('critical')
})
