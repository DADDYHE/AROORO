/**
 * 日期范围工具（TypeScript 源文件 - Sprint 17 迁移）
 *
 * 替代散落在 orderService/orders.js#_getDateRange 与 orderService/stats.js#rangeMap 的两套实现
 *
 * 支持的 range：
 *   - 'today'     当天 00:00 ~ 次日 00:00
 *   - 'yesterday' 昨天 00:00 ~ 当天 00:00
 *   - 'week'      本周一 00:00 ~ 下周一 00:00
 *   - 'month'     本月 1 日 00:00 ~ 下月 1 日 00:00
 *   - 'last7'     过去 7 天（不包含今天）
 *   - 'last30'    过去 30 天（不包含今天）
 *   - 'quarter'   本季度
 *   - 'year'      本年
 *   - 'all'       不限（返回 null）
 *
 * 时区：使用 process.env.TZ 或系统默认（建议云函数环境变量设置为 Asia/Shanghai）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
export type DateRangeType = 'today' | 'yesterday' | 'week' | 'month' | 'last7' | 'last30' | 'quarter' | 'year' | 'all';
export interface DateRange {
    start: Date;
    end: Date;
}
export interface RangeQueryDescriptor {
    _field: string;
    _gte: Date;
    _lt: Date;
    range: DateRangeType;
}
export declare const RANGE_TYPES: ReadonlyArray<DateRangeType>;
/**
 * 获取日期 00:00:00
 */
export declare function startOfDay(d: Date): Date;
/**
 * 获取日期 23:59:59.999
 */
export declare function endOfDay(d: Date): Date;
/**
 * 计算给定日期所在周的周一 00:00
 * 中国习惯：周一为一周第一天
 */
export declare function startOfWeek(d: Date): Date;
/**
 * 计算月份第一天 00:00
 */
export declare function startOfMonth(d: Date): Date;
/**
 * 计算季度第一天 00:00
 */
export declare function startOfQuarter(d: Date): Date;
/**
 * 计算年份第一天 00:00
 */
export declare function startOfYear(d: Date): Date;
/**
 * 主入口：返回日期范围 [start, end)
 *
 * @param range - 日期范围类型（'all' 返回 null）
 * @param now - 基准时间（默认当前）
 * @returns 日期范围或 null（不限）
 */
export declare function getDateRange(range: DateRangeType | string, now?: Date): DateRange | null;
/**
 * 构造 CloudBase 数据库查询条件
 *
 * @param field - 字段名
 * @param range - 日期范围类型
 * @param now - 基准时间
 * @returns db 查询描述符或 null
 */
export declare function buildRangeQuery(field: string, range: DateRangeType | string, now?: Date): RangeQueryDescriptor | null;
/**
 * 计算两个日期间相差天数（向 0 取整）
 */
export declare function diffDays(a: Date | string, b: Date | string): number;
/**
 * 格式化日期为 YYYY-MM-DD
 */
export declare function formatDate(d: Date): string;
/**
 * 生成过去 N 天的日期数组（用于柱状图）
 *
 * @param days - 天数（正整数）
 * @param end - 截止日期（默认当前）
 * @returns YYYY-MM-DD 列表（按时间正序）
 */
export declare function lastNDates(days: number, end?: Date): string[];
declare const _default: {
    RANGE_TYPES: readonly DateRangeType[];
    startOfDay: typeof startOfDay;
    endOfDay: typeof endOfDay;
    startOfWeek: typeof startOfWeek;
    startOfMonth: typeof startOfMonth;
    startOfQuarter: typeof startOfQuarter;
    startOfYear: typeof startOfYear;
    getDateRange: typeof getDateRange;
    buildRangeQuery: typeof buildRangeQuery;
    diffDays: typeof diffDays;
    formatDate: typeof formatDate;
    lastNDates: typeof lastNDates;
};
export default _default;
