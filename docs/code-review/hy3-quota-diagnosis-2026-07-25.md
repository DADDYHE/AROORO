# HY3 / HY IMAGE3 自定义模型 REFUSAL(429) 配额错误诊断

> 日期：2026-07-25 22:51:57 CST ｜ 环境：`cloudbase-d7getcjqy33b13475`（ap-shanghai 生产）
> 现象来源：客户端错误收集器（ErrorCollector）上报的 AI 模型调用失败

---

## 1. 错误报告逐字段拆解

| 字段 | 值 | 含义 |
|------|----|------|
| Message（用户可见） | `自定义模型 HY3/HY IMAGE3 错误，请切换模型或重试` | 失败的是名为 **HY3 / HY IMAGE3** 的**自定义模型**（基于混元生图 `hunyuan-image-v3.0` / `HY-Image-v3.0-*`），且 SDK 已建议降级/换模型 |
| Error Code | `REFUSAL` | CloudBase AI 模型服务对请求的**拒绝**语义（非网络错、非代码异常） |
| Server Detail | `{"code":-32003,"message":"Quota exceeded: 429 Unknown error...","data":{"...statusCode":429,"category":"quota"}}` | 关键：`statusCode=429` + `category:"quota"` → **配额耗尽**；`-32003` 是 SDK 对 429 的映射码 |
| App Version | `5.3.5` | 出问题的客户端版本（小程序前端） |
| User ID | `85d3ea47-fa28-48e6-815c-9eec4c5acb81` | 触发该调用的终端用户（普通用户，非管理员） |
| Request / Trace ID | `bcb1588b...` / `ed863e12...` | 云端调用链路追踪号，提工单可用 |

**核心结论**：`category:"quota"` + HTTP 429 → 这是 **CloudBase AI 模型服务平台侧的配额耗尽拒绝**，与项目业务代码逻辑无关。

---

## 2. 代码排查结论（已排除项目自身 bug）

对全仓做"排除 node_modules"扫描，覆盖三类源码：

- **小程序前端**（`app.js` / `pages/` / `services/` / `utils/` / `components/` / `subpackages/` 等根目录代码）
- **20 个云函数**（`cloudfunctions/*/index.{js,ts}` 及 services/common）
- **管理后台**（`web-admin/src`）

搜索关键词：`hunyuan` / `HY-Image` / `HY3` / `IMAGE3` / `@cloudbase/ai` / `generateImage` / `textToImage` / `extend.AI` / `modelName` / `自定义模型` / `混元` / `生图`。

**结果：零处真实调用。**

- 仅命中的无关项：`content.js:145 model:` —— 是营销页"商业模式"小节；`cloudfunctions/.../validator.js` 里的 `detailImages` 字段名噪声；`node_modules/@cloudbase/ai/...` 里的 SDK 模型枚举定义（`hunyuan-image-v3.0-v1.0.4`、`HY-Image-3.0-Plus-4090-Tob-v1.0` 等 —— 这是 SDK **声明**，项目从未 import 调用）。
- 即：zuoyou 代码里**没有任何路径去调用这些生图模型**。

### 调用来源推断
"自定义模型 HY3" 是 **CloudBase 控制台 → AI 模型服务** 中以混元生图为基础的**命名自定义模型 / 智能体**。其调用名（`HY3`）很可能存于**控制台配置或数据库**，不必然以字面量出现在仓库。小程序客户端（v5.3.5）经 AI 网关按名调用该模型，模型服务返回 429 配额拒绝 —— 失败发生在**模型服务平台**，代码侧无法修复。

---

## 3. 顺带纠正：随附 JWT 是高危管理员凭据（非普通用户 token）

上一轮我误用了另一个过期 token 做解码（错误地当成 Google OIDC），现纠正。DADDY 另贴的 JWT 真实解码如下：

```json
{
  "aud": "cloudbase-d7getcjqy33b13475",
  "project_id": "cloudbase-d7getcjqy33b13475",
  "meta": { "platform": "ApiKey" },
  "administrator_id": "2055571419067105282",
  "client_type": "client_server",
  "is_system_admin": true,
  "iat": 1780999033,
  "exp": 253402300799
}
```

- `aud`/`project_id` = `cloudbase-d7getcjqy33b13475` —— 即本生产环境，环境对齐无误。
- `meta.platform = ApiKey` —— 由 **CloudBase API Key（SecretId/SecretKey）** 签发，非终端用户登录态。
- `is_system_admin: true` + `administrator_id` —— **全环境管理员**。
- `exp: 253402300799` = **9999-12-31** —— **永不过期**的长期凭据。

⚠️ **安全提醒**：这是长期、高权限、永不失效的敏感凭据。请 DADDY：
1. 视为**已泄漏**，立即到 CloudBase 控制台 **轮换 / 吊销该 API Key**；
2. **切勿**将其硬编码进代码、写进配置文件或再次粘贴到对话；
3. 本报告不引用、不调用该 token 做任何 API 操作。

---

## 4. 平台侧修复清单（DADDY 在控制台操作）

错误提示自身已给出方向："请切换模型或重试"。具体步骤：

1. 登录 **CloudBase 控制台** → 进入环境 `cloudbase-d7getcjqy33b13475` → **AI 模型服务 / 生成式 AI / 混元** 面板。
2. 定位自定义模型 **HY3 / HY IMAGE3**（基于 `hunyuan-image-v3.0` 生图模型）。
3. 查看该模型的 **调用配额 / 已用额度 / 计费状态**：
   - 若是按量计费 → 检查账户余额 / 是否欠费；
   - 若是免费额度 → 确认是否已用尽。
4. 二选一解决：
   - **(A) 提升配额**：为该自定义模型购买 / 提升调用额度；
   - **(B) 切换模型**：按错误提示在调用处临时改用其他可用生图模型，绕过该自定义模型的配额限制。
5. 顺查该自定义模型是否已 **部署 / 激活**——部分混元生图自定义模型需先在控制台"部署"才分配实例与配额。

---

## 5. 判定与后续

- **性质**：平台配额问题（429 + `category:quota`），**非代码缺陷**。无需改 zuoyou 源码或重部署云函数。
- **是否需要改代码**：仅当决定"切换模型"(B) 且模型名写死在配置/DB 时才需改动；若仅是配额不足(额度用尽)，纯控制台提额即可。
- **复现抓取**：CLS 日志服务此前已开通（见本日 22:20 核查），下次复现可用 `queryLogs/searchLogs` 抓调用方函数名与网关返回明细，进一步定位是哪个客户端入口触发 HY3 调用。
- **凭据**：随附 JWT 按第 3 节立即轮换。

---

## 附：排查命令（可复现）

```bash
# 排除 node_modules 全仓搜 AI 生图模型调用（结果：仅 SDK 定义，无项目调用）
grep -rIn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
  -E "hunyuan|HY-Image|HY3|IMAGE3|@cloudbase/ai|generateImage|extend\.AI|生图|混元" \
  --include="*.js" --include="*.ts" --include="*.vue" --include="*.json" . \
  | grep -v "/node_modules/"
```
