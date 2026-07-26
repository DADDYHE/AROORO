# -504002 FUNCTIONS_EXECUTE_FAIL 诊断报告

> 日期：2026-07-25 ｜ 环境：`cloudbase-d7getcjqy33b13475`（生产 ap-shanghai）
> 触发：客户端 ErrorCollector 上报 `cloud.callFunction:fail ... errCode:-504002 ... FUNCTIONS_EXECUTE_FAIL`
> 错误时间戳：`1784988924074` ms = **2026-07-25 22:15:24 CST**

---

## 1. -504002 是什么

`-504002 / FUNCTIONS_EXECUTE_FAIL` 是**客户端可见的"云函数执行失败"包装码**。它只说明"被调用的某个云函数没正常返回"，**真实原因（超时 / 未捕获异常 / DB 限流 / 内存溢出）全部在服务端函数日志里**。客户端 stack 只是压缩后的 wx SDK 内部栈，不含函数名和行号，无法据此定位。

---

## 2. 日志通道当前被堵（重要限制）

尝试用 CloudBase MCP 直连抓服务端日志，两条路都走不通：

| 通道 | 调用 | 结果 |
|---|---|---|
| CLS 跨服务聚合 | `queryLogs action=searchLogs` | `[SearchClsLog] topic not exist` → 根因 `checkLogService` 返回 **`enabled:false`**（CLS 日志服务未开通） |
| 单函数执行日志 | `queryFunctions action=listFunctionLogs` | `[GetFunctionLogs] 当前版本不支持更多日志检索，请升级到最新版开发者工具`（MCP 底层 SCF API 版本被挡） |

**结论：当前无法经 MCP 锁定"到底是哪个函数、具体哪行报错"。** 要拿到确切函数名+异常栈，必须二选一：
1. 在云控制台**开通 CLS 日志服务**，之后 `searchLogs` 才可用；
2. 直接去云控制台「云函数 → 日志」viewer 看 22:15 前后的调用（不依赖 CLS 开通）。

---

## 3. 超时审计（绕开日志，直读部署配置）

改用 `queryFunctions action=getFunctionDetail` 逐个拉 20 个云函数的 `Timeout / MemorySize / Runtime`（这条不依赖日志，可用）。结果：

| 超时 | 函数 | 说明 |
|---|---|---|
| **3s（平台默认·极危险）** | `couponService`、`favoriteService`、`hostService` | cloudbaserc.json 里这三者已配 `timeout:10`，但**线上实测 3s → 部署漂移，配置没推上去** |
| **10s（中风险）** | `userService`、`orderService`、`paymentService`、`adminService`、`tuanService`、`mallService`、`petService`、`activityService`、`feedingService`、`partnerService`、`utilityService`（共 11 个） | 含已知的 userService 错位（见 §4） |
| 15s | `i18nOverride`、`migration`、`rateLimitCleanup` | — |
| 30s | `couponExpiryCheck`、`orderTimeoutService`、`tuanExpiryCheck` | 定时/巡检类，合理 |

> 运行时注记：`userService` 等部署态 `Runtime=Nodejs16.13`，而 cloudbaserc.json 写的是 `Nodejs18.15` —— 运行时也漂移了，但运行时不是本次 -504002 的直接杠杆，先放一边。

---

## 4. 确认的根因（已有实锤，已修）

**部署态 `userService.timeout = 10s`，但 `cloudfunctions/userService/config.json` 已改 `20s`**（P1 M6）。

核对 `cloudbaserc.json` 发现：userService 的超时在**两处**都写死成 `10`：
- 顶层 `functions[]`（`cloudbaserc.json:7`）
- `framework.plugins.function.inputs.functions[]`（`cloudbaserc.json:149`）

部署时取了 10s，于是长事务（如 `setDefault` 地址切换事务、`referral` 邀约统计聚合 L3）一旦超过 10s 就被掐断 → 客户端收到 `-504002`。

**已修复**：把上述两处的 `timeout: 10` 都改为 `20`（纯配置修正，未触发部署；需重新部署 userService 才生效）。

---

## 5. 诊断结论

- `-504002` 最可能 = **云函数超时**。最强证据链：**userService 线上 10s vs 代码意图 20s** 的错位（已确认并修），叠加 **3 个函数仅 3s**（couponService / favoriteService / hostService）的部署漂移。
- 不能完全排除"未捕获异常 / DB 限流（DATABASE_REQUEST_LIMIT_EXCEEDED）/ 内存溢出"，但超时是最吻合的现状假设。
- **确切函数名与异常栈仍缺**（见 §2 限制），需开通 CLS 或控制台日志 viewer 在下次复现时抓取。

---

## 6. 下一步（待 DADDY 决策 / 操作）

| # | 动作 | 类型 | 说明 |
|---|---|---|---|
| 1 | **重新部署 userService** | 部署 | 吃进本次 `timeout:20` 修正（部署前按铁律确认环境变量无 `TENCENTCLOUD_/SCF_/QCLOUD_` 前缀、V3 支付变量对齐 paymentService） |
| 2 | **重新部署 couponService / favoriteService / hostService** | 部署 | 把线上 3s 推成 cloudbaserc 里已配的 10s，消除最危险的超时炸弹 |
| 3 | **开通 CLS 日志服务**（控制台）或用控制台日志 viewer | 云端操作 | 下次复现时直接抓"函数名 + 异常栈"，闭环定位 |
| 4 | 评估其余 10s 函数长链路 | 调优 | `orderService.createOrder`、`paymentService` 等若含长事务/多跳 DB，考虑提到 20s |

---

## 7. 本次已落地改动

- `cloudbaserc.json`：userService 在两处 `functions[]` 定义中的 `timeout` 由 `10` → `20`（已 grep 核验两处均生效）。

> 注意：改动是配置，**必须重新部署 userService 才会反映到线上**（部署态当前仍是 10s）。
