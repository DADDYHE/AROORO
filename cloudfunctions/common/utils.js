/**
 * 云函数通用工具库
 * 包含错误处理、ID生成、数据验证等通用功能
 */

// 通用错误码定义
exports.ERROR_CODES = {
  SUCCESS: 0,
  DATABASE_ERROR: 1001,
  PARAMETER_ERROR: 1002,
  UNKNOWN_ERROR: 9999
}

// 通用错误信息定义
exports.ERROR_MESSAGES = {
  [exports.ERROR_CODES.SUCCESS]: '操作成功',
  [exports.ERROR_CODES.DATABASE_ERROR]: '数据库操作失败',
  [exports.ERROR_CODES.PARAMETER_ERROR]: '参数错误',
  [exports.ERROR_CODES.UNKNOWN_ERROR]: '未知错误'
}

/**
 * 生成唯一ID的辅助函数
 * @param {string} prefix - ID前缀
 * @returns {string} 生成的唯一ID
 */
exports.generateId = (prefix = '') => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 8)
  let userId = prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`
  
  // 确保长度不超过32字节
  if (userId.length > 32) {
    userId = userId.substring(0, 32)
  }
  
  // 确保只包含允许的字符（字母、数字、下划线）
  userId = userId.replace(/[^a-zA-Z0-9_]/g, '')
  
  return userId
}

/**
 * 统一错误处理函数
 * @param {Error} error - 错误对象
 * @param {string} customMessage - 自定义错误信息
 * @returns {object} 统一格式的错误响应
 */
exports.handleError = (error, customMessage = null) => {
  console.error('错误信息:', error.message)
  console.error('错误堆栈:', error.stack)
  
  const errorCode = exports.ERROR_CODES.UNKNOWN_ERROR
  const message = customMessage || exports.ERROR_MESSAGES[errorCode]
  
  return {
    code: errorCode,
    message: message,
    error: error.message
  }
}

/**
 * 统一成功响应函数
 * @param {object} data - 响应数据
 * @param {string} message - 自定义成功信息
 * @returns {object} 统一格式的成功响应
 */
exports.handleSuccess = (data = null, message = null) => {
  return {
    code: exports.ERROR_CODES.SUCCESS,
    message: message || exports.ERROR_MESSAGES[exports.ERROR_CODES.SUCCESS],
    data: data
  }
}

/**
 * 分页获取数据的辅助函数
 * @param {Database.Collection} collection - 数据库集合对象
 * @param {object} options - 分页选项
 * @param {number} options.page - 当前页码
 * @param {number} options.pageSize - 每页大小
 * @param {object} options.where - 查询条件
 * @param {object} options.orderBy - 排序条件
 * @returns {Promise<object>} 分页查询结果
 */
exports.paginate = async (collection, options = {}) => {
  const { page = 1, pageSize = 100, where = {}, orderBy = { field: '_id', direction: 'asc' } } = options
  
  const offset = (page - 1) * pageSize
  
  // 构建查询
  let query = collection.where(where)
  
  // 添加排序
  query = query.orderBy(orderBy.field, orderBy.direction)
  
  // 获取总数
  const countResult = await query.count()
  const total = countResult.total
  
  // 获取数据
  const dataResult = await query.skip(offset).limit(pageSize).get()
  
  return {
    data: dataResult.data,
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: Math.ceil(total / pageSize),
    hasNext: page * pageSize < total
  }
}

/**
 * 批量处理数据的辅助函数
 * @param {Array} data - 要处理的数据数组
 * @param {Function} handler - 单个数据处理函数
 * @param {number} batchSize - 每批处理的数据量
 * @returns {Promise<Array>} 处理结果数组
 */
exports.batchProcess = async (data, handler, batchSize = 10) => {
  const results = []
  
  // 分批处理数据
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          return await handler(item)
        } catch (error) {
          console.error('批量处理错误:', error)
          return { success: false, error: error.message }
        }
      })
    )
    
    results.push(...batchResults)
  }
  
  return results
}