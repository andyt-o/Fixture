---
name: ui-scaling
description: Use when the user wants to apply, adjust, or reason about fluid UI scaling — covers root font-size clamp, rem conversion, structural px exceptions, container clamps, and DPI/resolution context for Tauri overlay windows.
---

# UI Scaling — Fixture Design System

This skill governs how all sizing values are authored and scaled across the Fixture codebase. Follow every rule here whenever adding, editing, or reviewing CSS sizing in any component.

---

## Baseline

| Parameter | Value |
|---|---|
| Design baseline window | 1920×1080 px |
| Root `font-size` at baseline | `16px` |
| Fluid coefficient | `0.833vw` (`16 ÷ 1920 × 100`) |
| Minimum cap | `13px` — legibility floor for Mini-Pill / narrow variants |
| Maximum cap | `24px` — 150% of `16px`, covers 4K at 150% Windows DPI scaling |

The single root clamp in `Globals.css`:
```css
:root {
  font-size: clamp(13px, 0.833vw, 24px);
}
```

Do **not** set `font-size` on `html` or `body` — the `:root` clamp is the only declaration.

---

## DPI / logical pixel context

4K resolution is not 4K CSS pixels. Windows DPI scaling converts physical to logical pixels:

| Display + scaling | CSS viewport width |
|---|---|
| 1080p @ 100% | 1920px — baseline |
| 1080p @ 125% | 1536px |
| 4K @ 200% (common 27" monitor) | 1920px — identical to baseline |
| 4K @ 150% | 2560px |
| 4K @ 100% (rare) | 3840px |

At 2880px CSS width, `0.833vw` = `24px` — the cap is hit. Everything beyond 2880px renders identically. A 4K monitor at 200% scaling always shows the baseline `16px`.

---

## rem conversion rule

All text, spacing, icon, and button sizing must be in `rem`. Divide the intended `px` value by `16`:

```
rem = px ÷ 16
```

Common values:

| px | rem |
|---|---|
| 8 | 0.5rem |
| 10 | 0.625rem |
| 11 | 0.6875rem |
| 12 | 0.75rem |
| 13 | 0.8125rem |
| 14 | 0.875rem |
| 16 | 1rem |
| 18 | 1.125rem |
| 20 | 1.25rem |
| 22 | 1.375rem |
| 24 | 1.5rem |
| 26 | 1.625rem |
| 28 | 1.75rem |
| 32 | 2rem |
| 40 | 2.5rem |

---

## What scales (rem) vs stays fixed (px)

| Property | Unit | Reason |
|---|---|---|
| `font-size` on any element | `rem` | Inherits root clamp |
| `padding`, `gap`, `margin` on cards, panels, buttons | `rem` | Proportional spacing |
| Icon `width` / `height` | `rem` | Icons scale with surrounding text |
| Button `height`, `padding` | `rem` | Touch targets scale |
| `--titlebar-height` | `px` | Structural chrome — never scales |
| `border-width` | `px` | Hairline borders stay crisp at all sizes |
| `border-radius` | `px` | Subtle curves are fine fixed |
| `z-index` | unitless | Not a dimension |
| `max-width` content caps | `px` | Absolute layout bound, not a text size |
| Structural `clamp()` bounds | `px` | Floor/ceiling values, not scaled units |

---

## Structural container sizing

Fluid containers use `clamp()` with `px` floor/ceiling and a `%` middle value. Do not use fixed `px` for column widths or modal shell dimensions.

### Onboarding left column
```css
grid-template-columns: clamp(240px, 20%, 360px) 1fr;
```
At 1920px → `20% = 384px`, capped to `360px`. At 600px → `20% = 120px`, floored to `240px`.

### Modal shell
```css
width:  min(45rem, calc(100dvw - 3rem));
height: min(32.5rem, calc(100dvh - 3rem));
grid-template-columns: clamp(8.75rem, 22%, 11.25rem) 1fr;
```
Use `dvw`/`dvh` (dynamic viewport units) — they update when browser chrome shows/hides, important in Tauri's WebView2 context.

### General pattern for any new panel or modal
```css
width:  min(<design-width-in-rem>, calc(100dvw - <gutter-rem>));
height: min(<design-height-in-rem>, calc(100dvh - <gutter-rem>));
```
Standard gutter is `3rem` (48px at baseline). Minimum gutter is `1.5rem` for compact overlays.

---

## Adding a new component — checklist

1. Author all font sizes, padding, gap, margin, and icon sizes in `rem` using the `÷ 16` rule.
2. Use `px` only for: `border-width`, `border-radius`, `--titlebar-height`, structural `clamp()` bounds, and absolute layout caps (`max-width`).
3. If the component has a fixed-width column or panel, use `clamp(floor, %, ceiling)` — never a bare `px` width.
4. If the component is a modal or overlay shell, use `min(rem-cap, calc(100dvw - gutter))` for both `width` and `height`.
5. Do not add a `font-size` to `html` or `body` — the `:root` clamp is the single source of truth.
6. Do not use `vw`/`vh` directly on any property other than the `:root font-size` fluid coefficient.
