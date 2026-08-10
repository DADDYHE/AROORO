# AROORO 首页内容卡片 ·「极光点缀」设计方案

> 设计系统专家 彩格调 ｜ 供 DADDY 拍板 ｜ 令牌文件：`aurora-tokens.css`
> 已核对真实代码：`pages/home/index.wxss`、`styles/theme-teal.wxss`、`styles/variables.wxss`

---

## 0. 现状核对（先说三个从代码里挖出来的事实）

这三条直接决定了方案怎么选，先摆出来：

| # | 发现 | 影响 |
|---|------|------|
| **F1** | `--hairline-glass: rgba(26,26,23,0.14)` 是**中性炭墨**，不是绿 | 现在卡片边框跟顶部极光带**毫无关系**。这是最大的一块"没借到的光"——也是成本最低的一次呼应机会 |
| **F2** | `.qs-accent` 已经是**真实 `<view>`**（非伪元素），`scaleY(0→1)` 按压展开 | 项目里已有正确的 Skyline 点缀层范式，新点缀直接沿用这套写法，零学习成本 |
| **F3** | `.mall-card-overlay` 在**文字顶行只有 α≈0.36**，白字对比度 **2.7:1，不达 WCAG AA** | 这是个既存可访问性缺陷。极光改造必须顺手修掉，不能只加漂亮不修问题 |

另：`--lux-radius-card: 40rpx`（=20px 大圆角），`.pet-card` **没有** `position:relative / overflow:hidden`——加点缀层前必须补。

---

## 1. 三个候选方向

三个方向刻意构成 **线 / 点 / 面** 的完整谱系，差异化明确，不是同一个东西的三种深浅。

### 方向 A ·「极光染边」Aurora Wash Edge —— 线

**视觉描述**
不增加任何新元素，只做两件事：① 把四周那条中性炭墨发丝边**换色相为深绿**（明度等重量校准，视觉重量不变）；② 在卡片顶沿加一条 1px 横向极光渐变条，从暗谷 `#0F2410` 流向热核 `#5A7C63`，峰值刻意偏右 58%。

呼应的极光特征：**渐变的方向性与非对称流动**。像顶部那道极光被压缩成一条线，贴在卡沿上。

**五类卡适配**

| 卡 | 形态 |
|---|---|
| 1 `.qs-item` | 染绿发丝边 + 顶沿染边条；`.qs-accent` 左侧线由纯色改极光竖向渐变 |
| 2 `.pet-card` | 染绿发丝边 + 顶沿染边条；性别 inset 线**原样保留**（功能语义，不动） |
| 5 `.activity-h-card` | 染绿发丝边（弱档）+ 顶沿染边条（最弱） |
| 3/4 `.mall-card` | 深底不能用暗色染边 → 改用**顶部提亮线**（热核加白 `#A4B7A9`），是染边的深底等价物；遮罩注入热核中段 |

**Skyline 判定**：✅ 全通过。只用 `linear-gradient` + 绝对定位 view + `opacity`。零风险。

---

### 方向 B ·「宝石晕角」Gem Corner Bloom —— 点

**视觉描述**
卡片右上角一枚 108px 见方的径向渐变晕，中心 `rgba(90,124,99,0.14)` 向外淡出至透明，被 40rpx 大圆角自然切出一道弧——形成"宝石切面接住了一束光"的错觉。配 7.2 秒极慢呼吸（opacity 0.55↔1 + scale 1↔1.05）。

呼应的极光特征：**宝石光泽与光晕的体积感**。

**五类卡适配**

| 卡 | 形态 |
|---|---|
| 1 `.qs-item` | 右上角晕 + 呼吸 |
| 2 `.pet-card` | 右上角晕（静态，不呼吸——避免同屏两处呼吸打架） |
| 5 `.activity-h-card` | 右上角晕，半径减半 |
| 3/4 `.mall-card` | ⚠ 图片上加晕会"脏"。改为遮罩内左下→右上的斜向热核提亮 |

**Skyline 判定**：⚠ 基本可行，但有两个坑——`radial-gradient` 的**双半径椭圆语法在 Skyline 支持不稳**（必须降级为 `circle` + `transform: scaleX()`）；`.pet-card` 缺 `overflow:hidden`，不补的话晕会溢出圆角变成方块。

**单独用的问题**：角晕是个"加上去的东西"，跟「零装帧极简」有张力。密度虽低，但性质上是装饰件而非结构件。

---

### 方向 C ·「极光潜影」Aurora Undertone —— 面

**视觉描述**
不碰边缘，给整张暖石纸卡底部注入一层极淡深绿潜影：`linear-gradient(180deg, transparent 58%, rgba(31,58,31,0.045) 100%)`，叠在现有 `card-satin→sheet-paper` 之上。像纸背后透出一点极光的余绿。

呼应的极光特征：**深绿的环境渗透感 / 纸本吸光**。

**五类卡适配**

| 卡 | 形态 |
|---|---|
| 1 / 2 / 5 | 底部潜影，强度按区块递减 |
| 3/4 | 遮罩本身就是"面"，只需注入热核中段即可 |

**Skyline 判定**：✅ 通过（纯 `linear-gradient` 叠加背景）。

**单独用的问题**：**太隐了**。0.045 的绿叠在暖石上，在真机低亮度或强光下基本不可见；调高到可见（≈0.09）又会让纸卡"发灰发脏"，破坏暖石的温度。这个方向作为主角**风险最高、回报最低**。

---

## 2. 推荐主方向

# ✅ 推荐：方向 A「极光染边」为主 ＋ 方向 B 降级为单点强调

命名：**极光染边 · 三层制（Aurora Wash Edge, 3-Tier）**

### 为什么是 A

1. **它是唯一"零新增元素"的方案。** A 的主体动作是给**已经存在**的发丝边换色相——不加东西，只换基因。这是对「零装帧极简」最忠诚的解法。B 和 C 都是在往卡上"加"，A 是"改"。

2. **它精确命中了 F1 这个真实缺口。** 现在的边框是中性炭墨，是整个卡片系统里唯一一处"跟品牌无关"的颜色。染绿之后，卡片终于和顶部极光带同源了。而且我做过明度等重量校准：

   ```
   炭墨 rgba(26,26,23,0.14) 叠在 #FBF9F4 → rgb(219, 218, 213)
   染绿 rgba(31,58,31,0.15) 叠在 #FBF9F4 → rgb(218, 220, 212)
   ```
   感知明度几乎完全相同，只是色相移进了深绿。**白拿一层品牌呼应，视觉代价为零**——这正是"克制"的定义。

3. **"发丝精密"被强化而不是被稀释。** 顶沿那条 1px 染边条本身就是发丝级的，它加强的是精密感，不是装饰感。艺术感来自**峰值偏右 58% 的非对称**——这是编辑设计的手法，对称才显廉价。

4. **Skyline 复现零风险。** 纯 `linear-gradient`，不碰任何禁用 API，不依赖 `radial-gradient` 的方言差异。

### 为什么 B 要保留、但降级

角晕是这套方案里**唯一有"体积"的元素**，是艺术感的来源，砍掉会太平。但它必须稀有——所以只给 `.qs-item`（首屏最靠近极光带的一排卡），两张，带呼吸。往下滚就再也看不到第二枚。**稀缺性本身就是高级感。**

### 为什么 C 被否

隐到看不见等于没做，调到看得见就弄脏暖石。夹在中间没有安全区。

---

### 系统骨架：极光衰减梯度（Aurora Falloff）

这是本方案真正的骨架，也是我最想让 DADDY 看到的一点：

> **光源在页面顶部。越往下滚，卡片接到的光越弱。**

实现上只需要一个 `opacity` 变量分级，**五类卡共用同一套渐变令牌**：

| 区块 | 卡 | `--aurora-falloff` | 得到的点缀 |
|---|---|---|---|
| 快捷服务 | `.qs-item` | **1.00** | 染边 + 极光竖线 + **角晕呼吸** |
| 我的宠物 | `.pet-card` | **0.72** | 染边 |
| 团购/商城 | `.mall-card` | **0.56** | 提亮线 + 遮罩极光 + 文字守护 |
| 近期活动 | `.activity-h-card` | **0.44** | 染边（余光）+ 金信号 |

好处：一套色、一套渐变、一个变量分级 → 天然节奏感，而 CSS 体积几乎不增加，也不会出现"五张卡五种绿"的失控。

---

## 3. 完整设计令牌

**完整可直接引用的令牌见同目录 `aurora-tokens.css`**（含全部注释、关键帧、通用点缀层基类）。以下是核心摘要。

### 3.1 色彩派生链（可验算，零新色相）

```
--aurora-lume: #A4B7A9  ← #5A7C63 混 45% 白
                          色相 135.8°（源 135.9°）✅ 同相
--aurora-mid:  #172F1A  ← #0F2410 与 #1F3A1F 各 50%
                          色相 127.5°（介于 122.9° / 120°）✅ 同族
```

### 3.2 点缀色梯度

```css
/* 纸卡压色 */
--aurora-tint-04:  rgba(31, 58, 31, 0.04);
--aurora-tint-12:  rgba(31, 58, 31, 0.12);
--aurora-abyss-26: rgba(15, 36, 16, 0.26);
--aurora-core-14:  rgba(90,124, 99, 0.14);
--aurora-core-46:  rgba(90,124, 99, 0.46);
/* 深底提亮 */
--aurora-lume-28:  rgba(164,183,169, 0.28);
--aurora-lume-42:  rgba(164,183,169, 0.42);
/* 金 · 一支 */
--aurora-gold-line:  rgba(201,162,75, 0.55);
--aurora-gold-ghost: rgba(201,162,75, 0.12);
```

### 3.3 发丝边处理

| 令牌 | 值 | 用法 |
|---|---|---|
| `--hairline-aurora` | `rgba(31,58,31,0.15)` | **替代** `--hairline-glass`，falloff 1.00/0.72 档 |
| `--hairline-aurora-dim` | `rgba(31,58,31,0.11)` | falloff 0.56/0.44 档 |
| `--hairline-aurora-lift` | `rgba(31,58,31,0.24)` | 按压态描边（替代现在按压直接跳 `--primary-color` 的硬切） |

> 保留原 `--hairline-glass` 变量名不删，只在首页作用域内覆盖，避免影响其它页面。

### 3.4 关键渐变

```css
/* 顶沿染边 — 峰值偏右 58%，非对称 */
--aurora-edge-top: linear-gradient(90deg,
    rgba(15,36,16,0)    0%,   rgba(15,36,16,0.26) 10%,
    rgba(31,58,31,0.34) 32%,  rgba(90,124,99,0.46) 58%,
    rgba(90,124,99,0.20) 78%, rgba(90,124,99,0)   100%);

/* 左侧极光竖线 — 上暗下亮，与顶部极光带同向明度流 */
--aurora-accent-v: linear-gradient(180deg,
    rgba(15,36,16,0.88) 0%, rgba(31,58,31,0.74) 42%, rgba(90,124,99,0.56) 100%);

/* 右上角宝石晕 — circle 语法（Skyline 安全） */
--aurora-bloom: radial-gradient(circle at 100% 0%,
    rgba(90,124,99,0.14) 0%,  rgba(90,124,99,0.08) 34%,
    rgba(31,58,31,0.03)  62%, rgba(31,58,31,0)    100%);

/* 全图卡遮罩 — 66% 处注入热核，让极光"渗"进画面 */
--aurora-scrim-img: linear-gradient(to top,
    rgba(15,36,16,0.88) 0%,  rgba(15,36,16,0.74) 20%,
    rgba(23,47,26,0.46) 44%, rgba(90,124,99,0.18) 66%,
    rgba(90,124,99,0.05) 84%, rgba(90,124,99,0)  100%);

/* 文字守护层 — 修 F3，只铺在 .mall-card-info 背后 */
--aurora-scrim-guard: linear-gradient(to top,
    rgba(15,36,16,0.72) 0%,  rgba(15,36,16,0.64) 62%,
    rgba(15,36,16,0.24) 88%, rgba(15,36,16,0)   100%);

/* 全图卡顶部提亮线 — 深底上的染边等价物 */
--aurora-edge-lume: linear-gradient(90deg,
    rgba(164,183,169,0) 0%,   rgba(164,183,169,0.28) 38%,
    rgba(164,183,169,0.42) 62%, rgba(164,183,169,0)  100%);
```

### 3.5 点缀尺度

| 令牌 | px（预览） | rpx（小程序） | 说明 |
|---|---|---|---|
| `--aurora-edge-h` | 1px | **2rpx** | 顶沿染边条高 |
| `--aurora-hair-w` | 0.5px | **1rpx** | 四周发丝边（小程序写 1rpx，**勿写 0.5px**） |
| `--aurora-accent-w` | 2px | **4rpx** | 左侧竖线宽（沿用现有 `.qs-accent`） |
| `--aurora-accent-inset` | 18px | **36rpx** | 竖线上下内缩（不通高＝克制） |
| `--aurora-bloom-size` | 108px | **216rpx** | 角晕方形边长 |
| `--aurora-lume-h` | 1px | **2rpx** | 全图卡顶部提亮线 |
| `--aurora-gold-w / -len` | 1px / 14px | **2rpx / 28rpx** | 金信号线 |
| `--aurora-guard-h` | 62px | **124rpx** | 文字守护层高 |

> 换算率固定 **1px = 2rpx**（375px 视口 = 750rpx 设计宽）。

### 3.6 微动效（仅 transform / opacity）

```css
/* 极光呼吸 — 7.2s，慢到几乎察觉不到，只给 L2 角晕 */
@keyframes aurora-breathe {
  0%   { opacity: 0.55; transform: scale(1); }
  50%  { opacity: 1;    transform: scale(1.05); }
  100% { opacity: 0.55; transform: scale(1); }
}
/* transform-origin: 100% 0%  —— 从右上角往外呼吸 */

/* 染边入场 — 一道光从左掠过卡沿 */
@keyframes aurora-edge-in {
  from { opacity: 0; transform: scaleX(0.35); }
  to   { opacity: 1; transform: scaleX(1); }
}
/* transform-origin: left center; 760ms cubic-bezier(0.22,0.61,0.36,1) */

/* 遮罩微移（可选） */
@keyframes aurora-scrim-drift { 0%,100% { opacity: 0.94; } 50% { opacity: 1; } }
```

**按压响应**（沿用现有 280ms 曲线，不新增动画）：
```css
.qs-item--pressed  .aurora-edge  { opacity: 0.60; }
.qs-item--pressed  .aurora-bloom { transform: scale(1.08); }
.pet-card--pressed { border-color: var(--hairline-aurora-lift); }  /* 替代硬切 primary-color */
```

---

## 4. 给原型构建师的指引

### 4.1 点缀分配总表

| 卡 | falloff | L1 染边 | L1 竖线 | L2 角晕 | L3 金 | 遮罩改造 |
|---|---|---|---|---|---|---|
| 1 `.qs-item` | 1.00 | ✅ | ✅ 极光渐变 | ✅ **呼吸** | — | — |
| 2 `.pet-card` | 0.72 | ✅ | — 性别 inset 线保留 | — | — | — |
| 3 `.mall-card` 团购 | 0.56 | ✅ 提亮线 | — | — | — | ✅ + 守护层 |
| 4 `.mall-card` 商城 | 0.56 | ✅ 提亮线 | — | — | — | ✅ + 守护层 |
| 5 `.activity-h-card` | 0.44 | ✅ 最弱 | — | — | ✅ 时间行 | — |

**全屏点缀密度**：染边 5 类都有（但那本来就是边框，不算"多"）；角晕全页仅 **2 枚**；金信号仅活动卡时间行。符合"宁少勿多"。

### 4.2 CSS 骨架

```html
<!-- 1. 快捷服务 —— 满配 -->
<view class="qs-item" style="--aurora-falloff: var(--aurora-falloff-1)">
  <view class="aurora-edge"></view>
  <view class="aurora-accent"></view>
  <view class="aurora-bloom aurora-bloom--breathe"></view>
  <view class="aurora-content"> …图标/标题/副标题… </view>
</view>

<!-- 2. 我的宠物 —— 仅染边 -->
<view class="pet-card pet-card-male" style="--aurora-falloff: var(--aurora-falloff-2)">
  <view class="aurora-edge"></view>
  <view class="aurora-content"> …头像/名字/品种… </view>
</view>

<!-- 3/4. 全图卡 —— 提亮线 + 极光遮罩 + 文字守护 -->
<view class="mall-card" style="--aurora-falloff: var(--aurora-falloff-3)">
  <image class="mall-card-img" />
  <view class="mall-card-overlay"></view>   <!-- 换 --aurora-scrim-img -->
  <view class="aurora-lume-line"></view>    <!-- 顶部提亮线 -->
  <view class="mall-card-guard"></view>     <!-- 新增：文字守护层 -->
  <view class="mall-card-info"> … </view>
</view>

<!-- 5. 近期活动 —— 余光 + 金 -->
<view class="activity-h-card" style="--aurora-falloff: var(--aurora-falloff-4)">
  <view class="aurora-edge"></view>
  <image class="activity-h-img" />
  <view class="aurora-content">
    … <view class="activity-h-time-row">
        <view class="aurora-gold-rule"></view><text>周六 14:00</text>
      </view> …
  </view>
</view>
```

关键 CSS（改动点，其余保持现状）：

```css
/* ── 首页作用域内覆盖发丝边，不影响其它页面 ── */
.home-container {
  --hairline-glass: var(--hairline-aurora);
}
.activity-h-card,
.mall-card { --hairline-glass: var(--hairline-aurora-dim); }

/* ── .pet-card 必须补两条属性，否则点缀层会失控 ── */
.pet-card {
  position: relative;   /* 新增：否则 .aurora-edge 会绝对定位到页面级 */
  overflow: hidden;     /* 新增：否则染边条不被 40rpx 圆角裁切 */
}

/* ── 全图卡遮罩换渐变 ── */
.mall-card-overlay {
  height: 62%;                              /* 55% → 62%，给极光段留出渗透空间 */
  background: var(--aurora-scrim-img);
}

/* ── 新增：文字守护层（修 F3 对比度） ── */
.mall-card-guard {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: var(--aurora-guard-h);            /* 124rpx */
  background: var(--aurora-scrim-guard);
  pointer-events: none;
  z-index: 1;
}
.mall-card-info { position: absolute; z-index: 2; }   /* 抬到守护层之上 */

/* ── 新增：全图卡顶部提亮线 ── */
.aurora-lume-line {
  position: absolute; top: 0; left: 0; right: 0;
  height: 2rpx;                             /* 预览用 1px */
  background: var(--aurora-edge-lume);
  opacity: var(--aurora-falloff);
  pointer-events: none;
  z-index: 1;
}

/* ── .qs-accent 从纯色改极光渐变 ── */
.qs-accent-activity,
.qs-accent-mall { background: var(--aurora-accent-v); }   /* 覆盖原纯色 */
```

### 4.3 Skyline 复现注意事项（**逐条必读**）

| # | 事项 | 做法 |
|---|---|---|
| **S1** | **Skyline 对 `::before` / `::after` 支持不完整** | 所有点缀层写成**真实 `<view>`**。项目里 `.qs-accent` 已是真实 view，照抄这个范式。浏览器预览也用真实元素，保证预览=落地一致 |
| **S2** | **绝不用负 z-index** | 点缀层 `z-index: 1`，内容层 `z-index: 2`；卡片自身 `background` 天然在最底。任何一层都不给负值 |
| **S3** | `.pet-card` 缺 `position:relative` + `overflow:hidden` | 加点缀前**必须补**（见 4.2）。不补则染边条飞出、角晕溢出圆角变方块 |
| **S4** | `radial-gradient` 双半径椭圆语法 Skyline 支持不稳 | 只用 `circle at 100% 0%`。需要椭圆时：固定尺寸 view + `transform: scaleX(1.25)`（transform 是安全 API） |
| **S5** | 半透明一律 `rgba()` 实色叠加 | **不依赖 `backdrop-filter`**。本方案所有层次感来自 alpha 叠加，与毛玻璃无关 |
| **S6** | 不写 `0.5px` 边 | 小程序统一 `1rpx`。需要更细：`height: 2rpx` + `transform: scaleY(0.5)` + `transform-origin: top` |
| **S7** | 不加 `will-change` | Skyline 下无收益，可能额外提层增加内存 |
| **S8** | 无限动画只开 2 处 | 仅 `.qs-item` 两张卡的角晕呼吸。全图卡的 `aurora-scrim-drift` 默认**关闭**，除非真机实测流畅。滚动中的无限动画是掉帧主因 |
| **S9** | `pointer-events: none` | 点缀层全部加上；更稳妥的是这些 view **不绑任何事件**，双保险 |
| **S10** | `.pet-card` 性别 `inset box-shadow` 与新点缀共存 | inset 阴影渲染在背景之上、子 view 之下，与 `z-index:1` 的染边条**不冲突**，无需改动 |
| **S11** | 顶沿染边条两端会被 40rpx 圆角裁切 | 这是**期望行为**——渐变两端 alpha 已是 0，收口自然，不用额外处理 |
| **S12** | 浏览器预览 → WXSS 换算 | 全部 px × 2 = rpx。预览请把视口宽设为 **375px** 校验 |

### 4.4 验收自查清单

- [ ] 五类卡的发丝边都已从炭墨变深绿，但**视觉重量看不出变化**（对就是要看不出）
- [ ] 顶沿染边条峰值在偏右位置，**不居中**
- [ ] 全页角晕**只有 2 枚**（快捷服务两张卡），往下滚不再出现
- [ ] 角晕呼吸周期 7.2s，肉眼几乎察觉不到"在动"
- [ ] 全图卡商品名（白字）在**浅色商品图**上依然清晰 —— 这是 F3 的验收点
- [ ] 金色**没有**出现在任何暖石纸卡的文字上
- [ ] 关掉所有点缀层后，卡片仍是原来的样子（点缀是可完全剥离的一层）

---

## 5. 对比度裁定（WCAG）

| 前景 / 背景 | 对比度 | 判定 |
|---|---|---|
| `#1F3A1F` 文字 / `#F7F5EF` 纸面 | **11.9 : 1** | ✅ AAA |
| `#C9A24B` 金 / `#F7F5EF` 纸面 | **2.2 : 1** | ❌ **不达标** |
| `#C9A24B` 金 / `#0F2410` 深底 | **6.9 : 1** | ✅ AA |
| 白字 / 现状遮罩文字顶行（α≈0.36，浅图） | **2.7 : 1** | ❌ **既存缺陷 F3** |
| 白字 / 新遮罩+守护层（合成 α≈0.75，浅图） | **7.2 : 1** | ✅ AAA |

### 硬规则

> **金 `#C9A24B` 在暖石纸卡上只能作 1px 线 / 描边 / 渐变停点，永远不能作文字色。**
> 金作文字仅允许出现在深绿底上（全图卡遮罩区，6.9:1 达标）。
>
> 这条与项目既有的 `B′ 裁定`（"浅底文字一律深绿或炭墨"）完全一致，本方案不做任何松动。

---

## 6. 落地顺序建议

1. **P0** — 发丝边染绿（1 行覆盖，改动最小，效果最本质）
2. **P0** — 全图卡守护层 + 遮罩换极光渐变（顺手修掉 F3 可访问性缺陷）
3. **P1** — 五类卡顶沿染边条 + falloff 分级
4. **P1** — `.qs-accent` 换极光竖向渐变
5. **P2** — 快捷服务角晕呼吸（真机性能实测后再开）
6. **P2** — 活动卡金信号线

每一档都可独立上线、独立回滚。P0 两项做完就已经"借到光"了，P1/P2 是艺术感的增量。
