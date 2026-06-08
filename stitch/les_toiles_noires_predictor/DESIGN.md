---
name: Les Toiles Noires Predictor
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#37393a'
  surface-container-lowest: '#0c0f0f'
  surface-container-low: '#1a1c1c'
  surface-container: '#1e2020'
  surface-container-high: '#282a2b'
  surface-container-highest: '#333535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#c4c6ce'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#2f3131'
  outline: '#8e9098'
  outline-variant: '#44474d'
  surface-tint: '#b5c7ea'
  primary: '#b5c7ea'
  on-primary: '#1f314d'
  primary-container: '#0b1f3a'
  on-primary-container: '#7587a7'
  inverse-primary: '#4d5f7d'
  secondary: '#b6c4ff'
  on-secondary: '#002780'
  secondary-container: '#0356ff'
  on-secondary-container: '#e4e7ff'
  tertiary: '#e9c400'
  on-tertiary: '#3a3000'
  tertiary-container: '#c9a900'
  on-tertiary-container: '#4c3f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#b5c7ea'
  on-primary-fixed: '#071c36'
  on-primary-fixed-variant: '#364764'
  secondary-fixed: '#dce1ff'
  secondary-fixed-dim: '#b6c4ff'
  on-secondary-fixed: '#001551'
  on-secondary-fixed-variant: '#0039b3'
  tertiary-fixed: '#ffe16d'
  tertiary-fixed-dim: '#e9c400'
  on-tertiary-fixed: '#221b00'
  on-tertiary-fixed-variant: '#544600'
  background: '#121414'
  on-background: '#e2e2e2'
  surface-variant: '#333535'
typography:
  display-hero:
    fontFamily: Anybody
    fontSize: 72px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Anybody
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Anybody
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  score-display:
    fontFamily: Anybody
    fontSize: 56px
    fontWeight: '900'
    lineHeight: '1'
    letterSpacing: 0.02em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.05em
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.1em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  container-max: 1440px
---

## Brand & Style

The brand personality is high-octane, elite, and cinematic. It targets serious sports enthusiasts and "bet-architects" who demand data-rich environments without sacrificing visual excitement. The UI should evoke the adrenaline of a live stadium broadcast mixed with the sophisticated precision of a premium video game dashboard.

The design style is **Cinematic Gaming/Glassmorphism**. It utilizes deep, multi-layered backgrounds with frosted-glass surfaces to maintain legibility over dynamic content. Neon accents in the colors of the French flag provide "active" energy, while gold is reserved for premium achievements and winning states. Movement is essential; the UI should feel alive with subtle glows, scanning lines, and micro-interactions that mimic high-end sports broadcast graphics.

## Colors

The palette is anchored in a deep **Midnight Blue (#0B1F3A)** which serves as the canvas, providing a low-light environment where other colors can "pop." 

- **France Blue (#0055FF):** Used for primary actions, active neon glows, and selection states.
- **Gold (#FFD700):** Reserved exclusively for "Premium" features, winning odds, and VIP status indicators.
- **Red (#E53935):** Used for live indicators, high-alert signals, and losing trends.
- **White (#FFFFFF):** Used for high-contrast data points and headlines to ensure maximum legibility against the dark background.

Apply a subtle radial gradient to the background, transitioning from the center (#162E4E) to the edges (#0B1F3A) to create a sense of depth and focus.

## Typography

Typography is used as a structural element. **Anybody** provides the aggressive, variable-width impact needed for scores and big headlines, reminiscent of modern sports broadcasts. 

**Hanken Grotesk** is the workhorse for all UI elements and body copy, offering a clean, technical look that balances the expressive nature of the headlines. For technical data, odds, and timestamps, **JetBrains Mono** is used to provide a "terminal" or "system-calculated" feel, reinforcing the predictor aspect of the platform.

For TV displays, increase the tracking on all uppercase labels and ensure the `score-display` role is used for maximum visibility at a distance.

## Layout & Spacing

The system uses a **Fluid 12-Column Grid** for desktop and a **4-Column Grid** for mobile. Because this app is designed for both mobile and TV, the spacing rhythm is strictly based on a 8px baseline.

- **Safe Zones:** On TV displays, maintain a 10% margin on all sides to avoid overscan issues and ensure focus-state visibility.
- **Vertical Rhythm:** Use larger gaps (48px+) between distinct betting markets or sport categories to prevent visual clutter.
- **Density:** Mobile layouts should use compact cards (8px padding), while TV and Desktop layouts should expand padding to 24px-32px to allow the glassmorphic background blurs to be more effective.

## Elevation & Depth

Depth is achieved through **Glassmorphism** rather than traditional shadows. 

1.  **Base Layer:** The solid Midnight Blue background.
2.  **Surface Layer:** Cards and containers use a semi-transparent fill (`rgba(255, 255, 255, 0.05)`) with a `backdrop-filter: blur(20px)`.
3.  **Border Layer:** Every card must have a 1px solid border at `rgba(255, 255, 255, 0.1)` to define the edges against the dark background.
4.  **Accent Elevation:** Active or selected items receive an outer glow using the France Blue (#0055FF) with a 15px spread at 30% opacity, simulating a neon tube.

Avoid using black shadows; instead, use darker tinted shadows (e.g., `#050D18`) for elements that need to appear physically "stacked" above the glass.

## Shapes

The shape language is "Aggressive Modern." Standard containers use the **Rounded** (0.5rem) setting to maintain a high-end feel, but specific interaction elements like "Live" badges or "Place Bet" buttons should use **Pill-shaped** (rounded-full) geometry to stand out.

Use diagonal "clipped corners" on 1px borders for decorative elements to mimic video game HUDs. When a card is focused (especially on TV), the border weight should increase to 2px with a neon gradient stroke.

## Components

### Buttons & Interaction
- **Primary Bet Button:** Solid France Blue with a subtle inner glow. On hover/focus, the button should expand slightly (1.05x scale) and pulse with a white outer glow.
- **Secondary/Odds Buttons:** Transparent with a 1px white border. The text inside uses Gold (#FFD700) for the odds value.

### Cards (The "Glass" System)
- **Market Cards:** Utilize the frosted glass effect. Include a "Neon Header" (a 2px top border in Blue or Red) to categorize live vs. upcoming events.
- **Odds Cards:** High-contrast containers with JetBrains Mono text. When odds shift, the background should flash green (up) or red (down) momentarily.

### Inputs & Selection
- **Bet Slips:** Floating glass panels that slide in from the right (Desktop) or bottom (Mobile). Use high-contrast inputs with #FFFFFF text and France Blue focus states.
- **Checkboxes/Radios:** Custom circular icons that fill with a neon blue dot when selected.

### Data Visualization
- **Predictor Graphs:** Use glowing neon lines with a gradient fill beneath the line. Avoid solid fills; use 20% opacity gradients to maintain the glassmorphic aesthetic.
- **Live Badges:** A pulsing Red (#E53935) dot next to a white "LIVE" label in `label-caps` typography.