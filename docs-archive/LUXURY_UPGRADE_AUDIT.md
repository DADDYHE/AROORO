# 奢侈品级升级状态审计报告

> 审计日期：2026-07-30
> 审计基准：`styles/theme-teal.wxss`（Haute-Luxury 设计哲学：深森林绿 + 香槟金 + 奶油米白 + 发丝描边 + 杂志排版 + 艺术留白）
> 审计范围：全站 67 个页面/组件 wxss 文件

## 总览

| 分级 | 数量 | 占比 |
|------|------|------|
| 已升级 | 50 | 75% |
| 部分升级 | 17 | 25% |
| 未升级 | 0 | 0% |

**结论：无完全未升级的页面。** 全站已具备奢侈品级骨架（`var(--hairline)` 发丝描边、`--pressed`/`.pressed` + `hover-class` 无 `:active`、`letter-spacing` 杂志字距、`var(--page-padding)` 艺术留白）。17 个"部分升级"页面存在 token 漏配、命名不规范或缺 Haute-Luxury 头注等局部缺口。

---

## 部分升级页面清单（17 个，按问题严重度分组）

### A 组｜残留硬编码 hex / rgba（优先修，违反 token 规范）

| # | 文件 | 关键问题 | 修复建议 |
|---|------|----------|----------|
| 1 | `subpackages/partner/common.wxss` | `#FFFFFF`×2、硬编码 overlay `rgba(26,26,23,0.5)`×2、硬编码 `24rpx` 圆角×2、硬编码阴影×2 | overlay→`var(--overlay-color)`；白→`var(--card-color)`；圆角→`var(--border-radius-2xl)`；阴影→`var(--shadow-md)` |
| 2 | `subpackages/feeding/service-detail.wxss` | CSS 手绘图标残留 `#D9BF92`/`#E8D5B0`/`#D4B888`/`#B89A66`/`#FFF` 及 rgba 15+ 处 | 图标色纳入 `--feeding-*` token 家族，或改用 SVG 图标资源 |
| 3 | `subpackages/activity/friend.wxss` | 性别色硬编码 `#6B9DAE`/`#C0788E` 各多处 | 新增 `--gender-male`/`--gender-female` token |
| 4 | `subpackages/activity/register.wxss` | rgba 硬编码 13+ 处、大圆角 `32rpx`、`.pressed` 非 `--pressed`、无 luxury 头注 | rgba→对应 tint token；圆角→`var(--border-radius-lg)`；统一 BEM 命名 |
| 5 | `subpackages/profile/order-detail/index.wxss` | 状态横幅渐变末端硬编码 `#4A6572`/`#2D5A33`/`#7A7568`×3 | →`var(--info-color)`/`var(--primary-deep)`/`var(--gray-600)` |
| 6 | `subpackages/mall/group-detail/index.wxss` | 遮罩 `rgba(26,26,23,0.5)`、底栏 `rgba(255,255,255,0.96)`、无衬线标题 | 遮罩→`var(--overlay-color)`；底栏→`var(--glass-bg-95)`；对齐 `pages/group-detail` 版实现 |

### B 组｜缺 Haute-Luxury 头注 + `.pressed` 非 `--pressed` BEM（命名/规范不统一）

| # | 文件 | 关键问题 | 修复建议 |
|---|------|----------|----------|
| 7 | `subpackages/activity/payment.wxss` | 旧"轻奢宠物"头注、`.pressed` 非 BEM、缺 `font-family` var、动效用 `--zy-ease-decelerate` 非 `--ease-silk` | 补 Haute-Luxury 头注；改 `--pressed` BEM；文字绑 `var(--font-sans)` |
| 8 | `subpackages/other/address/index.wxss` | 无 luxury 头注、`.pressed` 非 BEM、大圆角 `28rpx`、残留 rgba | 补头注；改 BEM；圆角→token |
| 9 | `subpackages/other/favorites/index.wxss` | 无 luxury 头注、`.pressed` 非 BEM、残留 rgba、缺 `font-family` var | 同上 |
| 10 | `subpackages/other/video-list/index.wxss` | 无 luxury 头注、`.pressed` 非 BEM、残留 rgba 3 处、排版弱（仅 1 处 letter-spacing） | 同上 |
| 11 | `subpackages/other/album/index.wxss` | 无 luxury 头注、`.pressed` 非 BEM、残留 rgba 6 处、缺 `font-family` var | 同上 |
| 12 | `subpackages/feeding/confirm-service.wxss` | 无 luxury 头注（仅 @import）、残留 `rgba(74,107,74,*)`×5、硬编码大圆角 `28rpx`×3 | 补头注；rgba→`--feeding-tint`；圆角→token |

### C 组｜深底/毛玻璃场景 rgba 半透明色残留（缺 rgba token）

| # | 文件 | 关键问题 | 修复建议 |
|---|------|----------|----------|
| 13 | `subpackages/coupon/my-coupons.wxss` | 深底券面 `rgba(201,169,110,*)`/`rgba(247,245,239,*)` 半透明色 15+ 处 | 新增 `--accent-text-on-dark`/`--cream-text-on-dark` 等 rgba token |
| 14 | `subpackages/coupon/claim-center.wxss` | 同上，残留 10+ 处 | 同上 |
| 15 | `subpackages/booking/host-list-all.wxss` | 毛玻璃/遮罩 `rgba(247,245,239,0.95)` 等 8 处、硬编码 `24rpx` 圆角 | 半透明底→玻璃 token；圆角→token |
| 16 | `subpackages/booking/host-detail.wxss` | rgba 半透明色 9 处 | 新增深底 rgba token 收敛 |

### D 组｜注释/命名弱（最轻）

| # | 文件 | 关键问题 | 修复建议 |
|---|------|----------|----------|
| 17 | `pages/quick-register/index.wxss` | 头注仅"轻奢"非 Haute-Luxury 结构化块、`.pressed` 非 `--pressed`、无衬线标题 | 补 Haute-Luxury Editorial 头注；改 `--pressed` BEM；标题引 `var(--font-serif)` |

---

## 已升级页面的共性残留（可选优化，不影响分级）

1. **无衬线标题普遍缺失**：多数已升级页面标题走 `var(--font-sans)`，未用 `theme-teal.wxss` 已定义的 `--font-serif`（Songti SC）。`pages/group-detail`、`mall/product-list`、`mall/product-detail` 已用衬线，可作为对标。
2. **香槟金半透明边无 token**：`rgba(201,169,110,0.30)` 等 pressed 边目前无对应 rgba token，可新增 `--accent-border-pressed`。
3. **底栏 `rgba(255,255,255,0.96)`**：`mall/order-confirm`、`mall/cart` 等底栏应统一为 `var(--glass-bg-95)`。
4. **home 页性别色** `#6B9DAE`/`#C0788E` 与 `friend.wxss` 同源问题，建议一并抽 token。

---

## 建议执行优先级

1. **P0（token 规范硬伤）**：partner/common、feeding/service-detail、activity/friend、profile/order-detail、mall/group-detail、activity/register
2. **P1（命名/头注统一）**：activity/payment、other/address、other/favorites、other/video-list、other/album、feeding/confirm-service、pages/quick-register
3. **P2（rgba token 体系补全）**：coupon/my-coupons、coupon/claim-center、booking/host-list-all、booking/host-detail —— 需先在 `theme-teal.wxss` 新增深底/玻璃 rgba token，再批量替换

## 审计方法说明

- 分 5 批并行读取 67 个 wxss 文件，逐文件核对 5 项标准：颜色 token 化、交互无 `:active`、杂志排版、发丝描边/克制圆角、Haute-Luxury 头注
- 全站 0 个 `:active {` 伪类规则（Skyline 兼容率 100%）
- 全站 0 个文件跌入"未升级"
