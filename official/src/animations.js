// 集中管理 GSAP：统一导入、注册插件、兼容「减少动态」无障碍偏好。
// Vite / Vue3 等现代前端打包器开箱即用，无需额外配置。
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// 系统开启「减少动态」时返回 true，调用方应跳过动画。
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export { gsap, ScrollTrigger }
