# 微信物流助手接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为商城订单与团购订单接入微信物流助手 API，让用户在小程序端可查看物流轨迹，并完成与微信「发货信息管理」的全链路对齐。

**Architecture:**
- 后端在 `shipMallOrder` / `shipTuanOrder` 发货时，除写本地 `expressCompany / expressNo` 外，额外调用微信「上传发货信息」接口 `/wxa/sec/order/upload_shipping_info`，把快递信息推到微信侧（这样用户在微信「服务通知」中即可看到物流进度，且 `wx.openBusinessView({businessType:'logisticsDetail'})` 才能拉起轨迹页）。
- 后端新增 `mallService.getLogisticsTrack` handler，封装微信 `/cgi-bin/express/delivery/open/get_path` 拉取轨迹，作为前端 `wx.openBusinessView` 不可用时的降级方案。
- 前端独立封装 `<logistics-card>` 自定义组件（位于 `components/logistics-card/`），承担物流卡片展示 + 拉起微信半屏组件 + 降级拉本服务轨迹全链路逻辑，可在 mall-order-detail、未来团购订单详情、订单列表等多场景复用。`mall-order-detail` 详情页在「已发货 / 已完成」状态下通过 props 透传订单字段并挂载该组件。
- 后台 `web-admin` 的 `MallOrderDetail.vue` 把快递单号 prompt 改为两个串联 prompt（快递公司编码 + 快递单号），编码与微信 `delivery_id` 标准一致。

**Tech Stack:** 微信小程序（wxml/wxss/js）、微信云函数（Node.js / TypeScript）、Vue 3 + Element Plus（web-admin）、微信开放平台 API（`/wxa/sec/order/upload_shipping_info` + `/cgi-bin/express/delivery/open/get_path` + `wx.openBusinessView`）。

---

## 文件结构

### 新建文件
- `cloudfunctions/common/wxLogistics.ts` — 微信物流助手后端 API 封装（uploadShippingInfo / getLogisticsPath），与 `wxAccessToken.ts` 同级。
- `cloudfunctions/common/expressCompanyCodes.ts` — 快递公司编码常量表（顺丰=ZTO 等），与微信官方 `delivery_id` 编码标准一致；前后端共用。
- `components/logistics-card/` — 独立物流卡片自定义组件，包含 `index.js / index.json / index.wxml / index.wxss` 四件套。组件职责：接收 `expressCompany / expressNo / shippedAt / transactionId / wxTransactionId` 等属性，内部封装「拉起 wx.openBusinessView + 降级拉本服务 getLogisticsTrack + 展开轨迹列表」全链路逻辑。可在 mall-order-detail、未来团购订单详情、订单列表页等多场景复用。

### 修改文件
- `cloudfunctions/common/wxAccessToken.ts` — 新增 `uploadWxShippingInfo()` 和 `getWxLogisticsPath()` 两个函数。
- `cloudfunctions/common/index.ts`（如存在）或直接在 `wxAccessToken.ts` 中导出 — 无需修改。
- `cloudfunctions/adminService/services/mall.js` — `shipMallOrder` 扩展：调用 `uploadWxShippingInfo` 把快递信息推到微信。
- `cloudfunctions/tuanService/index.ts` — `shipTuanOrder` 扩展：入参新增 `expressCompany / expressNo`，落库 + 调 `uploadWxShippingInfo`。
- `cloudfunctions/mallService/index.ts` — 新增 `getLogisticsTrack` handler，调 `getWxLogisticsPath`。
- `cloudfunctions/mallService/index.ts` — `getOrderDetail` 返回字段透传 `expressCompany / expressNo / shippedAt`（已透传，仅校验）。
- `cloudfunctions/adminService/index.ts` — `ACTION_PERMISSIONS` 表新增 `getLogisticsTrack` 权限（如果走 adminService）；本方案走 `mallService`，无需新增权限。
- `services/CloudFunctionService.js` — 新增 `getLogisticsTrack(orderId)` 方法。
- `subpackages/profile/mall-order-detail/index.js` — `_normalizeOrder` 透传物流字段；使用 `<logistics-card>` 组件替代内联物流卡片。
- `subpackages/profile/mall-order-detail/index.json` — 注册 `logistics-card` 组件。
- `subpackages/profile/mall-order-detail/index.wxml` — 已发货状态引用 `<logistics-card>` 组件。
- `subpackages/profile/mall-order-detail/index.wxss` — 删除原内联物流卡片样式（已迁移到组件 wxss）。
- `app.js` — `_handleWxOrderConfirmCallback` 旁边新增 `_handleWxLogisticsCallback`（如有 req_extradata 回传需求；本方案 logisticsDetail 不需要回调刷新，但需保留 referrerInfo 转发逻辑）。
- `web-admin/src/api/mall-order.js` — `shipMallOrder` 默认 `expressCompany` 由 `'其他'` 改为 `''`，并新增校验。
- `web-admin/src/views/mall-order/MallOrderDetail.vue` — `onShip` 改为两个串联 prompt（快递公司编码 + 快递单号）。

### 不修改的文件
- `cloudfunctions/common/order-status.ts` — 状态机不变（已含 `shipped`）。
- `cloudfunctions/userService/addresses.ts` — 收货地址管理不变。
- `cloudfunctions/mallService/common/wxOrderSync.js` — `reconcileOrderWithWx` 不变（只读 `shipping` 字段，与新写入逻辑兼容）。

---

## 约定与术语

| 术语 | 含义 |
|---|---|
| `delivery_id` | 微信快递公司编码，例如 `ZTO`（中通）、`SF`（顺丰）、`YTO`（圆通）、`STO`（申通）、`HTKY`（百世）、`JD`（京东）、`EMS`（EMS）、`ZJS`（宅急送） |
| `waybill_id` | 运单号（即快递单号） |
| `order_id` | 商家系统内部订单号（本方案用 `_id`） |
| `upload_shipping_info` | 微信「发货信息管理」上传接口，路径 `/wxa/sec/order/upload_shipping_info` |
| `get_path` | 微信「物流助手」运单轨迹接口，路径 `/cgi-bin/express/delivery/open/get_path` |
| `logisticsDetail` | 微信半屏组件 `wx.openBusinessView` 的 `businessType` 之一，展示物流详情 |

---

## Task 1: 后端封装微信物流助手 API

**Files:**
- Create: `cloudfunctions/common/wxLogistics.ts`
- Modify: `cloudfunctions/common/wxAccessToken.ts`（在文件末尾追加导出，保持单一入口）

- [ ] **Step 1: 创建 wxLogistics.ts 文件骨架**

写入文件 `cloudfunctions/common/wxLogistics.ts`：

```ts
/**
 * wxLogistics.ts - 微信物流助手服务端 API 封装
 *
 * 包含两个核心接口：
 *   1) uploadShippingInfo - 上传发货信息到微信「发货信息管理」
 *      文档：https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping.html
 *      用途：商家后台发货后，必须把快递信息推到微信侧，否则用户在微信「服务通知」中看不到物流进度，
 *           且 wx.openBusinessView({businessType:'logisticsDetail'}) 也无法拉起轨迹页。
 *
 *   2) getLogisticsPath - 拉取运单轨迹
 *      文档：https://developers.weixin.qq.com/miniprogram/dev/server/API/express/delivery/open/get_path.html
 *      用途：作为前端 wx.openBusinessView 不可用时的降级方案。
 *
 * 设计原则：
 *   - 复用 wxAccessToken.ts 的 getMiniProgramAccessToken
 *   - 不抛异常，统一返回 { ok, data?, error? } 风格
 *   - 与 getWxOrderStatus 保持一致的错误码语义
 */
import { getMiniProgramAccessToken } from './wxAccessToken'
import { request as httpsRequest } from 'https'
import { URL } from 'url'

const UPLOAD_SHIPPING_URL = 'https://api.weixin.qq.com/wxa/sec/order/upload_shipping_info'
const GET_PATH_URL = 'https://api.weixin.qq.com/cgi-bin/express/delivery/open/get_path'

/** 内部：HTTPS POST application/json 返回 JSON（与 wxAccessToken.httpsPostJson 等价，但本模块独立避免循环依赖） */
function httpsPostJson(rawUrl: string, body: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(rawUrl)
    const payload = JSON.stringify(body)
    const req = httpsRequest(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let buf = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { buf += chunk })
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf))
          } catch (e) {
            reject(new Error(`invalid JSON from wx: ${buf.slice(0, 200)}`))
          }
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('wx api timeout')) })
    req.write(payload)
    req.end()
  })
}

export interface ShippingItem {
  /** 微信快递公司编码，如 'ZTO' / 'SF' */
  expressCompany: string
  /** 快递单号 */
  expressNo: string
  /** 商品描述，例如 '宠物用品 ×1' */
  itemDesc?: string
}

export interface UploadShippingInfoParams {
  /** 微信支付订单号 */
  transactionId: string
  /** 商家内部订单号（订单 _id） */
  merchantTradeNo: string
  shippingItem: ShippingItem
}

export interface UploadShippingInfoResult {
  ok: boolean
  error?: string
}

export interface LogisticsPathItem {
  /** 时间戳（秒），如 1717689600 */
  time: number
  /** 轨迹描述，如 '快件已到达【北京分拨中心】' */
  desc: string
}

export interface GetLogisticsPathParams {
  /** 微信快递公司编码，如 'ZTO' */
  expressCompany: string
  /** 快递单号 */
  expressNo: string
}

export interface GetLogisticsPathResult {
  ok: boolean
  data?: LogisticsPathItem[]
  error?: string
}

/**
 * 上传发货信息到微信「发货信息管理」。
 * - 必须在订单付款后 7 天内调用，否则会被微信侧判定为「发货超时」。
 * - 同一 transactionId 可重复上传，以最后一次为准。
 */
export async function uploadShippingInfo(params: UploadShippingInfoParams): Promise<UploadShippingInfoResult> {
  if (!params.transactionId) {
    return { ok: false, error: 'missing transactionId' }
  }
  if (!params.shippingItem || !params.shippingItem.expressNo) {
    return { ok: false, error: 'missing expressNo' }
  }
  try {
    const token = await getMiniProgramAccessToken()
    const url = `${UPLOAD_SHIPPING_URL}?access_token=${encodeURIComponent(token)}`
    const body = {
      order_key: {
        order_number_type: 1, // 1 = 使用微信支付订单号
        transaction_id: params.transactionId,
      },
      logistics_type: 1, // 1 = 实物快递
      delivery_mode: 1, // 1 = 统一发货
      is_all_delivered: true,
      shipping_list: [
        {
          tracking_no: params.shippingItem.expressNo,
          express_company: params.shippingItem.expressCompany,
          item_desc: params.shippingItem.itemDesc || '商品已发货',
        },
      ],
      // uploader: '左右小程序后台', // 可选
      //payer_openid 不传，由微信侧根据 transactionId 自动反查
    }
    const result = await httpsPostJson(url, body)
    if (result && result.errcode === 0) {
      return { ok: true }
    }
    return { ok: false, error: result?.errmsg || `errcode=${result?.errcode}` }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message || String(e) }
  }
}

/**
 * 拉取运单轨迹。
 * - 调用前必须先调用 uploadShippingInfo 把快递信息绑定到微信订单。
 * - 微信侧每隔一段时间会从快递公司拉取轨迹并缓存，本接口返回的是缓存数据。
 */
export async function getLogisticsPath(params: GetLogisticsPathParams): Promise<GetLogisticsPathResult> {
  if (!params.expressCompany || !params.expressNo) {
    return { ok: false, error: 'missing expressCompany or expressNo' }
  }
  try {
    const token = await getMiniProgramAccessToken()
    const url = `${GET_PATH_URL}?access_token=${encodeURIComponent(token)}`
    const body = {
      order: {
        delivery_id: params.expressCompany,
        waybill_id: params.expressNo,
      },
    }
    const result = await httpsPostJson(url, body)
    if (result && result.errcode === 0 && Array.isArray(result.path_item_list)) {
      const data: LogisticsPathItem[] = result.path_item_list.map((it: any) => ({
        time: Number(it.ctime) || 0,
        desc: String(it.content || ''),
      }))
      return { ok: true, data }
    }
    return { ok: false, error: result?.errmsg || `errcode=${result?.errcode}` }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error)?.message || String(e) }
  }
}
```

- [ ] **Step 2: 在 common/wxAccessToken.ts 不修改，wxLogistics.ts 通过 import 复用 getMiniProgramAccessToken**

无需修改 `wxAccessToken.ts`，因为 `getMiniProgramAccessToken` 已在文件第 48 行导出（`export async function`）。

- [ ] **Step 3: 编译验证（仅类型检查，不跑云函数）**

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && npx --yes -p typescript@5.4.5 tsc -p cloudfunctions/tsconfig.json --noEmit 2>&1 | head -30`
Expected: 不出现 `wxLogistics.ts` 相关错误（如果项目根目录有 cloudfunctions/tsconfig.json）；如果 tsconfig 不存在，跳过此步。

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/common/wxLogistics.ts
git commit -m "feat(logistics): 新增微信物流助手后端 API 封装（uploadShippingInfo / getLogisticsPath）"
```

---

## Task 2: 新增快递公司编码常量表

**Files:**
- Create: `cloudfunctions/common/expressCompanyCodes.ts`

- [ ] **Step 1: 写入常量文件**

写入文件 `cloudfunctions/common/expressCompanyCodes.ts`：

```ts
/**
 * expressCompanyCodes.ts - 微信物流助手快递公司编码表
 *
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/server/API/express/delivery/open/delivery_open_msg_list.html
 *
 * 编码与微信官方 delivery_id 一致，前后端共用：
 *   - 后端在 uploadShippingInfo 时把 expressCompany 字段填入 express_company
 *   - 前端在 MallOrderDetail.vue 下拉选择时使用 value 字段
 *
 * 字段说明：
 *   - code: 微信官方 delivery_id（如 'ZTO'）
 *   - label: 中文显示名（如 '中通快递'）
 */
export interface ExpressCompanyOption {
  code: string
  label: string
}

export const EXPRESS_COMPANY_OPTIONS: readonly ExpressCompanyOption[] = [
  { code: 'ZTO', label: '中通快递' },
  { code: 'SF', label: '顺丰速运' },
  { code: 'YTO', label: '圆通速递' },
  { code: 'STO', label: '申通快递' },
  { code: 'HTKY', label: '百世快递' },
  { code: 'JD', label: '京东物流' },
  { code: 'EMS', label: 'EMS' },
  { code: 'ZJS', label: '宅急送' },
  { code: 'DBL', label: '德邦快递' },
  { code: 'POSTB', label: '邮政包裹' },
  { code: 'OTHER', label: '其他' },
]

/** 根据编码查中文标签，找不到返回原值 */
export function getExpressCompanyLabel(code: string): string {
  if (!code) return ''
  const found = EXPRESS_COMPANY_OPTIONS.find(o => o.code === code)
  return found ? found.label : code
}

/** 列表导出为前端下拉直接可用的格式 */
export const EXPRESS_COMPANY_SELECT_OPTIONS = EXPRESS_COMPANY_OPTIONS.map(o => ({
  value: o.code,
  label: o.label,
}))
```

- [ ] **Step 2: 提交**

```bash
git add cloudfunctions/common/expressCompanyCodes.ts
git commit -m "feat(logistics): 新增快递公司编码常量表（11 家主流快递）"
```

---

## Task 3: 后端商城订单发货对接微信物流助手

**Files:**
- Modify: `cloudfunctions/adminService/services/mall.js:291-315`（`shipMallOrder`）

- [ ] **Step 1: 在 mall.js 顶部 require 引入 uploadShippingInfo**

打开 `cloudfunctions/adminService/services/mall.js`，找到文件顶部的 require 区域（约第 1-30 行之间），追加一行：

```js
const { uploadShippingInfo } = require('../../common/wxLogistics')
```

- [ ] **Step 2: 替换 shipMallOrder 函数体**

定位到 `cloudfunctions/adminService/services/mall.js` 第 291-315 行的 `shipMallOrder` 函数，整体替换为：

```js
async function shipMallOrder(event, context, auth) {
  const { orderId, expressCompany, expressNo } = event
  if (!orderId) {throw err('INVALID_PARAMS', '缺少订单ID')}
  if (!expressNo) {throw err('INVALID_PARAMS', '请填写快递单号')}
  if (!expressCompany) {throw err('INVALID_PARAMS', '请选择快递公司')}

  const orderRes = await db.collection('orders').doc(orderId).get()
  if (!orderRes.data) {throw err('NOT_FOUND', '订单不存在')}
  if (orderRes.data.type !== 'mall') {throw err('BUSINESS_ERROR', '非商城订单')}

  try {
    validateTransition(MALL_ORDER_TRANSITIONS, orderRes.data.status, 'shipped')
  } catch (e) {
    return handleError(e, e.message, ERROR_CODES.BUSINESS)
  }

  await db.collection('orders').doc(orderId).update({
    data: {
      status: 'shipped',
      expressCompany, expressNo,
      shippedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })

  // 同步推送到微信「发货信息管理」，best-effort：失败只记日志，不阻断发货
  const transactionId = orderRes.data.wxTransactionId || orderRes.data.transactionId || ''
  if (transactionId) {
    try {
      const wxRes = await uploadShippingInfo({
        transactionId,
        merchantTradeNo: orderId,
        shippingItem: {
          expressCompany,
          expressNo,
          itemDesc: `${orderRes.data.productName || '商品'} ×${orderRes.data.quantity || 1}`,
        },
      })
      if (!wxRes.ok) {
        logger && logger.warn && logger.warn('shipMallOrder.uploadShippingInfo.fail', {
          orderId, transactionId, expressNo, error: wxRes.error,
        })
      }
    } catch (e) {
      logger && logger.warn && logger.warn('shipMallOrder.uploadShippingInfo.exception', {
        orderId, msg: (e && e.message) || String(e),
      })
    }
  }

  return handleSuccess(null, '发货成功')
}
```

注意：`logger` 应已在文件顶部 require 引入；若没有，请先确认 `const { logger } = require('../../common/logger')` 存在。如果该文件原本就通过其他方式记日志（例如 `console.warn`），保留原方式即可，把 `logger && logger.warn && logger.warn(...)` 替换为 `console.warn(...)`。

- [ ] **Step 3: 检查 mall.js 文件顶部是否已有 logger**

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && head -40 cloudfunctions/adminService/services/mall.js | grep -E "logger|require"`

如果有 logger 输出，跳过；如果没有，把 Step 2 中的 `logger && logger.warn && logger.warn(...)` 改为 `console.warn(...)`。

- [ ] **Step 4: 编译验证**

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && node -e "require('./cloudfunctions/adminService/services/mall.js'); console.log('OK')" 2>&1 | head -20`

如果 require 失败（因为缺少云函数环境），可改为只检查语法：

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && node --check cloudfunctions/adminService/services/mall.js && echo SYNTAX_OK`

Expected: `SYNTAX_OK`

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/adminService/services/mall.js
git commit -m "feat(logistics): shipMallOrder 同步推送发货信息到微信物流助手"
```

---

## Task 4: 后端团购订单发货扩展快递字段 + 微信物流助手

**Files:**
- Modify: `cloudfunctions/tuanService/index.ts:783-836`（`shipTuanOrder`）

- [ ] **Step 1: 在 tuanService/index.ts 顶部 require 引入 uploadShippingInfo**

打开 `cloudfunctions/tuanService/index.ts`，找到顶部 `require` 区域，追加：

```ts
import { uploadShippingInfo } from '../common/wxLogistics'
```

如果该文件用的是 `const ... = require(...)` 风格（与项目其他 TS 文件不同），改用：

```ts
const { uploadShippingInfo } = require('../common/wxLogistics')
```

通过观察文件顶部已有 require 决定风格。本计划假设用 ES import 风格。

- [ ] **Step 2: 替换 shipTuanOrder 函数体**

定位到 `cloudfunctions/tuanService/index.ts` 第 783-836 行 `shipTuanOrder`，整体替换为：

```ts
async function shipTuanOrder(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown> {
  const { orderId, expressCompany, expressNo } = event.data || {} as any
  if (!orderId) {
    throw err('INVALID_PARAMS', '缺少订单ID')
  }
  if (!expressNo) {
    throw err('INVALID_PARAMS', '请填写快递单号')
  }
  if (!expressCompany) {
    throw err('INVALID_PARAMS', '请选择快递公司')
  }
  // 权限：仅管理员或商家可发货
  if (!auth.isSuperAdmin && !auth.adminId) {
    throw err('PERMISSION_DENIED', '无权操作')
  }

  const orderRes = await db.collection('orders').doc(orderId as string).get()
  const order = orderRes.data as UnifiedOrder | undefined
  if (!order) {
    throw err('NOT_FOUND', '订单不存在')
  }
  if (order.type !== 'group_buy') {
    throw err('BUSINESS_ERROR', '非团购订单')
  }
  if (order.status !== 'paid') {
    throw err('BUSINESS_ERROR', '当前状态不可发货')
  }

  // 团购订单状态机：paid → pending_shipment → shipped → completed
  // 这里发货直接置为 shipped（与商城对齐，因为有 expressNo 就意味着已发出）
  await db.collection('orders').doc(orderId as string).update({
    data: {
      status: 'shipped',
      expressCompany,
      expressNo,
      shippedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })

  if (order.tuanOrderId) {
    try {
      await db.collection('tuan_orders').doc(order.tuanOrderId).update({
        data: {
          status: 'shipped',
          expressCompany,
          expressNo,
          shippedAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    } catch (e) {
      logger.warn('shipTuanOrder.syncTuanOrderFailed', { orderId, tuanOrderId: order.tuanOrderId, msg: (e as Error).message })
      try {
        const { recordAlert } = require('./common/alert')
        await recordAlert('warning', 'tuan.ship.syncTuanOrder.failed',
          '发货后 tuan_orders 状态同步失败',
          { orderId, tuanOrderId: order.tuanOrderId, targetStatus: 'shipped', error: (e as Error).message })
      } catch { /* best-effort */ }
      await recordFailedOperation('sync_tuan_order_status',
        { orderId, tuanOrderId: order.tuanOrderId, targetStatus: 'shipped' }, e)
    }
  }

  // 同步推送到微信「发货信息管理」，best-effort
  const transactionId = (order as any).wxTransactionId || (order as any).transactionId || ''
  if (transactionId) {
    try {
      const wxRes = await uploadShippingInfo({
        transactionId,
        merchantTradeNo: orderId as string,
        shippingItem: {
          expressCompany,
          expressNo,
          itemDesc: `${(order as any).productName || '团购商品'} ×${(order as any).quantity || 1}`,
        },
      })
      if (!wxRes.ok) {
        logger.warn('shipTuanOrder.uploadShippingInfo.fail', {
          orderId, transactionId, expressNo, error: wxRes.error,
        })
      }
    } catch (e) {
      logger.warn('shipTuanOrder.uploadShippingInfo.exception', {
        orderId, msg: (e as Error)?.message || String(e),
      })
    }
  }

  // L1: 写操作审计日志（best-effort）
  await writeOperationLog({
    module: 'tuan_order', action: 'ship', targetId: orderId as string,
    operatorId: auth.adminId || auth.openid,
    afterData: { status: 'shipped', expressCompany, expressNo },
  }).catch(e => logger.warn('shipTuanOrder.auditLog', { msg: (e as Error)?.message }))

  return handleSuccess(null, '发货成功')
}
```

**关键变更**：
1. 入参新增 `expressCompany / expressNo`，必填校验。
2. 状态由 `pending_shipment` 改为 `shipped`（因为有 expressNo 表示已实际发货；同时同步更新 `tuan_orders` 表）。
3. 调用 `uploadShippingInfo` 推送到微信。

- [ ] **Step 3: 检查团购状态机是否需调整**

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && grep -nE "GROUP_BUY_ORDER_TRANSITIONS|pending_shipment.*shipped|shipped.*completed" cloudfunctions/adminService/services/stateMachine.js | head -20`

确认团购订单状态机中 `paid → shipped` 与 `shipped → completed` 转移都已存在。如果只允许 `paid → pending_shipment`，需要同步扩展状态机。本计划假设状态机支持直跳 `shipped`（与商城一致）；若不支持，在 `stateMachine.js` 的 `GROUP_BUY_ORDER_TRANSITIONS` 中增加 `paid → shipped` 转移。

- [ ] **Step 4: 编译验证**

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && node --check cloudfunctions/tuanService/index.js && echo SYNTAX_OK`

注意检查的是 `.js`（编译产物），不是 `.ts`。如果 `.js` 不存在，先 `npx --yes -p typescript@5.4.5 tsc -p cloudfunctions/tsconfig.json`，再 `node --check`。

Expected: `SYNTAX_OK`

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/tuanService/index.ts
git commit -m "feat(logistics): shipTuanOrder 扩展快递字段并同步微信物流助手"
```

---

## Task 5: 后端新增 mallService.getLogisticsTrack handler

**Files:**
- Modify: `cloudfunctions/mallService/index.ts`（追加 handler，注册到 handlers 路由表）

- [ ] **Step 1: 在 mallService/index.ts 顶部 require 引入 getLogisticsPath**

打开 `cloudfunctions/mallService/index.ts`，找到顶部 require 区域，追加：

```ts
import { getLogisticsPath } from '../common/wxLogistics'
```

如果该文件用的是 `const { ... } = require(...)` 风格（与项目其他 TS 文件不同），改用：

```ts
const { getLogisticsPath } = require('../common/wxLogistics')
```

通过观察文件顶部已有 require 决定风格。本计划假设用 ES import 风格。

- [ ] **Step 2: 追加 getLogisticsTrack handler 函数**

定位到 `cloudfunctions/mallService/index.ts` 文件末尾（在 `export const handlers` 路由表之前），追加：

```ts
// =====================================================================
// Handler: getLogisticsTrack - 获取订单物流轨迹（降级方案）
// =====================================================================
// 用途：前端 wx.openBusinessView({businessType:'logisticsDetail'}) 不可用时，
//      调本接口拉取轨迹自建展示。
// 入参：{ orderId: string }
// 返回：{ code, data: { expressCompany, expressNo, track: [{time, desc}] } }
// 权限：仅订单所有者可查

export async function getLogisticsTrack(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { orderId } = event
  if (!orderId) { throw err('INVALID_PARAMS', '缺少订单ID') }

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    const orderData = orderRes.data as OrderRecord | null
    if (!orderData || orderData.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '无权限查看此订单')
    }

    const expressCompany = (orderData as any).expressCompany || ''
    const expressNo = (orderData as any).expressNo || ''
    if (!expressCompany || !expressNo) {
      return handleSuccess({
        expressCompany: '',
        expressNo: '',
        track: [],
      }, '该订单暂无物流信息')
    }

    const wxRes = await getLogisticsPath({ expressCompany, expressNo })
    if (!wxRes.ok || !wxRes.data) {
      // 降级：返回空轨迹，但 expressCompany / expressNo 仍透传给前端展示
      logger.warn('getLogisticsTrack.getPathFail', {
        orderId, expressCompany, expressNo, error: wxRes.error,
      })
      return handleSuccess({
        expressCompany,
        expressNo,
        track: [],
      }, wxRes.error || '暂无轨迹')
    }

    return handleSuccess({
      expressCompany,
      expressNo,
      track: wxRes.data,
    }, '获取成功')
  } catch (error) {
    logger.error('getLogisticsTrack', error)
    return handleError(error, '获取物流轨迹失败', ERROR_CODES.SERVER)
  }
}
```

- [ ] **Step 3: 在 handlers 路由表中注册 getLogisticsTrack**

定位到 `cloudfunctions/mallService/index.ts` 第 1593 行附近的 `export const handlers` 对象，在合适位置追加一行：

```ts
  getLogisticsTrack,
```

例如在 `getWxShippingStatus,` 之后。

- [ ] **Step 4: 编译验证**

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && node --check cloudfunctions/mallService/index.js && echo SYNTAX_OK`

注意检查的是 `.js`（编译产物）。如果 `.js` 不存在或未重新编译，先：

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && npx --yes -p typescript@5.4.5 tsc -p cloudfunctions/tsconfig.json 2>&1 | head -30`

Expected: `SYNTAX_OK`（或 tsc 无错）

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/mallService/index.ts cloudfunctions/mallService/index.js cloudfunctions/mallService/index.d.ts
git commit -m "feat(logistics): 新增 mallService.getLogisticsTrack handler 拉取运单轨迹"
```

---

## Task 6: 前端 CloudFunctionService 新增 getLogisticsTrack 调用

**Files:**
- Modify: `services/CloudFunctionService.js:365-372`（在 `getWxShippingStatus` 之后追加）

- [ ] **Step 1: 在 CloudFunctionService.js 中追加方法**

定位到 `services/CloudFunctionService.js` 第 372 行（`getWxShippingStatus` 方法的 `}` 之后），追加：

```js
  /**
   * 拉取订单物流轨迹（作为 wx.openBusinessView logisticsDetail 不可用时的降级方案）。
   * @param {string} orderId
   * @returns {Promise<{ code, data: { expressCompany, expressNo, track: Array<{time, desc}> } }>}
   */
  async getLogisticsTrack(orderId) {
    return this.cloud.call('mallService', { action: 'getLogisticsTrack', orderId }, { useCache: false })
  }
```

- [ ] **Step 2: 语法验证**

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && node --check services/CloudFunctionService.js && echo SYNTAX_OK`

Expected: `SYNTAX_OK`

- [ ] **Step 3: 提交**

```bash
git add services/CloudFunctionService.js
git commit -m "feat(logistics): CloudFunctionService 新增 getLogisticsTrack 方法"
```

---

## Task 7: 创建 logistics-card 独立组件

**Files:**
- Create: `components/logistics-card/index.js`
- Create: `components/logistics-card/index.json`
- Create: `components/logistics-card/index.wxml`
- Create: `components/logistics-card/index.wxss`

- [ ] **Step 1: 创建组件 index.json**

写入文件 `components/logistics-card/index.json`：

```json
{
  "component": true,
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建组件 index.js（含完整逻辑）**

写入文件 `components/logistics-card/index.js`：

```js
/**
 * logistics-card - 物流卡片组件
 *
 * 职责：
 *   1. 展示快递单号 + 发货时间
 *   2. 点击拉起 wx.openBusinessView({businessType:'logisticsDetail'}) 官方半屏组件
 *   3. 失败降级：调本服务 mallService.getLogisticsTrack 拉取轨迹并展示
 *   4. 支持展开/收起轨迹列表
 *
 * 使用方式（父页面）：
 *   <logistics-card
 *     order-id="{{order._id}}"
 *     express-company="{{order.expressCompany}}"
 *     express-no="{{order.expressNo}}"
 *     shipped-at="{{order.shippedAt}}"
 *     transaction-id="{{order.transactionId}}"
 *     wx-transaction-id="{{order.wxTransactionId}}"
 *   />
 *
 * 依赖：
 *   - services/CloudFunctionService.js 中的 OrderService.getLogisticsTrack
 *   - wx.openBusinessView（基础库 ≥ 2.27）
 */
const { OrderService } = require('../../services/CloudFunctionService')

Component({
  options: {
    multipleSlots: false,
    addGlobalClass: true, // 让组件内样式可被页面 wxss 覆盖（如暗色模式）
  },

  properties: {
    // 订单 _id（用于调本服务 getLogisticsTrack）
    orderId: { type: String, value: '' },
    // 快递公司编码（如 'ZTO'）
    expressCompany: { type: String, value: '' },
    // 快递单号
    expressNo: { type: String, value: '' },
    // 发货时间（已格式化的字符串）
    shippedAt: { type: String, value: '' },
    // 微信支付订单号（用于拉起 wx logisticsDetail 组件）
    transactionId: { type: String, value: '' },
    // wxTransactionId 优先级高于 transactionId
    wxTransactionId: { type: String, value: '' },
    // 是否默认展开轨迹列表
    defaultExpanded: { type: Boolean, value: false },
  },

  data: {
    logisticsTrack: [],         // 降级方案下展示的轨迹列表 [{time, desc}]
    logisticsLoading: false,    // 拉取轨迹中
    logisticsExpanded: false,   // 是否展开轨迹列表
    hasFetchedTrack: false,     // 是否已经拉过一次轨迹（避免重复拉）
  },

  lifetimes: {
    attached() {
      this.setData({ logisticsExpanded: this.data.defaultExpanded })
    },
  },

  methods: {
    /**
     * 点击「查看物流」按钮：
     * - 优先调 wx.openBusinessView({businessType:'logisticsDetail'}) 拉起官方半屏组件；
     * - 失败（低版本基础库 / 用户取消 / 微信侧未生成物流卡）则降级调本服务 getLogisticsTrack 自建展示。
     */
    onViewLogistics() {
      if (!this.data.expressNo) {
        this._toast('该订单暂无快递单号')
        return
      }
      this._openWxLogisticsView()
    },

    /**
     * 拉起微信官方物流详情半屏组件。
     * - 文档：https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping-half.html
     * - 拉起前提：商家发货时已调 uploadShippingInfo 把快递信息推到微信侧。
     */
    _openWxLogisticsView() {
      if (typeof wx.openBusinessView !== 'function') {
        // 低版本基础库，直接降级
        this._fallbackGetTrack()
        return
      }
      const transactionId = this.data.wxTransactionId || this.data.transactionId || ''
      if (!transactionId) {
        // 无微信支付订单号，无法拉起官方组件，降级
        this._fallbackGetTrack()
        return
      }
      wx.openBusinessView({
        businessType: 'logisticsDetail',
        extraData: {
          transaction_id: transactionId,
        },
        success: () => {
          // 拉起成功即可，无需刷新
        },
        fail: (e) => {
          console.warn('[logistics-card] wx.openBusinessView logisticsDetail fail', e)
          // 降级到自建轨迹
          this._fallbackGetTrack()
        },
      })
    },

    /**
     * 降级方案：调本服务 getLogisticsTrack 拉取轨迹，本地展示。
     * 已拉过则只切换展开状态，不重复请求。
     */
    async _fallbackGetTrack() {
      if (this.data.hasFetchedTrack) {
        this.setData({ logisticsExpanded: true })
        return
      }
      const orderId = this.data.orderId
      if (!orderId) {
        this._toast('缺少订单ID')
        return
      }
      this.setData({ logisticsLoading: true, logisticsExpanded: true })
      try {
        const res = await OrderService.getLogisticsTrack(orderId)
        if (res && res.code === 0 && res.data) {
          this.setData({
            logisticsTrack: Array.isArray(res.data.track) ? res.data.track : [],
            logisticsLoading: false,
            hasFetchedTrack: true,
          })
          if (!res.data.track || res.data.track.length === 0) {
            this._toast('暂无轨迹')
          }
        } else {
          this.setData({ logisticsLoading: false })
          this._toast((res && res.message) || '获取轨迹失败')
        }
      } catch (e) {
        this.setData({ logisticsLoading: false })
        this._toast((e && e.message) || '获取轨迹失败')
      }
    },

    onToggleLogistics() {
      this.setData({ logisticsExpanded: !this.data.logisticsExpanded })
    },

    _toast(text, icon = 'none') {
      wx.showToast({ title: text, icon, duration: 2000 })
    },
  },
})
```

- [ ] **Step 3: 创建组件 index.wxml**

写入文件 `components/logistics-card/index.wxml`：

```xml
<view class="logistics-card">
  <view class="logistics-row" bindtap="onViewLogistics">
    <view class="logistics-info">
      <view class="logistics-line">
        <text class="logistics-label">快递单号</text>
        <text class="logistics-value">{{expressNo || '暂无'}}</text>
      </view>
      <view class="logistics-line" wx:if="{{shippedAt}}">
        <text class="logistics-label">发货时间</text>
        <text class="logistics-value">{{shippedAt}}</text>
      </view>
    </view>
    <view class="logistics-arrow"></view>
  </view>
  <view class="logistics-track" wx:if="{{logisticsExpanded}}">
    <view class="track-loading" wx:if="{{logisticsLoading}}">加载中...</view>
    <block wx:else>
      <view class="track-empty" wx:if="{{logisticsTrack.length === 0}}">暂无轨迹</view>
      <view class="track-item" wx:for="{{logisticsTrack}}" wx:key="time">
        <view class="track-dot"></view>
        <view class="track-content">
          <text class="track-desc">{{item.desc}}</text>
          <text class="track-time">{{item.time}}</text>
        </view>
      </view>
    </block>
  </view>
  <view class="logistics-toggle" wx:if="{{logisticsTrack.length > 0}}" bindtap="onToggleLogistics">
    <text>{{logisticsExpanded ? '收起' : '展开'}}轨迹</text>
  </view>
</view>
```

- [ ] **Step 4: 创建组件 index.wxss**

写入文件 `components/logistics-card/index.wxss`：

```css
.logistics-card {
  display: block;
}

.logistics-row {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
}

.logistics-info {
  flex: 1;
}

.logistics-line {
  display: flex;
  align-items: center;
  margin-bottom: 12rpx;
}

.logistics-line:last-child {
  margin-bottom: 0;
}

.logistics-label {
  font-size: 26rpx;
  color: #999;
  width: 160rpx;
}

.logistics-value {
  font-size: 28rpx;
  color: #333;
  flex: 1;
}

.logistics-arrow {
  width: 16rpx;
  height: 16rpx;
  border-top: 2rpx solid #ccc;
  border-right: 2rpx solid #ccc;
  transform: rotate(45deg);
  margin-left: 16rpx;
}

.logistics-track {
  padding: 16rpx 0;
  border-top: 1rpx solid #f0f0f0;
}

.track-loading,
.track-empty {
  font-size: 26rpx;
  color: #999;
  text-align: center;
  padding: 24rpx 0;
}

.track-item {
  display: flex;
  padding: 16rpx 0;
  position: relative;
}

.track-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #0D5A6B;
  margin-right: 16rpx;
  margin-top: 8rpx;
  flex-shrink: 0;
}

.track-content {
  flex: 1;
}

.track-desc {
  display: block;
  font-size: 26rpx;
  color: #333;
  line-height: 1.5;
}

.track-time {
  display: block;
  font-size: 24rpx;
  color: #999;
  margin-top: 4rpx;
}

.logistics-toggle {
  text-align: center;
  font-size: 26rpx;
  color: #0D5A6B;
  padding: 16rpx 0;
  border-top: 1rpx solid #f0f0f0;
}
```

- [ ] **Step 5: 语法验证**

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && node --check components/logistics-card/index.js && echo SYNTAX_OK`

Expected: `SYNTAX_OK`

- [ ] **Step 6: 提交**

```bash
git add components/logistics-card/
git commit -m "feat(logistics): 新增 logistics-card 独立组件（拉起微信物流详情 + 降级轨迹）"
```

---

## Task 8: 前端 mall-order-detail 接入 logistics-card 组件

**Files:**
- Modify: `subpackages/profile/mall-order-detail/index.js:108-132`（`_normalizeOrder` 透传物流字段）
- Modify: `subpackages/profile/mall-order-detail/index.json`（注册组件）
- Modify: `subpackages/profile/mall-order-detail/index.wxml`（引用组件）

- [ ] **Step 1: 扩展 _normalizeOrder 透传物流字段**

打开 `subpackages/profile/mall-order-detail/index.js`，定位到第 108-132 行的 `_normalizeOrder` 方法，整体替换为：

```js
  _normalizeOrder(raw) {
    const status = raw.status || 'pending_payment'
    return {
      _id: raw._id,
      orderNo: raw.orderNo || '',
      productId: raw.productId || '',
      productName: raw.productName || '',
      productImage: raw.productImage || '',
      skuId: raw.skuId || '',
      skuText: raw.skuText || '',
      unitPrice: raw.unitPrice || 0,
      quantity: raw.quantity || 1,
      totalAmount: raw.totalAmount || 0,
      receiverName: raw.receiverName || '',
      receiverPhone: raw.receiverPhone || '',
      receiverAddress: raw.receiverAddress || '',
      // 微信支付订单号（确认收货 / 物流详情组件必传）
      transactionId: raw.transactionId || '',
      wxTransactionId: raw.wxTransactionId || '',
      // 物流信息（透传给 logistics-card 组件）
      expressCompany: raw.expressCompany || '',
      expressNo: raw.expressNo || '',
      shippedAt: this._formatDateTime(raw.shippedAt),
      status,
      statusText: STATUS_TEXT_MAP[status] || status,
      statusDesc: STATUS_DESC_MAP[status] || '',
      createdAt: this._formatDateTime(raw.createdAt),
    }
  },
```

注意：本方案不在 mall-order-detail 页面 data 中追加 `logisticsTrack / logisticsLoading / logisticsExpanded` 字段，因为所有物流交互状态都封装在 `<logistics-card>` 组件内部，页面只透传 props。

- [ ] **Step 2: 在 mall-order-detail/index.json 注册 logistics-card 组件**

打开 `subpackages/profile/mall-order-detail/index.json`，整体内容应类似：

```json
{
  "navigationBarTitleText": "订单详情",
  "usingComponents": {
    "logistics-card": "/components/logistics-card/index"
  }
}
```

如果原文件已有 `usingComponents`，只需在 `usingComponents` 对象内追加 `"logistics-card": "/components/logistics-card/index"`。

- [ ] **Step 3: 在 mall-order-detail/index.wxml 已发货 / 已完成状态引用 logistics-card 组件**

打开 `subpackages/profile/mall-order-detail/index.wxml`，定位到第 40-52 行的 `receiver-section` 之后（第 52 行 `</view>` 之后），追加：

```xml
    <view class="section logistics-section" wx:if="{{order.status === 'shipped' || order.status === 'completed'}}">
      <view class="section-title">物流信息</view>
      <logistics-card
        order-id="{{order._id}}"
        express-company="{{order.expressCompany}}"
        express-no="{{order.expressNo}}"
        shipped-at="{{order.shippedAt}}"
        transaction-id="{{order.transactionId}}"
        wx-transaction-id="{{order.wxTransactionId}}"
      />
    </view>
```

- [ ] **Step 4: 在 mall-order-detail/index.wxss 追加 section 容器样式（不需要内联物流卡片样式）**

打开 `subpackages/profile/mall-order-detail/index.wxss`，在文件末尾追加（只追加 section 容器，不重复 logistics-card 组件内部样式）：

```css
.logistics-section {
  margin-top: 16rpx;
}
```

注意：不要把组件 wxss 中的样式重复写到这里，组件样式已通过 `addGlobalClass: true` 与页面隔离。

- [ ] **Step 5: 语法验证**

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && node --check subpackages/profile/mall-order-detail/index.js && echo SYNTAX_OK`

Expected: `SYNTAX_OK`

- [ ] **Step 6: 提交**

```bash
git add subpackages/profile/mall-order-detail/index.js subpackages/profile/mall-order-detail/index.json subpackages/profile/mall-order-detail/index.wxml subpackages/profile/mall-order-detail/index.wxss
git commit -m "feat(logistics): mall-order-detail 详情页接入 logistics-card 组件"
```

---

## Task 9: web-admin 后台发货表单增加快递公司选择

**Files:**
- Modify: `web-admin/src/api/mall-order.js`
- Modify: `web-admin/src/views/mall-order/MallOrderDetail.vue`

- [ ] **Step 1: 修改 mall-order.js 让 expressCompany 必填（去掉默认值）**

打开 `web-admin/src/api/mall-order.js`，把第 4 行：

```js
export function shipMallOrder(orderId, expressNo, expressCompany = '其他') { return callAction('shipMallOrder', { orderId, expressNo, expressCompany }) }
```

改为：

```js
export function shipMallOrder(orderId, expressNo, expressCompany) { return callAction('shipMallOrder', { orderId, expressNo, expressCompany }) }
```

- [ ] **Step 2: 在 MallOrderDetail.vue 顶部 import 新增快递公司编码常量**

由于 web-admin 是独立前端项目（Vue 3），不能直接 import 后端的 `cloudfunctions/common/expressCompanyCodes.ts`。在 `web-admin/src/views/mall-order/MallOrderDetail.vue` 文件 `<script setup>` 顶部追加常量：

```js
const EXPRESS_COMPANY_OPTIONS = [
  { value: 'ZTO', label: '中通快递' },
  { value: 'SF', label: '顺丰速运' },
  { value: 'YTO', label: '圆通速递' },
  { value: 'STO', label: '申通快递' },
  { value: 'HTKY', label: '百世快递' },
  { value: 'JD', label: '京东物流' },
  { value: 'EMS', label: 'EMS' },
  { value: 'ZJS', label: '宅急送' },
  { value: 'DBL', label: '德邦快递' },
  { value: 'POSTB', label: '邮政包裹' },
  { value: 'OTHER', label: '其他' },
]
```

- [ ] **Step 3: 替换 onShip 函数为两个串联 prompt（快递公司编码 + 快递单号）**

打开 `web-admin/src/views/mall-order/MallOrderDetail.vue`，找到第 39-45 行的 `onShip` 函数，整体替换为：

```js
async function onShip() {
  // 简化版：先 prompt 快递公司编码，再 prompt 快递单号
  const optionsText = EXPRESS_COMPANY_OPTIONS.map(o => `${o.value}=${o.label}`).join(' / ')
  const { value: companyCode } = await ElMessageBox.prompt(
    `请输入快递公司编码（${optionsText}）`,
    '发货 - 快递公司',
    { inputPlaceholder: '如 ZTO' }
  ).catch(() => ({ value: null }))
  if (!companyCode) return

  const matched = EXPRESS_COMPANY_OPTIONS.find(o => o.value === companyCode.toUpperCase())
  if (!matched) {
    ElMessage.error(`快递公司编码无效：${companyCode}`)
    return
  }

  const { value: expressNo } = await ElMessageBox.prompt(
    `请输入 ${matched.label} 的快递单号`,
    '发货 - 快递单号',
    { inputPlaceholder: '快递单号' }
  ).catch(() => ({ value: null }))
  if (!expressNo) return

  await shipMallOrder(route.params.id, expressNo, matched.value)
  ElMessage.success('发货成功')
  const res = await getMallOrderDetail(route.params.id)
  order.value = res.data || {}
}
```

**采用串联 prompt 而非 ElMessageBox.confirm + h 渲染**，原因是：1) Element Plus 的 ElMessageBox 自定义渲染需要额外引入 `h` 函数且响应式 ref 在 messagebox 闭包中失效，代码繁琐易错；2) 后续如果业务需要更复杂的表单，可以独立做成 Dialog 组件。

- [ ] **Step 4: 在 MallOrderDetail.vue 模板中追加已发货状态展示物流信息**

打开 `web-admin/src/views/mall-order/MallOrderDetail.vue`，定位到第 12 行 `收货地址` 之后，追加：

```html
        <el-descriptions-item label="快递公司" v-if="order.expressCompany">{{ order.expressCompany }}</el-descriptions-item>
        <el-descriptions-item label="快递单号" v-if="order.expressNo">{{ order.expressNo }}</el-descriptions-item>
        <el-descriptions-item label="发货时间" v-if="order.shippedAt">{{ order.shippedAt }}</el-descriptions-item>
```

- [ ] **Step 5: 启动 web-admin 验证（手动）**

Run: `cd /Users/yy/Documents/trae_projects/zuoyou/web-admin && npm run dev 2>&1 | head -30`

打开浏览器访问 `http://localhost:5173`（或实际端口），导航到商城订单详情页，点击「发货」按钮，验证：
1. 第一个 prompt 提示快递公司编码
2. 输入有效编码（如 `ZTO`）后第二个 prompt 提示快递单号
3. 输入单号确认后，详情页显示「快递公司 / 快递单号 / 发货时间」

Expected: 弹窗流程正常，发货后订单状态变为 shipped，且详情页展示物流字段。

- [ ] **Step 6: 提交**

```bash
git add web-admin/src/api/mall-order.js web-admin/src/views/mall-order/MallOrderDetail.vue
git commit -m "feat(logistics): web-admin 发货表单新增快递公司选择 + 详情页展示物流信息"
```

---

## Task 10: 端到端联调与回归测试

**Files:**
- 无新增文件；仅做手动验证与日志核查

- [ ] **Step 1: 部署后端云函数**

Run: `cd /Users/yy/Documents/trae_projects/zuoyou && bash deploy_cloudfunctions.sh mallService adminService tuanService 2>&1 | tail -30`

或按项目实际部署脚本调整。预期三个云函数都部署成功。

- [ ] **Step 2: 在微信开发者工具中打开小程序，模拟一笔商城订单付款**

1. 打开微信开发者工具，加载本项目
2. 进入商城 → 选择一个商品 → 下单 → 微信支付（用测试号 + 测试商户）
3. 确认订单状态变为 `paid`

Expected: 订单创建并支付成功，`orders` 集合有 `transactionId / wxTransactionId`。

- [ ] **Step 3: 在 web-admin 后台对该订单发货**

1. 访问 web-admin 后台，进入商城订单详情页
2. 点击「发货」按钮
3. 输入快递公司编码 `ZTO` + 一个测试快递单号（如 `1234567890`）
4. 确认发货

Expected:
- 后端 `shipMallOrder` 调用成功
- `orders` 集合该订单文档新增 `expressCompany: 'ZTO' / expressNo: '1234567890' / shippedAt` 字段
- 后端日志可见 `uploadShippingInfo` 调用记录（成功或 best-effort 失败）
- 微信「发货信息管理」后台（mp.weixin.qq.com）能看到该订单的发货信息

- [ ] **Step 4: 在小程序端 mall-order-detail 详情页验证**

1. 重新进入小程序订单详情页
2. 验证：状态 banner 显示「已发货」
3. 验证：物流卡片区显示快递单号 + 发货时间
4. 点击「查看物流」按钮：
   - 基础库 ≥ 2.27 应拉起微信官方物流详情半屏
   - 低版本应降级展示轨迹列表（首次可能为空，因微信侧轨迹缓存有延迟）

Expected: 物流卡片正常展示，按钮拉起半屏或降级轨迹列表。

- [ ] **Step 5: 团购订单回归测试（如果有现成团购）**

1. 创建一个团购订单并支付
2. 在 web-admin 或调 `tuanService.shipTuanOrder` 接口发货（带 `expressCompany / expressNo`）
3. 验证 `orders` 和 `tuan_orders` 表均同步状态为 `shipped` + 快递字段

Expected: 团购订单状态机正确流转，微信物流助手同步成功。

- [ ] **Step 6: 确认收货链路回归**

1. 在 mall-order-detail 已发货状态点击「确认收货」
2. 验证 `wx.openBusinessView({businessType:'weappOrderConfirm'})` 仍能正常拉起
3. 确认收货后，订单状态变为 `completed`

Expected: 之前的确认收货链路不受影响（只新增了物流卡片，未改动 `_openWxConfirmView` 逻辑）。

- [ ] **Step 7: 提交测试报告（可选）**

如有测试报告文档，追加到 `docs/superpowers/plans/2026-07-26-logistics-assistant-test-report.md`。否则跳过。

- [ ] **Step 8: 整体提交（如有遗漏的修复）**

```bash
git add -A
git commit -m "test(logistics): 端到端联调完成，回归确认收货链路无影响"
```

---

## 实施顺序总览

按依赖关系：
1. **Task 1**（后端 API 封装）—— 无依赖
2. **Task 2**（快递编码常量）—— 无依赖
3. **Task 3**（mall shipMallOrder 集成）—— 依赖 Task 1
4. **Task 4**（tuan shipTuanOrder 集成）—— 依赖 Task 1
5. **Task 5**（mallService.getLogisticsTrack handler）—— 依赖 Task 1
6. **Task 6**（前端 CloudFunctionService 封装）—— 依赖 Task 5
7. **Task 7**（logistics-card 独立组件）—— 依赖 Task 6
8. **Task 8**（mall-order-detail 详情页接入组件）—— 依赖 Task 7
9. **Task 9**（web-admin 发货表单改造）—— 依赖 Task 3
10. **Task 10**（端到端联调）—— 依赖 Task 1-9 全部完成

Task 1 / Task 2 可并行；Task 3 / Task 4 / Task 5 可并行；Task 7 / Task 9 可并行；Task 8 依赖 Task 7。

---

## 风险与降级

| 风险 | 应对 |
|---|---|
| `uploadShippingInfo` 调用失败（access_token 过期 / 网络异常） | best-effort：失败仅记日志，不阻断本地发货流程；微信侧状态由 `reconcileOrderWithWx` 兜底对账 |
| `wx.openBusinessView` 在低版本基础库不可用 | 已实现降级到 `_fallbackGetTrack` 调本服务 `getLogisticsTrack` |
| 团购状态机不允许 `paid → shipped` 直跳 | Task 4 Step 3 已检查并扩展状态机 |
| 微信侧轨迹缓存延迟（刚发货查不到轨迹） | 降级方案返回空轨迹 + 「暂无轨迹」提示，不报错 |
| `expressCompany` 编码不在微信 `delivery_id` 标准内 | Task 2 常量表已覆盖 11 家主流快递；`OTHER` 编码微信侧也能接受（无法查轨迹但能上传） |
| web-admin 后台发货时输入错编码 | Task 9 已实现编码白名单校验 |

---

## 不在本次范围

以下事项已识别但不在本次实施范围：
- 后台「物流看板」批量展示所有订单的物流状态（可后续做 web-admin 列表页改造）
- 团购团长端小程序入口的发货 UI（当前只走 web-admin / super_admin）
- 自动确认收货定时任务（项目已有相关 cron，本方案不动）
- 国际物流支持（当前 delivery_id 表只覆盖国内主流快递）

如需扩展，可在本计划完成后单独立项。
