/**
 * 前端表单字段校验工具
 * @param {Array} fields - 校验规则数组 [{ name, label, required, type }]
 * @param {Object} data - 待校验数据
 * @returns {{ valid: boolean, message: string }}
 */
function validateFields(fields, data) {
  for (const rule of fields) {
    const { name, label, required, type } = rule
    const value = data && data[name]

    if (required && (value === undefined || value === null || value === '')) {
      return { valid: false, message: `${label}不能为空` }
    }

    if (value !== undefined && value !== null && value !== '') {
      if (type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) {
        return { valid: false, message: `${label}格式不正确` }
      }
      if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { valid: false, message: `${label}格式不正确` }
      }
    }
  }
  return { valid: true, message: '' }
}

module.exports = { validateFields }
