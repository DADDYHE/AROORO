# 腾讯位置服务SDK集成文档

## SDK配置信息

- **Key**: `Z54BZ-5TUCM-IS76C-6WUX3-ZJJ46-3PF54`
- **SDK包**: `qqmap-wx-jssdk`
- **文档地址**: https://lbs.qq.com/miniProgram/jsSdk/jsSdkGuide/jsSdkOverview

## 已集成的功能

### 1. 工具封装 (`utils/qqmap.js`)

已创建腾讯地图工具类，提供以下方法：

#### 获取当前位置
```javascript
const location = await QQMap.getCurrentLocation()
// 返回: { latitude, longitude, province, city, district, street, address }
```

#### 逆地址解析（坐标转地址）
```javascript
const addressInfo = await QQMap.reverseGeocode(latitude, longitude)
// 返回: { province, city, district, street, address }
```

#### 地址解析（地址转坐标）
```javascript
const coords = await QQMap.geocode('北京市朝阳区')
// 返回: { latitude, longitude }
```

#### 关键词搜索周边
```javascript
const results = await QQMap.searchNearby('加油站', { latitude, longitude }, 1000)
// 返回: [{ id, title, address, latitude, longitude, distance }, ...]
```

#### 打开地图选择位置
```javascript
const location = await QQMap.chooseLocation()
// 返回: { name, address, latitude, longitude }
// 用户取消时返回 null
```

#### 计算两地间距离
```javascript
const distance = await QQMap.calculateDistance(
  { latitude: lat1, longitude: lng1 },
  { latitude: lat2, longitude: lng2 }
)
// 返回: 距离（米）
```

#### 获取城市列表
```javascript
const cities = await QQMap.getCityList()
// 返回: [{ id, fullname, ... }, ...]
```

#### 获取区县列表
```javascript
const districts = await QQMap.getDistrictByCity('北京')
// 返回: [{ id, fullname, ... }, ...]
```

### 2. 页面集成示例

#### 在 `pages/booking/calendar.js` 中的使用：

```javascript
const QQMap = require('../../utils/qqmap')

// 打开位置选择器
async openLocationSelector() {
  wx.showLoading({ title: '打开地图...', mask: true })

  try {
    const locationInfo = await QQMap.chooseLocation()
    wx.hideLoading()

    if (!locationInfo) return // 用户取消

    // 获取详细地址信息
    const addressDetail = await QQMap.reverseGeocode(
      locationInfo.latitude,
      locationInfo.longitude
    )

    // 更新页面数据
    this.setData({
      selectedLocation: `${addressDetail.city}${addressDetail.district}`,
      locationDetail: {
        name: locationInfo.name,
        address: locationInfo.address,
        latitude: locationInfo.latitude,
        longitude: locationInfo.longitude,
        city: addressDetail.city,
        district: addressDetail.district
      }
    })
  } catch (error) {
    wx.hideLoading()
    console.error('位置选择失败:', error)
    // 使用备选方案
    this.fallbackToCitySelector()
  }
}

// 备选方案：城市列表选择
fallbackToCitySelector() {
  QQMap.getCityList().then(cities => {
    const cityNames = cities.map(city => city.fullname)
    wx.showActionSheet({
      itemList: cityNames,
      success: (res) => {
        const selectedCity = cities[res.tapIndex]
        this.setData({ selectedLocation: selectedCity.fullname })
      }
    })
  })
}
```

## 使用场景

### 1. 寄养位置选择
用户可以通过地图选择具体的寄养位置，SDK会自动获取：
- 精确的经纬度坐标
- 详细的地址信息
- 城市和区县信息

### 2. 距离计算
可以计算用户当前位置到寄养家庭的距离，帮助用户选择最近的寄养服务。

### 3. 周边搜索
可以搜索寄养家庭周边的设施，如公园、宠物医院等。

### 4. 地址管理
在编辑个人资料时，可以使用地图选择功能精确填写地址。

## 注意事项

1. **权限要求**：使用位置功能需要在 `app.json` 中配置权限：
   ```json
   {
     "permission": {
       "scope.userLocation": {
         "desc": "您的位置信息将用于推荐附近的寄养家庭"
       }
     }
   }
   ```

2. **错误处理**：所有方法都返回 Promise，需要使用 try-catch 处理错误

3. **用户取消**：`chooseLocation` 方法在用户取消时会返回 null，需要特别处理

4. **备选方案**：当地图选择失败时，可以使用城市列表作为备选方案

5. **数据持久化**：选择的位置信息建议保存到全局变量或本地存储中

## 后续优化建议

1. 添加地图组件展示：可以集成地图组件展示位置标记
2. 位置缓存：缓存常用的位置信息，提升用户体验
3. 智能推荐：根据用户当前位置推荐附近的寄养家庭
4. 路径规划：使用路径规划API计算前往寄养家庭的路线
