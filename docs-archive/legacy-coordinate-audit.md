# 旧坐标系残留分桶审计报告（Legacy Coordinate Audit）

> 生成工具：`scripts/lint-tokens.js`（二期守卫，Rule A 野金 BLOCK + Rule B 旧坐标系分桶 WARN）
> 覆盖范围：全仓 `.js/.wxml/.wxss/.json/.svg/.css/.vue`，排除 `node_modules / miniprogram_npm / .git / docs / docs-archive / scripts / dist`
> 校验维度：hex 六位 + 十进制 `rgb()/rgba()` 三通道，含注释文本，不跳过
> 扫描基准：`zuoyou/` 根目录；行号均来自本次实跑结果，已逐条与 `styles/theme-teal.wxss` 实测核对（非推测）

---

## 0. 结论先行（终检决策用 · 明确判断，不模棱两可）

**判定：应将新坐标（#1F3A1F 深森林绿系）直接沉入源文件 `variables.wxss` / `design-tokens.wxss` / `design-tokens.json`，而非长期依赖 `theme-teal.wxss` 的双层覆盖。**

理由见第 7 节。一句话版：双层覆盖只在「`app.wxss` 的 `@import` 顺序恰好是 variables→design-tokens→theme-teal（后者最后加载覆盖）」这个**未被任何测试守护的约定**下才成立，本质是悬在头顶的活雷；且 `variables.wxss` 自身仍写着 `--primary-color:#4F5E35`，对后来者是完全误导的"真相源"。桶①b 的 `--gradient-dark` 陷阱已证明单层覆盖会悄悄漏网。改源值可一劳永逸消除该脆弱性，并让 `design-tokens.json` 这个规格真相源与新体系一致。

---

## 1. 守卫设计：为什么旧坐标不能一刀切

AROORO 经历了「橄榄绿 PETLUX（旧）→ 深森林绿 Haute-Luxury（新，theme-teal）」迁移。残留的旧坐标系色值分两类性质，严重度完全不同：

| 桶 | 性质 | 位置 | 严重度 | `--strict` 下 |
|----|------|------|--------|--------------|
| **桶①** | 令牌定义层·**已被 theme-teal 覆盖** | styles 三件套的 `:自定义属性` 定义行 | 活雷，非泄漏（线上渲染正确） | 不阻断（INFO） |
| **桶①b** | 令牌定义层·**未被 theme-teal 覆盖** | 仅 `variables.wxss:90` | 真陷阱（旧色若被引用会真实渲染） | 不阻断（⚠ INFO，但单独标注） |
| **桶②a** | 真实泄漏·**运行时裸硬编码** | 页面/组件/JS/SVG 直接写旧色 | 最高（令牌层怎么改都不生效） | **阻断（exit 1）** |
| **桶②b** | 真实泄漏·**规格真相源** | `design-tokens.json` | 不渲染但误导后续实现 | **阻断（exit 1）** |
| **桶②c** | 真实泄漏·**var 兜底值** | `var(--x, #4F5E35)` | 二级雷（令牌缺失时暴露） | **阻断（exit 1）** |
| **桶③** | 跨产品面·**web-admin 独立 Vue 后台** | `web-admin/src/**` | 多为 echarts 调色板，需产品决策 | 不阻断（INFO，默认不算入 strict） |
| **规则 C** | 同名令牌**跨文件取值冲突**（治本：暴露桶①/桶②c 根因） | `styles/*.wxss` 同名 `--x` 不同值 | 活雷（运行时 theme-teal 最后声明故正确） | 不阻断（INFO）→ 去重见 #10 |
| **规则 D** | **兜底值 ≠ 令牌最终生效值**（治本：替代旧色黑名单） | `var(--x, FALLBACK)` | 二级雷（令牌缺失时暴露） | 计入 桶②，**阻断（exit 1）** |

**规则 A（BLOCK，一期成果勿动）**：野金 `#C9A96E / #B8893A / #D4A858`（含十进制 rgba 三通道、含注释）命中即 `exit 1`。本次扫描 **0 命中**，PASS。

**控制台用法**：
```bash
node scripts/lint-tokens.js            # CI 默认：仅规则 A 阻断
node scripts/lint-tokens.js --strict   # 收口：桶② 也阻断
node scripts/lint-tokens.js --json     # 机器可读 JSON（供报告生成/CI 解析）
```

---

## 2. 桶① · 令牌定义层·已被 theme-teal 覆盖（25 处，活雷非泄漏）

> 性质：位于 `variables.wxss` / `design-tokens.wxss` 的自定义属性定义行。`app.wxss` 的 `@import` 顺序保证 `theme-teal` 最后加载并覆盖，故**线上渲染正确**。
> 风险：一旦 `@import` 顺序被改动，整站瞬间回退橄榄绿 —— 这是桶①唯一的隐患，也是第 7 节建议改源值的根因。

下表每一行都经**实测核对**：左侧为旧坐标所在行，右侧为 `theme-teal.wxss` 中真正重定义该令牌的行号与值（`grep` 实跑，非推测）。

### 2.1 `styles/variables.wxss`（已覆盖）

| 旧坐标行 | 令牌 | 旧值 | theme-teal 覆盖行 | 新值（实测） |
|---------|------|------|------------------|------------|
| L6  | `--primary-color` | `#4F5E35` | L18 | `#1F3A1F` |
| L8  | `--secondary-color` | `#3A4626` | L24 | `#0F2410` |
| L86 | `--gradient-primary` | 含 `#4F5E35` 系 | L25 | `linear-gradient(180deg,#2D4F2D 0%,#0F2410 100%)` |
| L191–195 | `--shadow-glow-primary*` ×5 | `rgba(79,94,53,*)` | L220–224 | `rgba(31,58,31,*)` |
| L206 | `--activity-primary-mid` | `#2AB7A9` | L329 | `#3D6B3D` |

### 2.2 `styles/design-tokens.wxss`（已覆盖）

| 旧坐标行 | 令牌 | 旧值 | theme-teal 覆盖行 | 新值（实测） |
|---------|------|------|------------------|------------|
| L14 | `--zy-primary-900` | `#3A4626` | L79 | `#0F2410` |
| L15 | `--zy-primary-700` | `#4F5E35` | L80 | `#1F3A1F` |
| L19 | `--zy-primary-grad` | `#4F5E35→#3A4626` | L84 | `linear-gradient(180deg,#2D4F2D 0%,#0F2410 100%)` |
| L48 | `--zy-tabbar-border-top` | `rgba(79,94,53,0.06)` | L235 | `rgba(26,26,23,0.06)` |
| L50 | `--zy-tabbar-item-active` | `#4F5E35` | L236 | `#1F3A1F` |
| L52 | `--zy-tabbar-item-active-bg` | `rgba(79,94,53,0.08)` | L238 | `transparent` |
| L63 | `--zy-tabbar-center-grad` | `#4F5E35→#3A4626` | L247 | `linear-gradient(180deg,#2D4F2D 0%,#0F2410 100%)` |
| L65 | `--zy-tabbar-center-shadow` ×2 | `rgba(79,94,53,*)` | L249 | `rgba(31,58,31,*)` |

> 注：L19/L63 各含 2 个旧坐标（起止两停），L65 含 2 个 `rgba(79,94,53,*)`，故 桶① 合计 25 处（design-tokens 11 + variables 14）。全部命中 theme-teal 重定义行，覆盖关系已验证。

---

## 3. 桶①b · 未覆盖陷阱（1 处 —— 团队此前"桶①全被覆盖"的假设不成立）

> ⚠ **重点**：`--gradient-dark` 是令牌定义层里的旧坐标，但 `theme-teal.wxss` **没有**任何行重定义它 → 它不在覆盖链上。

| 旧坐标行 | 令牌 | 旧值 | theme-teal 覆盖 | 实测结论 |
|---------|------|------|----------------|---------|
| `variables.wxss:90` | `--gradient-dark` | `linear-gradient(135deg,#2A2823 0%,#3A4626 100%)` | **无**（`grep 'gradient-dark' theme-teal.wxss` 零命中） | 未覆盖真陷阱 |

- **消费者核查**：`grep -rn "gradient-dark" --include=*.wxss --include=*.wxml --include=*.js`（排除 node_modules/docs）仅命中其**自身定义行** `variables.wxss:90` → **零消费者，是死令牌**。
- **风险定级**：当前是"哑弹"（没人引用，不会渲染）。但它是活雷中的活雷——只要任何后续开发 `var(--gradient-dark)` 引用它，就会**静默渲染橄榄绿**，且守卫的桶① INFO 逻辑会误判它"安全"。
- **处置建议（不在此单执行，仅建议）**：二选一，必须做其一——(a) 在 `variables.wxss:90` 把源值改成新坐标 `#0F2410→#0F2410` 系（或干脆删除该死令牌）；(b) 在 `theme-teal.wxss` 补一行 `--gradient-dark: linear-gradient(135deg,#0F2410 0%,#0F2410 100%)` 覆盖。**守卫现已能自动识别此类"未覆盖"并将其单独踢入桶①b，默认假设不再可信。**

---

## 4. 桶② · 真实泄漏（49 处，最高优先级）

> 子形态（**规则 D 接管 ②c 后**）：②a 运行时裸硬编码 11 / ②b 规格真相源 0（design-tokens.json 已被 #2 同步，见 4.2）/ ②c var 兜底≠真值 38。`--strict` 下全部阻断。
> ②c 现由**规则 D** 检测（兜底值 ≠ 令牌最终生效值，按 `app.wxss` @import 顺序解析浅色模式真值），比原"旧坐标系 hex 黑名单"更严、且免维护黑名单。
> **计数演化（同一守卫，不同时点）**：初稿审计时 ②c 黑名单命中 92（partner 占绝大多数）；接入规则 D 后结构性命中 132（含 40 处"非旧色但已脱节"兜底，如 `#EAEDDF` vs `#ECE8DE`、hairline alpha `0.06` vs `0.08`）；**随后 prototype-builder-2 在 P0-B/P1-A/P3 中把 partner 的陈旧兜底与野色基本归正，当前 ②c 回落至 38（主要来自 `subpackages/profile/*` 与少量组件，partner 已清零）**。本单不修改这些文件，整改见任务 #6（partner 残余）与 profile 相关清理。

### 4.1 ②a 运行时裸硬编码（11 处 · 令牌层改不动它，必然错）

| 文件:行 | 旧坐标 | 建议语义令牌 / 新值 |
|--------|-------|------------------|
| `app.json:20` | `#4F5E35` | `tabBar.selectedColor` 不支持 CSS 变量，硬编码为新主色 **`#1F3A1F`** |
| `components/zy-calendar/index.js:109` | `#4F5E35` | JS 中硬编码，改为新主色 **`#1F3A1F`**（或抽取为 JS 常量对齐 `--primary-color`） |
| `components/zy-loading/index.js:52` | `#4F5E35` | 同上，改为 **`#1F3A1F`** |
| `custom-tab-bar/index.js:7` | `#4F5E35` | `selectedColor`，改为 **`#1F3A1F`** |
| `images/icons/shield-line.svg:1` | `#4ECDC4` | teal 图标描边，重绘为新品牌绿 **`#1F3A1F`**（或点缀金 `#C9A24B`，按图标语义定） |
| `images/icons/ticket-line.svg:1` | `#4ECDC4` | 同上，重绘为 **`#1F3A1F`** |
| `images/icons/zap-line.svg:1` | `#4ECDC4` | 同上，重绘为 **`#1F3A1F`** |
| `pages/home/index.wxml:70` | `#4F5E35` | inline style，改为 **`var(--primary-color)`**（全局已注入） |
| `subpackages/booking/pet-select.wxml:197` | `#4F5E35` | inline style，改为 **`var(--primary-color)`** |
| `subpackages/partner/activity-detail/index.js:5` | `#4F5E35` | 改为 **`#1F3A1F`** |
| `subpackages/partner/activity-detail/index.wxml:97` | `#4F5E35` | inline style，改为 **`var(--primary-color)`** |

### 4.2 ②b 规格真相源 `design-tokens.json`（0 行 · 已被 #2 同步）

> **状态更新**：审计初稿（#9 首轮）时 `design-tokens.json` 仍是半迁移状态（primary 绿 family 停留旧橄榄 `#3A4626/#4F5E35`，共 9 行命中）。**任务 #2（design-tokens.json 真相源同步）已将其同步为新森林绿系**，现守卫实跑 `spec = 0` 行。
> 守卫对 design-tokens.json 的回归检测仍有效：实测注入 `"900": "#3A4626"` 可被规则 B 桶②b 捕获（spec 命中），确认机制未失效，仅当前无残留。
> 以下为初稿记录的"目标态"对照，供 #2 验收留档（当前文件已为此值）：

| 文件:行 | 旧值（初稿时） | 已同步为目标新值 |
|--------|------------|---------|
| `design-tokens.json:11` `primary.900` | `#3A4626` | `#0F2410` ✓ |
| `design-tokens.json:12` `primary.700` | `#4F5E35` | `#1F3A1F` ✓ |
| `design-tokens.json:16` `primary.gradient` | `#4F5E35→#3A4626` | `linear-gradient(160deg,#1F3A1F 0%,#0F2410 100%)` ✓ |
| `design-tokens.json:52` `tabBar.borderTop` | `rgba(79,94,53,0.08)` | `rgba(31,58,31,0.08)` ✓ |
| `design-tokens.json:53` `tabBar.itemActive` | `#4F5E35` | `#1F3A1F` ✓ |
| `design-tokens.json:55` `tabBar.itemActiveBg` | `rgba(79,94,53,0.08)` | `rgba(31,58,31,0.08)` ✓ |
| `design-tokens.json:66` `tabBar.center.gradient` | `#4F5E35→#3A4626` | `linear-gradient(160deg,#1F3A1F 0%,#0F2410 100%)` ✓ |
| `design-tokens.json:68` `tabBar.center.shadow` | `rgba(79,94,53,*)` | `rgba(31,58,31,*)` ✓ |
| `design-tokens.json:97` `shadow.fab` | `rgba(79,94,53,*)` | `rgba(31,58,31,*)` ✓ |

| 文件:行 | 旧值（当前） | 建议新值 |
|--------|------------|---------|
| `design-tokens.json:11` `primary.900` | `#3A4626` | `#0F2410` |
| `design-tokens.json:12` `primary.700` | `#4F5E35` | `#1F3A1F` |
| `design-tokens.json:16` `primary.gradient` | `#4F5E35→#3A4626` | `linear-gradient(160deg,#1F3A1F 0%,#0F2410 100%)` |
| `design-tokens.json:52` `tabBar.borderTop` | `rgba(79,94,53,0.08)` | `rgba(31,58,31,0.08)` |
| `design-tokens.json:53` `tabBar.itemActive` | `#4F5E35` | `#1F3A1F` |
| `design-tokens.json:55` `tabBar.itemActiveBg` | `rgba(79,94,53,0.08)` | `rgba(31,58,31,0.08)` |
| `design-tokens.json:66` `tabBar.center.gradient` | `#4F5E35→#3A4626` | `linear-gradient(160deg,#1F3A1F 0%,#0F2410 100%)` |
| `design-tokens.json:68` `tabBar.center.shadow` | `rgba(79,94,53,*)` | `rgba(31,58,31,*)` |
| `design-tokens.json:97` `shadow.fab` | `rgba(79,94,53,*)` | `rgba(31,58,31,*)` |

### 4.3 ②c var 兜底 `var(--x, FALLBACK)` 兜底≠真值（38 处 · 规则 D · 令牌在时不生效，二级雷）

> 规则 D 实测比对：兜底色 ≠ 令牌浅色模式最终生效值即命中。当前 38 处主要来自 `subpackages/profile/*` 与少量组件（`zy-popup` / `zy-loading` / `loading-animation` / `zy-calendar`）；**partner 子包经 prototype-builder-2 归正后已清零**（仅余 `var(--warning-color, #C9A24B)` 这类兜底=真值的合法写法，不报）。
> 建议：确认令牌全局已定义后**直接删除兜底**（最彻底），或把兜底值改成与令牌真值一致。

| 文件 | 兜底出现次数 |
|------|------------|
| `components/zy-popup/index.wxss` | 5 |
| `subpackages/profile/order-detail/index.wxss` | 5 |
| `subpackages/profile/order-stats/index.wxss` | 5 |
| `components/zy-loading/index.wxss` | 4 |
| `styles/loading-animation.wxss` | 3 |
| `subpackages/profile/about/about.wxss` | 3 |
| `components/zy-calendar/index.wxss` | 2 |
| `subpackages/profile/agreement/agreement.wxss` | 2 |
| `subpackages/profile/login/index.wxss` | 2 |
| `subpackages/profile/notification/detail.wxss` | 2 |
| `subpackages/profile/notification/list.wxss` | 2 |
| `subpackages/profile/privacy/privacy.wxss` | 2 |
| `subpackages/profile/mall-order-detail/index.wxss` | 1 |
| **合计** | **38** |

---

## 5. 桶③ · 跨产品面 web-admin（15 处，独立 Vue 后台，默认不阻断）

> 性质：`web-admin/` 是独立 Vue 应用（Element Plus + echarts），非 AROORO 小程序。其 `#4ECDC4`（teal 旧品牌青）多为 echarts 图表调色板。
> 建议：**是否纳入奢华体系需产品决策**，本守卫默认单列 INFO 且不计入 `--strict` 阻断。如决定纳入，再开一条独立规则。

命中文件：`NotFound.vue` / `coupon/StatsView.vue` / `dashboard/DashboardView.vue` / `order/OrderStatsView.vue`（详见守卫输出，共 15 处）。

---

## 6. 守卫运行结果（本单交付物，两次实跑）

### 非严格模式 `node scripts/lint-tokens.js`
```
[lint-tokens] 规则A PASS: 野金残留 = 0（hex + 十进制 rgba 三通道，含注释文本）
[lint-tokens] 规则B 汇总: 桶①令牌层·已覆盖 25 / 桶①b·未覆盖 1 / 桶②泄漏 49 / 桶③跨产品 15
[lint-tokens] 规则C 汇总: 同名令牌跨文件冲突 173（其中 variables↔theme-teal 108）→ 去重见任务 #10
[lint-tokens] PASS
=== EXIT CODE: 0 ===
```

### 严格模式 `node scripts/lint-tokens.js --strict`
```
[lint-tokens] 规则A PASS: 野金残留 = 0（hex + 十进制 rgba 三通道，含注释文本）
[lint-tokens] 规则B 汇总: 桶①令牌层·已覆盖 25 / 桶①b·未覆盖 1 / 桶②泄漏 49 / 桶③跨产品 15
[lint-tokens] 规则C 汇总: 同名令牌跨文件冲突 173（其中 variables↔theme-teal 108）→ 去重见任务 #10
[lint-tokens] STRICT FAIL: 桶② 旧坐标泄漏 49 处未清零
=== EXIT CODE: 1 ===
```

> 规则 A 在两种模式下均 PASS（野金零残留，一期成果稳固）。`--strict` 仅因桶② 49 处泄漏未清零而 FAIL，符合设计（其中 38 为规则 D 兜底≠真值、11 为运行时裸码）。
> `custom-tab-bar/index.wxss` 的 `--tb-*` 本地令牌定义（L59–68）经守卫白名单校验，**未误报**（本地令牌声明合法）。

---

## 7. 拆雷决策结论（终检用 · 明确技术意见）

### 问题
要彻底拆雷，是该**把 `variables.wxss` / `design-tokens.wxss` / `design-tokens.json` 的源值直接改成新坐标（#1F3A1F 系）**，还是**保留 `theme-teal.wxss` 双层覆盖结构**？

### 判定：**改源值，沉入源头；保留 theme-teal 仅作过渡期冗余（或直接弃用）。**

### 理由（按权重）

1. **双层覆盖是悬在头顶的活雷，且不可见。**
   覆盖成立的唯一前提是 `app.wxss` 的 `@import` 顺序 `variables → design-tokens → theme-teal` 恰好让 theme-teal 最后加载。**全仓没有任何测试守护这个顺序**——任一次重构、打包器变更、或新人误改 `@import`，整站会在无报错前提下静默回退橄榄绿。桶① 报告里的 25 处"已覆盖"全部建立在这个脆弱约定上。

2. **源文件本身是误导性的"真相源"。**
   `variables.wxss:6` 现在写着 `--primary-color:#4F5E35`。任何后来者读源文件都会认为品牌主色是橄榄绿；真实生效的 `#1F3A1F` 藏在最后一个 `@import` 里，对普通阅读不可见。`design-tokens.json` 更是外部实现的唯一规格真相源，它仍写旧橄榄（accent 已同步而 primary 未同步）→ 半迁移状态必然持续误导后续页面。

3. **桶①b 已证明单层覆盖会漏网。**
   `--gradient-dark`（`variables.wxss:90`）从未被 theme-teal 重定义，且零消费者，是"哑弹型活雷"。只要改源值（或删死令牌），它立即消失；靠补一行 theme-teal 覆盖则是打补丁式治理，治标不治本。

4. **改源值的副作用可控、可逆。**
   theme-teal 已携带全部新值，将源文件改为新坐标后，theme-teal 从"load-bearing 覆盖层"降级为"无害冗余"——要么保留（零风险），要么在后续清理中移除。没有任何视觉回退风险，因为新值本就是线上已生效的值。

5. **`--strict` 守卫提供收口护栏。**
   改完源值后，遗留的 桶② 泄漏（当前 11 裸码 + 38 兜底≠真值 + 0 规格源）仍由 `--strict` 在 CI 拦截，强制趋势归零，杜绝新增。改源值解决"真相源误导 + 覆盖脆弱性"，`--strict` 解决"散落泄漏"，两者正交，必须配合。规则 C 的 173 处同名冲突则作为 #10 去重的量化目标——#10 收口后规则 C 应收敛为 0。

### 不建议"仅保留双层覆盖"的反方论点（为什么不够）
- 反方："覆盖模式已验证可用，改动少"。但"已验证可用"只因为脆弱约定恰好未被破坏；它不是工程保证，是运气。且它无法修复 `design-tokens.json` 的误导，也无法消除桶①b 类漏网。

### 落地顺序建议（非本单执行，供排期）
1. **改 `design-tokens.json`**（初稿时 ②b 9 行旧橄榄，已被任务 #2 同步完毕 → 当前 spec=0，本条可勾掉）→ 让规格真相源与新体系一致（最高优先，影响所有后续实现）。
2. **改 `variables.wxss`**（桶① 14 处 + 桶①b 删/改 `--gradient-dark`）与 `design-tokens.wxss`（桶① 11 处）→ 源值沉底。这同时会消解规则 C 的 173 处冲突中的 variables↔theme-teal 部分（108 处）。
3. **保留 `theme-teal.wxss`** 作为过渡冗余（勿删，避免回退），待全量稳定后可评审移除。
4. **②a / ②c 散落泄漏**交由对应任务（#6 等）按第 4 节建议令牌清零，并接入 `--strict` CI 门禁。

---

## 8. 守卫增强补遗：规则 C/D（回应 prototype-builder-2 根因分析）

> 本段记录守卫在 #9 基础上的二次增强，直接采用 prototype-builder-2 在 P0-B/P1-A/P3 扫出的根因建议。

### 8.1 规则 C · 同名令牌跨文件取值冲突 = 173 处（治本，暴露桶①/桶②c 根因）
- 机制：按 `app.wxss` @import 顺序（`variables → design-tokens → theme-teal → motion → loading-animation → components`）构建令牌真值索引，同名不同值即冲突，并标注"最终生效 = 最后声明者"。
- 计数 **173**（其中 `variables.wxss ↔ theme-teal.wxss` 同名不同值 **108**）。
- **对团队"180 冲突"主张的修正**：初算为 180，但其中包含 `theme-teal.wxss` 内 `.theme-dark { }` 暗色模式的 7 处重定义（如 `--primary-color: #3D6B3D`）——它们是**有意的浅/暗双值**，并非"旧坐标系残留"。规则 C 已正确跳过暗色块（按选择器含 `dark` 识别），故准确浅色模式冲突数 = **173**。不要把 7 处暗色覆盖误算进去。
- 布局/字形级冲突（非纯色，@import 顺序一旦变动会瞬间错位）共 15 处，含 `--border-radius-lg`/`--border-radius-md`/`--font-stack` 等，优先级最高，去重时先处理。
- 整改全部归属 **任务 #10**（令牌真相源去重）；#10 收口后规则 C 应收敛为 0。

### 8.2 规则 D · 兜底值 ≠ 令牌真值一致性 = 38 处（替代旧色黑名单，更严且免维护）
- 机制：`var(--x, FALLBACK)` 中的 FALLBACK 若 ≠ `--x` 的**浅色模式**最终生效值（按 @import 顺序解析，跳过 `.theme-dark`），即判陈旧兜底。
- 比原"旧坐标系 hex 黑名单"更严：不依赖维护黑名单，任何"兜底写错/没跟上真值"都命中（含非橄榄的旧值）。
- 实施中两个关键坑已规避：
  1. **暗色模式**：`theme-teal.wxss` 用 `.theme-dark { }` 类（非 `@media`）重定义令牌，若取"最后声明"会得到暗色值，导致 `var(--card-color,#FFFFFF)` 被误判为陈旧（vs 暗色 `#1E1F1B`）。已改为只取浅色模式值，误报消除。
  2. **hex 简写**：`#fff` 与 `#FFFFFF` 视为一致（3 位展开 6 位），避免 shorthand 误判。
- `custom-tab-bar` 的 `--tb-*` 本地令牌不在全局索引中，其兜底不会被规则 D 误伤（白名单逻辑复用）。

### 8.3 误报源排查（prototype-builder-2 提醒）
- **`web-admin/dist/assets/*.js` 的 `#2196F3`**：守卫的 `EXCLUDE_DIRS` 已含 `dist`（构建产物，非运行时），`web-admin/dist` 整个目录被跳过，不会误报；且 `#2196F3` 本就不在野金/旧坐标任一黑名单中。无需额外处理。
- **BSD grep `\w` 坑**：本守卫为 Node 实现，正则用 `[A-Za-z0-9_-]`（非 `\w` 依赖），无 BSD grep 兼容性问题；shell 侧若另写检测脚本需注意（队友提示的 `--include='*.wxss'` 引号在 zsh 下必加）。

### 8.4 CI 管道输出截断修复（接入流水线前的必修项）

自查时发现的守卫自身缺陷，已修复：

| 项 | 修复前 | 修复后 |
|---|---|---|
| `node scripts/lint-tokens.js --strict > log.txt` | 175 行完整 | 175 行完整 |
| `node scripts/lint-tokens.js --strict \| tee log.txt` | **仅 1 行**（只剩 `STRICT FAIL`，正文全丢） | 175 行完整 |
| `... \| head -3` | 可能抛 EPIPE | 静默正常退出 |

- **成因**：Node 在 stdout 为「管道」时写入是异步的，脚本末尾 `process.exit(1)` 会直接掐断未 flush 的缓冲区。守卫最需要日志的场景恰恰是 **失败退出（exit 1）** 那一次 —— 而 GitHub Actions / `tee` / `| grep` 采集日志走的正是管道，等于「一失败就没有正文，只剩一行结论」。
- **修复**：输出改为全缓冲 + `process.on('exit')` 钩子内 `fs.writeSync(1, ...)` 同步落盘；`EAGAIN` 重试、`EPIPE` 静默；stderr 写入前先 flush stdout，保证终端里「正文在前、FAIL 在后」的阅读顺序。
- **回归**：四种模式退出码复核 —— 非严格 0 / 严格 1 / `--json` 0 / `--json --strict` 1；注入 `#C9A96E` 后规则 A 在管道下仍完整打印正文 + FAIL 明细并 exit 1，还原后复跑 PASS。

### 8.5 当前守卫实跑结论（终检口径）
- 规则 A（野金）PASS = 0 残留。
- 规则 B：桶① 已覆盖 25 / 桶①b 未覆盖 1 / 桶② 49（11 裸码 + 38 兜底≠真值 + 0 规格源）/ 桶③ 15。
- 规则 C：同名冲突 173（→ #10）。
- 非严格 PASS（exit 0）；严格 STRICT FAIL（exit 1，因桶② 49 未清零）。
- 管道安全：`| tee` / `| head` / CI 日志采集下输出不再截断，可直接接流水线。

---

## 9. 任务 #10 · 令牌真相源去重（删行方案）执行记录

> 方案变更说明：#10 初裁为「改值下沉」，后经 team-lead 复核推翻——`custom-tab-bar/index.wxss:16`
> 直接 `@import '../styles/theme-teal.wxss'`，引的是 theme-teal 本身而非 variables，
> 故删除 variables/design-tokens 中的重名声明对 tabBar 零影响。改判为**删行**。

### 9.1 删除判据（严格执行，无自由发挥）

| 情形 | 处置 |
|---|---|
| `variables`/`design-tokens` 中的声明，theme-teal 的 `page{}` 也有同名定义 | **删**（不论值是否相同——同名同值也是冗余） |
| `variables`/`design-tokens` 独有令牌（theme-teal 无同名） | **保留，一个都不删** |
| `.theme-dark{}` 暗色分支（7 个） | 不参与比对 |
| 独有令牌但取值为旧坐标（如 `--gradient-dark`） | 不删，走**改值** |

判据由程序判定，非人工目测：`scripts/verify-token-cascade.js --plan` 输出删除计划，
再由脚本按行号执行，杜绝误删。

### 9.2 执行结果

```
styles/variables.wxss      291 行 → 108 行   （删 157 行重名声明）
styles/design-tokens.wxss  182 行 →  83 行   （删  79 行重名声明）
                                    git diff：155 insertions(+), 341 deletions(-)
保留独有令牌 75 个 · 误删独有令牌 0 个 · 暗色行拦截 0
```

两个源文件顶部均已加防复发注释：**本文件不得声明 theme-teal.wxss 已有的令牌，
theme-teal 为唯一运行时生效层；新增令牌请直接加到 theme-teal。**

`design-tokens.wxss` 中原 L155–170 那段被注释掉的「兼容重映射」块一并移除——它既是死代码，
又是守卫解析器的污染源（朴素行正则会把它算成 11 处伪冲突）。

### 9.3 桶①b 唯一命中项 `--gradient-dark` 的改值

theme-teal 无同名定义 → 属独有令牌 → 不可删，按裁定改值：

```diff
- --gradient-dark: linear-gradient(135deg, <旧墨黑> 0%, <旧深橄榄> 100%);
+ --gradient-dark: linear-gradient(135deg, var(--ink-black) 0%, var(--primary-deep) 100%);
```

改用 `var()` 引用而非写死新色号：从结构上杜绝二次漂移，theme-teal 改锚点时它自动跟随。

> 注：改值注释中**刻意不复述旧色号字面量**。守卫的旧坐标扫描含注释文本，
> 一旦在注释里复述旧 hex，桶② 裸码数会从 11 被顶到 12（曾实际出现过这个伪计数）。

### 9.4 布局/字形冲突：删 variables 那份，留 theme-teal 那份

已获授权无需二次确认，此处按要求列出删除行与保留值：

| 令牌 | 删除行（variables.wxss） | 保留生效值（theme-teal.wxss） |
|---|---|---|
| `--border-radius-lg` | `--border-radius-lg: 32rpx;` | L201 `16rpx` /* 8px — 卡片默认 */ |
| `--font-stack` | `-apple-system, …, "Microsoft YaHei", sans-serif` | L146 `-apple-system, …, "Songti SC", "STSong", "Microsoft YaHei", serif` |

因 theme-teal 在 `@import` 链中位于 variables 之后、后声明覆盖先声明，
**删除前 theme-teal 的值本就已经生效**，故删行后运行时行为完全不变，无视觉回归风险。

### 9.5 验收三件套

**① `verify-token-cascade.js` 逐键对照（路径 A 全链 vs 路径 B 仅 theme-teal）**

```
路径 A: variables → design-tokens → theme-teal → motion → loading-animation → components
路径 B: theme-teal
令牌数: A=378  B=294

① 两条路径「同名不同值」   = 0 处   ✅ 凡两路径都有的键，最终生效值完全一致
② 路径 B 缺键              = 84 处  结构性差异，非本次去重引入
                                     （variables ×34 / design-tokens ×27 / motion ×23）
③ custom-tab-bar 断链体检  引用 7 个外部令牌，0 个无定义   ✅
④ 去重方案核对             待删 0 / 待删暗色 0 / 保留独有 75 / 拦截 0
[cascade] PASS
```

**② 规则 C 归零**

```
[lint-tokens] 规则C 汇总: 同名令牌跨文件冲突 0（其中 variables↔theme-teal 0）
```

删行前为 182（variables↔theme-teal 108）。注：此前报的 173 是旧行正则的漏计，
换用真实 CSS 解析器（复用 `verify-token-cascade.js` 的 `parseWxss`）后校准为 182，
漏计来源是「一行多声明」（如 `--zy-fs-h1: 44rpx; --zy-fs-h1-w: 700;`）。

**③ 误删独有令牌数 = 0**

保留独有 75 / 删除独有 0，由 `buildPlan()` 程序判定并在 cascade 第 ④ 项复验。

### 9.6 custom-tab-bar 线上 bug 排查（只查不改）

tabBar 只 import theme-teal，故排查它是否消费了「variables/design-tokens 独有」的令牌：

```
custom-tab-bar 消费的外部令牌 7 个（不含自有 --tb-*）：
  --zy-bg / --zy-tabbar-border-top / --zy-accent / --zy-tabbar-item-inactive
  --zy-tabbar-item-active / --zy-tabbar-center-grad / --zy-text-on-primary
→ 7/7 均在 theme-teal 中有定义，断链 0。
```

**结论：不存在此类线上 bug。** 路径 B 结构性缺的那 84 个键，tabBar 一个都没消费到。
删行对 tabBar 的影响为零，删行前后该结论均成立。

#### 9.6b 顺带扫出的既有断链 3 处（**非 #10 引入，未修，单列**）

删行后做了一次全仓 `var()` 断链回归：204 个被引用令牌，194 个在路径 A 可解析，
7 个是组件局部自声明（合法），**3 个全仓无任何定义**：

| 令牌 | 引用处 | 判定 |
|---|---|---|
| `--lux-green-500` | `components/zy-loading/index.wxss:193`、`styles/loading-animation.wxss:115` | 全仓从未定义过 |
| `--status-bar-height` | `subpackages/booking/host-detail.wxss:14,18` | 全仓从未定义；也未在 wxml/js 中以内联 style 注入 |
| `--primary-100` | `subpackages/partner/common.wxss:264` | 仅存在于 `.design_library/mochi-pet/colors_and_type.css`（设计素材，未被 app 引入） |

**已用 `git show HEAD:` 逐一比对删行前的原文确认：这 3 个在 `variables.wxss`、
`design-tokens.wxss`、`theme-teal.wxss` 中删行前后都不存在**，属既有断链，
与 #10 无因果关系。按「查到了单独列给我，别自己顺手改」执行，本单未改动。

### 9.7 `design-tokens.json` 只读核对（已上报，未改动）

含色值规格条目 42 条，命中已知旧坐标色号 **0** 处。但发现 **5 条规格 vs 运行时漂移**，
且同源于一个系统性问题：

| 规格路径 | design-tokens.json | 运行时最终生效值 |
|---|---|---|
| `shadow.xs` | `0 2rpx 8rpx rgba(42,40,35,0.04)` | `--shadow-xs: none` |
| `shadow.sm` | `0 4rpx 16rpx rgba(42,40,35,0.06)` | `--shadow-sm: none` |
| `shadow.md` | `0 8rpx 24rpx rgba(42,40,35,0.08)` | `0 2rpx 12rpx rgba(26,26,23,0.04)` |
| `shadow.lg` | `0 16rpx 40rpx rgba(42,40,35,0.10)` | `0 8rpx 32rpx -8rpx rgba(26,26,23,0.08)` |
| `shadow.floatTabBar` | `0 -4rpx 32rpx rgba(42,40,35,0.10)` | `--zy-shadow-float-tabbar: 0 -2rpx 24rpx rgba(26,26,23,0.06)` |

**系统性根因**：这 5 条的阴影染色全是 `rgba(42,40,35)` = **`#2A2823`（旧墨黑）**；
运行时与 json 自己的 `neutral.text1`、`tabBar.borderTop` 都已是 `#1A1A17`（新墨黑）。
即 json 内部自相矛盾——文字色迁移了，阴影染色没跟着迁。

**守卫覆盖缺口**：`#2A2823` 不在守卫旧坐标表内，故桶② 的「规格源」项报 0 是**假阴性**。
全仓 `#2A2823` 共 7 处：json ×5（上述）+ `components/zy-loading/index.wxss:302`
与 `styles/loading-animation.wxss:232` 的 `var(--zy-text-1, #2A2823)` ×2
（这 2 处已被规则 D 计入 38 处兜底≠真值，不会漏）。

建议（未执行，等裁定）：把 `#2A2823` 加进守卫旧坐标表，桶② 规格源将由 0 变 5。
按「只读核对、不一致报你、不要改」的指令，本单未改 `design-tokens.json`，也未动守卫色表。

### 9.7b 残留：variables ↔ design-tokens 之间 14 个同值重复（判据未覆盖，未处理）

按裁定判据严格执行的必然结果，如实记录：

- 判据只规定了「theme-teal 的 `page{}` 有同名 → 删」和「独有令牌 → 一个都不能删」。
- 下列 14 个令牌 **theme-teal 两边都没有** → 按判据均属「独有令牌」→ **两份都必须保留**：

```
--lux-gold-100/200/300/400/500/600/700 · --lux-gold-grad
--lux-green-900/800/700/600
--lux-shadow-gold · --lux-hairline-gold
```

- 14/14 **同值**，异值冲突 0 → 规则 C 仍为 0，**不影响 #10 验收**。
- 最终生效来源为 `design-tokens.wxss`（import 链中位于 variables 之后）。

**潜在风险**：这是纯冗余而非冲突。一旦有人只改其中一份，规则 C 会立刻从 0 跳起，
且运行时以 design-tokens 那份为准、改 variables 那份不生效——正是本次要根治的那类陷阱。

**未擅自处理的原因**：判据白纸黑字写的是「独有令牌必须原样保留，一个都不能删」，
这 14 个按定义就是独有令牌。删任意一份都超出授权范围。建议后续单开处置
（技术意见：删 `variables.wxss` 那份，保留 `design-tokens.wxss` 份 = 运行时行为不变）。

### 9.8 本单其余改动

- `scripts/verify-token-cascade.js`（新增）：单遍字符扫描解析器，正确处理注释、字符串、
  嵌套括号、一行多声明、值内含 `;`（如 `--zy-paper-noise` 的 base64 data URI）。
  导出 `parseWxss/blocksOf/resolve/consumedTokens/buildPlan`，与 `lint-tokens.js` 共用。
- `scripts/lint-tokens.js`：令牌索引改用上述真实解析器（替换旧行正则）；
  新增 `EXCLUDE_REL_PATHS` 相对路径级忽略，纳入 `web-admin/dist`（Vite 构建产物）。
- `package.json`：新增 `lint:tokens` / `lint:tokens:strict` / `verify:token-cascade`。
  **未挂进第 123 行的 `ci:check` 聚合脚本**（按指令等 DADDY 裁定后再接）。
- 未触碰 `styles/theme-teal.wxss`（prototype-builder-2 正在其上追加 wash 令牌，只加不改）。

### 9.9 #10 后守卫口径刷新

```
规则A 野金残留          = 0        PASS
规则B 桶①已覆盖         = 0        （原 25，删行后源头消失）
      桶①b 未覆盖       = 0        （原 1，--gradient-dark 已改值）
      桶②真实泄漏       = 49       （裸码 11 + 兜底≠真值 38 + 规格源 0）
      桶③ web-admin     = 15       独立 Vue 后台，默认不阻断
规则C 跨文件同名冲突     = 0        （删行前 182）
exit 0 · PASS
```

桶② 的 49 归属 #4/#6/#11，不在 #10 范围内。

---

## 10. 任务 #14 · tabBar 规格三方分裂（team-lead 建档，未派工）

### 10.1 性质：规则 D 的**结构性盲区**实证

`prototype-builder-3` 在 §8 提出规则 D（兜底≠真值）时已指出其固有缺陷——"一致，但一致地错"：两份规格逐字相同即通过，但两份可能同时错。本节是该盲区的第一个实证案例，且不是假想，是线上正在渲染的状态。

### 10.2 三方对照

| 维度 | `design-tokens.json` | `styles/theme-teal.wxss` | `custom-tab-bar/index.wxss`（**实际渲染**） |
|---|---|---|---|
| 中心键直径 | `tabBar.center.diameter` `112rpx` | `--zy-tabbar-center-d: 112rpx` (L260) | `.center-button { width/height: 104rpx }` (L226-227) |
| 突出量 | `protrusion` `36rpx` | `--zy-tabbar-center-protrusion: 36rpx` (L261) | `margin-top: -48rpx` (L233) |
| 中心图标 | `center.iconSize` `52rpx` | `--zy-tabbar-center-icon-size: 52rpx` (L263) | `width/height: 40rpx` (L287-288) |
| 中心投影 | `center.shadow` = A | `--zy-tabbar-center-shadow` = A (L266) | `--tb-center-shadow` = **B** (L60-62) |

- A = `0 8rpx 24rpx rgba(31,58,31,0.25), 0 2rpx 8rpx rgba(31,58,31,0.15)`
- B = `0 6rpx 20rpx rgba(31,58,31,0.28), 0 2rpx 8rpx rgba(31,58,31,0.18)`

**前两列逐字一致 → 规则 D 判 PASS。第三列才是用户看到的东西。** 静态比对两份规格永远发现不了这类问题，只有把"规格 vs 消费点"接起来比才行。

### 10.3 死规格规模

`theme-teal.wxss` 定义 `--zy-tabbar-*` 共 20 个，全仓实际被 `var()` 消费的仅 4 个：

```
被消费 (4)：--zy-tabbar-border-top / -item-inactive / -item-active / -center-grad
死规格 (16)：-height -safe-bottom -total-height -bg -bg-glass -blur
             -item-active-bg -icon-size -label-size -label-weight -label-weight-active
             -center-d -center-protrusion -center-bottom -center-icon-size
             -center-icon -center-shadow
（-center-shadow 另被 theme-teal:302 --zy-shadow-fab 转引一层，同样无终端消费）
```

组件在 `.tab-bar` 规则内另起了一套 `--tb-*` 局部令牌（L59-68），注释理由为"以下值在 theme-teal 中无精确等价物，就地令牌化以保证零外观改变"。**该前提为误判**：theme-teal 中存在同语义令牌，只是数值对不上。局部令牌化把"值分歧"掩盖成了"命名分歧"。

（注：局部令牌声明在 `.tab-bar` 而非 `:host`，是因组件 WXML 用 `<root-portal>` 搬出宿主子树、`:host` 自定义属性无法继承——这个判断是**对的**，收敛时必须保留 `.tab-bar` 作为声明宿主，不能挪回 `:host`。）

### 10.4 收敛方案（三步，零外观改变）

1. **校准**：把 `theme-teal.wxss` 的 `--zy-tabbar-center-d/-protrusion/-icon-size/-shadow` 等改成组件实测值（112→104、36→48、52→40、A→B），即**以运行时为真值反向修规格**，而非拿规格去改渲染。
2. **接线**：`custom-tab-bar/index.wxss` 硬编码改 `var(--zy-tabbar-*)`，删除与之重复的 `--tb-*`；`--tb-bar-bg` / `--tb-center-border` / `--tb-center-highlight` / `--tb-center-inner-shadow` 在 theme-teal 中确无等价物，保留为局部令牌。
3. **同步**：`design-tokens.json` 的 `tabBar` 块 + `shadow.fab` 跟随校准后的 theme-teal。

⚠️ 顺序不可颠倒。先接线后校准 = 一次真实的视觉变更（键小 8rpx、突出少 12rpx、图标大 12rpx、投影变淡），属未授权改版。

### 10.5 已完成部分（team-lead）

`design-tokens.json` 的 `shadow.*` 块已对齐 `theme-teal.wxss` L227-234 运行时真值：

```
xs  0 2rpx 8rpx rgba(42,40,35,0.04)   → none
sm  0 4rpx 16rpx rgba(42,40,35,0.06)  → none
md  0 8rpx 24rpx rgba(42,40,35,0.08)  → 0 2rpx 12rpx rgba(26,26,23,0.04)
lg  0 16rpx 40rpx rgba(42,40,35,0.10) → 0 8rpx 32rpx -8rpx rgba(26,26,23,0.08)
floatTabBar 0 -4rpx 32rpx rgba(42,40,35,0.10) → 0 -2rpx 24rpx rgba(26,26,23,0.06)
补齐 xl / 2xl / soft；新增 _source 键锚定真相源
```

染色统一为 `rgba(26,26,23,*)`（墨黑 `#1A1A17`），旧 `rgba(42,40,35,*)`（`#2A2823`）废弃——即 `prototype-builder-3` 报的 5 处漂移。`--shadow-xs/sm/md/lg/float` 经确认为活令牌（6 文件 9 处消费），对齐方向成立。

`shadow.fab` 与 `tabBar` 块**故意未改**，仅加 `_fabNote` 标注冲突：单改 json 只会制造第四个版本，须待 §10.4 三步一并收敛。

### 10.6 给守卫的启示（规则 F 候选）

规则 D 只能比"两份规格"，抓不到"规格 vs 渲染"。补一条**孤儿令牌检测**即可低成本覆盖本类问题：

> 扫描令牌定义集与全仓 `var()` 引用集，报告**定义了但零消费**的令牌。零消费本身不是错（可能是预留），但当零消费令牌与某组件的硬编码值语义重叠时，几乎必然是分裂。

本例中 16 个死规格会全部亮灯，人工一眼可辨。成本远低于做真实渲染比对。

---

## 11. 非色彩维度普查 · 圆角 / 字号 / 间距，与「两代设计系统」根因

### 11.1 缘起：治理链条的维度盲区

§10 定位 #14 的根因是「给执行方的 spec 只覆盖色彩维度」。顺着这条线自查，发现问题不止于一个组件——**整条治理链路（spec → 守卫规则 A~E → 全仓 grep 归零）从头到尾只有色彩维度**。圆角、字号、间距、字重、动效从未被任何一条规则覆盖过。

于是对 `design-tokens.json` 剩余的块逐一取证。结论：两个维度、两种病，性质完全不同。

### 11.2 圆角：规格错档 + 一个孤儿死值（已修）

| 档位 | design-tokens.json（旧） | theme-teal `--border-radius-*` | `--zy-radius-*` | 偏差 |
|---|---|---|---|---|
| sm | 16rpx | 8rpx | 8rpx | 错 2 档 |
| md | 24rpx | 12rpx | 12rpx | 错 2 档 |
| lg | 24rpx | 16rpx | 16rpx | 错 1 档 |
| xl | 32rpx | 20rpx | 20rpx | 错 2 档 |
| 2xl | 32rpx | 24rpx | 24rpx | 错 1 档 |
| 3xl | 40rpx | 32rpx | 32rpx | 错 1 档 |
| **pill** | **999rpx** | **12rpx** | **12rpx** | **方向反向** |

两套 theme-teal 令牌内部逐档一致，且旧 json 梯子是塌陷的（md=lg=24、xl=2xl=32），真值明确在 theme-teal 侧。

**运行时取证**（全仓 `*.wxss`）：

```
border-radius: var(…)      397 处   ← 已令牌化 60%
border-radius: <n>rpx       96 处
border-radius: 50%         169 处
border-radius: 999/9999rpx   0 处   ← 关键
```

> **初判被数据推翻**：先前据「169 处硬编码」推测「去胶囊化只改令牌、页面还在渲胶囊」。实测 999rpx **0 处**，169 全是 `50%`（圆形头像/图标容器，合法用法，不在梯子内）。**wxss 层面去胶囊化是干净的**。
>
> 因此 json 的 `pill: 999rpx` 性质单纯：全仓唯一的 999rpx 来源，且零消费——**孤儿死值**，规则 F（§10.4）正是为这类而设。

**已修**：`design-tokens.json` radius 块对齐 theme-teal，补齐 `xs/4xl/full` 三档，`pill` 999→12rpx，加 `_source` 锚定真相源 + `_pillNote` 记录取证结论。与 §10 的 shadow 修正同性质（json 偏离运行时真值，且 json 无代码生成消费方，仅被 `lint-tokens.js` 当桶②b 规格源扫描），可直接对齐。

### 11.3 字号：三重冲突，两份规格都不是真值（冻结）

```
font-size: var(…)          188 处   ← 表面令牌化率 14.9%
font-size: <n>rpx         1048 处
font-size: <n>px            27 处
```

**但 188 处 var() 是假象**。拆开看引用的是谁：

| 被引用令牌 | 处数 | 归属 |
|---|---|---|
| `--picker-option-font-size` / `--cell-font-size` / `--step-icon-size` | 各 4 | 第三方组件库私有 |
| `--uploader-*-font-size` / `--uploader-*-icon-size` | 各 2（6 项） | 第三方组件库私有 |
| **`--font-size-xxs` / `--font-size-xs` / `--font-size-sm`** | **各 3** | **项目设计系统** |

项目自有字号令牌 `--font-size-*` 全族实测消费 **12 次**（8 个定义中 6 个活体，但每个只被用 1-3 次）。扣掉组件库私有令牌后：

> **字号有效令牌化率 = 12 / (12 + 1048 + 27) ≈ 1.1%**

对比圆角 60%、间距 26%、色彩 100%，字号维度**是彻底的治理空白**。三重冲突：

**① 单位不统一**：theme-teal `--font-size-*` 用 px（30/24/20/18/16/14/12/10px），json 用 rpx（56/44/36/32/28/24/20/22rpx）。同一个 theme-teal 文件内，字号 px、圆角 rpx。

**② 同名不同值陷阱**（比数值漂移更危险）：

| json 名 | json 值 | theme-teal 同名 | 换算 rpx | 实际相等于 |
|---|---|---|---|---|
| `sm` | 24rpx | `--font-size-sm` 14px | 28rpx | json 的 `body` |
| `xs` | 20rpx | `--font-size-xs` 12px | 24rpx | json 的 `sm` |

json 的 h2/h3/body/sm/xs 五档数值与 theme-teal 的 lg/md/sm/xs/xxs **完全相同但整体错位一级**。按名取值必错，且错得很隐蔽——不会报错，只会小一号。

**③ 真值不在任何一份规格里**。高频硬编码值分布：

| 值 | 处数 | theme-teal 梯子 | json 梯子 |
|---|---|---|---|
| 24rpx | 199 | ✓ (xs) | ✓ (sm) |
| 28rpx | 186 | ✓ (sm) | ✓ (body) |
| **22rpx** | **178** | ✗ | ✓ (tab) |
| **26rpx** | **149** | ✗ | ✗ |
| 20rpx | 93 | ✓ (xxs) | ✓ (xs) |
| **30rpx** | **69** | ✗ | ✗ |
| **18rpx** | **19** | ✗ | ✗ |
| **34rpx** | **16** | ✗ | ✗ |

梯子外野值 253+ 处（26/30/18/34），加上仅 json 有的 22rpx（178 处）。开发者基本无视两份规格自由取值——**字号的事实真值是手写习惯，不是任何一个文件**。

**处置：冻结，不单方面改**。两条路都超出本轮 scope，须 DADDY 裁定：
- **A｜规格迁就现实**：把 26/30rpx 等高频野值纳入梯子，统一改 rpx，重命名消除同名陷阱。改动小，但等于承认梯子由历史决定。
- **B｜现实迁就规格**：定一套梯子，发起 1048 处字号令牌化。彻底，但工作量与全仓色彩治理同量级，且会产生真实视觉变动（26→24 或 28 都会动版）。

json 的 `typography.scale` **值未改动**，仅加 `_status` / `_conflict1~3` 标注冻结原因与取证数据，防止后续实现误采。

### 11.4 间距：同文件内两套自相矛盾的梯子（冻结）

字号是**跨文件**同名不同值，间距更进一步——`theme-teal.wxss` **同一个文件内**有两套：

| 档位 | `--spacing-*` (L197-208) | `--zy-space-*` (L279-286) | json `spacing` |
|---|---|---|---|
| 2xs / xxs | 8rpx | 4rpx | 4rpx |
| xs | 12rpx | 8rpx | 8rpx |
| sm | **20rpx** | **16rpx** | 16rpx |
| md | **32rpx** | **24rpx** | 24rpx |
| lg | **48rpx** | **40rpx** | **32rpx** |
| xl | 64rpx | 64rpx | **48rpx** |
| 2xl / xxl | 96rpx | 96rpx | **64rpx** |
| 3xl / xxxl | 128rpx | 128rpx | **96rpx** |

三套值、三个梯子。消费量取证给出了明确的活体判定：

```
var(--spacing-*)   340 处   ← 唯一活体
var(--zy-space-*)    0 处   ← 8 个令牌全零消费（规则 F 孤儿令牌，第二例）
padding/margin 令牌化率 25.8%（var 497 / 硬编码 1427）
```

**json 的 spacing 块跟的是零消费那套**（2xs/xs/sm/md 四档与 `--zy-space-*` 逐字相同）。

但真正需要 DADDY 裁定的是下面这组对照——硬编码间距 Top10 与两套梯子的命中情况：

| 值 | 处数 | `--spacing-*`（活·340 消费） | `--zy-space-*`（死·0 消费） |
|---|---|---|---|
| **16rpx** | **133** | ✗ | **✓** |
| 20rpx | 132 | ✓ | ✗ |
| **24rpx** | **125** | ✗ | **✓** |
| 8rpx | 108 | ✓ | ✓ |
| 12rpx | 77 | ✓ | ✗ |
| 4rpx | 72 | ✓ | ✓ |
| 32rpx | 71 | ✓ | ✗ |
| **28rpx** | **47** | ✗ | ✗ |
| **40rpx** | **39** | ✗ | **✓** |
| **6rpx** | **35** | ✗ | ✗ |

**结论是反直觉的：被消费 340 次的活梯子（12/20/32/48）与手写实践错位 379 处；贴合实践的梯子（16/24/40 三档高频命中）却零消费。**

这不是简单的"删死码"能收场的。删 `--zy-space-*` 只需一行 grep 佐证（零消费，硬事实，与 §10 的 4 条渐变同性质，可授权执行）；但**json 该对齐哪套**才是真问题：

- 对齐 `--spacing-*`（活体）→ 规格自洽，但坐实一个与 379 处实践错位的梯子，后续令牌化会持续产生"想用 16 只能选 12 或 20"的摩擦。
- 对齐 `--zy-space-*`（死码）→ 贴合实践，但要把 340 处现有消费全部迁移，工作量与视觉风险都不小。
- 折中：保留 `--spacing-*` 命名与消费，**补入 16/24/40 三档**（如 `--spacing-sm2/md2`），既不动存量又消化高频实践。命名会变丑。

三条路都要动版或动名，**冻结待裁**。

### 11.5 总诊断：项目里并存**两代**设计系统

逐维普查到这里，各维度的"分裂"不再像是独立的漂移事故。对 `theme-teal.wxss` 全部令牌族做定义/活体/消费量统计：

| 令牌族 | 定义数 | 活体 | 死码 | **实测总消费** |
|---|---|---|---|---|
| **`--zy-*`（新代）** | **79** | **15** | **64** | **22** |
| `--spacing-*`（旧代） | 12 | 8 | 4 | **340** |
| `--border-radius-*`（旧代） | 10 | 9 | 1 | **320** |
| `--font-size-*`（旧代） | 8 | 6 | 2 | 12 |

`--zy-*` 是一套**覆盖全维度的完整设计系统**——色彩（primary 五档 / accent 四档 / surface / text / border）、字号（fs-display~xs）、间距（space-2xs~3xl）、圆角（radius-sm~pill）、阴影（shadow-xs~fab）、动效（dur-fast~slow / ease-standard~spring）、tabBar 专用（21 个）。79 个定义，**只接线了 15 个，总共被消费 22 次**（且活体几乎全是 1-2 次，集中在 `custom-tab-bar`、`zy-loading`、`loading-animation`、`app.wxss` 四处）。

而 `design-tokens.json` 正是**这套新代系统的规格文件**——它的 `spacing`（4/8/16/24…）逐字对应 `--zy-space-*`，`radius`（旧值 16/24/24/32…）对应 `--zy-radius-*` 的坐标系，`typography.scale` 用 display/h1/h2/h3/body 命名对应 `--zy-fs-*`。

**所以 json 与 theme-teal 的"分裂"，本质不是数值漂移，而是两代系统并存：**

| | 新代 | 旧代 |
|---|---|---|
| 载体 | `design-tokens.json` + `--zy-*` | `--spacing-*` / `--border-radius-*` / `--font-size-*` / `--page-padding` / `--padding-*` |
| 规格 | 完整、成体系、有语义命名 | 散落、多族重叠、命名不统一 |
| 接线 | **19%（22 次消费）** | **完整（660+ 次消费）** |
| 结论 | 规格好但没落地 | 落地了但规格乱 |

§10 的 #14 tabBar 三方分裂，只是这个大问题在单个组件上的投影：`--zy-tabbar-*` 21 个定义里 16 个死，组件实际用自己硬编码的 `--tb-*`。

**这是路线问题，必须 DADDY 裁定，不在本轮 scope 内：**
- **A｜完成新代接线**：把 `--zy-*` 全族接上（含 1048 处字号、379 处间距的迁移）。规格漂亮、一步到位，但工作量与全仓色彩治理同量级，且必然产生真实视觉变动。
- **B｜废弃新代，规范旧代**：删 64 个死码，把 `design-tokens.json` 全面改写为旧代坐标（本轮已对 `shadow`/`radius` 这么做）。改动小、零视觉风险，但等于承认设计系统由历史决定，且要接受 `--spacing-*` 与手写实践错位 379 处的现实。
- **C｜分维度择优**：色彩/圆角/阴影已事实站在旧代（本轮已对齐），继续沿用；字号治理率仅 1.1%、几乎无存量包袱，正适合直接上新代 `--zy-fs-*`。收益最高但需要逐维决策。

在裁定前，**`design-tokens.json` 的 `typography` 与 `spacing` 两块保持冻结**（已加 `_status` 标注），`radius` / `shadow` 已按 B 路线对齐旧代活体。

### 11.6 结论：守卫需扩维

| 维度 | 有效令牌化率 | 治理状态 | 守卫覆盖 |
|---|---|---|---|
| 色彩 | ~100% | 全仓 grep 归零，规则 A~E | ✓ |
| 阴影 | — | json 已对齐运行时（§10） | ✗ |
| 圆角 | **60%** | json 已对齐运行时（§11.2） | ✗ |
| 间距 | **26%** | 两套梯子内部矛盾 + 379 处错位（冻结） | ✗ |
| **字号** | **1.1%** | **治理空白，1048 处硬编码（冻结）** | ✗ |
| 字重 / 动效 | 未普查 | `--zy-dur-*` / `--zy-ease-*` 全族死码 | ✗ |

色彩维度做到了 100 分，其余维度连考卷都没发。**规则 F 应从「孤儿令牌检测」扩展为两条**：

- **F1｜孤儿令牌**：定义了但零消费。实测可一次性捞出 64 个 `--zy-*` 死码 + 4 条业务渐变（§10）。
- **F2｜梯子外值检测**：对圆角/字号/间距，扫描不在活体令牌梯子内的硬编码值并按频次排序。高频野值（如字号 26rpx ×149、间距 16rpx ×133）= 梯子缺档信号；低频野值 = 违规。**排序本身就是修复优先级**。

色彩维度做到了 100 分，其余维度连考卷都没发。**规则 F 应从「孤儿令牌检测」扩展为「非色彩维度梯子外值检测」**：对圆角/字号/间距，扫描不在令牌梯子内的硬编码值并按频次排序——高频野值即梯子缺档信号，低频野值即违规。

---

*报告维护：prototype-builder-3 · 任务 #9（守卫二期 + 分桶审计）、规则 C/D 增强，及 #10（令牌真相源去重·删行）。§10、§11 由 team-lead 建档。*

---

*#9 交付边界：仅修改 `scripts/lint-tokens.js` 与本报告。*
*#10 交付边界：`styles/variables.wxss`、`styles/design-tokens.wxss`、`scripts/verify-token-cascade.js`（新增）、`scripts/lint-tokens.js`、`package.json`、本报告 §9。未改 `theme-teal.wxss` 与 `design-tokens.json`。*
