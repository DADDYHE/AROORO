/**
 * utils/addressUtils.js 测试
 * 验证从地址字符串中提取「城市·区县」信息的功能
 */
const { extractCityAndDistrict } = require('../utils/addressUtils')

describe('utils/addressUtils', () => {
  describe('extractCityAndDistrict', () => {
    test('空字符串/非字符串应返回空字符串', () => {
      expect(extractCityAndDistrict('')).toBe('')
      expect(extractCityAndDistrict(null)).toBe('')
      expect(extractCityAndDistrict(undefined)).toBe('')
    })

    test('主要城市应能正确识别（无区县）', () => {
      expect(extractCityAndDistrict('北京市')).toBe('北京')
      expect(extractCityAndDistrict('上海市')).toBe('上海')
      expect(extractCityAndDistrict('我在杭州')).toBe('杭州')
    })

    test('主要城市+区县应返回「城市·区县」', () => {
      expect(extractCityAndDistrict('北京市朝阳区望京')).toBe('北京·朝阳区')
      expect(extractCityAndDistrict('上海市浦东新区')).toBe('上海·浦东新区')
      expect(extractCityAndDistrict('杭州市西湖区文三路')).toBe('杭州·西湖区')
    })

    test('省X市格式应能解析（无区县）', () => {
      // "浙江省温州市" → 温州
      expect(extractCityAndDistrict('浙江省温州市')).toBe('温州')
    })

    test('省X市+区县应返回「城市·区县」', () => {
      expect(extractCityAndDistrict('浙江省温州市鹿城区')).toBe('温州·鹿城区')
    })

    test('未知地址应原样返回', () => {
      expect(extractCityAndDistrict('某某街道123号')).toBe('某某街道123号')
    })

    test('新区/开发区等扩展关键词应支持', () => {
      expect(extractCityAndDistrict('上海市浦东新区张江')).toBe('上海·浦东新区')
    })

    test('地址中含多个城市名时应取首个', () => {
      expect(extractCityAndDistrict('北京路与上海路交叉口')).toBe('北京')
    })
  })
})
