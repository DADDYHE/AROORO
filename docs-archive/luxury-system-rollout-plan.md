# 奢华视觉系统 · 全项目落地方案（AROORO / 左右）

> 目标：把已闭环的奢华系统（REV.6 = Anti-Slop PASS，21/25）从「预览 + 局部页面」推广到**全仓 62 路由 + 9 组件 + 全局 custom-tab-bar + 设计源文件**，保证**每个页面（含子包页、含三/四级深层页）正确且一致地应用**。
>
> 依据：2026-08-03 全仓色彩采用度审计 + token 层读盘。

---

## 0. 核心机制：多级页面为何能"自动正确应用"

微信小程序每个路由页都是独立的 `page` 根，全局 token 定义在 `app.wxss` 的 `page` 选择器上：

```css
/* app.wxss */
@import './styles/variables.wxss';
@import './styles/design-tokens.wxss';
@import './styles/theme-teal.wxss';
page {
  --zy-accent: #C9A24B;
  --zy-primary-700: #4F5E35;
  /* ... 全部 --zy-* / --* 品牌令牌 ... */
}
```

CSS 自定义属性是**继承属性**，会向下穿透到：
- 所有后代 DOM 元素；
- 所有嵌入组件，**包括 `styleIsolation: isolated` 的组件**（样式隔离只限制「选择器/规则」，不限制「继承值」——已实测 var() 在组件中生效）。

因此：**tabBar 一级页 → 子包二级页 → 详情三级页 → 深层四级页，全部自动拿到同一套全局 token**，无需逐页 import。

唯一的失败条件（方案必须消灭这三类）：
1. 某页用硬编码品牌色而非 `var()`；
2. 某页自行 `page { --x: ... }` 覆盖全局；
3. 设计源文件（`design-tokens.json`）与 wxss 不一致 → 再生成回滚。

→ 保证策略 = **全局层收口 + 零硬编码 + 真相源一致 + lint 守卫**，而不是逐页手写样式。

---

## 1. 现状体检（2026-08-03 全仓扫描）

### 1.1 Token 层（健康）
| 文件 | 角色 | 状态 |
|---|---|---|
| `app.wxss` | 注入顺序 variables→design-tokens→theme-teal→motion→loading→components | ✅ |
| `styles/variables.wxss` | 基础语义变量 | ✅ 金=`#C9A24B` |
| `styles/design-tokens.wxss` | `--zy-*` 令牌 + 纸纹 base64 | ✅ |
| `styles/theme-teal.wxss` | 事实生效层（最后覆盖） | ⚠️ `--text-gold` 已重映射深绿，但 4 个金 token 未收口（见 1.4③） |

### 1.2 页面采用度（62 路由）
- ✅ 已采用 token（≤2 行硬编码）：**37 个（59.7%）**
- 🟡 部分采用（token + 残留硬编码）：**18 个**
- 🔴 硬编码为主（大量硬编码/外来色）：**3 个**
- ⚪ 无 .wxss 文件（100% 依赖全局类）：**4 个**

### 1.3 组件（9 个有色）
- ✅ 达标（0 真硬编码）：`activity-card` `login-prompt` `logistics-card` `zy-action-sheet`
- 🟡 部分：`zy-calendar`(5) `zy-loading`(3) `zy-navbar`(2) `zy-popup`(3)
- 🔴 `custom-tab-bar`（0 token / 15 行硬编码，全局常驻，**P0**）

### 1.4 三颗炸弹 + 一处分裂
| 编号 | 问题 | 位置 | 危害 |
|---|---|---|---|
| ① | **真相源脱钩**：`design-tokens.json` 仍 `#B8893A` 野金 | `/design-tokens.json` L19/L40 | 任何「从 json 生成 wxss」会把野金灌回 |
| ② | **JS/WXML 野金 11 处** | `discover/index.js` L12/14/71、`coupon/coupon-utils.js` L2/4/8、`partner/withdrawal/index.js` L6、`partner/activity-detail/index.js` L6 + `.wxml` L97 | 经内联 style 注入视图 |
| ③ | **B′ 未在 token 层收口**：`--mall-primary`/`--warning-color`/`--accent-color`/`--lux-gold-*` 是金却作浅底文字（~51 处，45 处来自这 4 token） | 见 §4 批次 | 金在浅底违反 B′ |
| ④ | **体系分裂遗留**（外来色） | `booking/host-list-all`、`booking/host-detail`、`feeding/order-status` | `#ff6b35` 橙、`#1976D2/#2196F3` Material 蓝、旧 teal，视觉语言分裂 |

---

## 2. 落地方案（分阶段，约 6–8 人日）

### P0-A · 单一真相源同步（0.2d）
- 把 `design-tokens.json` 的 `#B8893A` → `#C9A24B`、`#D4A858` 等野金全清，与 `theme-teal.wxss` 对齐。
- 建立铁律：**wxss 是运行时真相，json 仅作文档；二者变更必须同步**，否则视为 regress。

### P0-B · B′ token 层收口（0.5d，投入产出比最高）
- 在 `theme-teal.wxss` 为「浅色表面」引入重映射：把金作**文字**的 token 在浅底语义下指向深绿/深金：
  - `--mall-primary`（白卡价格文字）→ `#1F3A1F`（或深金 `#9A7430`）
  - `--warning-color`（浅底状态文字）→ 同上
  - `--lux-gold-500/600` 作文字时 → 深绿；仅保留填充/描边语义用金
- **一次性消灭约 45/51 处违规**，剩 6 处散点手改。

### P0-C · custom-tab-bar token 化（0.5d）
- `custom-tab-bar/index.wxss` 15 行硬编码 → 全改 `var(--zy-tabbar-*)`（令牌已存在于 `design-tokens.wxss`）。
- 全局可见度最高，紧跟 P0-B。

### P1-A · 散点金文字 6 处 + JS/WXML 野金 11 处（0.8d）
- 6 处散点（见 §4 批次4）：`profile/referral`、`zy-calendar` L194、`activity-card` L118、`feeding/order-status` L142 等 → 改深绿/深金或转填充。
- 11 处 JS/WXML 野金 → 统一为 `#C9A24B` 或从 token 常量取色。

### P1-B · booking×2 + order-status 重写（2.5d，体系分裂）
- `booking/host-list-all.wxss`（708 行/40 处硬编码）、`host-detail.wxss`、`feeding/order-status.wxss` 逐行 token 化，清除 `#ff6b35`/`#1976D2`/`#2196F3`/旧 teal/灰阶外来色。
- 这是单文件最大工作量，也是唯一「视觉体系分裂」处。

### P2 · feeding 子包 4 页（先确认废弃，0~2d）
- `feeder-detail` / `groomer-list` / `groomer-detail` / `order-confirm` **无 .wxss**，等于从零新建。
- **先让产品确认是否仍在线**：若废弃 → 直接从 `app.json` 摘除，省 2 人日；若在用 → 按 token 体系新建 wxss。

### P3 · partner 子包 rgba 手写品牌色 → token（1d）
- `rgba(201,162,75,.10)`、`rgba(31,58,31,.08)` 等「把手写品牌色写成 rgba」占 partner 55 行硬编码——颜色对，只是没走 token；批量替换为 `--lux-*-wash` / `--zy-*` 系列，覆盖率 94.7%→99%+。

### 守卫 · `scripts/lint-tokens.js` 常态化（0.5d 接入 CI）
- 已存在该脚本；扩展校验范围：**hex + 十进制 rgba 三通道 + 注释文本 + JS/WXML/JSON**，命中野金家族（`#C9A96E/#B8893A/#D4A858`）即 fail。
- 提交前 hook 或 CI 卡口，防止回归（这正是上一轮「十进制野金漏检」的教训）。

---

## 3. 每页面落地核对表（按子包）

图例：✅ 已采用（零动作，随全局收口自动受益）｜🟡 部分（清残留硬编码）｜🔴 硬编码为主（重写）｜⚪ 无 wxss（新建/确认废弃）

### 主包（6）
| 页面 | 态 | 动作 |
|---|---|---|
| pages/home/index | 🟡 | 清 13 行硬编码（深绿渐变/`#fff` 文字→var） |
| pages/discover/index | ✅ | 仅核对（JS 野金见 P1-A②） |
| pages/service/index | ✅ | 核对 |
| pages/quick-register/index | ✅ | 核对（1 行硬编码） |
| pages/profile/index | ✅ | 核对（token 密度最高） |
| pages/group-detail/index | ✅ | 核对（二级页，主包内跳转） |

### subpackages/booking（4）
| 页面 | 态 | 动作 |
|---|---|---|
| pet-select | ✅ | 核对 |
| confirm | 🟡 | 清 3 行 rgba |
| host-list-all | 🔴 | **重写（P1-B）** |
| host-detail | 🔴 | **重写（P1-B，含 `#ff6b35` 橙价）** |

### subpackages/pet（4）✅ 全部已采用 → 核对
### subpackages/profile（11）✅ 全部已采用 → 核对（含 notification/list·detail、order-detail、mall-order-detail 等深层页）
### subpackages/activity（7）
| 页面 | 态 | 动作 |
|---|---|---|
| list / friend / map-view / my-registered | ✅ | 核对 |
| detail | 🟡 | 清 11 行 rgba 蒙层 |
| register | 🟡 | 清 8 行 |
| payment | 🟡 | 清 3 行 |
> 典型三级链：partner/home → activity-list → activity-detail（见下方深层页清单）

### subpackages/mall（4）
| 页面 | 态 | 动作 |
|---|---|---|
| product-list / product-detail / cart | ✅ | 核对（含商城金价，随 P0-B 自动收口） |
| order-confirm | 🟡 | 清 3 行 rgba |

### subpackages/feeding（7）
| 页面 | 态 | 动作 |
|---|---|---|
| service-detail | 🟡 | 清 9 行玻璃 rgba |
| confirm-service | 🟡 | 清 5 行 |
| order-status | 🔴 | **重写（P1-B，含 Material 蓝）** |
| feeder-detail / groomer-list / groomer-detail / order-confirm | ⚪ | **P2：确认废弃 or 新建 wxss** |

### subpackages/other（4）
| 页面 | 态 | 动作 |
|---|---|---|
| favorites / video-list / address | ✅ | 核对 |
| album | 🟡 | 清 3 行 rgba |

### subpackages/coupon（2）✅ 全部已采用（B′ 范本）→ 核对（JS 野金见 P1-A②）
### subpackages/partner（12）
| 页面 | 态 | 动作 |
|---|---|---|
| activity-create / activity-detail / income / application | ✅ | 核对 |
| home / activity-list / hosting-profile / feeding / service-income / referral / withdrawal / i18n-override | 🟡 | 清 rgba 手写品牌色（P3，含金作浅底文字，随 P0-B 收口） |

### subpackages/search（1）✅ 核对

---

## 4. 深层（三/四级）页面专项保证清单

这些页是用户经多级跳转到达的，必须显式覆盖（均为独立路由，自动继承全局 token，风险只在「硬编码/无 wxss」）：

| 层级链 | 深层页 | 风险点 | 归属阶段 |
|---|---|---|---|
| 主包：discover → group-detail | group-detail | 已基本 OK | 核对 |
| partner：home → activity-list → activity-detail | activity-detail（三级） | 🟡 11 行 rgba + JS 野金 | P1-A/P3 |
| partner：home → feeding → income | income（三级） | ✅ | 核对 |
| booking：pet-select → confirm → host-list-all → host-detail | host-detail（四级） | 🔴 外来橙价 | P1-B |
| feeding：service-detail → order-confirm → order-status | order-status（三级） | 🔴 Material 蓝 | P1-B |
| feeding：feeder-detail / groomer-* / order-confirm | 4 页 | ⚪ 无 wxss | P2 |
| mall：product-list → product-detail → order-confirm | order-confirm（三级） | 🟡 3 行 | 部分阶段 |
| profile：login → … → order-detail / mall-order-detail | 深层详情 | ✅ | 核对 |

**保证动作**：每完成一个阶段，抽 1 个三级页（建议 `partner/activity-detail`）和 1 个四级页（建议 `booking/host-detail` 改写后）做真机/模拟器渲染核对，确认 token 继承正确、无硬编码残留。

---

## 5. 验收标准

| 维度 | 达标线 |
|---|---|
| 野金清零 | wxss + JS + WXML + JSON + 注释文本，hex/十进制 ` #C9A96E/#B8893A/#D4A858 ` 全 = 0 |
| B′ 违规 | 金作浅底文字 = 0（靠 P0-B token 收口 + P1-A 散点） |
| token 覆盖率 | ≥ 99%（按声明数） |
| 多级一致 | 抽测三级/四级页渲染与一级页视觉一致 |
| 真相源 | `design-tokens.json` 与 `theme-teal.wxss` 金值一致 |
| 守卫 | `lint-tokens.js` 接入 CI，野金命中即 fail |

---

## 6. 风险与待拍板项

1. **`--warning-color` 语义（开放）**：金作警示色有语义价值。三选一——① 文字改深绿（守纪律失语义）② 另定 `--warning-text` 深琥珀仅用于文字 ③ 金仅留填充/描边、文字一律深绿。**待 DADDY 拍板**（影响 P0-B 的具体写法）。
2. **feeding 4 页是否废弃**：决定 P2 是 0 还是 2 人日。
3. **Skyline 自定义属性**：已实测继承有效；若后续切 WebView 渲染需复测（概率低）。

---

## 7. 执行顺序建议（最短关键路径）

```
P0-A(真相源) → P0-B(B′收口) → P0-C(tabBar) ─┐
                                            ├→ P1-A(散点+JS野金) → 阶段抽测三级页
                                            ├→ P1-B(booking×2+order-status)
                                            └→ P2(feeding 4页) → P3(partner rgba) → 守卫 CI
```
P0 三件套可并行启动；P0-B 一落地，37 个已采用页 + 全部商城金价立即自动合规，收益最快。
