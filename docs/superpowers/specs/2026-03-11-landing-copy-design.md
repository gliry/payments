# OmniFlow v3 Landing — Sales Copy Spec

> **Status:** In Progress (sections 1-4 done, 5-11 upgrading)
> **Date:** 2026-03-14
> **Files:** `v3/index.html`, `v3/css/`, `v3/js/`

## Copy Strategy

1. **Receiver-first messaging** — упор на удобство получателей, не только отправителей
2. **Cross-chain + non-custodial** — две ключевые дифференциации, всегда в связке
3. **One-click + gasless** — все действия максимально просто, без газа
4. **Any token in, any token out** — принимать и платить в любом токене
5. **Pay-in + pay-out** — платформа работает в обе стороны (invoicing + payouts)
6. **Modern design** — модные эффекты, графика, анимации. Сайт должен выглядеть premium
7. **Vanilla JS only** — никаких тяжёлых фреймворков. Vanilla JS + библиотеки для эффектов (GSAP, Lenis)
8. **Any** — any tokens, any recipients, any chains. Без конкретных цифр-лимитов


## Section Order

1. Hero (text + flow field background + trust bar) ✅
2. Problem — Terminal wall of pain (pinned scroll, 6 error lines + 1 green resolution) ✅
3. Isometric Visualization / How It Works (pinned scroll, step indicators) ✅
4. Features (5 accordion items: Invoicing, Batch, Non-Custodial, Gasless, Recurring) ✅
5. **Mid-page CTA** (NEW — Pay-in / Pay-out dual cards) 🔨
6. Security & Compliance (SVG flow diagram + blur reveal + 3 trust cards) 🔨
7. Integrations (bidirectional marquee + partner cards with brand glow) 🔨
8. Traction/Metrics (Dune-style metric cards + sparklines + counters) 🔨
9. Team / Founders (camera fly-out effect) 🔨
10. FAQ (staggered reveal + growing underlines) 🔨
11. CTA (Pay-in/Pay-out mini cards + "Start Your First Batch") 🔨
12. Footer 🔨
13. Global polish (grain overlay, magnetic cursor, growing underlines) 🔨

---

## Visual Effects Map

### Background Strategy
Flow field canvas (`position: fixed`) всегда за всем контентом. Секции чередуют прозрачный фон (частицы видны) и solid/mesh фон (частицы скрыты):

| Секция | Фон | Частицы видны? |
|--------|-----|---------------|
| Hero | Прозрачный | ✅ Реки + vortex на мышку |
| Problem | Solid dark | ❌ Фокус на боли |
| Isometric | Solid dark | ❌ Фокус на SVG |
| Features | Solid dark | ❌ Фокус на accordion |
| **Mid-page CTA** | Прозрачный | ✅ Реки за карточками |
| Security | Solid dark (section--alt) | ❌ Фокус на диаграмме |
| Integrations | Solid dark | ❌ Чистый фон для логотипов |
| Traction | Прозрачный (bg-mesh) | ✅ Реки за статистикой |
| Team | Solid dark | ❌ Фокус на карточках |
| FAQ | Solid dark (section--alt) | ❌ Чистый фон для текста |
| CTA | Mesh gradient | ❌ Gradient callback к hero |
| Footer | Solid dark | ❌ |

Чередование: ✅❌❌❌✅❌❌✅❌❌❌❌ — ритмичная пульсация.

### Эффекты по секциям

**1. Hero** — Flow field rivers
- Фон: flow field canvas (вечные реки, mouse vortex)
- Текст: fade-up stagger при загрузке
- Stats badges: fade-up с задержкой

**2. Isometric** — 3D pinned scroll
- Фон: solid dark (скрывает частицы)
- Эффект: **pinned scroll** — SVG залипает, 3 фазы подсвечиваются при скролле (Upload → Route → Execute)
- Animated: dash flow lines, floating cards, center glow pulse
- Step indicators переключаются по фазам

**3. How It Works** — Scroll-reveal cards
- Фон: прозрачный (частицы видны за карточками)
- Эффект: **fade-up stagger** — 3 карточки появляются одна за другой при скролле
- Карточки с glass-эффектом (backdrop-blur) → частицы красиво просвечивают

**4. Features** — Split-screen accordion (sticky left)
- Фон: solid dark (--color-bg-primary)
- Эффект: **split-screen accordion** — левая колонка "More than payments." залипает (GSAP pin), правая скроллится с 5 items
- Active item highlights (gradient title) when its top reaches "payments." bottom level
- Pin releases when Recurring center aligns with "payments." top
- Security section pulled up via negative margin (no dead space)

**5. Mid-page CTA** (NEW) — Split Screen
- Фон: прозрачный, но каждая сторона имеет subtle tint:
  - Left (Pay-in): `rgba(24,148,232,0.04)` — blue tint
  - Right (Pay-out): `rgba(159,114,255,0.04)` — purple tint
- **Layout**: full-width viewport split, без container. flex: 1 + 1
- **Центральный divider**: vertical gradient line (purple→blue) + floating label "Choose your flow" в card-pill
- **Hover**: наведённая сторона `flex: 1.25`, фон усиливается до 0.08 opacity; другая `flex: 0.75`, `opacity: 0.6`
- **Transition**: `0.6s cubic-bezier(0.25, 0.1, 0.25, 1)` — плавный, упругий
- **CTA кнопки**: крупные (btn--lg), с glow-тенью, "→" стрелка внутри
- **Под кнопками**: мелкий текст "Opens OmniFlow app · Free during beta" — ясно куда ведёт + снимает ценовой барьер
- **Без bottom stripe** — чистый визуал, вся инфа в sub-CTA текстах
- **Mobile**: stack вертикально, каждая сторона → full-width блок, divider → horizontal

**6. Security** — Blur-to-sharp reveal
- Фон: solid dark (section--alt)
- Эффект: **camera zoom-in** — SVG диаграмма появляется из blur:
  - Scroll 0%: `scale(0.85)`, `filter: blur(8px)`, `opacity: 0`
  - Scroll 50%: `scale(1.0)`, `filter: blur(0)`, `opacity: 1`
  - Scroll 80%: trust cards stagger-in снизу
- **Growing underline** под "Zero custody" в заголовке (scaleX 0→1, gradient)
- Security cards: blur-to-sharp stagger (не простой fade-up)
- SVG flow diagram вместо emoji: 3 nodes (rounded rect + icon path) + animated dashed lines

**7. Integrations** — Bidirectional marquee
- Фон: solid dark
- Эффект: **двунаправленная лента** (2 ряда):
  - Ряд 1 (chains, ←): Ethereum, Base, Arbitrum, OP, Polygon, Avalanche, Sonic
  - Ряд 2 (tokens, →): USDC, USDT, ETH, WBTC, DAI, MATIC, ARB, OP
  - `animation-direction: reverse` на втором ряду
- Визуальная метафора: деньги текут в обоих направлениях = pay-in + pay-out
- Партнёры (LI.FI, ZeroDev, Circle) — карточки с card bg, border, brand-color glow on hover
- Chain colored dots (::before pseudo с var(--chain-color))
- Hover pause + `prefers-reduced-motion` поддержка
- Скорость: 35s loop

**8. Traction** — Dune-style metrics
- Фон: прозрачный (bg-mesh, частицы видны)
- ETHGlobal badge с золотым свечением (conic-gradient border) — крупная карточка сверху
- **Dune-style metric cards** (4 шт в grid):
  ```
  ┌─────────────────────────┐
  │  COMMITS (30D)          │  ← серый label, uppercase, 11px, mono font
  │  247                    │  ← большое число, animated counter (data-counter)
  │  ████████▓░░  +34%      │  ← SVG sparkline + зелёный delta badge
  └─────────────────────────┘
  ```
- Стилизация карточки: тёмный фон, тонкий border (1px rgba(255,255,255,0.08))
- Counter animation: от 0 до значения, easeOutQuart, trigger при scroll-into-view
- SVG sparklines: inline `<polyline>`, stroke: --color-mint, opacity 0.4, 80x24 viewBox
- Delta badges: green pill (`background: rgba(98,226,164,0.1); color: --color-mint`)
- Метрики: #1 ETHGlobal, 2 Engineers + AI, $8-10K/mo Burn, 60x Market Growth

**9. Team** — Camera fly-out
- Фон: solid dark
- Эффект: **camera fly-out** (обратный от Security):
  - `scale(1.15)` → `scale(1.0)`, `blur(4px)` → `blur(0)`, `opacity: 0` → `opacity: 1`
  - GSAP scroll-scrub, trigger: `top 70%` → `top 20%`
- Карточки с subtle gradient border on hover
- Skip на мобильных (только fade-up)

**10. FAQ** — Staggered reveal
- Фон: solid dark (section--alt)
- Эффект: **staggered cascade** — 7 items появляются каскадом:
  - `y: 20, opacity: 0, stagger: 0.08, duration: 0.6`
  - Trigger: `top 75%`
- **Growing underline** на открытом вопросе:
  - `.faq__item[open] .faq__question::after { width: 100% }`
  - Gradient underline с transition 0.4s

**11. CTA** — Pay-in/Pay-out + Final action
- Фон: mesh gradient (callback к hero)
- **Мини Pay-in/Pay-out карточки** над основной кнопкой (визуальный callback к mid-page CTA):
  ```
  ┌──────────────┐  ┌──────────────┐
  │  Pay-in       │  │  Pay-out      │
  │  Invoices,    │  │  Payroll,     │
  │  widgets,     │  │  bounties,    │
  │  links        │  │  grants       │
  └──────────────┘  └──────────────┘
  ```
- CTA Primary: "Start Your First Batch" (rotating-border) + "Free during beta" sublabel
- Subtle link: "Talk to Founders →" (с реальной ссылкой, не #)
- Эффект: fade-up текст + rotating gradient border

**12. Footer** — Minimal
- Фон: solid dark
- Subtle gradient top border (separator)
- Clean typography, без анимаций

### Global Effects (все секции)

**Grain/noise overlay:**
- `body::after` с SVG feTurbulence
- `opacity: 0.03`, `pointer-events: none`, `z-index: 9999`
- `mix-blend-mode: soft-light`
- Тонкая плёночная текстура поверх всей страницы

**Magnetic cursor на CTA кнопках:**
- `.btn--primary`, `.btn--rotating-border`
- `mousemove`: кнопка притягивается к курсору (translate ±15%)
- `mouseleave`: snap-back с easing
- На тач-устройствах: отключить

**Growing underlines (утилита):**
- `.underline-grow` — reusable class
- `::after` pseudo с `scaleX(0→1)`, gradient background
- Активация через `.is-active` (ScrollTrigger callback) или `:hover`

---

## Section Copy

### 0. Meta/OG
- `<title>`: OmniFlow — Crypto Payments
- `<meta description>`: Cross-chain crypto payments — pay and get paid in any token, on any chain. Gasless, non-custodial. Winner: ETHGlobal HackMoney 2026.
- `og:description`: Pay and get paid in any token, on any chain. One click. Gasless. Non-custodial.

### 1. Hero
- Badge: 🏆 1st Place "Best DeFi Composer" — ETHGlobal 2026
- H1: Receiver-first cross-chain payments.
- Subtitle: The first payment infrastructure where recipients choose their chain, token, and settlement — gasless, non-custodial, one click.
- CTA Primary: Launch App

### 2. Problem — "Wall of pain"
- **Формат**: Horizontal scroll slides. Pinned при скролле. Каждый slide = карточка с двумя строками (red + light).
- **Механика**: Scroll-driven horizontal track. Каждый slide проезжает по центру. Точки-индикаторы внизу. После последнего slide — resolve slide. Unpin.
- **Шрифт**: Sora, 600 weight, clamp(1.2rem, 3vw, 2rem). По центру.
- **Цвет строк**: красный (problem-wall__red) + серый (problem-wall__light) — split на две части.
- **Финальная**: brand gradient (синий→фиолетовый), glow-эффект (problem-wall__resolve).
- **Фон**: тёмный (#0b0d12), ничего лишнего.

**Строки (6, по эскалации):**
```
1. Which chain? Money is money. That's a bug, not a question.
2. Buy ETH to send USDC. Read that again.
3. Approve. Sign. Switch. Approve. Sign. Confirm. Wait. That's one payment.
4. They pay in USDT on Arbitrum, you wanted USDC on Base. Hope someone know how to bridge.
5. Copy-paste address and pray. Your bank: autopay, invoices, subscriptions. Crypto?
6. It's your money. Until they decide it's not.
```

**Финальная (brand gradient):**
```
What if none of this was your problem?
```

### 3. Isometric / How It Works
- Full SVG: source cards (Treasury, Payroll CSV, DAO Fund) → OmniFlow Engine (sphere) → recipient cards
- Step indicators: 01 Pay in ("Any source, any chain"), 02 Manage ("Smart routing engine"), 03 Payout ("Multi-chain, gasless") — pinned scroll animation
- Effects: dash flow lines, floating cards, center glow pulse, glassmorphism sphere, orbiting token icons, packet animations

### 4. Features — Split-Screen Accordion
- **Layout**: Split-screen. Left sticky: "More than" (gray) + "payments." (brand gradient). Right: scrolling accordion items. Solid dark bg.
- **Scroll behavior**: Left side pinned. Items highlight when their top reaches "payments." bottom level. Pin releases when Recurring center aligns with "payments." top. Security section follows immediately.
- **H2** (left sticky): More than payments.
- **Cards** (6 items, right scrolling):
  1. **Invoicing** — "User pays in any token on any chain. We convert and settle to your preferred token and chain automatically."
  2. **Batch Payouts** — "Upload CSV or add recipients manually. One-click cross-chain payout in different tokens to different chains."
  3. **Non-Custodial** — "Funds are always yours — even from the first step of pay-in. We never have access to your money."
  4. **Gasless** — "Zero gas pop-ups. Zero failed transactions. Account Abstraction handles everything."
  5. **Recurring** — "Scheduled payouts and subscription pay-ins. Set once, runs automatically."
  6. **Flexible Auth** — "Passkeys, crypto wallet, email — access your account however you prefer. No forced workflow, no mandatory browser extensions."


### 5. Mid-page CTA (NEW — Split Screen, между Features и Security)
- **Layout**: Full-width split screen (Variant B). Без container — edge-to-edge.
- **Центральный divider**: Gradient vertical line + floating pill "Choose your flow"
- **H2**: нет отдельного H2 — "Choose your flow" в центре выполняет эту роль

**Left side — Pay-in (blue tint):**
- Direction label: `← PAY-IN` (uppercase, 0.7rem, letter-spacing 0.15em, color: --color-primary)
- Headline: **Get paid in crypto**
- Description: "Share an invoice or payment link. They pay in any token — you receive exactly what you want."
- Feature tags: `invoices · payment links · widgets` (pills, inline, secondary color)
- CTA: **"Create Invoice →"** (btn--primary blue, btn--lg)
- Sub-CTA: "Opens OmniFlow app · Free during beta" (0.7rem, secondary color, под кнопкой)

**Right side — Pay-out (purple tint):**
- Direction label: `PAY-OUT →` (uppercase, color: --color-purple)
- Headline: **Pay anyone, anywhere**
- Description: "Upload a CSV or add recipients. One-click batch payout across chains and tokens."
- Feature tags: `payroll · bounties · grants` (pills, inline)
- CTA: **"Start Payout →"** (btn--primary purple, btn--lg)
- Sub-CTA: "Opens OmniFlow app · Free during beta" (0.7rem, secondary color)

**Зачем эта секция:**
1. **Конверсия** — ловит тех, кто готов после Features
2. **Сегментация** — посетитель мгновенно видит два пути продукта
3. **Clarity** — конкретные действия (Create Invoice / Start Payout), не абстрактный "Launch App"
4. **App transition** — "Opens OmniFlow app · Free during beta" делает очевидным куда ведёт + снимает ценовой барьер

### 6. Security
- **H2**: Enterprise-grade security. Zero custody.
- **Growing underline** на "Zero custody" в H2

**Security Cards (7 шт, эмоциональный flow: страх → контроль → доказательство → выход):**

1. **Non-custodial**
   - Title: "Your keys, your funds"
   - Copy: "We never hold your money. Funds go directly to your own smart account — from the very first deposit. OmniFlow is not a middleman."
   - *Снимает главный страх: "вы не FTX?"*

2. **Zero custom contracts + ZeroDev**
   - Title: "Zero proprietary smart contracts"
   - Copy: "We didn't write a single smart contract. OmniFlow runs entirely on audited, battle-tested infrastructure — ZeroDev Kernel (6M+ accounts, acquired by Offchain Labs). Less code = less attack surface."
   - *Unique selling point: ни один конкурент этого не заявляет*

3. **Onchain access control** (merged: recipient lock + protocol whitelist + onchain enforcement)
   - Title: "Enforced onchain, not by promises"
   - Copy: "Our backend can only route funds to YOUR addresses, only through protocols YOU approved. All restrictions enforced by the smart contract — not our server. Even if our backend is fully compromised, the rules hold."
   - *Отвечает на "а что если вас взломают?"*

4. **Bounded permissions** (merged: daily limits + time-bounded permissions)
   - Title: "You set the rules"
   - Copy: "Daily amount caps, auto-expiring permissions, rate limits. You define the boundaries — anything beyond requires your explicit approval. Like a daily spending limit on your bank card, but enforced by code."
   - *Переход от страха к контролю*

5. **Isolated account**
   - Title: "Your own account, not a pool"
   - Copy: "Every user gets their own isolated smart account. One compromised account never affects another. No shared pools, no Celsius scenario."
   - *Отдельный от non-custodial: "а если соседа взломают?"*

6. **Modular recovery**
   - Title: "Recovery on your terms"
   - Copy: "Layer recovery methods: email, trusted contacts, hardware wallet, dead man's switch. Combine them with custom thresholds and timelocks. One mechanism is never enough."
   - *Снимает страх потери доступа*

7. **Revoke anytime**
   - Title: "Revoke anytime"
   - Copy: "Revoke all permissions in one click, at any moment. No lock-in, no waiting period, no questions asked."
   - *Финалка: лёгкий выход повышает конверсию входа*

**Open-source CTA** (компактный элемент внизу секции, не карточка):
- "Don't trust — verify. Our backend is open-source." + GitHub button
- *Для технической аудитории, принимающей решения*

**Trust badges**: ZeroDev Kernel v3.3, Circle CCTP v2 (text logos, grayscale→color on hover)

**Moved to Features (#4):** Flexible Auth (#8) — UX, не security

**Дизайн и layout карточек — TBD (отдельный этап после финализации контента)**

### 7. Integrations/Supported
- **H2**: Composing the best infrastructure in crypto.
- **Partners** (3 карточки с card bg + brand glow):
  | Partner | Role | Brand Color |
  |---------|------|-------------|
  | LI.FI | Routing & Bridging | #6366f1 |
  | ZeroDev | Smart Accounts | #62e2a4 |
  | Circle CCTP v2 | USDC Settlement | #1894e8 |
- **Marquee Row 1** (chains, ←): Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, Sonic, Pimlico, Rhinestone
  - С colored dot (::before, var(--chain-color))
  - Duplicate content для seamless loop
- **Marquee Row 2** (tokens, →): USDC, USDT, ETH, WBTC, DAI, MATIC, ARB, OP, AVAX
  - `animation-direction: reverse`
  - Те же стили, другое направление

### 8. Traction/Metrics
- **H2**: Small team. Big leverage.
- **ETHGlobal hero badge** (крупная карточка):
  - 🏆 1st Place — ETHGlobal HackMoney 2026
  - "Best DeFi Composer App" — LI.FI Prize Track
  - Gold conic-gradient border animation
- **4 Dune-style metric cards** (grid-4, responsive → grid-2 на mobile):
  | Label | Value | Sparkline | Delta |
  |-------|-------|-----------|-------|
  | HACKATHON | #1 | ─ | ETHGlobal 2026 |
  | ENGINEERS | 2 + AI | ▅▆▇ | 10-20x leverage |
  | MONTHLY BURN | $8-10K | ▃▄▅ | Capital efficient |
  | MARKET GROWTH | 60x | ▂▃▅▇ | Cross-chain payments |
- **Links**: ETHGlobal Showcase, GitHub (btn--ghost)

### 9. Team / Founders
- **H2**: Who's building this.
- **2 cards** (camera fly-out reveal):
  | Name | Role | Bio |
  |------|------|-----|
  | Ildar | Co-founder & Engineering | Full-stack. Previously fintech infrastructure. Smart account layer + routing engine. |
  | Andrey | Co-founder & Engineering | Full-stack. Smart contract + DeFi. Execution layer + cross-chain operations. |
- **Links**: GitHub, LinkedIn (нужны реальные URL!)
- **Avatar**: Letter-based (I, A) — сохраняем текущий стиль

### 10. FAQ
- **H2**: Questions? Answered.
- **7 items** (staggered reveal, `<details>` accordion):
  1. Is OmniFlow custodial? → No, fully non-custodial. ERC-4337 smart accounts.
  2. Which chains? → 30+ EVM chains. LI.FI + Circle CCTP v2.
  3. How does gasless work? → Account Abstraction + paymaster.
  4. Is OmniFlow audited? → Trail of Bits Q3 2026. Built on audited primitives.
  5. What tokens? → Any ERC-20. Auto cross-chain swap via LI.FI.
  6. How to integrate? → REST API + dashboard. CSV upload, webhooks.
  7. Pricing? → Per-transaction fee. Free during beta.
- **FAQPage JSON-LD** в `<head>` (уже есть)
- **Growing underline** на открытом вопросе

### 11. CTA
- **H2**: Stop copy-pasting wallet addresses.
- **Subtitle**: One API. Any chain. Any token. Gasless.
- **Mini cards** (2, визуальный callback к mid-CTA):
  - Pay-in: "Invoices, widgets, payment links"
  - Pay-out: "Batch payroll, bounties, grants"
- **CTA Primary**: "Start Your First Batch" (btn--rotating-border) + "Free during beta" sublabel
- **Subtle link**: Talk to Founders → (mailto: или Telegram)

### 12. Footer
- **Tagline**: The cross-chain payment engine for crypto teams.
- **Links**: Docs, GitHub, Twitter, ETHGlobal
- **Tech**: Built on ZeroDev + Circle CCTP v2 + LI.FI + Pimlico
- **Legal**: © 2026 OmniFlow · Terms · Privacy
- Subtle gradient top separator

---

## Implementation Priority

### Tier 1 — Высший импакт (делать первым)
| # | Задача | Файлы |
|---|--------|-------|
| 1 | Mid-page CTA (новая секция) | index.html, sections.css |
| 2 | Security: SVG diagram + blur reveal | index.html, sections.css, animations.js |
| 3 | Integrations: bidirectional marquee + partner cards | index.html, sections.css |

### Tier 2 — Метрики и доверие
| # | Задача | Файлы |
|---|--------|-------|
| 4 | Traction: Dune-style metrics + sparklines | index.html, sections.css |
| 5 | Team: fly-out effect + card polish | sections.css, animations.js |
| 6 | FAQ: staggered reveal + underlines | sections.css, animations.js |

### Tier 3 — Полировка
| # | Задача | Файлы |
|---|--------|-------|
| 7 | CTA: mini cards + sublabel | index.html, sections.css |
| 8 | Footer: separator | sections.css |
| 9 | Global: grain overlay, magnetic cursor, underlines | effects.css, interactions.js |
