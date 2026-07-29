# AROORO 全量 Skyline + Worklet 迁移方案

> **文档用途**：随时可参考的迁移指南，防止上下文丢失
> **项目路径**：`/Users/yy/Documents/trae_projects/zuoyou`
> **创建日期**：2026-07-29
> **目标**：全量切换 Skyline + worklet，零 webview 降级，所有页面共享同一渲染引擎
> **项目规模**：7 主包页面 + 10 分包共 60+ 页面

---

## 目录

1. [改造总览](#一改造总览按优先级)
2. [P0 阻断性必改](#二p0--阻断性必改)
3. [Vant 组件全量替换方案](#三vant-组件全量替换方案)
4. [scroll-view 列表框架改造](#四scroll-view-列表框架改造)
5. [custom-tab-bar 全量改造](#五custom-tab-bar-全量改造)
6. [backdrop-filter 全量统一](#六backdrop-filter-全量统一)
7. [CSS 不兼容特性全量改造](#七css-不兼容特性全量改造)
8. [分阶段实施计划](#八分阶段实施计划)
9. [风险评估与回滚策略](#九风险评估与回滚策略)
10. [性能预期](#十性能预期)
11. [完整文件清单](#十一完整文件清单)

---

## 一、改造总览（按优先级）

| 优先级 | 改造项 | 影响规模 | 风险 |
|---|---|---|---|
| **P0** | 全局配置切换 | 2 个文件 | 低 |
| **P0** | Vant Weapp 组件不兼容 | 5 个页面 / 19 处引用 | 高 |
| **P0** | 自定义 tabBar 复杂 filter 链 | 1 处 | 中 |
| **P1** | `position:fixed/sticky` 改造 | 65 处 / 35+ 文件 | 高 |
| **P1** | 页面滚动 API 迁移 | 30+ 页面 | 高 |
| **P1** | `backdrop-filter` 单位统一 | 59 处 / 17 文件 | 中 |
| **P1** | `::-webkit-scrollbar`/`::selection` 移除 | 8 处 | 低 |
| **P2** | `display:grid` 改 flex | 14 处 / 14 文件 | 中 |
| **P2** | `::before/::after` 伪元素验证 | 185 处 / 39 文件 | 中 |
| **P2** | `navigationStyle:"custom"` 改造 | 1 页面 | 低 |
| **P3** | `onReachBottomDistance` 迁移 | 2 页面 | 低 |
| **P3** | `video` 同层渲染验证 | 3 处 | 低 |
| **P3** | `createSelectorQuery` 加上下文 | 1 处 | 低 |

### 核心策略：三大基础设施先行

| 基础设施 | 作用 | 复用范围 |
|---|---|---|
| **A. Skyline 兼容组件库** | 替换 Vant 全部 8 个组件 | 5 个 Vant 页面 |
| **B. scroll-view 列表框架** | 统一替代页面级滚动 API | 30+ 页面 |
| **C. root-portal 布局组件** | 替换所有 position:fixed | 35+ 文件 |

### 关键正面信号

- CSS 动画已全部清理（0 处 `@keyframes` / `animation` / `transition`），为 worklet 迁移扫清最大障碍
- [styles/design-tokens.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/styles/design-tokens.wxss) 已有 `@supports` 检测 + px 单位兜底范式
- [pages/discover/index.wxml](file:///Users/yy/Documents/trae_projects/zuoyou/pages/discover/index.wxml) 已是 Skyline 友好模板（scroll-view + bindscrolltolower + refresher-enabled）

---

## 二、P0 — 阻断性必改

### 1. 全局配置（2 个文件）

**`/Users/yy/Documents/trae_projects/zuoyou/app.json`**

```diff
- "renderer": "webview",
+ "renderer": "skyline",
+ "componentFramework": "glass-easel",
+ "rendererOptions": {
+   "skyline": {
+     "defaultDisplayBlock": true,
+     "disableABTest": true,
+     "defaultContentBox": true
+   }
+ }
```

**`/Users/yy/Documents/trae_projects/zuoyou/project.config.json`**

```diff
- "compileWorklet": false,
+ "compileWorklet": true,
```

### 2. Vant Weapp 不兼容（5 页面 / 19 处）

| 页面 | Vant 组件 | 改造策略 |
|---|---|---|
| [subpackages/pet/create-step1.json](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/create-step1.json) | van-field, van-cell-group, van-action-sheet, van-popup, van-datetime-picker | 自建组件替换 |
| [subpackages/pet/update-profile.json](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/update-profile.json) | 同上 5 个 | 同上 |
| [subpackages/booking/pet-select.json](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/pet-select.json) | van-popup, van-calendar | 自建组件替换 |
| [subpackages/booking/confirm.json](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/confirm.json) | van-calendar, van-loading | 自建组件替换 |
| [subpackages/other/favorites/index.json](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/favorites/index.json) | van-icon | 自建 zy-icon 替换 |

### 3. 自定义 tabBar 复杂 filter 链（1 处）

**`/Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.wxss:129`**

```css
/* ❌ 当前：Skyline 不支持的复杂 filter 链 */
filter: brightness(0) saturate(100%) invert(31%) sepia(14%) saturate(647%) hue-rotate(41deg) brightness(94%) contrast(93%);
```

**改造方案**：准备选中/未选中两套图标资源（PNG/SVG），用 `src` 切换替代 filter。

---

## 三、Vant 组件全量替换方案

### 替换映射表

| Vant 组件 | 替换方案 | 实现成本 |
|---|---|---|
| `van-popup` (3处) | 自建 `zy-popup` 组件，用 `root-portal` + `worklet` 驱动出入场 | 中 |
| `van-calendar` (2处) | 自建 `zy-calendar` 组件，scroll-view 横向滑月 + worklet 弹性回弹 | 高 |
| `van-field` (2处) | 原生 `<input>` + 自定义样式 | 低 |
| `van-cell-group` (2处) | 纯 flex 布局 + 自定义样式 | 低 |
| `van-action-sheet` (2处) | 自建 `zy-action-sheet`，基于 `zy-popup` 扩展 | 中 |
| `van-datetime-picker` (2处) | 原生 `<picker mode="date">` + 自定义样式 | 低 |
| `van-loading` (1处) | CSS `animation` 或 worklet 旋转 | 低 |
| `van-icon` (1处) | 自建 `zy-icon` 组件，iconfont 或 SVG | 低 |

### 组件优先级与实现顺序

```
第1批（低成本，快速解锁页面）
  zy-icon → 替换 favorites 页
  zy-loading → 替换 booking/confirm
  van-field → van-cell-group → van-datetime-picker → 替换 pet/create-step1、pet/update-profile

第2批（中成本，核心弹层）
  zy-popup（基础组件）
  zy-action-sheet（基于 zy-popup）

第3批（高成本，日历）
  zy-calendar（最复杂，最后做）
```

### zy-popup 组件设计（核心，复用率最高）

```javascript
// components/zy-popup/index.js
const { worklet } = wx.worklet;

Component({
  properties: {
    visible: { type: Boolean, value: false },
    position: { type: String, value: 'bottom' }, // bottom|top|center|right|left
    round: { type: Boolean, value: true },
    closeable: { type: Boolean, value: false },
    overlay: { type: Boolean, value: true },
  },

  data: {
    _translateY: 100,  // worklet 共享变量
    _overlayOpacity: 0,
    _visible: false,
  },

  lifetimes: {
    attached() {
      this.applyUpdate = this.applyUpdate.bind(this);
    }
  },

  methods: {
    handleVisibleChange(visible) {
      if (visible) {
        this.setData({ _visible: true }, () => {
          // worklet 弹簧动画入场
          worklet.timing(
            this.data._translateY,
            { duration: 300, easing: 'easeOut' },
            (v) => this.applyUpdate('_translateY', v)
          )(0);
          worklet.timing(
            this.data._overlayOpacity,
            { duration: 300 },
            (v) => this.applyUpdate('_overlayOpacity', v)
          )(1);
        });
      } else {
        // 出场
        worklet.timing(
          this.data._translateY,
          { duration: 250, easing: 'easeIn' },
          (v) => this.applyUpdate('_translateY', v)
        )(100);
        worklet.timing(
          this.data._overlayOpacity,
          { duration: 250 },
          (v) => this.applyUpdate('_overlayOpacity', v)
        )(0, () => this.setData({ _visible: false }));
      }
    },

    applyUpdate(key, value) {
      this.setData({ [key]: value });
    },

    onOverlayTap() {
      this.triggerEvent('close');
    }
  },

  observers: {
    'visible': function(visible) {
      this.handleVisibleChange(visible);
    }
  }
});
```

```xml
<!-- components/zy-popup/index.wxml -->
<root-portal wx:if="{{_visible}}">
  <!-- 遮罩 -->
  <view class="zy-popup__overlay"
        style="opacity: {{_overlayOpacity}};"
        bindtap="onOverlayTap"
        wx:if="{{overlay}}">
  </view>
  <!-- 内容 -->
  <view class="zy-popup zy-popup--{{position}} {{round ? 'zy-popup--round' : ''}}"
        style="transform: translateY({{_translateY}}%);">
    <slot></slot>
    <view wx:if="{{closeable}}" class="zy-popup__close" bindtap="onOverlayTap">×</view>
  </view>
</root-portal>
```

---

## 四、scroll-view 列表框架改造

### 改造 `behaviors/listBehavior.js`（一次到位）

```javascript
// behaviors/listBehavior.js
module.exports = Behavior({
  data: {
    _refresherTriggered: false,
    _scrollIntoView: '',
  },

  methods: {
    // 统一的 scroll-view 下拉刷新
    _onRefresherRefresh() {
      this.setData({ _refresherTriggered: true });
      Promise.resolve(this.onPullDownRefresh ? this.onPullDownRefresh() : null)
        .finally(() => {
          this.setData({ _refresherTriggered: false });
        });
    },

    // 统一的 scroll-view 触底加载
    _onScrollToLower() {
      if (this._loadingMore) return;
      this._loadingMore = true;
      Promise.resolve(this.onReachBottom ? this.onReachBottom() : null)
        .finally(() => {
          this._loadingMore = false;
        });
    },

    // 统一的滚动监听（替代 onPageScroll）
    _onScroll(e) {
      const { scrollTop } = e.detail;
      if (this.onPageScroll) this.onPageScroll({ scrollTop });
    },

    // 滚动到指定位置（替代 wx.pageScrollTo）
    _scrollTo(top, duration = 300) {
      this.setData({ _scrollTop: top });
    },
  }
});
```

### 页面 wxml 模板（统一结构）

```xml
<!-- 所有列表页统一结构 -->
<scroll-view
  scroll-y
  enhanced
  refresher-enabled
  refresher-triggered="{{_refresherTriggered}}"
  bindrefresherrefresh="_onRefresherRefresh"
  bindscrolltolower="_onScrollToLower"
  bindscroll="_onScroll"
  lower-threshold="100"
  style="height: 100vh;"
>
  <!-- 页面内容 -->
</scroll-view>
```

### 页面 .js 改造模式

```javascript
// pages/discover/index.js（改造前）
Page({
  onPullDownRefresh() { /* ... */ },
  onReachBottom() { /* ... */ },
  onPageScroll(e) { /* ... */ }
});

// 改造后
const listBehavior = require('../../behaviors/listBehavior.js');

Page({
  behaviors: [listBehavior],

  // 保留原方法名，由 behavior 自动路由
  onPullDownRefresh() { /* 业务逻辑不变 */ },
  onReachBottom() { /* 业务逻辑不变 */ },
  onPageScroll(e) { /* 业务逻辑不变 */ }
});
```

> **关键收益**：所有页面 .js 业务逻辑几乎不动，只改 wxml 包裹层 + 引入 behavior。

### 需要改造的页面清单

#### onPageScroll（3 页面）

- [pages/profile/index.js:252](file:///Users/yy/Documents/trae_projects/zuoyou/pages/profile/index.js#L252)
- [subpackages/pet/detail.js:53](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/detail.js#L53)
- [subpackages/booking/host-list-all.js:39](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/host-list-all.js#L39)

#### onReachBottom（11+ 页面）

统一抽象层：[behaviors/listBehavior.js:23](file:///Users/yy/Documents/trae_projects/zuoyou/behaviors/listBehavior.js#L23)

- pages/discover/index.js:52
- pages/quick-register/index.js:33
- subpackages/profile/referral/index.js:73
- subpackages/partner/i18n-override/index.js:85
- subpackages/partner/withdrawal/index.js:54
- subpackages/partner/referral/index.js:69
- subpackages/partner/activity-list/index.js:99
- subpackages/activity/my-registered.js:51
- subpackages/activity/list.js:86
- subpackages/booking/host-list-all.js:51
- subpackages/feeding/groomer-list.js:44

#### onPullDownRefresh（21+ 页面）

- pages/discover/index.js:45
- pages/quick-register/index.js:37
- pages/home/index.js:100
- subpackages/profile/order-stats/index.js:552
- subpackages/profile/order-detail/index.js:180
- subpackages/profile/referral/index.js:69
- subpackages/profile/mall-order-detail/index.js:316
- subpackages/profile/notification/list.js:62
- subpackages/partner/i18n-override/index.js:80
- subpackages/partner/service-income/index.js:97
- subpackages/partner/referral/index.js:89
- subpackages/partner/activity-list/index.js:131
- subpackages/other/video-list/index.js:70
- subpackages/other/favorites/index.js:355
- subpackages/booking/host-list-all.js:46
- subpackages/booking/pet-select.js:362
- subpackages/feeding/order-status.js:39
- subpackages/feeding/groomer-list.js:43
- subpackages/pet/list.js:108
- subpackages/activity/my-registered.js:51
- subpackages/activity/list.js:85

---

## 五、custom-tab-bar 全量改造

### 改造点

| 问题 | 改造方案 |
|---|---|
| `position:fixed` 容器 | 用 `root-portal` 包裹整个 tabBar |
| 复杂 `filter:` 链（行 129） | 准备选中/未选中两套 PNG 图标，`src` 切换 |
| `splash-overlay` 启动屏 | 用 `root-portal` 独立包裹 |
| 伪元素指示点 | 保留，Skyline 实测验证 |
| 中心凸起按钮 | `margin-top:-56rpx` + `box-shadow`，Skyline 下验证 overflow 裁剪 |

### 图标资源准备

```
custom-tab-bar/icons/
├── home.png           (未选中)
├── home-active.png    (选中，原色)
├── discover.png
├── discover-active.png
├── service.png
├── service-active.png
├── profile.png
└── profile-active.png
```

### 涉及文件

- [custom-tab-bar/index.js](file:///Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.js)
- [custom-tab-bar/index.json](file:///Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.json)
- [custom-tab-bar/index.wxml](file:///Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.wxml)
- [custom-tab-bar/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.wxss)

---

## 六、backdrop-filter 全量统一

### 改造规则

1. **所有 `blur(Nrpx)` → `blur(Npx)`**（N = rpx 值 / 2，基于 750rpx = 375px 设计稿）
2. **统一使用 `@supports` 兜底范式**（复用 [styles/design-tokens.wxss:136-148](file:///Users/yy/Documents/trae_projects/zuoyou/styles/design-tokens.wxss#L136-L148) 已有范式）
3. **Skyline 下增加纯色半透明兜底**

### 全局工具类（写入 design-tokens.wxss）

```css
/* Skyline 友好的毛玻璃基类 */
.zy-glass {
  /* 兜底：纯色半透明 */
  background: var(--zy-tabbar-bg-fallback);
}

@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .zy-glass {
    background: var(--zy-tabbar-bg-glass);
    -webkit-backdrop-filter: blur(var(--zy-blur-md));
    backdrop-filter: blur(var(--zy-blur-md));
  }
}
```

### 重点文件（按出现次数）

| 文件 | 次数 |
|---|---|
| [subpackages/booking/host-list-all.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/host-list-all.wxss) | 14 |
| [subpackages/mall/product-detail.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall/product-detail.wxss) | 7 |
| [subpackages/other/favorites/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/favorites/index.wxss) | 3 |
| [subpackages/other/album/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/album/index.wxss) | 3 |
| [subpackages/activity/detail.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/detail.wxss) | 3 |
| [subpackages/activity/list.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/list.wxss) | 2 |
| [subpackages/activity/register.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/register.wxss) | 2 |
| [subpackages/booking/confirm.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/confirm.wxss) | 3 |
| [subpackages/feeding/confirm-service.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/feeding/confirm-service.wxss) | 2 |
| [subpackages/mall/order-confirm.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall/order-confirm.wxss) | 2 |
| [subpackages/mall/product-list.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall/product-list.wxss) | 2 |
| [subpackages/other/address/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/address/index.wxss) | 2 |
| [subpackages/feeding/feeder-detail.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/feeding/feeder-detail.wxss) | 2 |
| [subpackages/booking/host-detail.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/host-detail.wxss) | 2 |
| [pages/home/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/pages/home/index.wxss) | 3（含 1 处 `filter: blur(16rpx)` 行 324） |
| [pages/group-detail/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/pages/group-detail/index.wxss) | 1 |
| [custom-tab-bar/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.wxss) | 2 |

### 非 blur 的 filter（需重点处理）

- [custom-tab-bar/index.wxss:129](file:///Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.wxss#L129) `filter: brightness(0) saturate(100%) invert(31%) sepia(14%)...` ❌不兼容
- [subpackages/coupon/my-coupons.wxss:207](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/coupon/my-coupons.wxss#L207) `filter: grayscale(0.6)` ⚠️有限支持
- [pages/home/index.wxss:324](file:///Users/yy/Documents/trae_projects/zuoyou/pages/home/index.wxss#L324) `filter: blur(16rpx)` ⚠️rpx 单位 blur

---

## 七、CSS 不兼容特性全量改造

### 1. `display:grid` → flex（14 处 / 14 文件）

```css
/* 改造前 */
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; }

/* 改造后 */
.grid-2 { display: flex; flex-wrap: wrap; }
.grid-2 > .item { width: calc(50% - 8rpx); margin-right: 16rpx; }
.grid-2 > .item:nth-child(2n) { margin-right: 0; }
```

涉及文件：
- [pages/service/index.wxss:281](file:///Users/yy/Documents/trae_projects/zuoyou/pages/service/index.wxss#L281)
- [pages/profile/index.wxss:573](file:///Users/yy/Documents/trae_projects/zuoyou/pages/profile/index.wxss#L573)
- [pages/messages/index.wxss:55](file:///Users/yy/Documents/trae_projects/zuoyou/pages/messages/index.wxss#L55)
- [subpackages/mall/product-list.wxss:204](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall/product-list.wxss#L204)
- [subpackages/activity/detail.wxss:188](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/detail.wxss#L188)
- [subpackages/other/album/index.wxss:275,352](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/album/index.wxss#L275)
- [subpackages/other/video-list/index.wxss:40](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/video-list/index.wxss#L40)
- [subpackages/activity/list.wxss:137](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/list.wxss#L137)
- [subpackages/feeding/service-detail.wxss:174,1289](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/feeding/service-detail.wxss#L174)
- [subpackages/partner/activity-create/index.wxss:141](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/activity-create/index.wxss#L141)
- [subpackages/partner/home/index.wxss:101](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/home/index.wxss#L101)
- [subpackages/partner/activity-detail/index.wxss:201](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/activity-detail/index.wxss#L201)

### 2. `::-webkit-scrollbar` / `::selection` 移除（8 处）

| 文件 | 行号 |
|---|---|
| [app.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/app.wxss) | 302, 307, 312, 318 |
| [subpackages/other/favorites/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/favorites/index.wxss) | 511, 515, 520 |
| [subpackages/booking/pet-select.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/pet-select.wxss) | 751 |

**改造**：直接删除，用 scroll-view 的 `show-scrollbar="{{false}}"` 属性替代。

### 3. `::before/::after` 伪元素验证（185 处 / 39 文件）

Skyline 支持伪元素但有限制：
- 必须设 `content` 属性
- 不支持伪元素上的 `position:fixed`
- 复杂 filter 在伪元素上不生效

**重点验证文件**（按次数排序）：

| 文件 | 次数 |
|---|---|
| [pages/profile/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/pages/profile/index.wxss) | 47（图标密集，最需验证） |
| [subpackages/feeding/service-detail.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/feeding/service-detail.wxss) | 16 |
| [subpackages/partner/home/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/home/index.wxss) | 8 |
| [subpackages/mall/group-detail/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall/group-detail/index.wxss) | 7 |
| [subpackages/partner/service-income/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/service-income/index.wxss) | 7 |
| [subpackages/feeding/confirm-service.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/feeding/confirm-service.wxss) | 6 |
| [pages/home/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/pages/home/index.wxss) | 5 |
| [subpackages/pet/common.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/common.wxss) | 5 |
| [custom-tab-bar/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.wxss) | 5 |
| [pages/service/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/pages/service/index.wxss) | 11 |

**分批验证策略**：
- 先验证 profile 页（47 处，最复杂）
- 不兼容的伪元素装饰改为真实 `<view>` 节点
- 图标类伪元素改为 `zy-icon` 组件

### 4. `navigationStyle:"custom"` 改造（1 页面）

[subpackages/profile/login/index.json:6](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/profile/login/index.json#L6) — Skyline 下自定义导航需用 `page-meta` 或 `root-portal`。

### 5. P3 低优先级项

| 项 | 文件 | 说明 |
|---|---|---|
| `onReachBottomDistance` | [subpackages/mall/product-list.json:7](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall/product-list.json#L7), [subpackages/activity/list.json:7](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/list.json#L7) | 迁移到 scroll-view `lower-threshold` |
| `video` 同层渲染 | [subpackages/booking/host-detail.wxml:56](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/host-detail.wxml#L56), [subpackages/other/album/index.wxml:52](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/album/index.wxml#L52), [subpackages/other/video-list/index.wxml:9](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/video-list/index.wxml#L9) | Skyline 下需实测 |
| `createSelectorQuery` | [subpackages/other/album/index.js:123](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/album/index.js#L123) | 加 `.in(this)` 上下文 |

---

## 八、分阶段实施计划

### 阶段 1：基础设施搭建（不切 renderer）

**任务清单**：
1. 改 [project.config.json](file:///Users/yy/Documents/trae_projects/zuoyou/project.config.json) → `compileWorklet: true`
2. 创建 `components/zy-popup/` 组件
3. 创建 `components/zy-action-sheet/` 组件
4. 创建 `components/zy-icon/` 组件
5. 创建 `components/zy-calendar/` 组件
6. 创建 `components/zy-loading/` 组件
7. 改造 [behaviors/listBehavior.js](file:///Users/yy/Documents/trae_projects/zuoyou/behaviors/listBehavior.js) 支持 scroll-view 事件
8. 改造 `custom-tab-bar`（root-portal + 图标资源切换）

**验证**：在 webview 模式下验证所有新组件功能正常。

### 阶段 2：Vant 组件全量替换

**任务清单**：
1. [subpackages/other/favorites](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/favorites/index.json) — van-icon → zy-icon
2. [subpackages/booking/confirm](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/confirm.json) — van-calendar → zy-calendar，van-loading → zy-loading
3. [subpackages/booking/pet-select](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/pet-select.json) — van-popup → zy-popup，van-calendar → zy-calendar
4. [subpackages/pet/create-step1](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/create-step1.json) — 5 个 Vant 组件全替换
5. [subpackages/pet/update-profile](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/update-profile.json) — 同上
6. 从 [package.json](file:///Users/yy/Documents/trae_projects/zuoyou/package.json) 移除 `@vant/weapp` 依赖

**验证**：webview 模式下 5 个页面功能 100% 等价。

### 阶段 3：position:fixed/sticky 全量改造

**任务清单**：
1. 遮罩类（5 处）→ `root-portal`
2. 底部固定栏（18+ 处）→ scroll-view 同级布局
3. 悬浮按钮 FAB（6+ 处）→ `root-portal`
4. sticky 顶栏（8+ 处）→ scroll-view 内 `sticky` + `worklet` 驱动
5. custom-tab-bar splash → `root-portal`

### 阶段 4：滚动 API 全量迁移

**任务清单**：
1. 21+ 页面包裹 scroll-view（统一模板）
2. 11+ 页面 `onReachBottom` → `bindscrolltolower`
3. 21+ 页面 `onPullDownRefresh` → `refresher-enabled`
4. 3 页面 `onPageScroll` → `bindscroll`
5. 2 页面 `onReachBottomDistance` → `lower-threshold`

### 阶段 5：CSS 兼容性改造

**任务清单**：
1. 59 处 `backdrop-filter` rpx → px
2. 14 处 `display:grid` → flex
3. 8 处 `::-webkit-scrollbar` / `::selection` 移除
4. 1 处 `navigationStyle:"custom"` → `page-meta`
5. 185 处 `::before/::after` 逐一验证

### 阶段 6：全局开启 Skyline + worklet 动效设计

**任务清单**：
1. [app.json](file:///Users/yy/Documents/trae_projects/zuoyou/app.json) 改 `renderer: "skyline"` + `componentFramework: "glass-easel"`
2. 全量回归测试（真机 iOS + Android）
3. 3 处 `video` 同层渲染验证
4. `createSelectorQuery` 加 `.in(this)`
5. 基于 worklet 设计华丽动效（按压/拖拽/弹性/共享元素过渡）

---

## 九、风险评估与回滚策略

### 高风险点

| 风险点 | 影响范围 | 应对 |
|---|---|---|
| `zy-calendar` 实现复杂度 | 2 页面 | 可临时用原生 `<picker mode="date">` 降级 |
| 185 处伪元素验证工作量 | 39 文件 | 分批验证，不兼容的改为真实节点 |
| video 同层渲染 | 3 处 | 真机优先验证，必要时改用 `cover-view` |
| Android 低端机 backdrop-filter | 全局 | 已有 `@supports` 兜底 |

### 回滚策略

- 每阶段完成后单独 commit，便于回滚
- `app.json` 的 `renderer` 切换是"总开关"，可一键回退到 webview
- 保留 `behaviors/listBehavior.js` 旧版本备份，支持双模式兼容

### position:fixed/sticky 详细清单（65 处）

#### position:fixed（约 50 处）

| 场景 | 文件 | 行号 |
|---|---|---|
| 启动屏遮罩 | [custom-tab-bar/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.wxss) | 17 |
| 自定义 tabBar 容器 | [custom-tab-bar/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.wxss) | 46 |
| 登录提示遮罩 | [components/login-prompt/login-prompt.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/components/login-prompt/login-prompt.wxss) | 7 |
| 商品详情底部按钮栏 | [subpackages/mall/product-detail.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall/product-detail.wxss) | 230, 340, 357 |
| 订单确认底部栏 | [subpackages/mall/order-confirm.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall/order-confirm.wxss) | 434 |
| 购物车底部栏 | [subpackages/mall/cart.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall/cart.wxss) | 193 |
| 商城团购详情底部 | [subpackages/mall/group-detail/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall/group-detail/index.wxss) | 207, 328, 345 |
| 首页悬浮按钮 | [pages/home/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/pages/home/index.wxss) | 140 |
| 发现页悬浮 | [pages/discover/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/pages/discover/index.wxss) | 342 |
| 团购详情底部 | [pages/group-detail/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/pages/group-detail/index.wxss) | 188, 279, 296 |
| 我的页面悬浮 | [pages/profile/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/pages/profile/index.wxss) | 1140 |
| 推荐页底部栏 | [subpackages/profile/referral/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/profile/referral/index.wxss) | 85 |
| 订单详情底部 | [subpackages/profile/mall-order-detail/index.wxss:252](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/profile/mall-order-detail/index.wxss#L252), [subpackages/profile/order-detail/index.wxss:272](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/profile/order-detail/index.wxss#L272) | - |
| 寄养家庭详情底部 | [subpackages/booking/host-detail.wxss:5](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/host-detail.wxss#L5) | - |
| 确认服务底部栏 | [subpackages/feeding/confirm-service.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/feeding/confirm-service.wxss) | 314, 663, 781, 1070 |
| 活动支付底部 | [subpackages/activity/payment.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/payment.wxss) | 182, 199 |
| 优惠券悬浮 | [subpackages/coupon/my-coupons.wxss:8](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/coupon/my-coupons.wxss#L8) | - |
| 相册悬浮 | [subpackages/other/album/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/album/index.wxss) | 75, 259, 292 |
| 地址管理底部 | [subpackages/other/address/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/address/index.wxss) | 144, 180 |
| 宠物选择底部 | [subpackages/booking/pet-select.wxss:397](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/pet-select.wxss#L397) | - |
| 合伙人活动列表底部 | [subpackages/partner/activity-list/index.wxss:390](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/activity-list/index.wxss#L390) | - |
| 合伙人活动创建 | [subpackages/partner/activity-create/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/activity-create/index.wxss) | 241, 285 |
| 合伙人活动详情 | [subpackages/partner/activity-detail/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/activity-detail/index.wxss) | 228, 278 |
| 合伙人收入 | [subpackages/partner/income/index.wxss:281](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/income/index.wxss#L281) | - |
| 合伙人申请 | [subpackages/partner/application/index.wxss:94](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/application/index.wxss#L94) | - |
| 合伙人 i18n | [subpackages/partner/i18n-override/index.wxss:236](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/i18n-override/index.wxss#L236) | - |
| 活动详情底部 | [subpackages/activity/detail.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/detail.wxss) | 470, 549, 583 |
| 活动报名 | [subpackages/activity/register.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/register.wxss) | 17, 249 |
| 活动好友 | [subpackages/activity/friend.wxss:13](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/friend.wxss#L13) | - |
| 寄养家庭列表 | [subpackages/booking/host-list-all.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/host-list-all.wxss) | 504, 523 |
| 确认订单 | [subpackages/booking/confirm.wxss:305](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/confirm.wxss#L305) | - |

#### position:sticky（约 15 处）

| 文件 | 行号 | 上下文 |
|---|---|---|
| [pages/home/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/pages/home/index.wxss) | 39, 204 | 顶部栏 / 搜索栏 |
| [subpackages/mall/product-list.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall/product-list.wxss) | 24 | 分类侧栏 |
| [subpackages/feeding/service-detail.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/feeding/service-detail.wxss) | 12 | 服务详情顶部 |
| [subpackages/activity/list.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/list.wxss) | 71 | 活动列表分组 |
| [subpackages/partner/activity-list/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/partner/activity-list/index.wxss) | 5 | 合伙人活动列表 |
| [subpackages/booking/host-list-all.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/host-list-all.wxss) | 40, 122, 168, 545, 671 | 寄养家庭列表（多处 sticky） |
| [subpackages/search/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/search/index.wxss) | 14 | 搜索页 tab |

---

## 十、性能预期

完成全量 Skyline + worklet 后：

| 指标 | webview 现状 | Skyline + worklet 预期 |
|---|---|---|
| 动画帧率 | 30-45fps（setData 驱动） | **稳定 60fps** |
| 手势响应延迟 | 50-100ms（跨线程） | **<16ms**（UI 线程） |
| 列表滚动流畅度 | 中（页面级滚动） | **高**（scroll-view 原生） |
| 启动时间 | 基准 | **降低 15-25%** |
| 内存占用 | 基准 | **降低 10-20%** |

---

## 十一、完整文件清单

### 全局配置

- [/Users/yy/Documents/trae_projects/zuoyou/app.json](file:///Users/yy/Documents/trae_projects/zuoyou/app.json)
- [/Users/yy/Documents/trae_projects/zuoyou/project.config.json](file:///Users/yy/Documents/trae_projects/zuoyou/project.config.json)
- [/Users/yy/Documents/trae_projects/zuoyou/sitemap.json](file:///Users/yy/Documents/trae_projects/zuoyou/sitemap.json)
- [/Users/yy/Documents/trae_projects/zuoyou/app.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/app.wxss)
- [/Users/yy/Documents/trae_projects/zuoyou/app.js](file:///Users/yy/Documents/trae_projects/zuoyou/app.js)

### 核心抽象/组件

- [/Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.js](file:///Users/yy/Documents/trae_projects/zuoyou/custom-tab-bar/index.js)（+ .json/.wxml/.wxss）
- [/Users/yy/Documents/trae_projects/zuoyou/behaviors/listBehavior.js](file:///Users/yy/Documents/trae_projects/zuoyou/behaviors/listBehavior.js)
- [/Users/yy/Documents/trae_projects/zuoyou/components/login-prompt/login-prompt.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/components/login-prompt/login-prompt.wxss)
- [/Users/yy/Documents/trae_projects/zuoyou/components/activity-card/activity-card.json](file:///Users/yy/Documents/trae_projects/zuoyou/components/activity-card/activity-card.json)
- [/Users/yy/Documents/trae_projects/zuoyou/components/logistics-card/index.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/components/logistics-card/index.wxss)

### Skyline 友好参考页

- [/Users/yy/Documents/trae_projects/zuoyou/pages/discover/index.wxml](file:///Users/yy/Documents/trae_projects/zuoyou/pages/discover/index.wxml)（已用 scroll-view 完整事件链）
- [/Users/yy/Documents/trae_projects/zuoyou/styles/design-tokens.wxss](file:///Users/yy/Documents/trae_projects/zuoyou/styles/design-tokens.wxss)（已有 backdrop-filter @supports 兜底）

### Vant 密集页

- [/Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/create-step1.json](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/create-step1.json)
- [/Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/update-profile.json](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/update-profile.json)
- [/Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/pet-select.json](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/pet-select.json)
- [/Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/confirm.json](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/confirm.json)
- [/Users/yy/Documents/trae_projects/zuoyou/subpackages/other/favorites/index.json](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/favorites/index.json)

---

## 立即可执行的第一步

建议**今天就开始**的 3 个动作：

1. 改 [project.config.json](file:///Users/yy/Documents/trae_projects/zuoyou/project.config.json) 的 `compileWorklet: true`（零风险，仅启用编译能力）
2. 创建 `components/zy-popup/` 组件（最高复用率，后续多处依赖）
3. 改造 [behaviors/listBehavior.js](file:///Users/yy/Documents/trae_projects/zuoyou/behaviors/listBehavior.js) 支持 scroll-view 事件（一次改造，30+ 页面受益）

---

## 文档维护

- **最后更新**：2026-07-29
- **维护者**：AROORO 开发团队
- **更新原则**：每完成一个阶段，更新对应章节的状态和实际遇到的问题
