# Responsive Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every REVIVO screen to design system v3.1 (white, steel, 3D-ready) and make each one responsive. Mobile web is primary, then tablet and desktop, matching the REVIVO Responsive Wireframes canvas.

**Architecture:**
- **Tokens and fonts:** the restyle is CSS-first. New v3.1 tokens replace v1 values in `app/globals.css`, and the old token names stay as aliases so untouched modules keep working. Fonts load through `next/font/google`.
- **Shared layout:** shared layout primitives (columns, grids, panels) are added to `components/ui.module.css` with two viewport breakpoints.
- **Navigation:** it becomes a mobile header plus fixed bottom tab bar under 768px, and a top web nav from 768px.
- **Screens:** each screen then rearranges its existing markup into those primitives. Copy, roles and behaviour stay as they are.

**Tech Stack:** Next.js 15 App Router, React 19, CSS Modules, `next/font/google`, Vitest + Testing Library (jsdom).

**Spec:**
- **Layouts:** `docs/design/responsive-wireframes/`. It holds `wire.css` (exact layout rules and breakpoints), the seven screen files `Home/Scan/Result/Guide/Closet/Looks/Profile.dc.html` (markup to follow for structure), and `Main.dc.html` (breakpoint rules). These files are copied from the canvas at https://claude.ai/artifact/2onVMmu8K1WKY7fDi8dBEN.
- **Tokens and rules:** design system v3.1 at https://claude.ai/artifact/U2xmZ4izrv8GzaVYmzufV6. The values needed are copied below.
- **Domain rules:** `docs/superpowers/specs/2026-11-19-ai-circular-fashion-app-design.md` §6.6 still wins.

## Global Constraints

- **Breakpoints:**

  | Name | Viewport | Design width | Side margin | Columns |
  |---|---|---|---|---|
  | Mobile web (primary) | < 768px | 390 | 20px | 1 |
  | Tablet | 768–1199px | 834 | 32px | 2 where content pairs |
  | Desktop | ≥ 1200px | 1440 | centred | 2, sidebar 380px |

  Content max-width is 1200px. Write `@media (min-width: 768px)` and `@media (min-width: 1200px)`, mobile-first. (`wire.css` uses container queries only because the canvas needed them; the app uses media queries.)
- **Colours:**
  - `--white #FFFFFF`, `--surface-soft #F4F6F8`, `--surface-sunk #E8EDF1`;
  - `--slate #263645` (ink), `--deep #2E4E64` (focus/active), `--steel #5C7487`, `--mist #7792A7`, `--ice #D9E0E4` (hairlines);
  - `--signal #E8FF5A` (Concept badge fill only, slate text), `--ink-soft #3A4C5C`, `--muted #4A5D6C`, `--danger #A8321F`.
- **Type:**
  - display Oswald 600, uppercase;
  - body Inter 400/500/600;
  - mono JetBrains Mono 500, uppercase, 0.08em tracking, for eyebrows, badges, nav and tab labels;
  - titles 40px / 56px / 76px at mobile / tablet / desktop, line-height 0.95.
- **Shape and depth:**
  - radii 10 / 20 / 32 / 999px;
  - `--shadow-1: 0 1px 2px rgba(38,54,69,.06), 0 4px 12px rgba(38,54,69,.06)` and `--shadow-2: 0 2px 6px rgba(38,54,69,.06), 0 24px 48px -12px rgba(38,54,69,.22)`;
  - easing `--ease-smooth: cubic-bezier(0.16,1,0.3,1)` for movement.
- **Keep every visible string, role, accessible name, `aria-*` attribute and link target the current code has.** The existing tests assert them and must keep passing unchanged, unless a task says otherwise. Wireframe copy is used only for new decorative or section elements a task names.
- **No new data or API calls,** and no changes under `lib/`, `app/api/` or `supabase/`.
- **Honesty rules stay:**
  - every Concept Image keeps its Concept badge;
  - nothing links to a shop;
  - the only price shown is the existing Premium upgrade label.
- **Accessibility:**
  - touch targets ≥ 44px on mobile;
  - visible focus (2px `--deep` outline, 3px offset);
  - text ≥ 4.5:1 (no `--steel` for body text under 18px, no `--mist` text);
  - `prefers-reduced-motion` turns off every new animation.
- **Light only** (projector): keep `color-scheme: light`.
- **No horizontal page scroll at 320px wide.**

## Review Focus

1. **320px-wide phones:** long garment names, mono read-outs and the five tab labels must wrap or shrink, never scroll the page sideways (Task 9 check).
2. **Fixed bottom tab bar:** it must never cover the last control on a mobile page: Closet's "Hang it on the rail", Looks' "Save look", the Profile switch (Task 2 test + Task 9 check).
3. **Active tab on nested routes:** `/guide/<scan>/<recipe>` marks **Scan**, and `/` marks **Home** only on the exact path (Task 2 test).
4. **Very long titles in 4-across recipe cards and closet names:** they wrap inside their card and never overflow (Task 9 check).
5. **Reduced motion:** the Home turntable and the Guide flip do not animate (Task 3 and 5 tests assert the reduced-motion CSS hook; Task 9 check).

---

### Task 1: Tokens, fonts and layout primitives

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`, `components/ui.module.css`, `docs/DESIGN-SYSTEM.md`
- Test: `tests/ui/layoutPrimitives.test.ts`

**Interfaces:**
- Produces:
  - **CSS variables** (globals): every Global Constraints colour token, plus legacy aliases `--paper:#FFFFFF`, `--paper-raised:#F4F6F8`, `--ink:#263645`, `--line:#D9E0E4`, `--accent:#2E4E64`, `--ink-quiet:#4A5D6C`, `--rail-light:#D9E0E4`, `--rail-dark:#7792A7`;
  - **font variables:** `--font-display`, `--font-body`, `--font-mono` (from `next/font` CSS variables);
  - **radii and shadows:** `--radius-sm:10px`, `--radius:20px`, `--radius-lg:32px`, `--shadow-1/2` as above, `--shadow-floor: 0 30px 40px -24px rgba(38,54,69,.35)`;
  - **motion:** `--ease-smooth`, `--dur-base:.6s`, `--dur-slow:1.2s`;
  - **title sizes:** `--text-display`, now 40px / 56px / 76px via media queries;
  - **new `ui.module.css` classes:** `page` (max-width 1200, padding 24px 20px 40px, then 40px 32px 64px at ≥768, then 56px 0 96px at ≥1200), `head`, `headRow`, `cols`, `col`, `colSide`, `colWide`, `grid`, `grid2`, `grid3`, `grid4`, `panel`, `imgSlot`. Their behaviour follows `wire.css` `.rv-head/.rv-headrow/.rv-cols/.rv-col(.side/.wide)/.rv-grid(.g2/.g3/.g4)/.rv-panel/.rv-img`.
  - **restyled existing classes:**
    - `button` is a 48px slate pill; `ghost` is white with an inset ice hairline;
    - `choices`/`choice`/`choicePrimary` become the segmented track (`wire.css` `.rv-seg`);
    - `badge*`: Concept is a lime fill; Premium is a slate fill with white text;
    - `card`;
    - `eyebrow` and `hint` are mono;
    - `title` and `sectionTitle` are Oswald uppercase;
    - `error`;
    - `status`/`pulse`.

  Every existing class name stays exported.

- [ ] **Step 1: Write the failing test** `tests/ui/layoutPrimitives.test.ts`. It reads the CSS files as text with `fs` (no DOM):
  - `ui.module.css` defines `.cols`, `.colSide`, `.colWide`, `.grid2`, `.grid3`, `.grid4`, `.panel`, `.headRow`, `.imgSlot`;
  - it contains `@media (min-width: 768px)` and `@media (min-width: 1200px)`;
  - `globals.css` contains `--slate: #263645`, `--signal: #E8FF5A` and `--paper: #FFFFFF`, and still contains `color-scheme: light`;
  - `globals.css` has a `prefers-reduced-motion` block.
- [ ] **Step 2:** Run `npx vitest run tests/ui/layoutPrimitives.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Fonts:** in `app/layout.tsx`, load `Oswald({ subsets:['latin'], weight:['500','600'], variable:'--font-oswald' })`, `Inter({ subsets:['latin'], variable:'--font-inter' })` and `JetBrains_Mono({ subsets:['latin'], weight:'500', variable:'--font-jbmono' })`. Put the three variable classes on `<html>`. In `globals.css`, set `--font-display: var(--font-oswald), 'Arial Narrow', sans-serif` (and likewise for the other two), and `html { -webkit-font-smoothing: antialiased }`.
  - **Docs:** update `docs/DESIGN-SYSTEM.md` with a v3.1 tokens table and the breakpoint table from Global Constraints.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit && npm run build`. Expected: all tests pass, the build succeeds.
- [ ] **Step 5:** Commit: `style: v3.1 tokens, fonts and responsive layout primitives`.

### Task 2: Responsive navigation

**Files:**
- Create: `components/Logo.tsx`
- Modify: `components/SiteNav.tsx`, `components/nav.module.css`, `app/layout.tsx`, `app/globals.css` (body bottom padding)
- Test: `tests/components/SiteNav.test.tsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces:
  - `export function Logo(props: { size?: number }): JSX.Element` draws the REVIV wordmark plus the loop SVG (paths in `wire.css`'s source boards: `M85.91 47.49 A36 36 0 1 1 64.64 17.11`, stroke 12; arrowhead `M69.11 7.06 L78.34 23.21 L60.17 27.16 Z`; dot circle 82.89/35.36 r 6.5 in `--steel`).
  - `SiteNav` (`'use client'`, `usePathname`) renders:
    - `<header>` with the logo link (mobile, < 768);
    - `<nav aria-label="Main">` top nav with 5 links and a "Scan a garment" button link (≥ 768);
    - `<nav aria-label="Tabs">` fixed bottom tab bar with 5 icon + label links (< 768).
  - `export function activeTab(pathname: string): '/' | '/scan' | '/closet' | '/looks' | '/profile' | null` in `components/SiteNav.tsx`.

- [ ] **Step 1: Write failing tests** (mock `next/navigation` `usePathname` and `next/link` as `tests/ui/Home.test.tsx` does):
  - `activeTab('/')` → `'/'`; `activeTab('/guide/s1/r1')` → `'/scan'`; `activeTab('/closet')` → `'/closet'`; `activeTab('/unknown')` → `null`.
  - With pathname `/looks`, both navs render links named Home, Scan, Closet, Looks and Profile. In each nav only the Looks link has `aria-current="page"`.
  - The logo link has `href="/"` and accessible name "REVIVO home".
  - `globals.css` text contains `padding-bottom: calc(68px + env(safe-area-inset-bottom` inside the `max-width: 767px` media block (Review Focus 2).
- [ ] **Step 2:** Run `npx vitest run tests/components/SiteNav.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Sizes:** header 56px; top nav 72px (sticky); tab bar 68px plus `env(safe-area-inset-bottom)`.
  - **Visibility:** at ≥ 768 the header and tab bar are hidden and the top nav shows; below 768 the top nav is hidden.
  - **Tab icons:** 22px inline stroke SVGs (the paths in `docs/design/responsive-wireframes/Home.dc.html`), `aria-hidden`.
  - **Body padding:** on mobile `body` gets the bottom padding above so the fixed bar never covers content.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(nav): mobile tab bar and web top nav`.

### Task 3: Home

**Files:**
- Modify: `app/page.tsx`, `components/home.module.css`
- Test: `tests/ui/Home.test.tsx`

**Interfaces:**
- Consumes: `ui.cols/col/colWide/grid3/panel/imgSlot` (Task 1).

- [ ] **Step 1: Extend the test.**
  - A section labelled "How it works" holds 3 `h3` headings: "Scan", "Learn" and "Remake".
  - The existing assertions stay.
  - `home.module.css` text contains `prefers-reduced-motion` with `animation: none` for `.turntable`.
- [ ] **Step 2:** Run `npx vitest run tests/ui/Home.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the layout from `docs/design/responsive-wireframes/Home.dc.html`.
  - **Text column:** eyebrow, the existing h1 and lede, and the three existing links as buttons.
  - **Stage column:** a decorative `aria-hidden` stage with an inline SVG garment (a shirt silhouette) on a `.turntable` swinging rotateY ±28° over 7s `ease-in-out` alternate, with perspective 1400px and a `--shadow-floor` contact shadow.
  - **How it works:** a `grid3` section with the copy from the wireframe.
  - No stats row: it would need closet data the home page doesn't load.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `style(home): responsive hero, turntable and how-it-works`.

### Task 4: Scan and Result

**Files:**
- Modify: `app/scan/page.tsx`, `components/ResultView.tsx`, `components/result.module.css`, `components/HeroGarment.tsx` (class names only)
- Test: `tests/ui/ResultView.test.tsx` (unchanged; must pass)

- [ ] **Step 1: Add a test** `tests/ui/resultLayout.test.ts`. It reads `components/ResultView.tsx` and `app/scan/page.tsx` as text (CSS modules are not processed in Vitest, so class names cannot be asserted from the DOM):
  - `ResultView.tsx` contains `ui.grid4` and `ui.colWide`;
  - `scan/page.tsx` contains `ui.colSide`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement**, following `Scan.dc.html` and `Result.dc.html`.
  - **Scan page:** a `colSide` intro/tips column and a `colWide` upload column. The upload area becomes a dashed `imgSlot`-style panel; the existing file input, label, status and error stay.
  - **ResultView:** the HeroGarment column and the `colWide` details column (name, Add to closet, the edit control, fabric/style questions, history with sources). Below them, the recipes section is a full-width `grid4`.
  - **Rules:** keep the free card's "Open the free guide" link, the locked cards' `article` names and the existing upgrade button text.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `style(scan): responsive scan and result layouts`.

### Task 5: Guide with 3D flip

**Files:**
- Modify: `app/guide/[scanId]/[recipeId]/page.tsx`, `components/guide.module.css`
- Test: `tests/ui/guideLayout.test.ts`

- [ ] **Step 1: Write a failing test** (CSS text plus a render of the stage markup is not needed):
  - `guide.module.css` contains `backface-visibility: hidden`, `rotateY(180deg)`, and a `prefers-reduced-motion` block setting `transition: none` on `.flip`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement**, following `Guide.dc.html`.
  - **Layout:** the back link, eyebrow and title sit full width. Below them, `cols`: the left column holds the before/after stage, the existing "Before or after" toggle group and the Story card; the right column holds steps, tools, sources and I made this.
  - **Flip:** the before/after stage becomes a card with the original photo on the front face and the Concept image on the back. Toggling "After" adds `.flipped` (rotateY 180° over 1.2s `ease-smooth`).
  - **Labels:** the Concept badge stays on the back face; the existing Before/Concept badge logic is unchanged.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `style(guide): responsive guide with 3D before/after flip`.

### Task 6: Closet

**Files:**
- Modify: `app/closet/page.tsx`, `components/closet.module.css`, `components/ClosetRail.tsx` (classes only)
- Test: `tests/components/ClosetRail.test.tsx` (unchanged; must pass), `tests/ui/closetFilter.test.tsx`

**Interfaces:**
- Produces: `export function filterGarments<T extends { category: 'clothing' | 'accessory' }>(items: T[], f: 'all' | 'clothing' | 'accessory'): T[]` in `lib/ui/closet.ts`. This one pure helper is allowed under `lib/ui/`.

- [ ] **Step 1: Write a failing test** `tests/ui/closetFilter.test.tsx`: `filterGarments` returns all items for `'all'`, only clothing for `'clothing'`, and only accessories for `'accessory'`, keeping order.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement**, following `Closet.dc.html`.
  - **Header row:** the title and a filter segmented control (All / Clothing / Accessories, `aria-pressed`, `role="group" aria-label="Filter"`). The control filters the rail with `filterGarments`; no new fetch.
  - **Columns:** `cols` with a `colWide` (rail on a soft `panel`, piece detail, "Given a second life") and a `colSide` (the existing add form, allowance line, no-uploads message).
  - **ClosetRail:** restyle with white plates, soft shadows and ice rod. Its behaviour and test stay unchanged.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `style(closet): responsive closet with filter`.

### Task 7: Looks

**Files:**
- Modify: `app/looks/page.tsx`, `components/looks.module.css`, `components/LooksCarousel.tsx` (classes only)
- Test: existing tests must pass; `tests/ui/looksLayout.test.ts`

- [ ] **Step 1: Write a failing test:** `looks.module.css` contains a `.stage` rule with `border-radius: var(--radius-lg)` and `background: var(--surface-soft)`, plus a `@media (min-width: 768px)` block.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement**, following `Looks.dc.html`.
  - **Request row:** the header, then the occasion form as a row (input wide, Style me button) from 768px.
  - **Columns:** `cols` with a `colWide` (the LooksCarousel on a soft rounded stage, keeping its depth-line spring) and a `colSide` (the front Look's name and reason card, its pieces, the existing save button).
  - **No avatar UI:** that is the next round.
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `style(looks): responsive looks layout`.

### Task 8: Profile

**Files:**
- Modify: `app/profile/page.tsx`, `components/closet.module.css` (only the classes Profile uses), or a new `components/profile.module.css`
- Test: `tests/ui/profile.test.ts` (unchanged; must pass)

- [ ] **Step 1: Add a failing assertion** in a new `tests/ui/profileLayout.test.ts`: read `app/profile/page.tsx` as text and expect it to contain `ui.grid2` and `ui.panel`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement**, following `Profile.dc.html` without the avatar card.
  - **Header:** eyebrow and title.
  - **Grid:** a `grid2` holding the plan `panel` (status text, counters, upgrade button), the presenter switch `panel` (demo only, unchanged logic) and the activity record list (rows with mono kind and date).
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit: `style(profile): responsive profile`.

### Task 9: Cross-device check (controller)

**Files:** none unless a fix is needed.

- [ ] **Step 1:** Start the dev server (`npm run dev`) and open `/`, `/scan`, `/closet`, `/looks` and `/profile` in the browser pane at 320, 390, 834 and 1440 wide. A guide or result page needs Supabase keys and is checked only if `.env.local` is present.
- [ ] **Step 2:** Confirm Review Focus 1–5:
  - no horizontal scroll at 320;
  - the last control on each page is not covered by the tab bar;
  - the active tab is correct;
  - long titles wrap;
  - with reduced motion emulated (CSS media), the turntable is still.
- [ ] **Step 3:** Any fix is a targeted CSS change. Run `npx vitest run`, then commit: `fix(ui): responsive polish`.

## Rulings made while planning

- **Ruling: media queries in the app.**
  - What: the app uses `@media (min-width: 768px)` and `@media (min-width: 1200px)`, not container queries.
  - Why: the app's pages own the viewport; container queries were only needed for the canvas boards.
  - Cost if wrong: components reused inside narrow panels would not adapt.
- **Ruling: no stats row on Home.**
  - What: Home shows a decorative SVG turntable and no closet stats.
  - Why: Home is static and doesn't load closet data; invented numbers break the no-fake-data rule.
  - Cost if wrong: one fetch to add later.
- **Ruling: closet filter is client-side only.**
  - What: the filter uses a pure helper and no API change.
  - Why: the closet list is already loaded.
  - Cost if wrong: none for a demo-sized closet.
- **Ruling: the avatar card and runway avatar UI wait for the avatar round.**
  - Why: the user chose "restyle first, avatar next".
- **Ruling: legacy token names stay as aliases with v3.1 values.**
  - Why: it keeps untouched modules consistent without a rename sweep.
  - Cost if wrong: a later cleanup pass.
