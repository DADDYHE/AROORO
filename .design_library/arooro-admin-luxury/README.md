# AROORO Admin Design System

一套为 **AROORO Admin** 重建的设计系统——宠物服务平台的后台管理仪表盘，以爱马仕 / 香奈儿 / 迪奥的编辑级美学为参照，将奢侈品的克制与精致植入数据密集型界面。系统专为 dashboard 场景而建：在不牺牲信息密度的前提下，以奶油纸感底色、深森林绿主色与香槟金点缀，构建出"高级定制"级的后台体验。

> *"Less is more. Cream paper-feel base, deep forest green primary, champagne gold accent under 5% area. Hairline borders replace shadows. Near-square corners. Art-grade whitespace. Magazine-style typography."* — AROORO 品牌设计哲学

## Source

- **品牌来源：** AROORO 宠物服务平台
- **设计参照：** Hermès, Chanel, Dior, The Row, Loewe
- **产品类型：** Dashboard（后台管理仪表盘）
- **设计语种：** 中文

## What this design system covers

- **Foundations** — 10 级主色阶、10 级点缀色阶、10 级中性色阶、4 组语义色（success / warning / error / info）、5 字族排版体系、6 级圆角、5 级阴影、4px 基准间距
- **Components** — 6 个核心组件：button, card, table, chart, navigation, sidebar
- **Preview** — 每个组件配有独立 HTML 预览页，可在浏览器中直接检视

---

## CONTENT FUNDAMENTALS

### Voice & tone

AROORO Admin 的文案语态是"奢侈品柜姐的轻声细语"——克制、精确、不喊叫。它不会出现"立即购买""限时抢购"这类电商式催促，也不会用"恭喜你"这类轻浮语气。后台标签以名词短语为主，四个字为黄金长度（"数据看板""今日订单""全部订单"），动宾结构仅在操作入口出现且同样收敛（"创建团购"）。整条信息架构读起来像一本目录页：标题是章节名，数字是正文，操作是页边批注。所有文案均为中文，无英文混排，无 emoji，无感叹号。

### Concrete copy examples (lifted from the bundle)

- 看板主标题：*"数据看板"*
- 核心指标卡：*"今日订单"* / *"今日收入"* / *"总用户数"*
- 快捷导航区：*"快捷入口"*
- 图表区域标题：*"订单趋势"* / *"订单类型分布"*
- 管理模块：*"团购管理"* / *"创建团购"*
- 列表与待办：*"待处理事项"* / *"全部订单"* / *"营收情况"*

### When generating copy

- 标签用名词短语，首选四字结构；动宾结构仅限操作按钮
- 不使用感叹号、emoji、营销话术；保持陈述语气
- 数据标签与数值分行：标签用 Noto Sans SC 正文体，数值用 Inter tabular-nums
- 色彩描述禁止出现：不写"鲜艳的绿色"，写"森林深绿"

---

## VISUAL FOUNDATIONS

### Color

AROORO 的色彩体系建立在三层叙事之上：底色、主色、点缀色，三者面积比约为 85:10:5。底色 `--background: #F7F5EF` 是一种带暖黄调的奶油白，模拟手工纸的视觉触感，与纯白 `--surface: #FFFFFF` / `--card: #FFFFFF` 形成微妙的层级差——卡片浮在纸面上，但不是靠阴影，而是靠色温差。主色 `--primary: #1F3A1F`（`--primary-700`）是深森林绿，取自主色阶的第 7 级，整条色阶从 `--primary-50: #EFF4EF`（近乎透明的薄荷雾）到 `--primary-900: #0F1C0F`（墨绿黑），为侧边栏渐变、按钮、激活态提供了从背景到前景的完整梯度。点缀色 `--accent: #C9A24B`（`--accent-400`）是香槟金，其色阶从 `--accent-50: #FBF6E9` 到 `--accent-900: #382C14`，但实际使用被严格限制在 5% 面积以内——仅出现在激活指示条、焦点环、数据高亮和装饰性细线上。中性色阶从 `--neutral-50: #FAFAF8` 到 `--neutral-900: #1A1A17`，其中 `--neutral-900` 即为正文色 `--foreground: #1A1A17`（炭墨黑），而 `--muted-foreground: #746B58` 是一种偏暖的褐灰，用于次级文字，比纯灰更有"旧书纸"的温度。边框色 `--border: #E8E4D9` 和静默背景 `--muted: #F0EDE4` 都从中性色阶中派生，确保整个界面没有一根"死白"的线。语义色方面，success 取 `--success-500: #3D7A45`（与主色同属绿色家族但更亮），warning 取 `--warning-400: #C9922B`（与点缀金相近但更偏琥珀），error 取 `--error-400: #A45236`（赤陶土红，而非刺眼的纯红），info 取 `--info-400: #5C7A8A`（雾蓝灰，冷调但不冰冷）。暗色模式将背景翻转为 `#0F1C0F`、卡片转为 `#1F3A1F`，点缀金提亮为 `#B88E3A` 以保持对比度。

### Typography

排版是 AROORO 最具辨识度的语言。四个字族各司其职：**Cormorant Garamond** 担任 display 与 eyebrow 字体（`--font-display` / `--font-eyebrow`），以衬线体的优雅曲线为大型标题和章节眉标注入杂志感；**Noto Serif SC** 担任 h1–h3 级中文标题字体（`--font-serif`），weight 500–600，line-height 1.2–1.3，确保中文标题有宋体的骨架而不臃肿；**Noto Sans SC** 担任正文与 caption（`--font-sans`），weight 400，line-height 1.6，是信息承载的主力；**Inter** 专门用于数字与数据（`--font-number`），配合 `tabular-nums` 确保表格中金额对齐。字号体系从 `--font-size-display: 56px` 到 `--font-size-caption: 12px` 共 9 级，display 用 weight 500 / line-height 1.1 / letter-spacing -0.01em 营造收紧的标题感，lead 用 weight 300 / line-height 1.7 营造呼吸感。所有字体通过 Google Fonts `@import` 加载，权重覆盖 300–700。

### Spacing

间距以 4px 为基准单位，共 10 级 token：`--space-1: 4px` 至 `--space-10: 64px`。实际使用中，组件内填充多用 `--space-3`（12px）和 `--space-4`（16px），卡片间距多用 `--space-6`（24px），页面外边距遵循品牌哲学的"艺术级留白"原则，外缘不少于 `--space-9`（48px）。按钮高度分三档：`--size-button-sm: 32px`、`--size-button-md: 40px`、`--size-button-lg: 48px`，输入框默认 `--size-input: 40px`。图标尺寸从 `--size-icon-sm: 16px` 到 `--size-icon-xl: 26px`，与文字行高对齐。

### Radius

圆角是 AROORO 克制美学的关键签名。体系含 6 级：`--radius-xs: 4px` 用于输入框、状态标签等小控件；`--radius-sm: 8px` 用于卡片、表格单元格；`--radius-md: 12px` 用于大型卡片容器；`--radius-lg: 16px` 和 `--radius-xl: 20px` 用于弹窗与特殊容器；`--radius-pill: 9999px` 仅用于按钮和状态药丸。整体偏"近方"，最大圆角不超过 20px，避免任何"泡泡感"。

### Shadow / Elevation

阴影哲学是"发丝线替代阴影"。体系定义了 5 级，但 `--shadow-1: none` 是基准——卡片在静止状态下没有阴影，靠 `1px solid var(--border)` 的发丝线界定边界。`--shadow-2: 0 2px 12px rgba(26,26,23,0.06)` 仅在卡片悬停时出现；`--shadow-3: 0 8px 32px rgba(26,26,23,0.10)` 用于下拉与浮层；`--shadow-4: 0 16px 48px rgba(26,26,23,0.16)` 用于模态框；`--shadow-5: 0 24px 64px rgba(26,26,23,0.24)` 用于全屏遮罩。所有阴影的色值基座是 `rgba(26,26,23,...)`——即炭墨黑而非纯黑，保持暖调一致性。主按钮例外：使用金色辉光阴影而非标准阴影层。

### Borders & Backgrounds

边框一律 `1px solid`，色值 `--border: #E8E4D9`，不使用虚线或点线。侧边栏背景使用深绿渐变（`--primary-700` → `--primary-900`），是全系统唯一允许渐变的位置。其余界面均为实色填充，无毛玻璃、无噪点纹理。

---

## Component Patterns

| Component | Preview | Contract | CSS Source | Key Facts | Key Insight |
|---|---|---|---|---|---|
| Button | `preview/component-button.html` | `components/button.json` | `components.css` — Button | 三档高度 32/40/48px；pill 圆角；主按钮带金色辉光阴影；行内操作为纯文本 | 唯一使用辉光阴影的组件，金色光晕是品牌签名 |
| Card | `preview/component-card.html` | `components/card.json` | `components.css` — Card | 发丝线边框；含带底色图标的统计卡变体；静止无阴影，悬停 shadow-2 | 靠色温差而非阴影分层，hover 才浮起 |
| Table | `preview/component-table.html` | `components/table.json` | `components.css` — Table | 眉标式表头；pill 状态标签；金额列用 Inter tabular-nums | 编辑级表格——表头像章节眉标，数据像正文 |
| Chart | `preview/component-chart.html` | `components/chart.json` | `components.css` — Chart | 纯 CSS 柱状图 + conic-gradient 环形图；带图例 | 零 JS 依赖，渐变与 conic-gradient 即可表达品牌 |
| Navigation | `preview/component-navigation.html` | `components/navigation.json` | `components.css` — Navigation | 顶部 header；含面包屑、搜索 pill、用户芯片 | 搜索框用 pill 而非方角，是全站唯一的 pill 输入 |
| Sidebar | `preview/component-sidebar.html` | `components/sidebar.json` | `components.css` — Sidebar | 深绿渐变背景；金色激活指示条；可折叠 | 全系统唯一渐变容器，金色指示条是 5% 面积法则的典型应用 |

---

## Index

- `README.md` — 本文件，品牌叙事与设计基础参考
- `colors_and_type.css` — 全部 CSS 变量：色彩、排版、圆角、阴影、间距（运行时链接用）
- `css.json` — 结构化 JSON token，程序化消费用
- `components.css` — 从 preview 页面自动提取的聚合组件 CSS
- `components/` — 组件契约 JSON（button, card, table, chart, navigation, sidebar）
- `preview/` — 各组件独立 HTML 预览页
- `SKILL.md` — AI 代理技能入口清单

---

## Caveats / known substitutions

1. **Cormorant Garamond** 为西文衬线体，无法渲染中文字符；中文标题实际由 **Noto Serif SC** 承载，Cormorant Garamond 仅用于英文/数字 display 场景与 eyebrow 装饰。两者混排时需注意基线对齐，建议英文行高微调 -2px。
2. **Inter** 作为数字字体依赖 Google Fonts CDN 加载；离线环境下需本地部署或回退至 system-ui，但会丢失 tabular-nums 对齐精度。
3. 全部色阶标注 `/* AI-generated */`，意味着色值由算法推演而非从 Figma 实样吸取；主色 `#1F3A1F`、点缀色 `#C9A24B`、底色 `#F7F5EF`、正文色 `#1A1A17` 为品牌指定基准，其余色阶为梯度推断值，生产环境中应与品牌方做一次校色确认。
4. 暗色模式的语义色未单独定义，沿用亮色模式 token；在 `#0F1C0F` 背景上 success/warning 的对比度需实际验证。
5. 组件 CSS 来源于 preview HTML 的自动提取，若 preview 页面未覆盖某变体，`components.css` 中该变体的样式可能缺失——以 `preview/component-{slug}.html` 为第一信源。
6. 圆角最大值 20px 是容器上限，但品牌哲学原文提及"near-square corners"，实际使用中 12px 以上的圆角应极少出现，仅限弹窗类容器。
