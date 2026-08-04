/**
 * notify-email.js 单元测试
 *
 * 覆盖：
 *   - 配置未启用 / 不完整 → sendAlertEmail 返回 false，不发起 SMTP
 *   - SMTP 成功（明文模式，直连本地 mock 服务器）→ 返回 true，服务端收到完整邮件
 *   - SMTP 鉴权失败（best-effort）→ 返回 false，不抛错
 */

const net = require('net')

// mock wx-server-sdk，使 initCloud() 安全，并提供可控 db
jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'test' }),
  DYNAMIC_CURRENT_ENV: 'mock',
  database: () => mockDb,
}))

const mockDb = {
  _docs: {},
  collection(name) {
    const self = this
    if (!self._docs[name]) self._docs[name] = { docs: [] }
    return {
      doc: id => ({
        get: async () => {
          const found = self._docs[name].docs.find(d => d._id === id)
          return { data: found || null }
        },
      }),
    }
  },
  serverDate: () => new Date(),
}

// 启动一个最小 SMTP mock 服务器，返回 { server, port, received, setRejectAuth }
function startMockSmtp() {
  return new Promise(resolve => {
    const received = []
    let rejectAuth = false
    const server = net.createServer(socket => {
      let capturing = false
      const buf = []
      let authStep = 0
      socket.write('220 mock ESMTP\r\n')
      socket.on('data', chunk => {
        const lines = chunk.toString().split('\r\n')
        for (const line of lines) {
          if (!line) continue
          if (/^EHLO/i.test(line)) {
            socket.write('250-mock\r\n250 OK\r\n')
          } else if (/^AUTH LOGIN/i.test(line)) {
            socket.write('334 VXNlcm5hbWU6\r\n') // base64("Username:")
          } else if (capturing) {
            if (line === '.') {
              capturing = false
              received.push(buf.join('\r\n'))
              buf.length = 0
              socket.write('250 Queued\r\n')
            } else {
              buf.push(line)
            }
          } else if (/^MAIL FROM/i.test(line)) {
            socket.write('250 OK\r\n')
          } else if (/^RCPT TO/i.test(line)) {
            socket.write('250 OK\r\n')
          } else if (/^DATA/i.test(line)) {
            capturing = true
            socket.write('354 End data\r\n')
          } else if (/^QUIT/i.test(line)) {
            socket.write('221 Bye\r\n')
          } else {
            // base64(user) / base64(pass) 两行
            authStep += 1
            if (rejectAuth && authStep >= 2) {
              socket.write('535 Authentication failed\r\n')
            } else {
              socket.write('250 OK\r\n')
            }
          }
        }
      })
    })
    server.listen(0, 'localhost', () => {
      const ctrl = {
        server,
        port: server.address().port,
        received,
        setRejectAuth: v => { rejectAuth = v },
      }
      resolve(ctrl)
    })
  })
}

let smtp
let notifyEmail

const ENABLED_CFG = port => ({
  _id: 'alert_email',
  enabled: true,
  host: 'localhost',
  port,
  secure: false,
  starttls: false,
  user: 'u@test.com',
  pass: 'secret',
  from: 'from@test.com',
  to: 'to@test.com',
})

beforeAll(async () => {
  smtp = await startMockSmtp()
})

afterAll(() => {
  if (smtp) smtp.server.close()
})

beforeEach(() => {
  // 每个用例用全新的模块实例（重置内部配置缓存）与空的 db
  jest.resetModules()
  mockDb._docs = {}
  notifyEmail = require('../cloudfunctions/common/notify-email')
})

describe('sendAlertEmail 配置门控', () => {
  test('system_config 无 alert_email 文档 → 返回 false，不发起 SMTP', async () => {
    const ok = await notifyEmail.sendAlertEmail(
      { severity: 'critical', action: 'test.alert', message: 'boom' },
      mockDb
    )
    expect(ok).toBe(false)
    expect(smtp.received.length).toBe(0)
  })

  test('enabled=false → 返回 false', async () => {
    mockDb._docs.system_config = {
      docs: [{ _id: 'alert_email', enabled: false, host: 'localhost', port: smtp.port }],
    }
    const ok = await notifyEmail.sendAlertEmail(
      { severity: 'critical', action: 'test.alert', message: 'boom' },
      mockDb
    )
    expect(ok).toBe(false)
    expect(smtp.received.length).toBe(0)
  })
})

describe('sendAlertEmail SMTP 投递', () => {
  test('critical 邮件成功投递，服务端收到完整内容', async () => {
    mockDb._docs.system_config = { docs: [ENABLED_CFG(smtp.port)] }
    const ok = await notifyEmail.sendAlertEmail(
      { severity: 'critical', action: 'test.alert', message: 'boom', context: { orderId: 'O1' } },
      mockDb
    )
    expect(ok).toBe(true)
    expect(smtp.received.length).toBe(1)
    const mail = smtp.received[0]
    expect(mail).toContain('To: to@test.com')
    expect(mail).toContain('动作: test.alert')
    expect(mail).toContain('消息: boom')
    expect(mail).toContain('orderId')
  })

  test('鉴权失败（best-effort）→ 返回 false，不抛错', async () => {
    smtp.setRejectAuth(true)
    mockDb._docs.system_config = { docs: [ENABLED_CFG(smtp.port)] }
    let threw = false
    let ok = false
    try {
      ok = await notifyEmail.sendAlertEmail(
        { severity: 'critical', action: 'test.alert', message: 'boom' },
        mockDb
      )
    } catch (e) {
      threw = true
    }
    expect(threw).toBe(false)
    expect(ok).toBe(false)
    smtp.setRejectAuth(false)
  })
})
