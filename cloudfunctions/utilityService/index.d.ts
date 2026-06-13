/**
 * utilityService/index.ts - 通用工具服务（TypeScript 源文件 - Sprint 46 迁移）
 *
 * 业务功能：
 *   - getBanners - 拉取首页 banner 列表（带内存缓存，TTL 5 分钟）
 *   - getHostInfo - 拉取寄养家庭简要信息
 *
 * 迁移目标：
 *   - 强类型化 2 个 action handler 签名
 *   - 抽离 BannerItem / HostInfo 接口
 *   - 内联 createLogger（与原代码保持一致，避免 ../common/logger 部署问题）
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.utilityService.json
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
/** Banner 文档（原始） */
export interface BannerDoc {
    _id: string;
    imageUrl?: string;
    title?: string;
    subtitle?: string;
    tag?: string;
    ctaText?: string;
    actionType?: string;
    actionTarget?: string;
    status?: 'active' | 'inactive';
    sortOrder?: number;
    [k: string]: unknown;
}
/** Banner 列表项（投影） */
export interface BannerItem {
    id: string;
    image: string;
    title: string;
    subtitle: string;
    tag: string;
    ctaText: string;
    action: string;
    actionTarget: string;
}
/** Banner 列表结果（带缓存） */
export interface BannerListResult {
    list: BannerItem[];
}
/** 寄养家庭信息 */
export interface HostInfoResult {
    openid: string;
    hostName: string;
    pricePerDay: number;
}
export declare const BANNERS_CACHE_TTL = 300000;
export declare const BANNER_FETCH_LIMIT = 10;
export declare function getBanners(): Promise<BannerListResult>;
/** 清除 banner 缓存（供测试 / 数据更新时调用） */
export declare function clearBannersCache(): void;
export declare function getHostInfo(event: CloudEvent): Promise<unknown>;
export declare function main(event: CloudEvent): Promise<unknown>;
declare const _default: {
    main: typeof main;
    getBanners: typeof getBanners;
    getHostInfo: typeof getHostInfo;
    clearBannersCache: typeof clearBannersCache;
    BANNERS_CACHE_TTL: number;
    BANNER_FETCH_LIMIT: number;
};
export default _default;
