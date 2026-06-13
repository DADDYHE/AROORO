/**
 * i18nOverride/index.ts - i18n 覆盖云函数（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - fetchActive - 客户端匿名拉取 active 文案覆盖
 *   - 与 utils/i18n.js 的 applyCustomOverrides / loadFromCdn 衔接
 *
 * 迁移目标：
 *   - 强类型化 2 个 action handler 签名（fetchActive + fetchActiveOverrides）
 *   - 抽离 SUPPORTED_LOCALES 联合类型与 COLLECTION 常量
 *   - I18nOverrides 类型化（key → locale → value）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.i18nOverride.json
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
/** i18n 覆盖文档 */
export interface I18nOverrideDoc {
    _id?: string;
    key: string;
    locale: SupportedLocale;
    value: string;
    status?: 'active' | 'inactive' | 'deleted';
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
    count: number;
    locale: string;
}
export declare const COLLECTION = "i18n_overrides";
export declare const SUPPORTED_LOCALES: readonly SupportedLocale[];
export declare const FETCH_LIMIT = 200;
/**
 * 客户端匿名拉取 active 文案覆盖。
 *
 * 入参：{ action: 'fetchActive', locale?: 'en-US' }
 * 返回：{ code, message, data: { overrides, count, locale } }
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
