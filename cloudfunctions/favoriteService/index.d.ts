/**
 * favoriteService/index.ts - 收藏服务（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - add - 添加收藏（防重）
 *   - remove - 取消收藏
 *   - list - 拉取收藏列表（分页）
 *
 * 迁移目标：
 *   - 强类型化 3 个 action handler 签名
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 抽离 FavoriteTargetType 联合类型与 COLLECTION 常量
 *
 * 代码审查修复（2026-07-25，docs/favoriteService-code-review.md）：
 *   - H1: 防重改用确定性 _id（md5(openid|targetType|targetId)），并发插入天然冲突，消除 TOCTOU 竞态
 *   - H2: 重复键兜底只匹配真正的 duplicate 错误；限流等基础设施错误必须抛出
 *   - H3: main catch 对非业务错误脱敏，不向客户端回传原始 error.message
 *   - M1/L5: targetId 强制 string + trim + 长度校验（1-128）
 *   - M2: list 响应回显清洗后的 safePage/safePageSize
 *   - M3: add/remove 写操作接入内存滑动窗口限流（openid 维度）
 *   - M6: count 与 get 并行执行
 *   - M5: add 前按 targetType 校验目标集合中是否存在，防止空壳收藏
 *   - L1: openid 日志掩码
 *   - L3: add 返回 data.created 区分"新收藏"与"已收藏"
 *   - 兼容: 前端历史参数 hostProfileId → targetType='host' + targetId
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.favoriteService.json
 */
export interface AuthLike {
    openid?: string;
    nickName?: string;
    adminId?: string;
    partnerId?: string;
    isPartner?: boolean;
    isSuperAdmin?: boolean;
    roles?: string[];
    permissions?: string[];
    _isHttpAuth?: boolean;
    [k: string]: unknown;
}
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
/** 收藏目标类型 */
export type FavoriteTargetType = 'host' | 'deal' | 'product' | 'activity' | 'partner' | 'tuan';
/** 收藏文档 */
export interface FavoriteDoc {
    _id?: string;
    ownerId: string;
    targetType: FavoriteTargetType;
    targetId: string;
    createdAt?: Date;
    [k: string]: unknown;
}
/** 分页结果 */
export interface FavoriteListResult {
    list: FavoriteDoc[];
    total: number;
    page: number;
    pageSize: number;
}
declare const db: any;
export declare const COLLECTION = "favorites";
export declare const DEFAULT_PAGE_SIZE = 20;
export declare const MAX_PAGE_SIZE = 100;
export declare function addFavorite(event: CloudEvent, openid: string, dbInstance: typeof db): Promise<unknown>;
export declare function removeFavorite(event: CloudEvent, openid: string, dbInstance: typeof db): Promise<unknown>;
export declare function getFavorites(event: CloudEvent, openid: string, dbInstance: typeof db): Promise<unknown>;
export declare function main(event: CloudEvent, _context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    addFavorite: typeof addFavorite;
    removeFavorite: typeof removeFavorite;
    getFavorites: typeof getFavorites;
    COLLECTION: string;
    DEFAULT_PAGE_SIZE: number;
    MAX_PAGE_SIZE: number;
};
export default _default;
