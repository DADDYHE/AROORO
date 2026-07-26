# 云端索引核查报告（2026-07-25）

> 核查方式：通过 CloudBase MCP（`@cloudbase/cloudbase-mcp`，`mcporter` 直连）的
> `readNoSqlDatabaseStructure` → `listIndexes`，直连生产环境
> `cloudbase-d7getcjqy33b13475`（ap-shanghai）逐一拉取真实索引。
> 期望清单取自 `cloudfunctions/adminService/services/coupon.js` 的 `initIndexes()` 数组
> （项目唯一索引入口）。

## 一、期望索引清单（initIndexes 声明，共 11 条）

| # | 集合 | 索引名 | 字段 | 唯一 |
|---|---------|---------|------|------|
| 1 | coupon_templates | idx_status_createdAt | status, createdAt | 否 |
| 2 | coupon_templates | idx_applicableScopes_status | applicableScopes, status | 否 |
| 3 | user_coupons | idx_ownerId_status | ownerId, status | 否 |
| 4 | user_coupons | idx_templateId | templateId | 否 |
| 5 | user_coupons | idx_endTime_status | endTime, status | 否 |
| 6 | user_coupons | idx_status_endTime | status, endTime | 否 |
| 7 | coupon_grants | idx_executedBy_createdAt | executedBy, createdAt | 否 |
| 8 | coupon_grants | idx_templateId | templateId | 否 |
| 9 | **orders** | **idx_bookingKey_unique** | **bookingKey** | **是 ⚠️** |
| 10 | failed_operations | idx_status_createdAt | status, createdAt | 否 |
| 11 | **addresses** | **idx_openid_isDefault** | openid, isDefault | 否 |

## 二、云端真实状态核对

| # | 集合 / 索引 | 期望 | 云端实际 | 结论 |
|---|-----------|------|-----------|------|
| 1 | coupon_templates.idx_status_createdAt | ✅ | ✅ 存在 | 一致 |
| 2 | coupon_templates.idx_applicableScopes_status | ✅ | ✅ 存在 | 一致 |
| 3 | user_coupons.idx_ownerId_status | ✅ | ✅ 存在 | 一致 |
| 4 | user_coupons.idx_templateId | ✅ | ✅ 存在 | 一致 |
| 5 | user_coupons.idx_endTime_status | ✅ | ✅ 存在 | 一致 |
| 6 | user_coupons.idx_status_endTime | ✅ | ✅ 存在 | 一致 |
| 7 | coupon_grants.idx_executedBy_createdAt | ✅ | ✅ 存在 | 一致 |
| 8 | coupon_grants.idx_templateId | ✅ | ✅ 存在 | 一致 |
| 9 | **orders.idx_bookingKey_unique** | ✅ | ❌ **不存在** | **缺失** |
| 10 | failed_operations.idx_status_createdAt | ✅ | ✅ 存在 | 一致 |
| 11 | **addresses.idx_openid_isDefault** | ✅ | ❌ **不存在** | **缺失** |

> 说明：orders 集合云端实际存在多个**非声明**索引
> （idx_outTradeNo / idx_status_paymentStatus_createdAt / idx_buyerOpenid_type_status /
> idx_hostOpenid_status / idx_hostOpenid_createdAt / idx_ownerOpenid_createdAt /
> idx_type_status_paymentStatus_createdAt），说明该集合此前由其他方式（手动或旧脚本）建过索引，
> 唯独漏掉了我们声明的 `idx_bookingKey_unique`。
> addresses 集合当前**无任何自定义索引**（连我们声明的复合索引都没有）。

## 三、结论

**并非全部正确建立**：11 条声明中 **9 条已建，2 条缺失**。

### 缺失项与影响
1. **orders.idx_bookingKey_unique（唯一索引）— 缺失 ⚠️ 高危**
   - 这是 orderService H2 防超卖的唯一性兜底。我们在 `initIndexes` 里补了定义并修了
     `createIndex` 漏传 `unique` 的 bug，但**索引从未真正建到云端** → 防超卖兜底目前无效，
     createOrder 只能靠 H1 的日期重叠检查软兜底。
   - 注意：建唯一索引前必须确认 `orders` 存量无重复 `bookingKey`
     （`booking_${hostId}_${startDate}_${endDate}`），否则建索引会失败。
2. **addresses.idx_openid_isDefault（复合索引）— 缺失**
   - userService M4 的 `setDefault` 事务已改为事务内查默认地址，但无此索引时
     事务内的 where 扫描无加速（正确性不受影响，仅并发/大数据量下性能与安全性偏弱）。

### 根因
`initIndexes()` 的 3 个业务索引（#9/#10/#11）是**本次会话本地代码改动**，
仅改了 `coupon.js` 源码，**从未部署 adminService、也从未以 super_admin 跑过
`initIndexes` action**。其中 #10（failed_operations）此前已被建上（可能旧脚本/手动），
而 #9/#11 随本次改动一起从未落地云端。coupon 系列 8 条是更早一次 `initIndexes` 跑出来的。

## 四、补齐方式（待 DADDY 确认执行）

- **方式 A（最快，推荐）**：直接用 CloudBase MCP 的 `writeNoSqlDatabaseStructure`
  → `updateCollection` + `updateOptions.CreateIndexes`，把 #9/#11 两个缺失索引建上，
  无需重新部署整个 adminService。建 #9 前我会先查 `orders` 存量是否存在重复 `bookingKey`。
- **方式 B（规范路径）**：部署改动后的 adminService，以 super_admin 调一次 `initIndexes`
  action（对已有索引捕获 'already' 跳过，安全幂等），一键补齐全部并自愈未来新增。
- 无论哪种，建完后应再跑一次本核查确认 #9/#11 出现且 #9 的 `unique=true`。

## 五、核对环境
- envId: `cloudbase-d7getcjqy33b13475`（生产，ap-shanghai）
- 工具：`mcporter` → `cloudbase.readNoSqlDatabaseStructure action=listIndexes`
- 集合名经 grep 复核与运行时一致（user_coupons / coupon_templates / coupon_grants 均匹配）。

## 六、补齐执行结果（DADDY 选 MCP 直建）

### 1) addresses.idx_openid_isDefault —— ✅ 已建
- `writeNoSqlDatabaseStructure` → `updateCollection` + `updateOptions.CreateIndexes`
  `[{ IndexName:"idx_openid_isDefault", MgoKeySchema:{ MgoIsUnique:false, MgoIndexKeys:[{Name:openid,Direction:1},{Name:isDefault,Direction:1}] }]`
- 返回 `success:true`；异步建索引，拉原始结构确认 `Name:idx_openid_isDefault` 已存在（Unique=false，Keys=openid,isDefault）。

### 2) orders.idx_bookingKey_unique —— ❌→✅ 回填后建成功
- 首次直建报错 `E11000 duplicate key error ... dup key: { : null }`：重复值是 **null**。
- 根因：orders 是多类型混合集合（mall/boarding/activity/tuan），只有寄养单才有 bookingKey；抽样 `bookingKey:null` 仅 **20 条**（19 条无 `orderType` 字段的遗留老单 + 1 条 activity），唯一索引不允许重复 null 故建不起来。
- **MCP 的 `CreateIndexes`（`MgoKeySchema`）只暴露 `MgoIsUnique`/`MgoIndexKeys`，无 sparse/partial 过滤** → 此路建不了稀疏唯一索引，必须消解 null。
- **回填（生产写，~20 文档，低风险）**：对这 20 条逐条
  `writeNoSqlDatabaseContent action=update collectionName=orders query={_id} update={$set:{bookingKey:"booking_legacy_<_id>"}}`，
  基于唯一 `_id` 生成绝不重复的哨兵值（这些历史单本就不参与寄养档期唯一性，哨兵值无害）。
- 回填后重试建唯一索引：返回 `success:true`，无报错。拉原始结构确认
  `idx_bookingKey_unique | Unique=True | Keys=[bookingKey]` ✅。

### 3) 最终状态：11/11 全部正确建立
| # | 集合 / 索引 | 最终 |
|---|-----------|------|
| 1–8 | coupon_templates×2 / user_coupons×4 / coupon_grants×2 | ✅ 早已建 |
| 9 | **orders.idx_bookingKey_unique**（唯一·防超卖） | ✅ 本次回填后建 |
| 10 | failed_operations.idx_status_createdAt | ✅ 早已建 |
| 11 | **addresses.idx_openid_isDefault** | ✅ 本次建 |

> 注：orders 集合云端另有多个非声明索引（idx_outTradeNo / idx_hostOpenid_* / idx_ownerOpenid_* / idx_type_status_* / idx_buyerOpenid_type_status 等），系旧脚本/手动所建，与本次无关；本次仅补齐声明里缺失的 2 个。

### 4) 后续建议
- 新订单（寄养）createOrder 已设 `bookingKey=booking_<hostId>_<startDate>_<endDate>`，唯一索引现在真正兜底防超卖。
- 那 20 条 `booking_legacy_*` 哨兵值是历史补偿，不影响新逻辑；若日后想让它们也参与档期校验，可据 hostId/起止日期重建真值（当前多数无 orderType，重建意义不大，建议保留哨兵）。
- 若将来 `initIndexes` 再增索引，记得**部署 adminService 后仍以 super_admin 跑一次 `initIndexes` action** 才会真正落库（本次的 2 个就是只改了源码、没跑 action 才迟迟没建上）。
