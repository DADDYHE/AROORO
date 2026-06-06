const trackerLog = []

function _now() {
  return Date.now()
}

function _makeCallId(apiName, description) {
  return `${apiName}|${description}_${_now()}`
}

function _trackApiStart(apiName, description, data) {
  const callId = _makeCallId(apiName, description)
  trackerLog.push({
    id: callId,
    api: apiName,
    description,
    startTime: _now(),
    status: 'pending',
    dataPreview: JSON.stringify(data || {}).substring(0, 100),
  })
  if (trackerLog.length > 300) trackerLog.shift()
  return callId
}

function _trackApiEnd(callId, result) {
  const duration = _now() - trackerLog.find(e => e.id === callId)?.startTime || 0
  const entry = trackerLog.find(e => e.id === callId)
  if (entry) {
    entry.duration = duration
    entry.status = 'success'
  }
  if (duration > 3000) {
    console.warn(`[Tracker] 慢调用: ${entry?.api || '?'} ${entry?.description || '?'} 耗时 ${duration}ms`)
  }
}

function _trackApiError(callId, error) {
  const entry = trackerLog.find(e => e.id === callId)
  const duration = _now() - (entry?.startTime || _now())
  if (entry) {
    entry.duration = duration
    entry.status = 'error'
    entry.error = error.message || error.errMsg || 'unknown'
  }
  const isTimeout = (error.errMsg || error.message || '').toLowerCase().includes('timeout')
  console.error(`[Tracker] ${isTimeout ? 'TIMEOUT' : 'ERROR'}: ${entry?.api || '?'} ${entry?.description || '?'} 耗时 ${duration}ms | ${error.message || error.errMsg}`)
}

// ---- wx.cloud.callFunction wrapper ----

function wrapCallFunction(original) {
  return async function callFunction(params) {
    const functionName = params.name || 'unknown'
    const action = params.data?.action || 'unknown'
    const callId = _trackApiStart('callFunction', `${functionName}.${action}`, params.data)

    let safeMode
    try { safeMode = require('./safeMode') } catch (e) {}
    if (safeMode) {
      const check = safeMode.checkCall(functionName, action)
      if (check.blocked) {
        const entry = trackerLog.find(e => e.id === callId)
        if (entry) { entry.status = 'blocked'; entry.duration = _now() - entry.startTime }
        throw new Error(`[SafeMode] ${functionName}.${action} 已被拦截`)
      }
    }

    try {
      const result = await original(params)
      _trackApiEnd(callId, result)
      return result
    } catch (error) {
      _trackApiError(callId, error)
      throw error
    }
  }
}

// ---- wx.cloud.getTempFileURL wrapper ----

function wrapGetTempFileURL(original) {
  return async function getTempFileURL(params) {
    const fileCount = params.fileList?.length || 0
    const callId = _trackApiStart('getTempFileURL', `${fileCount}个文件`, { count: fileCount })

    let safeMode
    try { safeMode = require('./safeMode') } catch (e) {}
    if (safeMode && safeMode.isServiceDisabled('__getTempFileURL', '*')) {
      const entry = trackerLog.find(e => e.id === callId)
      if (entry) { entry.status = 'blocked'; entry.duration = _now() - entry.startTime }
      throw new Error('[SafeMode] getTempFileURL 已被拦截')
    }

    try {
      const result = await original(params)
      _trackApiEnd(callId, result)
      return result
    } catch (error) {
      _trackApiError(callId, error)
      throw error
    }
  }
}

// ---- wx.request wrapper ----

function wrapRequest(original) {
  return function request(params) {
    const callId = _trackApiStart('request', params.url?.substring(0, 80) || '?', { method: params.method })

    let safeMode
    try { safeMode = require('./safeMode') } catch (e) {}
    if (safeMode && safeMode.isServiceDisabled('__wxRequest', '*')) {
      const entry = trackerLog.find(e => e.id === callId)
      if (entry) { entry.status = 'blocked'; entry.duration = _now() - entry.startTime }
      const failCb = params.fail || params.complete
      if (failCb) setTimeout(() => failCb({ errMsg: '[SafeMode] wx.request 已被拦截' }), 0)
      return
    }

    const originalSuccess = params.success
    const originalFail = params.fail
    const originalComplete = params.complete

    params.success = function(res) {
      _trackApiEnd(callId, res)
      originalSuccess && originalSuccess(res)
    }
    params.fail = function(error) {
      _trackApiError(callId, error)
      originalFail && originalFail(error)
    }
    params.complete = function(res) {
      _trackApiEnd(callId, res)
      originalComplete && originalComplete(res)
    }

    const task = original(params)
    return task
  }
}

// ---- wx.connectSocket wrapper ----

function wrapConnectSocket(original) {
  return function connectSocket(params) {
    const url = params.url?.substring(0, 80) || '?'
    const callId = _trackApiStart('connectSocket', url, { url: params.url })

    let safeMode
    try { safeMode = require('./safeMode') } catch (e) {}
    if (safeMode && safeMode.isServiceDisabled('__connectSocket', '*')) {
      const entry = trackerLog.find(e => e.id === callId)
      if (entry) { entry.status = 'blocked'; entry.duration = _now() - entry.startTime }
      console.log('[Tracker] connectSocket 已被 safeMode 拦截:', url)
      return { onOpen() {}, onError(fn) { setTimeout(() => fn({ errMsg: '[SafeMode] blocked' }), 0) }, onClose() {}, onMessage() {}, send() {}, close() {} }
    }

    const task = original(params)
    const origOnOpen = task.onOpen.bind(task)
    const origOnError = task.onError.bind(task)
    const origOnClose = task.onClose.bind(task)

    task.onOpen = function(fn) {
      origOnOpen(function(res) {
        _trackApiEnd(callId, res)
        fn && fn(res)
      })
    }

    task.onError = function(fn) {
      origOnError(function(error) {
        _trackApiError(callId, error)
        fn && fn(error)
      })
    }

    task.onClose = function(fn) {
      origOnClose(function(res) {
        const entry = trackerLog.find(e => e.id === callId)
        if (entry && entry.status === 'pending') {
          entry.status = 'closed'
          entry.duration = _now() - entry.startTime
        }
        fn && fn(res)
      })
    }

    return task
  }
}

// ---- query APIs ----

function getRecentCalls(count = 20) {
  return trackerLog.slice(-count)
}

function getTimeoutCalls() {
  return trackerLog.filter(e =>
    e.status === 'error' &&
    (e.error || '').toLowerCase().includes('timeout')
  )
}

function getSlowCalls(thresholdMs = 3000) {
  return trackerLog.filter(e => e.duration > thresholdMs)
}

function printSummary() {
  const total = trackerLog.length
  const success = trackerLog.filter(e => e.status === 'success').length
  const errors = trackerLog.filter(e => e.status === 'error').length
  const timeouts = getTimeoutCalls().length
  const slow = getSlowCalls().length
  const avgDuration = total > 0
    ? Math.round(trackerLog.reduce((s, e) => s + (e.duration || 0), 0) / total)
    : 0

  console.log('[Tracker] 调用统计:', JSON.stringify({ total, success, errors, timeouts, slow, avgDuration }))
  if (timeouts > 0) {
    const lastTimeout = getTimeoutCalls().pop()
    console.error('[Tracker] 最近超时:', lastTimeout?.api, lastTimeout?.description, lastTimeout?.duration + 'ms')
  }
  return { total, success, errors, timeouts, slow, avgDuration }
}

function getByApi(apiName) {
  return trackerLog.filter(e => e.api === apiName)
}

// ---- install ----

function install() {
  const origCallFunction = wx.cloud.callFunction
  wx.cloud.callFunction = wrapCallFunction(origCallFunction.bind(wx.cloud))

  const origGetTempFileURL = wx.cloud.getTempFileURL
  wx.cloud.getTempFileURL = wrapGetTempFileURL(origGetTempFileURL.bind(wx.cloud))

  const origRequest = wx.request
  wx.request = wrapRequest(origRequest.bind(wx))

  if (wx.connectSocket) {
    const origConnectSocket = wx.connectSocket
    wx.connectSocket = wrapConnectSocket(origConnectSocket.bind(wx))
  }

  wx.$tracker = module.exports

  console.log('[Tracker] 已安装全局API追踪器 (callFunction + getTempFileURL + request + connectSocket)')
}

module.exports = {
  install,
  getRecentCalls,
  getTimeoutCalls,
  getSlowCalls,
  getByApi,
  printSummary,
}