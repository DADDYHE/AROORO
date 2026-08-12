/**
 * GSAP 奢品级动效 composable
 * 提供页面入场、数字计数、卡片交错、悬浮抬升等动效
 */
import { onMounted, onUnmounted, ref, nextTick } from 'vue'
import { gsap } from 'gsap'

/**
 * 页面入场动画 — 淡入 + 上浮
 * @param {Ref} targetRef - 目标容器 ref
 * @param {Object} opts - { delay, y, duration }
 */
export function usePageEnter(targetRef, opts = {}) {
  const { delay = 0, y = 24, duration = 0.7 } = opts
  let tween = null

  onMounted(async () => {
    await nextTick()
    if (!targetRef.value) return
    tween = gsap.from(targetRef.value, {
      opacity: 0,
      y,
      duration,
      delay,
      ease: 'power3.out',
    })
  })

  onUnmounted(() => {
    tween?.kill()
  })
}

/**
 * 数字计数动画 — 从 0 滚动到目标值
 * @param {Ref<Number>} displayRef - 显示用的 ref
 * @param {Function} getValue - 返回目标值的函数
 * @param {Object} opts - { duration, delay, prefix, suffix, decimals }
 */
export function useStatCounter(displayRef, getValue, opts = {}) {
  const { duration = 1.4, delay = 0.2, prefix = '', suffix = '', decimals = 0 } = opts
  let tween = null
  const obj = { val: 0 }

  function animate() {
    const target = getValue()
    if (typeof target !== 'number' || isNaN(target)) {
      displayRef.value = prefix + (0).toFixed(decimals) + suffix
      return
    }
    tween?.kill()
    obj.val = 0
    tween = gsap.to(obj, {
      val: target,
      duration,
      delay,
      ease: 'power2.out',
      onUpdate: () => {
        displayRef.value = prefix + obj.val.toFixed(decimals) + suffix
      },
    })
  }

  onUnmounted(() => {
    tween?.kill()
  })

  return { animate }
}

/**
 * 卡片交错入场 — 用于统计卡片、列表项等
 * @param {Ref} containerRef - 容器 ref
 * @param {String} selector - 子元素选择器 (默认 '.stagger-item')
 * @param {Object} opts - { delay, stagger, y, duration }
 */
export function useStaggerCards(containerRef, selector = '.stagger-item', opts = {}) {
  const { delay = 0.15, stagger = 0.08, y = 30, duration = 0.6 } = opts
  let tween = null

  onMounted(async () => {
    await nextTick()
    if (!containerRef.value) return
    const items = containerRef.value.querySelectorAll(selector)
    if (!items.length) return
    tween = gsap.from(items, {
      opacity: 0,
      y,
      duration,
      delay,
      stagger,
      ease: 'power3.out',
    })
  })

  onUnmounted(() => {
    tween?.kill()
  })
}

/**
 * 悬浮抬升效果 — 给元素绑定 hover 动画
 * @param {Ref} targetRef - 目标元素 ref
 * @param {Object} opts - { lift, shadow }
 */
export function useHoverLift(targetRef, opts = {}) {
  const { lift = -4, scale = 1.0 } = opts
  let enterTween = null
  let leaveTween = null

  function onEnter() {
    if (!targetRef.value) return
    leaveTween?.kill()
    enterTween = gsap.to(targetRef.value, {
      y: lift,
      scale,
      duration: 0.35,
      ease: 'power2.out',
    })
  }

  function onLeave() {
    if (!targetRef.value) return
    enterTween?.kill()
    leaveTween = gsap.to(targetRef.value, {
      y: 0,
      scale: 1,
      duration: 0.35,
      ease: 'power2.out',
    })
  }

  onMounted(async () => {
    await nextTick()
    if (!targetRef.value) return
    targetRef.value.addEventListener('mouseenter', onEnter)
    targetRef.value.addEventListener('mouseleave', onLeave)
  })

  onUnmounted(() => {
    if (targetRef.value) {
      targetRef.value.removeEventListener('mouseenter', onEnter)
      targetRef.value.removeEventListener('mouseleave', onLeave)
    }
    enterTween?.kill()
    leaveTween?.kill()
  })
}

/**
 * 通用 timeline — 用于自定义复杂动画序列
 */
export function useGsapTimeline() {
  const tl = ref(null)

  function create(callback) {
    onMounted(async () => {
      await nextTick()
      tl.value = gsap.timeline()
      callback(tl.value)
    })
  }

  onUnmounted(() => {
    tl.value?.kill()
  })

  return { tl, create }
}

/**
 * 图表容器淡入 — 用于 ECharts 容器
 * @param {Ref} chartRef - 图表容器 ref
 */
export function useChartFadeIn(chartRef, opts = {}) {
  const { delay = 0.3, duration = 0.6 } = opts
  let tween = null

  onMounted(async () => {
    await nextTick()
    if (!chartRef.value) return
    tween = gsap.from(chartRef.value, {
      opacity: 0,
      y: 16,
      duration,
      delay,
      ease: 'power2.out',
    })
  })

  onUnmounted(() => {
    tween?.kill()
  })
}

export { gsap }
