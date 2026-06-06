/**
 * 风控模块（TypeScript 源文件 - Sprint 15 迁移）
 *
 * 目标：
 *   - 评价刷量识别（submitEvaluation 写入前风控）
 *   - 退款滥用识别（createRefund 写入前风控）
 *   - 提供 action → 错误码映射与业务层辅助
 *
 * 设计原则：
 *   - 纯函数式：detect* 接收 db 快照，返回风险报告
 *   - 不阻塞主流程：仅返回 riskLevel + reasons + action 建议
 *   - 可插拔：每个检测项独立函数，配置项集中在 CONFIG
 *   - 与 errors.ts 联动：mapActionToErrorCode / assertRiskDecision
 *
 * 风险等级：
 *   - low   → action=allow  → 业务返回 RISK_PASS
 *   - medium → action=review → 业务返回 RISK_PENDING（待人工审核）
 *   - high  → action=reject → 业务返回 RISK_REJECT
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 *   （运行时仍消费 .js 编译产物）
 */
import type { CloudBaseDB } from './types';
/** 风控风险等级 */
export type RiskLevel = 'low' | 'medium' | 'high';
/** 风控处置动作 */
export type RiskAction = 'allow' | 'review' | 'reject';
/** 风险报告（detect* 通用返回） */
export interface RiskReport {
    level: RiskLevel;
    action: RiskAction;
    reasons: string[];
    details: Record<string, unknown>;
    target: Record<string, unknown>;
}
/** 评价快照（最小字段，供 detectReviewSpam 使用） */
export interface EvaluationSnapshot {
    _id: string;
    ownerId: string;
    hostId: string;
    orderId: string;
    rating: number;
    comment: string;
    /** ms timestamp */
    createdAt: number;
}
/** 退款快照（供 detectRefundAbuse 使用） */
export interface RefundSnapshot {
    _id: string;
    ownerId: string;
    orderId: string;
    /** 单位：分 */
    refundAmount: number;
    /** 订单原金额，单位：分 */
    totalAmount: number;
    reason: string;
    status: 'pending' | 'success' | 'failed' | 'closed';
    createdAt: number;
}
/** detectReviewSpam 入参 */
export interface DetectReviewSpamInput {
    db: CloudBaseDB;
    userId: string;
    hostId: string;
    orderId: string;
    rating: number;
    comment: string;
    now?: number;
}
/** detectRefundAbuse 入参 */
export interface DetectRefundAbuseInput {
    db: CloudBaseDB;
    userId: string;
    orderId: string;
    refundAmount: number;
    totalAmount: number;
    reason?: string;
    now?: number;
}
/** 单项检测结果 */
export interface DetectionResult {
    hit: boolean;
    level: RiskLevel;
    [key: string]: unknown;
}
/** assertRiskDecision 返回（allow 路径） */
export interface RiskPassResult {
    passed: true;
    code: 'RISK_PASS';
    reasons: string[];
}
/**
 * 风控配置
 * 阈值可按业务调整；调整后只需更新本对象
 */
export declare const CONFIG: {
    HIGH_FREQ_WINDOW_MS: number;
    HIGH_FREQ_THRESHOLD: number;
    HOST_CONCENTRATION_WINDOW_MS: number;
    HOST_CONCENTRATION_THRESHOLD: number;
    HOST_CONCENTRATION_HIGH: number;
    DUP_COMMENT_WINDOW_MS: number;
    DUP_COMMENT_THRESHOLD: number;
    DUP_COMMENT_HIGH: number;
    DUP_ORDER_THRESHOLD: number;
    COMMENT_MIN_LEN: number;
    COMMENT_MAX_LEN: number;
    FIVE_STAR_RATIO_THRESHOLD: number;
    FIVE_STAR_MIN_SAMPLES: number;
};
/**
 * 计算评论指纹（标准化 + 哈希）
 * 规则：
 *   - 去首尾空白、转小写
 *   - 合并连续空白
 *   - 截取前 200 字
 *   - 移除 emoji
 */
export declare function commentFingerprint(comment: string | null | undefined): string;
/** 检测 1：短时间高频 */
export declare function detectHighFrequency(recentByUser: EvaluationSnapshot[], now: number): DetectionResult & {
    count: number;
};
/** 检测 2：同一 host 集中好评 */
export declare function detectHostConcentration(recentByHost: EvaluationSnapshot[], rating: number, now: number): DetectionResult & {
    count: number;
};
/** 检测 3：重复模板（同一指纹） */
export declare function detectDuplicateComment(recentByUser: EvaluationSnapshot[], comment: string, now: number): DetectionResult & {
    fingerprint: string;
    count: number;
};
/** 检测 4：评论长度异常 */
export declare function detectCommentLength(comment: string): DetectionResult & {
    length: number;
};
/** 检测 5：用户历史全 5 星比例异常 */
export declare function detectFiveStarRatio(allByUser: EvaluationSnapshot[]): DetectionResult & {
    ratio: number;
    samples: number;
};
/** level → action 映射 */
export declare function levelToAction(level: RiskLevel): RiskAction;
/**
 * 主入口：评价刷量检测
 */
export declare function detectReviewSpam(ctx: DetectReviewSpamInput): Promise<RiskReport>;
/**
 * 退款风控配置
 */
export declare const REFUND_CONFIG: {
    REFUND_HIGH_FREQ_WINDOW_MS: number;
    REFUND_HIGH_FREQ_THRESHOLD: number;
    REFUND_HIGH_FREQ_HIGH: number;
    REFUND_RATE_WINDOW_MS: number;
    REFUND_RATE_THRESHOLD: number;
    REFUND_RATE_HIGH: number;
    REFUND_RATE_MIN_SAMPLES: number;
    FULL_REFUND_THRESHOLD: number;
    FULL_REFUND_HIGH: number;
    SAME_AMOUNT_WINDOW_MS: number;
    SAME_AMOUNT_THRESHOLD: number;
    SAME_AMOUNT_HIGH: number;
    POST_REFUND_INACTIVE_DAYS: number;
};
/** 检测 1：短时间高频退款 */
export declare function detectRefundHighFrequency(userRefunds: RefundSnapshot[], now: number): DetectionResult & {
    count: number;
};
/** 检测 2：退款率过高 */
export declare function detectRefundRate(userRefunds: RefundSnapshot[], completedOrderCount: number, now: number): DetectionResult & {
    rate: number;
    samples: number;
    refunds: number;
};
/** 检测 3：单笔退款接近全额 */
export declare function detectFullRefund(current: RefundSnapshot): DetectionResult & {
    ratio: number;
};
/** 检测 4：短时间内多次相同金额退款（拆单嫌疑） */
export declare function detectSameAmountPattern(userRefunds: RefundSnapshot[], currentAmount: number, now: number): DetectionResult & {
    count: number;
    amount: number;
};
/**
 * 主入口：退款滥用检测
 */
export declare function detectRefundAbuse(ctx: DetectRefundAbuseInput): Promise<RiskReport>;
/**
 * 大额下单风控配置
 *   - 金额单位：分（与支付字段一致）
 *   - 阈值可按业务调整
 */
export declare const ORDER_RISK_CONFIG: {
    /** 单笔大额阈值（≥ 触发 review） */
    LARGE_AMOUNT_FEN: number;
    /** 单笔超大额阈值（≥ 触发 reject） */
    HUGE_AMOUNT_FEN: number;
    /** 用户单日累计阈值（超过触发 review） */
    DAILY_AMOUNT_FEN: number;
    /** 用户短期窗口（30 分钟）内累计订单数（超过触发 review） */
    SHORT_WINDOW_ORDERS: number;
    SHORT_WINDOW_MS: number;
    /** 新用户首单大额阈值（注册 < 7 天的用户首单允许上限） */
    NEW_USER_LARGE_FEN: number;
    NEW_USER_WINDOW_MS: number;
};
/** 检测：大额下单 */
export declare function detectLargeAmount(amountFen: number): DetectionResult & {
    amount: number;
};
/** 检测：新用户首单大额 */
export declare function detectNewUserLargeAmount(userCreatedAt: number, amountFen: number, now: number): DetectionResult & {
    userAgeMs: number;
};
/** detectMallOrderRisk / detectActivityApplyRisk 公共输入 */
export interface DetectOrderRiskInput {
    db: CloudBaseDB;
    userId: string;
    amountFen: number;
    /** 'mall_order' | 'activity_apply' | 'order' */
    type: 'mall_order' | 'activity_apply' | 'order' | string;
    /** 目标 ID（productId / activityId / hostId） */
    targetId?: string;
    now?: number;
}
/**
 * 主入口：商城/活动/寄养 大额下单风控
 * - 大额 → review
 * - 超大额 → reject
 * - 短期高频 → review
 * - 新用户首单大额 → review
 *
 * @throws 不抛错（best-effort）。失败时返回 level=low / action=allow
 */
export declare function detectOrderRisk(ctx: DetectOrderRiskInput): Promise<RiskReport>;
/** 商城下单专用 */
export declare function detectMallOrderRisk(ctx: Omit<DetectOrderRiskInput, 'type'>): Promise<RiskReport>;
/** 活动报名专用 */
export declare function detectActivityApplyRisk(ctx: Omit<DetectOrderRiskInput, 'type'>): Promise<RiskReport>;
/**
 * action → 业务错误码 映射
 *   - 'allow'  → RISK_PASS
 *   - 'review' → RISK_PENDING
 *   - 'reject' → RISK_REJECT
 */
export declare function mapActionToErrorCode(action: RiskAction | string | null | undefined): 'RISK_REJECT' | 'RISK_PENDING' | 'RISK_PASS';
/**
 * 业务层辅助：根据风控报告抛出对应错误或返回标记
 *   - 'reject' → 抛 RISK_REJECT
 *   - 'review' → 抛 RISK_PENDING
 *   - 'allow'  → 返回 { passed: true, code: 'RISK_PASS', reasons }
 *
 * @throws {BusinessError} action=reject 时抛 RISK_REJECT；action=review 时抛 RISK_PENDING
 */
export declare function assertRiskDecision(risk: RiskReport): RiskPassResult;
