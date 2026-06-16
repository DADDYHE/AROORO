/**
 * adminService/constants.ts - 订单类型常量（TypeScript 源文件 - Sprint 33 迁移）
 *
 * 业务功能：
 *   - 集中维护订单类型枚举（mall / hosting / feeding / tuan / activity）
 *   - 提供类型安全的中文显示名称映射
 *
 * 迁移目标：
 *   - 用 `as const` 派生 OrderTypeKey 类型，无需手写 union
 *   - 强类型化 ORDER_TYPE_NAMES（key 必须来自 ORDER_TYPES）
 *   - 编译产物（constants.js）继续被 index.js / services/* 消费
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.adminService.json
 *   （运行时仍消费 .js 编译产物）
 */
export declare const ORDER_TYPES: readonly ["mall", "boarding", "feeding", "tuan", "activity"];
export type OrderTypeKey = typeof ORDER_TYPES[number];
export declare const ORDER_TYPE_NAMES: Record<OrderTypeKey, string>;
declare const _default: {
    ORDER_TYPES: readonly ["mall", "boarding", "feeding", "tuan", "activity"];
    ORDER_TYPE_NAMES: Record<"mall" | "boarding" | "feeding" | "tuan" | "activity", string>;
};
export default _default;
