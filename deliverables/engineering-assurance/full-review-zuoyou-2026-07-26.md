# 全面工程审查报告 ·「左右」小程序（CloudBase SCF）

**日期**：2026-07-26
**工作流**：全面工程审查（综合代码审查 + 技术债评估，覆盖 6 维度）
**参与成员**：Cody（代码审查师）· Archi（架构师）· Tessa（测试专家）· Rex（SRE 工程师）

---

## 📌 TL;DR（执行摘要）

- 整体结论：项目工程质量在同类小程序中偏高（密钥注入、金额服务端重算、状态机幂等、回调验签、补偿队列等均已落地），但**存在 9 项高优风险需在下次发布前优先治理**（F6 经二次复核修正为「索引已建但未代码化」，保持🔴高，见下方复核修正说明）。
- 严重度分布：🔴高 9 项 / 🟡中 10 项 / 🟢低 8 项（合并去重后）。
- **最致命的两类风险**：①`wallet-utils.js` 钱包并发双入账会导致资金直接翻倍（触发条件限于钱包首次创建）；②`orderTimeoutService` 实际部署超时 30s 远低于代码意图 60s，且 4 个资金链路集合索引虽已在 DB 建立但未代码化进 `initIndexes`（重建环境会丢失）+ 死信无监控 + 告警不投递，批量超时单取消可能被静默截断、伙伴收入漏算无人知���。
- 阻塞 / 非阻塞：发布层面**非硬阻塞**，但高优项（尤其 F1/F5/F6/F7/F8）强烈建议先于涉及资金/可靠性的发布修复。
- 审查范围：核心云函数（`*Service` 的 index.ts / services/*.ts，重点 orders.ts / referral.ts / paymentService / activityService / orderTimeoutService）+ 前端 pages 全量敏感扫描；未做端到端与依赖漏洞扫描。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟡 有条件通过（高优资金/可靠性风险需先修） |
| 阻塞项数量 | 高优 9 项（其中直接资金损失 1 项、静默数据丢失风险 2 项；F6 索引已建但未代码化，保持🔴高） |
| 关键行动项 | 9 条（见下方行动清单，P0 共 5 条） |
| 建议下一步 | 先修 F1（钱包并发）、F5（部署配置）、F7（补偿队列）、F8（告警投递），再做架构三大高优与测试工程化 |

---

## 🔧 复核修正说明（2026-07-26 followup）

> 主报告已由独立复核（见 `full-review-zuoyou-2026-07-26-followup.md`）逐项代码核对，并经**二次复核 + CloudBase MCP 查询**验证。结论：**13 项复核中 9 项完全准确、3 项部分准确、1 项方向正确但表述失实**。本报告已据二次复核定稿如下：
> - **F6 保持 🔴 高（理由修正，不降级）**：原"全代码库无 createIndex"失实——`initIndexes()` 已代码化 11 条索引（含 `idx_bookingKey_unique`、`failed_operations.idx_status_createdAt`）。二次复核经 MCP 查实：wallets/withdrawals/commissions/feedingOrders 四个资金链路集合的索引**已在 DB 上建立**，但**均未代码化进 `initIndexes()`**，重建环境会丢失。核心风险是"索引未代码化"而非"索引缺失"，风险等级仍高优。
> - **F5 升级更严重**：补充遗漏的 `adminService` timeout 10 vs 15，冲突共 7 处。
> - **F1 描述修正 + 触发条件已确认**：漏洞真实存在，触发条件限于"钱包首次创建"，wallets (openid,type) 唯一索引已建立（命中 43 次）可防双文档；原报告误将"探测式 `where().update()`"写成"get 查询"、误将 `where().update()` 写成 `doc(_id).update()`，已更正。
> - **F12 范围收窄**：仅 `getOrders`/`getActivityOrders` 漏 clamp，同文件 `getHostOrders` 已有 clamp。
> - **F10 路径修正**：`partnerService/referral.ts` → `partnerService/services/referral.ts`。
> - 复核局限：F3 未单独复核；F1 触发建议补并发单测；F13–F30 中低优项未覆盖。

---

## 🔍 审查发现（按严重度排序，已去重合并跨成员重叠项）

> 维度标签：①代码质量 ②架构设计 ③安全性 ④性能 ⑤测试覆盖 ⑥错误处理

### 🔴 高（9 项）

| # | 严重度 | 维度 | 文件:行 | 问题描述 | 改进建议 | 来源 |
|---|--------|------|---------|---------|---------|------|
| F1 | 🔴高 | ①⑥④ | common/wallet-utils.js:32-72（service-income-utils.js:62-78 复用） | **钱包并发双入账（漏洞真实，描述经复核修正）**：钱包不存在分支用 `where({openid,type}).update()` 探测（凭 stats.updated===0 判存在）→ `add(balance:0)` → 再次 `where().update(inc)`。并发下两请求都进 if 分支，A 成功 add、B 捕获 -502001，但两者都执行第二次 inc → 余额翻倍。**触发条件限于钱包首次创建**（已存在钱包的常规路径无此问题）。原报告把"探测式 update"误说成"get 查询"、把 `where().update()` 误说成 `doc(_id).update()`，核心结论成立 | 用 `db.serverTransaction()` 包住"判存在+创建+入账"；或改"add 时把 amount 合并进初始 balance、捕获 -502001 后不再 inc"；建议补并发单测复现确认 | Cody(复核修正) |
| F2 | 🔴高 | ②④⑥ | orderService/tuanService/feedingService 创建/取消订单 | **下单主链路同步跨函数 callFunction**：order→couponService.lockCoupon、order/tuan→paymentService.createRefund 为同步嵌套，冷启动叠加 + 级联失败；lockCoupon 在 order/tuan 近乎重复实现 | 评估事件化（写订单→发消息→异步锁券/退款，失败进补偿队列）；至少下沉 lockCoupon 为共享纯函数 | Archi |
| F3 | 🔴高 | ② | orders / tuan_orders / feedingOrders / activity_registrations | **订单三套存储 + 无统一抽象**：创建→支付→超时→退款→佣金生命周期在多处重复实现，跨切面能力难统一 | 明确单集合多态或分集合二选一并文档化；抽取共享生命周期模块（状态机/超时/佣金）到 common | Archi |
| F4 | 🔴高 | ② | adminService（mall/tuan/feeding/hosting/coupon/wallet/activity/user…） | **adminService 与同名领域函数职责重叠**：业务规则易双端漂移、归属不清 | 定义"领域逻辑归领域函数、admin 仅做管理"；重叠部分改 callFunction 复用或共享 common | Archi |
| F5 | 🔴高 | ④⑥ | cloudbaserc.json vs 各 *Service/config.json | **部署配置不一致（timeout/memory，共 7 处冲突，比原报告更严重）**：cloudbaserc 为部署事实源，与 config 冲突——orderTimeoutService 30 vs 60、orderService 10 vs 20、paymentService 10 vs 15、partnerService 10 vs 20、**adminService 10 vs 15（原报告遗漏）**；内存 mallService 128 vs 512、partnerService 256 vs 512（多函数实际仅 128MB） | 统一以 cloudbaserc 为准对齐：orderTimeoutService→60、order/payment/partner/admin→20/15/20/15；内存对齐意图值；删 config.json 不致项 | Rex(复核补 adminService) |
| F6 | 🔴高 | ③④⑥ | wallets / withdrawals / commissions / feedingOrders / orders / failed_operations / bookingKey（adminService/services/coupon.js:826-920 initIndexes） | **关键索引未代码化（已在 DB 建立但重建会丢失）**：`initIndexes()` 已代码化 11 条索引（含 `idx_bookingKey_unique`、`failed_operations.idx_status_createdAt`）。二次复核经 CloudBase MCP 查实——wallets(openid,type 唯一,命中43)/withdrawals(idx_status_createdAt 等)/commissions(idx_inviterId_status 命中292 等)/feedingOrders(idx_status_createdAt 命中3901 等) 的索引**已在 DB 上建立**，但**均未代码化进 `initIndexes()`**；wallets/feedingOrders 关键索引已建但未代码化，withdrawals 缺 walletType 维度、commissions 缺 orderType 维度。所有索引靠控制台手建，环境重建/迁移会丢失 | 将 wallets/withdrawals/commissions/feedingOrders 的现有索引补进 `initIndexes()`（含 commissions `(inviterId,orderType,status)`、withdrawals `(openid,walletType,status,createdAt)`）；部署后 super_admin 触发 `initIndexes` 并加 CI 自动执行断言；`fetchAllExpired` 改游标/时间分页替代 .skip() | Rex(二次复核+MCP) |
| F7 | 🔴高 | ⑥④ | orderTimeoutService/index.ts + orderService/orders.ts | **补偿队列可靠性缺口**：死信（retry>5 转 failed）无监控/无清理/无告警；消费无 claim 并发锁、单轮 limit(50) 无分页 drain；仅覆盖 boarding 业务（其他业务收入写入失败无重试）；券解锁 unlockCouponBestEffort 静默吞错 | 死信转 failed 时发 critical 告警+积压监控；原子 claim 锁+分页 drain；所有业务统一走 recordFailedOperation；关键回退失败也入队 | Rex |
| F8 | 🔴高 | ⑥ | common/alert.js:35-57 | **告警仅落库不投递**：recordAlert 只 db.add，无企微/钉钉/邮件/Webhook；critical 资金事件（退款失败、orderTimeout.fatal）无人实时感知 | recordAlert 增加对外投递通道，保留 DB 作审计；critical 级升级+值班通知 | Rex |
| F9 | 🔴高 | ⑤ | jest.config.js / orders.js / refund 逻辑 | **测试体系缺真实覆盖率 + 核心路径无门禁单测**：coverage/ 仅 ts-coverage.json（TS 迁移进度，非覆盖率）；orders.js 阈值=0 无门禁；退款/邀请统计/活动报名**无聚焦单测**；约 30 个 *-ts-migration 冒烟被计入致覆盖率虚高 | CI 跑 jest --coverage 上传报告并设门禁；补 orders.js/refund/invitation/activity 聚焦单测；迁移冒烟从业务覆盖率剥离 | Tessa |

### 🟡 中（10 项）

| # | 严重度 | 维度 | 文件:行 | 问题描述 | 改进建议 | 来源 |
|---|--------|------|---------|---------|---------|------|
| F10 | 🟡中 | ①④ | orderService/orders.ts:245,1110；userService/referral.ts:124-131；partnerService/services/referral.ts:239 | **查询 limit 截断致超卖/统计低估**：寄养重叠校验 limit(100)（>100 单热门 host 可被超卖）；受邀用户 limit(500/5000) 致头部 KOL 统计系统性低估（partnerService 侧 `totalInvited` 已改用 `.count()` 规避，`consumingCount` 仍依赖 limit(5000) 拉取 openids 做 Set 统计） | 去 limit 或按时间窗 DB 侧过滤；统计类用 .count()+游标分页 | Cody |
| F12 | 🟡中 | ①④ | orderService/orders.ts:580,974（getOrders / getActivityOrders） | **pageSize 无上限（仅两处高频入口）**：客户端可传 pageSize=100000 触发重查询/超时。复核确认同文件 `getHostOrders:1566` 已做 `Math.min(Math.max(1,...),50)` clamp、partnerService 侧 `referral.ts:254` 也已 clamp，**仅 getOrders/getActivityOrders 漏改** | 对 getOrders/getActivityOrders 的 pageSize 做 clamp（如 Math.min(100, Math.max(1,...))） | Cody |
| F13 | 🟡中 | ② | common 在各函数约 20 份拷贝 | **common 多份拷贝缺 CI 一致性校验**：已有 scripts/sync-cloud-common.js 构建期同步，但无 CI 校验各函数 common 与源一致，仍可能漂移 | 在 CI 增加"各函数 common 与顶层源 diff"断言，杜绝手拷漂移 | Archi |
| F14 | 🟡中 | ② | 模块组织三风格并存 | **模块风格不一致**：services/ 子目录、根级业务文件、单体 index.ts（activity/order ~86KB）三种风格，可读/可测性差 | 统一收敛为 services/ 目录；单体 index 按业务域拆子模块 | Archi |
| F15 | 🟡中 | ②① | orders(用 totalPrice) / feeding·tuan(用 totalAmount) | **金额字段命名不一致**：totalPrice vs totalAmount，commission-utils 以 resolveOrderAmount 兼容三字段属"容忍而非根治" | 全量统一为 totalAmount（元）并迁移存量，删 fallback | Archi |
| F16 | 🟡中 | ②③ | bookingKey（orders 唯一索引） | **bookingKey 语义双关**：orders 用 booking_${hostId}_${date} 真·防超卖，mall/activity/tuan 用 nb_${orderId} 仅每单唯一（无并发语义），同一索引承载两种语义 | 区分"并发锁键"与"订单唯一键"，命名/索引分离；tuan/feeding 防超卖独立设计 | Archi |
| F18 | 🟡中 | ⑥④ | orderTimeoutService/index.ts:437 | **closeWechatOrder 的 fetch 无请求级超时**：微信卡顿时无限挂起，占用整轮函数超时预算，阻塞同轮其余订单关闭 | 加 AbortSignal.timeout(3-5s)，失败按单返回不阻塞 | Rex |
| F19 | 🟡中 | ⑤ | userService/referral.ts；activityService | **邀请统计/活动报名缺聚焦单测**：仅集成主链路覆盖，跨集合聚合/分页/重复报名/名额扣减无单测 | 补 referral.ts、activityService 报名 handler 单测并纳入 collectCoverageFrom | Tessa |
| F20 | 🟡中 | ⑤ | wallet.js 阈值；adminService；迁移冒烟 | **钱包阈值偏低 + adminService 迁移率低(9.52%) + 迁移冒烟虚高**：金融核心门禁弱，admin 多数模块无行为测试，冒烟测试计入业务覆盖率误导 | 提高 wallet 阈值；优先迁移 admin 补 P1 单测；迁移冒烟降为 audit 不计入覆盖率 | Tessa |
| F21 | 🟡中 | ③ | orderService/orders.ts:617 | **PII 跨角色暴露**：getOrders(role=host) 返回 owner 的 phone/notes，notes 可能含身份证/地址且前端未脱敏 | host 视角仅返回必要联系字段，notes 做脱敏；明确跨角色可见 PII 清单 | Cody |

### 🟢 低（8 项）

| # | 严重度 | 维度 | 文件:行 | 问题描述 | 改进建议 | 来源 |
|---|--------|------|---------|---------|---------|------|
| F22 | 🟢低 | ① | services/CloudFunctionService.wechatPay | **前端 amount*100 与"元"约定张力**：注释写金额单位元，但代码 amount*100 传 createPayment，上下游理解可能不一致 | 对齐 paymentService.createPayment 契约期望单位并文档化 | Archi |
| F23 | 🟢低 | ① | ERROR_CODE_MAP（前端）vs 云函数错误码 | **前后端错误码各自维护漂移风险** | 抽为前后端共享常量或文档生成，CI 校验一致 | Archi |
| F24 | 🟢低 | ② | orderService/activityService index.js ~86KB | **超大单体函数**：单测/定位成本高 | 随模块拆分一并治理 | Archi |
| F25 | 🟢低 | ⑥ | common/logger.js（缺 process.on('uncaughtException')） | **未捕获异常兜底与日志采样缺失**：fatal 时 recordAlert 若 DB 不可用无终极通道；DEBUG/PERF 默认关，定位需重启 | 入口统一 try/catch 返回结构化错误；关键路径性能埋点采样 | Rex |
| F26 | 🟢低 | ⑥ | deploy_cloudfunctions.sh | **部署脚本非真实发布入口**：仅 npm install + 提示手动编译，真实部署由 cloudbaserc 驱动，易误用 | 脚本增加真实上传或明确"本地准备"，README 写权威命令 | Rex |
| F28 | 🟢低 | ⑤ | jest.config.js logger.js 阈值 | **logger 阈值 b50/f65 偏低**：结构化日志分支未覆盖（非关键） | 保持或仅补关键日志分支 | Tessa |
| F29 | 🟢低 | ⑤ | pages/ 全无组件测试 | **前端小程序零组件/交互测试**：测试全集中在云函数 | 关键页面交互/表单校验加小程序组件测试 | Tessa |
| F30 | 🟢低 | ③ | orderService/orders.ts:617（同 F21 轻量项） | notes 字段未脱敏已并入 F21，此处仅作安全追踪标记 | 见 F21 | Cody |

---

## 🧭 六维度分布（按用户要求的 6 个审查方面归类）

| 维度 | 涉及发现 | 一句话结论 |
|------|---------|-----------|
| ① 代码质量 | F1, F12, F13, F14, F15, F22, F23, F24 | 风格/命名整体可控，主要债在金额字段不统一、模块风格三态、超大单体函数；钱包并发为 correctness 高优 |
| ② 架构设计 | F2, F3, F4, F13, F14, F15, F16, F24 | 云函数边界清晰，但订单存储分裂、admin 重叠、下单同步耦合为三大架构高优；common 已有同步脚本差 CI 守卫 |
| ③ 安全性 | F6, F16, F21, F22, F30 | 密钥零硬编码、回调验签/防重放到位；风险在资金链路索引未代码化（重建环境会丢失致越权边界退化）、PII 跨角色暴露未脱敏 |
| ④ 性能 | F1, F2, F5, F6, F10, F12, F18 | 部署 timeout/memory 与意图不符 + 复合索引未代码化（已建但未纳入 initIndexes）是性能/费用主因；limit 截断与 pageSize 无上限存放大查询风险 |
| ⑤ 测试覆盖 | F9, F19, F20, F28, F29 | 公共模块单测充分、集成较全；但无真实覆盖率报告、orders 无门禁、退款/邀请/活动报名缺聚焦单测 |
| ⑥ 错误处理 | F1, F2, F5, F7, F8, F18, F21, F25, F26 | 状态机幂等/补偿队列框架好；但死信静默、告警不投递、券解锁吞错、fetch 无超时是可靠性缺口 |

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | 修复 wallet-utils.js 并发双入账：改 add+捕获后不二次 inc，或包事务 | Cody + 开发 | P0 | 下个发布前 |
| 2 | 统一部署配置：cloudbaserc 对齐 orderTimeoutService=60、order/payment/partner=20/15/20、内存对齐意图值；清理 config.json 冲突项 | Rex + 开发 | P0 | 下个发布前 |
| 3 | **索引代码化（已在 DB 建但需纳入 initIndexes）**：将 wallets/withdrawals/commissions/feedingOrders 现有索引补进 `initIndexes()`（含 commissions `(inviterId,orderType,status)`、withdrawals `(openid,walletType,status,createdAt)`）；部署后 super_admin 触发并加 CI 自动执行断言；fetchAllExpired 改游标分页 | Rex + DBA | P0 | 下个发布前 |
| 4 | 补偿队列加固：死信转 failed 发 critical 告警+积压监控；原子 claim 锁+分页 drain；覆盖全业务；券解锁失败入队 | Rex + 开发 | P0 | 2 周内 |
| 5 | 告警投递：recordAlert 接企微/监控平台，critical 升级+值班 | Rex | P0 | 2 周内 |
| 6 | 解耦下单主链路：lockCoupon/退款改事件化或下沉共享纯函数，去 order/tuan 重复 | Archi + 开发 | P1 | 本迭代 |
| 7 | 收敛订单抽象 + 厘清 admin/领域边界，文档化归属契约 | Archi | P1 | 本迭代 |
| 8 | 测试工程化：CI jest --coverage 上传+门禁；补 orders/refund/invitation/activity 聚焦单测；迁移冒烟剥离 | Tessa + 开发 | P1 | 本迭代 |
| 9 | 修 limit 截断（去 limit/时间窗过滤/.count 分页）+ pageSize clamp | Cody + 开发 | P1 | 本迭代 |
| 10 | PII 脱敏（notes 跨角色）、common CI 一致性校验、金额字段统一（长期债） | 全员 | P2 | 后续迭代 |

---

## ⚠️ 待完善 / 已知局限

- **审查为静态代码级，但 F6 经 CloudBase MCP 二次复核验证**：wallets/withdrawals/commissions/feedingOrders 索引经 MCP 查实**已在 DB 建立**（命中次数已佐证），但均未代码化进 `initIndexes()`；"索引是否已建"已由二次复核确认，剩余风险为"代码化缺失导致重建丢失"。部署真实状态（cloudbaserc 是否最终生效）仍需运行时确认。
- **配额口径**：Cody 的"并发双入账"为逻辑推演（基于 add+inc 模式），建议用并发单测复现确认。
- **userService timeout 误报已纠正**：原始提示称 userService 在 cloudbaserc 仍 10，Rex 核对实际已为 20=20 一致，非失配；真正的失配集中在 orderTimeoutService/orderService/paymentService/partnerService（见 F5）。
- **协作过程备注**：审查中 architect 曾向 code-reviewer 直接发消息（peer-to-peer），违反"成员间须经主理人中转"的团队铁律；因各成员结论已独立提交且未相互改写，不影响本报告汇总，但后续应杜绝直连通信。

---

## 📚 数据来源 & 成员产出索引

- **Cody（代码审查师）原始产出**：覆盖 common/、paymentService、orderService/orders.ts、orderTimeoutService、partnerService·userService/referral.ts、activityService；结论 1 高(F1) / 4 中(F10/F12/F15 相关 M1-M4) / 2 低(F21/F30, L1-L2)，并附"值得肯定的做法"清单。
- **Archi（架构师）原始产出**：19 个 *Service 目录/边界/依赖关系静态审查；结论 3 高(F2/F3/F4) / 4 中(F13-F16) / 3 低(F22-F24)，含依赖与存储概览图。
- **Tessa（测试专家）原始产出**：基于 jest.config.js、coverage/ts-coverage.json、test/ 约 80 测试文件；结论 3 高(F9 内 #1/#2/#3) / 4 中(#4/#5/#6/#7/#8) / 2 低(#9/#10)，含关键路径覆盖矩阵。
- **Rex（SRE 工程师）原始产出**：核对 cloudbaserc.json + 18 个 config.json + 补偿链路 + alert/logger；结论 5 高(F5/F6/F7/F8 及 H1-H5) / 5 中(F18/F25 等 M1-M4/M7) / 3 低(M5/M6/M8)，纠正 userService timeout 误报。F6 经二次复核 + CloudBase MCP 修正为"索引已建但未代码化"，保持🔴高。

---

> 本报告由工程保障团队 AI 协作生成，关键决策（尤其 F1 资金、F5/F6 部署与索引、F7/F8 可靠性）请由人类工程负责人复核后再发布。
