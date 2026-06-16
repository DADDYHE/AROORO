# 佣金系统数据一致性修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复佣金系统中的数据一致性问题，确保已取消的佣金不会被计入统计数据，并在活动订单取消时正确取消佣金记录。

**Architecture:** 修复涉及三个服务模块：partnerService（佣金统计查询）、activityService（活动订单取消）。需要在查询条件中添加 `status: _.neq('cancelled')` 过滤，并在活动订单取消流程中调用 `cancelCommissionRecord()` 函数。

**Tech Stack:** 微信小程序云开发、Node.js、CloudBase

---

## 文件结构

### 需要修改的文件

| 文件路径 | 修改内容 | 优先级 |
|---------|---------|-------|
| `cloudfunctions/partnerService/services/wallet.js` | 第113行：添加 `status: _.neq('cancelled')` 过滤 | P0 |
| `cloudfunctions/partnerService/services/referral.js` | 第234-240行：添加 `status: _.neq('cancelled')` 过滤 | P0 |
| `cloudfunctions/partnerService/services/referral.js` | 第286-290行：添加 `status: _.neq('cancelled')` 过滤 | P0 |
| `cloudfunctions/activityService/index.js` | 活动订单取消时添加佣金取消逻辑 | P1 |

---

## Task 1: 修复钱包服务佣金统计查询过滤

**Files:**
- Modify: `cloudfunctions/partnerService/services/wallet.js:113`

- [ ] **Step 1: 定位需要修改的代码**

打开 `cloudfunctions/partnerService/services/wallet.js`，找到第113行附近的代码：

```javascript
const [commissionRes, hostingRes, feedingRes, walletRes] = await Promise.all([
    db.collection('tuan_commissions').where({ inviterId: openid }).get(),
    // ... 其他查询
]);
```

- [ ] **Step 2: 添加 cancelled 状态过滤**

将第113行修改为：

```javascript
const [commissionRes, hostingRes, feedingRes, walletRes] = await Promise.all([
    db.collection('tuan_commissions').where({ 
        inviterId: openid,
        status: _.neq('cancelled')  // 新增：排除已取消的佣金
    }).get(),
    // ... 其他查询保持不变
]);
```

- [ ] **Step 3: 验证修改**

检查修改后的代码，确保：
- `_.neq('cancelled')` 语法正确（`_` 是 `db.command` 的别名，已在文件顶部定义）
- 查询条件格式正确
- 没有引入语法错误

- [ ] **Step 4: 提交修改**

```bash
git add cloudfunctions/partnerService/services/wallet.js
git commit -m "fix: 钱包服务佣金统计排除已取消记录

- 在 getMyIncomeOverview 查询中添加 status: _.neq('cancelled') 过滤
- 确保已取消的佣金不会被计入收入概览统计
- 修复财务数据准确性问题"
```

---

## Task 2: 修复带货订单列表查询过滤

**Files:**
- Modify: `cloudfunctions/partnerService/services/referral.js:234-240`

- [ ] **Step 1: 定位需要修改的代码**

打开 `cloudfunctions/partnerService/services/referral.js`，找到第234-240行附近的 `getReferralOrders` 函数：

```javascript
async function getReferralOrders(event, context, auth) {
    // ... 前面的代码
    
    const where = { inviterId: openid };
    if (type && type !== 'all') {
        where.orderType = type;
    }
    if (status) {
        where.status = status;
    }
    
    // ... 后面的代码
}
```

- [ ] **Step 2: 添加 cancelled 状态过滤**

将第234行修改为：

```javascript
const where = { 
    inviterId: openid,
    status: _.neq('cancelled')  // 新增：默认排除已取消的佣金
};
if (type && type !== 'all') {
    where.orderType = type;
}
if (status) {
    where.status = status;  // 注意：如果用户指定了 status，会覆盖上面的过滤
}
```

**重要说明：** 如果用户通过 `status` 参数明确指定了要查询的状态（如 `status: 'cancelled'`），后面的 `where.status = status` 会覆盖前面的过滤条件。这是预期行为，允许用户查看特定状态的订单。

- [ ] **Step 3: 验证修改**

检查修改后的代码，确保：
- `_.neq('cancelled')` 语法正确
- 查询条件格式正确
- 用户指定 `status` 参数时仍能正常工作

- [ ] **Step 4: 提交修改**

```bash
git add cloudfunctions/partnerService/services/referral.js
git commit -m "fix: 带货订单列表排除已取消记录

- 在 getReferralOrders 查询中添加 status: _.neq('cancelled') 过滤
- 默认不显示已取消的佣金记录
- 保留用户通过 status 参数查询特定状态的能力"
```

---

## Task 3: 修复带货订单统计查询过滤

**Files:**
- Modify: `cloudfunctions/partnerService/services/referral.js:286-290`

- [ ] **Step 1: 定位需要修改的代码**

在 `cloudfunctions/partnerService/services/referral.js` 中，找到第286-290行附近的 `getReferralOrderStats` 函数：

```javascript
async function getReferralOrderStats(event, context, auth) {
    // ... 前面的代码
    
    const where = { inviterId: openid };
    if (type && type !== 'all') {
        where.orderType = type;
    }
    const res = await db.collection('tuan_commissions').where(where).get();
    
    // ... 后面的代码
}
```

- [ ] **Step 2: 添加 cancelled 状态过滤**

将第286行修改为：

```javascript
const where = { 
    inviterId: openid,
    status: _.neq('cancelled')  // 新增：排除已取消的佣金
};
if (type && type !== 'all') {
    where.orderType = type;
}
const res = await db.collection('tuan_commissions').where(where).get();
```

- [ ] **Step 3: 验证修改**

检查修改后的代码，确保：
- `_.neq('cancelled')` 语法正确
- 查询条件格式正确
- 统计数据计算逻辑正确（第295-299行的 forEach 循环）

- [ ] **Step 4: 提交修改**

```bash
git add cloudfunctions/partnerService/services/referral.js
git commit -m "fix: 带货订单统计排除已取消记录

- 在 getReferralOrderStats 查询中添加 status: _.neq('cancelled') 过滤
- 确保已取消的佣金不会被计入带货统计
- 修复 totalOrders、totalCommission、pendingCommission、settledCommission 统计准确性"
```

---

## Task 4: 添加活动订单佣金取消逻辑

**Files:**
- Modify: `cloudfunctions/activityService/index.js`

- [ ] **Step 1: 定位活动订单取消逻辑**

打开 `cloudfunctions/activityService/index.js`，搜索活动订单取消的相关代码。

活动订单取消可能发生在以下场景：
1. 用户主动取消订单（通过 orderService）
2. 活动被取消或删除

首先检查是否已有订单取消处理逻辑。搜索关键词：
- `cancelled`
- `cancelOrder`
- `updateOrderStatus`

- [ ] **Step 2: 确认订单取消流程**

活动订单的取消通常通过 `orderService/orders.js` 的 `updateOrderStatus` 函数处理。

检查 `orderService/orders.js` 中是否已有佣金取消逻辑：

```javascript
// 在 orderService/orders.js 中搜索
if (status === 'cancelled') {
    // 检查是否已有 cancelCommissionRecord 调用
}
```

根据审计报告，`orderService/orders.js` 第590-591行已经有佣金取消逻辑：

```javascript
const { cancelCommissionRecord } = require('../../common/commission-utils');
await cancelCommissionRecord(orderId);
```

**这意味着活动订单通过 orderService 取消时，佣金取消逻辑已经存在。**

- [ ] **Step 3: 检查 activityService 中的取消逻辑**

检查 `activityService/index.js` 中是否有直接取消活动订单的逻辑（不通过 orderService）。

搜索以下场景：
1. 活动删除时是否需要取消相关订单
2. 活动状态变更时是否需要取消订单

如果 `activityService` 中没有直接取消订单的逻辑，那么所有活动订单取消都会通过 `orderService`，佣金取消逻辑已经覆盖。

- [ ] **Step 4: 验证活动订单取消流程**

测试活动订单取消流程：

1. 创建一个活动订单
2. 取消该订单
3. 检查 `tuan_commissions` 集合中对应记录的 `status` 是否变为 `cancelled`

验证 SQL：
```javascript
db.collection('tuan_commissions')
  .where({ orderId: '订单ID' })
  .get()
```

预期结果：
```javascript
{
  status: 'cancelled',
  cancelledAt: Date,
  updatedAt: Date
}
```

- [ ] **Step 5: 如果 activityService 中有直接取消逻辑，添加佣金取消**

如果在 Step 3 中发现 `activityService` 中有直接取消订单的逻辑（不通过 orderService），需要添加佣金取消调用：

```javascript
// 在活动订单取消逻辑中添加
try {
    const { cancelCommissionRecord } = require('../common/commission-utils');
    await cancelCommissionRecord(orderId);
    logger.info('activityOrder.commission.cancelled', { orderId });
} catch (commissionErr) {
    logger.warn('activityOrder.commission.cancel.failed', { 
        orderId, 
        msg: commissionErr?.message 
    });
}
```

- [ ] **Step 6: 提交修改（如果需要）**

如果 Step 5 中添加了代码：

```bash
git add cloudfunctions/activityService/index.js
git commit -m "fix: 活动订单取消时取消佣金记录

- 在活动订单取消流程中调用 cancelCommissionRecord()
- 确保已取消的活动订单不会产生佣金
- 与 orderService 的佣金取消逻辑保持一致"
```

如果 Step 5 中不需要修改（所有取消都通过 orderService），则提交验证结果：

```bash
git commit --allow-empty -m "verify: 活动订单佣金取消逻辑已覆盖

- 确认所有活动订单取消都通过 orderService 处理
- orderService 中已有佣金取消逻辑（第590-591行）
- 无需在 activityService 中重复添加"
```

---

## Task 5: 部署和验证

**Files:**
- Deploy: `cloudfunctions/partnerService`
- Deploy: `cloudfunctions/activityService`（如果 Task 4 有修改）

- [ ] **Step 1: 部署 partnerService**

```bash
cd cloudfunctions/partnerService
npm install  # 如果有依赖变更
tcb fn deploy partnerService
```

或使用项目部署脚本：
```bash
npm run deploy:partnerService
```

- [ ] **Step 2: 部署 activityService（如果需要）**

如果 Task 4 中有修改：

```bash
cd cloudfunctions/activityService
npm install  # 如果有依赖变更
tcb fn deploy activityService
```

- [ ] **Step 3: 验证佣金统计查询**

在小程序中测试：

1. 登录一个有佣金记录的合作伙伴账号
2. 进入"佣金管理"页面
3. 查看"收入概览"
4. 确认已取消的佣金没有被计入统计

验证点：
- 总收入是否正确
- 待结算佣金是否正确
- 已结算佣金是否正确
- 月度收入是否正确

- [ ] **Step 4: 验证带货订单列表**

在小程序中测试：

1. 进入"带货订单"页面
2. 查看订单列表
3. 确认已取消的订单没有显示（除非明确筛选"已取消"状态）

验证点：
- 默认列表不显示已取消订单
- 可以通过状态筛选查看已取消订单
- 订单数量统计正确

- [ ] **Step 5: 验证活动订单佣金取消**

测试活动订单取消流程：

1. 创建一个活动订单
2. 等待佣金记录生成（订单支付成功后）
3. 取消该订单
4. 检查佣金记录状态

验证 SQL：
```javascript
// 查询订单对应的佣金记录
db.collection('tuan_commissions')
  .where({ orderId: '订单ID' })
  .get()
```

预期结果：
```javascript
{
  status: 'cancelled',
  cancelledAt: Date,
  updatedAt: Date
}
```

- [ ] **Step 6: 验证带货订单统计**

在小程序中测试：

1. 进入"带货统计"页面
2. 查看统计数据
3. 确认已取消的订单没有被计入统计

验证点：
- 总订单数是否正确
- 总佣金是否正确
- 待结算佣金是否正确
- 已结算佣金是否正确

- [ ] **Step 7: 提交部署验证结果**

```bash
git commit --allow-empty -m "verify: 佣金系统数据一致性修复验证通过

- 钱包服务佣金统计正确排除已取消记录
- 带货订单列表正确排除已取消记录
- 带货订单统计正确排除已取消记录
- 活动订单取消时正确取消佣金记录
- 所有财务统计数据准确"
```

---

## Task 6: 文档更新（可选）

**Files:**
- Create: `docs/fixes/commission-consistency-fix.md`

- [ ] **Step 1: 创建修复文档**

创建 `docs/fixes/commission-consistency-fix.md`，记录修复内容：

```markdown
# 佣金系统数据一致性修复

## 问题描述

佣金系统存在数据一致性问题：
1. 佣金统计查询未过滤 `cancelled` 状态，导致已取消的佣金被计入统计
2. 活动订单取消时可能未取消佣金记录（需验证）

## 修复内容

### 1. 佣金统计查询过滤

修改文件：
- `cloudfunctions/partnerService/services/wallet.js`
- `cloudfunctions/partnerService/services/referral.js`

修改内容：
- 在佣金查询中添加 `status: _.neq('cancelled')` 过滤
- 确保已取消的佣金不会被计入统计

### 2. 活动订单佣金取消

验证结果：
- 所有活动订单取消都通过 `orderService` 处理
- `orderService` 中已有佣金取消逻辑
- 无需在 `activityService` 中重复添加

## 影响范围

- 合作伙伴佣金收入显示
- 带货订单列表和统计
- 活动订单佣金处理

## 测试验证

- [x] 钱包服务佣金统计正确
- [x] 带货订单列表正确
- [x] 带货订单统计正确
- [x] 活动订单佣金取消正确

## 部署信息

部署时间：YYYY-MM-DD
部署环境：生产环境
部署人：[姓名]
```

- [ ] **Step 2: 提交文档**

```bash
git add docs/fixes/commission-consistency-fix.md
git commit -m "docs: 添加佣金系统数据一致性修复文档"
```

---

## 回滚计划

如果修复后出现问题，可以按以下步骤回滚：

### 回滚 Task 1-3（佣金统计过滤）

```bash
git revert <commit-hash>
tcb fn deploy partnerService
```

回滚后，已取消的佣金会重新被计入统计，但不会影响其他功能。

### 回滚 Task 4（活动订单佣金取消）

如果 Task 4 有修改：

```bash
git revert <commit-hash>
tcb fn deploy activityService
```

回滚后，活动订单取消时不会取消佣金记录。

---

## 后续优化建议

### 1. 统一佣金创建实现（P2）

当前存在多个独立的佣金创建实现：
- `common/commission-utils.ts` - 通用版本
- `orderService/orders.js` - 内部实现
- `activityService/index.js` - 内部实现
- `feedingService/index.js` - 内部实现
- `mallService/index.ts` - 内部实现
- `paymentService/services/commission.ts` - 内部实现

建议统一使用 `common/commission-utils.ts` 的实现，减少代码重复和维护成本。

### 2. 添加佣金状态流转日志（P2）

建议在佣金状态变更时记录操作日志，便于追踪和审计：
- 创建时记录 `created`
- 取消时记录 `cancelled`
- 结算时记录 `settled`

### 3. 添加佣金数据一致性检查脚本（P3）

创建一个定期检查脚本，检测数据不一致问题：
- 查找已取消订单但佣金状态仍为 `pending` 的记录
- 查找已完成订单但没有佣金记录的订单
- 生成数据一致性报告

---

## 检查清单

在合并代码前，确保以下项目都已完成：

- [ ] Task 1: 钱包服务佣金统计查询已修复
- [ ] Task 2: 带货订单列表查询已修复
- [ ] Task 3: 带货订单统计查询已修复
- [ ] Task 4: 活动订单佣金取消逻辑已验证/修复
- [ ] Task 5: 所有修改已部署并验证通过
- [ ] Task 6: 修复文档已创建（可选）
- [ ] 所有测试用例通过
- [ ] 代码审查通过
- [ ] 回滚计划已准备

---

## 联系信息

如有问题，请联系：
- 项目负责人：[姓名]
- 技术负责人：[姓名]
- 测试负责人：[姓名]
