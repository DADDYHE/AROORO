/**
 * errors-i18n.ts - 业务错误码国际化字典（Sprint 15）
 *
 * 目标：
 *   - 把 errors.ts 注册表中的 code 翻译为多语言文案
 *   - 前端按 (code, locale) 拉字典，避免在业务代码中硬编码文案
 *   - 与 toResponse() 协同：error.type → 前端 → i18n(message)
 *
 * 设计原则：
 *   - 静态字典：code → { zh-CN, en-US }
 *   - 不与 errors.ts 重复：i18n 字典独立维护，错误码注册表只含中文默认
 *   - 缺翻译时降级为中文（不抛错）
 *   - 支持覆盖：可传入自定义字典覆盖默认值
 *
 * 用法（推荐）：
 *   const { resolveI18nMessage } = require('./common/errors-i18n')
 *   const i18nMessage = resolveI18nMessage('RISK_PENDING', 'en-US')
 *   // → 'Request received, pending manual review'
 *
 * 配套前端：
 *   miniprogram/utils/i18n.ts → 按 locale 拉对应字典
 */
import type { BusinessErrorCode } from './types';
/** 支持的语言 */
export type Locale = 'zh-CN' | 'en-US' | 'ja-JP';
/** 翻译字典：code → 各语言文案 */
export type I18nDictionary = Record<BusinessErrorCode, Record<Locale, string>>;
/** 错误码分组（便于按功能浏览） */
export type ErrorGroup = 'validation' | 'auth' | 'not_found' | 'permission' | 'order' | 'payment' | 'refund' | 'risk' | 'system' | 'other';
/**
 * 默认字典（覆盖核心错误码）
 * 任何未在此列出的 code 都会 fallback 到 errors.ts 的中文 message
 */
export declare const DEFAULT_I18N: I18nDictionary;
/** 错误码 → 业务分组（用于运营后台按组过滤） */
export declare const ERROR_CODE_GROUPS: Record<BusinessErrorCode, ErrorGroup>;
/**
 * 按 code + locale 解析本地化文案
 * 优先级：
 *   1. customOverrides[code]?.[locale]（最高）
 *   2. DEFAULT_I18N[code]?.[locale]
 *   3. 降级为 zh-CN（中文默认）
 *   4. 再次降级为 code 字面量
 */
export declare function resolveI18nMessage(code: BusinessErrorCode, locale?: Locale, customOverrides?: Partial<Record<BusinessErrorCode, Partial<Record<Locale, string>>>>): string;
/**
 * 批量获取某个 locale 下的全部翻译（用于前端构建期注入）
 */
export declare function exportLocaleDictionary(locale: Locale, customOverrides?: Partial<Record<BusinessErrorCode, Partial<Record<Locale, string>>>>): Record<string, string>;
/**
 * 按 group 过滤错误码（用于按功能浏览）
 */
export declare function getCodesByGroup(group: ErrorGroup): BusinessErrorCode[];
