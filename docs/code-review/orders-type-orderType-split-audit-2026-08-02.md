# orders 集合 `type` / `orderType` 双字段分裂影响审查

> 审查日期：2026-08-02
> 审查人：左左（Zuozuo）
> 范围：`cloudfunctions/**` 与 `subpackages/**` 中所有对 `orders` 集合按订单类型过滤的读写
> 结论：**存在系统性的查询落空与至少一处静默 regression，影响资金统计与邀请收益，需编排修复**

---

## 一、写入矩阵（orders 集合实际写了什么，已逐行核实）

| 订单类型 | 写入方 | 写入字段 | 所在集合 | 核实位置 |
|---|---|---|---|---|
| mall | mallService | `type:'mall'` | orders | `mallService/index.ts:1180` |
| group_buy | mallService / tuanService | `type:'group_buy'` | orders | `mallService/index.ts:1063`、`tuanService/index.ts:731` |
| activity（镜像单） | orderService(createActivityOrder) | `orderType:'activity'` | orders | `orderService/orders.ts:1021` |
| **boarding（寄养）** | orderService(createOrder) | **无 `type`、无 `orderType`** | orders | `orderService/orders.ts:832-864`（整段无类型字段） |
| feeding | feedingService | `orderType:'feeding'` | **feedingOrders**（不在 orders） | `feedingService/index.ts:501` |

**核心事实**：`orders` 集合里同时存在两套约定——mall/group_buy 写 `type`，activity 写 `orderType`，而**寄养单两个字段都没写**。三类写入方各写各的，没有任何统一字段。

---

## 二、读方混乱全景

- 用 `type` 查 → 只能命中 mall / group_buy（它们写了 `type`）。
- 用 `orderType` 查 → 只能命中 activity（及 feeding，但 feeding 在 feedingOrders 集合）。
- **寄养单无任何类型字段**，只能靠 `type:null`（缺失字段）或 `hostId`/`bookingKey` 前缀兜底捞，无法用类型字段精确区分。

---

## 三、Bug 清单（按严重度）

### 🔴 P0 — 合作伙伴资金统计漏单（静默错误，不报错但数字为 0）

1. **`adminService/services/wallet.js:34`**
   `db.collection('orders').where({ organizerId, status:'completed', type:'boarding' })`
   → 寄养单无 `type` 字段，**`hostingRes` 永远为空** → 返回给合作伙伴的「寄养服务收入(hosting)」指标**永久为 0**。
2. **`adminService/services/wallet.js:149`**
   `where({ organizerId, status:'completed', orderType:'boarding' })`
   → 寄养单也无 `orderType`，同一函数另一下支同样 **0 命中**。
3. **`partnerService/services/wallet.ts:306`**
   `boardingMatch = { organizerId, status:_.in(COMPLETED_BOARDING_STATUSES), type:'boarding' }`
   → 合作伙伴钱包寄养收入聚合**全漏**（资金统计错）。
4. **`partnerService/services/referral.js:201`、`referral.ts:289`**
   `where({ ownerId, type:'boarding', status:'completed' })`
   → 合作伙伴邀请维度寄养漏单。

### 🔴 P0 — `userService/referral.ts` 的「L3 修复」实为 regression（最隐蔽）

> 该文件注释（:149-150）自信声称「orders 真实字段是 orderType，原 type 查不到，修正为 orderType 才正确」——**这个认知是错的**，mall 单（mallService:1180）写的是 `type:'mall'`，根本没有 `orderType`。

- **`:158`** `match({ ..., orderType:'mall' })` 查 mall 单 → mall 单无 `orderType` → **mall 消费桶恒为 0（回归，原 `type:'mall'` 本正确）**。
- **`:153`** `match({ ..., orderType:_.ne('mall') })` 想排掉 mall → 因 mall 单 `orderType` 为 `undefined`，`undefined != 'mall'` 为真，**mall 单反而被纳入「非 mall 桶」**。
- 结果：邀请收益统计中，mall 消费额被错算进「非 mall」桶、mall 桶为 0，且有效下单人数/消费额全部失真。
- 同一逻辑存在于 `userService/referral.js:92 / :195 / :200`（JS 版）。

### 🟠 P1 — 用户维度统计漏寄养单

5. `adminService/services/user.js:426` `ORDER_TYPE_MAP.boarding = { collection:'orders', where:{ type:'boarding' } }` → 用户中心「我的订单/统计」寄养类全漏。**讽刺点**：该文件 :419 注释明确写「orders 用 type 区分（mall/group_buy/boarding）」，作者基于错误假设编码。
6. `adminService/services/user.js:971` `hostWhere = { type:'boarding', ... }`；`:1065`、`:1104` `type:'boarding'` → 邀请/消费统计寄养漏。
7. `adminService/services/wallet.js:383 / :387` `type:'mall'` ✅ 但 `type:'boarding'` ❌（同一函数内自相矛盾）。

### 🟡 P2 — 脆弱实现（能跑但语义错乱）

8. **`orderTimeoutService`** 捞寄养单用 `type:_.in(['boarding', null])`——靠 `$in` 含 `null` 匹配「字段缺失」的寄养单。**当前能工作，但极脆弱**：一旦给寄养单回填任何 `type` 值，逻辑立即错；且无法与「真正 type=null 的其他异常单」区分。

---

## 四、自洽正确的（无需改，仅作对照）

- mallService 自查 `type:'mall'` / `type:'group_buy'` ✅
- `adminService/services/wallet.js:33` `orderType:'activity'` ✅（活动单写 orderType）
- `orderService/orders.ts:1232` `orderType:nin(['activity'])` ✅（意图查非活动单；寄养单因无 orderType 被 `nin` 包含，恰好正确）
- `adminService/services/user.js:425` `type:'mall'` ✅（mall 写 type，正确；但同函数 boarding 用 type 就错——矛盾并存，印证字段分裂）

---

## 五、修复建议（分三阶段，最小风险优先）

### 阶段 1（止血，不改写入）— 改读方按「实际写入字段」查
- 寄养单无类型字段，查寄养单**不能**依赖 `type`/`orderType`，改用 **`hostId` 存在** 或 **`bookingKey` 前缀 `booking_`** 区分（寄养单独有 `bookingKey: booking_${hostId}_...`）。
- `userService/referral.ts`：mall 桶改回 `type:'mall'`；「非 mall 桶」改为 `type:_.in(['group_buy'])` 或干脆不按 type 过滤（mall/group_buy 在 orders，activity/feeding 在各自集合，已天然区分）。

### 阶段 2（根治）— 写方统一，最小改动
- **给寄养单 `createOrder` 补写 `type:'boarding'`**（`orderService/orders.ts:832` 的对象里加一行）。这是**零风险单行改动**，能让所有 `type:'boarding'` 查询立即生效，阶段 1 的兜底可回退为直接用 `type:'boarding'`。
- 对 activity/feeding：它们写的是 `orderType`。若追求彻底统一，建议**统一为 `type` 单字段**——activity/feeding 也改写 `type`，并跑一次性迁移把历史 `orderType` 值拷到 `type` 后删除 `orderType` 字段。**不要双写**（会产生同文档两个类型字段的脏数据）。

### 阶段 3（工程保障）
- 在 `MEMORY.md` 架构约定新增：**「orders 集合订单类型只用 `type` 单字段，禁止 `orderType`」**（与已落盘的 behaviors 约定并列）。
- 写一个只读校验脚本，统计 `orders` 各 `type` 分布 + `orderType` 残留，验证修复生效、无脏数据。

---

## 六、与历史记忆的关系

- 本报告发现的 `type/orderType` 分裂与 `MEMORY.md` 已记录的「`orders` 集合 `type`/`orderType` 双字段分裂」一致，并**补全了此前未暴露的两点**：
  1. 寄养单**两字段都不写**（此前记忆只说"createOrder 两个字段都不写"，本报告逐行核实确认）。
  2. `userService/referral.ts` 的 L3「修正」实为 regression——此前的字段分裂记忆未涵盖该回归。
- 寄养佣金/服务收入治理（`MEMORY.md`「合作伙伴 收入/佣金 领域模型」）中 `orderType:'boarding'` 指的是 **`commissions` 集合**的 orderType（写入方已统一），与本次 `orders` 集合的 `type` 字段是**两回事**，互不冲突，但命名重叠加剧了认知混乱。

---

## 七、修复实施（2026-08-02，DADDY 已拍板执行全部三阶段）

执行顺序：**阶段 2（根治写入）→ 阶段 1（清残留错查）→ 阶段 3（脚本 + 约定）**。

### 阶段 2：寄养单写入补 `type:'boarding'`（根治）
- `cloudfunctions/orderService/orders.ts:837`（createOrder 寄养对象）→ 加 `type: 'boarding'`。
- `cloudfunctions/orderService/orders.js`（createOrder 寄养对象）→ 同步加 `type: 'boarding'`。
- 验证 `orders` 集合仅两处 `.add` 创建点：寄养（orderService，已补）、活动（activityService，本就 `orderType:'activity'`，正确）。mall/group_buy 早已写 `type`。故**新寄养单立即带 `type:'boarding'`，所有按 `type:'boarding'` 查的聚合自动生效**。

### 阶段 1：修正仍写错的查询条件
1. **`adminService/services/wallet.js:149`**：`orderType:'boarding'` → `type:'boarding'`。此处是合作伙伴「寄养服务收入」明细查询，原写法对 orders 集合恒空 → 修复后该明细正确返回寄养单。
2. **`userService/referral.ts` / `referral.js` 的 mall 回归（L3 错误「修正」回退）**：
   - `getReferralStats` 与 `getInvitedUsers` 两函数共 **4 处** `orderType: _.ne('mall')` → `type: _.ne('mall')`；**4 处** `orderType: 'mall'` → `type: 'mall'`。
   - 同时纠正两文件顶部误导性注释（原注释称「orders 真实字段是 orderType」已不成立）。
   - 效果：mall 消费额回到正确桶，不再被错算进「非 mall」桶；mall 邀请收益统计恢复真实值。

> 说明：原报告指出的其余 `type:'boarding'` 查询点（`user.js` ×7、`wallet.js:34/387`、`partnerService/wallet.*:158/306`、`referral.*:201/293`）**本就正确**，阶段 2 落地后无需改动即生效，未动。

### 阶段 3：脚本 + 约定固化
- **只读审计脚本** `scripts/audit-orders-type-distribution.js`：按 `type` / `orderType` 分组统计分布，并诊断「两者皆缺」与「历史寄养单（bookingKey 存在）」数量。仅读取不写入。
- **历史迁移脚本** `scripts/fix-orders-boarding-type.js`：把「`type` 缺 & `orderType` 缺 & 具备 `bookingKey`」的历史寄养单回填 `type:'boarding'`，幂等。默认 `--dry` 预览，**未自动执行**（涉及生产数据写，需 DADDY 持凭证跑：`node scripts/fix-orders-boarding-type.js --env=<envId> --dry` 先预览）。
- **约定固化**：`MEMORY.md` 架构约定已新增「orders 集合订单类型只用 `type` 单字段，禁止 `orderType`」铁律 + 受害点清单（见 MEMORY.md）。

### 未改 / 已知边界（不在本次范围）
- `orderTimeoutService.cancelBoardingOrders` 仍用 `type: _.in(['boarding', null])` 捞寄养单：阶段 2 后新单命中 `boarding` 分支、旧单命中 `null` 分支，逻辑更精确、无回归；活动单 `type` 缺失仍会匹配 `null` 分支（即记忆中「修 activity paymentStatus 后寄养分支误吞活动单」的连环坑），属活动超时线 P0，待决策④，本次不动。
- `adminService/services/stats.js` 寄养桶用 `type: _.or([_.exists(false), _.neq('mall')])` 的宽松写法未改（属导出辅助，非核心资金 bug，改动有破坏导出风险）。
- `referral` 聚合中活动消费额在 `ordersAgg`（含 activity）+ `actAgg`（activity_registrations）**双重计数**为**预存在**问题，与本次 type/orderType 分裂无直接因果，未扩围修复，仅记录待后续评估。
- `commissions` 集合的 `orderType:'boarding'`（寄养佣金维度）与本次 `orders.type` 是两回事，命名重叠但不冲突，未回退。
