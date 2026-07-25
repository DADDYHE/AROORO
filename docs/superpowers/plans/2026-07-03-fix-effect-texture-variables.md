# 特效/质感变量规范化修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目中所有硬编码的特效/质感值替换为 CSS 变量，补全缺失变量定义，统一视觉质感系统。

**Architecture:** 在 `styles/variables.wxss` 中补全缺失的变量定义（`--shadow-soft`、`--text-shadow-*`），然后逐文件将硬编码的 `backdrop-filter`、`box-shadow`、`text-shadow`、`transition` 替换为对应变量引用。

**Tech Stack:** 微信小程序 WXSS CSS 变量系统

---

## 文件结构

### 修改文件清单

| 文件 | 职责 | 修改类型 |
|------|------|----------|
| `styles/variables.wxss` | 全局变量定义 | 新增缺失变量 |
| `custom-tab-bar/index.wxss` | 自定义 TabBar | backdrop-filter + transition 替换 |
| `pages/home/index.wxss` | 首页 | backdrop-filter 替换 |
| `subpackages/mall/product-detail.wxss` | 商品详情 | backdrop-filter 替换 |
| `subpackages/mall/order-confirm.wxss` | 订单确认 | backdrop-filter 替换 |
| `subpackages/other/album/index.wxss` | 相册 | backdrop-filter 替换 |
| `subpackages/activity/detail.wxss` | 活动详情 | backdrop-filter 替换 |
| `subpackages/booking/host-list-all.wxss` | 寄养列表 | backdrop-filter 替换 |
| `subpackages/booking/host-detail.wxss` | 寄养详情 | backdrop-filter 替换 |
| `subpackages/feeding/feeder-detail.wxss` | 喂食器详情 | backdrop-filter 替换 |
| `app.wxss` | 全局样式 | shadow-soft 已修复（变量补全后自动生效） |
| `subpackages/partner/service-income/index.wxss` | 服务收入 | shadow-soft 已修复（变量补全后自动生效） |

---

## Task 1: 补全缺失变量定义

**Files:**
- Modify: `styles/variables.wxss:196-218`（阴影区域后追加）

- [ ] **Step 1: 在 variables.wxss 中新增 `--shadow-soft` 变量**

在 `--shadow-vivid-quiet` 定义之后（约 L215 后），新增：

```css
  /* 柔浮阴影 — 通用卡片/列表项默认阴影（介于 xs 和 sm 之间） */
  --shadow-soft: 0 2rpx 8rpx rgba(74, 69, 67, 0.06), 0 4rpx 16rpx rgba(74, 69, 67, 0.04);
```

> **说明：** `--shadow-soft` 在 `app.wxss` 中被 `.card`、`.list`、`.shadow-soft` 等 4 处引用，但从未定义。其视觉定位是比 `--shadow-xs` 略强、比 `--shadow-sm` 略弱的通用柔浮阴影。

- [ ] **Step 2: 验证变量补全**

确认 `--shadow-soft` 已正确添加在阴影区块内，位于 `--shadow-vivid-quiet` 之后、`--shadow-emboss` 之前。

---

## Task 2: 修复 custom-tab-bar 硬编码

**Files:**
- Modify: `custom-tab-bar/index.wxss:14-15`（backdrop-filter）
- Modify: `custom-tab-bar/index.wxss:53`（transition）

- [ ] **Step 1: 替换 backdrop-filter 硬编码**

将 L14-15：
```css
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
```
替换为：
```css
  backdrop-filter: var(--glass-blur-2xl);
  -webkit-backdrop-filter: var(--glass-blur-2xl);
```

> **映射依据：** `blur(24px) saturate(200%)` 是最强模糊，custom-tab-bar 的 `blur(40px)` 超过所有定义级别，归入 `--glass-blur-2xl`（最强档）。

- [ ] **Step 2: 替换 transition 硬编码**

将 L53：
```css
  transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
```
替换为：
```css
  transition: transform var(--transition-smooth);
```

> **映射依据：** `0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)` 与 `--transition-smooth` 定义完全一致。

---

## Task 3: 修复首页 backdrop-filter 硬编码

**Files:**
- Modify: `pages/home/index.wxss:868-869`（backdrop-filter）

- [ ] **Step 1: 替换 .tuan-badge 中的 backdrop-filter**

将 L868-869：
```css
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
```
替换为：
```css
  backdrop-filter: var(--glass-blur-xl);
  -webkit-backdrop-filter: var(--glass-blur-xl);
```

> **映射依据：** `blur(20px) saturate(180%)` 与 `--glass-blur-xl: blur(20px) saturate(200%)` 最接近（模糊度完全一致，饱和度差异微小）。

---

## Task 4: 修复商城页面 backdrop-filter 硬编码

**Files:**
- Modify: `subpackages/mall/product-detail.wxss:298-299`
- Modify: `subpackages/mall/order-confirm.wxss:451-452`

- [ ] **Step 1: 替换 product-detail.wxss 底部操作栏 backdrop-filter**

将 L298-299：
```css
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
```
替换为：
```css
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
```

> **映射依据：** `blur(16px)` 与 `--glass-blur: blur(16px) saturate(180%)` 模糊度一致。

- [ ] **Step 2: 替换 order-confirm.wxss 底部操作栏 backdrop-filter**

将 L451-452：
```css
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
```
替换为：
```css
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
```

---

## Task 5: 修复其他页面 backdrop-filter 硬编码

**Files:**
- Modify: `subpackages/other/album/index.wxss:103`
- Modify: `subpackages/activity/detail.wxss:470`
- Modify: `subpackages/booking/host-list-all.wxss:71, 113`
- Modify: `subpackages/booking/host-detail.wxss:518`
- Modify: `subpackages/feeding/feeder-detail.wxss:182-183`

- [ ] **Step 1: 替换 album/index.wxss**

将 L103：
```css
  backdrop-filter: blur(5rpx);
```
替换为：
```css
  backdrop-filter: var(--glass-blur-rpx);
```

> **映射依据：** `blur(5rpx)` 与 `--glass-blur-rpx: blur(10rpx) saturate(180%)` 同属 rpx 模糊档位，归入最近级别。

- [ ] **Step 2: 替换 activity/detail.wxss**

将 L470：
```css
  backdrop-filter: blur(20rpx);
```
替换为：
```css
  backdrop-filter: var(--glass-blur-xl);
```

> **映射依据：** `blur(20rpx)` 与 `--glass-blur-xl: blur(20px) saturate(200%)` 模糊度一致（rpx vs px 在小程序中近似）。

- [ ] **Step 3: 替换 host-list-all.wxss 两处**

将 L71 和 L113：
```css
  backdrop-filter: blur(4px);
```
均替换为：
```css
  backdrop-filter: var(--glass-blur-sm);
```

> **映射依据：** `blur(4px)` 较轻，归入 `--glass-blur-sm: blur(10px) saturate(150%)`（最轻档）。

- [ ] **Step 4: 替换 host-detail.wxss**

将 L518：
```css
  backdrop-filter: blur(5rpx);
```
替换为：
```css
  backdrop-filter: var(--glass-blur-rpx);
```

- [ ] **Step 5: 替换 feeder-detail.wxss**

将 L182-183：
```css
  backdrop-filter: blur(20rpx);
  -webkit-backdrop-filter: blur(20rpx);
```
替换为：
```css
  backdrop-filter: var(--glass-blur-xl);
  -webkit-backdrop-filter: var(--glass-blur-xl);
```

---

## Task 6: 验证所有修改

- [ ] **Step 1: 全局搜索确认无遗漏**

执行以下搜索确认：
1. `backdrop-filter: blur(` — 业务 wxss 文件中应仅剩 `var(--glass-*)` 引用
2. `var(--shadow-soft)` — 变量已定义，不应有未定义警告
3. `transition:` 硬编码 — custom-tab-bar 中不应再有硬编码 cubic-bezier

- [ ] **Step 2: 微信开发者工具编译验证**

在微信开发者工具中编译项目，确认：
- 无 CSS 变量未定义警告
- 各页面毛玻璃效果视觉无异常
- TabBar 指示器动画正常

---

## 未纳入本次修复的项目（记录备查）

以下项目存在但暂不修复，原因如下：

### 硬编码 box-shadow（~35 处）
- **原因：** 多数为板块特定的彩色光晕（如 `rgba(139, 92, 246, 0.2)` 用于商城紫罗兰光晕），与已定义的 `--shadow-glow-*` 变量透明度不完全一致。这些是精细调优的视觉效果，强行统一可能影响视觉还原度。
- **建议：** 后续如需统一，应先与设计确认各板块光晕的透明度容差，再批量替换。

### 硬编码 text-shadow（24 处）
- **原因：** 设计系统中未定义 `--text-shadow-*` 变量体系，且 text-shadow 的使用场景多样（标题投影、白色高光、叠加层文字可读性等），需要新建变量体系。
- **建议：** 作为后续独立任务处理，先定义 `--text-shadow-sm/md/lg` 及 `--text-shadow-glow` 变量体系。

### 硬编码 background gradient（大量）
- **原因：** 渐变背景多为页面特定的装饰性效果（如 radial-gradient 光斑、linear-gradient 叠加层），不属于可标准化的质感变量范畴。
- **建议：** 保持现状，这些是设计意图而非工程规范问题。

### filter: blur() 在 @keyframes 中（2 处）
- **文件：** `pages/home/index.wxss:113, 118`
- **原因：** 这是入场动画中从模糊到清晰的过渡效果，属于动画关键帧逻辑，不适合用毛玻璃变量替换。
- **建议：** 保持现状。
