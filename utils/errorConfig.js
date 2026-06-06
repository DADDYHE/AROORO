const ERROR_TYPES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_ERROR: 'API_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PAYMENT_ERROR: 'PAYMENT_ERROR',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  UNKNOWN: 'UNKNOWN',
}

const ERROR_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  CRITICAL: 4,
}

const ERROR_REPORT_CONFIG = {
  maxTotalErrors: 1000,
  errorReportInterval: 5 * 60 * 1000,
  autoCleanExpiredInterval: 30 * 60 * 1000,
  recentErrorsLimit: 100,
  criticalNotifyThreshold: 50,
}

function classifyError(error) {
  const message = (error && error.message) || ''

  if (message.includes('network') || message.includes('Network')) return ERROR_TYPES.NETWORK_ERROR
  if (message.includes('auth') || message.includes('login') || message.includes('401')) return ERROR_TYPES.AUTH_ERROR
  if (message.includes('payment') || message.includes('pay')) return ERROR_TYPES.PAYMENT_ERROR
  if (message.includes('validation') || message.includes('parameter') || message.includes('parameter')) return ERROR_TYPES.VALIDATION_ERROR
  if (message.includes('cloud') || message.includes('function')) return ERROR_TYPES.API_ERROR

  return ERROR_TYPES.UNKNOWN
}

module.exports = {
  ERROR_TYPES,
  ERROR_LEVELS,
  ERROR_REPORT_CONFIG,
  classifyError,
}
