<template>
  <div class="site" ref="root">
    <!-- 顶部导航 -->
    <header class="nav">
      <div class="container nav-inner">
        <a class="brand" href="#top">
          <span class="brand-mark">AROORO</span>
          <span class="brand-sub">AROORO</span>
        </a>
        <nav class="nav-links">
          <a href="#services">服务</a>
          <a href="#activities">活动</a>
          <a href="#about">关于</a>
          <a class="nav-cta" href="#mini">小程序</a>
        </nav>
      </div>
    </header>

    <!-- Hero -->
    <section id="top" class="hero">
      <div class="container hero-inner">
        <span class="eyebrow">宠物社交 · 活动 · 寄养 · 电商</span>
        <h1 class="hero-title">让每一次分别，<br />都有温柔的归属</h1>
        <p class="hero-desc">
          AROORO 是一个为宠物与主人建立的温暖社区。寄养托付、同好社交、城市活动、好物商城——
          官网了解，小程序即刻办理。
        </p>
        <div class="hero-actions">
          <a class="btn-primary" href="#mini">打开小程序</a>
          <a class="btn-ghost" href="#services">了解服务</a>
        </div>
      </div>
    </section>

    <!-- 核心服务 -->
    <section id="services" class="section">
      <div class="container">
        <span class="eyebrow">我们的服务</span>
        <h2 class="section-title">三种方式，把爱安放</h2>
        <p class="section-sub">从短期的安心托付，到长期的同好陪伴，AROORO 覆盖你与毛孩子的每个场景。</p>
        <div class="cards">
          <article class="card">
            <div class="card-icon">🏡</div>
            <h3>宠物寄养</h3>
            <p>严选家庭寄养与专业机构，按需匹配。透明评价、实时动态，出门也安心。</p>
          </article>
          <article class="card">
            <div class="card-icon">🐾</div>
            <h3>同好社交</h3>
            <p>按品种、兴趣、附近认识玩伴。遛狗搭子、寄养拼团，养宠不再孤单。</p>
          </article>
          <article class="card">
            <div class="card-icon">🎉</div>
            <h3>城市活动</h3>
            <p>下午茶、户外聚会、领养日……线上线下联动，和同城的毛孩子一起出发。</p>
          </article>
        </div>
      </div>
    </section>

    <!-- 活动预览（Phase 2：接云函数只读 API 拉 activities 集合） -->
    <section id="activities" class="section section-alt">
      <div class="container">
        <span class="eyebrow">近期活动</span>
        <h2 class="section-title">一起来现场</h2>
        <p class="section-sub">以下为示例数据，正式版将实时读取小程序同源活动。当前环境：CloudBase 上海。</p>
        <div class="activity-grid">
          <article v-for="a in activities" :key="a.id" class="activity">
            <div class="activity-tag">{{ a.tag }}</div>
            <h4>{{ a.title }}</h4>
            <p class="activity-meta">📍 {{ a.location }} · 🕒 {{ a.time }}</p>
            <p class="activity-desc">{{ a.desc }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- 关于 -->
    <section id="about" class="section">
      <div class="container about">
        <div class="about-text">
          <span class="eyebrow">关于 AROORO</span>
          <h2 class="section-title">把托付与陪伴，做成一件温热的事</h2>
          <p class="section-sub">
            我们相信，宠物不是被照看的物品，而是家庭的一员。AROORO 用一套可信任的匹配与陪伴机制，
            让主人与寄养家庭、与同好之间建立真实连接。
          </p>
        </div>
        <ul class="about-points">
          <li>✔ 实名认证的主人与寄养家庭</li>
          <li>✔ 活动全过程位置可核验</li>
          <li>✔ 同城同好，线下可见面</li>
        </ul>
      </div>
    </section>

    <!-- 小程序联动入口 -->
    <section id="mini" class="section section-mini">
      <div class="container mini-inner">
        <div class="mini-copy">
          <span class="eyebrow">官网看 · 小程序办</span>
          <h2 class="section-title">扫码进入 AROORO 小程序</h2>
          <p class="section-sub">
            寄养下单、活动报名、同好匹配、商城好物，都在小程序里完成。微信搜索「AROORO」或扫码即可。
          </p>
          <p class="mini-tip">（此处放置小程序码，正式上线前由 DADDY 提供图片替换）</p>
        </div>
        <div class="mini-qr" aria-label="小程序码占位">
          <span>小程序码</span>
        </div>
      </div>
    </section>

    <!-- 页脚 -->
    <footer class="footer">
      <div class="container footer-inner">
        <div class="brand">
          <span class="brand-mark">AROORO</span>
          <span class="brand-sub">AROORO</span>
        </div>
        <p class="footer-note">© 2026 AROORO · 宠物社交 · 活动 · 寄养 · 电商</p>
        <p class="footer-beian">ICP 备案号：待备案后公示（arooro.icu）</p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { gsap, prefersReducedMotion } from './animations'

// Phase 2：用 @cloudbase/js-sdk 匿名登录后调用云函数只读 API
// 拉取 activities / 寄养家庭 / 商城，替换下方占位数据。
const activities = [
  { id: 1, tag: '下午茶', title: '毛孩子下午茶聚会', location: '成都 · 万安街道', time: '08/08 11:26', desc: '带娃来喝个下午茶，认识同城养宠同好。' },
  { id: 2, tag: '户外', title: '周末户外撒欢日', location: '成都 · 环球中心', time: '08/08 20:02', desc: '大草坪放飞，专业教练带队，安全又尽兴。' },
  { id: 3, tag: '领养', title: '流浪毛孩领养日', location: '成都 · 主城区', time: '敬请期待', desc: '给无家的小生命一个 AROORO 相伴的归宿。' }
]

const root = ref(null)
let ctx

onMounted(() => {
  // 无障碍：用户开启「减少动态」时完全跳过动画。
  if (prefersReducedMotion()) return

  ctx = gsap.context(() => {
    // Hero 入场
    gsap.from('.hero-title', { y: 28, opacity: 0, duration: 0.8, ease: 'power3.out' })
    gsap.from('.hero-desc', { y: 20, opacity: 0, duration: 0.7, delay: 0.15, ease: 'power2.out' })
    gsap.from('.hero-actions', { y: 20, opacity: 0, duration: 0.7, delay: 0.3, ease: 'power2.out' })

    // 服务卡片滚动进入视口时错落浮现
    gsap.from('.card', {
      y: 24,
      opacity: 0,
      duration: 0.6,
      stagger: 0.12,
      ease: 'power2.out',
      scrollTrigger: { trigger: '.cards', start: 'top 85%' }
    })
  }, root.value)
})

// 组件卸载时自动清理所有动画与 ScrollTrigger，避免内存泄漏。
onUnmounted(() => ctx && ctx.revert())
</script>

<style scoped>
.site {
  background: var(--stone-1);
}

/* 导航 */
.nav {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(247, 245, 239, 0.86);
  backdrop-filter: saturate(140%) blur(10px);
  border-bottom: 1px solid var(--hairline);
}
.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}
.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.brand-mark {
  font-size: 22px;
  font-weight: 700;
  color: var(--green);
  letter-spacing: 0.08em;
}
.brand-sub {
  font-size: 12px;
  letter-spacing: 0.3em;
  color: var(--gold-deep);
}
.nav-links {
  display: flex;
  gap: 28px;
  align-items: center;
}
.nav-links a {
  font-size: 15px;
  color: var(--text-2);
  transition: color 0.2s;
}
.nav-links a:hover {
  color: var(--green);
}
.nav-cta {
  padding: 8px 18px;
  border-radius: var(--radius);
  background: var(--gold);
  color: #fff !important;
}
.nav-cta:hover {
  background: var(--gold-deep);
}

/* Hero */
.hero {
  padding: 110px 0 96px;
  background:
    radial-gradient(120% 90% at 80% -10%, rgba(201, 162, 75, 0.16), transparent 60%),
    linear-gradient(180deg, var(--stone-2), var(--stone-1));
}
.hero-title {
  font-size: clamp(34px, 6vw, 60px);
  line-height: 1.18;
  color: var(--green);
  font-weight: 700;
  letter-spacing: 0.01em;
}
.hero-desc {
  margin-top: 22px;
  max-width: 540px;
  font-size: 18px;
  color: var(--text-2);
}
.hero-actions {
  margin-top: 34px;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

/* 服务卡片 */
.cards {
  margin-top: 48px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px;
}
.card {
  background: var(--card);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  padding: 34px 28px;
  box-shadow: var(--shadow-card);
  transition: transform 0.28s cubic-bezier(0.19, 1, 0.22, 1), box-shadow 0.28s;
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-soft);
}
.card-icon {
  font-size: 34px;
  margin-bottom: 16px;
}
.card h3 {
  font-size: 20px;
  color: var(--green);
  margin-bottom: 10px;
}
.card p {
  color: var(--text-2);
  font-size: 15px;
}

/* 活动 */
.section-alt {
  background: var(--stone-2);
}
.activity-grid {
  margin-top: 44px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px;
}
.activity {
  background: var(--card);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  padding: 26px 24px;
}
.activity-tag {
  display: inline-block;
  font-size: 12px;
  letter-spacing: 0.1em;
  color: var(--gold-deep);
  border: 1px solid rgba(201, 162, 75, 0.4);
  border-radius: 999px;
  padding: 3px 12px;
  margin-bottom: 14px;
}
.activity h4 {
  font-size: 18px;
  color: var(--green);
  margin-bottom: 10px;
}
.activity-meta {
  font-size: 13px;
  color: var(--text-3);
  margin-bottom: 10px;
}
.activity-desc {
  font-size: 14px;
  color: var(--text-2);
}

/* 关于 */
.about {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 40px;
  align-items: center;
}
.about-points {
  list-style: none;
  display: grid;
  gap: 14px;
}
.about-points li {
  color: var(--text-2);
  font-size: 16px;
}

/* 小程序入口 */
.section-mini {
  background: var(--green);
  color: var(--stone-1);
}
.mini-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40px;
  flex-wrap: wrap;
}
.section-mini .eyebrow {
  color: var(--gold);
}
.section-mini .section-title {
  color: var(--stone-1);
}
.section-mini .section-sub {
  color: rgba(247, 245, 239, 0.78);
}
.mini-tip {
  margin-top: 16px;
  font-size: 13px;
  color: rgba(247, 245, 239, 0.55);
}
.mini-qr {
  width: 180px;
  height: 180px;
  border-radius: var(--radius);
  background: var(--stone-1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  font-size: 14px;
  letter-spacing: 0.1em;
}

/* 页脚 */
.footer {
  background: var(--stone-2);
  border-top: 1px solid var(--hairline);
  padding: 40px 0;
}
.footer-inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.footer-note {
  font-size: 14px;
  color: var(--text-2);
}
.footer-beian {
  font-size: 13px;
  color: var(--text-3);
}

@media (max-width: 860px) {
  .cards,
  .activity-grid {
    grid-template-columns: 1fr;
  }
  .about {
    grid-template-columns: 1fr;
  }
  .nav-links {
    gap: 16px;
  }
}
</style>
