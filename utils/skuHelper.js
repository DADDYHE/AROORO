/**
 * utils/skuHelper.js - SKU 选择逻辑工具
 *
 * 用途：
 *   - 封装 SKU 选择、规格匹配、价格计算等逻辑
 *   - 从 group-detail/index.js 中抽离，减少主文件职责
 *
 * 用法：
 *   const skuHelper = require('../../utils/skuHelper')
 *   const popupSpecGroups = skuHelper.buildPopupSpecGroups(product)
 *   const matchedSku = skuHelper.findMatchedSku(product, selectedSpecs, popupSpecGroups)
 */

/**
 * 构建弹窗规格组（从 product.specGroups）
 */
function buildPopupSpecGroups(product) {
  if (!product.specGroups) { return [] }
  return product.specGroups.map((group, index) => ({
    specId: group.specId || group.name || `spec_${index}`,
    name: group.name,
    values: group.values,
    selectedValue: '',
    disabledValues: {},
  }))
}

/**
 * 构建回退规格组（从 product.skus 推断）
 */
function buildFallbackSpecGroups(product) {
  if (!product.skus || product.skus.length === 0) { return [] }
  const specTexts = product.skus
    .filter(s => s.enabled !== false)
    .map(s => s.specText || '')
    .filter(t => t)
  if (specTexts.length === 0) { return [] }
  const uniqueTexts = [...new Set(specTexts)]
  return [{
    specId: 'fallback_spec',
    name: '规格',
    values: uniqueTexts,
    selectedValue: '',
    disabledValues: {},
  }]
}

/**
 * 更新禁用的规格值
 */
function updateDisabledValues(product, popupSpecGroups, selectedSpecs) {
  if (!product) { return popupSpecGroups }
  const enabledSkus = (product.skus || []).filter(s => s.enabled !== false && (Number(s.tuanStock || s.stock || 0) > 0))

  return popupSpecGroups.map(group => {
    const disabledValues = {}
    const otherSpecs = { ...selectedSpecs }
    delete otherSpecs[group.specId]
    const hasOtherSelections = Object.values(otherSpecs).some(v => v !== '')

    group.values.forEach(val => {
      if (hasOtherSelections) {
        const candidate = { ...otherSpecs, [group.specId]: val }
        const hasMatch = enabledSkus.some(sku => {
          if (sku.specIds) {
            return Object.keys(candidate).every(specId =>
              candidate[specId] === '' || sku.specIds[specId] === candidate[specId]
            )
          }
          return candidate[group.specId] === '' || (sku.specText || '').includes(candidate[group.specId])
        })
        disabledValues[val] = !hasMatch
      } else {
        if (group.specId === 'fallback_spec') {
          const hasMatch = enabledSkus.some(sku => (sku.specText || '') === val)
          disabledValues[val] = !hasMatch
        } else {
          const hasMatch = enabledSkus.some(sku => sku.specIds && sku.specIds[group.specId] === val)
          disabledValues[val] = !hasMatch
        }
      }
    })

    return { ...group, disabledValues }
  })
}

/**
 * 查找匹配的 SKU
 */
function findMatchedSku(product, selectedSpecs, popupSpecGroups) {
  if (!product || !product.skus) { return null }
  const allSelected = popupSpecGroups.every(g => selectedSpecs[g.specId] && selectedSpecs[g.specId] !== '')
  if (!allSelected) { return null }

  if (popupSpecGroups.length === 1 && popupSpecGroups[0].specId === 'fallback_spec') {
    const specText = selectedSpecs.fallback_spec
    return product.skus.find(sku => (sku.specText || '') === specText && sku.enabled !== false) || null
  }

  return product.skus.find(sku => {
    if (!sku.specIds) { return false }
    return popupSpecGroups.every(g => sku.specIds[g.specId] === selectedSpecs[g.specId])
  }) || null
}

/**
 * 格式化价格
 */
function formatPrice(price) {
  const num = Number(price) || 0
  return num % 1 === 0 ? String(num) : num.toFixed(2)
}

module.exports = {
  buildPopupSpecGroups,
  buildFallbackSpecGroups,
  updateDisabledValues,
  findMatchedSku,
  formatPrice,
}
