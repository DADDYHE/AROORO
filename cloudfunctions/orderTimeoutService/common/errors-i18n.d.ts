/**
 * cloudfunctions/common/errors-i18n.ts - 云端错误码多语言字典
 *
 * 迁移记录（Sprint 48 cleanup）：
 *   - 原始版本为 errors-i18n.js（CommonJS，未迁移）
 *   - Sprint 47 的 tsconfig.common.json 已加入本文件 include，但 .ts 源文件未补齐
 *   - Sprint 48 cleanup: 创建本 .ts 源文件，删除 .js（由 tsc 重新生成）
 *
 * 业务定位：
 *   - 与 miniapp 端 utils/i18n.js 的 ERROR_I18N 完全对齐（cloud ⊇ miniapp）
 *   - 用途：cloud functions 通过 resolveI18nMessage 转换错误码为本地化文案
 *   - 配合 scripts/build-i18n.js 生成 CDN 字典
 *
 * 编译方式：
 *   node scripts/build-common.js
 *   （依赖 tsconfig.common.json 的 include 配置）
 */
export type LocaleCode = 'zh-CN' | 'en-US' | 'ja-JP';
export type I18nEntry = Readonly<Record<LocaleCode, string>>;
export type I18nDictionary = Readonly<Record<string, I18nEntry>>;
export type ErrorCodeGroup = 'AUTH' | 'RISK' | 'ORDER' | 'PAYMENT' | 'RESOURCE' | 'DATA' | 'SYSTEM' | 'COUPON' | 'ACTIVITY' | 'CATEGORY' | 'RESULT';
export declare const DEFAULT_I18N: I18nDictionary;
export declare const ERROR_CODE_GROUPS: Readonly<Record<ErrorCodeGroup, readonly string[]>>;
export declare const SUPPORTED_LOCALES: readonly LocaleCode[];
export declare const DEFAULT_LOCALE: LocaleCode;
/**
 * 解析指定 code 的 i18n 文案（cloud functions 内部使用）
 * - code 为空 / 非字符串：返回空串
 * - locale 不在 SUPPORTED_LOCALES：回退到 DEFAULT_LOCALE
 * - code 不在 DEFAULT_I18N：返回 code 本身（让上游识别为未知码）
 */
export declare function resolveI18nMessage(code: string | null | undefined, locale: string | null | undefined): string;
/**
 * 导出指定 locale 的扁平字典（{ CODE: '...' }），供 build-i18n.js 生成 CDN JSON
 */
export declare function exportLocaleDictionary(locale: string | null | undefined): Readonly<Record<string, string>>;
declare const _default: {
    DEFAULT_I18N: Readonly<Record<string, Readonly<Record<LocaleCode, string>>>>;
    ERROR_CODE_GROUPS: Readonly<Record<ErrorCodeGroup, readonly string[]>>;
    SUPPORTED_LOCALES: readonly LocaleCode[];
    DEFAULT_LOCALE: "zh-CN";
    resolveI18nMessage: typeof resolveI18nMessage;
    exportLocaleDictionary: typeof exportLocaleDictionary;
};
export default _default;
