# 宠物服务页面实现方案

## 目标
根据提供的截图设计，实现新的"宠物服务"页面，替换原有的"宠团团"Tab，将首页的上门服务和宠物寄养功能迁移过来。

---

## 页面结构分析

### 1. 顶部区域
- 标题："宠物服务"（大号字体，蓝色渐变）
- 副标题："上门喂养 宠物寄养"（中号字体，加粗）
- 装饰元素：可爱的图标（爪印、骨头等）和插画
- 背景：浅蓝色网格渐变

### 2. 服务卡片区
- **上门喂养卡片**（左上方）
  - 渐变蓝色背景（#1890FF到#40A9FF）
  - 标题文字
  - 副标题："用\"温度\"融化Ta的孤单"
  - 小宠物图片轮播
  - 图标装饰

- **宠物寄养卡片**（右上方）
  - 渐变米黄色背景
  - 标题文字
  - 副标题："布丁严选家庭&酒店"
  - 图标装饰

### 3. 快捷入口区
- **上门遛狗**按钮（浅绿色背景）
- **特惠养宠**按钮（浅粉色背景）

### 4. 团购订单入口
- 美团图标
- "团购订单入口"文字
- 右侧"查看"箭头按钮

### 5. 历史记录区
- 标题栏："历史记录" + 右侧"查看服务记录和评价详情"
- 三个统计卡片：
  - 已喂养猫咪数（粉色渐变）
  - 已遛狗狗数（蓝色渐变）
  - 家长好评数（橙色渐变）
- 数据来源说明："*数据来源于布丁Pudding平台"

### 6. 加入布丁区
- 卡片式设计
- 图标 + "加入布丁"标题
- 副标题："申请成为布丁喂养员/布丁寄养员/布丁推广员"
- 右侧箭头

### 7. 底部Tab栏
- 宠物服务
- 消息
- 我的

---

## 文件结构规划

```
pages/
└── service/
    ├── index.js
    ├── index.json
    ├── index.wxml
    └── index.wxss

images/
└── service/
    ├── pet-service-banner.svg
    ├── pet-feeding-illustration.svg
    ├── pet-boarding-illustration.svg
    ├── dog-walk-icon.svg
    ├── special-pet-icon.svg
    ├── join-pudding-icon.svg
    ├── cat-icon.svg
    ├── dog-icon.svg
    ├── paw-icon.svg
    └── star-icon.svg
```

---

## 实现步骤

### Step 1: 创建新页面 `pages/service/`

| 操作 | 说明 |
|------|------|
| 创建 `pages/service/index.js` | 页面逻辑 |
| 创建 `pages/service/index.json` | 页面配置（关闭导航栏） |
| 创建 `pages/service/index.wxml` | 页面结构 |
| 创建 `pages/service/index.wxss` | 页面样式 |

**关键数据**：
- 统计数据（硬编码模拟或后期对接API）
- 历史记录列表
- 团购订单入口
- 加入布丁入口

### Step 2: 修改 `app.json`

更新 `tabBar.list`，将：
```json
{
  "pagePath": "/pages/discover/index",
  "text": "宠团团",
  "iconPath": "/images/icons/discover-line.svg",
  "selectedIconPath": "/images/icons/discover-white.svg"
}
```
替换为：
```json
{
  "pagePath": "/pages/service/index",
  "text": "宠物服务",
  "iconPath": "/images/icons/service-line.svg",
  "selectedIconPath": "/images/icons/service-white.svg"
}
```

### Step 3: 修改 `custom-tab-bar/index.js`

同步更新Tab列表

### Step 4: 修改首页 `pages/home/index.js`

移除 `featureItems` 中的 `feeding` 和 `boarding` 项，保留：
```js
featureItems: [
  { id: 'activity', name: '线下活动', desc: '精彩社区活动', icon: FEATURE_ICONS[0] },
  { id: 'mall', name: '宠物商城', desc: '精选好物推荐', icon: FEATURE_ICONS[1] },
]
```

### Step 5: 准备图片资源
- 添加服务页面需要的SVG/PNG图片到 `images/service/`
- 使用占位图或AI生成图片快速实现

---

## 页面详细设计

### 顶部区域
```wxml
<view class="service-header">
  <image class="header-bg" src="..." mode="aspectFill"/>
  <view class="header-content">
    <view class="title">宠物服务</view>
    <view class="subtitle">上门喂养 宠物寄养</view>
  </view>
</view>
```

### 服务卡片区
```wxml
<view class="service-cards">
  <!-- 上门喂养卡片 -->
  <view class="service-card feeding-card">
    <view class="card-title">上门喂养</view>
    <view class="card-subtitle">用“温度”融化Ta的孤单</view>
    <view class="pet-preview">
      <image src="..." mode="aspectFill"/>
      <image src="..." mode="aspectFill"/>
      <image src="..." mode="aspectFill"/>
    </view>
  </view>

  <!-- 宠物寄养卡片 -->
  <view class="service-card boarding-card">
    <view class="card-title">宠物寄养</view>
    <view class="card-subtitle">布丁严选家庭&酒店</view>
    <image class="card-icon" src="..." mode="aspectFit"/>
  </view>
</view>
```

### 快捷入口区
```wxml
<view class="quick-actions">
  <view class="action-item walk-action">
    <image src="..." class="action-icon" mode="aspectFit"/>
    <text>上门遛狗</text>
  </view>
  <view class="action-item special-action">
    <image src="..." class="action-icon" mode="aspectFit"/>
    <text>特惠养宠</text>
  </view>
</view>
```

### 团购订单入口
```wxml
<view class="group-buy-entry">
  <image src="/images/icons/meituan-icon.svg" class="meituan-icon" mode="aspectFit"/>
  <text class="entry-title">团购订单入口</text>
  <view class="entry-action">
    <text>查看</text>
    <text class="arrow">›</text>
  </view>
</view>
```

### 历史记录区
```wxml
<view class="history-section">
  <view class="section-header">
    <text class="section-title">历史记录</text>
    <view class="more-action">
      <text>查看服务记录和评价详情</text>
      <text class="arrow">›</text>
    </view>
  </view>
  <view class="stats-grid">
    <view class="stat-card cat-stat">
      <image class="stat-icon" src="..." mode="aspectFit"/>
      <text class="stat-number">152165</text>
      <text class="stat-unit">只</text>
      <text class="stat-label">已喂养猫咪数</text>
      <text class="stat-date">至2026.02.15</text>
    </view>
    <view class="stat-card dog-stat">
      <image class="stat-icon" src="..." mode="aspectFit"/>
      <text class="stat-number">101524</text>
      <text class="stat-unit">只</text>
      <text class="stat-label">已遛狗狗数</text>
      <text class="stat-date">至2026.02.15</text>
    </view>
    <view class="stat-card rating-stat">
      <image class="stat-icon" src="..." mode="aspectFit"/>
      <text class="stat-number">253579</text>
      <text class="stat-unit">次</text>
      <text class="stat-label">家长好评数</text>
      <text class="stat-date">至2026.02.15</text>
    </view>
  </view>
  <text class="data-source">*数据来源于布丁Pudding平台</text>
</view>
```

### 加入布丁区
```wxml
<view class="join-section">
  <view class="join-card">
    <image class="join-icon" src="..." mode="aspectFit"/>
    <view class="join-texts">
      <text class="join-title">加入布丁</text>
      <text class="join-subtitle">申请成为布丁喂养员/布丁寄养员/布丁推广员</text>
    </view>
    <text class="arrow">›</text>
  </view>
</view>
```

---

## 样式设计要点

### 配色方案
- 主蓝色：#1890FF → #40A9FF（上门喂养）
- 主橙色：#FFA500 → #FFB84D（加入布丁）
- 米黄色：#FFF3E0 → #FFE0B2（宠物寄养）
- 浅绿色：#E8F5E9 → #C8E6C9（上门遛狗）
- 浅粉色：#FCE4EC → #F8BBD0（特惠养宠）
- 统计卡片渐变色彩：猫咪（粉）、狗狗（蓝）、好评（橙）

### 关键样式
- 圆角：32rpx、24rpx、16rpx 三级
- 阴影：`0 4rpx 16rpx rgba(0,0,0,0.06)`
- 字体：标题36-40rpx/700，副标题28-32rpx/500，正文24-26rpx
- 间距：24-32rpx
