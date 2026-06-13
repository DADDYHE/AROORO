# 云函数架构总览

> 本文档描述 `cloudfunctions/` 下的服务划分、依赖关系、调用入口与部署约束。
> 适用人群：新加入项目的后端 / 全栈开发、Sprint 计划者、Code Review 评审人。
>
> 最后更新：2026-06-08（Sprint 47 之后）

---

## 1. 顶层视图

```
┌────────────────────────────────────────────────────────────────────┐
│                        微信小程序 / 公众号 / Web                    │
│   pages/**   services/** (AuthService / CloudFunctionService / …)  │
└───────────────────────────┬────────────────────────────────────────┘
                            │ wx.cloud.callFunction({ name, data:{action, …} })
                            ▼
┌────────────────────────────────────────────────────────────────────┐
│                  CloudBase 云函数（13 个可部署 + 1 个共享）          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────────┐ │
│  │  业务域服务     │  │  聚合服务        │  │  定时/清理服务      │ │
│  │  userService    │  │  adminService   │  │  orderTimeoutService│ │
│  │  hostService    │  │  (16 子模块)     │  │  couponExpiryCheck │ │
│  │  orderService   │  │                 │  │  tuanExpiryCheck   │ │
│  │  paymentService │  │                 │  │                    │ │
│  │  partnerService │  │                 │  │                    │ │
│  │  activityService│  │                 │  │                    │ │
│  │  mallService    │  │                 │  │                    │ │
│  │  feedingService │  │                 │  │                    │ │
│  │  couponService  │  │                 │  │                    │ │
│  │  tuanService    │  │                 │  │                    │ │
│  │  petService     │  │                 │  │                    │ │
│  │  favoriteService│  │                 │  │                    │ │
│  │  utilityService │  │                 │  │                    │ │
│  │  i18nOverride   │  │                 │  │                    │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────┬──────────┘ │
│           └──────────┬────────┴───────────┬────────┘            │
│                      ▼                    ▼                     │
│              ┌────────────────────────────────┐                  │
│              │       common/ 共享模块          │ ←  initCloud /   │
│              │                                │   logger /       │
│              │  utils  logger  auth-middleware│   errors /       │
│              │  errors permissions crypto     │   rate-limit     │
│              │  risk-control  state-machine   │   …              │
│              └────────────────┬───────────────┘                  │
└───────────────────────────────┼────────────────────────────────────┘
                                ▼
                  ┌─────────────────────────────┐
                  │   CloudBase 数据库 / 存储    │
                  │   users / orders / pets …    │
                  │   rate_limits / i18n_overrides│
                  └─────────────────────────────┘
```

---

## 2. 服务矩阵

| 云函数 | 调用入口 | action 数 | 关键子模块 | 触发方式 | 备注 |
|---|---|---|---|---|---|
| **userService** | `services/AuthService.js` | 21 | auth / notifications / referral / addresses | HTTP 调用 | 公共入口（login / check 无需鉴权） |
| **hostService** | `subpackages/booking/**` | 7 | — | HTTP 调用 | AES-256-GCM 加密敏感字段 |
| **orderService** | `services/OrderManager.js` | 17 | orders(15) + stats(2) | HTTP 调用 | 主链路：下单 → 支付 → 完成 |
| **paymentService** | `services/PaymentService.js` | 7 | pay(4) + refund(2) + notify(1) | HTTP + 微信回调 | `paymentNotify` 走 HTTP 分支 |
| **partnerService** | `subpackages/partner/**` | 12 | application / wallet / referral | HTTP 调用 | checkPartnerPermission 鉴权 |
| **activityService** | `subpackages/activity/**` | 13 | — | HTTP 调用 | 报名带风控前置 |
| **mallService** | `subpackages/mall/**` | 17 | — | HTTP 调用 | 商品 + 订单 + 团购 |
| **feedingService** | `subpackages/feeding/**` | 12 | — | HTTP 调用 | 上门 / 钥匙 / 多次访问 |
| **couponService** | `subpackages/coupon/**` | 8 | — | HTTP 调用 | 状态机：unused→locked→used/expired |
| **tuanService** | `subpackages/booking/**` | 3 | — | HTTP 调用 | 团购列表 / 详情 / 下单 |
| **petService** | `subpackages/booking/pet-select` | 6 | — | HTTP 调用 | 软删除（isActive=0） |
| **favoriteService** | `subpackages/other/favorites` | 3 | — | HTTP 调用 | 公开 + 私有混合 |
| **adminService** | web 后台 | 60+ | 16 个 services/* 子模块 | HTTP + JWT | ACTION_PERMISSIONS 权限表 |
| **utilityService** | 多个页面 | 2 | getBanners / getHostInfo | HTTP 调用 | Banner 内存缓存 TTL 5min |
| **i18nOverride** | 客户端匿名 | 2 | fetchActive | HTTP 调用 | wx-server-sdk 降级 |
| **orderTimeoutService** | — | — | — | **cron 30min** | 5 类订单自动取消 |
| **couponExpiryCheck** | — | — | — | **cron 每日** | user_coupons status 扫描 |
| **tuanExpiryCheck** | — | — | — | **cron 每日** | tuan_deals endTime 扫描 |

> ⏰ 三个 cron 服务需要在 CloudBase 控制台配置 7 段 cron 触发器。

---

## 3. 共享模块（`common/`）

所有云函数通过 `require('../common/xxx')` 引入，统一了：

| 模块 | 关键导出 | 说明 |
|---|---|---|
| **utils.js** | `initCloud / generateId / handleSuccess / handleError / paginate / batchProcess` | 单例 cloud & db 初始化 |
| **logger.js** | `createLogger / LOG_LEVELS` | 4 级别日志 + performance + database |
| **auth-middleware.js** | `verifyAuth` | accessToken 解析 + 注入 auth.{openid,roles,permissions} |
| **errors.js** | `err() / isBusinessError / toResponse` | 业务错误统一工厂 |
| **permissions.js** | `ACTION_PERMISSIONS` 映射 | 权限等级定义 |
| **crypto.js** | AES-256-GCM / CBC 双写 | 敏感字段加密（hostService 等） |
| **cache.js** | 内存缓存封装 | utilityService banner 缓存等 |
| **rate-limit-store.js** | `cleanupExpiredRateLimits / getGlobalRateLimitStats` | 基于 db.rate_limits 共享计数 |
| **risk-control.js** | `detectXxxRisk / mapActionToErrorCode` | 业务风控规则 |
| **risk-rate-limit.js** | `withRateLimit / initGlobalRateLimitFromDb` | 限流封装 |
| **state-machine.js** | 状态机 | 订单 / 支付状态流转 |
| **normalize.js** | `ensurePayload / normalizeDbError` | 入参 / DB 错误归一化 |
| **validator.js** | `filterFields / FIELD_WHITELISTS` | 字段白名单过滤 |
| **token-utils.js** | JWT 签发 / 校验 | adminService 走 JWT |
| **types.d.ts** | `CloudEvent / AuthLike / CloudContext` | 公共 TS 类型 |
| **config.js** | `ENDPOINTS` 等常量 | 端点 / 集合名常量 |

详细使用方式见 [COMMON_MODULES_GUIDE.md](../cloudfunctions/common/COMMON_MODULES_GUIDE.md)。

---

## 4. 典型调用链

### 4.1 寄养下单（主链路）

```
[小程序] confirm.js
   └─ wx.cloud.callFunction({ name: 'orderService',
                              data: { action: 'calculatePrice', hostId, startDate, endDate, petIds } })

[orderService]
   ├─ verifyAuth(event)  → 注入 auth
   ├─ handlers.calculatePrice(event, ctx, auth)
   │     ├─ utils.initCloud()            ← 单例
   │     ├─ db.collection('hostProfiles').doc(hostId).get()
   │     ├─ _checkDateAvailability(...)  ← 半开区间
   │     └─ 计算节假日加价
   └─ handleSuccess({ days, basePrice, holidaySurcharge, totalPrice })

[小程序] 再调 createOrder → paymentService.createPayment → 微信支付
       → paymentService.paymentNotify (HTTP 回调) → 状态推进
       → orderService.handleBoardingOrder → _createCommissionRecord
```

### 4.2 报名风控

```
[activityService] submitRegistration
   ├─ detectActivityApplyRisk({ openid, activityId })  ← 风险规则
   ├─ 若触发：err('ACTIVITY_APPLY_RISK', '...')
   └─ withRateLimit('submitRegistration', openid)
       └─ db.collection('registrations').add(...)
```

### 4.3 定时清理

```
[orderTimeoutService] cron 30min 触发
   ├─ fetchAllExpired()  → 分批遍历 5 类订单
   ├─ closeWechatOrder(outTradeNo)  ← 仅未支付的微信订单
   ├─ restoreProductStock()  ← 商城库存回滚
   ├─ unlockOrderCoupons()  ← 优惠券解锁
   ├─ restoreTuanDealStock()  ← 团购名额回滚
   └─ restoreActivityQuota()  ← 活动名额回滚
```

---

## 5. 部署矩阵

### 5.1 配置一致性约束

**以下三处必须保持同步**：

| 位置 | 维护者 | 作用 |
|---|---|---|
| [cloudbaserc.json](../cloudbaserc.json) `functions[]` | 工具部署 | 平台识别的云函数清单 |
| [cloudbaserc.json](../cloudbaserc.json) `framework.plugins.function.inputs.functions[]` | `cloudbase-framework` 部署 | framework 部署清单 |
| [deploy_cloudfunctions.sh](../deploy_cloudfunctions.sh) `CLOUD_FUNCTIONS` 数组 | 手动部署 | 脚本部署清单 |

> ⚠️ 任何新增/删除/重命名云函数必须同时改三处。`deploy_cloudfunctions.sh` 已加入"孤儿目录"检查，运行时会自动提醒哪些目录未列入。

### 5.2 当前部署清单（19 个）

**普通 API 云函数**（timeout 10s）：

```
userService          hostService         orderService
petService           favoriteService     activityService
mallService          feedingService      adminService
utilityService       couponService       tuanService
paymentService       partnerService      i18nOverride
```

**定时 / 清理云函数**（timeout 30s）：

```
orderTimeoutService  couponExpiryCheck   tuanExpiryCheck
rateLimitCleanup
```

### 5.3 ✅ 配置一致性

> **截至 2026-06-08**，所有 `cloudfunctions/` 下的可部署目录都已列入 `cloudbaserc.json` + `deploy_cloudfunctions.sh`。
> `deploy_cloudfunctions.sh` 自带"孤儿目录检测"，运行时会自动告警 — 当前已无孤儿。

历史漂移：曾有 6 个云函数（`couponService / i18nOverride / partnerService / paymentService / rateLimitCleanup / tuanService`）有源码但未配置部署，已在 Sprint 47 末统一补齐。

---

## 6. 权限与鉴权

| 鉴权策略 | 服务 | 备注 |
|---|---|---|
| `verifyAuth(event, { requireLogin: true })` | userService / orderService / mallService / feedingService / activityService / etc. | 大部分 API |
| `NO_AUTH_ACTIONS` 白名单 | userService(`login/check`)、paymentService(`paymentNotify`)、petService(`getPet/getPetDetail`)、feedingService(部分公开)、tuanService(读 action 公开) | 公开 / 回调 |
| `ACTION_PERMISSIONS` 等级映射 | adminService | 4 级：null / partner / admin / super_admin |
| `checkPartnerPermission` | partnerService | 合作伙伴独立链路 |
| HTTP + JWT 解析 | adminService (web 后台) | `parseHttpEvent` / `parseHttpAuth` |

---

## 7. 错误处理约定

```javascript
const { err, toResponse, isBusinessError } = require('./common/errors')
const { handleError, handleSuccess, ERROR_CODES } = require('./common/utils')

// 业务错误：抛 err(code, message)
if (!auth.openid) throw err('AUTH_REQUIRED', '未登录')

// 入口：catch 后分流
catch (e) {
  if (isBusinessError(e)) return toResponse(e)
  return handleError(e, e.message, ERROR_CODES.BUSINESS)
}
```

完整错误码字典：[docs/error-code-map.json](../error-code-map.json)

---

## 8. 监控与可观测

- **日志**：所有服务使用 `createLogger('serviceName')`，按 `[time] [level] [service] [action] ctx` 格式
- **性能日志**：`logger.performance(action, durationMs, ctx)` 自动记录慢请求
- **DB 操作日志**：`logger.database(action, collection, op, ctx)` 记录数据库操作
- **限流统计**：`rateLimitCleanup` action `stats` 拉取 `db.rate_limits` 全局计数

生产环境建议：
- `LOG_LEVEL = LOG_LEVELS.WARN`（仅 WARN / ERROR）
- 关键 action 加 performance 监控

---

## 9. 升级与迁移

| Sprint | 主题 | 关键动作 |
|---|---|---|
| 2 | 加密升级 | AES-256-GCM 替换 AES-256-CBC |
| 9 | 存量数据回填 | `migrate-legacy-data.js` 补 `organizerId` |
| 21 | 全局限流 | `db.rate_limits` 共享计数替代内存计数 |
| 33~47 | TypeScript 迁移 | 14 个服务 `.ts` 化 |
| 46~47 | 批量服务迁移 | i18nOverride / couponService / tuanService / favoriteService / petService / utilityService / orderTimeoutService / couponExpiryCheck / tuanExpiryCheck / rateLimitCleanup / orderService / paymentService |

---

## 10. 常见问题（FAQ）

**Q: 新增一个 action 的步骤是什么？**
1. 在对应 `services/*.ts` 中导出 handler
2. 在 `index.ts` 的 `handlers` 对象中挂载
3. 在 `SUPPORTED_ACTIONS`（如适用）补充白名单
4. 编译 `tsc -p tsconfig.<service>.json`
5. 跑 `npm run test` 确认无回归

**Q: 新增一个云函数的步骤是什么？**
1. 复制现有服务目录（推荐从 `petService` 或 `utilityService` 起步）
2. 改 `package.json` 的 name
3. 写 `index.ts`（参考 `CloudEvent / AuthLike` 类型）
4. 在 `cloudbaserc.json` 三处都加上（顶层 `functions[]` + `framework.plugins.function.inputs.functions[]`）
5. 在 `deploy_cloudfunctions.sh` 的 `CLOUD_FUNCTIONS` 数组中追加
6. 写对应的 jest 单测 / 集成测试

**Q: 编译产物是 .js 还是要上传 .ts？**
- CloudBase / 微信云开发运行 Node.js，**上传编译产物 .js**（不是 .ts）
- 本地开发：`tsc -p tsconfig.<service>.json` 输出到同目录
- CI：`scripts/build-all-services.js` 一键编译所有服务

**Q: 如何调试本地？**
- 微信开发者工具 → 云函数 → 右键 → 本地调试
- VSCode 断点调试：`launch.json` 配置 `wx-server-sdk` runtime
- jest 单元测试：`npm test`，部分 handler 已 mock 掉 `wx-server-sdk`

---

## 11. 相关文档

- [common 模块使用文档](../cloudfunctions/common/COMMON_MODULES_GUIDE.md)
- [错误码字典](../error-code-map.json)
- [cloudbaserc.json](../cloudbaserc.json)
- [deploy 脚本](../deploy_cloudfunctions.sh)
- [审计脚本](../scripts/audit-*.js) — 静态检查
- [Sprint 计划](../docs/superpowers/plans/) — 历史决策

---

**维护者**：开发团队  
**联系方式**：微信开放社区 #云开发 专区
