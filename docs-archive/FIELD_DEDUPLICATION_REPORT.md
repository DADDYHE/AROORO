# 字段去重审计报告

> 审计日期：2026-06-03 · 审计方式：grep + ast-grep 规则扫描 · 数据来源：Sprint 0 阶段产物

## 1. 审计方法

```bash
# 1) 同义字段扫描
ast-grep --pattern '$obj.$field' --lang js --filter 'kind: member_expression' cloudfunctions/ services/ subpackages/

# 2) 命名变体归并
grep -rE "\.(petIds?|pets|petInfos|petsInfo|petsDetails)\b" \
  cloudfunctions/ services/ subpackages/ --include="*.js"
```

## 2. 重复字段全景

| 同义维度 | 出现变体 | 出现位置（节选） | 推荐统一 | 优先级 |
| --- | --- | --- | --- | --- |
| **数据库主键** | `_id`, `id` | [orderService/orders.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/orders.js) / [subpackages/booking/host-list.js:36](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/booking/host-list.js#L36) | DB 层 `_id`、前端 `id`（DB → 前端规范化） | P0 |
| **创建时间** | `createAt`, `createdAt`, `createTime` | [utils/dateUtils.js](file:///Users/yy/Documents/trae_projects/zuoyou/utils/dateUtils.js) 等 | `createdAt` | P0 |
| **更新时间** | `updateAt`, `updatedAt` | 多处 | `updatedAt` | P0 |
| **订单时长** | `days`, `duration`, `nights` | [orderService/orders.js:702](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/orders.js#L702) | `duration`（单位：天） | P1 |
| **宠物列表** | `petIds`, `pets`, `petsInfo`, `petInfos` | [orderService/orders.js:43-L44](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/orders.js#L43-L44) | `petIds`（ID 列表） + `petInfos`（快照列表） | P0 |
| **寄养家庭标识** | `hostId`, `hostInfo._id`, `hostInfo.id` | [orderService/orders.js:71-L124](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/orders.js#L71-L124) | 引用：`<entity>Id`；嵌入快照：`hostInfo` | P0 |
| **昵称** | `nickname`, `nickName` | 散布 | `nickName` | P1 |
| **价格** | `price`, `totalPrice`, `totalAmount`, `amount`, `money` | [orderService/orders.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/orderService/orders.js) | `price`（单价）/ `amount`（订单金额）/ `refundAmount`（退款） | P0 |
| **状态** | `status`, `orderStatus`, `payStatus`, `isPaid` | 多处 | 顶层 `status`；细分状态独立字段 | P0 |
| **佣金** | `commission`, `commissionAmount`, `rate` | [paymentService/services/commission.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/paymentService/services/commission.js) | `commissionAmount`（分）/ `commissionRate`（0-1） | P1 |
| **商品 ID** | `productId`, `goodsId`, `itemId` | [subpackages/mall](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/mall) | `productId`（商城）/ `serviceId`（服务类） | P1 |
| **用户 ID** | `userId`, `uid`, `_openid` | 多处 | `userId`（业务）/ `_openid`（微信原生） | P0 |
| **地址** | `address`, `addressInfo`, `location` | [subpackages/other/utils/addressUtils.js](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/other/utils/addressUtils.js) | `address`（标准结构） | P2 |
| **时间戳** | `timestamp`, `time`, `ts`, `at` | 多处 | `at` 后缀表时间点（`paidAt`, `refundedAt`） | P2 |
| **性别** | `sex`, `gender` | [subpackages/pet/services/petService.js](file:///Users/yy/Documents/trae_projects/zuoyou/subpackages/pet/services/petService.js) | `gender` | P2 |
| **头像** | `avatar`, `avatarUrl`, `headImg` | 散布 | `avatarUrl` | P2 |

## 3. 集合名重复/不一致

| 集合名 | 推荐 | 备注 |
| --- | --- | --- |
| `tuan_commissions` | `tuanCommissions` | snake_case → camelCase |
| `tuan_participants` | `tuanParticipants` | 同上 |
| `host_profiles` | `hostProfiles` | 同上 |
| `user_coupons` | `userCoupons` | 同上 |
| `activity_registrations` | `activityRegistrations` | 同上 |
| `review_images` | `reviewImages` | 同上 |
| `wallet_transactions` | `walletTransactions` | 同上 |
| `service_orders` | `serviceOrders` | 同上 |

> 风险评估：集合重命名会触发 CloudBase 索引重建与缓存失效，必须配合「双写期 + 灰度切换」。

## 4. 字段归一化函数（建议位置）

新文件：[cloudfunctions/common/normalize.js](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/normalize.js)

```js
// normalize.js —— 字段归一化适配层（v1.x 双写期使用）
// 作用：DB 读出后立即归一化为统一命名，DB 写入前归一化为旧命名。
// 计划在 v2.0 移除。

function normalizeOrder(order) {
  if (!order) return order
  return {
    ...order,
    id: order._id,
    createdAt: order.createdAt || order.createAt,
    duration: order.duration ?? order.days ?? order.nights,
    petIds: order.petIds || order.petIDs || [],
    petInfos: order.petInfos || order.petsInfo || order.pets || [],
    hostId: order.hostId || order.hostInfo?._id,
    amount: order.amount ?? order.totalAmount ?? order.totalPrice,
  }
}

module.exports = { normalizeOrder }
```

## 5. 改造路径

1. **v1.0（兼容期）**：所有云函数返回前过 `normalizeOrder` / `normalizeHost`；
2. **v1.1（双写期）**：写入 DB 时同时写新字段，旧字段保留 3 个月；
3. **v2.0（清理期）**：删除旧字段，移除 `normalize.js`。

## 6. 验收

| 指标 | 基线 | 目标 |
| --- | --- | --- |
| 同义字段数 | 16 类 | ≤ 3 类（仅允许 `_id`/`id`、`days`/`duration` 过渡） |
| 命名规范文档覆盖 | — | 100% |
| ESLint `camelcase` 规则 | 未启用 | 全仓 0 警告 |
| 数据迁移脚本 | — | 幂等、可回滚 |

## 7. 待确认事项

- [ ] `_openid` 是否前端可见（建议只在服务端使用，传输层用 `userId`）；
- [ ] `timestamp` 字段是 Unix 毫秒还是 ISO 字符串（需全仓规范）；
- [ ] 集合重命名是否走 CloudBase 工具脚本还是手动迁移。
