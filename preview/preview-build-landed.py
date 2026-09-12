#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 preview/home-landed.html —— 用真实 wxml 结构 + 真实 index.wxss 还原首页落地效果。

做法（确定性，不走「整份 app.wxss 转换」那条脆路）：
  1. 只取 pages/home/index.wxss，rpx → px（×0.5，即 375pt 屏）
  2. 扫出它引用的所有 var(--x)，从令牌文件按 @import 顺序解析最终真值，
     内联为 .phone 上的自定义属性块（不依赖任何外部样式表）
  3. page 的纸面底取自 app.wxss，落到 .phone 上
用法：python3 preview-build-landed.py
"""
import io, os, re

ROOT = '/Users/yy/Documents/trae_projects/zuoyou'
OUT = os.path.join(ROOT, 'preview/home-landed.html')

TOKEN_FILES = [
    'styles/variables.wxss',
    'styles/design-tokens.wxss',
    'styles/theme-teal.wxss',
    'app.wxss',
]

PAGE_WXSS = 'pages/home/index.wxss'


def read(p):
    return io.open(os.path.join(ROOT, p), encoding='utf-8').read()


def to_px(css):
    """rpx → px（×0.5）"""
    return re.sub(r'([\d.]+)rpx', lambda m: ('%g' % (float(m.group(1)) / 2)) + 'px', css)


# ---------- 令牌真值索引（后声明者胜出） ----------
TOKENS = {}
for f in TOKEN_FILES:
    for m in re.finditer(r'(--[\w-]+)\s*:\s*([^;{}]+);', read(f)):
        v = ' '.join(m.group(2).split())
        # data URI 里含 ';'（data:image/png;base64,...），上面的正则必然截断 →
        # 留下未闭合的 url("data:image/png; 会直接废掉整份样式表。这类纹理令牌静态还原不需要，跳过。
        if 'data:' in v or 'url(' in v:
            continue
        TOKENS[m.group(1)] = v

page_css = to_px(read(PAGE_WXSS))

# ---------- 首页引用的令牌（含令牌值里二次引用的 var） ----------
need, queue = set(), set(re.findall(r'var\(\s*(--[\w-]+)', page_css))
while queue:
    t = queue.pop()
    if t in need:
        continue
    need.add(t)
    v = TOKENS.get(t, '')
    for nxt in re.findall(r'var\(\s*(--[\w-]+)', v):
        queue.add(nxt)

missing = sorted(t for t in need if t not in TOKENS)
# 令牌值里的 rpx 也要换算（--page-padding: 48rpx → 24px），否则 var() 引到无效长度
tok_css = to_px('.phone {\n' + '\n'.join(
    '  %s: %s;' % (t, TOKENS[t]) for t in sorted(need) if t in TOKENS) + '\n}')

# page 的纸面底 → .phone（--zy-paper-noise 是 base64 data URI，含 ';' 会截断令牌解析，
# 且静态还原不需要噪点纹理 → 只取 linear-gradient 那一层）
page_bg_css = ''
pm = re.search(r'(?m)^page\s*\{([\s\S]*?)\n\}', read('app.wxss'))
if pm:
    body_decl = pm.group(1)
    fallback = ''
    mb = re.search(r'background-color\s*:\s*([^;]+);', body_decl)
    if mb:
        fallback = mb.group(1).strip()
    # 兜底值本身可能是 var(--zy-paper-fallback) → 直接换成字面量，避免依赖未内联的令牌
    mv = re.match(r'var\(\s*(--[\w-]+)\s*\)$', fallback)
    if mv and mv.group(1) in TOKENS:
        fallback = TOKENS[mv.group(1)]
    grad = 'linear-gradient(180deg, #FBF9F4 0%%, #F7F5EF 8%%, %s 100%%)' % fallback
    page_bg_css = (
        '  background-color: %s;\n'
        '  background-image: %s;\n'
        '  background-repeat: no-repeat;\n'
        '  background-size: 100%% 100%%;\n' % (fallback, grad))

# ---------- 极光绿统一帘幕：切片（镜像 pages/home/index.js 的 _initGemBand 公式） ----------
# 静态还原里 navbar 模拟高度 44px、问候行 96rpx=48px、封面 800rpx=400px（与外壳一致）。
SIN_A, COS_A = 0.258819, 0.965926  # sin165° / cos165°
NAV_H, TOPBAR_H, COVER_H = 84, 48, 400  # navbar 84 = 状态栏 44 + 标题栏 40（真机口径）
BAND_H = NAV_H + TOPBAR_H + COVER_H
LEN = 375 * SIN_A + BAND_H * COS_A
T0 = (NAV_H + TOPBAR_H) * COS_A / LEN  # 封面顶缘在帘幕里的纵深


def _at(s):
    return round((T0 + s / 100 * (1 - T0)) * 1000) / 10  # 封面 s% → 帘幕 %


GEM = ('linear-gradient(165deg,'
       ' #142C18 0%%, #1F3A1F %.1f%%, #2D4F2D %.1f%%, #5A7C63 %.1f%%,'
       ' #1F3A1F %.1f%%, #0F2410 100%%)') % (T0 * 33, T0 * 65, _at(0), _at(55))
GEM_NAV = '%s 0 0 / 100%% %dpx no-repeat' % (GEM, BAND_H)
GEM_TOP = '%s 0 -%dpx / 100%% %dpx no-repeat' % (GEM, NAV_H, BAND_H)
GEM_COVER = ('background-image: %s;\n    background-size: 100%% %dpx;\n'
             '    background-position: 0 -%dpx;\n    background-repeat: no-repeat;\n'
             % (GEM, BAND_H, NAV_H + TOPBAR_H))
# 改前（legacy）：118deg 宝石带只贯穿 导航栏+问候行，封面走自有 165deg → 接缝处色阶错位
LEGACY = ('linear-gradient(118deg, #2D4F2D 0%, #0F2410 16%, #2D4F2D 28%, #1A361F 40%,'
          ' #39553F 48%, #142C18 56%, #0F2410 60%, #2E4C36 64%, #4E6D56 67%, #5A7C63 68.5%,'
          ' #4A6952 70%, #35553E 74%, #16301A 80%, #0F2410 88%, #2D4F2D 100%)')
LEGACY_H = NAV_H + TOPBAR_H
LEGACY_CSS = (
    '  body.legacy .zy-navbar-sim { background: %s 0 0 / 100%% %dpx no-repeat; }\n'
    '  body.legacy .topbar { background: %s 0 -%dpx / 100%% %dpx no-repeat; }\n'
    % (LEGACY, LEGACY_H, LEGACY, NAV_H, LEGACY_H))
BAND_CSS = (
    '  body:not(.legacy) .zy-navbar-sim { background: %s; }\n'
    '  body:not(.legacy) .topbar { background: %s; }\n'
    '  body:not(.legacy) .phone .lux-cover {\n    %s  }\n'
    % (GEM_NAV, GEM_TOP, GEM_COVER))

BODY = r'''
<div class="phone" id="phone">
  <div class="zy-navbar-sim">AROORO</div>

  <div class="topbar topbar-stagger">
    <div class="topbar-left">
      <div class="topbar-avatar topbar-avatar-ph"><span class="topbar-avatar-text">奶</span></div>
      <div class="topbar-greeting">
        <span class="topbar-name">奶糖麻麻</span>
        <span class="topbar-loc">9月12日 星期六</span>
      </div>
    </div>
    <div class="topbar-search"><div class="topbar-search-icon"></div><span class="topbar-search-text">搜索</span></div>
  </div>

  <div class="home-scroll" id="scroller">
    <div class="lux-cover">
      <div class="lux-cover-top">
        <span class="lux-cover-wm">AROORO</span>
        <span class="lux-cover-tg">MAISON DE COMPAGNON</span>
      </div>
      <div class="lux-cover-seal">
        <div class="lux-cover-ring"></div>
        <img class="lux-cover-mark" src="../images/icons/chongtuantuan-logo-cream.svg" alt="AROORO">
      </div>
    </div>

    <div class="lux-carousel">
      <div class="lux-car-swiper sim-swiper">
        <div class="sim-item"><div class="lux-car-card sim-car-1"></div></div>
        <div class="sim-item"><div class="lux-car-card sim-car-2"></div></div>
      </div>
      <div class="lux-car-cap">
        <div class="lux-car-dots">
          <div class="lux-car-dot on"></div><div class="lux-car-dot"></div><div class="lux-car-dot"></div>
        </div>
        <span class="lux-car-num">01 / 03</span>
      </div>
    </div>

    <div class="home-container">
      <div class="home-content-sheet">

        <div class="section my-pets-section">
          <div class="my-pets-header">
            <div class="my-pets-title-wrap">
              <span class="section-title">我的宠物</span>
              <div class="pet-add-btn"><span class="pet-add-icon">+</span><span class="pet-add-text">添加</span></div>
            </div>
            <span class="pet-view-all">查看全部 ›</span>
            <span class="section-en">MY COMPANIONS</span>
            <div class="section-rule"></div>
          </div>
          <div class="pets-scroll"><div class="pets-grid" data-role="petsgrid">
            <div class="pet-card pet-card-female">
              <div class="pet-portrait sim-av-1"></div>
              <div class="pet-info">
                <div class="pet-name-row"><span class="pet-name">奶糖</span><span class="pet-gender-tag pet-gender-female">♀</span></div>
                <span class="pet-breed">金毛 · 3 岁</span>
                <div class="pet-hint"><span class="pet-hint-text">点击查看档案</span><span class="pet-hint-arrow">›</span></div>
              </div>
            </div>
            <div class="pet-card pet-card-male">
              <div class="pet-portrait sim-av-2"></div>
              <div class="pet-info">
                <div class="pet-name-row"><span class="pet-name">布丁</span><span class="pet-gender-tag pet-gender-male">♂</span></div>
                <span class="pet-breed">英国短毛猫 · 2 岁</span>
                <div class="pet-hint"><span class="pet-hint-text">点击查看档案</span><span class="pet-hint-arrow">›</span></div>
              </div>
            </div>
            <div class="pet-card pet-card-female">
              <div class="pet-portrait sim-av-1"></div>
              <div class="pet-info">
                <div class="pet-name-row"><span class="pet-name">年糕</span><span class="pet-gender-tag pet-gender-female">♀</span></div>
                <span class="pet-breed">柯基 · 1 岁</span>
                <div class="pet-hint"><span class="pet-hint-text">点击查看档案</span><span class="pet-hint-arrow">›</span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="section my-activities-section">
          <div class="section-head">
            <span class="section-title">快速签到</span>
            <span class="section-link">查看全部 ›</span>
            <span class="section-en">CHECK IN</span>
            <div class="section-rule"></div>
          </div>
          <div class="my-act-list">
            <div class="my-act-card">
              <div class="my-act-img sim-act-1"></div>
              <div class="my-act-body">
                <span class="my-act-name">周末萌宠聚会 · 城市巡回</span>
                <div class="aurora-gold-rule"></div>
                <span class="my-act-info">周六 14:00 - 17:00 · 3小时</span>
                <div class="my-act-meta">
                  <div class="my-act-loc"><span class="my-act-loc-text">成都 · 太古里宠物公园</span></div>
                </div>
              </div>
              <div class="my-act-action">
                <div class="my-act-signin"><span class="my-act-signin-text">签到</span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="quick-services-wrapper">
          <div class="quick-services">
            <div class="qs-item qs-item--pressed">
              <div class="qs-icon qs-icon-activity"><span class="sim-ico">📣</span></div>
              <span class="qs-title">宠团团活动</span>
              <span class="qs-subtitle">发现同城宠物聚会</span>
            </div>
            <div class="qs-item">
              <div class="qs-icon qs-icon-mall"><span class="sim-ico">🛍</span></div>
              <span class="qs-title">宠团商城</span>
              <span class="qs-subtitle">严选好物 团长专享</span>
            </div>
          </div>
        </div>

        <div class="section pending-section">
          <div class="section-head">
            <span class="section-title">待处理</span>
            <span class="section-link">查看全部 ›</span>
            <span class="section-en">PENDING</span>
            <div class="section-rule"></div>
          </div>
          <div class="pending-list">
            <div class="pending-card">
              <div class="pending-info">
                <span class="pending-title">宠物零食大礼包 · 混合装</span>
                <span class="pending-time">09-11 20:14 下单</span>
              </div>
              <div class="pending-right">
                <span class="pending-status">待支付</span>
                <div class="pending-price-row"><span class="pending-symbol">¥</span><span class="pending-price">128.00</span></div>
              </div>
            </div>
            <div class="pending-card">
              <div class="pending-info">
                <span class="pending-title">秋季寄养 3 晚 · 双人房</span>
                <span class="pending-time">09-10 09:02 下单</span>
              </div>
              <div class="pending-right">
                <span class="pending-status">待补尾款</span>
                <div class="pending-price-row"><span class="pending-symbol">¥</span><span class="pending-price">420.00</span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="section host-invite-section">
          <div class="section-head">
            <span class="section-title">寄养开单</span>
            <span class="section-link">管理开单 ›</span>
            <span class="section-en">HOSTING</span>
            <div class="section-rule"></div>
          </div>
          <div class="host-invite-card">
            <div class="host-invite-glow"></div>
            <div class="host-invite-body">
              <span class="host-invite-eyebrow">HOSTING INVITATION</span>
              <span class="host-invite-title">主动开单</span>
              <span class="host-invite-desc">与客户沟通好后创建邀请，对方填写信息即可下单</span>
            </div>
            <span class="host-invite-arrow">›</span>
            <div class="host-invite-sealline"></div>
          </div>
        </div>

        <div class="section section-featured">
          <div class="section-head">
            <span class="section-title">商城好物</span>
            <span class="section-link">查看全部 ›</span>
            <span class="section-en">BOUTIQUE</span>
            <div class="section-rule"></div>
          </div>
          <div class="featured-scroll sim-mall-scroll">
            <div class="featured-list">
              <div class="mall-card">
                <div class="mall-card-img-share"><div class="mall-card-img sim-mall-1"></div></div>
                <div class="mall-card-info">
                  <span class="mall-card-name">冻干鸡肉粒 · 日常奖励</span>
                  <div class="mall-card-price-row">
                    <span class="mall-card-price">¥39.90</span>
                    <span class="mall-card-original">¥69.00</span>
                    <span class="mall-card-sold">已售 328</span>
                  </div>
                </div>
              </div>
              <div class="mall-card">
                <div class="mall-card-img-share"><div class="mall-card-img sim-mall-2"></div></div>
                <div class="mall-card-info">
                  <span class="mall-card-name">可拆洗宠物窝 · 四季通用</span>
                  <div class="mall-card-price-row">
                    <span class="mall-card-price">¥129.00</span>
                    <span class="mall-card-original">¥199.00</span>
                    <span class="mall-card-sold">已售 96</span>
                  </div>
                </div>
              </div>
              <div class="mall-card">
                <div class="mall-card-img-share"><div class="mall-card-img sim-mall-3"></div></div>
                <div class="mall-card-info">
                  <span class="mall-card-name">牵引绳 · 头层牛皮</span>
                  <div class="mall-card-price-row">
                    <span class="mall-card-price">¥88.00</span>
                    <span class="mall-card-sold">已售 41</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="section section-featured">
          <div class="section-head">
            <span class="section-title">团购好物</span>
            <span class="section-link">查看全部 ›</span>
            <span class="section-en">GROUP BUY</span>
            <div class="section-rule"></div>
          </div>
          <div class="featured-scroll sim-mall-scroll">
            <div class="featured-list">
              <div class="mall-card">
                <div class="mall-card-img sim-mall-4"></div>
                <div class="mall-card-info">
                  <span class="mall-card-name">尿垫 100 片 · S/M/L</span>
                  <div class="mall-card-price-row">
                    <span class="mall-card-price">¥20.00</span>
                    <span class="mall-card-sold">已拼 1.2 万件</span>
                  </div>
                </div>
              </div>
              <div class="mall-card">
                <div class="mall-card-img sim-mall-5"></div>
                <div class="mall-card-info">
                  <span class="mall-card-name">猫砂 10L · 豆腐混合</span>
                  <div class="mall-card-price-row">
                    <span class="mall-card-price">¥16.80</span>
                    <span class="mall-card-sold">已拼 8,640 件</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <span class="section-title">近期活动</span>
            <span class="section-link">更多 ›</span>
            <span class="section-en">EVENTS</span>
            <div class="section-rule"></div>
          </div>
          <div class="activity-list">
            <div class="activity-h-card">
              <div class="activity-h-img sim-act-2"></div>
              <div class="activity-h-body">
                <span class="activity-h-name">秋季宠物运动会 · 报名中</span>
                <div class="aurora-gold-rule"></div>
                <span class="activity-h-info">10月03日 09:30 - 12:00</span>
                <div class="activity-h-meta">
                  <div class="activity-h-loc"><span class="activity-h-loc-text">成都 · 锦城公园</span></div>
                </div>
                <div class="activity-h-people"><span class="activity-h-people-text">已有 28 人报名</span></div>
              </div>
            </div>
            <div class="activity-h-card">
              <div class="activity-h-img sim-act-3"></div>
              <div class="activity-h-body">
                <span class="activity-h-name">宠物急救常识工作坊</span>
                <div class="aurora-gold-rule"></div>
                <span class="activity-h-info">10月06日 14:00 - 16:00</span>
                <div class="activity-h-meta">
                  <div class="activity-h-loc"><span class="activity-h-loc-text">成都 · 高新区</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="bottom-spacer"></div>
      </div>
    </div>
  </div>
</div>
'''

EXTRA = '''
  /* ===== 静态还原外壳（仅截图用，不进小程序） ===== */
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: #ECE4D4; display: block;
         font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }
  /* Chrome 无头视口最小 500px → 手机贴左，出图后裁掉右侧 125px */
  .phone { width: 375px; margin: 0; position: relative; overflow: hidden;
           __PAGE_BG__ }
  .zy-navbar-sim {
    height: 84px; padding-top: 44px;            /* 状态栏 44 + 标题栏 40（真机口径，勿压成 44） */
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; letter-spacing: 0.26em; color: #fff;
    background: linear-gradient(135deg, #2D4F2D 0%, #0F2410 100%);
  }
  /* 一屏 812pt = navbar 84 + 问候行 48 + scroll-view 680（812 - scrollViewOffset 132） */
  .home-scroll { height: 680px; overflow: hidden; position: relative; }
  body.full .home-scroll { height: auto; overflow: visible; }
  /* swiper 静态复刻：itemW 284px（568rpx/2），卡 284-16=268px；previous-margin 16px */
  .sim-swiper { display: flex; overflow: hidden; }
  .sim-item { width: 375px; flex-shrink: 0; }
  .sim-car-1 { background: linear-gradient(150deg, #3D5A3D 0%, #14241A 100%); }
  .sim-car-2 { background: linear-gradient(160deg, #4E7050 0%, #1B2E1B 100%); opacity: .45; }
  .sim-av-1, .sim-av-2 { background: linear-gradient(160deg, #5A7C63, #1F3A1F); }
  .sim-act-1 { background: linear-gradient(160deg, #4E7050, #1B2E1B); }
  .sim-act-2 { background: linear-gradient(150deg, #3D5A3D, #14241A); }
  .sim-act-3 { background: linear-gradient(140deg, #2D4A2D, #0F2410); }
  .sim-mall-1 { background: linear-gradient(150deg, #3D5A3D, #14241A); }
  .sim-mall-2 { background: linear-gradient(160deg, #4E7050, #1B2E1B); }
  .sim-mall-3 { background: linear-gradient(140deg, #2D4A2D, #0F2410); }
  .sim-mall-4 { background: linear-gradient(155deg, #4A6B4A, #172F1A); }
  .sim-mall-5 { background: linear-gradient(145deg, #35553E, #12240F); }
  .sim-mall-scroll { overflow-x: auto; overflow-y: hidden; }
  .pets-scroll { overflow-x: auto; overflow-y: hidden; }   /* 模拟 scroll-view 裁切（真机由组件承载） */
  /* 静态还原不播放入场动画（否则截图拍到 opacity:0 的帧） */
  .stagger-item, .stagger-item * { opacity: 1 !important; animation: none !important; }
  /* 印章呼吸：?t=<秒> 定格到指定相位（负 delay + paused），放在上面之后以压过 animation:none */
  body.freeze .lux-cover-ring {
    animation: lux-seal-breathe 4.2s cubic-bezier(0.45, 0, 0.55, 1) infinite !important;
    animation-delay: var(--seal-t, 0s) !important;   /* 必须 !important：上面的简写把 delay 也置为 !important 的 0 */
    animation-play-state: paused !important;
  }
  .sim-ico { font-size: 30px; line-height: 1; filter: grayscale(1) brightness(0.25); }
  .pet-avatar { border: 0; }
  /* 静态还原不播放入场动画（否则截图拍到 opacity:0 的帧） */
  .stagger-item, .topbar-stagger { opacity: 1 !important; animation: none !important; }
  /* ?topbar=paper：把问候行改回 E3 定稿的「纸面问候行」（用于 A/B 对比） */
  body.paper-top .topbar { background: transparent; }
  body.paper-top .topbar-name { color: #1A1A17; }
  body.paper-top .topbar-loc { color: rgba(26, 26, 23, 0.45); }
  body.paper-top .topbar-avatar { border-color: rgba(201, 162, 75, 0.55); }
  body.paper-top .topbar-avatar-ph { background: linear-gradient(160deg, #5A7C63, #1F3A1F); }
  body.paper-top .topbar-avatar-text { color: #C9A24B; }
  body.paper-top .topbar-search { background: transparent; border-color: rgba(26, 26, 23, 0.14); }
  body.paper-top .topbar-search-icon { border-color: rgba(26, 26, 23, 0.45); }
  body.paper-top .topbar-search-icon::after { background: rgba(26, 26, 23, 0.45); }
  /* ?t=<秒>：把印章外环的呼吸动画定格在该相位（animation-delay 负值 + paused），
     否则单张静态图看不出「呼吸」——多相位各截一帧再拼图才是可评审证据 */
  body.freeze .lux-cover-ring { animation-delay: var(--seal-t, 0s); animation-play-state: paused; }
  /* ?nox=1：模拟「Skyline 丢弃覆盖层的 max-width: 100%」之后的真实后果 ——
     基础规则 .pet-card / .pet-card-empty 的 calc(50% - 24rpx)（旧两列网格）复活，卡片变半宽。
     这条只为出「回归对照图」而存在，不是小程序里的样式。24rpx = 12px */
  body.nox .pet-card,
  body.nox .pet-card-empty { max-width: calc(50% - 12px); }
  /* ?nopos=1：模拟「Skyline 丢弃覆盖层的 position: relative / 或原写法 position: static」——
     基础规则（L568）的 position: absolute + bottom/left/right: 0 复活 →
     价签卡片文字（深墨字）又叠回商品图上，而守护层 .mall-card-overlay 已关闭 → 不可读 */
  body.nopos .mall-card-info {
    position: absolute; bottom: 0; left: 0; right: 0; padding: 24rpx;
  }
  /* ===== 极光绿统一帘幕切片：导航栏 / 问候行 / 封面 取同一条 165deg 长带的三段 =====
     ?legacy=1 时整段失效，回到改前（118deg 宝石带仅贯穿上两栏 + 封面自有 165deg，接缝错位） */
__BAND_CSS____LEGACY_CSS__'''.replace('__PAGE_BG__', page_bg_css).replace(
    '__BAND_CSS__', BAND_CSS).replace('__LEGACY_CSS__', LEGACY_CSS)

HTML = '''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>AROORO 首页 · 落地还原</title>
<style>
/* ===== 令牌（从 styles/*.wxss + app.wxss 解析真值后内联） ===== */
%s

/* ===== pages/home/index.wxss（真实文件，rpx→px ×0.5） ===== */
%s

/* ===== 静态还原外壳 ===== */
%s
</style></head>
<body>
%s
<script>
  if (new URLSearchParams(location.search).get('mode') === 'full') document.body.classList.add('full');
  if (new URLSearchParams(location.search).get('topbar') === 'paper') document.body.classList.add('paper-top');
  if (new URLSearchParams(location.search).get('legacy') === '1') document.body.classList.add('legacy');
  if (new URLSearchParams(location.search).get('nox') === '1') document.body.classList.add('nox');
  if (new URLSearchParams(location.search).get('nopos') === '1') document.body.classList.add('nopos');
  const _t = new URLSearchParams(location.search).get('t');
  if (_t !== null) {
    document.body.classList.add('freeze');
    document.getElementById('phone').style.setProperty('--seal-t', '-' + _t + 's');
  }
  const sc = document.getElementById('scroller');
  const qt = new URLSearchParams(location.search).get('t');
if (qt !== null) {
  document.body.classList.add('freeze');
  document.body.style.setProperty('--seal-t', '-' + qt + 's');
}
requestAnimationFrame(() => {
    const cv = getComputedStyle(document.querySelector('.lux-cover'));
    const card = document.querySelector('.lux-car-card').getBoundingClientRect();
    const hint = document.querySelector('.lux-car-hint');
    const hintStyle = hint ? getComputedStyle(hint.querySelector('.hint-line')) : null;
    const seal = document.querySelector('.lux-cover-seal').getBoundingClientRect();
    const cbox = document.querySelector('.lux-cover').getBoundingClientRect();
    const ctop = document.querySelector('.lux-cover-top').getBoundingClientRect();
    const ring = document.querySelector('.lux-cover-ring').getBoundingClientRect();
    const rc = getComputedStyle(document.querySelector('.lux-cover-ring'));
    // 宠物卡宽度探针：B 版式应为整幅容器宽（≈327）。基础规则里有 max-width: calc(50%% - 24rpx)，
    // 若覆盖层那条被引擎丢弃（Skyline 不认 max-width:none）就会掉到 ≈151 且无声无息。
    const pet = document.querySelector('.pet-card');
    const pr = pet ? pet.getBoundingClientRect() : null;
    // 商城卡价签探针：B 版式应为「图上无字、价签落到纸面」（.mall-card-info 回到正常流）
    const mi = document.querySelector('.mall-card-info');
    const mr = mi ? mi.getBoundingClientRect() : null;
    const mimg = document.querySelector('.mall-card-img');
    const mib = mimg ? mimg.getBoundingClientRect() : null;
    const head = document.querySelector('.section-head');
    const heads = document.querySelectorAll('.section-title');
    const t0 = heads[0], t1 = heads[1];
    const c0 = getComputedStyle(t0), c1 = getComputedStyle(t1);
    document.title = 'H' + Math.ceil(document.body.scrollHeight) +
      '|cover ' + cv.height + ' bg=' + (cv.backgroundImage.indexOf('gradient') >= 0 ? 'ok' : 'MISSING') +
      '|seal ' + Math.round(seal.width) + '[' + Math.round(seal.top - cbox.top) + '~' + Math.round(seal.bottom - cbox.top) + ']' +
      '|ctop ' + Math.round(ctop.top - cbox.top) + '~' + Math.round(ctop.bottom - cbox.top) +
      '|ring ' + Math.round(ring.width) + ' anim=' + rc.animationName + ' ' + rc.animationDuration +
      ' tf=' + rc.transform +
      '|band nav ' + getComputedStyle(document.querySelector('.zy-navbar-sim')).backgroundSize +
      ' top ' + getComputedStyle(document.querySelector('.topbar')).backgroundSize +
      ' cover ' + cv.backgroundSize + ' @' + cv.backgroundPosition +
      '|card ' + Math.round(card.width) + '+' + Math.round(card.height) + '@' + Math.round(card.left) +
      '|ratio ' + (card.height / Math.round(card.width * 100) / 100 * 100).toFixed(1) + '%%(16:9=56.25)' +
      '|capGap ' + (() => {
      const cap = document.querySelector('.lux-car-cap');
      const mps = document.querySelector('.my-pets-section');
      const hdr = document.querySelector('.my-pets-header');
      const ttl = document.querySelector('.section-title');
      const cs = el => getComputedStyle(el);
      if (!cap || !mps) return 'MISSING';
      const cb = cap.getBoundingClientRect().bottom + window.scrollY;
      const mt = mps.getBoundingClientRect().top + window.scrollY;
      const ht = hdr ? hdr.getBoundingClientRect().top + window.scrollY : -1;
      const tt = ttl ? ttl.getBoundingClientRect().top + window.scrollY : -1;
      return 'capB=' + Math.round(cb) + ' mpsT=' + Math.round(mt) + ' hdrT=' + Math.round(ht) +
        ' ttlT=' + Math.round(tt) +
        ' mps[mt=' + cs(mps).marginTop + ' pt=' + cs(mps).paddingTop + ']' +
        ' hdr[mt=' + (hdr ? cs(hdr).marginTop : '-') + ']' +
        ' ttl[mt=' + (ttl ? cs(ttl).marginTop : '-') + ' lh=' + (ttl ? cs(ttl).lineHeight : '-') + ']' +
        ' sheetPT=' + cs(document.querySelector('.home-content-sheet')).paddingTop;
    })() + '|portraits ' + (() => { const ps = document.querySelectorAll('.pet-portrait'); const cs = document.querySelectorAll('.pet-card'); return Array.from(ps).map((el,i) => { const r = el.getBoundingClientRect(); const cr = cs[i].getBoundingClientRect(); return 'p' + i + '[' + Math.round(r.width) + 'x' + Math.round(r.height) + ' card' + Math.round(cr.width) + ']' }).join(' '); })() + '|petsScroll ' + (() => { const sc = document.querySelector('.pets-scroll'); const pg = document.querySelector('[data-role="petsgrid"]'); const c = document.querySelector('.pet-card'); return sc ? 'sw' + Math.ceil(pg.scrollWidth) + ' cardW=' + Math.round(c.getBoundingClientRect().width) : 'MISSING'; })() + '|petDbg ' + (() => { const c = document.querySelector('.pet-card'); const pv = document.querySelector('.pet-portrait'); const cs = el => el ? getComputedStyle(el) : null; return c ? 'card[op=' + cs(c).opacity + ' bg=' + cs(c).backgroundColor + ' vis=' + cs(c).visibility + ']' + ' portrait[' + (pv ? cs(pv).width + 'x' + cs(pv).height + ' bgimg=' + (cs(pv).backgroundImage.indexOf('gradient')>=0?'grad':'none') : 'MISSING') + ']' : 'NOCARD'; })() + '|pet ' + (pr ? Math.round(pr.width) + 'x' + Math.round(pr.height) + '@' + Math.round(pr.left) +
        ',' + Math.round(pr.top + window.scrollY) : 'none') +
      // 价签块应完全落在商品图**下方**（mr.top >= mib.bottom）。若被丢弃 position 则会叠回图上。
      '|mallinfo ' + (mr ? Math.round(mr.width) + '+' + Math.round(mr.height) + '@' +
        Math.round(mr.left) + ',' + Math.round(mr.top + window.scrollY) : 'none') +
      ' img ' + (mib ? Math.round(mib.height) + '@' + Math.round(mib.top + window.scrollY) +
        '..' + Math.round(mib.bottom + window.scrollY) : 'none') +
      ' overlap=' + (mr && mib ? (mr.top < mib.bottom - 1 ? 'YES' : 'no') : '?') +
      '|sw' + Math.ceil(sc.scrollWidth) +
      '|title0 "' + t0.textContent + '" ' + c0.fontSize + '/' + Math.round(t0.getBoundingClientRect().width) +
      ' title1 "' + t1.textContent + '" ' + c1.fontSize + '/' + Math.round(t1.getBoundingClientRect().width);
  });
</script>
</body></html>
''' % (tok_css, page_css, EXTRA, BODY)

io.open(OUT, 'w', encoding='utf-8').write(HTML)
print('写出 %s（%d 字节）' % (OUT, len(HTML)))
print('内联令牌 %d 个；page 纸面底 = %s' % (len([t for t in need if t in TOKENS]), '已注入' if page_bg_css else '(未取到)'))
if missing:
    print('!! 未解析到真值的令牌（会退回浏览器默认，需人工确认）：', ', '.join(missing))
