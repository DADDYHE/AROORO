# 渐进迁移状态跟踪

> 跟踪项目内 `@deprecated` 标记的兼容层文件，记录迁移进度和下一步动作。

---

## 1. orderService/payment（迁移至 paymentService）

| 字段 | 状态 |
|---|---|
| **来源** | `cloudfunctions/orderService/payment.{ts,js,d.ts}` |
| **目标** | `cloudfunctions/paymentService/services/pay.js` |
| **引入版本** | Sprint 29（订单服务支付 TS 迁移） |
| **@deprecated 标记** | 文件头 + 2 个内部函数（payment.ts:259, 342 / payment.js:147, 216） |
| **保留原因** | 向后兼容，避免硬切换；外部已部署的客户端仍在调旧版 |
| **迁移进度** | ⏳ 待迁移（无主动切换计划） |

### 跟踪的钩子

- `tsconfig.paymentService.json` — include `orderService/payment.ts`
- `scripts/audit-s29-order-service-payment-ts.js` — 审计脚本
- `test/order-service-payment-ts-migration.test.js` — 迁移测试

### 完成迁移的标准

满足**全部**以下条件时，可在后续 Sprint 删除旧文件：
- [ ] 客户端（小程序 + 后台）**全部调用** `paymentService.cloud` 而非 `orderService` 支付
- [ ] 旧版微信支付回调 URL 已下架（开发后台确认）
- [ ] 至少 1 个 release 版本（≥ v2.x）已发布且**无支付失败工单**
- [ ] `npm run ci:check` 通过
- [ ] 本文件相应行改为 ✅ 已完成

### 注意事项

- 旧文件被 `cloudfunctions/orderService/services/`（由 `cloudfunctions/orderService/index.js` 间接 require）路由，**不要在 `orderService/index.js` 中删 import 直到全部客户端切换完**
- `tsconfig` 已 include 旧文件以保持 TS 类型推断可用
- 删除前需要先在 `audit-s29` 脚本中标记该路径为"已退役"，避免 audit 误报

---

## 2. 后续记录模板

未来新增 `@deprecated` 兼容层时，按以下模板在本文件追加：

```markdown
## N. <旧文件路径>（迁移至 <目标路径>）

| 字段 | 状态 |
|---|---|
| **来源** | `path/to/old.{ts,js}` |
| **目标** | `path/to/new.{ts,js}` |
| **引入版本** | Sprint XX |
| **@deprecated 标记** | <位置清单> |
| **保留原因** | <理由> |
| **迁移进度** | ⏳ 待迁移 / 🚧 迁移中 / ✅ 已完成 |

### 完成迁移的标准
- [ ] ...

### 注意事项
- ...
```

---

**维护人**：项目 owner
**最后更新**：2026-06-06
