// 测试当前项目中a变量的内容
console.log('=== 测试项目中a变量的内容 ===')

// 测试 1: 检查全局a变量
console.log('\n测试 1: 检查全局a变量')
try {
  console.log('全局a变量是否存在:', typeof a !== 'undefined')
  if (typeof a !== 'undefined') {
    console.log('全局a变量的类型:', typeof a)
    console.log('全局a变量的内容:', a)
    console.log('全局a变量的属性:', Object.keys(a))
    
    if (a.functions) {
      console.log('a.functions是否存在:', true)
      console.log('a.functions的内容:', a.functions)
      console.log('a.functions的方法:', Object.keys(a.functions))
      
      if (a.functions.getAuthCode) {
        console.log('a.functions.getAuthCode是否存在:', true)
        console.log('a.functions.getAuthCode的类型:', typeof a.functions.getAuthCode)
      }
    }
  }
} catch (error) {
  console.error('检查全局a变量时出错:', error)
}

// 测试 2: 检查wx.a变量
console.log('\n测试 2: 检查wx.a变量')
try {
  console.log('wx对象是否存在:', typeof wx !== 'undefined')
  if (typeof wx !== 'undefined') {
    console.log('wx.a是否存在:', typeof wx.a !== 'undefined')
    if (typeof wx.a !== 'undefined') {
      console.log('wx.a的类型:', typeof wx.a)
      console.log('wx.a的内容:', wx.a)
      console.log('wx.a的属性:', Object.keys(wx.a))
      
      if (wx.a.functions) {
        console.log('wx.a.functions是否存在:', true)
        console.log('wx.a.functions的内容:', wx.a.functions)
        console.log('wx.a.functions的方法:', Object.keys(wx.a.functions))
      }
    }
  }
} catch (error) {
  console.error('检查wx.a变量时出错:', error)
}

// 测试 3: 检查globalThis.a变量
console.log('\n测试 3: 检查globalThis.a变量')
try {
  console.log('globalThis是否存在:', typeof globalThis !== 'undefined')
  if (typeof globalThis !== 'undefined') {
    console.log('globalThis.a是否存在:', typeof globalThis.a !== 'undefined')
    if (typeof globalThis.a !== 'undefined') {
      console.log('globalThis.a的类型:', typeof globalThis.a)
      console.log('globalThis.a的内容:', globalThis.a)
      console.log('globalThis.a的属性:', Object.keys(globalThis.a))
      
      if (globalThis.a.functions) {
        console.log('globalThis.a.functions是否存在:', true)
        console.log('globalThis.a.functions的内容:', globalThis.a.functions)
        console.log('globalThis.a.functions的方法:', Object.keys(globalThis.a.functions))
      }
    }
  }
} catch (error) {
  console.error('检查globalThis.a变量时出错:', error)
}

// 测试 4: 检查TUI-Messages相关文件是否正确初始化a变量
console.log('\n测试 4: 检查TUI-Messages初始化')
try {
  // 尝试加载TUI-Messages的初始化文件
  const aInit = require('./TUI-Messages/a.js')
  console.log('TUI-Messages/a.js加载成功')
  
  const preload = require('./TUI-Messages/preload.js')
  console.log('TUI-Messages/preload.js加载成功')
  
} catch (error) {
  console.error('加载TUI-Messages初始化文件时出错:', error)
}

console.log('\n=== 测试完成 ===')
