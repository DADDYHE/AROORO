/**
 * cloudIcons.js - 云存储图标路径工具
 *
 * 用途：
 *   - 统一管理云存储图标路径
 *   - 避免在多个页面中硬编码云存储路径
 *   - 与 wxs/cloudIcons.wxs 保持一致
 *
 * 用法：
 *   const { cloudIcon, CLOUD_ICONS } = require('../../utils/cloudIcons')
 *
 *   // 获取单个图标路径
 *   const iconPath = cloudIcon('megaphone-line')
 *
 *   // 使用预定义图标
 *   const iconPath = CLOUD_ICONS.MEGAPHONE
 */

const CLOUD_BASE = 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870'

/**
 * 获取云存储图标路径
 * @param {string} name 图标名称（不含扩展名）
 * @returns {string} 完整的云存储路径
 */
function cloudIcon(name) {
  return `${CLOUD_BASE}/icons/${name}.svg`
}

/**
 * 预定义图标常量
 */
const CLOUD_ICONS = {
  MEGAPHONE: cloudIcon('megaphone-line'),
  SHOPPING_CART: cloudIcon('shopping-cart-2-line'),
  DOOR_OPEN: cloudIcon('door-open-line'),
  HOME_HEART: cloudIcon('home-heart-line'),
  TIME: cloudIcon('time-line'),
  MAP_PIN: cloudIcon('map-pin-line'),
  BELL: cloudIcon('bell-line'),
  SHARE: cloudIcon('分享'),
  SERVICE: cloudIcon('客服'),
}

module.exports = { cloudIcon, CLOUD_ICONS }
