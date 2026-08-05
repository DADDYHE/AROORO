# 方案 A · 悬浮缎面珠宝盘 — 落地设计令牌与组件规范

> 范围：custom-tab-bar/index.wxss 单文件精化（wxml 零改动、图标资产复用 line/ink）
> 基础：暖石版 212c601 · theme-teal 活令牌
> 本规范为 DADDY 已确认方案 A 的落地依据；对比度均经实测核算，非估算。

## 1. 布局 · 悬浮胶囊（.tab-bar）

- 定位：`position: fixed; bottom: 28rpx; bottom: calc(28rpx + env(safe-area-inset-bottom, 0)); left: 40rpx; right: 40rpx;`
- 尺寸：`height: 132rpx; border-radius: 9999rpx; box-sizing: border-box; z-index: 1000`
- 结构：**删除** `padding-top: 8rpx` 与 `padding-bottom: env(...)`——原为贴地全宽时的安全区补偿，悬浮后 safe-area 计入 bottom 偏移，胶囊整体抬到 home 指示条之上；5 item `flex: 1` 垂直居中
- Skyline：root-portal 已包裹，fixed 相对 viewport 可靠；`calc(rpx + env(px))` 混单位需真机验证（见风险）
- 透出评估：胶囊仅占 132rpx 高，左右 40rpx 留白、底部 28rpx+safe-area 为透明带，页面背景自然透出——这正是"悬浮留白即高级"；页面内容若滚动到胶囊后方需页面底部 padding 补偿（**列入风险，本次不改页面**）

## 2. 缎面材质

- 底渐变：`background: linear-gradient(180deg, #F7F5EF 0%, #ECE4D4 100%)`——**必须不透明实底**，缎面托盘不透内容
- 纸纹：渐变放 `background`，纸纹放 `.tab-bar::before { position:absolute; inset:0; border-radius:inherit; background-image: var(--tb-paper-noise); pointer-events:none }`（**默认此回退方案**，Skyline 多背景图不稳；多背景 `background-image: var(--tb-paper-noise), linear-gradient(...)` 作为已确认支持后的可选优化）
- 顶部高光：`.tab-bar::after { position:absolute; top:1rpx; left:24rpx; right:24rpx; height:1px; background:linear-gradient(90deg, transparent, rgba(255,255,255,.65) 50%, transparent); pointer-events:none }`——左右各留 24rpx，避免 9999rpx 圆角处戳出；**原金发丝 ::before 删除**
- 三层顺序：底渐变(background) → 纸纹(::before) → 高光(::after)

## 3. 双层投影

`box-shadow: 0 10rpx 24rpx rgba(26,26,23,.10), 0 28rpx 64rpx rgba(26,26,23,.18);` —— 跟随 border-radius ✓；两层均为静态值，**禁在动画中逐帧改 box-shadow**

## 4. 选中态 · 去金圆容器

- icon-wrap 去圆容器：`.tab-bar-icon-wrap { width:36rpx; height:36rpx; display:flex; align-items:center; justify-content:center; position:relative; background:none; border:none; border-radius:0 }`（36=图标实际尺寸，作锚点）
- **金点**：`.tab-bar-icon-wrap::after { position:absolute; top:-8rpx; left:50%; margin-left:-4rpx; width:8rpx; height:8rpx; border-radius:50%; background:#C9A24B; box-shadow:0 0 6rpx rgba(201,162,75,.5); opacity:0; transform:scale(0) }`；`.active` 触发 `gold-dot-in 150ms cubic-bezier(0.34,1.56,0.64,1) forwards`。锚定 icon-wrap（=图标正上方 8rpx），比 item::after 稳、不依赖居中数学；中央项伪元素本就禁用，不受影响
- 图标：非选中 `.tab-bar-icon { color:#7D7768 }`（line 资产 currentColor）；选中 `.tab-bar-item.active .tab-bar-icon { color:#1A1A17; transform:scale(1.06) }`——scale 放**图标子层**，不与 worklet 在 wrap 上的按压 scale 冲突；320ms brand ease
- 金晕：`.tab-bar-item.active .tab-bar-icon-wrap { box-shadow:0 0 20rpx rgba(201,162,75,.32) }`（wrap 上 box-shadow，Skyline 可行；静态）
- 文字：`.tab-bar-text { font-size:18rpx; line-height:1; color:#6B6559; font-weight:400; letter-spacing:0.04em; margin-top:6rpx }`；选中 `.active .tab-bar-text { color:#2A2820; font-weight:600; letter-spacing:0.08em }`（编辑级字距；注：现代码非选中是 0.02em 非 0.04，本次抬升）
- 状态三通道冗余：图标 13.8:1 + 文字 11.68:1 + 金点（装饰性）——金点不承担唯一状态信号

## 5. 中央 CTA · 珠宝化

- 金钮保留：104rpx、`margin-top:-48rpx`、圆 50%、`background:#C9A24B` 平涂单层；**删 ::before 金属高光 / ::after 内凹渐变（禁渐变）**
- 金晕+投影：`box-shadow: 0 0 28rpx rgba(201,162,75,.35), 0 10rpx 24rpx rgba(26,26,23,.16)`
- **深绿环裁定：去掉**。理由：金 on 缎面实测仅 1.90:1，金晕+罗盘不足以界定金盘边界 → 补 `box-shadow: 0 0 0 1rpx rgba(26,26,23,.16)` 炭墨镶边，语义为"珠宝镶嵌底座"而非描边（替代原 6rpx 粗绿环；托盘"无边框"语义保持）
- 罗盘：炭墨 #1A1A17 on #C9A24B = 7.27:1 ✓；"宠团团"沿用 --text-on-accent
- 呼吸：改独立金晕层 `.center-button::after { position:absolute; inset:0; border-radius:inherit; box-shadow:0 0 28rpx rgba(201,162,75,.35); opacity:.72; animation:halo-breath 1.6s ease-in-out infinite }`；keyframes 0%/100% opacity .72 scale(1)，50% opacity 1 scale(1.06)。理由：box-shadow 不随 transform scale，逐帧改 box-shadow 性能差；独立层 opacity+scale 廉价且光晕真实呼吸。原按钮体 scale 呼吸（center-btn-glow）删除——珠宝静置托盘上，只有光在呼吸

## 6. 对比度总核算表

| 配对 | 比值 | 判定 |
|---|---|---|
| 选中 label #2A2820 on 缎面深端 #ECE4D4 | 11.68:1 | AAA ✓（浅端 13.54） |
| 非选中 label #6B6559 on 缎面深端 | 4.58:1 | AA ✓（浅端 5.31；全渐变均 ≥4.5） |
| 非选中 icon #7D7768 on 缎面深端 | 3.53:1 | 非文本 3:1 ✓（浅端 4.09） |
| 选中 ink icon #1A1A17 on 缎面深端 | 13.80:1 | AAA ✓ |
| 炭墨罗盘 #1A1A17 on 金 CTA #C9A24B | 7.27:1 | AAA ✓ |
| 金点 #C9A24B on 缎面 | 1.90:1 | 装饰性——状态由图标/文字双通道冗余保证（见 §4） |
| 金晕 0.32 on 缎面 | — | 发光层，装饰性，不承担可辨识度 |
| 高光 rgba(255,255,255,.65) | — | 材质高光，装饰性 |
| CTA 金 on 缎面 | 1.90:1 | 靠 1rpx 炭墨镶边 + 罗盘界定（见 §5） |
| 金 #C9A24B on 深绿 #1F3A1F（旧环，已弃） | 5.20:1 | 仅供对照，本次删除 |

## 7. 动效

- `gold-dot-in`：150ms，scale 0→1 + opacity 0→1，overshoot 缓动（宝石弹入）
- `halo-breath`：1.6s loop，CTA 金晕层 opacity .72↔1、scale 1↔1.06
- 按压 worklet 保留（wrap scale .92→1，与选中 scale 分层不冲突）
- 入场 `tabbar-fade-in` 保留（700ms translateY 24rpx，悬浮感）

## 8. 边界

- wxml 零改动；图标 line/ink 资产复用；其他页面不动
- 金只守两处：CTA + 选中金点；绿 #1F3A1F 完全退出 tabBar（旧圆容器、深绿环、选中绿字均移除）
- 页面底部 padding 补偿列入风险，不在本次落地

## 9. 风险清单

1. **Skyline 悬浮胶囊**：calc(rpx+env) 混单位、9999rpx 大圆角 + fixed 需真机验证；纸纹已走伪元素回退规避多背景风险
2. **双层投影性能**：两层静态 box-shadow 单节点可控；禁动画化；极端低端机可裁一层
3. **金晕强度**：0.32 选中 / 0.35 CTA 在缎面上发光偏柔，真机过曝或过弱需 ±0.05 微调（令牌化）
4. **safe-area**：iPhone 底部 28rpx+safe-area 会抬升胶囊，透明带变宽属预期；无 safe-area 设备回退 bottom:28rpx
5. **页面内容透出**：左右 40rpx 留白与底部透明带露出页面背景；列表滚动至底部会被胶囊遮挡 → 5 个 tab 页需补 ~180rpx 底部 padding（页面级改动，风险提示）
6. **CTA 凸起**：-48rpx 使金钮上探胶囊顶 34rpx，页面顶部附近交互元素可能被遮；若观感过凸可降为 -40rpx（令牌）
7. **字距抬升**：0.02→0.04/0.08em 在 18rpx 字号下可能截字，需检查 label 单行不折行
