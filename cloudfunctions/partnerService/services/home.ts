/**
 * home.ts - 合伙人中心首屏聚合接口（BFF，2026-09-01 性能优化）
 *
 * 背景：
 *   合伙人中心首页原本需要 3 次云函数调用（getMyPermissions / getApplicationStatus /
 *   getMyIncomeOverview），每次调用都要付一次网络 RTT + 一次可能的冷启动。
 *   本接口在同一次云调用内聚合三份数据：3 次冷启 + 3 次 RTT → 1 次冷启 + 1 次 RTT。
 *
 * 设计：
 *   - 阶段一：并行取权限 + 申请状态
 *   - 阶段二：仅当是合伙人时再取收入概览（内部串行不影响外部 RTT，省掉无谓查询）
 *   - 任一子模块失败不影响整体（降级为该项默认值），首屏宁可少数据不可白屏
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.partnerService.json
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleSuccess } = require('../common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('../common/logger')

// 子模块走编译产物 require，避免与 index.ts 形成循环依赖
// eslint-disable-next-line @typescript-eslint/no-var-requires
const applicationHandlers = require('./application')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const walletHandlers = require('./wallet')

const logger = createLogger('partnerService:home')

// =====================================================================
// 类型定义（与 index.ts 保持形状一致，避免反向依赖）
// =====================================================================

export interface BffAuth {
  openid?: string
  [k: string]: unknown
}

export interface BffEvent {
  action?: string
  [k: string]: unknown
}

export interface BffContext {
  [k: string]: unknown
}

interface SubResult {
  code?: number | string
  data?: unknown
}

export interface PartnerHomeSummary {
  isPartner: boolean
  hasPendingApplication: boolean
  incomeSummary: {
    total: string
    monthly: string
    walletBalance: string
  } | null
}

/** 子模块降级：任一失败返回 null，不阻断首屏 */
async function safe(
  promise: Promise<unknown>,
  tag: string
): Promise<SubResult | null> {
  try {
    const res = (await promise) as SubResult | null
    return res && res.data ? res : null
  } catch (error) {
    logger.warn(`getPartnerHome.${tag}`, {
      msg: (error as Error)?.message || String(error),
    })
    return null
  }
}

/** 数值兜底：undefined / 非数字一律按 0 处理（金额单位：元） */
function num(value: unknown): number {
  return Number(value) || 0
}

// =====================================================================
// Handler: getPartnerHome
// =====================================================================

export async function getPartnerHome(
  event: BffEvent,
  context: BffContext,
  auth: BffAuth
): Promise<unknown> {
  const [permRes, appRes] = await Promise.all([
    safe(applicationHandlers.getMyPermissions(event, context, auth), 'getMyPermissions'),
    safe(applicationHandlers.getApplicationStatus(event, context, auth), 'getApplicationStatus'),
  ])

  const isPartner =
    ((permRes?.data as { isPartner?: boolean } | undefined)?.isPartner === true)
  const hasPendingApplication =
    ((appRes?.data as { hasPending?: boolean } | undefined)?.hasPending === true)

  let incomeSummary: PartnerHomeSummary['incomeSummary'] = null
  if (isPartner) {
    const incomeRes = await safe(
      walletHandlers.getMyIncomeOverview(event, context, auth),
      'getMyIncomeOverview'
    )
    const d = incomeRes?.data as Record<string, any> | undefined
    if (d) {
      incomeSummary = {
        total: (
          num(d.commission?.total) + num(d.activity?.total) +
          num(d.boarding?.total) + num(d.feeding?.total)
        ).toFixed(2),
        monthly: (
          num(d.commission?.monthly) + num(d.activity?.monthly) +
          num(d.boarding?.monthly) + num(d.feeding?.monthly)
        ).toFixed(2),
        walletBalance: num(d.wallet?.balance).toFixed(2),
      }
    }
  }

  return handleSuccess(
    { isPartner, hasPendingApplication, incomeSummary },
    '获取成功'
  )
}
