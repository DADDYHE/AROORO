// 在 AROORO 后台（web-admin）页面内运行：把登录态 JWT 镜像到插件存储，
// 供导入时作为 accessToken 使用（网关不转发 X-User-Token 头，函数只认 body.accessToken）。
(function () {
  try {
    var t = localStorage.getItem('token')
    if (t) {
      chrome.storage.local.set({ arooroToken: t })
    }
  } catch (e) { /* 跨域或隐私模式静默忽略 */ }
})()
