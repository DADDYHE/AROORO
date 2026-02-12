/**
 * TUI-Messages 子包预加载文件
 * 在 TUI-Messages 子包的任何组件加载前执行
 * 初始化必要的全局对象，避免 'undefined is not an object (evaluating 'a.functions')' 错误
 */

// 关键：在子包预加载时就初始化全局a变量
// 这样可以确保在子包代码评估阶段，a.functions就已经存在
try {
  // 方案1：在全局作用域直接定义a变量
  if (typeof a === 'undefined') {
    a = {};
  }
  if (!a.functions) {
    a.functions = {};
  }
  // 额外初始化一些可能需要的属性
  if (!a.functions.getAuthCode) {
    a.functions.getAuthCode = function() { return Promise.resolve(''); };
  }
  console.log('TUI-MESSAGES_PRELOAD: 全局a.functions 已初始化');
} catch (error) {
  console.warn('TUI-MESSAGES_PRELOAD: 初始化全局a失败:', error);
}

// 方案2：同时初始化wx.a
try {
  if (!wx.a) {
    wx.a = {};
  }
  if (!wx.a.functions) {
    wx.a.functions = {};
  }
  console.log('TUI-MESSAGES_PRELOAD: wx.a.functions 已初始化');
} catch (error) {
  console.warn('TUI-MESSAGES_PRELOAD: 初始化wx.a失败:', error);
}

// 尝试导入 TUICore 并初始化 functions 属性
try {
  const TUICore = require('@tencentcloud/tui-core');
  if (!TUICore.functions) {
    TUICore.functions = {};
  }
  console.log('TUI-MESSAGES_PRELOAD: TUICore.functions 已初始化');
} catch (error) {
  console.warn('TUI-MESSAGES_PRELOAD: TUICore 初始化失败:', error);
}

// 导出一个空对象作为模块导出
module.exports = {};
