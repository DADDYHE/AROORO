# 重复文件与函数审计

> 审计日期：2026-06-03 · 工具：jscpd（占位）+ ast-grep 启发式

## 1. 文件级重复

| 文件 | 出现位置 A | 出现位置 B | 备注 |
| --- | --- | --- | --- |
| `OrderManager.js` | [subpackages/booking/utils/](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/utils/OrderManager.js) | [subpackages/profile/utils/](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/profile/utils/OrderManager.js) | 完全同名，疑似 copy-paste |
| `eventEmitter.js` | [subpackages/booking/utils/](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/utils/eventEmitter.js) | [subpackages/profile/utils/](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/profile/utils/eventEmitter.js) | 同上 |
| `addressUtils.js` | [subpackages/booking/utils/](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/utils/addressUtils.js) | [subpackages/other/utils/](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/utils/addressUtils.js) | 同上 |
| `BookingDataService.js` | [utils/](file:///Users/yy/Documents/trae_projects/zuoyou/utils/BookingDataService.js) | [subpackages/pet/](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/BookingDataService.js) | 差异点需 diff 确认 |
| `listBehavior.js` | [subpackages/activity/behaviors/](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/activity/behaviors/listBehavior.js) | [subpackages/feeding/behaviors/](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/feeding/behaviors/listBehavior.js) / [subpackages/profile/behaviors/](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/profile/behaviors/listBehavior.js) | 3 份副本 |
| `CouponService.js` | subpackages/booking、coupon、feeding、mall 各一份 | — | 4 份不同实现 |

## 2. 函数级重复（疑似）

| 函数 | 出现位置 | 相似度（启发） | 建议抽象位置 |
| --- | --- | --- | --- |
| `decryptAes256Gcm` | [paymentService/services/notify.js:10-L24](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/paymentService/services/notify.js#L10-L24) + [orderService/payment.js:81-L95](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/payment.js#L81-L95) | 高 | [cloudfunctions/common/crypto.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/crypto.js)（新建） |
| `httpsRequest` | [orderService/payment.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/payment.js) + [orderTimeoutService/index.js:37-L46](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderTimeoutService/index.js#L37-L46) | 高 | [cloudfunctions/common/wechatPayUtils.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/paymentService/services/wechatPayUtils.js) 已存在，需迁移 |
| `generateAuthorization` | [orderService/payment.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/payment.js) | — | 同上 |
| `rsaSign` | [orderService/payment.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/payment.js) | — | 同上 |
| `randomString` | [orderService/payment.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/payment.js) | — | 同上 |
| `isPartner` 判定 | [userService/auth.js:75-L89](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/userService/auth.js#L75-L89) + [adminService/services/auth.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/adminService/services/auth.js) | 高 | [cloudfunctions/common/permissions.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/permissions.js)（新建） |
| `_getDateRange` | [orderService/orders.js:477-L509](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/orders.js#L477-L509) + [orderService/stats.js:68-L76](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/stats.js#L68-L76) | 高 | [cloudfunctions/common/date-utils.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/utils.js) 或新建 `date-range.js` |
| `buildPartnerProfileQuery` | userService + partnerService | 中 | [cloudfunctions/common/queries.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/queries.js)（新建） |
| `validateAddress` | booking + other | 中 | [utils/AddressService.js](file:///Users/yy/Documents/trae_projects/zuoyou/utils/AddressService.js) |

## 3. 抽象策略

### 3.1 同质服务多份副本 → 顶层 services/

- `subpackages/booking/OrderManager.js` → `utils/OrderManager.js`（单一职责）
- `subpackages/{booking,coupon,feeding,mall}/CouponService.js` → `services/CouponService.js`（统一 object literal 风格）

### 3.2 同名 Behavior → 顶层 behaviors/

- `subpackages/{activity,feeding,profile}/behaviors/listBehavior.js` → `behaviors/listBehavior.js`（参数化领域配置）

### 3.3 工具类同质 → common 公共模块

- 加密/签名/HTTP 工具：`cloudfunctions/common/{crypto,wechatPayUtils}.js`
- 权限判定：`cloudfunctions/common/permissions.js`
- 日期范围：`cloudfunctions/common/date-range.js`

## 4. 收益估算

| 维度 | 改造前 | 改造后（目标） |
| --- | --- | --- |
| 文件级重复 | 6+ 对 | 0 |
| 函数级重复 | 估算 30+ | < 5 |
| 关键工具（crypto/date/permission）调用点 | 10+ 直接复制 | 1 个 import |
| 新增业务接入成本 | 高（需复制模板） | 低（import 即用） |

## 5. 验收

- `jscpd --threshold 1` 输出 0 项；
- `ast-grep` 自定义规则「重复工具函数检测」通过；
- 重复文件被引用次数归零（通过 `grep -r` 验证）。

## 6. 实施依赖

- 待：命名规范确定 → 抽取工具函数时统一命名；
- 待：错误码字典确定 → 抽 `permissions.js` 时统一错误返回；
- 待：状态机表确定 → 抽 `state-machine.js` 时复用。
