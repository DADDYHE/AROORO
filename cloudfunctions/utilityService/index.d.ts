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
/** Banner 列表项（投影）
 * 字段名与数据库 banners 集合、首页 wxml 绑定保持一致，
 * 避免无意义的字段重命名导致前后端错配。
 */
export interface BannerItem {
    id: string;
    imageUrl: string;
    title: string;
    subtitle: string;
    tag: string;
    ctaText: string;
    actionType: string;
    actionTarget: string;
}
/** Banner 列表结果（带缓存） */
export interface BannerListResult {
    list: BannerItem[];
}
/** 寄养家庭公开信息（M5: 与 getHostInfo 实际返回对齐，不含 openid 等隐私数据） */
export interface HostInfoResult {
    hostName: string;
    pricePerDay: number;
    avatarUrl: string;
}
/** 寄养家庭档案（L2: 从模块初始化区移到类型区，保持类型定义集中） */
export interface HostProfileDoc {
    _id: string;
    openid?: string;
    hostName?: string;
    pricePerDay?: number;
    avatarUrl?: string;
    [k: string]: unknown;
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
