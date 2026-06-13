/**
 * 错误统计
 *
 * 为 globalErrorManager.js 提供按时间窗口的计数与清理能力。
 */

class ErrorStats {
  constructor() {
    this.reset()
  }

  reset() {
    this.total = 0
    this.byType = {}
    this.byLevel = {}
    this.history = []
    this.windowStart = Date.now()
  }

  record(entry) {
    this.total += 1
    const { type = 'unknown', level = 'error' } = entry || {}
    this.byType[type] = (this.byType[type] || 0) + 1
    this.byLevel[level] = (this.byLevel[level] || 0) + 1
    this.history.push({
      ...entry,
      timestamp: entry.timestamp || Date.now(),
    })
    if (this.history.length > 200) {
      this.history.splice(0, this.history.length - 200)
    }
  }

  cleanOldStats(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - maxAgeMs
    this.history = this.history.filter(item => (item.timestamp || 0) >= cutoff)
    if (this.windowStart < cutoff) {
      this.windowStart = cutoff
    }
  }

  toJSON() {
    return {
      total: this.total,
      byType: { ...this.byType },
      byLevel: { ...this.byLevel },
      windowStart: this.windowStart,
      sampleCount: this.history.length,
    }
  }
}

module.exports = {
  ErrorStats,
}
