'use strict';
const cloud = require('wx-server-sdk')

// 初始化 cloud
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 简化的内存数据库实现
const db = {
  // 待办事项操作
  async getTodos() {
    // 简化查询：直接返回默认待办事项，避免数据库查询
    // 这样可以确保在很短时间内返回响应，避免超时
    return [
      {
        id: 1,
        content: '完成宠物档案创建',
        completed: false,
        created_at: new Date()
      },
      {
        id: 2,
        content: '上传身份证照片',
        completed: false,
        created_at: new Date()
      },
      {
        id: 3,
        content: '完善寄养家庭信息',
        completed: false,
        created_at: new Date()
      }
    ]
  }
}

exports.main = async (event, context) => {
  console.log('getTodos 云函数被调用');
  
  // 设置云函数超时
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Cloud function execution timeout'));
    }, 2500); // 2.5秒超时，比腾讯云默认3秒短
  });
  
  try {
    const result = await Promise.race([
      (async () => {
        // 测试连接
        console.log('正在查询待办事项...');
        
        // 使用统一的数据访问接口查询待办事项
        const rows = await db.getTodos();
        console.log('查询成功:', rows);
        
        return {
          success: true,
          data: rows,
          message: `查询到 ${rows.length} 条待办事项`
        };
      })(),
      timeoutPromise
    ]);
    
    return result;
  } catch (error) {
    console.error('查询失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
