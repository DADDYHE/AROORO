# Design 资产目录

> 本目录是 AROORO 小程序所有设计稿与设计哲学文档的统一归档。

## 目录约定

每个页面通常包含两类资产：

- **`<page>-philosophy.md`**：设计哲学（色彩体系、空间节奏、动效语言）
- **`<page>-design.png`**：设计稿截图

部分早期页面仅有设计稿，没有哲学文档。

## 设计哲学索引

| 文件 | 主题 | 风格关键词 |
|---|---|---|
| [cerulean-trust-confirm-service.md](./cerulean-trust-confirm-service.md) | 寄养服务详情 | Cerulean Trust · 蓝色信任 · 画廊式 |
| [violet-precision.md](./violet-precision.md) | 通用精细化设计 | Violet Precision · 紫色精致 · Apple 极简 |
| [violet-precision-order-detail.md](./violet-precision-order-detail.md) | 订单详情 | Violet Precision 延伸 |
| [group-buy-selector-philosophy.md](./group-buy-selector-philosophy.md) | 团购选择器 | （待补充主题） |
| [product-detail-philosophy.md](./product-detail-philosophy.md) | 商品详情 | Gallery Stillness · 美术馆静谧 |

## 设计稿索引

| 页面 | 文件 |
|---|---|
| 寄养服务详情 | [confirm-service-design.png](./confirm-service-design.png) |
| 团购选择器 | [group-buy-selector.png](./group-buy-selector.png) |
| 商品详情 | [product-detail-design.png](./product-detail-design.png) |
| 订单详情 | [mall-order-detail-design.png](./mall-order-detail-design.png) |
| 登录页 | [login-page-design.png](./login-page-design.png) |
| 地址管理 | [address-design.png](./address-design.png) |

## 命名规范（建议）

后续新增设计稿请遵循：

```
<页面英文名>-<asset-type>.<ext>
```

其中：

- `asset-type ∈ {philosophy, design, mockup}`
- 哲学文档使用 `philosophy.md` 后缀
- 设计稿截图使用 `design.png` 后缀
- 多页同主题可加子目录（如 `violet-precision/`、`cerulean-trust/`）

## 历史

- 2026-06-08：原 `design/` 目录 9 个文件统一迁入本目录
