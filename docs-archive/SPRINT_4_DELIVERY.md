# Sprint 4 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W15-W18

## 目标

- 业务错误模型全面接入：`BusinessError` + `err()` 工厂成为统一抛出点
- `cloudfunctions/common` 模块自动同步到各 service，避免手工 cp
- 支付 / 寄养订单状态机集中管理

## 关键任务完成度

| ID | 任务 | 责任 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| S4-01 | `payment-state-machine.js` 抽离 | D | ✅ | 5 状态 × 7 转换 + 元数据 |
| S4-02 | `boarding-state-machine.js` 抽离 | D | ✅ | 7 状态 × 多转换 + 商户操作映射 |
| S4-03 | `cloudfunctions/common` 同步脚本 | C | ✅ | `sync-cloud-common.js` + `--check` / `--service=` 选项 |
| S4-04 | 错误码全量补齐 | D | ✅ | `toResponse` + `withErrorHandling` + 关键路径迁移 |

## 代码变更摘要

### 1. `cloudfunctions/common/errors.js`

新增两个 API（保持向后兼容）：

```js
// 把 BusinessError 序列化为标准响应
toResponse(err)

// 装饰器风格包装，自动 catch + 序列化
withErrorHandling(handler)
```

`toResponse` 输出结构：

```js
{
  code: 1004,              // ERROR_CODES.NOT_FOUND（按 severity 映射）
  message: '订单不存在',
  data: null,
  error: {
    type: 'ORDER_NOT_FOUND',  // 语义化错误码
    details: { orderId: 'ord_1' }
  }
}
```

### 2. `cloudfunctions/common/auth-middleware.js`

`verifyAuth` 全面 `throw err(...)`：

| 场景 | 旧实现 | 新实现 |
| --- | --- | --- |
| 未登录 | `error.code = ERROR_CODES.AUTH` | `throw err('AUTH_REQUIRED', '未登录')` |
| 非合作伙伴 | `error.code = ERROR_CODES.PERMISSION` | `throw err('PARTNER_REQUIRED', '...')` |
| 权限不足 | `error.code = ERROR_CODES.PERMISSION` | `throw err('PERMISSION_DENIED', '...')` |

### 3. 云函数入口（4 个）

`paymentService / orderService / userService / adminService` 的 `index.js` catch 块统一：

```js
} catch (error) {
  logger.error(action, error)
  if (isBusinessError(error)) {
    return toResponse(error)
  }
  // 兜底：未知 Error 走老格式
  const code = error.code || ERROR_CODES.BUSINESS
  return handleError(error, error.message, code)
}
```

### 4. 关键业务函数迁移（示范）

- `paymentService/services/pay.js#createPayment`：8 处 `return handleError(...)` → `throw err(...)`
- `orderService/orders.js#checkPartnerPermission`：`error.code = ...; throw error` → `throw err('PARTNER_REQUIRED' / 'PERMISSION_DENIED', ...)`

### 5. `scripts/sync-cloud-common.js`

支持三种模式：

```bash
node scripts/sync-cloud-common.js                # 默认同步
node scripts/sync-cloud-common.js --check        # 只检查不写（CI 用）
node scripts/sync-cloud-common.js --service=mallService  # 只同步指定 service
```

输出示例：

```
源：/abs/path/cloudfunctions/common
模式：同步

  [无变更] auth-middleware.js
  [无变更] cache.js
  ...
  errors.js
    [更新] adminService
    [更新] orderService
    ...
汇总：新建 0，更新 14，跳过 224
```

## 测试覆盖

新增 / 更新：

- `test/common-errors.test.js`：从 14 → 25 用例（新增 toResponse / withErrorHandling）
- `test/common-auth-middleware.test.js`：8 个新用例（unauthorized / requireAdmin / permission 分支）
- `test/payment-state-machine.test.js`：8 用例（已就位）
- `test/boarding-state-machine.test.js`：7 用例（已就位）
- `test/sync-cloud-common.test.js`：5 用例（已就位）

汇总：**405 用例**（Sprint 3 末 334 → Sprint 4 末 405，新增 71）

## 退出条件

- [x] 4 个关键 index.js 支持 BusinessError 路径
- [x] `auth-middleware.js` 完全迁移到 throw err
- [x] `toResponse` / `withErrorHandling` 有完整单元测试
- [x] `sync-cloud-common.js` 在本地能跑通（17 文件 × 14 services）
- [x] 全部测试通过：`npx jest` → 22 suites / 405 tests / 1 skipped
- [x] 新增文件 eslint 0 错误

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 大规模迁移 `return handleError → throw err` 工作量大 | 保留 handleError 兼容路径；本次仅迁移关键路径 3 处 + auth-middleware 全部 |
| 客户端依赖 `code` 数字值的兼容 | `toResponse` 通过 `severity` 映射到原 `ERROR_CODES`，老客户端无感 |
| `BusinessError` 单例问题（test 模块缓存） | 测试用例避免直接 `instanceof` 比较，改用 `.toMatchObject({ name, code, message })` |

## 度量看板更新

| 指标 | Sprint 3 末 | Sprint 4 末 |
| --- | --- | --- |
| 单元测试用例 | 334 | 405 |
| common 模块数 | 17 | 17（新增 2 个：toResponse / withErrorHandling API） |
| 状态机实例 | 0 | 2（payment / boarding） |
| 同步脚本 | 0 | 1（`sync-cloud-common.js`） |
| 已迁移到 BusinessError 的关键文件 | 0 | 6 |

## 下一步（Sprint 5 计划）

1. 把 `paymentService/services/*.js` 与 `orderService/orders.js` 其余 ~30 处 `return handleError` 系统性迁移
2. 引入 `error-code-map.json` 静态分析工具，CI 校验新代码不再使用 `error.code = ...` 直赋值
3. `withErrorHandling` 接入 adminService 子 handler（17 个 service）
4. `Sprint 5` 测试目标：覆盖率 ≥ 50%
