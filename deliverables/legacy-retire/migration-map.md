# 旧代令牌 → 新代 `--zy-*` 迁移映射表 & 风险报告（A-0 审计 + A-1 补档 + A-2-1/A-2-2 迁移 + A-3 退役）

> 生成：prototype-builder-3 · Phase A-0（只读审计）→ **A-1（新代补档落地）→ A-2-1（radius/font-size 迁移）→ A-2-2（spacing 迁移）→ A-3（旧代定义退役）全部已执行**
> 日期：2026-08-04 · 依据：`styles/theme-teal.wxss`（唯一运行时生效层）+ `design-tokens.json`（新代规格源）+ 全仓 grep 实测
> 路线：**A — 完全使用新代 `--zy-*` 令牌体系，彻底废弃旧代**（旧代 = `--spacing-*`/`--border-radius-*`/`--font-size-*` 旧前缀令牌族）✅ **已完成**
> ✅ **A-1 已完成（2026-08-04）**：theme-teal.wxss 纯新增 6 档（--zy-radius-xs / --zy-fs-md / --zy-fs-xs-lg / --zy-fs-2xs / --zy-space-sm2 / --zy-space-4xl），design-tokens.json 三块对齐运行时并解除冻结标注。守卫 PASS（桶② 54 不变）、cascade PASS、json 语法 OK。详见 §1.2/1.3/1.4/1.6/4.4。
> ✅ **A-2-1 已完成（2026-08-04）**：全仓 radius 320 处 + font-size 12 处 `var()` 引用迁移到新代（58 文件），5 处 9999rpx fallback 清除（→ `var(--zy-radius-pill)` 无兜底），旧前缀消费归零（radius/font-size）。守卫 PASS（桶② 54 不变）。详见 §3.2/3.3/7.2。
> ✅ **A-2-2 已完成（2026-08-04）**：全仓 spacing 340 处 `var(--spacing-*)` → `var(--zy-space-*)`（30 文件），30 处 fallback 清除；动版 265 处（xs/md/lg）+ 同值 75 处。旧前缀消费归零（spacing）。守卫 PASS（桶② 54 不变）。动版影响面见 §7.5。详见 §3.1/7.2。
> ✅ **A-3 已完成（2026-08-04）**：theme-teal.wxss 删除旧代定义 30 行（--spacing-* 12 + --border-radius-* 10 + --font-size-* 8），各加退役注释；守卫真相源核验——规则 D 仅检色值 fallback（已全清），规则 C 随 TOKEN_DEFS 自动消隐，删定义无误报。守卫 PASS（桶② 54 不变）、cascade PASS。新代接线率 100%（672/672）。详见 §1.6/6/7.2/7.3。
> ⚠ 并发警告：A-0 审计期间 prototype-builder-2 正在执行任务 #2（`--text-tertiary`/`--error-color` AA 修复），
>   theme-teal.wxss 的 `--text-tertiary` 已从 `#9E9889` 改为 `#736D5F`（git diff 确认）。本报告相关数值按审计当时实测值记录，迁移执行前需复核。

---

## 0. 执行摘要（3 个关键结论）

| 指标 | 数值 | 说明 |
|------|------|------|
| **迁移总量** | **672 处旧代消费** | `--spacing-*` 340 + `--border-radius-*` 320 + `--font-size-*` 12（实测，与 lead 提供数字一致） |
| **动版量（A-1 补档后）** | **267 处** | 口径：值变化 + 缺档吸附的消费点。spacing 265（xs 12→16 / md 32→40 / lg 48→40）+ radius 0（补档后）+ font-size 2（lg 36→34 有消费 1 处 + md 32→30 零消费）。（口径：267 = spacing 265 处 + font-size 2 处；§3.1/§7.5 的 265 仅计 spacing） |
| **feeding 断链点数** | **0 处**（4 页空壳） | 4 个空壳页无 wxss 无旧代消费；但同子包 3 个活页消费 70 处，需单独迁移 |

**核心判断**：
1. **spacing 是最大动版源**：340 处中 265 处（78%）会因新旧梯子不同而改变渲染值（32→40 更松 / 48→40 更紧凑 / 12→16 更松）。A-1 补档 20/200rpx 后，`--spacing-sm`(40 处) 与 `--spacing-xxxxxl`(2 处) 已归零动版。
2. **radius 零动版**：A-1 已补 `--zy-radius-xs: 4rpx`，圆角 320 处全部零视觉迁移（全仓唯一零动版族）。
3. **feeding 4 页（空壳）可安全摘除**：0 旧代消费；但 `service-detail`/`confirm-service`/`order-status` 3 个活页仍注册且被外部跳转引用，**不可随 4 页一并废弃**，必须迁移（70 处）。

---

## 1. 新代 `--zy-*` 全维度档位清单

来源：`styles/theme-teal.wxss`（唯一运行时生效层）。共 **79 个唯一令牌**（含 `-w`/`-lh` 伴随变量共 93 个名字）。

### 1.1 颜色族（zy-primary / zy-accent / 中性）

| 令牌 | 值（rpx/色） | 外部消费 | 暗色态 |
|------|------------|---------|--------|
| `--zy-primary-900` | `#0F2410` | 0 | 不翻转 |
| `--zy-primary-700` | `#1F3A1F` | 2（zy-loading） | **不翻转** ⚠ |
| `--zy-primary-500` | `#3D6B3D` | 0 | 不翻转 |
| `--zy-primary-300` | `#8A9E7A` | 0 | 不翻转 |
| `--zy-primary-100` | `#E8ECE2` | 0 | 不翻转 |
| `--zy-primary-grad` | `linear-gradient(...)` | 0 | — |
| `--zy-accent` | `#C9A24B` | 1（custom-tab-bar） | 不翻转 |
| `--zy-accent-hover` | `#A8894A` | 0 | — |
| `--zy-accent-soft` | `#F0E6D0` | 0 | — |
| `--zy-accent-glow` | `rgba(201,162,75,.20)` | 0 | — |
| `--zy-bg` | `#F7F5EF` | 2 | 翻转 `#121310` |
| `--zy-surface` | `#FFFFFF` | 1 | 翻转 `#1E1F1B` |
| `--zy-surface-glass` | `rgba(255,255,255,.95)` | 2 | 不翻转 |
| `--zy-surface-glass-solid` | `#FFFFFF` | 0 | — |
| `--zy-surface-glass-border` | `rgba(214,210,199,.4)` | 1（design-tokens 自引） | — |
| `--zy-border` | `#E2DED3` | 0 | 翻转 `#2E2F29` |
| `--zy-border-strong` | `#D6D2C7` | 0 | — |
| `--zy-divider` | `#ECE8DE` | 0 | 翻转 `#252621` |
| `--zy-text-1` | `#1A1A17` | 2 | 翻转 `#F0EDE4` |
| `--zy-text-2` | `#5A564C` | 2 | 翻转 `#A39E90` |
| `--zy-text-3` | `#9E9889` | 0 | 翻转 `#6E6A5E` |
| `--zy-text-on-primary` | `#F7F5EF` | 1（custom-tab-bar） | 不翻转 |

### 1.2 排版族（zy-fs-*）— **新代最薄维度**

| 令牌 | 值 | 外部消费 | 备注 |
|------|-----|---------|------|
| `--zy-fs-display` | 60rpx (w:300, lh:1.1) | 0 | 首屏品牌大标 |
| `--zy-fs-h1` | 48rpx (w:500, lh:1.15) | 0 | 页面大标题 |
| `--zy-fs-h2` | 40rpx (w:500, lh:1.25) | 0 | 区块标题 |
| `--zy-fs-h3` | 34rpx (w:500, lh:1.35) | 0 | 卡片标题 |
| `--zy-fs-body` | 30rpx (w:400, lh:1.65) | 0 | 正文 |
| `--zy-fs-md` | **28rpx (w:400, lh:1.6)** | 0 | **A-1 补档**：旧 `--font-size-sm`(28rpx) 迁移目标 + 硬编码 28rpx×186 |
| `--zy-fs-sm` | 26rpx (w:400, lh:1.5) | 0 | 次级正文 |
| `--zy-fs-xs-lg` | **24rpx (w:400, lh:1.5)** | 0 | **A-1 补档**：旧 `--font-size-xs`(24rpx) 迁移目标 + 硬编码 24rpx×199（TOP1） |
| `--zy-fs-xs` | 22rpx (w:400, lh:1.4) | 0 | 辅助文字 |
| `--zy-fs-2xs` | **20rpx (w:400, lh:1.4)** | 0 | **A-1 补档**：旧 `--font-size-xxs`(20rpx) 迁移目标 + 硬编码 20rpx×93 |

> ✅ **A-1 已补档 3 档**（md=28 / xs-lg=24 / 2xs=20），梯子从 7 档扩到 10 档，覆盖实践高频 28/24/20rpx。
> zy-fs 全族仍 0 消费（A-2 才接线）。已与 `design-tokens.json` typography.scale 对齐（解除旧分叉）。
> 高权重大小写：`--zy-fs-h1-w: 500` 等为伴随变量（非独立令牌）。

### 1.3 间距族（zy-space-*）

| 令牌 | 值 | 外部消费 |
|------|-----|---------|
| `--zy-space-2xs` | 4rpx | 0 |
| `--zy-space-xs` | 8rpx | 0 |
| `--zy-space-sm` | 16rpx | 0 |
| `--zy-space-sm2` | **20rpx** | 0 | **A-1 补档**：硬编码 20rpx×177（间距 TOP 缺档）+ 旧 `--spacing-sm`(20rpx) 迁移目标 |
| `--zy-space-md` | 24rpx | 0 |
| `--zy-space-lg` | 40rpx | 0 |
| `--zy-space-xl` | 64rpx | 0 |
| `--zy-space-2xl` | 96rpx | 0 |
| `--zy-space-3xl` | 128rpx | 0 |
| `--zy-space-4xl` | **200rpx** | 0 | **A-1 补档**：旧 `--spacing-xxxxxl`(200rpx) 2 处消费 + 硬编码 200rpx×11 |

> ✅ **A-1 已补档 2 档**（sm2=20 / 4xl=200），梯子从 8 档扩到 10 档。
> zy-space 全族仍 0 消费（A-2 才接线）。已与 `design-tokens.json` spacing 对齐（解除旧分叉）。

### 1.4 圆角族（zy-radius-*）

| 令牌 | 值 | 外部消费 |
|------|-----|---------|
| `--zy-radius-xs` | **4rpx** | 0 | **A-1 补档**：旧 `--border-radius-xs`(4rpx) 38 处消费缺口档，补档后圆角实现零动版迁移 |
| `--zy-radius-sm` | 8rpx | 0 |
| `--zy-radius-md` | 12rpx | 0 |
| `--zy-radius-lg` | 16rpx | 0 |
| `--zy-radius-xl` | 20rpx | 0 |
| `--zy-radius-2xl` | 24rpx | 0 |
| `--zy-radius-3xl` | 32rpx | 0 |
| `--zy-radius-pill` | 12rpx | 0 |

> ✅ **A-1 已补档 1 档**（xs=4rpx）。补档后新旧圆角逐档同值（§2.2），**圆角 320 处全零动版**。
> zy-radius 全族仍 0 消费（A-2 才接线）。已与 `design-tokens.json` radius 对齐。

### 1.5 阴影 / 动效族

| 令牌 | 值 | 外部消费 |
|------|-----|---------|
| `--zy-shadow-xs` | `none` | 0 |
| `--zy-shadow-sm` | `none` | 0 |
| `--zy-shadow-md` | `0 2rpx 12rpx rgba(26,26,23,.04)` | 0 |
| `--zy-shadow-lg` | `0 8rpx 32rpx -8rpx rgba(26,26,23,.08)` | 0 |
| `--zy-shadow-fab` | `var(--zy-tabbar-center-shadow)` | 0（自引） |
| `--zy-ease-standard` | `cubic-bezier(.25,.1,.25,1)` | 2（app.wxss） |
| `--zy-ease-emphasized` | `cubic-bezier(.19,1,.22,1)` | 0 |
| `--zy-ease-decelerate` | `cubic-bezier(.16,1,.3,1)` | 0 |
| `--zy-ease-spring` | `cubic-bezier(.34,1.15,.64,1)` | 0 |
| `--zy-dur-fast` | 280ms | 2（app.wxss） |
| `--zy-dur-base` | 500ms | 0 |
| `--zy-dur-slow` | 700ms | 0 |
| `--zy-dur-fab` | 600ms | 0 |

### 1.6 消费汇总（接线率）

| 维度 | 数值 |
|------|------|
| theme-teal 定义唯一 zy 令牌（A-1 后） | **85**（79 原 + 6 补档：radius-xs/fs-md/fs-xs-lg/fs-2xs/space-sm2/space-4xl）（实测 theme-teal 现定义 `--zy-*` 名 105 个 = 行首定义 85 + `-w`/`-lh` 伴随变量 20（同行多声明）；含历史 tabbar 族口径差；接线率以「被消费 672 / 可消费定义」表述为准） |
| 其中外部消费（非自引） | **13 个**（accent/bg/dur-fast/ease-standard/primary-700/surface-glass/tabbar-border-top/tabbar-center-grad/tabbar-item-active/tabbar-item-inactive/text-1/text-2/text-on-primary） |
| 外部消费总点数（A-3 后） | **672**（zy-space 340 + zy-radius 320 + zy-fs 12 = 旧代全量） |
| 接线率 | **672/672 = 100%**（旧代 var() 引用全量迁移） |
| 旧代定义 | **0**（theme-teal 30 行已退役，A-3） |

> ✅ **A-3 后：旧代 `--spacing-*`/`--border-radius-*`/`--font-size-*` 定义 0 行、消费 0 处；新代 zy-* 消费 672 处 = 100% 接线**。旧代 90 处 fallback（radius/font-size 60 + spacing 30）全部清除。
> 与 lead 提供「79 定义仅 15 活、总消费 22」核对：A-0 时点数 22 完全一致；A-3 后已不存在「孤儿/未接线」语义（补档 6 档 + 既有 85 定义中仅 13 个有旧代映射消费，其余为色彩/动效/阴影等已活或业务预留）。

---

## 2. 旧代对应族清单

### 2.1 `--spacing-*`（12 定义，340 消费）

来源：theme-teal.wxss L216-227。旧梯子：**2/4/8/12/20/32/48/64/96/128/160/200rpx**。

| 令牌 | 值 | 消费 | 占比 |
|------|-----|------|------|
| `--spacing-xxxxs` | 2rpx | 0 | — |
| `--spacing-xxxs` | 4rpx | 0 | — |
| `--spacing-xxs` | 8rpx | 0 | — |
| `--spacing-xs` | 12rpx | 13 | 3.8% |
| `--spacing-sm` | 20rpx | 40 | 11.8% |
| `--spacing-md` | 32rpx | **147** | 43.2% |
| `--spacing-lg` | 48rpx | **105** | 30.9% |
| `--spacing-xl` | 64rpx | 24 | 7.1% |
| `--spacing-xxl` | 96rpx | 8 | 2.4% |
| `--spacing-xxxl` | 128rpx | 1 | 0.3% |
| `--spacing-xxxxl` | 160rpx | 0 | — |
| `--spacing-xxxxxl` | 200rpx | 2 | 0.6% |
| **合计** | | **340** | |

消费 Top 文件：pages/discover(22)、activity/detail(21)、activity/list(20)、activity/register(18)、pet/common(17)、pages/service(17)、feeding/confirm-service(16)、booking/confirm(15)…

### 2.2 `--border-radius-*`（10 定义，320 消费）

来源：theme-teal.wxss L234-243。旧梯子：**4/8/12/16/20/24/32/40/12(full)/12(pill)rpx**。

| 令牌 | 值 | 消费 | 占比 |
|------|-----|------|------|
| `--border-radius-xs` | 4rpx | 38 | 11.9% |
| `--border-radius-sm` | 8rpx | 48 | 15.0% |
| `--border-radius-md` | 12rpx | 40 | 12.5% |
| `--border-radius-lg` | 16rpx | **101** | 31.6% |
| `--border-radius-xl` | 20rpx | 4 | 1.3% |
| `--border-radius-2xl` | 24rpx | 17 | 5.3% |
| `--border-radius-3xl` | 32rpx | 4 | 1.3% |
| `--border-radius-4xl` | 40rpx | 0 | — |
| `--border-radius-full` | 12rpx | **66** | 20.6% |
| `--border-radius-pill` | 12rpx | 2 | 0.6% |
| **合计** | | **320** | |

消费 Top 文件：pages/profile(25)、activity/register(22)、feeding/confirm-service(19)、feeding/service-detail(17)、other/address(11)…

### 2.3 `--font-size-*`（8 定义，12 消费）

来源：theme-teal.wxss L193-200。**注意单位：px（非 rpx）**。旧梯子：30/24/20/18/16/14/12/10px（= 60/48/40/36/32/28/24/20rpx）。

| 令牌 | 值(px) | 等价(rpx) | 消费 | 消费文件 |
|------|--------|-----------|------|---------|
| `--font-size-xxxl` | 30px | 60rpx | 0 | — |
| `--font-size-xxl` | 24px | 48rpx | 1 | app.wxss |
| `--font-size-xl` | 20px | 40rpx | 1 | app.wxss |
| `--font-size-lg` | 18px | 36rpx | 1 | app.wxss |
| `--font-size-md` | 16px | 32rpx | 0 | — |
| `--font-size-sm` | 14px | 28rpx | 3 | app.wxss |
| `--font-size-xs` | 12px | 24rpx | 3 | app.wxss |
| `--font-size-xxs` | 10px | 20rpx | 3 | app.wxss |
| **合计** | | | **12** | 全在 app.wxss |

> **12 处消费全部集中在 app.wxss**（base 字号、.btn/.input/.status-badge/.eyebrow/.kicker 等全局类）→ 迁移面小、影响面大（全局基础排版）。

---

## 3. 迁移映射表（核心交付）

### 3.1 间距：`--spacing-*` → `--zy-space-*`

旧梯子 2/4/8/12/20/32/48/64/96/128/160/200 vs 新梯子（A-1 补档后）4/8/16/20/24/40/64/96/128/200。

| 旧代 | 旧值 | 新代 | 新值 | 消费 | 判定 | 动版标注 |
|------|------|------|------|------|------|---------|
| `--spacing-xxxxs` | 2rpx | — | — | 0 | **缺档·零消费** | 无需处理 |
| `--spacing-xxxs` | 4rpx | `--zy-space-2xs` | 4rpx | 0 | 同值 ✓ | 零视觉（改名即可） |
| `--spacing-xxs` | 8rpx | `--zy-space-xs` | 8rpx | 0 | 同值 ✓ | 零视觉 |
| `--spacing-xs` | 12rpx | `--zy-space-sm` | 16rpx | 13 | **值不同·动版** | 12→16 **更松** +4rpx |
| `--spacing-sm` | 20rpx | `--zy-space-sm2` | 20rpx | 40 | ✅ **A-1 补档后同值** | **零视觉**（原 20→16 动版已消除） |
| `--spacing-md` | 32rpx | `--zy-space-lg` | 40rpx | **147** | **值不同·动版** | 32→40 **更松** +8rpx |
| `--spacing-lg` | 48rpx | `--zy-space-lg` | 40rpx | **105** | **值不同·动版** | 48→40 **更紧凑** -8rpx |
| `--spacing-xl` | 64rpx | `--zy-space-xl` | 64rpx | 24 | 同值 ✓ | 零视觉 |
| `--spacing-xxl` | 96rpx | `--zy-space-2xl` | 96rpx | 8 | 同值 ✓ | 零视觉 |
| `--spacing-xxxl` | 128rpx | `--zy-space-3xl` | 128rpx | 1 | 同值 ✓ | 零视觉 |
| `--spacing-xxxxl` | 160rpx | — | — | 0 | **缺档·零消费** | 无需处理 |
| `--spacing-xxxxxl` | 200rpx | `--zy-space-4xl` | 200rpx | 2 | ✅ **A-1 补档后同值** | **零视觉**（原缺档已补） |

**间距小计（A-1 补档后）**：同值 33+42 = **75 处**（零视觉）/ 动版 265 处（xs/md/lg）。
**动版占比 265/340 = 77.9%** —— A-1 补档 20/200rpx 后，spacing 动版从 89.7% 降到 77.9%。剩余动版集中在 xs(12→16)/md(32→40)/lg(48→40) 三档，A-2 按此迁移。
**✅ A-2-2 已完成（2026-08-04）**：全仓 340 处 `var(--spacing-*)` → `var(--zy-space-*)` 机械替换完成（30 个文件），30 处 spacing fallback 一并清除（无兜底）。分档：md→lg×147 / lg→lg×105 / sm→sm2×40 / xl→xl×24 / xs→sm×13 / xxl→2xl×8 / xxxxxl→4xl×2 / xxxl→3xl×1。旧前缀消费 = 0。守卫 PASS 桶② 54 不变。动版影响面见 §7.5。

### 3.2 圆角：`--border-radius-*` → `--zy-radius-*`

新旧同值（4/8/12/16/20/24/32/40 全部逐档一致），仅命名不同。A-1 已补 `--zy-radius-xs`。

| 旧代 | 旧值 | 新代 | 新值 | 消费 | 判定 | 动版标注 |
|------|------|------|------|------|------|---------|
| `--border-radius-xs` | 4rpx | `--zy-radius-xs` | 4rpx | 38 | ✅ **A-1 补档后同值** | **零视觉**（原缺档已补） |
| `--border-radius-sm` | 8rpx | `--zy-radius-sm` | 8rpx | 48 | 同值 ✓ | 零视觉 |
| `--border-radius-md` | 12rpx | `--zy-radius-md` | 12rpx | 40 | 同值 ✓ | 零视觉 |
| `--border-radius-lg` | 16rpx | `--zy-radius-lg` | 16rpx | 101 | 同值 ✓ | 零视觉 |
| `--border-radius-xl` | 20rpx | `--zy-radius-xl` | 20rpx | 4 | 同值 ✓ | 零视觉 |
| `--border-radius-2xl` | 24rpx | `--zy-radius-2xl` | 24rpx | 17 | 同值 ✓ | 零视觉 |
| `--border-radius-3xl` | 32rpx | `--zy-radius-3xl` | 32rpx | 4 | 同值 ✓ | 零视觉 |
| `--border-radius-4xl` | 40rpx | — | — | 0 | **缺档·零消费** | 无需处理 |
| `--border-radius-full` | 12rpx | `--zy-radius-pill` | 12rpx | 66 | 同值 ✓ | 零视觉（语义改名 full→pill） |
| `--border-radius-pill` | 12rpx | `--zy-radius-pill` | 12rpx | 2 | 同值 ✓ | 零视觉 |

**圆角小计（A-1 补档后）**：同值 320 处（含 xs 38 处补档后归零）/**0 动版**。
**✅ A-1 已补 `--zy-radius-xs`：圆角 320 处全部零视觉迁移** —— 圆角是全仓唯一零动版迁移的族。
**✅ A-2-1 已完成（2026-08-04）**：全仓 320 处 `var(--border-radius-*)` → `var(--zy-radius-*)` 机械替换完成（58 个文件），含 5 处 9999rpx fallback 清除（→ `var(--zy-radius-pill)` 无兜底）。旧前缀消费 = 0。守卫 PASS 桶② 54 不变。

### 3.3 字号：`--font-size-*` → `--zy-fs-*`

旧代用 **px**、新代用 **rpx**；1px = 2rpx（750 设计稿）。换算后：

| 旧代 | 旧值(px) | 旧等价(rpx) | 新代 | 新值(rpx) | 消费 | 判定 | 动版标注 |
|------|---------|------------|------|----------|------|------|---------|
| `--font-size-xxxl` | 30px | 60rpx | `--zy-fs-display` | 60rpx | 0 | 同值 ✓ | 零视觉 |
| `--font-size-xxl` | 24px | 48rpx | `--zy-fs-h1` | 48rpx | 1 | 同值 ✓ | 零视觉 |
| `--font-size-xl` | 20px | 40rpx | `--zy-fs-h2` | 40rpx | 1 | 同值 ✓ | 零视觉 |
| `--font-size-lg` | 18px | 36rpx | `--zy-fs-h3` | 34rpx | 1 | **值不同·动版** | 36→34 略小 |
| `--font-size-md` | 16px | 32rpx | `--zy-fs-body` | 30rpx | 0 | **值不同·动版** | 32→30 略小（零消费） |
| `--font-size-sm` | 14px | 28rpx | `--zy-fs-md` | 28rpx | 3 | ✅ **A-1 补档后同值** | **零视觉**（原 28→26 动版已消除） |
| `--font-size-xs` | 12px | 24rpx | `--zy-fs-xs-lg` | 24rpx | 3 | ✅ **A-1 补档后同值** | **零视觉**（原 24→22 动版已消除） |
| `--font-size-xxs` | 10px | 20rpx | `--zy-fs-2xs` | 20rpx | 3 | ✅ **A-1 补档后同值** | **零视觉**（原缺档已补） |

**字号小计（A-1 补档后）**：同值 5 处 / 动版 2 处（lg/md，其中 md 零消费）/ 缺档 0 处。
> ✅ **A-1 已解决**：design-tokens.json 的 typography.scale 已按运行时 `--zy-fs-*` 真值对齐（60/48/40/34/30/28/26/24/22/20rpx），旧分叉消除。`--font-size-sm→--zy-fs-md(28)`、`--font-size-xs→--zy-fs-xs-lg(24)`、`--font-size-xxs→--zy-fs-2xs(20)` 三行因 A-1 补档全部**零动版**。剩余动版仅 `--font-size-lg(36→34)` 1 处有消费（app.wxss h3），A-2 按此迁移。
> ✅ **A-2-1 已完成（2026-08-04）**：全仓 12 处 `var(--font-size-*)` → `var(--zy-fs-*)` 迁移完成（全在 app.wxss）。`--font-size-lg`(h3) 36→34 动版已按映射落地。旧前缀消费 = 0。守卫 PASS。

---

## 4. 新代缺口分析（实践高频硬编码）

### 4.1 字号硬编码（实测，全仓 wxss 去注释后）

| 值 | 次数 | 在新代 zy-fs 梯子内？ | 判定 |
|----|------|---------------------|------|
| 24rpx | **199** | ✅ **A-1 已补 `--zy-fs-xs-lg: 24rpx`** | 在梯内 ✓ |
| 28rpx | **186** | ✅ **A-1 已补 `--zy-fs-md: 28rpx`** | 在梯内 ✓ |
| 22rpx | 178 | ✓（zy-fs-xs） | 在梯内 |
| 26rpx | 149 | ✓（zy-fs-sm） | 在梯内 |
| 20rpx | 93 | ✅ **A-1 已补 `--zy-fs-2xs: 20rpx`** | 在梯内 ✓ |
| 30rpx | 69 | ✓（zy-fs-body） | 在梯内 |
| 32rpx | 32 | ✗（新梯 30/34） | 缺档 → 吸附 30/34 |
| 36rpx | 30 | ✗（新梯 34/40） | 缺档 → 吸附 34/40 |
| 18rpx | 19 | ✗（新梯 22） | 缺档 → 吸附 22 |
| 40rpx | 17 | ✓（zy-fs-h2） | 在梯内 |
| 34rpx | 16 | ✓（zy-fs-h3） | 在梯内 |
| **合计** | **1048** | | |

**结论**：✅ **A-1 已补档 24/28/20 三档**（合计覆盖 478 处 = 45.6% 硬编码），新代 zy-fs 梯子扩为 60/48/40/34/30/28/26/24/22/20rpx。
剩余缺档 32/36/18rpx（81 处 = 7.7%）为中低频，按映射表吸附最近档（32→30/34、36→34/40、18→22），不再补档。

### 4.2 间距硬编码（实测，全仓 wxss 去注释后，padding/margin 值位口径）

| 值 | 次数 | 在新代 zy-space 梯子内？ | 判定 |
|----|------|------------------------|------|
| 24rpx | 194 | ✓（zy-space-md） | 在梯内 |
| 20rpx | **177** | ✅ **A-1 已补 `--zy-space-sm2: 20rpx`** | 在梯内 ✓ |
| 16rpx | 173 | ✓（zy-space-sm） | 在梯内 |
| 32rpx | **132** | ✗（新梯 24/40） | 缺档 → 吸附 24/40 |
| 8rpx | 119 | ✓（zy-space-xs） | 在梯内 |
| 48rpx | 99 | ✗（新梯 40/64） | 缺档 → 吸附 40/64 |
| 12rpx | 98 | ✗（新梯 8/16） | 缺档 → 吸附 8/16 |
| 4rpx | 80 | ✓（zy-space-2xs） | 在梯内 |
| 28rpx | 71 | ✗（新梯 24/40） | 缺档 → 吸附 |
| 40rpx | 66 | ✓（zy-space-lg） | 在梯内 |
| **合计** | **1502** | | |

> ✅ **A-1 已补档 20rpx（177 处）+ 200rpx（11 处）**。新代 zy-space 梯子扩为 4/8/16/20/24/40/64/96/128/200rpx。
> 剩余缺档 32/48/12/28rpx（400 处）为中频，按映射表吸附最近档（32→24/40、48→40/64、12→8/16、28→24/40），不再补档。

> 注：lead 提供「16rpx×133/24rpx×125/40rpx×39/20rpx×132」为**首值位口径**（只数 shorthand 第一值）；我采用**全值位口径**（含多值 padding/margin 的每个 rpx token），故 16/24/40 偏大。两口径下 **20rpx 都是梯外最高频之一**，结论一致。差异标注如下：首值口径 16=133/24=125/40=39/20=132，全值口径 16=173/24=194/40=66/20=177。

### 4.3 圆角硬编码

| 值 | 次数 | 在新代 zy-radius 梯子内？ |
|----|------|--------------------------|
| 16rpx | 34 | ✓（zy-radius-lg） |
| 24rpx | 30 | ✓（zy-radius-2xl） |
| 2rpx | 26 | ✗（无） |
| 4rpx | 24 | ✅ **A-1 已补 `--zy-radius-xs: 4rpx`** |
| 12rpx | 13 | ✓（zy-radius-md/pill） |
| 3rpx | 10 | ✗（无） |
| 32rpx | 10 | ✓（zy-radius-3xl） |
| 8rpx | 8 | ✓（zy-radius-sm） |
| 9999rpx | 5 | ✗（仅作 var 兜底，非生效值，见 §7 风险） |
| **合计** | **153** | |

> ✅ **A-1 已补档 xs=4rpx**。剩余梯外 2rpx(26)/3rpx(10) 为细线型微圆角（非标准档，吸附 4rpx 或保留硬编码，A-2 裁定）。

### 4.4 补档后的新代完整梯子草案 → ✅ A-1 已落地

按频次优先级（频次高 = 开发者手写习惯 = 建议补档进新代，而非吸附）：
**A-1 已落地 6 档**（见下，theme-teal.wxss 与 design-tokens.json 双源同步，全部 0 消费零渲染）。

**字号 `--zy-fs-*`（A-1 实际补 3 档）**：
```
--zy-fs-display: 60rpx; --zy-fs-h1: 48rpx; --zy-fs-h2: 40rpx;
--zy-fs-h3: 34rpx; --zy-fs-body: 30rpx;
--zy-fs-md: 28rpx;      /* ✅ A-1 已补：硬编码 186 处 + 旧 --font-size-sm 迁移目标 */
--zy-fs-sm: 26rpx;
--zy-fs-xs-lg: 24rpx;   /* ✅ A-1 已补：硬编码 199 处（TOP1）+ 旧 --font-size-xs 迁移目标 */
--zy-fs-xs: 22rpx;
--zy-fs-2xs: 20rpx;     /* ✅ A-1 已补：硬编码 93 处 + 旧 --font-size-xxs 迁移目标 */
```
> 未补：18/36/32rpx（合计 81 处中低频）按映射表吸附最近档（18→22、36→34/40、32→30/34）。

**间距 `--zy-space-*`（A-1 实际补 2 档）**：
```
--zy-space-2xs: 4rpx; --zy-space-xs: 8rpx; --zy-space-sm: 16rpx;
--zy-space-sm2: 20rpx;  /* ✅ A-1 已补：硬编码 177 处 + 旧 --spacing-sm 迁移目标 */
--zy-space-md: 24rpx;
--zy-space-lg: 40rpx;   --zy-space-xl: 64rpx;
--zy-space-2xl: 96rpx;  --zy-space-3xl: 128rpx;
--zy-space-4xl: 200rpx; /* ✅ A-1 已补：旧 --spacing-xxxxxl 2 处 + 硬编码 200rpx×11 */
```
> 12/32/48 为中频（98/132/99），可吸附到相邻档（12→16、32→40、48→40）或按需补档（A-2 裁定）。
> ⚠ **方向性提示**：12→16 更松、32→40 更松、48→40 更紧凑。若追求「Haute-Luxury 更大更松」，32 补 40、48 可补一档 48 或吸附 64（更松）。

**圆角 `--zy-radius-*`（A-1 实际补 1 档）**：
```
--zy-radius-xs: 4rpx;  /* ✅ A-1 已补：覆盖旧 xs 38 处 + 硬编码 4rpx 24 处 → 圆角实现全零动版 */
--zy-radius-sm: 8rpx; --zy-radius-md: 12rpx; --zy-radius-lg: 16rpx;
--zy-radius-xl: 20rpx; --zy-radius-2xl: 24rpx; --zy-radius-3xl: 32rpx;
--zy-radius-pill: 12rpx;
```

---

## 5. feeding 4 页旧代消费统计（弃用方式数据）

### 5.1 feeding 子包页面清单（app.json 注册 7 页）

| 页面 | 有 wxss? | 旧代消费 | 内容状态 |
|------|---------|---------|---------|
| feeder-detail | ❌ | 0 | **空壳**（纯注释占位 wxml） |
| groomer-list | ❌ | 0 | **空壳** |
| groomer-detail | ❌ | 0 | **空壳** |
| order-confirm | ❌ | 0 | **空壳** |
| service-detail | ✅ | 31（14 间距 + 17 圆角） | **活页** |
| confirm-service | ✅ | 39（16 间距 + 23 圆角） | **活页** |
| order-status | ✅ | 0 | **活页**（旧代 0，但有硬编码） |

### 5.2 feeding 旧代消费明细（3 个 wxss 共 70 处）

| 文件 | 间距 | 圆角 | 字号 | 小计 |
|------|------|------|------|------|
| confirm-service.wxss | 16 | 23 | 0 | 39 |
| service-detail.wxss | 14 | 17 | 0 | 31 |
| order-status.wxss | 0 | 0 | 0 | 0 |
| **合计** | 30 | 40 | 0 | **70** |

具体令牌：spacing-lg×23、spacing-md×4、spacing-xl×2、spacing-sm×1；radius-lg×12、radius-sm×11、radius-md×5、radius-2xl×5、radius-xs×4、radius-full×3。

### 5.3 注册与入口现状

- **app.json 注册**：feeding 子包仍注册（root: `subpackages/feeding`，7 页全在 pages 列表）。
- **tabBar**：不在 tabBar（custom tabBar 5 项 = home/quick-register/discover/service/profile）。
- **外部跳转入口**（3 个活页被外部引用，不可废弃）：
  - `pages/home/index.js:305` → `feeding/confirm-service`
  - `pages/service/index.js:157/163/169` → `feeding/service-detail?tab=0/1/2`
  - `subpackages/booking/pet-select.js:367` → `feeding/confirm-service`
  - `subpackages/profile/order-stats/index.js:508` → `feeding/order-status`
- **4 个空壳页**：无任何外部跳转（仅自身文件内注释），可从 app.json 摘除，**0 断链**。

### 5.4 结论（给 lead 决策）

| 方案 | 断链点数 | 说明 |
|------|---------|------|
| **移除 4 个空壳页入口**（feeder-detail/groomer-list/groomer-detail/order-confirm） | **0 处** | 无 wxss 无旧代消费，直接从 app.json 摘除即可 |
| **feeding 3 个活页仍迁移**（service-detail/confirm-service/order-status） | 需迁移 **70 处** | 仍被 4 个外部页面跳转引用，不可废弃 |
| 若整个 feeding 子包废弃 | 摘除 7 页 | 需同步移除 pages/home、pages/service、booking/pet-select、profile/order-stats 的跳转入口（4 处 js + 对应 UI） |

> **建议**：采纳「4 空壳摘除 + 3 活页迁移」。4 空壳摘除后，feeding 子包旧代消费从 70 降到 70（3 活页不变），但**废弃边界从「整个子包」收窄为「4 个空壳页」**，迁移工作量 70 处仍需执行。

---

## 6. 废弃边界裁定建议

### 6.1 明确废弃（有新代对应的旧前缀族）→ ✅ A-3 已执行

| 旧代族 | 消费 | 新代对应 | 备注 |
|--------|------|---------|------|
| `--spacing-*` | 340 | `--zy-space-*` | ✅ 已迁移（A-2-2）+ 定义已删（A-3，12 行） |
| `--border-radius-*` | 320 | `--zy-radius-*` | ✅ 已迁移（A-2-1，全零动版）+ 定义已删（A-3，10 行） |
| `--font-size-*` | 12 | `--zy-fs-*` | ✅ 已迁移（A-2-1）+ 定义已删（A-3，8 行） |

> ✅ **A-3 退役完成（2026-08-04）**：theme-teal.wxss 中三族共 30 行定义已删除（各加退役注释），全仓旧前缀消费 0 处、定义 0 行。

### 6.2 明确保留（非前缀活令牌，无新旧之分，迁移伤筋动骨）

| 令牌族 | 消费 | 理由 |
|--------|------|------|
| `--text-primary/secondary/tertiary` | 334/228/291 | 唯一语义文字体系，zy-text-* 仅 0-2 消费，合并收益极低、风险高 |
| `--primary-color` 等 `--primary-*` | 139+ | **无 zy-primary 等价语义**（见 6.3） |
| `--card-color/cream` | 190/75 | 唯一卡片体系 |
| `--gradient-primary/secondary` | 62+ | 渐变体系 |
| `--status-*` / `--wash-*` | 6+ | 状态语义体系 |
| `--background-color` / `--border-color` / `--divider-color` | 80/45/72 | 全局底/线 |
| `--font-sans/serif/regular` 等字体栈 | 248/64/… | 字体栈非新旧之争 |

### 6.3 需裁定：`--primary-color` vs `--zy-primary-*`

**结论建议：保留 `--primary-color`，不并入 `--zy-primary-*`。**

理由（实测证据）：
1. **暗色态行为不同**：`--primary-color` 在 `.theme-dark` 中翻转为 `#3D6B3D`（L406）；而 `--zy-primary-700` **在 .theme-dark 中无覆盖**（grep 确认 .theme-dark 块无任何 zy-primary 声明）→ 若把 139 处 `--primary-color` 全改 `--zy-primary-700`，**暗色模式下品牌色全部丢失翻转**，是真实的功能回归。
2. **消费量悬殊**：`--primary-color` 139 处 vs `--zy-primary-700` 2 处。以 2 处的新代去吞 139 处的活体，方向反了。
3. `--primary-color` 是「品牌锚点」语义，`--zy-primary-700` 是「色阶 700 档」语义——不同抽象层级。
4. **若 DADDY 坚持统一**：必须先给 `--zy-primary-*` 补 `.theme-dark` 覆盖（`--zy-primary-700: #3D6B3D` 等），且设计为「zy-primary 是唯一色阶、primary-color 是语义别名」双轨，工作量显著大于保留。

### 6.4 需检查：`--text-tertiary` 是否有 zy 对应

- `--text-tertiary`（消费 291）有 `--zy-text-3` 对应（消费 0）。
- **⚠ 并发变更**：审计期间 prototype-builder-2 已将 `--text-tertiary` 从 `#9E9889` 改为 `#736D5F`（AA 修复），而 `--zy-text-3` 仍为 `#9E9889`（未同步）→ **两者值已分叉**。
- 建议：与 prototype-builder-2 协调——要么把 `--zy-text-3` 同步为 `#736D5F` 保持一致，要么干脆废弃 `--zy-text-3`（0 消费，无迁移成本）。**不推荐把 291 处 text-tertiary 迁到 zy-text-3**（高成本低收益 + 暗色态 zy-text-3 虽有覆盖但值需同步）。

### 6.5 第三方组件库私有令牌（明确排除）

`--picker-*` / `--cell-*` / `--uploader-*` / `--step-*` 等：全仓项目自有 wxss **grep 0 命中**（只在 miniprogram_npm 内部），**不在迁移范围**。✓ 已排除。

---

## 7. 风险清单与迁移顺序

### 7.1 动版范围估算

| 族 | 动版处数 | 涉及页面 | 视觉方向 |
|----|---------|---------|---------|
| spacing | 307/340（90%，含 2 处缺档吸附） | 全仓 30+ 页面，Top：discover(22)/activity.detail(21)/activity.list(20)/activity.register(18)/pet.common(17)/pages.service(17)/feeding.confirm(16) | 32→40 更松、48→40 更紧凑、20→16 更紧凑、12→16 更松 |
| radius | 0（若补档 xs）/ 38（若不补） | 不补档时：profile(25 处中的 xs)/activity.register/feeding 等 | 4→8 更圆 |
| font-size | 10 处（7 值变 + 3 缺档吸附） | 全部在 app.wxss（全局基础排版） | 36→34/28→26/24→22 略小 |
| **合计** | **317 处**（radius 补档）/ **355 处**（radius 不补档） | | |

> 真实影响面可能更大：app.wxss 的全局类（.btn/.input/.status-badge 等）字号变化会传导到所有页面。建议迁移后全仓截图回归。

### 7.2 迁移顺序建议

1. ✅ **补档新代（A-1 已完成）**：`--zy-radius-xs:4rpx`、`--zy-fs-md:28rpx/--zy-fs-xs-lg:24rpx/--zy-fs-2xs:20rpx`、`--zy-space-sm2:20rpx/--zy-space-4xl:200rpx` 已落地（theme-teal + json 双源），新代梯子已具备覆盖能力
2. ✅ **radius 族迁移（A-2-1 已完成）**：320 处 `var(--border-radius-*)` → `var(--zy-radius-*)` 全零动版，58 个文件；5 处 9999rpx fallback 已清除（→ `var(--zy-radius-pill)` 无兜底）
3. ✅ **font-size 族迁移（A-2-1 已完成）**：12 处 `var(--font-size-*)` → `var(--zy-fs-*)` 全在 app.wxss；`--font-size-lg`(h3) 36→34 唯一动版已落地
4. ✅ **spacing 族迁移（A-2-2 已完成）**：340 处 `var(--spacing-*)` → `var(--zy-space-*)`，30 文件；动版 265 处（xs 12→16 / md 32→40 / lg 48→40）+ 同值 75 处零视觉
5. ✅ **spacing fallback 清理（A-2-2 已完成）**：30 处 `var(--spacing-*, 值)` 随迁全部清除（无兜底）；`--page-padding`/`--section-gap`/`--card-padding` 为非前缀保留令牌，未动
6. ✅ **删除旧代定义（A-3 已完成）**：theme-teal 中旧前缀定义 30 行（--spacing-* 12 + --border-radius-* 10 + --font-size-* 8）已删，各加退役注释；variables.wxss 的 `--radius-lg: 32rpx` 为 web-admin 专用（5 处引用）按 §6 边界保留（非本族）；`--zy-text-3` 按 lead 裁定保留（不删）
7. ✅ **守卫真相源核验（A-3 已完成）**：见 7.3 —— 规则 D 仅检色值 fallback（已全清）故无误报；规则 C 随 TOKEN_DEFS 自动消隐；删定义后守卫仍 PASS（桶② 54 不变）

### 7.3 守卫影响（lint-tokens.js 观测结论，不改脚本）

- **规则 B 桶①/桶② 的真相源** = `LEGACY_HEX`/`LEGACY_RGB` 黑名单（旧橄榄绿/teal 色坐标）+ `LEGACY_TOKEN_LAYER`（定义层判定）。
- **关键**：规则 B 拦截的是**旧色坐标**（`#4F5E35`/`#1976D2` 等），**与 `--spacing-*`/`--border-radius-*`/`--font-size-*` 旧前缀令牌族无关**。守卫的「旧坐标」≠「旧前缀令牌」。
- **旧代删除后桶①判定是否需要改？** **不需要**。桶① 判定依赖 `LEGACY_TOKEN_LAYER`（variables/design-tokens/theme-teal 三个文件路径）+ theme-teal 覆盖关系，与 spacing/radius/font-size 前缀无关。删除旧前缀定义不影响桶①逻辑。
- **规则 D（兜底一致性）实测结论（A-3）**：规则 D 仅在 `isCssColor(fb.value)`（色值兜底）时触发（L414）。旧代 spacing/radius/font-size 的兜底值全是 rpx 数值、非色值，且 A-2-1/A-2-2 已全部清除（90 处归零）→ **删旧代定义不会触发规则 D 误报**。实测：A-3 删除 30 行定义后守卫仍 PASS、桶② 54 不变。`TOKEN_FINAL` 中不再含旧令牌，规则 C 同名冲突自动消隐（0 冲突）。
- **补充**：`--zy-fs-*` 的 `-w`/`-lh` 伴随变量（一行多声明）已被守卫 CSS 解析器正确识别（verify-token-cascade 共享实现）。

### 7.4 其他风险

| 风险 | 等级 | 说明 |
|------|------|------|
| 暗色态品牌色丢失 | **高** | 若错误地把 `--primary-color` 并入 `--zy-primary-700`（见 6.3） |
| fallback 退回胶囊 | ~~**高**~~ → ✅ **已解除（A-2-1）** | 5 处 `var(--border-radius-full/pill, 9999rpx)` 已清除 → `var(--zy-radius-pill)` 无兜底；grep 9999rpx fallback = 0。剩余 2 处 9999rpx 为合法非兜底（zy-calendar max-height / variables `--lux-radius-pill` 定义），保留 |
| design-tokens.json 与 theme-teal 分叉 | ~~中~~ → ✅ **已解除（A-1）** | typography.scale 已对齐运行时 zy-fs，旧分叉消除 |
| 删定义后守卫误报 | ~~中~~ → ✅ **已解除（A-3）** | 规则 D 仅检色值 fallback（已全清），规则 C 随 TOKEN_DEFS 消隐；实测删 30 行后守卫仍 PASS、桶② 54 不变 |
| 并发编辑 | 中 | prototype-builder-2 正在改 theme-teal（text-tertiary/error-color），迁移与 AA 修复需同步避免双改冲突 |
| spacing 动版影响面 | 中 | A-1 补档后 78%（265 处）会动，需全仓视觉回归（A-2-2 已列抽查点 §7.5） |
| web-admin 侧 | 低 | `--radius-lg: 32rpx`（variables.wxss）仅 web-admin(Vue) 引用，小程序侧 0 消费，按边界保留 |

---

### 7.5 动版影响面清单（A-2-2，265 处动版）

系统性间距变化，供 DADDY 抽查依据。三档动版按影响文件 Top 列出，每档附高风险抽查点。

**档位 ① md 32→40（147 处，更松 +8）—— 最大动版档**

| 影响文件 Top10 | 动版处数 |
|---------------|---------|
| subpackages/booking/confirm.wxss | 14 |
| subpackages/activity/detail.wxss | 12 |
| subpackages/activity/list.wxss | 9 |
| pages/discover/index.wxss | 9 |
| subpackages/activity/payment.wxss | 8 |
| subpackages/mall/cart.wxss | 7 |
| pages/service/index.wxss | 7 |
| subpackages/activity/register.wxss | 6 |
| subpackages/activity/my-registered.wxss | 6 |
| subpackages/search/index.wxss | 5 |

**档位 ② lg 48→40（105 处，更紧凑 -8）**

| 影响文件 Top10 | 动版处数 |
|---------------|---------|
| subpackages/feeding/confirm-service.wxss | 14 |
| subpackages/activity/register.wxss | 11 |
| subpackages/feeding/service-detail.wxss | 9 |
| subpackages/activity/detail.wxss | 8 |
| subpackages/activity/list.wxss | 6 |
| pages/home/index.wxss | 6 |
| pages/discover/index.wxss | 6 |
| subpackages/booking/pet-select.wxss | 5 |
| subpackages/pet/common.wxss | 4 |
| subpackages/other/address/index.wxss | 4 |

**档位 ③ xs 12→16（13 处，更松 +4）**

| 影响文件 | 动版处数 |
|---------|---------|
| subpackages/pet/list.wxss | 4 |
| pages/discover/index.wxss | 3 |
| subpackages/pet/common.wxss | 1 |
| subpackages/activity/my-registered.wxss | 1 |
| subpackages/activity/list.wxss | 1 |
| subpackages/activity/detail.wxss | 1 |
| pages/service/index.wxss | 1 |
| app.wxss | 1 |

**高风险抽查点（判断逻辑：padding 增大有裁剪风险 / margin 变化有重叠风险）**

| # | 位置 | 变化 | 风险判断 |
|---|------|------|---------|
| 1 | app.wxss L103 `.btn` | padding 32/64 → **40/64**（垂直 +8 更松） | 主按钮垂直变高，若按钮有固定 height 需复核文字/图标是否溢出；**低风险**（按钮多为自适应高度） |
| 2 | app.wxss L164 `.input` | padding 32/48 → **40/40**（垂直 +8、**水平 -8**） | 输入框水平内边距收窄 8rpx，光标/占位符更贴边；**中风险**——需真机确认首尾文字不贴边框 |
| 3 | app.wxss L193 `.list-item` | padding 32/48 → **40/40**（水平 -8） | 列表项内容水平收窄 8rpx，长文本换行位置变化；**中风险**——需确认不触发截断（.truncate 场景） |
| 4 | pages/quick-register/index.wxss L86/133/195 | padding 32 → **40**（+8） | 表单区块内边距增大，若容器有固定高度可能挤压相邻元素；**低风险** |
| 5 | subpackages/feeding/confirm-service.wxss（lg×14 密集） | margin/padding 48 → **40**（-8） | 段落/卡片间距收窄 8rpx，页面整体更紧凑；**低风险**——但该页为高改动密度页，建议整页截图对比 |
| 6 | pages/discover/index.wxss L123 | padding `lg + page-padding + calc(xl + safe-area)` | 动版档与 safe-area calc 叠加，底部留白变化；**中风险**——需真机确认底部安全区表现 |
| 7 | pages/home/index.wxss L534/607 | margin-right 48 → **40**（-8） | 横向间距收窄，多卡片/图标并排可能变紧；**低风险**——若为 flex gap 布局需复核 |
| 8 | app.wxss L300 `.kicker` | margin-bottom xs 12 → **sm 16**（+4 更松） | 小标题下间距变大，标题与正文距离增加；**低风险**（符合「更大更松」方向） |

**抽查优先级建议**：真机/模拟器重点看 #2（input 水平收窄）、#3（list-item 截断）、#6（safe-area 叠加）；其余低风险项可在整页截图回归中覆盖。同值档 75 处（sm/xl/xxl/xxxl/xxxxxl）零视觉，无需抽查。

---

## 附：实测命令口径说明（供复核）

- 消费统计：`grep -rhoE "var\(--TOKEN"` 在 app.wxss/custom-tab-bar/components/pages/subpackages/styles 下，去 node_modules/miniprogram_npm/scripts/deliverables。
- 硬编码字号/间距：先 `perl -0777 -pe 's{/\*.*?\*/}{}gs'` 去注释，再按属性抽取 rpx 值。
- 间距硬编码双口径：首值位（shorthand 第一个值）vs 全值位（多值每个 token）。lead 提供的是首值位，我补充全值位，结论一致。
- feeding 计数按 `grep -oE` 出现次数（非行数），与 lead 的「confirm-service 35 行 / service-detail 28 行」口径不同：我实测 39/31 处。
