# REVIVO design system

Small on purpose: tokens in `app/globals.css`, shared primitives in `components/ui.module.css`, one `Badge`
and one `Button` component. Screen modules (`result`, `closet`, `looks`, `guide`, `story`, `nav`, `home`)
hold only what is specific to that screen.

## Tokens, v3.1 (`app/globals.css` `:root`)

| Group | Token | Value | Use |
|---|---|---|---|
| Colour | `--white` / `--surface-soft` / `--surface-sunk` | #FFFFFF / #F4F6F8 / #E8EDF1 | page / soft panels, segmented track / sunk wells |
| | `--slate` | #263645 | ink: text, primary button |
| | `--deep` | #2E4E64 | focus ring (2px, 3px offset), active |
| | `--steel` / `--mist` | #5C7487 / #7792A7 | large or decorative only; never body text under 18px |
| | `--ice` | #D9E0E4 | hairlines |
| | `--signal` | #E8FF5A | Concept badge fill only, slate text |
| | `--ink-soft` / `--muted` | #3A4C5C / #4A5D6C | secondary text / captions, hints |
| | `--danger` | #A8321F | errors, delete |
| Legacy aliases | `--paper` `--paper-raised` `--ink` `--line` `--accent` `--ink-quiet` `--rail-light` `--rail-dark` | #FFFFFF #F4F6F8 #263645 #D9E0E4 #2E4E64 #4A5D6C #D9E0E4 #7792A7 | older modules; new code uses the v3.1 names |
| Type | `--font-display` | Oswald 500/600, uppercase | titles, card titles |
| | `--font-body` | Inter | UI and body |
| | `--font-mono` | JetBrains Mono 500, uppercase, 0.08em | eyebrows, badges, nav and tab labels |
| | `--text-display` | 40px / 56px / 76px | page titles, line-height 0.95 (mobile / tablet / desktop) |
| | `--text-xs` `--text-sm` `--text-ui` `--text-base` `--text-md` `--text-lg` `--text-xl` `--text-backdrop` | unchanged | see `globals.css` |
| Space | `--space-1` ... `--space-8` | 4, 8, 12, 16, 24, 32, 48, 64 px | padding, gap, margin |
| Radius | `--radius-sm` / `--radius` / `--radius-lg` / `--radius-pill` | 10 / 20 / 32 / 999px | inputs / cards, panels / stages / pills |
| Shadow | `--shadow-1` / `--shadow-2` | `0 1px 2px` + `0 4px 12px` / `0 2px 6px` + `0 24px 48px -12px` | resting / lifted |
| | `--shadow-floor` | `0 30px 40px -24px rgba(38,54,69,.35)` | contact shadow under a garment |
| | `--drop-1` / `--drop-2` | `filter` values | cut-out thumbnails / hero cut-out |
| Motion | `--ease-smooth` (alias `--ease`) | cubic-bezier(0.16, 1, 0.3, 1) | movement |
| | `--dur-fast` / `--dur-base` / `--dur-slow` | 0.2s / 0.6s / 1.2s | hover / transitions / entrances |

Fonts load in `app/layout.tsx`: Oswald is self-hosted via `next/font/local` (`app/fonts`), Inter and JetBrains Mono via `next/font/google`; the variable classes sit on `<html>` and keep
fallback stacks. The app is light only (`color-scheme: light`).

### Breakpoints

Mobile first. Write `@media (min-width: 768px)` and `@media (min-width: 1200px)`, never container queries.
Content max-width is 1200px.

| Name | Viewport | Design width | Side margin | Columns |
|---|---|---|---|---|
| Mobile web (primary) | < 768px | 390 | 20px | 1 |
| Tablet | 768-1199px | 834 | 32px | 2 where content pairs |
| Desktop | >= 1200px | 1440 | centred | 2, sidebar 380px |

Local, named timings (not tokens): `--dur-pulse` 1.6s (status dot), `--dur-backdrop` 1.4s and
`--dur-drift` 9s (hero), and the 0.12s / 0.24s entrance stagger.

## Badge (`components/Badge.tsx`)

`<Badge variant="…" />`. Position it with a local class via `className`; never restyle its look.

| Variant | Label | When |
|---|---|---|
| `concept` | Concept (fixed) | Any AI concept image: rail tile, closet detail, Looks stage and piece list, guide stage, Story card |
| `premium` | lock + Premium (fixed) | A Premium Recipe card shown to a free user |
| `reworked` | Reworked (fixed) | A piece the user remade |
| `accessory` | Accessory (fixed) | An accessory on the rail (not shown when Reworked) |
| `allowance` | children | The uploads / looks counter; render `as="p"` with `aria-live="polite"` |
| `neutral` | children | A plain state label, e.g. "Before" on the guide stage |

## Primitives (`components/ui.module.css`)

| Class | What | States |
|---|---|---|
| `.button` | Primary slate pill, 48px tall | `:hover` lifts 1px; `:disabled` / `[aria-disabled]` 50% opacity; `.loading` busy ring |
| `.ghost` | With `.button`: white with an inset ice hairline | same as `.button` |
| `.loading` | With `.button`: busy | Use `<Button loading>`: sets `aria-busy="true"` and `disabled`; keep a "…ing" label. Reduced motion stops the spin. |
| `.choice` / `.choicePrimary` / `.choices` | Ghost pill for answers and toggles (slate fill when `.choicePrimary` or `aria-pressed`), and a plain wrapping row for them | `:hover` mist hairline; `:disabled` 50% |
| `.seg` | Segmented track: wrap `.choice` buttons; each is a flat segment, the selected one is raised and white | same as `.choice` |
| `.chip` | Non-interactive pill: difficulty, tags, tools | none |
| `.card` (+ `.cardTitle`, `.cardBody`, `.sources`, `.grid`) | Raised card | none |
| `.status` (+ `.pulse`, `.statusInline`) | Live progress line, `role="status"` | pulse dot loops |
| `.error` | Page-level failure, `role="alert"` | none |
| `.note` | Inline failure under a control, `role="alert"` | none |

Layout primitives: `.page` (max 1200, padding 24/20, 40/32 tablet; desktop max 1264 with 32px side padding), `.head`, `.headRow`
(row from tablet), `.cols` with `.col` / `.colSide` (300px, 380px desktop) / `.colWide`, `.grid` (1 column;
auto-fill 260px from tablet), `.grid2` / `.grid3` / `.grid4` (2 from tablet; 3 and 4 from desktop), `.panel`
(soft block), `.imgSlot` (dashed picture frame).

Also shared: page shell (`.page`, `.brand`, `.eyebrow`, `.title`, `.lede`, `.section`, `.sectionTitle`),
`.hint` / `.hintWide`, `.empty`, `.visuallyHidden`.

A screen module that overrides a primitive composes it (`composes: card from './ui.module.css'`). That keeps
`ui.module.css` ahead of the screen module in the CSS bundle, so the override always wins.

## Rules

1. Use tokens. No hex in `*.module.css` (data-driven colours, like swatch fills, stay inline). Font sizes,
   spacing, radii, shadows and durations come from tokens. Documented exceptions: 2px optical gaps, the
   1.2em list indent in guide steps, the swatch dot's inset shadow, the entrance stagger, and geometry
   (widths, heights, positional offsets, transforms).
2. A Concept Image always carries a visible "Concept" label (`<Badge variant="concept" />`). It is never
   visually hidden, and on the Story card it sits inside the captured node.
3. Light only. `color-scheme: light` is intentional: the demo runs on a projector.
4. Respect `prefers-reduced-motion`: the global rule in `globals.css` already shortens animations; do not
   override it.
