/**
 * 法定节假日工具（TypeScript 源文件 - Sprint 14 迁移）
 *
 * 目标：
 *   - 替代 subpackages/booking/confirm.js 中硬编码的 HOLIDAYS_2025 / HOLIDAYS_2026
 *   - 提供假期判定、调价倍率、工作日计算等能力
 *
 * 数据源：
 *   - 内置 2025 / 2026 / 2027 三年国家法定节假日
 *   - v2.0 计划：迁至 CloudBase 集合 `system_config/holidays_YYYY` 由后台维护
 *
 * 注意：
 *   - 国务院每年 11 月左右发布下一年节假日，本模块需每年更新
 *   - 调休上班日（如周末上班）应使用 `WORKDAYS` 显式声明
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
declare const HOLIDAYS_2025: HolidayEntryMap;
declare const HOLIDAYS_2026: HolidayEntryMap;
declare const HOLIDAYS_2027: HolidayEntryMap;
declare const WORKDAYS: HolidayEntryMap;
declare const HOLIDAY_TABLE: Record<number, HolidayEntryMap>;
export interface HolidayEntry {
    name: string;
    type: 'holiday' | 'workday';
}
export type HolidayEntryMap = Record<string, HolidayEntry>;
export interface PriceMultiplierOptions {
    weekendMultiplier?: number;
    holidayMultiplier?: number;
    regularMultiplier?: number;
}
/**
 * 格式化日期为 YYYY-MM-DD
 */
export declare function toKey(d: Date): string;
/**
 * 判定指定日期是否为法定节假日
 */
export declare function isHoliday(d: Date | string): boolean;
/**
 * 判定指定日期是否为调休工作日
 */
export declare function isWorkday(d: Date | string): boolean;
/**
 * 判定是否为工作日（周一~周五 + 调休工作日）
 */
export declare function isBusinessDay(d: Date | string): boolean;
/**
 * 获取指定日期的假期元数据
 */
export declare function getHolidayInfo(d: Date | string): HolidayEntry | null;
/**
 * 计算给定日期范围内的「工作日」数（不包含起始，含结束）
 * 用于价格计算（按工作日 vs 自然日）
 */
export declare function countBusinessDays(start: Date | string, end: Date | string): number;
/**
 * 计算调价倍率（节假日加价）
 */
export declare function getDayPriceMultiplier(d: Date | string, opts?: PriceMultiplierOptions): number;
/**
 * 加载指定年份的节假日（用于运行时扩展）
 */
export declare function registerHolidays(year: number, holidays: HolidayEntryMap): void;
export { HOLIDAYS_2025, HOLIDAYS_2026, HOLIDAYS_2027, WORKDAYS, HOLIDAY_TABLE };
