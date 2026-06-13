# 空 Catch 块审计清单

> 审计日期：2026-06-03 · 总数：**82 处** · 扫描范围：`cloudfunctions/`、`services/`、`subpackages/`

## 1. 风险分级

| 等级 | 数量 | 影响 |
| --- | --- | --- |
| **高**（核心业务 handler / 状态变更） | 14 | 状态/订单/支付错失异常可观测性 |
| **中**（读写操作 / 权限判断） | 38 | 字段缺失/权限失败被静默吞掉 |
| **低**（UI 辅助 / 非关键） | 30 | 用户体验影响小 |

## 2. 高风险 Top 14

| # | 文件 | 行号（节选） | 上下文 | 建议处理 |
| --- | --- | --- | --- | --- |
| 1 | [cloudfunctions/adminService/services/user.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/adminService/services/user.js) | 多处 | 用户禁用/启用/角色变更 | 改 `logger.warn` + 显式判断 `errCode` |
| 2 | [cloudfunctions/adminService/services/wallet.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/adminService/services/wallet.js) | 多处 | 钱包余额/提现 | 抛 `BUSINESS_ERROR` |
| 3 | [cloudfunctions/adminService/services/tuan.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/adminService/services/tuan.js) | 多处 | 团购状态机 | 抛 `STATE_INVALID` |
| 4 | [cloudfunctions/paymentService/services/refund.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/paymentService/services/refund.js) | 多处 | 退款创建 | 抛 `REFUND_FAILED` |
| 5 | [cloudfunctions/orderService/index.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/index.js) | 路由处 | 路由 fallback | 抛 `UNKNOWN_ACTION` |
| 6 | [cloudfunctions/userService/auth.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/userService/auth.js) | 登录/注册 | session 写入 | 抛 `AUTH_FAILED` |
| 7 | [cloudfunctions/userService/referral.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/userService/referral.js) | 9 处 | 推荐关系 | 改 `logger.warn` |
| 8 | [cloudfunctions/partnerService/services/referral.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/partnerService/services/referral.js) | 7 处 | 伙伴邀请 | 改 `logger.warn` |
| 9 | [cloudfunctions/orderService/payment.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/payment.js) | 多处 | 旧版支付实现 | 重定向到 `pay.js` |
| 10 | [cloudfunctions/orderTimeoutService/index.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderTimeoutService/index.js) | 批处理 | 批内单条失败 | 累计 error 计数后抛 |
| 11 | [cloudfunctions/couponExpiryCheck/index.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/couponExpiryCheck/index.js) | 多条 | 过期清理 | 累计 + 日志 |
| 12 | [cloudfunctions/tuanExpiryCheck/index.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/tuanExpiryCheck/index.js) | 多条 | 团购过期 | 同上 |
| 13 | [cloudfunctions/hostService/index.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/hostService/index.js) | 加密/解密 | 密文写入 | 抛 `ENCRYPT_FAILED` |
| 14 | [cloudfunctions/paymentService/services/pay.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/paymentService/services/pay.js) | 关旧单 | 退款关单失败 | 抛 + 重试 |

## 3. 改造模板

### 3.1 推荐：显式错误类型

```js
// 反例
try {
  await db.collection('orders').doc(orderId).update({...})
} catch (e) {}

// 正例 1：明确区分已知/未知错误
try {
  await db.collection('orders').doc(orderId).update({...})
} catch (e) {
  if (e.errCode === 'DATABASE_COLLECTION_NOT_EXIST') {
    throw new BusinessError('ORDER_COLLECTION_MISSING', '订单集合不存在')
  }
  throw e  // 未知错误继续上抛
}

// 正例 2：业务可恢复的容错
try {
  await db.collection('wallets').where({userId}).update({...})
} catch (e) {
  logger.warn('wallet.update_failed', { userId, error: e.message, code: e.errCode })
  // 不上抛，但留下可观测信号
}
```

### 3.2 引入 BusinessError 类

新文件：[cloudfunctions/common/errors.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/errors.js)

```js
class BusinessError extends Error {
  constructor(code, message, details) {
    super(message)
    this.code = code
    this.details = details
  }
}

module.exports = { BusinessError }
```

### 3.3 统一错误处理中间件

在每个云函数入口统一捕获：

```js
const { BusinessError } = require('./common/errors')

exports.main = async (event, context) => {
  try {
    return await router(event, context)
  } catch (e) {
    if (e instanceof BusinessError) {
      logger.warn('business_error', { code: e.code, msg: e.message })
      return { code: e.code, message: e.message, data: null }
    }
    logger.error('unhandled_error', { error: e.message, stack: e.stack })
    return { code: 'INTERNAL_ERROR', message: '服务异常', data: null }
  }
}
```

## 4. 治理计划

| 周次 | 目标 | 数量 |
| --- | --- | --- |
| W4 | adminService 清零 | 25 |
| W5 | userService + partnerService + paymentService 清零 | 35 |
| W6 | orderService + orderTimeout + coupon/tuan expiry 清零 | 22 |
| W6 末 | 全量验证 | 0 |

## 5. 自动检测

新增 ESLint 自定义规则（或 `eslint-plugin-no-only-tests` 类似思路）：

```js
// no-empty-catch-or-return.js
module.exports = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    return {
      CatchClause(node) {
        if (node.body.body.length === 0) {
          context.report({ node, message: '禁止空 catch 块，请至少 logger.warn 记录' })
        }
      },
    }
  },
}
```

## 6. 验收

- 全仓 `} catch (e) {}` 数量：**0**；
- CI 中 `npm run lint:audit` 通过；
- 关键模块（payment/order/auth）错误埋点覆盖率 ≥ 80%。
