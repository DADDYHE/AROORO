---
name: arooro-admin-design
description: Use this skill to generate well-branded interfaces and assets for AROORO Admin — pet services platform admin dashboard with luxury-grade interface and Hermes-inspired editorial aesthetics. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping dashboard UIs.
user-invocable: true
---

# AROORO Admin Design Skill

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out
and create static HTML files for the user to view. If working on production code, you can
copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build
or design, ask some questions, and act as an expert designer who outputs HTML artifacts
_or_ production code, depending on the need.

## Quick map

- `README.md` — brand context, content fundamentals, visual foundations (read first)
- `css.json` — structured token understanding source (programmatic consumption)
- `colors_and_type.css` — drop-in runtime CSS variables; link it, do not read it to understand tokens when `css.json` exists
- `components/index.json` — component index + cross-component patterns + summary
- `components/{slug}.json` — per-component contract JSON (intent/variants/states)
- `components.css` — aggregated component CSS auto-extracted from preview pages
- resolved component sources — consume in priority order: `preview/component-{slug}.html` first for DOM/CSS fidelity, `components/{slug}.json` for intent/variants, and `components/_evidence/{slug}.json` as fallback evidence when preview is insufficient
- `preview/` — small HTML cards illustrating foundations and components
- `library-consumption.json` — recommended downstream read order

## Essentials at a glance

- Brand primary `#1F3A1F` (deep forest green, `--primary-700`) — Hermes-grade gravitas. Champagne gold accent `#C9A24B` (`--accent-400`) kept under 5% area; never as a large fill, only hairlines, active indicators, and icon tints.
- Canvas is cream paper-feel `#F7F5EF` (`--background`) with charcoal ink `#1A1A17` (`--foreground`) text. Hairline borders `#E8E4D9` (`--border`) replace shadows at rest — surfaces are `#FFFFFF` cards on cream.
- Radius scale `4 / 8 / 12 / 16 / 20px` + `9999px` pill — near-square corners are deliberate and editorial. Pill (`--radius-pill`) is reserved for status chips, the primary button, and search inputs only; cards and tables use `12px`.
- Type stack: **Cormorant Garamond** (display + eyebrow, 56px/500), **Noto Serif SC** (headings, 40→24px), **Noto Sans SC** (body, 16px/400), **Inter** (tabular numbers and pagination) — magazine hierarchy, never "System Sans".
- Spacing is 4px-based (`4/8/12/16/20/24/32/40/48/64`); 48px+ outer margins for art-grade whitespace. Default control height is 40px (`--size-button-md`, `--size-input`); small controls 32px.
- Shadow philosophy is whisper-quiet: `--shadow-1: none` at rest (hairline border carries the edge), `0 2px 12px rgba(26,26,23,0.06)` only on card hover. Glow shadow reserved exclusively for the primary button.
- Voice: Chinese-first (zh), luxury-editorial and refined. Real copy leans editorial — "数据看板", "今日订单", "团购管理", "创建团购". No emoji in product UI.
- Signature patterns: sidebar uses a deep forest green gradient with a gold active indicator and collapses to 72px; data tables pair eyebrow uppercase headers with Inter number-font amounts and pill statuses; primary button is pill-shaped with a glow shadow.

## Components

| Component | Preview | Contract | CSS Source | Key Facts | Key Insight |
|---|---|---|---|---|---|
| Button | `preview/component-button.html` | `components/button.json` | `components.css` § Button | Pill primary (36px, glow shadow) + sm 32px; text-only row actions (edit/publish/delete) in semantic colors; toggle + pagination variants | Pill + glow is the only place radius-pill and shadow combine — gold-free restraint |
| Card | `preview/component-card.html` | `components/card.json` | `components.css` § Card | White card, hairline border, 12px radius; stat card = tinted icon + number + trend | Hairline border carries the edge at rest; shadow appears only on hover |
| Data Table | `preview/component-table.html` | `components/table.json` | `components.css` § Table | Eyebrow uppercase headers, thumbnail cells, pill statuses, Inter number-font amounts | Editorial table treats amounts as tabular Inter, headers as Cormorant eyebrow |
| Chart | `preview/component-chart.html` | `components/chart.json` | `components.css` § Chart | CSS-only bar chart with gradient bars + conic-gradient donut with center hole and legend | Pure CSS gradients (no JS chart lib) keep the luxury paper-feel intact |
| Navigation | `preview/component-navigation.html` | `components/navigation.json` | `components.css` § Navigation | Top header with breadcrumb, search pill, notification icon, user chip | Search uses radius-pill; rest of header stays hairline and restrained |
| Sidebar | `preview/component-sidebar.html` | `components/sidebar.json` | `components.css` § Sidebar | Deep forest green gradient, gold active indicator, collapsible to 72px | Only surface allowed a gradient fill — gold indicator is the accent's largest moment |
