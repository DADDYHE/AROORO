const REGEX = {
  phone: /^1[3-9]\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  idCard: /^[1-9]\d{5}(18|19|20)?\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/,
}

function isPhone(value) {
  return REGEX.phone.test(value)
}

function isEmail(value) {
  return REGEX.email.test(value)
}

function isNotEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function isIdCard(value) {
  return REGEX.idCard.test(value)
}

function isNumber(value) {
  return !isNaN(Number(value))
}

function isPositiveInt(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0
}

function maxLength(value, max) {
  return String(value).length <= max
}

function minLength(value, min) {
  return String(value).length >= min
}

function validateFields(fields, data) {
  for (const field of fields) {
    const value = data[field.name]
    const label = field.label || field.name

    if (field.required && !isNotEmpty(value)) {
      return { valid: false, message: `${label}不能为空` }
    }

    if (!isNotEmpty(value)) continue

    if (field.maxLength && !maxLength(value, field.maxLength)) {
      return { valid: false, message: `${label}不能超过${field.maxLength}个字符` }
    }

    if (field.minLength && !minLength(value, field.minLength)) {
      return { valid: false, message: `${label}至少需要${field.minLength}个字符` }
    }

    if (field.type === 'phone' && !isPhone(value)) {
      return { valid: false, message: `${label}格式不正确` }
    }

    if (field.type === 'email' && !isEmail(value)) {
      return { valid: false, message: `${label}格式不正确` }
    }

    if (field.type === 'number' && !isNumber(value)) {
      return { valid: false, message: `${label}必须为数字` }
    }

    if (field.type === 'positive_int' && !isPositiveInt(value)) {
      return { valid: false, message: `${label}必须为正整数` }
    }

    if (field.validator && typeof field.validator === 'function') {
      const customResult = field.validator(value, data)
      if (customResult !== true) {
        return { valid: false, message: customResult || `${label}验证失败` }
      }
    }
  }

  return { valid: true }
}

module.exports = {
  isPhone,
  isEmail,
  isNotEmpty,
  isIdCard,
  isNumber,
  isPositiveInt,
  maxLength,
  minLength,
  validateFields,
  REGEX,
}
