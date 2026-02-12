let _console; let method
if (typeof console !== 'undefined') {
  _console = console
} else if (typeof global !== 'undefined' && global.console) {
  _console = global.console
} else if (typeof window !== 'undefined' && window.console) {
  _console = window.console
} else {
  _console = {}
}

const noop = function () {}
const methods = ['assert', 'clear', 'count', 'debug', 'dir', 'dirxml', 'error', 'group', 'groupCollapsed', 'groupEnd', 'info', 'log', 'profile', 'profileEnd', 'table', 'time', 'timeEnd', 'timeStamp', 'trace', 'warn']
let { length } = methods

while (length--) {
  method = methods[length]

  // 修复：检查 _console 而不是 console，避免变量被覆盖
  if (!_console[method]) {
    _console[method] = noop
  }
}

module.exports = _console
