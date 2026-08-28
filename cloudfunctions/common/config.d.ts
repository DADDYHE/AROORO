declare const ENV_ID: string;
declare const APP_ID: string;
declare const JWT_SECRET: string;
declare const IS_PRODUCTION: boolean;
export interface WeChatPayConfig {
    appId: string;
    mchId: string;
    serialNo: string;
    platformSerialNo: string;
    privateKey: string;
    notifyUrl: string;
    certificate: string;
    apiV3Key: string;
}
declare const WECHAT_PAY: WeChatPayConfig;
export interface EndpointsConfig {
    WECHAT_PAY_API_BASE: string;
    WECHAT_PAY_JSAPI: string;
    WECHAT_PAY_REFUND: string;
    WECHAT_PAY_UNIFIEDORDER: string;
    COS_BASE: string;
    CDN_BASE: string;
}
declare const ENDPOINTS: EndpointsConfig;
export interface CloudBaseConfig {
    env: string;
    appid: string;
    secret: string;
    baseUrl: string;
    apiKey: string;
}
declare const CLOUDBASE: CloudBaseConfig;
export { ENV_ID, APP_ID, WECHAT_MINIAPP_SECRET, JWT_SECRET, IS_PRODUCTION, WECHAT_PAY, ENDPOINTS, CLOUDBASE };
declare const _exports: {
    ENV_ID: string;
    APP_ID: string;
    WECHAT_MINIAPP_SECRET: string;
    JWT_SECRET: string;
    IS_PRODUCTION: boolean;
    WECHAT_PAY: WeChatPayConfig;
    ENDPOINTS: EndpointsConfig;
    CLOUDBASE: CloudBaseConfig;
};
export default _exports;
