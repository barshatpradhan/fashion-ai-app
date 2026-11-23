# REVIVO design system

Small on purpose: tokens in `app/globals.css`, shared primitives in `components/ui.module.css`, one `Badge`
and one `Button` component. Screen modules (`result`, `closet`, `looks`, `guide`, `story`, `nav`, `home`)
hold only what is specific to that screen.

## Tokens (`app/globals.css` `:root`)

| Group | Token | Value | Use |
|---|---|---|---|
| Colour | `--paper` / `--paper-raised` | #f5f3ee / #fbfaf7 | page / raised surfaces |
| | `--ink` / `--ink-soft` | #1c1b19 / #4a4741 | text, primary button / secondary text |
| | `--muted` | #66615a | captions, hints (5.5:1 on paper) |
| | `--ink-quiet` | #6f675b | hanger line art (5.0:1 on paper) |
| | `--line` | #e2ddd3 | borders, hairlines |
| | `--accent` / `--danger` | #7c6446 / #8c3b2e | badges, focus ring / errors, delete |
| | `--rail-light` / `--rail-dark` | #b9b0a2 / #8f8678 | closet rod |
| Type | `--text-xs` | 0.7rem | uppercase labels, badges, captions |
| | `--text-sm` | 0.85rem | hints, meta, nav |
| | `--text-ui` | 0.92rem | buttons, card body |
| | `--text-base` | 1rem | body |
| | `--text-md` | 1.25rem | card titles, prompts, feature values |
| | `--text-lg` | 1.6rem | section and detail headings |
| | `--text-xl` | clamp(1.8rem, 4vw, 2.6rem) | garment name |
| | `--text-display` | clamp(2rem, 5vw, 3.4rem) | page titles |
| | `--text-backdrop` | clamp(4.5rem, 19vw, 15rem) | faded fabric word behind the hero |
| | `--font-display` / `--font-body` / `--font-mono` | | serif headings / UI / Story receipt |
| Space | `--space-1` … `--space-8` | 4, 8, 12, 16, 24, 32, 48, 64 px | padding, gap, margin |
| Radius | `--radius-sm` / `--radius` / `--radius-pill` | 6px / 14px / 999px | inputs, thumbs / cards / pills |
| Shadow | `--shadow-1` / `--shadow-2` | | resting (rod) / lifted (framed photo, chosen piece) |
| | `--drop-1` / `--drop-2` | `filter` values | cut-out thumbnails / hero cut-out |
| Motion | `--dur-fast` / `--dur-base` / `--dur-slow` | 0.2s / 0.4s / 1.1s | hover / transitions / entrances, crossfade |
| | `--ease` | cubic-bezier(0.22, 0.61, 0.36, 1) | everything |

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
| `.button` | Primary ink pill, 48px tall | `:hover` lifts 1px; `:disabled` / `[aria-disabled]` 50% opacity; `.loading` busy ring |
| `.ghost` | With `.button`: outline on paper | same as `.button` |
| `.loading` | With `.button`: busy | Use `<Button loading>`: sets `aria-busy="true"` and `disabled`; keep a "…ing" label. Reduced motion stops the spin. |
| `.choice` / `.choicePrimary` / `.choices` | Small outline pill for answers and toggles, the suggested one, and their row | `:hover` ink border; `:disabled` 50% |
| `.chip` | Non-interactive pill: difficulty, tags, tools | none |
| `.card` (+ `.cardTitle`, `.cardBody`, `.sources`, `.grid`) | Raised card | none |
| `.status` (+ `.pulse`, `.statusInline`) | Live progress line, `role="status"` | pulse dot loops |
| `.error` | Page-level failure, `role="alert"` | none |
| `.note` | Inline failure under a control, `role="alert"` | none |

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
