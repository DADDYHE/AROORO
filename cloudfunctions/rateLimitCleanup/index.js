/**
 * rate-limit-cleanup 云函数（Sprint 21 新增）
 *
 * 目标：
 *   - 定期清理 rate_limits 集合中过期的记录
 *   - 由定时触发器按 cron 表达式 `0 *\u002F10 * * * * *` 调用（每 10 分钟）
 *   - 调用 cleanupExpiredRateLimits 并返回清理结果
 *
 * 同时也支持 HTTP 调用（手动触发）：
 *   入参：{ action: 'cleanup' } 或 { action: 'stats' }
 */
const cloudbase = require('wx-server-sdk')
cloudbase.init({ env: cloudbase.DYNAMIC_CURRENT_ENV })
const db = cloudbase.database()
const _ = db.command

// Sprint 31: 统一使用 handleSuccess / handleError
const { handleSuccess, handleError } = require('../common/utils')

const {
  initGlobalRateLimitFromDb,
  setGlobalRateLimitStore,
} = require('../common/risk-rate-limit')
const {
  cleanupExpiredRateLimits,
  getGlobalRateLimitStats,
} = require('../common/rate-limit-store')

// 注入全局限流 store
initGlobalRateLimitFromDb(db, { collectionName: 'rate_limits' })

exports.main = async (event /* , context */) => {
  const action = (event && event.action) || 'cleanup'

  if (action === 'cleanup') {
    // 分批清理
    let total = 0
    let batch
    do {
      batch = await cleanupExpiredRateLimits(
        { collection: db.collection('rate_limits'), command: _ },
        200
      )
      total += batch
    } while (batch > 0)
    return handleSuccess({ cleaned: total }, 'cleanup done')
  }

  if (action === 'stats') {
    const stats = await getGlobalRateLimitStats({
      collection: db.collection('rate_limits'),
      command: _,
    })
    return handleSuccess(stats, 'ok')
  }

  return handleError(new Error(`unknown action: ${action}`), `unknown action: ${action}`, 400)
}
