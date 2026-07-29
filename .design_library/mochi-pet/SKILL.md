---
name: mochipet-design
description: Use this skill to generate well-branded interfaces for MochiPet (宠物综合服务小程序). Contains warm peach-coral colors, soft neumorphic type, and UI kit for prototyping mobile app UIs.
user-invocable: true
---
# MochiPet Design Skill

Read the `README.md` file within this skill, and explore the other available files. If creating visual artifacts, copy assets out and create static HTML files for the user to view; if working on production code, read the rules here to design with this brand.

## Quick map

- `README.md` — brand context, content fundamentals, visual foundations (read first)
- `colors_and_type.css` — drop-in runtime CSS variables for colors, type, radius, shadow, spacing
- `css.json` — structured token understanding source (read this to understand tokens; link the CSS, do not re-parse it)
- `components/index.json` — component index + cross-component patterns
- `components/{slug}.json` — per-component contracts (intent/variants)
- `components.css` — aggregated component CSS
- `preview/component-{slug}.html` — small HTML cards illustrating each component (first source for DOM/CSS)
- `ui_kits/app/` — full click-thru recreation
- `library-consumption.json` — recommended downstream read order

## Essentials at a glance

- Brand primary `#D26243` (coral peach, `--primary-600`). Warm, low-saturation, healing — drives every CTA and price; never cool, neon, or default blue.
- Radius scale 8 / 12 / 16 / 24 / 28px + pill(9999px). Cards use 24-28px (xl/2xl) for a soft healing feel; pills reserved for tabs, search, buttons, badges — no sharp corners anywhere.
- Control height 44px (button-md / touch target), inputs 48px, primary CTA 52px (button-lg). Spacing base 4px with generous whitespace; cards pad 12-16px.
- Type: **Nunito** (display/heading/price, 700-800) + **Plus Jakarta Sans** (body, 400-600) + **Noto Sans SC** for Chinese. Prices always Nunito 800 in primary color — never system sans.
- Voice: Chinese-first, warm/healing/playful — "20款新品尝鲜", "立即预约", "宠物陪伴". Action verbs + sensory quantities, no cold corporate tone.
- Shadow philosophy: 5-level warm-dyed diffuse shadows `rgba(180,120,100,…)` — peach-tinted, never neutral gray. Cards shadow-2, raised CTA shadow-3, FAB shadow-4; soft neumorphic, no hard borders at rest.
- Brand quirk: category color taxonomy — sage green (`--success`) for 健康医疗, honey amber (`--warning`) for 主粮/零食 — applied to product-card media gradients, option dots, and tags; warm cream `#FFFAF6` card over `#FBF7F4` background.

## Components

| Slug | Name | Key Insight |
|---|---|---|
| search-bar | Search Bar | Pill input (radius-pill, 48px) on cream card + shadow-2, no border; focus swaps to white surface + 2px primary ring. Lives in a flex bar beside avatar+badge. |
| category-tab | Category Tab | Pill tabs 36px; selected = primary fill + shadow-1, unselected = cream card + 1px border. Horizontal scroll row, text-only. |
| product-card | Product Card | 24px radius card, shadow-2; 1:1 media uses category-tinted gradients (primary/honey/sage 50→100); price Nunito 800 primary, pill badge top-left. |
| option-selector | Option Selector | Dual mode: 28px color dots (selected = 2px primary outline offset 3px) + 12px chips (selected = 12% primary tint). Dots use semantic category hues. |
| cart-button | Cart Button | Pill CTAs radius-pill; primary 52px full-width shadow-3, outline 1.5px border, float 44px shadow-4. Active scales .97 + drops to shadow-1. |
| price-display | Price Display | Nunito price font in primary color; lg splits ¥/int/dec (16/30/18px) baseline-aligned; pairs with strikethrough original + muted unit. |
