/**
 * 地址工具函数
 * 提供从地址字符串中提取城市和区县信息的能力
 */

/**
 * 主要城市列表
 * 维护方便扩展：新增支持城市时只需添加一项
 */
const CITIES = [
  '北京', '上海', '广州', '深圳', '成都', '杭州', '重庆', '武汉',
  '苏州', '天津', '西安', '郑州', '南京', '长沙', '青岛', '大连',
  '宁波', '厦门', '合肥', '昆明', '沈阳', '哈尔滨', '济南', '福州',
  '无锡', '佛山', '东莞', '珠海', '中山', '惠州', '烟台', '潍坊',
  '温州', '南通', '嘉兴', '绍兴', '台州', '金华', '徐州', '常州',
  '泰州', '镇江', '扬州', '淮安', '盐城', '连云港', '宿迁',
]

/**
 * 区县关键词：用于在地址中识别区/县/市/新区等区划信息
 */
const DISTRICT_KEYWORDS = [
  '区', '县', '市', '新区', '开发区', '高新区', '经开区', '科技园',
  '工业园', '保税区', '自贸区', '新城', '老城',
]

/** 城市名匹配后，扫描的地址最大长度（字符） */
const MAX_DISTRICT_SCAN_LENGTH = 10

/**
 * 从地址字符串中提取「城市·区县」信息
 *
 * 规则：
 *  1. 优先从地址中匹配主要城市（CITIES）
 *  2. 若未匹配到，则尝试用正则解析「省X市」格式
 *  3. 匹配到城市后，在其后 MAX_DISTRICT_SCAN_LENGTH 字符内寻找区县关键词
 *  4. 返回「城市·区县」格式；若仅有城市则只返回城市
 *
 * @param {string} address 原始地址字符串
 * @returns {string} 提取后的「城市·区县」信息，原样返回当无法提取
 */
function extractCityAndDistrict(address) {
  if (!address) {return ''}

  let city = ''
  let district = ''

  for (const c of CITIES) {
    if (address.includes(c)) {
      city = c
      break
    }
  }

  if (!city) {
    const provinceMatch = address.match(/省(.{2,4}?市)/)
    if (provinceMatch) {
      city = provinceMatch[1].replace('市', '')
    }
  }

  if (city) {
    const cityIndex = address.indexOf(city)
    let afterCity = address.substring(cityIndex + city.length)

    // 城市名后紧跟的「市」字（如「上海市浦东新区」中的「市」）是行政区划标记，
    // 不属于区县名称的一部分，扫描区县前需要先剥离
    if (afterCity.startsWith('市')) {
      afterCity = afterCity.substring(1)
    }

    for (const keyword of DISTRICT_KEYWORDS) {
      const keywordIndex = afterCity.indexOf(keyword)
      if (keywordIndex > -1 && keywordIndex < MAX_DISTRICT_SCAN_LENGTH) {
        district = afterCity.substring(0, keywordIndex + keyword.length)
        break
      }
    }
  }

  if (city && district) {
    return `${city}·${district}`
  } else if (city) {
    return city
  }

  return address
}

module.exports = {
  extractCityAndDistrict,
}
