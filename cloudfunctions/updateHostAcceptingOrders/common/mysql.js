const mysql = require('mysql2/promise');

// MySQL 连接配置（与 login 云函数保持一致）
const dbConfig = {
  host: 'sh-cynosdbmysql-grp-kvjh036e.sql.tencentcdb.com',
  user: 'jiyang',
  password: 'Hzy11235495',
  database: 'cloud1-8gvqhsiga3011047',
  port: 21191
};

// 执行 SQL 查询的函数
async function query(sql, params = []) {
  try {
    console.log('执行 SQL 查询:', sql, '参数:', params);
    
    // 创建数据库连接
    const connection = await mysql.createConnection(dbConfig);
    
    // 执行查询
    const [results] = await connection.execute(sql, params);
    
    // 关闭连接
    await connection.end();
    
    return results;
  } catch (error) {
    console.error('查询失败:', error);
    throw error;
  }
}

// 测试连接函数
async function testConnection() {
  try {
    // 尝试执行一个简单的查询来测试连接
    const result = await query('SELECT 1');
    console.log('数据库连接成功');
    return true;
  } catch (error) {
    console.error('数据库连接失败:', error);
    return false;
  }
}

// 执行事务函数
async function transaction(callback) {
  try {
    console.log('开始事务');
    
    // 创建数据库连接
    const connection = await mysql.createConnection(dbConfig);
    
    // 开始事务
    await connection.beginTransaction();
    
    try {
      // 执行事务操作
      const result = await callback(connection);
      
      // 提交事务
      await connection.commit();
      console.log('事务提交成功');
      
      // 关闭连接
      await connection.end();
      
      return result;
    } catch (error) {
      // 回滚事务
      await connection.rollback();
      console.error('事务回滚:', error);
      
      // 关闭连接
      await connection.end();
      
      throw error;
    }
  } catch (error) {
    console.error('事务失败:', error);
    throw error;
  }
}

// 生成唯一ID的辅助函数
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

module.exports = {
  query,
  testConnection,
  transaction,
  generateId
};