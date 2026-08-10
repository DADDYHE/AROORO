/* eslint-disable -- 手写运行时模块（非 tsc 生成）；由 sync-cloud-common.js 同步到各云函数 */
'use strict'

/**
 * common/notify-email.js - 告警外部邮件通道（best-effort）
 *
 * 设计目标：
 *   - 作为 recordAlert 的补充外部通道，仅对 critical 级别告警实时推送邮件
 *   - 零额外依赖：仅使用 Node 内置 tls / net / crypto，兼容任意 SMTP 中继
 *     （QQ 邮箱授权码 smtp.qq.com:465 / 企业邮 / 腾讯云邮件推送 SES 等）
 *   - 配置驱动：从 system_config.alert_email 读取，未配置或配置不完整时静默跳过
 *   - best-effort：任何发送失败仅记日志、返回 false，绝不抛出、绝不影响主流程
 *
 * 配置示例（写入 system_config 集合 _id=alert_email 的文档）：
 *   {
 *     "enabled": true,
 *     "host": "smtp.qq.com",
 *     "port": 465,
 *     "secure": true,          // true=直连 SSL(465) | false 时默认走 STARTTLS(587)
 *     "starttls": true,        // 仅 secure=false 时生效；false 表示明文(仅限内网/dev)
 *     "user": "123456@qq.com", // 邮箱账号
 *     "pass": "邮箱授权码",      // 注意：是授权码，不是登录密码
 *     "from": "123456@qq.com",
 *     "to": "daddy@xxx.com",
 *     "subjectPrefix": "[AROORO告警]"
 *   }
 *
 * 调用方式（由 alert.js 在 critical 时触发）：
 *   const { sendAlertEmail } = require('./notify-email')
 *   await sendAlertEmail({ severity, action, message, context }, db)
 */

const tls = require('tls')
const net = require('net')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./logger')

const logger = createLogger('notify-email')

const CFG_TTL_MS = 5 * 60 * 1000
let _cfgCache = null
let _cfgExpires = 0

/**
 * 读取邮件通道配置（带 5 分钟缓存，失败回退空配置）
 * @param {object} db CloudBase DB 实例（由调用方传入，避免本模块自行初始化 cloud）
 */
async function loadAlertEmailConfig(db) {
  if (_cfgCache && _cfgExpires > Date.now()) return _cfgCache
  let cfg = {}
  try {
    const res = await db.collection('system_config').doc('alert_email').get()
    cfg = (res && res.data) || {}
  } catch (e) {
    logger.warn('notify-email.config.failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
  _cfgCache = cfg
  _cfgExpires = Date.now() + CFG_TTL_MS
  return cfg
}

function isConfigured(cfg) {
  return Boolean(
    cfg &&
      cfg.enabled &&
      cfg.host &&
      cfg.user &&
      cfg.pass &&
      cfg.from &&
      cfg.to
  )
}

/** 构造符合 RFC 822 的最小 MIME 邮件文本（含中文主题 Base64 编码） */
function buildMessage(cfg, payload) {
  const prefix = cfg.subjectPrefix || '[AROORO告警]'
  const plainSubject = `${prefix} ${String(payload.severity || '').toUpperCase()} ${payload.action || ''}`
  const subject = /[^\u0000-\u007f]/.test(plainSubject)
    ? `=?UTF-8?B?${Buffer.from(plainSubject).toString('base64')}?=`
    : plainSubject
  const date = new Date().toUTCString()
  const ctx = payload.context
    ? `\n上下文: ${JSON.stringify(payload.context, null, 2)}`
    : ''
  const body =
    `严重级别: ${payload.severity}\n` +
    `动作: ${payload.action}\n` +
    `时间: ${date}\n` +
    `消息: ${payload.message}${ctx}`

  return [
    `From: ${cfg.from}`,
    `To: ${cfg.to}`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
  ].join('\r\n')
}

/**
 * 通过内置 tls/net 发送一封 SMTP 邮件（支持 SSL 直连 / STARTTLS / 明文）
 * 返回 Promise：成功 resolve，失败 reject（由调用方捕获）
 */
function smtpSend(cfg, message) {
  return new Promise((resolve, reject) => {
    const secure = cfg.secure === true
    const starttls = cfg.starttls !== false // secure 时忽略；否则默认走 STARTTLS
    const port = Number(cfg.port) || (secure ? 465 : 25)
    const host = String(cfg.host)

    let conn = secure
      ? tls.connect(port, host, { rejectUnauthorized: false })
      : net.connect(port, host)
    let buf = ''
    let finished = false

    const destroy = () => {
      if (!finished) {
        finished = true
        try {
          conn.destroy()
        } catch (_) {
          /* ignore */
        }
      }
    }
    const onError = (e) => {
      destroy()
      reject(e instanceof Error ? e : new Error(String(e)))
    }
    const onData = (chunk) => {
      buf += chunk.toString('utf8')
    }
    conn.on('error', onError)
    conn.on('data', onData)

    // 读取一条完整 SMTP 回复（兼容多行 250- 续行，直到 250 空格结尾）
    const readReply = () =>
      new Promise((res, rej) => {
        const tick = () => {
          if (finished) return rej(new Error('smtp connection closed'))
          const lines = buf.split('\r\n')
          const tail = lines.pop() || ''
          let code = 0
          let text = ''
          let terminal = false
          for (const line of lines) {
            const m = /^(\d{3})([- ])(.*)$/.exec(line)
            if (m) {
              code = parseInt(m[1], 10)
              text = m[3]
              if (m[2] === ' ') terminal = true
            }
          }
          if (terminal) {
            buf = tail
            return res({ code, text })
          }
          setTimeout(tick, 15)
        }
        tick()
      })

    const send = (cmd) =>
      new Promise((res, rej) => {
        conn.write(cmd + '\r\n', (e) => (e ? rej(e) : res()))
      })
    const sendRaw = (data) =>
      new Promise((res, rej) => {
        conn.write(data, (e) => (e ? rej(e) : res()))
      })
    const command = async (cmd) => {
      await send(cmd)
      const r = await readReply()
      if (r.code >= 400) throw new Error(`SMTP ${r.code} ${r.text}`)
      return r.code
    }

    const waitConnect = () =>
      new Promise((res) => {
        if (secure) conn.once('secureConnect', res)
        else conn.once('connect', res)
      })

    ;(async () => {
      try {
        await waitConnect()
        await readReply() // 服务端 220 问候
        await command('EHLO zuoyou')
        if (!secure && starttls) {
          await command('STARTTLS')
          const tlsSock = tls.connect({ socket: conn, rejectUnauthorized: false })
          conn.removeListener('data', onData)
          conn = tlsSock
          conn.on('data', onData)
          conn.on('error', onError)
          await new Promise((res) => tlsSock.once('secureConnect', res))
          await command('EHLO zuoyou')
        }
        const authUser = Buffer.from(String(cfg.user)).toString('base64')
        const authPass = Buffer.from(String(cfg.pass)).toString('base64')
        await command('AUTH LOGIN')
        await command(authUser)
        await command(authPass)
        await command(`MAIL FROM:<${cfg.from}>`)
        await command(`RCPT TO:<${cfg.to}>`)
        await command('DATA')
        await sendRaw(message + '\r\n.\r\n')
        await readReply()
        await command('QUIT')
        destroy()
        resolve()
      } catch (e) {
        destroy()
        reject(e)
      }
    })()
  })
}

/**
 * 发送告警邮件（best-effort）
 * @param {object} payload { severity, action, message, context }
 * @param {object} db CloudBase DB 实例
 * @returns {Promise<boolean>} 是否成功投递（未配置/失败均返回 false）
 */
async function sendAlertEmail(payload, db) {
  const cfg = await loadAlertEmailConfig(db)
  if (!isConfigured(cfg)) {
    logger.info('notify-email.skipped', { reason: 'not_configured', action: payload && payload.action })
    return false
  }
  try {
    const message = buildMessage(cfg, payload || {})
    await smtpSend(cfg, message)
    logger.info('notify-email.sent', { action: payload && payload.action })
    return true
  } catch (e) {
    logger.error('notify-email.send.failed', {
      action: payload && payload.action,
      error: e instanceof Error ? e.message : String(e),
    })
    return false
  }
}

module.exports = {
  sendAlertEmail,
  loadAlertEmailConfig,
}
