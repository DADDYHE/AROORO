# tabBar 规格三方分裂审计 · 收敛方案与验证

> 任务：#14「tabBar 规格三方分裂」
> 日期：2026-08-04
> 项目：微信小程序 AROORO（/Users/yy/Documents/trae_projects/zuoyou）
> 关联交付物：`01-component-selfcontain.patch`、`02-theme-teal-retire.patch`、`audit-scan.js`、`geometry-derive.js`、`verify-zero-visual-change.js`

---

## 1. 问题概述

底部导航栏（tabBar）的规格同时存在三份来源，且彼此分裂：

| 来源 | 文件 | 角色 |
|------|------|------|
| A. 设计令牌 | `styles/theme-teal.wxss`（原 L253-275，并发编辑后 L264-286） | 深森林绿体系的 `--zy-tabbar-*` 事实定义层 |
| B. 规格文件 | `design-tokens.json` → `tabBar` 块 | 与 A 的取值「大多一致」的静态规格 |
| C. 渲染实现 | `custom-tab-bar/index.wxss` | 实际渲染的硬编码几何值 |

### 成因

- **token 化 spec 只覆盖色彩维度**：`--zy-tabbar-*` 家族虽然定义了 height/bg/border/item/center 等 21 个令牌，但其中的**几何量（center-d、protrusion、center-bottom、icon-size 等）从未被组件消费**——组件按自己的一套旧硬编码几何值渲染（中心按钮 104rpx / margin-top -48rpx / 图标 40rpx），与两份规格（112rpx / 36rpx / 52rpx）不一致。
- **组件是唯一实现，却未被纳入 spec**：`app.json` 第 17-18 行 `"tabBar": { "custom": true }` 确认 tabBar 由 `custom-tab-bar/` 组件全权渲染；组件作者按旧稿硬编码几何，未回写 spec，spec 因此成为「好看但没人读」的平行宇宙。
- **死规格长期无人清理**：21 个 `--zy-tabbar-*` 中仅 4 个有真实消费点，其余 17 个是零消费死值，持续误导后续维护者以为 spec 具备权威性。

### 分裂的具体表现

| 维度 | 两份规格（teal = json） | 组件实际渲染 | 是否一致 |
|------|------------------------|--------------|----------|
| 中心按钮直径 | 112rpx（`--zy-tabbar-center-d`） | 104rpx（`.center-button` width/height） | ❌ |
| 中心按钮上沿外露 | 36rpx（`--zy-tabbar-center-protrusion`） | 实际约 19.5rpx（见 `geometry-derive.js`） | ❌ |
| 中心按钮图标 | 52rpx（`--zy-tabbar-center-icon-size`） | 40rpx（`.center-button-icon`） | ❌ |
| 图标尺寸 | 44rpx（`--zy-tabbar-icon-size`） | 40rpx（`.tab-bar-icon`） | ❌ |
| 文字尺寸 | 20rpx（`--zy-tabbar-label-size`） | 18rpx（`.tab-bar-text`） | ❌ |

---

## 2. 三方对照表

以下为 `audit-scan.js` 实测输出（扫描 `styles/theme-teal.wxss` 定义 × `design-tokens.json` × 全仓 `var()` 消费，跳过 node_modules/miniprogram_npm/deliverables 等），并叠加手工核查的 `--zy-shadow-float-tabbar`（audit-scan.js 正则不含该令牌，见附录 A）。**21 个 `--zy-tabbar-*` + 转引令牌 `--zy-shadow-fab` + 重复死值 `--zy-shadow-float-tabbar`，共 23 个全部退役；活体 4 个（被 01 全覆盖）、死规格 19 个。**

| # | 令牌 | theme-teal 值 (L#) | design-tokens.json 值 | 消费点 | 状态 |
|---|------|--------------------|----------------------|--------|------|
| 1 | `--zy-tabbar-height` | 104rpx (L254) | `tabBar.height` 104rpx | — | 死 |
| 2 | `--zy-tabbar-safe-bottom` | env(safe-area-inset-bottom, 0px) (L255) | `tabBar.safeBottom` 同 | — | 死 |
| 3 | `--zy-tabbar-total-height` | calc(104rpx + env(...)) (L256) | `tabBar.totalHeight` 同 | — | 死 |
| 4 | `--zy-tabbar-bg` | rgba(255,255,255,0.96) (L257) | `tabBar.bg` 同 | — | 死 |
| 5 | `--zy-tabbar-bg-glass` | rgba(255,255,255,0.92) (L258) | `tabBar.bgGlass` 同 | — | 死 |
| 6 | `--zy-tabbar-blur` | 20px (L259) | `tabBar.blur` 同 | — | 死 |
| 7 | `--zy-tabbar-border-top` | 1rpx solid rgba(26,26,23,0.06) (L260) | `tabBar.borderTop` 同 | `custom-tab-bar/index.wxss:76` | **活** |
| 8 | `--zy-tabbar-item-active` | #1F3A1F (L261) | `tabBar.itemActive` 同 | `custom-tab-bar/index.wxss:201` | **活** |
| 9 | `--zy-tabbar-item-inactive` | #9E9889 (L262) | `tabBar.itemInactive` 同 | `custom-tab-bar/index.wxss:192` | **活** |
| 10 | `--zy-tabbar-item-active-bg` | transparent (L263) | `tabBar.itemActiveBg` 同 | — | 死 |
| 11 | `--zy-tabbar-icon-size` | 44rpx (L264) | `tabBar.iconSize` 同 | — | 死 |
| 12 | `--zy-tabbar-label-size` | 20rpx (L265) | `tabBar.labelSize` 同 | — | 死 |
| 13 | `--zy-tabbar-label-weight` | 400 (L266) | `tabBar.labelWeight` 400 | — | 死 |
| 14 | `--zy-tabbar-label-weight-active` | 500 (L267) | `tabBar.labelWeightActive` 500 | — | 死 |
| 15 | `--zy-tabbar-center-d` | 112rpx (L268) | `tabBar.center.diameter` 同 | — | 死 |
| 16 | `--zy-tabbar-center-protrusion` | 36rpx (L269) | `tabBar.center.protrusion` 同 | — | 死 |
| 17 | `--zy-tabbar-center-bottom` | calc(env(...)+24rpx) (L270) | `tabBar.center.bottom` 同 | — | 死 |
| 18 | `--zy-tabbar-center-icon-size` | 52rpx (L271) | `tabBar.center.iconSize` 同 | — | 死 |
| 19 | `--zy-tabbar-center-grad` | linear-gradient(180deg, #2D4F2D 0%, #0F2410 100%) (L272) | `tabBar.center.gradient` 同 | `custom-tab-bar/index.wxss:229` | **活** |
| 20 | `--zy-tabbar-center-icon` | #F7F5EF (L273) | `tabBar.center.iconColor` 同 | — | 死 |
| 21 | `--zy-tabbar-center-shadow` | 0 8rpx 24rpx rgba(31,58,31,0.25), 0 2rpx 8rpx rgba(31,58,31,0.15) (L274) | `tabBar.center.shadow` 同 | — | 死（仅被 #22 转引） |
| 22 | `--zy-shadow-fab` | var(--zy-tabbar-center-shadow) (L310→L321) | `shadow.fab` = 字面值 | — | 死（转引令牌，无终端消费） |
| 23 | `--zy-shadow-float-tabbar` | 0 -2rpx 24rpx rgba(26,26,23,0.06) (L275→L286) | `shadow.floatTabBar` 同 | — | 死（与 `--shadow-float` L253 逐字重复，见 5.2） |

**规格自洽性**：teal 与 json 的 22 个对应值中，仅 `--zy-shadow-fab` 一处「分歧」——teal 是 `var(--zy-tabbar-center-shadow)` 转引写法，json 是展开字面值，二者语义等价；其余全部逐字一致。即**两份规格内部自洽（分歧数 1，实为写法差异），但都不代表渲染事实**——这正是「spec 自洽 ≠ 与渲染一致」的典型样本。（注：L# 括号内为 2026-08-04 并发编辑 `--text-on-accent` 加入后的当前行号，括号外为审计时原始行号；audit-scan.js 输出的消费点行号未受影响。）

**几何真值（`geometry-derive.js`）**：中心按钮直径 104rpx、margin-top -48rpx，实际外露量 ≈ **19.5rpx**，与规格 protrusion 36rpx 相差 16.5rpx。若真要达成 36rpx 外露，margin-top 需改为 ≈ -81rpx（校验上沿 -36rpx），与当前相差 33rpx——**属改版，不是校准**。

---

## 3. 收敛方案对比

### 方案 A（选定）：删死令牌，保 `--tb-*` 本地令牌

- `01-component-selfcontain.patch`：组件 4 处 `var(--zy-tabbar-*)` 消费点就地收敛——
  - `--zy-tabbar-border-top` → 新增本地 `--tb-bar-border: 1rpx solid rgba(26, 26, 23, 0.06)`。**不引 `--hairline`**：全局发丝线是 `rgba(26,26,23,0.08)`，与 0.06 非同值，必须本地声明保证零外观改变。
  - `--zy-tabbar-item-inactive` → `var(--text-tertiary)`（同值 #9E9889，亮色逐字一致）
  - `--zy-tabbar-item-active` → `var(--primary-color)`（同值 #1F3A1F）
  - `--zy-tabbar-center-grad` → `var(--gradient-primary)`（逐字同值 `linear-gradient(180deg, #2D4F2D 0%, #0F2410 100%)`）
- `02-theme-teal-retire.patch`：删除 theme-teal 中 21 个 `--zy-tabbar-*`、转引令牌 `--zy-shadow-fab` 及重复死值 `--zy-shadow-float-tabbar`（共 23 个），原地替换为退役注释；`--zy-shadow-float-tabbar` 的值由通用 `--shadow-float`（已有 2 个活体消费点）承担，见 5.2。

### 方案 B（放弃）：校准 112→104 后「接线」

即修正 spec 几何值（center-d 112→104 等）对齐渲染事实，再让组件消费这些全局令牌。

**为什么 A 优于 B：**

1. **专用几何值不该进全局命名空间**。margin-top、protrusion、center-bottom、icon-size 是单个组件的渲染细节，不是设计系统可复用的语义令牌；放进 `--zy-*` 全局族，只会让「设计令牌」混入「实现参数」。
2. **组件是全仓唯一实现**（`app.json` `tabBar.custom=true`），不存在跨组件复用需求——没有第二处要读这些令牌，全局化零收益。
3. **root-portal 搬出宿主子树**。组件 WXML 用 `<root-portal>` 包裹，子树被搬出宿主节点后 `:host` 上的自定义属性无法继承进来（组件内注释明确记录），令牌必须声明在 portal 子树根 `.tab-bar` 上——本地 `--tb-*` 恰好落在此处，**就地声明比全局声明更可靠**。
4. **16 个死规格是纯污染**。B 方案继续把它们留在全局，等于保留「权威但无人消费」的平行宇宙，误导依旧。
5. **B 要动渲染且把专用值焊进全局**。protrusion 是 margin-top 的**派生量**而非独立参数（geometry-derive.js 证明：即便校准 center-d，protrusion=36rpx 与实际 19.5rpx 仍不符；要真 36rpx 需 margin-top -81rpx，属改版）。「接线」要么改渲染（视觉变化），要么把一组仍对不上的几何值焊进全局——两头不讨好。

---

## 4. 验证章节

### 复现方式（三步）

```bash
# ① 构建临时干净环境（不碰生产文件）
mkdir -p /tmp/tbwork && cp -R /Users/yy/Documents/trae_projects/zuoyou /tmp/tbwork/mod
cd /tmp/tbwork/mod && rm -rf .git   # 或 git worktree add /tmp/tbwork/mod <branch>

# ② 依次应用两个补丁（先 --check 再实际 apply）
git apply --check /Users/yy/Documents/trae_projects/zuoyou/deliverables/tabbar-convergence/01-component-selfcontain.patch
git apply --check /Users/yy/Documents/trae_projects/zuoyou/deliverables/tabbar-convergence/02-theme-teal-retire.patch
git apply /Users/yy/Documents/trae_projects/zuoyou/deliverables/tabbar-convergence/01-component-selfcontain.patch
git apply /Users/yy/Documents/trae_projects/zuoyou/deliverables/tabbar-convergence/02-theme-teal-retire.patch

# ③ 零外观改变验证（脚本内部读 /tmp/tbwork/mod 作为改后样本）
node /Users/yy/Documents/trae_projects/zuoyou/deliverables/tabbar-convergence/verify-zero-visual-change.js
```

### lead 独立验证结果（2026-08-04，写入本文件如实引用）

1. **01+02 在临时环境（/tmp/tbwork/mod）`git apply --check` 通过、干净应用**——补丁上下文匹配，无冲突。
2. **apply 后全仓 `var(--zy-tabbar-*)` 零残留**——唯一命中是退役注释文本，非代码消费。
3. **verify 脚本实测：亮色 `page{}`（线上唯一可达模式）16 条声明 0 差异**——零外观改变成立。
4. **dark 模式（`.theme-dark` 当前未挂载）2 条差异**：
   - `.tab-bar-text`：#9E9889 → #6E6A5E
   - `.active .tab-bar-text`：#1F3A1F → #3D6B3D
   这是 `--text-tertiary`（dark `#6E6A5E`，theme-teal L405）/ `--primary-color`（dark `#3D6B3D`，L395）的 dark 值接管，属「随主题联动」的**预期改进，非回归**。一旦未来挂载 `.theme-dark`，tabBar 文字颜色会自动跟随主题——这正是收敛后获得的联动能力。
5. **audit-scan.js 确认活体恰 4 处且被 01 全覆盖，02 删除安全**（见第 2 节对照表 7/8/9/19 行）。

### 修订版 02 复验（--zy-shadow-float-tabbar 退役后 · 2026-08-04）

lead 拍板将 `--zy-shadow-float-tabbar` 一并退役后，02 patch 已修订（退役清单 21 + 1 + 1 = 23 个，并针对并发编辑后的行号重新生成 hunk）。重建 /tmp/tbwork/mod 复验结果：

1. **01 + 修订版 02 在重建的 /tmp/tbwork/mod 中 `git apply --check` 通过、干净应用**（hunk 行号 `@@ -261,29` / `@@ -318,7` 与当前工作区一致）。
2. **apply 后全仓 `var(--zy-tabbar-*)`、`var(--zy-shadow-fab)`、`var(--zy-shadow-float-tabbar)` 三族零残留**（grep 无任何代码命中；唯一文本命中是退役注释本身）。
3. **verify 脚本结果不变**：亮色 `page{}` 16 条声明 0 差异（零外观改变成立）；dark 模式仍为同 2 条主题联动差异（见上节第 4 条）。float-tabbar 退役不影响级联解析（其值本就无消费方）。

### 结论

亮色（线上唯一可达）零外观改变成立；dark 是主题联动的行为增强而非外观回归。**收敛方案 A 可安全落地。**

---

## 5. 遗留项

### 5.1 json `shadow.fab` 随 teal 定义退役 → 孤儿规格（已标注）

`design-tokens.json` 的 `shadow.fab` 值随 `--zy-shadow-fab` 删除后无真相源、无代码生成消费方，保留值不传导运行时。
**状态：已处理。** json 内 `_fabNote` 已标注「已退役（2026-08-04 #14 裁定）……保留仅供档案」，无需再改。

### 5.2 `--zy-shadow-float-tabbar` 核查 → 零消费，已裁定退役

按要求对全仓执行 `var(--zy-shadow-float-tabbar)` 扫描（含 .wxss/.wxml/.js/.json/.ts/.wxs/.css/.html，排除 node_modules/miniprogram_npm/deliverables）：

**消费点：0 处。**

全仓命中仅 4 行，且均非消费：
- `styles/theme-teal.wxss:275` —— 定义本身 `--zy-shadow-float-tabbar: 0 -2rpx 24rpx rgba(26, 26, 23, 0.06);`（并发编辑后移位至 L286）
- `docs-archive/legacy-coordinate-audit.md:413` —— 归档文档（.md，非代码）
- `.workbuddy/memory/2026-08-04.md:179` —— 记忆文件（.md，非代码）
- `deliverables/tabbar-convergence/02-theme-teal-retire.patch` —— 本交付物补丁文本（修订前版本保留该行；修订版已删除）

**补充事实**：其值 `0 -2rpx 24rpx rgba(26, 26, 23, 0.06)` 与通用令牌 `--shadow-float`（theme-teal L242，并发编辑后 L253）**逐字相同**，而 `--shadow-float` 有 2 个活体消费点：
- `subpackages/partner/activity-create/index.wxss:287`
- `subpackages/partner/common.wxss:766`

**结论（lead 2026-08-04 拍板）：`--zy-shadow-float-tabbar` 一并退役。** 0 消费的死码 + 与活令牌 `--shadow-float` 逐字重复，保留它毫无理由，还会继续误导后来人以为它是 tabBar 专用阴影。**已同步修订 `02-theme-teal-retire.patch`**：退役清单变为 21 个 `--zy-tabbar-*` + `--zy-shadow-fab` + `--zy-shadow-float-tabbar` = 23 个（见第 4 节「修订版 02 复验」）。json `shadow.floatTabBar` 同值，已由 lead 在 json 侧加 `_floatTabBarNote` 标注「已退役」，无需再改。

### 5.3 theme-teal 并发编辑协调

`styles/theme-teal.wxss` 当前被另一执行者占用编辑（`--text-on-accent` 已新增于 L57）。02 patch 的 hunk 位于 TabBar 专用区块（现 L264-286）与 `--zy-shadow-fab`（现 L321）附近，与 L57 **不重叠**，理论上上下文不冲突；但同一文件并发写需协调 apply 窗口，建议：
- 串行窗口：等对方提交后再 apply，避免行偏移导致 hunk 失配；
- 或先 `git pull` 最新 → `git apply --check` → 确认后再 apply。

> 注：02 patch 已按当前工作区（含 `--text-on-accent`）重新生成 hunk 行号（`@@ -261,29` / `@@ -318,7`），可直接对当前文件干净 apply，无需先等对方提交。

---

## 附录

### A. `audit-scan.js` 扫描范围说明（非 bug，记录边界）

- 其正则只覆盖 `--zy-tabbar-*` 与 `--zy-shadow-fab`，**不含 `--zy-shadow-float-tabbar`**——因此该令牌的死态需手工 grep 核查（本文件 5.2 已做，0 消费，并已随修订版 02 退役）。若未来扩展审计范围，可把该令牌纳入脚本正则。
- json `tabBar` 块另有 `iconStroke: "4rpx"` 键（teal 无对应 `--zy-tabbar-icon-stroke` 定义），`jmap` 未收录、不参与比对——属 json 独有字段，不影响本次裁定。
- `--zy-tabbar-label-weight`（teal 字符串 "400"）与 json 数值 400 经归一化后判为同值，正确。

### B. 关键行号索引（2026-08-04 现状）

- `custom-tab-bar/index.wxss`：L76 border-top、L192 item-inactive、L201 item-active、L229 center-grad（即 4 个活体消费点）；几何硬编码 L74 height、L226-227 center 104rpx、L233 margin-top -48rpx、L174-175/287-288 图标 40rpx
- `styles/theme-teal.wxss`（并发编辑 `--text-on-accent` 后当前行号）：L264-286 原 TabBar 专用块（修订版 02 删除后为退役注释）、L321 `--zy-shadow-fab`（已删除）、L18 `--primary-color`、L25 `--gradient-primary`、L55 `--text-tertiary`、L69 `--hairline`、L253 `--shadow-float`、L57 `--text-on-accent`（另一执行者新增）
- `design-tokens.json`：`tabBar` 块（含 `iconStroke`）、`shadow.fab` + `_fabNote`、`shadow.floatTabBar` + `_floatTabBarNote`（lead 已同步标注退役）
