/**
 * i18nOverride/index.ts - i18n 覆盖云函数（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - fetchActive - 客户端匿名拉取 active 文案覆盖
 *   - 与 utils/i18n.js 的 applyCustomOverrides / loadFromCdn 衔接
 *
 * 迁移目标：
 *   - 强类型化 action handler 签名（fetchActive）
 *   - 抽离 SUPPORTED_LOCALES 联合类型与 COLLECTION 常量
 *   - I18nOverrides 类型化（key → locale → value）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.i18nOverride.json
 *
 * 数据库索引建议（运维需在 i18n_overrides 集合上创建）：
 *   1. { key: 1, locale: 1 }                  - 唯一索引，保证 upsert 幂等
 *   2. { status: 1, locale: 1, updatedAt: -1 } - 覆盖 fetchActive 与 listI18nOverrides 查询
 */
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    body?: string | Record<string, unknown>;
    Time?: string;
    Timestamp?: number;
    TriggerName?: string;
    Message?: string;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
/** 支持的语言 */
export type SupportedLocale = 'zh-CN' | 'en-US' | 'ja-JP';
/** 覆盖文档状态：active 对外可见，disabled 仅后台保留 */
export type OverrideStatus = 'active' | 'disabled';
/** i18n 覆盖文档 */
export interface I18nOverrideDoc {
    _id?: string;
    key: string;
    locale: SupportedLocale;
    value: string;
    status?: OverrideStatus;
    [k: string]: unknown;
}
/** 覆盖结构（按 key + locale 索引） */
export interface I18nOverrides {
    [key: string]: {
        [locale: string]: string;
    };
}
/** fetchActive 返回 */
export interface FetchActiveResult {
    overrides: I18nOverrides;
    /** 已废弃别名，等价于 keyCount；保留是为了向后兼容 */
    count: number;
    /** 去重后的 key 数量 */
    keyCount: number;
    /** 实际覆盖条目数（每个 key+locale 计 1） */
    entryCount: number;
    locale: string;
}
export declare const COLLECTION = "i18n_overrides";
export declare const SUPPORTED_LOCALES: readonly SupportedLocale[];
export declare const FETCH_LIMIT = 200;
/**
 * 客户端匿名拉取 active 文案覆盖。
 *
 * 入参：{ action: 'fetchActive', locale?: 'zh-CN' | 'en-US' | 'ja-JP' }
 *   - locale 不传：返回所有 locale
 *   - locale 非法：抛 INVALID_PARAMS（避免客户端 bug 被静默掩盖）
 * 返回：{ code, message, data: { overrides, count, keyCount, entryCount, locale } }
 */
export declare function fetchActive(event?: CloudEvent): Promise<unknown>;
export declare function main(event: CloudEvent): Promise<unknown>;
declare const _default: {
    main: typeof main;
    fetchActive: typeof fetchActive;
    COLLECTION: string;
    SUPPORTED_LOCALES: readonly SupportedLocale[];
    FETCH_LIMIT: number;
};
export default _default;
