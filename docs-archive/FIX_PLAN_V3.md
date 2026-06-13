# AROORO 云函数修复方案规划 v3.0

> 配套《云函数全面审查报告》执行。基于 3 个审查代理的发现，按优先级分 Sprint 推进。
> 创建日期：2026-06-12

---

## 一、规划总览

| 阶段 | Sprint 范围 | 主题 | 任务数 | 状态 |
|------|------------|------|--------|------|
| P0 | Sprint 73 | 安全漏洞修复 | 7 | ⏳ |
| P1 | Sprint 74 | 数据一致性修复 | 8 | ⏳ |
| P2 | Sprint 75 | 代码质量改进 | 10 | ⏳ |
| P3 | Sprint 76 | 架构优化 | 5 | ⏳ |

---

## 二、P0 — 安全漏洞修复（Sprint 73 · 1 周）

### T53: apiProxy 安全加固

**问题**：apiProxy 存在多个严重安全漏洞。

**涉及文件**：
```
cloudfunctions/apiProxy/index.js
```

**修复方案**：
1. 限制 CORS 为具体域名（移除 `*` 通配符）
2. 添加请求输入验证（验证 data 结构）
3. 添加 rate limiting
4. 添加安全头（X-Content-Type-Options, X-Frame-Options）
5. 强制 HTTPS
6. 添加请求日志

**验收标准**：
- [ ] CORS 限制为具体域名
- [ ] 请求输入有验证
- [ ] 有限流机制
- [ ] 有安全头

**预计耗时**：4 小时

---

### T54: 正则注入漏洞修复（adminService）

**问题**：用户输入直接用于 `db.RegExp`，恶意正则可造成 ReDoS 或意外匹配。

**涉及文件**：
```
cloudfunctions/adminService/services/coupon.js:337,557
cloudfunctions/adminService/services/mall.js:34,223-225
cloudfunctions/adminService/services/activity.js:60
cloudfunctions/adminService/services/i18nOverride.js:45
```

**修复方案**：
1. 创建公共转义函数 `escapeRegExp` 到 `common/utils.js`
2. 在所有 `db.RegExp` 调用前转义用户输入
3. 参考 `user.js:14` 的实现

**验收标准**：
- [ ] 所有 `db.RegExp` 调用前都有转义处理
- [ ] 添加单元测试验证转义效果

**预计耗时**：4 小时

---

### T55: 敏感 PII 加密存储（hostService）

**问题**：realName、idCard、phone 等敏感字段以明文存入数据库。

**涉及文件**：
```
cloudfunctions/hostService/index.js:215-244
```

**修复方案**：
1. 在 `createHostProfile` 和 `updateHostProfile` 中调用 `_encryptSensitive` 函数
2. 在读取时调用 `_decryptSensitive` 函数
3. 确保加密子系统已正确初始化

**验收标准**：
- [ ] 敏感字段加密后存储
- [ ] 读取时正确解密
- [ ] 现有功能不受影响

**预计耗时**：6 小时

---

### T56: 团购价格服务端校验（tuanService）

**问题**：`finalPrice` 初始值来自客户端传入的 `tuanPrice`，可被篡改。

**涉及文件**：
```
cloudfunctions/tuanService/index.js:176
```

**修复方案**：
1. 移除客户端传入的 `tuanPrice` 使用
2. 始终从数据库获取商品/SKU 价格
3. 服务端计算最终价格

**验收标准**：
- [ ] 服务端价格从数据库获取
- [ ] 客户端传入的价格被忽略
- [ ] 价格计算正确

**预计耗时**：3 小时

---

### T56: 库存扣减原子性（tuanService）

**问题**：库存检查与扣减不是原子操作，存在 TOCTOU 竞态条件。

**涉及文件**：
```
cloudfunctions/tuanService/index.js:188-259
```

**修复方案**：
1. 使用条件更新：`where({ stock: _.gte(quantity) })`
2. 检查更新结果，如果 `updated === 0` 则表示库存不足
3. 或使用 CloudBase 事务

**验收标准**：
- [ ] 库存扣减是原子操作
- [ ] 不会出现超卖
- [ ] 并发场景测试通过

**预计耗时**：4 小时

---

### T57: 优惠券领取原子性（couponService）

**问题**：`add` 优惠券 + `update` 模板 remaining 两步操作非原子。

**涉及文件**：
```
cloudfunctions/couponService/index.ts:468-471
```

**修复方案**：
1. 先扣减库存：`update({ remaining: _.inc(-1) })`
2. 检查更新结果，如果 `updated === 0` 则表示库存不足
3. 再创建优惠券记录

**验收标准**：
- [ ] 先扣库存再创建
- [ ] 库存不足时返回错误
- [ ] 不会出现多领

**预计耗时**：3 小时

---

### T58: wallet 提现原子性（partnerService）

**问题**：余额查询和扣减之间无锁机制，高并发可超提。

**涉及文件**：
```
cloudfunctions/partnerService/wallet.ts:425-451
```

**修复方案**：
1. 使用条件更新：`where({ openid, balance: _.gte(amount) })`
2. 检查更新结果
3. 或使用 CloudBase 事务

**验收标准**：
- [ ] 余额扣减是原子操作
- [ ] 不会出现超提
- [ ] 并发场景测试通过

**预计耗时**：4 小时

---

### T59: 退款所有权校验（paymentService）

**问题**：`fetchOrderAndVerifyOwnership` 在 DB 异常时吞掉异常，导致退款绕过所有权校验。

**涉及文件**：
```
cloudfunctions/paymentService/refund.ts:219-246
```

**修复方案**：
1. 在 `orderDoc` 为 null 时抛出错误
2. 不吞掉非 BusinessError 异常
3. 确保所有权校验不被绕过

**验收标准**：
- [ ] DB 异常时抛出错误
- [ ] 所有权校验不被绕过
- [ ] 正常流程不受影响

**预计耗时**：2 小时

---

### T60: 邀请统计金额重复计算（userService）

**问题**：`getReferralStats` 中 mall 订单金额被重复计算两次。

**涉及文件**：
```
cloudfunctions/userService/referral.ts:151-167
```

**修复方案**：
1. 第一个查询添加 `type: _.ne('mall')` 排除 mall 类型
2. 或移除第二个 mall 查询

**验收标准**：
- [ ] mall 订单金额只计算一次
- [ ] 统计数据准确

**预计耗时**：2 小时

---

## 三、P1 — 数据一致性修复（Sprint 74 · 1 周）

### T61: petService catch 块保留业务错误语义

**问题**：所有 catch 块统一包装为 DATA 错误，丢失权限/业务错误码。

**涉及文件**：
```
cloudfunctions/petService/index.js:190,221,263,297,321
```

**修复方案**：
1. 检查 `isBusinessError(error)`
2. 如果是 BusinessError，保留原错误码
3. 否则包装为 DATA 错误

**验收标准**：
- [ ] BusinessError 保留原错误码
- [ ] 普通 Error 正确包装

**预计耗时**：3 小时

---

### T62: SKU/商品级库存双重扣减（tuanService）

**问题**：商品级库存被双重扣减。

**涉及文件**：
```
cloudfunctions/tuanService/index.js:253-258
```

**修复方案**：
1. 检查库存扣减逻辑
2. 确保只扣减一次（SKU 级或商品级，不重复）

**验收标准**：
- [ ] 库存只扣减一次
- [ ] 库存数量正确

**预计耗时**：2 小时

---

### T63: 移除敏感字段暴露（hostService/petService）

**问题**：HOST_LIST_FIELDS 和 PET_DETAIL_FIELDS 暴露 openid。

**涉及文件**：
```
cloudfunctions/hostService/index.js:173
cloudfunctions/petService/index.js:63-68
```

**修复方案**：
1. 从字段投影中移除 `openid`、`ownerId`、`_openid`
2. 如果需要关联查询，在服务端处理

**验收标准**：
- [ ] 公开接口不返回敏感字段
- [ ] 相关功能不受影响

**预计耗时**：2 小时

---

### T64: discountRate 范围校验（couponService）

**问题**：负数或 >1 的折扣率会导致异常折扣金额。

**涉及文件**：
```
cloudfunctions/couponService/index.ts:265
```

**修复方案**：
1. 添加 `discountRate` 范围校验（0 < rate <= 1）
2. 无效值时返回错误或使用默认值

**验收标准**：
- [ ] 无效折扣率被拦截
- [ ] 正常折扣率正常工作

**预计耗时**：1 小时

---

### T65: lockCoupon 幂等性（couponService）

**问题**：同一优惠券可被重复锁定。

**涉及文件**：
```
cloudfunctions/couponService/index.ts:489-529
```

**修复方案**：
1. 添加幂等检查：如果已锁定则跳过
2. 或使用条件更新：`where({ status: 'unused' })`

**验收标准**：
- [ ] 重复锁定返回成功（幂等）
- [ ] 不会锁定多张优惠券

**预计耗时**：2 小时

---

### T66: 佣金记录幂等键统一

**问题**：orders.ts 和 commission.ts 使用不同的幂等键。

**涉及文件**：
```
cloudfunctions/orderService/orders.ts:306-310
cloudfunctions/paymentService/commission.ts:238
```

**修复方案**：
1. 统一使用 `orderId` 作为幂等键
2. 或统一使用 `orderNo`

**验收标准**：
- [ ] 幂等键一致
- [ ] 不会创建重复佣金记录

**预计耗时**：2 小时

---

### T67: 加密盐值强制环境变量（hostService）

**问题**：`ENCRYPT_SALT` 有硬编码默认值。

**涉及文件**：
```
cloudfunctions/hostService/index.js:77
```

**修复方案**：
1. 移除硬编码默认值
2. 未配置时抛出错误

**验收标准**：
- [ ] 未配置时抛出错误
- [ ] 配置后正常工作

**预计耗时**：1 小时

---

### T68: adminService isPartner 硬编码修复

**问题**：HTTP/JWT 路径中 `auth.isPartner` 始终设为 `true`。

**涉及文件**：
```
cloudfunctions/adminService/index.ts:529,619
```

**修复方案**：
1. 使用 enrichment 结果中的实际值
2. 不硬编码 `isPartner: true`

**验收标准**：
- [ ] isPartner 使用实际值
- [ ] 权限检查正确

**预计耗时**：2 小时

---

## 四、P2 — 代码质量改进（Sprint 75 · 1 周）

### T69: crypto.js safeEqual 长度不等异常修复

**问题**：`safeEqual` 在字符串长度不同时会抛出 RangeError，可能导致时序攻击或运行时崩溃。

**涉及文件**：
```
cloudfunctions/common/crypto.js
```

**修复方案**：
1. 在 `safeEqual` 中添加长度检查
2. 长度不同时返回 false 而非抛异常

**验收标准**：
- [ ] 长度不等时返回 false
- [ ] 不抛出异常

**预计耗时**：1 小时

---

### T70: validator.ts type: 'array' 校验修复

**问题**：`typeof [] === 'object'`，导致 `type: 'array'` 校验失效。

**涉及文件**：
```
cloudfunctions/common/validator.ts
```

**修复方案**：
1. 添加 `type: 'array'` 的特殊处理
2. 使用 `Array.isArray()` 检查

**验收标准**：
- [ ] `type: 'array'` 校验正确
- [ ] 其他类型校验不受影响

**预计耗时**：1 小时

---

### T71: logger.ts NaN 日志级别修复

**问题**：环境变量配置错误时，`Number("abc")` 返回 NaN，导致所有日志静默。

**涉及文件**：
```
cloudfunctions/common/logger.ts
```

**修复方案**：
1. 添加 NaN 校验
2. NaN 时使用默认级别

**验收标准**：
- [ ] NaN 时使用默认级别
- [ ] 正常值正常工作

**预计耗时**：30 分钟

---

### T72: cache.ts LRU getCache 刷新顺序修复

**问题**：`getCache` 命中后未重新 set 刷新顺序，热 key 可能被误淘汰。

**涉及文件**：
```
cloudfunctions/common/cache.ts
```

**修复方案**：
1. 在 `getCache` 命中时删除并重新 set
2. 刷新 LRU 顺序

**验收标准**：
- [ ] 热 key 不会被误淘汰
- [ ] 缓存功能正常

**预计耗时**：1 小时

---

### T73: cancelOrder 副作用修复

**问题**：`cancelOrder` 直接修改输入 event 对象。

**涉及文件**：
```
cloudfunctions/orderService/orders.ts:694
```

**修复方案**：
1. 创建新对象而非修改输入
2. 使用 `{ ...event, status: 'cancelled' }`

**验收标准**：
- [ ] 不修改输入对象
- [ ] 功能正常

**预计耗时**：1 小时

---

### T70: checkDateAvailability 空 hostId 校验

**问题**：空 hostId 导致查询条件异常。

**涉及文件**：
```
cloudfunctions/orderService/orders.ts:763-791
```

**修复方案**：
1. 添加 hostId 必填校验
2. 空值时返回错误

**验收标准**：
- [ ] 空 hostId 返回错误
- [ ] 正常值正常工作

**预计耗时**：1 小时

---

### T71: sendOrderNotification organizerId 校验

**问题**：未检查 organizerId 是否存在。

**涉及文件**：
```
cloudfunctions/orderService/orders.ts:238
```

**修复方案**：
1. 添加 organizerId 存在性检查
2. 不存在时跳过通知

**验收标准**：
- [ ] 不存在时不发送通知
- [ ] 存在时正常发送

**预计耗时**：1 小时

---

### T72: closePaymentInternal 移除未使用参数

**问题**：`dbInstance` 参数未使用。

**涉及文件**：
```
cloudfunctions/paymentService/pay.ts:407-432
```

**修复方案**：
1. 移除 `dbInstance` 参数
2. 更新所有调用处

**验收标准**：
- [ ] 参数已移除
- [ ] 编译通过
- [ ] 功能正常

**预计耗时**：1 小时

---

### T73: addresses.ts 添加 openid 空值检查

**问题**：所有 handler 缺少 `openid` 空值检查。

**涉及文件**：
```
cloudfunctions/userService/addresses.ts
```

**修复方案**：
1. 在每个 handler 开头添加 `openid` 检查
2. 空值时抛出 AUTH_REQUIRED

**验收标准**：
- [ ] 所有 handler 有 openid 检查
- [ ] 空值时返回错误

**预计耗时**：2 小时

---

### T74: refund.ts 风控 fail-open 监控

**问题**：风控异常时默认放行退款。

**涉及文件**：
```
cloudfunctions/paymentService/refund.ts:300-308
```

**修复方案**：
1. 添加日志记录风控降级事件
2. 添加监控指标

**验收标准**：
- [ ] 风控降级时记录日志
- [ ] 有监控指标

**预计耗时**：1 小时

---

### T75: 公共类型模块抽取

**问题**：AuthLike/CloudEvent/CloudContext 在多个文件重复定义。

**涉及文件**：
```
cloudfunctions/common/types.ts（新增）
```

**修复方案**：
1. 创建 `common/types.ts` 定义基础类型
2. 各服务通过扩展添加特有字段
3. 更新所有导入

**验收标准**：
- [ ] 类型定义统一
- [ ] 各服务正确导入
- [ ] 编译通过

**预计耗时**：4 小时

---

### T76: WECHAT_MINIAPP_SECRET 访问控制

**问题**：敏感凭证可被任意模块访问。

**涉及文件**：
```
cloudfunctions/common/config.js:11-12
```

**修复方案**：
1. 将敏感凭证放入单独的 secrets 模块
2. 限制访问范围
3. 添加访问日志

**验收标准**：
- [ ] 敏感凭证访问受限
- [ ] 有访问日志

**预计耗时**：2 小时

---

### T77: updateHostProfile if-else 分支修复

**问题**：videos 永远无法与 photos 同时更新。

**涉及文件**：
```
cloudfunctions/hostService/index.js:279-284
```

**修复方案**：
1. 改为并行检查
2. 支持同时更新 photos 和 videos

**验收标准**：
- [ ] 可同时更新 photos 和 videos
- [ ] 功能正常

**预计耗时**：1 小时

---

### T78: getOrderDetail catch 块错误码保留

**问题**：catch 块替换错误码。

**涉及文件**：
```
cloudfunctions/hostService/index.js:390-392
```

**修复方案**：
1. 检查 `isBusinessError(error)`
2. 保留原错误码

**验收标准**：
- [ ] BusinessError 保留原错误码
- [ ] 普通 Error 正确包装

**预计耗时**：1 小时

---

## 五、P3 — 架构优化（Sprint 76 · 1 周）

### T79: adminService 双入口统一

**问题**：index.ts 与 index.js 是完全不同的两个实现。

**修复方案**：
1. 统一为一个入口文件
2. 使用 tsc 编译 TypeScript

**验收标准**：
- [ ] 单一入口文件
- [ ] 编译通过
- [ ] 功能正常

**预计耗时**：8 小时

---

### T80: 入口文件拆分

**问题**：adminService 672行、couponService 765行过于冗长。

**修复方案**：
1. 将 HTTP 处理、鉴权、分发逻辑分离
2. 创建独立的路由模块

**验收标准**：
- [ ] 入口文件行数减少
- [ ] 职责清晰
- [ ] 功能正常

**预计耗时**：6 小时

---

### T81: 子服务 TypeScript 迁移

**问题**：adminService/services/* 多为 JS，类型系统断裂。

**修复方案**：
1. 逐步迁移子服务到 TypeScript
2. 添加类型定义

**验收标准**：
- [ ] 核心子服务迁移完成
- [ ] 类型定义完整

**预计耗时**：1 天

---

### T82: validate 函数推广使用

**问题**：三个服务均未使用 validate 校验函数。

**修复方案**：
1. 在关键 handler 中添加 validate 调用
2. 定义校验规则

**验收标准**：
- [ ] 关键 handler 有入参校验
- [ ] 无效参数被拦截

**预计耗时**：4 小时

---

### T83: limit(1000) 替换为分页查询

**问题**：referral.ts 中 limit(1000) 硬编码上限。

**修复方案**：
1. 使用分页查询或聚合函数
2. 支持大数据量场景

**验收标准**：
- [ ] 支持大数据量
- [ ] 统计数据完整

**预计耗时**：4 小时

---

## 六、任务依赖关系

```
Sprint 73 (P0)
├── T53: 正则注入漏洞修复
├── T54: 敏感 PII 加密存储
├── T55: 团购价格服务端校验
├── T56: 库存扣减原子性
├── T57: 优惠券领取原子性
├── T58: wallet 提现原子性
├── T59: 退款所有权校验
└── T60: 邀请统计金额重复计算
    ↓
Sprint 74 (P1)
├── T61: petService catch 块保留业务错误语义
├── T62: SKU/商品级库存双重扣减
├── T63: 移除敏感字段暴露
├── T64: discountRate 范围校验
├── T65: lockCoupon 幂等性
├── T66: 佣金记录幂等键统一
├── T67: 加密盐值强制环境变量
└── T68: adminService isPartner 硬编码修复
    ↓
Sprint 75 (P2)
├── T69-T78: 代码质量改进（10 个任务）
    ↓
Sprint 76 (P3)
├── T79-T83: 架构优化（5 个任务）
```

---

## 七、验收总标准

### 安全性
- [ ] 无正则注入漏洞
- [ ] 敏感字段加密存储
- [ ] 价格/库存/余额操作原子性
- [ ] 所有权校验不被绕过

### 数据一致性
- [ ] 统计数据准确
- [ ] 幂等键统一
- [ ] 错误码保留语义

### 代码质量
- [ ] 无未使用参数
- [ ] 无副作用隐患
- [ ] 入参校验完善
- [ ] 类型定义统一

### 架构
- [ ] 单一入口文件
- [ ] 职责清晰
- [ ] TypeScript 覆盖

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 原子性修复引入回归 | 中 | 高 | 先写测试作为安全网 |
| 加密存储影响查询 | 中 | 高 | 灰度上线 + 回滚方案 |
| 公共类型抽取影响编译 | 低 | 中 | 增量迁移 + CI 验证 |
| adminService 拆分影响路由 | 中 | 高 | 保持兼容 + 逐步迁移 |

---

## 九、参考文档

- [云函数全面审查报告](docs/CLOUD_FUNCTION_AUDIT_REPORT.md)
- [修复方案 v2.0](docs/FIX_PLAN_V2.md)
- [架构概览](docs/ARCHITECTURE.md)
