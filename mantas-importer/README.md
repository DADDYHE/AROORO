# AROORO · mantas 商品一键导入插件

从 `mall.mantas.cn` **已登录**商品详情页抓取数据，生成 `MGY` 订货编码并一键导入 AROORO 商品库（草稿）。
参考现有 `import1688Product` 思路实现，mantas 价格/图片需登录才能看到，因此走「浏览器插件在已登录页面内抓取」路线（服务端直接抓 URL 拿不到价）。

## SKU 编码规则

```
MGY{订货价}Y{运费}HZ{序号}
```

- `订货价` = mantas 页面显示价（**原值**，不加价）
- `运费` = 每次导入时在弹窗输入一次、整商品共用
- `HZ{序号}` = 每个规格一个码，序号从该商品第 1 个规格起 1、2、3… 递增
- 示例：订货价 39.9、运费 10、第 1 个规格 → `MGY39.9Y10HZ1`

商品库字段：
- `sku.skuCode` = 上面的 MGY 编码
- `sku.price`（上架售价）= 订货价 × 加价倍数（默认 1.5，弹窗可改）
- `sku.originalPrice` = 订货价（进货参考）
- 按 `sourceSkuId`（mantas 商品ID）+ 归属人去重，重复导入覆盖更新

## 插件加载（Chrome / Edge）

1. 打开 `chrome://extensions`（或 `edge://extensions`）
2. 右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」→ 选择本目录 `mantas-importer/`
4. **改完文件后必须点插件卡片上的「↻ 重新加载」** 才能让新代码生效。
5. 点工具栏右侧 **🧩 拼图菜单** → 找到「AROORO mantas 商品一键导入」→ 点 **📌 图钉** 钉到工具栏（否则只在拼图菜单里，容易以为「没图标」）。

> 若加载后卡片出现**红色错误文字**，把错误原文发我——那才是真加载失败；本插件 manifest 已校验合法，正常不会出现。

## 使用流程（两种入口，任选）

**入口 A（推荐，无需找工具栏图标）**：打开 **已登录** 的 `mall.mantas.cn` 商品详情页 → 页面右下角自动出现金色悬浮按钮 **「⬇ 导入到 AROORO」** → 点它即弹出导入面板。

**入口 B**：点工具栏（或拼图菜单里）的插件图标 → 弹出导入面板。

导入面板内：

1. **登录 AROORO 后台**（web-admin，另开一个标签页）——插件自动镜像登录态 JWT；不想开后台可在面板底部「手动粘贴 token」兜底。
2. 面板自动抓取标题 / 图片 / 价格 / 规格候选填入（入口 A/B 打开时都会自动抓当前页）。
3. **填写运费**（必填）→ 按需调整加价倍数、规格订货价、库存。
4. 点「导入到 AROORO 商品库」→ 导入为草稿，去后台编辑上架。

> 抓取是启发式（mantas 页面结构未公开），若自动抓取不准，直接在弹窗里改/补字段即可，不影响导入。

## 目录

- `manifest.json` — MV3 清单（icons + 工具栏图标 + mantas 注入 + 网关 host + web-admin token 镜像）
- `popup.html` / `popup.js` — 弹窗 UI 与抓取/导入逻辑
- `mantas-inject.js` — 注入 mantas 商品页的悬浮「导入」按钮（点击开 popup）
- `token-bridge.js` — 注入 web-admin 页面，镜像登录态 JWT 到插件存储
- `icons/` — 工具栏/扩展管理页图标（金底深绿框）

## 云函数（需同步部署）

`cloudfunctions/adminService/services/mall.js` 新增 `importMantasProduct`（含 `data:URL` / http 图片转存）；
`cloudfunctions/adminService/index.ts` 与编译产物 `index.js` 的 `ACTION_PERMISSIONS` 已加 `importMantasProduct: 'partner'`。

部署（沿用项目既有流程）：

```bash
# 改完 adminService 后部署（保留 env/timeout/runtime）
# 例：tcb / 项目 deploy_cloudfunctions.sh，或 CloudBase 控制台 updateFunctionCode
```

部署注意（铁律）：
- 环境变量勿用 `TENCENTCLOUD_*` / `SCF_` / `QCLOUD_` 前缀。
- CloudBase 有 warm 缓存，部署后务必 `invokeFunction` 触发刷新并验证（或 `getFunctionDownloadUrl` 下载 grep 确认代码已生效），勿轻信「已部署」状态。

## 安全提示

`popup.js` 内嵌了 CloudBase 网关 **API Key（系统管理员）**，仅用于通过网关鉴权层，等价于 web-admin 前端已暴露的 Key。
本插件为个人使用，请勿分发给不可信方；如泄露该 Key 可在 CloudBase 控制台轮换。
