# MochiPet Design System

A design system reconstruction of **MochiPet** — 宠物综合服务小程序，覆盖主粮零食、洗护美容、健康医疗等一站式宠物生活服务。
The system is purpose-built for a mobile-first mini-program where warm healing atmosphere and premium-soft texture matter more than hardcore technical polish.

> *"Reference: 3-screen mobile e-commerce UI (hero → browse → detail), warm coral-pink soft-UI aesthetic, migrated from digital earphones to pet services."* — designer briefing

## 1. Overview

### 原始视觉风格

MochiPet 的视觉基因来自一套三屏移动电商参考（横幅引导页 → 分类商城首页 → 商品详情页），原参考服务于数码耳机品类，整体呈现低饱和蜜桃浅粉调性。最显著的特征是超大圆角卡片（实际落点为 `--radius-xl` 24px，配合 `--radius-2xl` 28px 用于最柔的浮层），轻柔弥散的暖色调染色软阴影（`rgba(180,120,100,0.06~0.14)`），以及极简轻拟物 soft-UI 处理。留白充足、无生硬粗线条，商品/服务以大图优先展示，整体追求轻奢柔和质感。

### 赛道适配调整

从数码耳机迁移到宠物综合服务，核心动作是"弱化硬核科技感、增强温暖治愈氛围"。具体落点：阴影一律使用暖珊瑚染色而非中性灰；类目配色引入治愈鼠尾草绿 sage（success / 健康医疗类目）与暖蜂蜜琥珀 honey（warning / 主粮食零类目）作为情绪锚点；服务卡片以 `/次`、`/袋` 等单位说明计价方式；展示字体采用圆润温暖的 Nunito；卡片表面使用暖奶油白 `#FFFAF6` 而非纯白；轻拟物保留但整体降饱和。轻奢柔和质感与大图优先构图被完整继承。

## 2. Content Fundamentals

### Voice & tone

MochiPet 的语调是温暖、治愈、友好而克制的——像一位熟悉你宠物的资深店员，而非冷冰冰的电商导购。文案以中文为主、短句优先，克制使用感叹号，避免生硬促销腔。情绪关键词落在"陪伴""治愈""新鲜"，商品命名偏向具象生活场景而非参数堆砌。分类标签简洁直白，CTA 动词明确。

### Concrete copy examples (lifted from uiCopySamples)

- 分类导航：*"全部 / 主粮 / 零食 / 玩具 / 洗护美容 / 健康医疗"*
- 营销横幅：*"新品上架"*、*"20款新品尝鲜"*
- 详情页属性：*"规格"*、*"颜色"*、*"库存充足"*
- 主行动 CTA：*"加入购物车"*、*"立即预约"*、*"立即购买"*
- 品牌情绪标签：*"宠物陪伴"*

### When generating copy

- CTA 一律使用动词短语（加入购物车 / 立即预约 / 立即购买），不使用"点击""查看更多"这类中性词。
- 服务类目（洗护美容、健康医疗）优先用"立即预约"而非"立即购买"，区分实物与服务两种交易。
- 数量/规格描述保持克制短促，如"库存充足"，避免夸张库存营销语。
- 类目标签不超过 4 字，保证横向滚动胶囊不被截断。

## 3. Visual Foundations

### Color

品牌主色是暖珊瑚蜜桃 coral peach，实际取 `--primary-600` `#D26243` 作为 CTA 与强调色，同色族提供 10 级渐变（`--primary-50` `#FCEEE7` 浅蜜桃到 `--primary-900` `#763328` 深焦糖），用于按钮 hover、徽标、价格强调与渐变媒体底色。按钮配色即主色——没有独立 button 色，主珊瑚实色承担所有主行动。

中性色同样是暖调。全局画布背景取 `--neutral-50` `#FBF7F4`（蜜桃浅粉 blush），卡片表面是 `--card` `#FFFAF6`（暖奶油白），主文字 `--neutral-900` `#2B2522`（暖近黑炭灰），次文字 `--neutral-500` `#9A8475`（暖石灰）。整套 neutral 也是 10 级，从 `#FBF7F4` 到 `#2B2522`，确保阴影、描边、禁用态都有对应暖调色。

语义色四族均为 10 级：success 走治愈鼠尾草绿，锚定 `--success-600` `#4F714B`，浅色 `--success-300` `#9DB89A` 用于健康医疗类目标签与健康状态；warning 走暖蜂蜜琥珀，锚定 `--warning-500` `#DCA247`，`--warning-400` `#E8B96B` 用于主粮食零类目；error 取柔和珊瑚红 `--error-600` `#BE3D2A`；info 取柔雾蓝 `--info-600` `#345E85`。语义色与类目色刻意呼应——sage 对应健康医疗、honey 对应主粮食零——让色彩自带类目语义。整体情绪是"被阳光晒暖的奶油"，低饱和、高明度、暖染色贯穿始终，没有任何冷色或纯灰介入。

### Typography

展示与标题字体是 **Nunito**，权重 700/800，圆润温暖，承担 display、h1-h4 与价格强调。正文拉丁字符用 **Plus Jakarta Sans**（400/500/600），中文统一走 **Noto Sans SC**（400/500/700）作为回退与中文承载。价格强调使用 800 权重以呼应"轻奢"质感。

层级上，display 为 40px/800/1.15，h1 32px/700/1.2，h2 26px/700/1.25，h3 22px/700/1.3，h4 18px/600/1.4；正文 body 15px/400/1.5，引导文 lead 17px/500/1.6，说明文字 caption 12px/400/1.4。价格体系独立成组：`--font-size-price` 20px、`price-lg` 整数位 30px/800、`price-md` 18px/700、`price-sm` 整数位 17px/700，并配套原价划线 `price-orig` 与单位说明 `price-unit`（如 `/袋`、`/次`）。行高整体偏松，正文 1.5、引导文 1.6，保证阅读呼吸感。

### Spacing

间距以 4px 为基步，提供 `--space-1` 4px 到 `--space-16` 64px 共 10 级。按钮高度分三档：sm 36px、md 44px（触控基线 `--size-touch`）、lg 52px；输入框默认 48px。组件内 padding 多用 `--space-3`/`--space-4`，卡片内边距 `--space-3`，保证软质感。

### Radius

圆角是这套系统最强烈的人格签名。`--radius-sm` 8px 用于小控件与 chip，`--radius-md` 12px 用于规格胶囊，`--radius-lg` 16px 用于媒体图，`--radius-xl` 24px 用于商品卡片，`--radius-2xl` 28px 用于最柔的浮层，`--radius-pill` 9999px 专用于胶囊型按钮、标签与头像。圆角随层级递增——控件小圆角、卡片大圆角、胶囊全圆，刻意不走直角。

### Shadow / Elevation

阴影共 5 级，全部为暖珊瑚染色：`--shadow-1` `0 1px 2px rgba(180,120,100,0.06)` 静止态；`--shadow-2` `0 2px 8px rgba(180,120,100,0.08)` 常规卡片；`--shadow-3` `0 4px 16px rgba(180,120,100,0.10)` 抬升卡片与主 CTA；`--shadow-4` `0 8px 24px rgba(180,120,100,0.12)` 悬浮购物车与 FAB；`--shadow-5` `0 16px 40px rgba(180,120,100,0.14)` 模态。阴影哲学是"暖光弥散"——非中性灰、低透明、大模糊半径，营造轻柔悬浮而非硬投影。

### Borders & backgrounds

描边极克制：`--border` 取 `--neutral-200` `#E8DBD1`（暖石灰），多用于未选中胶囊的 1px-1.5px 描边，几乎不出现硬分割线。背景层以 `--neutral-50` blush 为底，卡片 `#FFFAF6` 奶油白浮于其上，媒体区使用 `--primary-50`/`--warning-50`/`--success-50` 到 100 的渐变作为图标承载底色，强化类目语义。

## 4. Page Structure & Component Patterns

### 三屏流程

系统围绕三屏移动流程组织：

1. **横幅引导页**（hero/landing）——顶部 `search-bar` 搜索 + 头像槽，营销横幅展示"新品上架 / 20款新品尝鲜"，`category-tab` 横向滚动做一级入口。
2. **分类商城首页**（category browse）——`category-tab` 筛选 + `product-card` 双列网格，`cart-button` 浮动形态悬浮于底部，点选进入详情。
3. **商品/服务详情页**（detail）——大图媒体区 + `option-selector`（颜色圆点 + 规格/口味胶囊）+ `price-display`（现价 / 划线原价 / 单位）+ `cart-button` 主 CTA（加入购物车 / 立即预约）。

### 可复用组件清单

当前 6 个已建组件构成核心契约：

| Component | Preview | Contract | Key Facts | Key Insight |
|---|---|---|---|---|
| Search Bar | `preview/component-search-bar.html` | `components/search-bar.json` | 48px 高胶囊，暖阴影，聚焦 2px ring，含头像槽 + 通知 badge | 蜜桃软阴影胶囊，搜索与个人入口合一 |
| Category Tab | `preview/component-category-tab.html` | `components/category-tab.json` | 36px 高 pill，选中实色 / 未选奶油描边，横向滚动 | 选中珊瑚实色，未选柔奶油描边 |
| Product Card | `preview/component-product-card.html` | `components/product-card.json` | 24px 大圆角，1:1 媒体，悬浮 badge + tag，4 变体 | 大图优先 + 超大圆角 + 软弥散阴影 |
| Option Selector | `preview/component-option-selector.html` | `components/option-selector.json` | 颜色圆点选中描边环 + 规格胶囊，3 变体 | 颜色圆点选中外环描边，规格胶囊低对比 |
| Cart Button | `preview/component-cart-button.html` | `components/cart-button.json` | 主 CTA pill 52px + 浮动价签 + 图标按钮，4 变体 | 主珊瑚实色 CTA + 悬浮价签胶囊 |
| Price Display | `preview/component-price-display.html` | `components/price-display.json` | 30px/800 整数 + 单位 + 划线原价，4 变体 | 珊瑚强调价 + 划线原价 + 单位说明 |

扩展 atom（已部分存在于 `components.css`，未单独建契约）：**用户头像 avatar**——`--size-avatar-md` 40px pill，珊瑚渐变底 `linear-gradient(135deg, primary-300, primary-500)`；**悬浮标签 floating-badge**——绝对定位 pill 徽标，已在 search-bar 与 cart-button 复用；**多媒体播放按钮 media-button**——为宠物护理教程视频预留，建议沿用 `--radius-pill` + `--shadow-3` + 半透明珊瑚叠层。

### 统一组件规范

上述 6 个已建组件 + token 体系即构成扩展整个宠物小程序（首页、商城、详情、购物车、订单、洗护预约、兽医挂号等）的统一规范。avatar / floating-badge / media-button 三个 atom 可按需扩展为独立契约，但核心色彩、字体、圆角、阴影约束由 `colors_and_type.css` 统一收敛，任何新屏不得引入未登记的圆角或阴影色。

## 5. Index

- `README.md` — 本文件，品牌叙事与结构化设计分析
- `SKILL.md` — agent 技能入口与快速映射
- `colors_and_type.css` — 色彩、字体、圆角、阴影、间距的运行时 CSS 变量
- `css.json` — 结构化 token JSON
- `components.css` — 从 preview 自动聚合的组件 CSS
- `components/index.json` — 组件索引与跨组件模式
- `components/{slug}.json` — 各组件契约
- `preview/component-{slug}.html` — 组件预览卡片
- `ui_kits/app/index.html` — 三屏可点击还原应用
- `library-consumption.json` — 下游 agent 推荐读取顺序
- `uikit-plan.json` — 组件白名单与屏蓝图

## 6. Caveats / known substitutions

1. **Nunito / Plus Jakarta Sans** 为 Google Fonts 托管字体，离线环境不可用；`colors_and_type.css` 已在 `@import` 中声明，运行时回退至 **Noto Sans SC** + 系统无衬线。展示字 Nunito 缺失时圆润人格会减弱，建议离线场景预下载字体子集。
2. **图片占位**：所有商品/服务媒体区当前以 `--primary-50→100`、`--warning-50→100`、`--success-50→100` 渐变 + 半透明图标 SVG 占位，真实摄影素材需后续替换，保持编辑级暖调摄影质感。
3. **本库为 from-scratch 生成**：所有 token 均由参考图 + 用户描述 AI 推断，未经 Figma 证据回填；组件 `confidence: medium`、`sourceKind: from-scratch`。色阶的 10 级是算法生成（CSS 中标注 `AI-generated`），关键锚点（primary-600 `#D26243`、neutral-50 `#FBF7F4`、card `#FFFAF6`）与 BrandFile 描述一致，但中间过渡色为推断值。
4. **avatar / floating-badge / media-button** 三个 atom 目前仅以 CSS 片段散落在 `components.css` 的 search-bar / cart-button 段落中，尚未独立成 `components/{slug}.json` 契约；扩展前需补建契约。
5. **media-button** 完全为预留项，尚无任何实现代码，仅作为宠物护理教程视频场景的设计意图占位。
