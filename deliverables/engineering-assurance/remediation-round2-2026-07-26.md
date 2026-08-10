# 第二轮修复实施报告 ·「AROORO」小程序（CloudBase SCF）

**日期**：2026-07-26
**工作流**：全面工程审查后续修复（代码级中优 + 测试补齐 + 架构评审方案）
**参与成员**：Cody（代码审查师）· Rex（SRE 工程师）· Tessa（测试专家）· Archi（架构师）

---

## 📌 TL;DR（执行摘要）

- 整体结论：本轮推进 **5 个代码/测试项（F10/F12/F18/F19/F21）全部落地**，且测试单测通过（F19 10/10、F18 `node --check` 通过）；**7 个架构项（F2/F3/F4/F13–F16）仅产出 ADR 评审方案，未改业务代码，待 DADDY 拍板后实施**。
- 严重度分布（本轮处理项）：🔴高 3 项（F2/F3/F4，仅出方案）/ 🟡中 5 项（F10/F12/F18/F19/F21，已修）/ 🟢低 0。
- 阻塞 / 非阻塞：代码改动**非硬阻塞**；架构重构**须决策后才实施**（5 个分歧点见下文）。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟡 有条件通过（代码层风险收敛中，架构重构待决策） |
| 阻塞项数量 | 架构决策 5 项（F2/F3/F4/F15/F16 需拍板） |
| 关键行动项 | 8 条（见下方行动清单） |
| 建议下一步 | DADDY 拍板架构分歧 → 实施 F2(B)/F3/F4/F13–F16；F9 测试体系单列专项 |

---

## 🔧 代码 / 测试修复（已落地）

| # | 严重度 | 成员 | 改动文件:行 | 核心改动 | 校验 |
|---|--------|------|------------|---------|------|
| F10 | 🟡中 | Cody | orderService/orders.ts:245,1120；userService/referral.ts:124-133；partnerService/services/referral.ts:182,239 | 寄养重叠校验 `limit(100)` 删除（防超卖）；受邀统计改游标分页（KOL>500 不再低估）；消费去重改服务端 `addToSet` | node --check 通过 |
| F12 | 🟡中 | Cody | orderService/orders.ts:580,974 | `getOrders`/`getActivityOrders` 加 `pageSize` clamp `Math.min(100, Math.max(1, ...))`（同文件 `getHostOrders:1566`、partnerService:254 已有未动） | node --check 通过 |
| F18 | 🟡中 | Rex | orderTimeoutService/index.ts:437 + 部署产物 index.js:194,214 | 微信关单 fetch 加 `AbortSignal.timeout(3000)`，超时降级单笔失败、不阻塞整轮；orderService 无该逻辑未改 | node --check 通过 |
| F21 | 🟡中 | Cody | orderService/orders.ts:608 | host 视角剔除 `notes`；phone 脱敏末 4 位；ownerInfo 仅留 nickName/avatarUrl（原存全量用户档含身份证/地址，已剔除） | node --check 通过 |
| F19 | 🟡中 | Tessa | test/referral-stats.test.js；test/activity-signup.test.js | 邀请统计（聚合/分页不丢不重复）+ 活动报名（幂等/名额扣减/满员拒单）聚焦单测 | **10/10 通过** |

> 注：Cody 改动 `.ts` 后已重编 `.js`（es2020，与仓库产物风格一致）。科迪提示 orders.ts:1221/1224 有 2 处预存类型错误（与本次任务无关，不影响 `.js` 产出）。

---

## 🏗️ 架构 ADR 方案（F2/F3/F4/F13–F16，待评审，未改代码）

> 完整文档：`docs/adr-remediation-architecture-2026-07-26.md`（Archi 产出，仅方案）

**推荐方向（一句话）**
- **F2** 同步跨函数 callFunction：先下沉 `lockCoupon` 为共享纯函数止血（B），事件化（A）作中期目标。
- **F3** 订单三套存储：分集合 + 共享生命周期模块（`common/order-lifecycle`），不追求单集合多态。
- **F4** adminService 职责重叠：领域逻辑归领域函数，admin 仅鉴权/审计/只读，穿透写改 `callFunction` 复用。
- **F13** common 多拷贝：CI 加 `sync-cloud-common.js --check` 一致性门禁。
- **F14** 模块风格：收敛为「薄入口 index.ts + services/ 子模块」。
- **F15** 金额字段：统一 `totalAmount`（元，逻辑层分计算），双写过渡 + 存量回填。
- **F16** bookingKey 双关：拆分 `concurrencyLockKey`（真·防超卖）与 `orderUniqueKey`（每单唯一）。

**需 DADDY 拍板的关键分歧点**
1. F2 是否投入事件化基础设施（A）还是仅下沉止血（B）？
2. F3 是否确认放弃单集合多态、接受分集合？
3. F4 admin 穿透写是否必须绕领域函数（一致性优先 vs 直写性能/事务）？
4. F15 是否接受零停机双写带来的字段冗余？
5. F16 非寄养订单并发锁键是否写 `nb_` 占位保结构统一？

**治理分批建议**：第 1 批 `F13→F16→F2(B)` 护栏+低风险止血；第 2 批 `F15+F3+F4(refund/coupon 优先)`；第 3 批 `F14+F2(A 立项)`。⚠️ **F4 的 coupon 逻辑浮点偏差建议提前修**（独立于架构重构）。

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | 拍板 F2 下沉(B) vs 事件化(A) | DADDY | P0 | 评审会 |
| 2 | 拍板 F3/F4/F15/F16 四处分歧 | DADDY | P0 | 评审会 |
| 3 | `jest.config.js` 的 `collectCoverageFrom` 追加 `userService/referral.js`、`activityService/index.js`（否则 F19 不计入覆盖率） | Cody/Tessa | P1 | 下个发布前 |
| 4 | F9 测试体系工程化专项：CI 跑 `jest --coverage` 设门禁、补 orders.js/refund 单测、迁移冒烟从业务覆盖率剥离 | Tessa | P1 | 下一迭代 |
| 5 | 提前修 F4 coupon 浮点偏差（独立于架构重构） | Cody | P1 | 下个发布前 |
| 6 | 科迪残留：`partnerService getMyInvitedUsers:206-210` 仍 `limit(5000)` 拉订单列表（仅展示非统计），独立处理 | Cody | P2 | 后续 |
| 7 | 游标分页用 `skip`，CloudBase `skip≈1万` 上限，超大规模 KOL(>1万受邀) 需游标键优化 | Cody | P2 | 后续 |
| 8 | 低优 F20/F22–F30（阈值/文档/前端组件测试等）后续批次 | 多角色 | P3 | 长期 |

---

## ⚠️ 待完善 / 已知局限

- 架构项（F2/F3/F4/F13–F16）**仅出方案，未实施**，依赖 DADDY 决策。
- **F9（测试体系工程化）本轮未做**——属大工程，单列专项（见行动 #4）。
- 科迪残留风险：游标 `skip` 1 万上限；partnerService `getMyInvitedUsers` 列表展示仍 `limit(5000)`。
- 泰莎未覆盖边界：referral 聚合单桶异常降级、activity 并发事务回滚（超卖防护）、`confirmActivityPayment` 支付后扣减、风控 reject/review、活动不存在 NOT_FOUND。
- 所有改动**均未部署**（遵守部署铁律），上线前须 DADDY 确认环境变量、配置 `SRE_ALERT_WEBHOOK`、禁用 `TENCENTCLOUD_/SCF_/QCLOUD_` 前缀。

---

## 📚 数据来源 & 成员产出索引

- **Cody（代码审查师）产出**：F10/F12/F21 三处代码修复（orders.ts/referral.ts 改 `.ts` 并重编 `.js`），node --check 通过；残留风险已记录。
- **Rex（SRE 工程师）产出**：F18 `orderTimeoutService` 微信关单 fetch 加请求级超时（index.ts:437 + index.js:194/214 同步）。
- **Tessa（测试专家）产出**：F19 两份聚焦单测（referral-stats / activity-signup），10/10 通过；mock 沿用项目 `jest.mock('wx-server-sdk')` 内存 db 风格。
- **Archi（架构师）产出**：`docs/adr-remediation-architecture-2026-07-26.md` —— F2/F3/F4/F13–F16 的 ADR 草案与治理分批。

---

> 本报告由工程保障团队 AI 协作生成，关键决策（尤其架构重构）请由人类工程负责人复核。
