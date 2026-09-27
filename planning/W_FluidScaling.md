# W_FluidScaling — Fluid Viewport Scaling

## Goal
The design baseline is **1920×1080** — the default Tauri window size. At this size root `font-size` is `16px`. All `rem`-based measurements scale proportionally via a single `clamp()` on `:root`. The maximum cap is `24px` — a 150% increase over the `16px` baseline — which covers 4K displays at common Windows DPI scaling settings.

This plan affects **CSS only** — no TypeScript changes, no Rust changes.

---

## DPI / resolution context

4K resolution (3840×2160) does not mean 4K CSS pixels. Windows DPI scaling converts physical pixels to logical (CSS) pixels:

| Display + scaling | CSS viewport |
|---|---|
| 1080p @ 100% | 1920×1080 — baseline |
| 1080p @ 125% | 1536×864 |
| 4K @ 200% (common 27") | 1920×1080 — same as baseline |
| 4K @ 150% | 2560×1440 |
| 4K @ 100% (rare) | 3840×2160 |

The 150% max cap (`24px`) kicks in at `24 / 0.00833 = 2880px` logical width — covering 4K at 150% scaling and beyond. A well-scaled 4K setup at 200% sees exactly the baseline `16px`.

---

## Strategy — viewport-relative root font size

```css
:root {
  font-size: clamp(13px, 0.833vw, 24px);
}
```

- `0.833vw` = `16 / 1920 × 100` — at 1920px wide this resolves to exactly `16px`
- `13px` minimum — legibility floor for narrow overlay variants (Mini-Pill, small Docked Sidebar)
- `24px` maximum — 150% of `16px`, prevents oversizing at 4K @ 150% scaling or wider

Remove `font-size: 14px` from `html, body` — the root clamp replaces it.

---

## What scales (rem) vs stays fixed (px)

| Property type | Unit | Reason |
|---|---|---|
| `font-size` on all elements | `rem` | Scales with root |
| `padding` / `gap` / `margin` on cards, panels, buttons | `rem` | Preserves layout proportions |
| Icon `width`/`height` inside cards and panels | `rem` | Icons grow with surrounding text |
| Button `height`, `padding` | `rem` | Touch targets scale |
| Onboarding left column width | `clamp()` in `px/%` | Structural grid column — tracked separately |
| Modal shell `width`/`height` | `min()` with `rem` | Scales but caps |
| `--titlebar-height` | `px` | Structural chrome — must not scale |
| `border-width` | `px` | Hairline borders stay crisp |
| `border-radius` | `px` | Subtle curves look fine fixed |
| `z-index` | unitless | Not a dimension |

All `px ÷ 16` to get `rem` values (16px = new root baseline).

---

## Conversion reference — Globals.css

```css
/* :root — add */
font-size: clamp(13px, 0.833vw, 24px);

/* html, body — remove */
font-size: 14px;  /* ← delete this line */
```

---

## Conversion reference — Titlebar.css

`--titlebar-height`, border widths, and `border-radius` stay `px`. Everything else:

| Property | px value | rem value |
|---|---|---|
| `.titlebar` padding | `0 8px 0 4px` | `0 0.5rem 0 0.25rem` |
| `.titlebar` gap | `8px` | `0.5rem` |
| `.titlebar__logo svg` width/height | `18px` | `1.125rem` |
| `.titlebar__menubar` gap | `2px` | `0.125rem` |
| `.titlebar__menu-btn` height | `22px` | `1.375rem` |
| `.titlebar__menu-btn` padding | `0 8px` | `0 0.5rem` |
| `.titlebar__menu-btn` font-size | `12px` | `0.75rem` |
| `.titlebar__dropdown` min-width | `160px` | `10rem` |
| `.titlebar__dropdown` padding | `4px` | `0.25rem` |
| `.titlebar__dropdown-item` height | `28px` | `1.75rem` |
| `.titlebar__dropdown-item` padding | `0 10px` | `0 0.625rem` |
| `.titlebar__dropdown-item` font-size | `12px` | `0.75rem` |
| `.titlebar__status` width/height | `8px` | `0.5rem` |
| `.titlebar__status` margin | `0 4px` | `0 0.25rem` |
| `.titlebar__icons` gap | `2px` | `0.125rem` |
| `.titlebar__icon-btn` width | `26px` | `1.625rem` |
| `.titlebar__icon-btn` height | `22px` | `1.375rem` |
| `.titlebar__icon-btn svg` width/height | `14px` | `0.875rem` |
| `.titlebar__controls` gap | `4px` | `0.25rem` |
| `.titlebar__btn` width | `28px` | `1.75rem` |
| `.titlebar__btn` height | `24px` | `1.5rem` |
| `.titlebar__btn svg` width/height | `14px` | `0.875rem` |

---

## Conversion reference — Onboarding.css

| Property | px value | rem value |
|---|---|---|
| `.onboarding__list` padding | `24px 16px` | `1.5rem 1rem` |
| `.onboarding__list` gap | `6px` | `0.375rem` |
| `.onboarding__list-heading` font-size | `10px` | `0.625rem` |
| `.onboarding__list-heading` margin-bottom | `4px` | `0.25rem` |
| `.onboarding__cards` gap | `4px` | `0.25rem` |
| `.onboarding__card` padding | `10px 12px` | `0.625rem 0.75rem` |
| `.onboarding__card-icon svg` width/height | `18px` | `1.125rem` |
| `.onboarding__card-label` font-size | `13px` | `0.8125rem` |
| `.onboarding__card-label` gap | `6px` | `0.375rem` |
| `.onboarding__card-badge` font-size | `9px` | `0.5625rem` |
| `.onboarding__card-badge` padding | `1px 4px` | `0.0625rem 0.25rem` |
| `.onboarding__card-desc` font-size | `11px` | `0.6875rem` |
| `.onboarding__card-desc` padding-left | `26px` | `1.625rem` |
| `.onboarding__card-action` margin-top | `6px` | `0.375rem` |
| `.onboarding__card-action` margin-left | `26px` | `1.625rem` |
| `.onboarding__card-action` padding | `4px 12px` | `0.25rem 0.75rem` |
| `.onboarding__card-action` font-size | `11px` | `0.6875rem` |
| `.onboarding__skip` margin-top | `8px` | `0.5rem` |
| `.onboarding__skip` font-size | `12px` | `0.75rem` |
| `.onboarding__skip` padding | `4px` | `0.25rem` |
| `.onboarding__info` padding | `40px 40px 32px` | `2.5rem 2.5rem 2rem` |
| `.onboarding__info-hero` gap | `16px` | `1rem` |
| `.onboarding__logo svg` width/height | `40px` | `2.5rem` |
| `.onboarding__heading` font-size | `22px` | `1.375rem` |
| `.onboarding__sub` font-size | `13px` | `0.8125rem` |
| `.onboarding__info-links` margin-top | `40px` | `2.5rem` |
| `.onboarding__info-links` gap | `4px` | `0.25rem` |
| `.onboarding__info-links-label` font-size | `10px` | `0.625rem` |
| `.onboarding__info-links-label` margin-bottom | `4px` | `0.25rem` |
| `.onboarding__info-link` padding | `5px 10px` | `0.3125rem 0.625rem` |
| `.onboarding__info-link` font-size | `12px` | `0.75rem` |

### Structural grid column (Onboarding)
The left card panel uses `clamp()` so it scales proportionally with larger windows without becoming a massive sidebar:
```css
/* was: grid-template-columns: 280px 1fr */
grid-template-columns: clamp(240px, 20%, 360px) 1fr;
```
At 1920px → `20% = 384px`, capped to `360px`. At 1080p fullscreen → `360px` left panel. At 4K 150% (2560px CSS) → `20% = 512px`, capped to `360px`. At narrow 600px window → `20% = 120px`, floored to `240px`.

---

## Conversion reference — SettingsModal.css (apply at creation time)

Author in `rem` from the start using `÷ 16`:

```css
.settings-modal__shell {
  width:  min(45rem, calc(100dvw - 3rem));    /* min(720px, 100dvw-48px) */
  height: min(32.5rem, calc(100dvh - 3rem));  /* min(520px, 100dvh-48px) */
  grid-template-columns: clamp(8.75rem, 22%, 11.25rem); /* clamp(140px,22%,180px) */
}

.settings-modal__nav { padding: 1.25rem 0.75rem; gap: 0.125rem; }
.settings-modal__nav-heading { font-size: 0.625rem; margin-bottom: 0.5rem; }
.settings-modal__tab { padding: 0.4375rem 0.5rem; font-size: 0.8125rem; }
.settings-modal__content { padding: 1.75rem 2rem; }
```

---

## Files to affect

| File | Change |
|---|---|
| `src/styles/Globals.css` | Add `font-size: clamp(13px, 0.833vw, 24px)` to `:root`; remove `font-size: 14px` from `html, body` |
| `src/styles/Titlebar.css` | Convert all non-structural px to rem per table above |
| `src/styles/Onboarding.css` | Convert all px to rem per table above; update grid column to `clamp()` |
| `src/styles/SettingsModal.css` | Author in rem from the start (not yet created) |

---

## Implementation steps

1. Add `font-size: clamp(13px, 0.833vw, 24px)` to `:root` in `Globals.css`; remove `font-size: 14px` from `html, body`
2. Convert `Titlebar.css` — replace all non-structural px with rem per table
3. Convert `Onboarding.css` — replace all px with rem per table; update grid column to `clamp(240px, 20%, 360px) 1fr`
4. Confirm `--titlebar-height` and all `border-width` / `border-radius` remain in `px`
