// 全局a变量初始化文件
// 确保在TUI-Messages子包的任何代码执行前，全局变量a就已经存在
// 这样可以避免 'undefined is not an object (evaluating 'a.functions')' 错误

// 确保在全局作用域中定义a变量
// 在微信小程序中，全局作用域可以通过globalThis访问
if (typeof globalThis !== 'undefined') {
  globalThis.a = globalThis.a || {};
  globalThis.a.functions = globalThis.a.functions || {};
  globalThis.a.functions.getAuthCode = globalThis.a.functions.getAuthCode || function() { return Promise.resolve(''); };
  console.log('TUI-MESSAGES_GLOBAL: 通过globalThis初始化全局a.functions');
} else {
  // 兼容不支持globalThis的环境
  try {
    // 直接在全局作用域定义a变量
    a = a || {};
    a.functions = a.functions || {};
    a.functions.getAuthCode = a.functions.getAuthCode || function() { return Promise.resolve(''); };
    console.log('TUI-MESSAGES_GLOBAL: 直接初始化全局a.functions');
  } catch (error) {
    console.warn('TUI-MESSAGES_GLOBAL: 初始化全局a变量失败:', error);
  }
}

// 导出一个空对象作为模块导出
module.exports = {};
