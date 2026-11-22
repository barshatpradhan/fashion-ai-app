# REVIVO Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working REVIVO web demo with two parts:
- the scan → insight → redesign loop (Tier 1);
- the Wardrobe OS closet and looks, with free and Premium allowances (Tier 2).

It runs live on a projector and costs almost nothing.

**Architecture:**
- A Next.js (App Router, TypeScript) app on Vercel.
- Server routes call AI providers through small swappable modules (`vision`, `writer`, `imageGen`).
- Supabase Postgres stores scans, the reviewed knowledge base, garments, credits and activity. Supabase Storage holds images.
- Business rules (matching, allowances, outfit validation, depth layout) are pure TypeScript functions in `lib/domain` and `lib/depth`. They are unit-tested and called by thin route handlers.

**Tech Stack:**
- Next.js 15 and TypeScript.
- Supabase (`@supabase/supabase-js`, `@supabase/ssr`).
- Gemini through `@google/genai` for vision, text and the free image tier. OpenAI images (`openai`) for paid demo-day images.
- `zod` for schemas, Vitest for tests, `html-to-image` for the Story Card PNG.
- An in-browser background-removal library, chosen by the builder (spec §12; check its licence).

**Spec:** `docs/superpowers/specs/2026-11-19-ai-circular-fashion-app-design.md` (approved 2026-11-22). Terms follow `GLOSSARY.md`. When this plan and the spec disagree, **spec §6.6 wins**.

## Global Constraints

- **History:**
  - Every history or culture claim comes only from `kb_entries` with `status = 'reviewed'`, and its sources are shown.
  - The AI never writes history.
  - When no History Entry matches, show exactly: **"No verified history for this piece yet."**
- **History matching:**
  - History matches **only** through a Named Style from the fixed list. Confidence must be ≥ **0.8**, or the user must confirm it.
  - Between **0.5 and 0.8**, ask "Is this {style}?".
  - Below 0.5, ask nothing.
  - Generic tags never match history.
- **No shopping:** no store, resale or purchase links anywhere in the UI or in AI output.
- **Redesign Recipes:**
  - One free Recipe per Scan: the best-matching **beginner** Recipe, or else the best-matching Recipe of any level.
  - The other two or three are Premium locked cards showing title, difficulty and a teaser.
- **Allowances:**
  - Uploads and "Style me" requests: the **first 10 free**, then **5 per week**.
  - The weekly allowance refills **1 credit every 33.6 h** (120 960 000 ms), capped at **5**, with no stacking.
  - Premium ($7.99/month) is unlimited.
- **Credit rules:**
  - One "Style me" request = **1 credit = 3 Looks**.
  - "I made this" costs no Upload.
  - Saving a Look as an Outfit is free.
  - Deleting a Garment never refunds.
  - Failed AI calls refund automatically.
- **Scan safety cap:** **20 Scans per user per day**. The demo account is exempt from every limit.
- **Labels:**
  - A Concept Image always carries a visible **"Concept"** label.
  - AI-written steps carry **"AI-generated guidance"**.
- **Images:** no reference-video or design-prompt images ship. Use only the team's own garment photos or generated cut-outs.
- **Fabric confirmation:** asked when `fabric_guess.confidence < 0.7`. Corrections cover `fabric`, `garment_type` and `named_style` only.
- **Outfits:**
  - 2–4 active Garments, all from the user's own Closet.
  - Must include an Upcycled Garment when the Closet has one.
  - Transformed Garments are never used.
- **Accessories:** used in Outfits only. They are never scanned for history or Recipes.
- **Downgrade:** a user who leaves Premium keeps every Garment. Only new Uploads and Looks fall back to the free allowance.
- **Privacy:** never request photos of faces (show the copy "Photograph the garment only, no faces, please.").

## Review Focus

1. **The photo isn't a garment** (a selfie, a blank wall, a cat): the Scan returns "We couldn't find a garment in this photo. Try another." It spends nothing and doesn't crash. *(Test in Task 7.)*
2. **The AI is rate-limited (429) or returns malformed JSON:** the user sees a friendly retry message, and any credit spent is refunded. On the demo account, the cached result is served. *(Tests in Task 7 and Task 14.)*
3. **"Style me" with fewer than 2 active Garments:** show "Add at least 2 pieces you own to get looks." Spend no credit and make no AI call. *(Test in Task 14.)*
4. **A double-tap on "Style me" or "Add to closet":** exactly one credit is spent, because the spend is a conditional update that fails if the state changed. *(Test in Task 4.)*
5. **An iPhone HEIC photo or a 12 MB photo:** HEIC and very large files are converted or shrunk to ≤1024 px JPEG before upload. Anything unreadable shows "This photo format isn't supported. Try a JPG or PNG." *(Test in Task 9.)*

---

## File Structure

```
app/
  page.tsx                     Home (Tier 3 animated cluster; Tier 1 static)
  scan/page.tsx                Upload + Result screen
  guide/[scanId]/[recipeId]/page.tsx   Guide + Story Card
  closet/page.tsx              Closet rail (Tier 2)
  looks/page.tsx               Looks carousel (Tier 2)
  profile/page.tsx             Activity Record + Upgrade (Tier 2)
  demo/route.ts                Hidden demo sign-in (?key=)
  api/analyze/route.ts         Scan
  api/correct/route.ts         Corrections
  api/guide/route.ts           Guide text (+ premium gate)
  api/render/route.ts          Concept Image (+ refund)
  api/closet/route.ts          Save scan / quick add / accessory / delete / made-this
  api/outfits/route.ts         Style me (3 looks) + save outfit
  api/premium/route.ts         Upgrade / demo Free-Premium switch
  api/cron/keepalive/route.ts  Daily Supabase ping
lib/
  env.ts                       Typed env (IMAGE_PROVIDER, keys, DEMO_KEY)
  domain/types.ts              Shared domain types
  domain/vocabulary.ts         Fixed tag + Named Style lists
  domain/allowance.ts          Credits: peek / spend / refund
  domain/matching.ts           KB matching + free recipe pick
  domain/outfits.ts            Outfit validation
  ai/visionSchema.ts           zod schema for vision output
  ai/vision.ts, ai/writer.ts, ai/imageGen.ts   Provider modules
  ai/guard.ts                  Timeout + demo-cache fallback
  db/server.ts                 Supabase server client + repo helpers
  image/prepare.ts             Client resize/convert + hash
  depth/engine.ts              Position, spring, line layout
components/                    HeroGarment, Swatches, LockedRecipeCard, StoryCard, ClosetRail, LooksCarousel, AllowanceBadge
supabase/migrations/0001_init.sql
scripts/import-kb.ts, scripts/review-kb.ts, scripts/seed-demo.ts, scripts/prescan.ts
content/kb/entries.csv         Claude-drafted KB (status=draft on import)
tests/                         Vitest, mirrors lib/
```

---

## Tier 1: the core loop (days 1–4)

### Task 1: Project scaffold and environment

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`, `lib/env.ts`
- Test: `tests/env.test.ts`

**Interfaces:**
- Produces:
  - `env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_ROLE_KEY: string; GEMINI_API_KEY: string; OPENAI_API_KEY?: string; IMAGE_PROVIDER: 'gemini' | 'openai'; DEMO_KEY: string; DEMO_USER_ID: string; AI_TIMEOUT_MS: number }`
  - `IMAGE_PROVIDER` defaults to `'gemini'`. `AI_TIMEOUT_MS` defaults to `20000`.

- [ ] **Step 1:** Run `git init` in `C:\z-Local-Disk-D\Fashion app` (the folder is not a repository yet). Then scaffold Next.js with TypeScript and the App Router, with no `src/` directory, and add Vitest.
- [ ] **Step 2: Write the failing test.** `tests/env.test.ts`:
  - `parseEnv({...valid, IMAGE_PROVIDER: undefined}).IMAGE_PROVIDER === 'gemini'`
  - `parseEnv({...valid, IMAGE_PROVIDER: 'openai', OPENAI_API_KEY: undefined})` throws `/OPENAI_API_KEY/`
- [ ] **Step 3:** Run `npx vitest run tests/env.test.ts`. Expected: FAIL (`parseEnv` not defined).
- [ ] **Step 4:** Implement `parseEnv(raw: Record<string, string | undefined>)` in `lib/env.ts` with zod, and export `env = parseEnv(process.env)`. List every key in `.env.example`.
- [ ] **Step 5:** Run the test. Expected: PASS.
- [ ] **Step 6:** Commit with `chore: scaffold REVIVO Next.js app with typed env`.

### Task 2: Database schema and security rules

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `lib/db/server.ts`
- Test: `tests/db/rls.smoke.ts` (run against the linked Supabase project)

**Interfaces:**
- Produces:
  - The tables from spec §8: `profiles`, `activity`, `scans`, `corrections`, `kb_entries`, `scan_matches`, `guides`, `garments`, `outfits`.
  - `profiles` credit columns: `free_uploads_used int default 0`, `upload_credits int default 0`, `uploads_refill_at timestamptz`, `free_looks_used int default 0`, `look_credits int default 0`, `looks_refill_at timestamptz`, `is_premium bool default false`, `is_demo bool default false`.
  - `guides.outdated bool default false`, `garments.category text check (category in ('clothing','accessory'))`, `scans.user_id` and `scans.created_at` (for the daily cap).
  - `serverClient(): SupabaseClient` acts as the signed-in user. `adminClient(): SupabaseClient` uses the service role and is used only in scripts and the credit spend.
  - Storage bucket `garments` (private), with paths `{userId}/{uuid}.jpg`.

- [ ] **Step 1: Write the smoke test.** `tests/db/rls.smoke.ts` signs in two anonymous users, A and B. It asserts:
  - B cannot select A's `scans`, `garments` or `outfits`;
  - anyone can read a `kb_entries` row with `status='reviewed'`;
  - nobody can read a `status='draft'` row.
- [ ] **Step 2:** Run `npx vitest run tests/db/rls.smoke.ts`. Expected: FAIL (the tables don't exist yet).
- [ ] **Step 3:** Write the migration:
  - tables and enums as above;
  - `create extension vector` (Tier 3 uses it; the column is created now);
  - RLS so each user sees only rows where `user_id = auth.uid()`;
  - `kb_entries` selectable only when `status = 'reviewed'`;
  - a trigger that creates a `profiles` row for every new auth user.

  Enable anonymous sign-ins in Supabase Auth. Apply the migration with `supabase db push`.
- [ ] **Step 4:** Run the smoke test. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(db): schema, RLS and storage bucket`.

### Task 3: Vocabulary and vision schema

**Files:**
- Create: `lib/domain/types.ts`, `lib/domain/vocabulary.ts`, `lib/ai/visionSchema.ts`
- Test: `tests/ai/visionSchema.test.ts`

**Interfaces:**
- Produces:
  - `NAMED_STYLES: readonly string[]`, with at least `'breton-stripe' | 'paisley' | 'kimono-sleeve' | 'aloha-print' | 'tartan' | 'ikat' | 'houndstooth' | 'peter-pan-collar'`. The team adds styles to match the stage garments.
  - `GENERIC_TAGS: readonly string[]` (garment types, fabrics, patterns, fits).
  - `FABRICS: readonly string[]`.
  - `VisionResult`, inferred from `visionSchema`:
    - the spec §6.1 shape;
    - plus `is_garment: boolean`;
    - plus `named_styles: { style: (typeof NAMED_STYLES)[number]; confidence: number }[]`.
  - `parseVision(raw: unknown): VisionResult`. It drops unknown Named Styles and unknown tags, clamps confidences to [0, 1], and throws `VisionParseError` on invalid JSON.
  - In `lib/domain/types.ts`:
    - `type Garment = { id: string; category: 'clothing' | 'accessory'; status: 'active' | 'transformed'; isUpcycled: boolean; tags: string[]; name: string; cutoutPath: string; imageKind: 'photo' | 'concept' }`
    - `type StyleProfile = { styles: string[]; avoidColors: string[]; occasions: string[]; climate: string }`
    - `DEFAULT_STYLE_PROFILE: StyleProfile`, used until onboarding exists (Tier 3).
    - `KbEntry` and `MatchResult`, as defined in Task 5. `Look`, as defined in Task 14.

- [ ] **Step 1: Write the failing tests.**
  - A valid payload parses.
  - `named_styles: [{style:'made-up-style', confidence:0.9}]` parses to `named_styles: []`.
  - `fabric_guess.confidence: 1.4` becomes `1`.
  - A payload with any key named `history` or `origin` is stripped, not kept.
  - `parseVision('not json')` throws `VisionParseError`.
- [ ] **Step 2:** Run `npx vitest run tests/ai/visionSchema.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the schema, using zod `.strip()` and `.transform` for the filtering and clamping.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(ai): vision schema and fixed vocabulary`.

### Task 4: Allowance engine (credits)

**Files:**
- Create: `lib/domain/allowance.ts`
- Test: `tests/domain/allowance.test.ts`

**Interfaces:**
- Produces:
  - `REFILL_MS = 120_960_000`, `FREE_START = 10`, `WEEKLY_CAP = 5`
  - `type AllowanceState = { freeUsed: number; credits: number; refillAt: Date | null }`
  - `type Tier = { premium: boolean; exempt: boolean }`
  - `peek(s: AllowanceState, now: Date, t: Tier): { remaining: number | 'unlimited'; nextCreditAt: Date | null }`
  - `spend(s: AllowanceState, now: Date, t: Tier): { ok: true; state: AllowanceState; pool: 'free' | 'weekly' | 'unlimited' } | { ok: false; nextCreditAt: Date }`
  - `refund(s: AllowanceState, pool: 'free' | 'weekly' | 'unlimited'): AllowanceState`
  - `spendCredit(userId: string, kind: 'upload' | 'look', now?: Date): Promise<SpendReceipt>` in `lib/db/server.ts`. It reads the profile, calls `spend`, and writes with a **conditional update** (`where` the old values still match). It retries once, then throws `ConcurrentSpendError`.
  - `refundCredit(receipt: SpendReceipt): Promise<void>`
  - `type SpendReceipt = { userId: string; kind: 'upload' | 'look'; pool: 'free' | 'weekly' | 'unlimited' }`

**Refill rule (plan decision):**
- When the 10 free credits run out, the weekly pool starts at **0**, with `refillAt = now`.
- Credits available = `min(5, credits + floor((now − refillAt) / REFILL_MS))`.
- `refillAt` moves forward by the whole periods used. At the cap, it resets to `now`.

- [ ] **Step 1: Write the failing tests.** Use `T = 2026-12-01T00:00Z`.
  - `freeUsed: 3` → `spend` is ok, `pool: 'free'`, `freeUsed: 4`.
  - `freeUsed: 10, credits: 0, refillAt: T`, with `now = T + 33.6h − 1ms` → `ok: false`, `nextCreditAt = T + 33.6h`.
  - The same state with `now = T + 33.6h` → ok, `pool: 'weekly'`, `credits: 0` after the spend.
  - `now = T + 30 days` → `peek().remaining === 5` (the cap holds, with no stacking).
  - Premium → `pool: 'unlimited'`, and the state is unchanged.
  - Exempt (demo) → `pool: 'unlimited'`.
  - `refund(stateAfterFreeSpend, 'free')` → `freeUsed` goes back down by 1. `refund(s, 'weekly')` → `credits` goes up by 1, capped at 5.
  - **Double-tap (Review Focus 4):** two `spendCredit` calls race on a profile with 1 weekly credit, using a fake repo with conditional updates. Exactly one returns a receipt; the other throws `OutOfCreditsError`.
- [ ] **Step 2:** Run `npx vitest run tests/domain/allowance.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `peek`, `spend` and `refund` as pure functions, then `spendCredit` and `refundCredit` with the conditional update.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(domain): upload and look allowances with refill and refund`.

### Task 5: Knowledge-base matching

**Files:**
- Create: `lib/domain/matching.ts`
- Test: `tests/domain/matching.test.ts`

**Interfaces:**
- Consumes: `VisionResult` (Task 3).
- Produces:
  - `type KbEntry = { id: string; kind: 'history' | 'redesign' | 'fabric'; title: string; body: string; tags: string[]; difficulty?: 'beginner' | 'intermediate' | 'advanced'; tools?: string[]; steps?: string[]; sources?: { citation: string; url: string; accessed: string }[]; status: 'draft' | 'reviewed' }`
  - `type Confirmed = { fabric?: string; garmentType?: string; namedStyles: string[] }`, holding user-confirmed values from Corrections.
  - `matchEntries(v: VisionResult, c: Confirmed, entries: KbEntry[]): MatchResult`
  - `type MatchResult = { history: KbEntry[]; recipes: KbEntry[]; fabricNotes: KbEntry[]; freeRecipeId: string | null; styleQuestions: { style: string; confidence: number }[] }`

**Rules:**
- Only `reviewed` entries match.
- Fabric = `c.fabric ?? v.fabric_guess.value`; garment type = `c.garmentType ?? v.garment_type`.
- `history` matches only through a Named Style that has confidence ≥ 0.8 **or** is in `c.namedStyles`.
- `styleQuestions` = styles with confidence in [0.5, 0.8) that are not already confirmed.
- `recipes` and `fabricNotes` rank by tag overlap, highest first. At most **4** recipes are returned.
- `freeRecipeId` = the first `beginner` recipe in ranked order, else the first recipe, else `null`.
- Accessories (`v.category === 'accessory'`) return empty lists.

- [ ] **Step 1: Write the failing tests.**
  - A striped shirt with `named_styles: []` and a reviewed `breton-stripe` history entry → `history: []`.
  - Confidence 0.85 for `breton-stripe` → that entry appears in `history`.
  - Confidence 0.6 → `history: []` and `styleQuestions: [{style:'breton-stripe', confidence:0.6}]`.
  - Confidence 0.6 plus `c.namedStyles: ['breton-stripe']` → the entry appears in `history` and the style is no longer asked about.
  - A draft entry never appears.
  - Recipes `[advanced (overlap 3), beginner (overlap 2), intermediate (overlap 1)]` → `freeRecipeId` = the beginner one.
  - No beginner recipe → the top-ranked one is free.
  - 6 matching recipes → 4 returned.
  - The `c.fabric` override changes which fabric notes match.
- [ ] **Step 2:** Run `npx vitest run tests/domain/matching.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `matchEntries`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(domain): KB matching with named-style history guard and free recipe`.

### Task 6: AI provider modules and guard

**Files:**
- Create: `lib/ai/vision.ts`, `lib/ai/writer.ts`, `lib/ai/imageGen.ts`, `lib/ai/guard.ts`
- Test: `tests/ai/providers.test.ts`

**Interfaces:**
- Consumes: `env` (Task 1), `parseVision` (Task 3), `KbEntry` (Task 5).
- Produces:
  - `analyzeImage(jpeg: Uint8Array): Promise<VisionResult>`. Gemini Flash, JSON mode. The prompt asks for observable features only, and for Named Styles chosen only from `NAMED_STYLES`.
  - `readCareLabel(jpeg: Uint8Array): Promise<{ fabric: string | null; text: string }>`, used in Tier 3.
  - `writeGuide(v: VisionResult, recipe: KbEntry, history: KbEntry[]): Promise<{ steps: string[]; tools: string[]; historyRefs: string[] }>`. `historyRefs` must be a subset of the passed entry ids. The prompt forbids new facts, sewing jargon and any shopping or store mentions.
  - `generateConceptImage(v: VisionResult, recipe: KbEntry): Promise<Uint8Array>`. It switches on `env.IMAGE_PROVIDER` and returns an off-white product cut-out.
  - `styleLooks(closet: Garment[], profile: StyleProfile, occasion?: string): Promise<unknown>`. It returns raw JSON, which Task 14 validates.
  - `withGuard<T>(key: string, fn: () => Promise<T>, opts: { timeoutMs: number; demo: boolean }): Promise<T>`. It races `fn` against the timeout. When `demo` is true and the call fails or times out, it returns the cached value from the `demo_cache` table (key → jsonb). It always writes successful demo results to that cache.
  - Errors: `AiRateLimitError` (429), `AiBadOutputError`, `AiTimeoutError`.

- [ ] **Step 1: Write the failing tests** (mock the SDKs with `vi.mock`):
  - a Gemini 429 → `analyzeImage` rejects with `AiRateLimitError`;
  - invalid JSON → `AiBadOutputError`;
  - `writeGuide` drops any `historyRefs` id that wasn't passed in;
  - `IMAGE_PROVIDER='openai'` → the OpenAI client is called and Gemini is not;
  - `withGuard` with `demo: true` and a 25 s fake call → resolves with the cached value after `timeoutMs`;
  - `withGuard` with `demo: false` → rejects with `AiTimeoutError`.
- [ ] **Step 2:** Run `npx vitest run tests/ai/providers.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the modules. Add a `demo_cache(key text primary key, value jsonb, image_path text)` table in `supabase/migrations/0002_demo_cache.sql`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(ai): provider modules, image provider switch, demo guard`.

### Task 7: `/api/analyze` route (Scan)

**Files:**
- Create: `app/api/analyze/route.ts`, `lib/db/scans.ts`
- Test: `tests/api/analyze.test.ts`

**Interfaces:**
- Consumes: `analyzeImage`, `withGuard`, `matchEntries`, `serverClient`.
- Produces:
  - `POST /api/analyze`, body `{ imagePath: string; cutoutPath: string; imageHash: string }` (the images are already in Storage).
  - Response:
    - `200 { scanId, vision, match: MatchResult, needsFabricConfirm: boolean }`;
    - `422 { error: 'not_a_garment' }`;
    - `429 { error: 'daily_cap' }`;
    - `503 { error: 'ai_busy' }`.
  - `needsFabricConfirm = vision.fabric_guess.confidence < 0.7`.
  - The same `imageHash` from the same user reuses the existing Scan and makes **no AI call**.
  - Scanning never spends an Upload credit.

- [ ] **Step 1: Write the failing tests** (mock the deps):
  - **(Review Focus 1)** `is_garment: false` → 422 `not_a_garment`, and no Scan row is written.
  - **(Review Focus 2)** `AiRateLimitError` → 503 `ai_busy`, and no Scan row is written.
  - A 21st Scan today for a non-demo user → 429 `daily_cap`. For the demo user → 200.
  - A repeated `imageHash` → returns the earlier `scanId`, and `analyzeImage` is called 0 times.
  - Fabric confidence 0.62 → `needsFabricConfirm: true`.
  - The profile's credit columns are unchanged after a successful Scan.
- [ ] **Step 2:** Run `npx vitest run tests/api/analyze.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the route. It stores `vision_json`, `model_name`, `model_version` and `image_hash`, and writes `scan_matches` rows with `method: 'tag'`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(api): scan route with daily cap, hash cache and garment check`.

### Task 8: `/api/correct` route (Corrections)

**Files:**
- Create: `app/api/correct/route.ts`
- Test: `tests/api/correct.test.ts`

**Interfaces:**
- Consumes: `matchEntries`.
- Produces: `POST /api/correct`, body `{ scanId: string; field: 'fabric' | 'garment_type' | 'named_style'; value: string; accept?: boolean }`. A `named_style` Correction carries `accept` (yes/no). The response is `200 { match: MatchResult }`. Side effects:
  - inserts a `corrections` row with `ai_value` and `user_value`;
  - updates `scans.fabric_final` and `fabric_source='user'` for a fabric Correction;
  - re-runs matching and replaces the `scan_matches` rows;
  - sets `guides.outdated = true` for that Scan.

- [ ] **Step 1: Write the failing tests.**
  - A fabric Correction "silk" → the Correction is stored and `match.fabricNotes` now match silk.
  - A `named_style` Correction with `accept: true` for a 0.6-confidence style → the History Entry appears.
  - `accept: false` → the style question disappears and no history appears.
  - Every existing Guide for the Scan has `outdated = true`.
  - `field: 'colors'` → 400.
- [ ] **Step 2:** Run `npx vitest run tests/api/correct.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the route.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(api): corrections re-match and outdate guides`.

### Task 9: Client photo preparation and Scan + Result screen

**Files:**
- Create: `lib/image/prepare.ts`, `app/scan/page.tsx`, `components/HeroGarment.tsx`, `components/Swatches.tsx`, `components/LockedRecipeCard.tsx`, `components/FabricConfirm.tsx`, `components/StyleQuestion.tsx`
- Test: `tests/image/prepare.test.ts`

**Interfaces:**
- Consumes: `/api/analyze`, `/api/correct`.
- Produces:
  - `prepareImage(file: File): Promise<{ jpeg: Blob; width: number; height: number; hash: string }>`. It produces at most 1024 px on the long side, JPEG quality 0.85, and the SHA-256 hex of the JPEG bytes.
  - `removeBackground(jpeg: Blob): Promise<Blob | null>`. It returns `null` on failure, and the caller then uses the original.

Result screen (spec §7.2 and §7.4):
- the hero cut-out with the fabric name in large faded type behind it, and the colour swatches;
- feature labels;
- `FabricConfirm` (2–3 choices from `fabric_guess.alternatives`) when `needsFabricConfirm`;
- `StyleQuestion` "Is this {style}?" for each item in `styleQuestions`;
- history cards with sources, or the exact copy "No verified history for this piece yet.";
- the free Recipe card, open;
- the other Recipes as `LockedRecipeCard`s for free users (title, difficulty and a teaser = the first sentence of the body);
- the copy "Photograph the garment only, no faces, please." beside the upload button.

- [ ] **Step 1: Write the failing tests** (jsdom with a canvas polyfill):
  - a 4000×3000 PNG → the output is 1024×768, `image/jpeg`;
  - the same input twice → the same `hash`;
  - **(Review Focus 5)** a corrupt file → rejects with `UnsupportedImageError`, whose message is "This photo format isn't supported. Try a JPG or PNG.";
  - HEIC input → converted through `heic2any` before resizing.
- [ ] **Step 2:** Run `npx vitest run tests/image/prepare.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `prepareImage` and `removeBackground`, then build the screen. On first load, call `supabase.auth.signInAnonymously()` if there is no session (no sign-up wall, spec §7.4). The upload flow is: prepare → upload the original and the cut-out to `garments/{uid}/…` → `POST /api/analyze` → render.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run `npm run dev`, upload a real shirt photo, and check that the hero, the swatches, the confirm tap (when shown) and the locked cards all appear.
- [ ] **Step 5:** Commit with `feat(scan): photo prep and result screen`.

### Task 10: Guide, Concept Image and the Premium gate

**Files:**
- Create: `app/api/guide/route.ts`, `app/api/render/route.ts`, `app/guide/[scanId]/[recipeId]/page.tsx`
- Test: `tests/api/guide.test.ts`

**Interfaces:**
- Consumes: `writeGuide`, `generateConceptImage`, `withGuard`, `matchEntries`.
- Produces:
  - `POST /api/guide`, body `{ scanId, recipeId }`. It returns `200 { steps, tools, history: KbEntry[], outdated: false }`. It returns `402 { error: 'premium_required' }` when `recipeId !== freeRecipeId` and the user isn't Premium or demo-Premium. It reuses a cached Guide unless `outdated`.
  - `POST /api/render`, body `{ scanId, recipeId }`, returns `200 { imageUrl }`. It applies the same Premium gate and stores the image in `guides.after_image_path` with `image_provider`. Rendering spends no allowance credits.
  - Guide page:
    - the before → after view (a crossfade in Tier 1);
    - steps labelled "AI-generated guidance";
    - the image labelled "Concept";
    - tools and the source list;
    - "Create Garment Story card" and "I made this" (Task 13).

- [ ] **Step 1: Write the failing tests.**
  - A free user asking for the free Recipe → 200.
  - A free user asking for another Recipe → 402.
  - A Premium user → 200 for any matched Recipe.
  - A Recipe that isn't in the Scan's matches → 404.
  - An outdated Guide → `writeGuide` is called again and `outdated` is cleared.
  - The writer output contains a `history` id that wasn't passed in → it is dropped from the response.
- [ ] **Step 2:** Run `npx vitest run tests/api/guide.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement both routes and the page.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run the dev check: the free Recipe opens and the locked Recipe shows the Upgrade prompt.
- [ ] **Step 5:** Commit with `feat(guide): guide text, concept image, premium recipe gate`.

### Task 11: Garment Story Card

**Files:**
- Create: `components/StoryCard.tsx`
- Test: `tests/components/StoryCard.test.tsx`

**Interfaces:**
- Consumes: Guide page data.
- Produces: `<StoryCard scan recipe history isConcept />`. It is a receipt-style card (reference video 4): garment, fabric, story with its source line, Recipe and difficulty. "Download" calls `toPng` from `html-to-image` and saves `revivo-story-{scanId}.png` through a `Blob` URL.

- [ ] **Step 1: Write the failing tests.**
  - With no history → it renders "No verified history for this piece yet." and no source line.
  - With history → every source citation is rendered.
  - `isConcept` → the "Concept" label is present.
  - No `href` in the card points outside the app.
- [ ] **Step 2:** Run `npx vitest run tests/components/StoryCard.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement the component.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then download a card in the browser and open the PNG.
- [ ] **Step 5:** Commit with `feat(story): downloadable Garment Story Card`.

### Task 12: Knowledge-base content and import

**Files:**
- Create: `content/kb/entries.csv`, `scripts/import-kb.ts`, `scripts/review-kb.ts`
- Test: `tests/scripts/import-kb.test.ts`

**Interfaces:**
- Produces:
  - CSV columns: `id,kind,title,body,tags,difficulty,tools,steps,sources`. Lists are `|`-separated. `sources` is a JSON array of `{citation,url,accessed}`.
  - `npm run kb:import` upserts every row with `status='draft'`.
  - `npm run kb:review -- <id> "<reviewer name>"` sets `status='reviewed'` and `reviewed_by`. It **refuses** a `history` row that has no sources.

- [ ] **Step 1: Write the failing tests.**
  - The importer rejects a `history` row with empty `sources`.
  - It rejects any tag that isn't in `NAMED_STYLES ∪ GENERIC_TAGS`, and any `history` tag that isn't a Named Style.
  - Every imported row has `status === 'draft'`.
  - Re-importing the same id updates the row and doesn't duplicate it.
- [ ] **Step 2:** Run `npx vitest run tests/scripts/import-kb.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement both scripts.
- [ ] **Step 4:** **Content (Claude drafts, the team reviews; spec §6.2a).** Once the owner shares the list or photos of the 8–12 stage garments, draft about 25 Recipes (each garment gets at least 1 beginner Recipe), about 15 History Entries and about 10 Fabric Notes.
  - Every history source must be a real, checkable URL.
  - Draft no history for a garment that has no Named Style.
  - Import the content, then hand the team the list of ids to review.
- [ ] **Step 5:** Run the tests. Expected: PASS. Then run `npm run kb:import` and confirm that drafts are not visible in the app.
- [ ] **Step 6:** Commit with `feat(kb): CSV import, review script and drafted content`.

## Tier 2: Wardrobe OS (days 5–6)

### Task 13: Closet API and rail

**Files:**
- Create: `app/api/closet/route.ts`, `app/closet/page.tsx`, `components/ClosetRail.tsx`, `components/AllowanceBadge.tsx`
- Test: `tests/api/closet.test.ts`

**Interfaces:**
- Consumes: `spendCredit` and `refundCredit` (Task 4), `serverClient`.
- Produces: `POST /api/closet` with `action`:
  - `save_scan { scanId }`: creates a clothing Garment linked to the Scan. **Spends 1 Upload.**
  - `quick_add { imagePath, cutoutPath, tags, name }`: a clothing Garment with `scan_id: null`. **Spends 1 Upload.**
  - `accessory { imagePath, cutoutPath, name, tags }`: `category: 'accessory'`. **Spends 1 Upload.**
  - `full_scan { garmentId, scanId }`: links a quick-added Garment to a new Scan. **No credit.**
  - `made_this { sourceGarmentId, recipeId, photoPath?, conceptPath? }`: a new Upcycled Garment (`image_kind: photo` when a photo is given, otherwise `concept`). The source Garment gets `status: transformed`. **No credit.** It writes an `activity` row with kind `reconstruct`.
  - `delete { garmentId }`: removes the Garment and its Storage images, keeps the Scan text and Corrections, and **never refunds**.
  - `delete_scan { scanId }`: removes an unsaved Scan's images (spec §11). The text data and Corrections stay, with the image paths set to null.

  Each credit-spending action writes an `activity` row with kind `upload`. It returns `402 { error: 'no_uploads', nextCreditAt }` when out of credits.

  `GET /api/closet` returns `{ garments: Garment[], allowance: { uploads: peek(...), looks: peek(...) } }`.
- UI: the clothing rail (reference video 2): a hover lift, and a click that brings the piece forward and blurs the rest. `AllowanceBadge` shows "{n} uploads left · next in {h}h", or "Unlimited".

- [ ] **Step 1: Write the failing tests.**
  - `save_scan` for a free user with `freeUsed: 9` → ok, `freeUsed: 10`.
  - The next `save_scan` with no weekly credits → 402 with `nextCreditAt`.
  - `made_this` with zero credits → ok, the source is `transformed`, and a `reconstruct` activity row is written.
  - `delete` → the Storage objects are removed, the credits are unchanged, and the Scan row still exists with null image paths.
  - Downgrade: `is_premium` flips from true to false while there are 40 Garments → `GET` still returns all 40.
  - An `accessory` Garment has `category: 'accessory'` and no `scan_id`.
- [ ] **Step 2:** Run `npx vitest run tests/api/closet.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the route and the UI. The Result screen gets "Add to closet" (`save_scan`). The Closet gets "Quick add" and "Add accessory", both using `prepareImage` and `removeBackground` from Task 9.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run the dev check: the allowance badge counts down.
- [ ] **Step 5:** Commit with `feat(closet): uploads, quick add, accessories, made-this, rail UI`.

### Task 14: Looks ("Style me") and the depth carousel

**Files:**
- Create: `lib/domain/outfits.ts`, `lib/depth/engine.ts`, `app/api/outfits/route.ts`, `app/looks/page.tsx`, `components/LooksCarousel.tsx`
- Test: `tests/domain/outfits.test.ts`, `tests/depth/engine.test.ts`, `tests/api/outfits.test.ts`

**Interfaces:**
- Consumes: `Garment` and `StyleProfile` (Task 3), `styleLooks`, `spendCredit`, `refundCredit`, `withGuard`.
- Produces:
  - `type Look = { name: string; reason: string; garmentIds: string[] }`
  - `validateLooks(raw: unknown, closet: Garment[]): Look[]`. It drops any Look that:
    - has an id not in the Closet;
    - uses a transformed id;
    - has fewer than 2 or more than 4 items;
    - lacks an Upcycled Garment when the Closet has an active one;
    - mentions a URL, "buy", "shop" or "store" in `name` or `reason`.

    It returns at most 3 Looks.
  - `POST /api/outfits {action:'style', occasion?}`:
    - with fewer than 2 active Garments, it returns `400 { error: 'closet_too_small' }` **before** spending;
    - otherwise it spends 1 look credit and calls `styleLooks`, then `validateLooks`;
    - if 0 valid Looks come back, it retries once;
    - if the AI fails or still returns 0 Looks, it **refunds** and returns 503;
    - on success it writes an `activity` row (`style`) and returns `200 { looks: Look[] }` (up to 3).
  - `POST /api/outfits {action:'save', look}` inserts into `outfits`. It is free.
  - Depth engine (values from `design references/try-the-look-runway-ring.md` §7.5, phone "classic"):
    - `wrap(x: number, n: number): number`;
    - `depthOf(i: number, p: number, n: number): number`;
    - `lineLayout(k: number, width: number): { x: number; bottom: number; scale: number; opacity: number; blur: number; z: number }`, using `ax=0.3, ay=22, sx=0.32, sy=22, sr=0.76, d=4`. The pose is `x = W(ax + sx·k)`, `bottom = ay + sy·k`, `scale = sr^k`, `opacity = k ≤ 3 ? 1 − 0.13k : max(0, 0.61·(4 − k))`, `blur = min(0.9k, 3.2)`, `z = 1000 − round(10k)`;
    - `stepSpring(cur: number, vel: number, target: number, dtSec: number): { cur: number; vel: number }`, with K = 95 and C = 2√K, 3 sub-steps, snapping when both |Δ| and |vel| are ≤ 0.0005.
  - Carousel: drag sets the target directly, release snaps to a whole number, and arrow keys move by 1. Reduced motion jumps straight to the target. The list of numbered pieces sits under the front Look, with a "Save look" heart.

- [ ] **Step 1: Write the failing tests.**
  - `validateLooks`:
    - a Look with an unknown id → dropped;
    - a Look with 5 items → dropped;
    - a Closet with an upcycled piece and a Look without it → dropped;
    - `reason: "pair with a tee from the store"` → dropped;
    - 5 valid Looks → 3 returned.
  - `lineLayout(0, 400)` → `{x:120, bottom:22, scale:1, opacity:1, blur:0, z:1000}`. `lineLayout(1, 400)` → x ≈ 248, scale 0.76, opacity 0.87, blur 0.9.
  - `stepSpring` from 0 toward 1 settles within 2 s of 1/60 s steps without overshooting past 1.0005.
  - **(Review Focus 3)** The route with 1 active Garment → 400 `closet_too_small`, and `spendCredit` is not called.
  - **(Review Focus 2)** `styleLooks` throws → `refundCredit` is called once and the response is 503.
  - Success → exactly 1 credit spent and up to 3 Looks returned.
- [ ] **Step 2:** Run `npx vitest run tests/domain/outfits.test.ts tests/depth/engine.test.ts tests/api/outfits.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `outfits.ts`, `engine.ts`, the route and the carousel. The renderer changes only `transform`, `filter` and `opacity`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run the dev check: drag works, arrow keys work, and the phone width works.
- [ ] **Step 5:** Commit with `feat(looks): style me with 3 looks, validation, depth carousel`.

### Task 15: Profile, Upgrade and the demo account

**Files:**
- Create: `app/profile/page.tsx`, `app/api/premium/route.ts`, `app/demo/route.ts`, `scripts/seed-demo.ts`, `scripts/prescan.ts`, `app/api/cron/keepalive/route.ts`, `vercel.json`
- Test: `tests/api/premium.test.ts`

**Interfaces:**
- Consumes: `/api/closet`, `/api/analyze`, `withGuard` demo cache.
- Produces:
  - `POST /api/premium {action:'upgrade'}` sets `is_premium = true` (no payment) and shows "$7.99/month".
  - `POST /api/premium {action:'demo_toggle'}` works **only** when `profiles.is_demo`, and flips `is_premium`.
  - `GET /demo?key=…` returns 404 unless `key === env.DEMO_KEY`. Otherwise it signs the browser in as `env.DEMO_USER_ID` and redirects to `/`.
  - `profiles.is_demo = true` ⇒ `Tier.exempt = true` everywhere (allowances and the scan cap).
  - The Profile page shows the Activity Record (uploaded, reconstructed and styled, newest first), the allowance badges, Upgrade, and the hidden demo toggle when `is_demo` is set.
  - `scripts/seed-demo.ts` creates the demo user with a style profile and imports 8–12 of the team's garment photos through the real pipeline.
  - `scripts/prescan.ts <folder>` runs every stage photo through `/api/analyze`, the free Guide and the Concept Image, so `demo_cache` and the hash cache are warm.
  - The keep-alive is a daily Vercel cron hitting `/api/cron/keepalive`, which does `select 1` against Supabase.

- [ ] **Step 1: Write the failing tests.**
  - `demo_toggle` from a non-demo user → 403.
  - From the demo user → `is_premium` flips.
  - `GET /demo` with the wrong key → 404.
  - The demo user with `freeUsed: 10, credits: 0` → `spendCredit` still ok with `pool: 'unlimited'`.
- [ ] **Step 2:** Run `npx vitest run tests/api/premium.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the routes, the page, the scripts and the cron.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run the full rehearsal:
  1. `npm run seed:demo`, then `npm run prescan -- ./stage-photos`.
  2. Open `/demo?key=…` and toggle to Free. The locked Recipes and the counters show.
  3. Upgrade. Everything unlocks.
  4. Unset `GEMINI_API_KEY` locally and re-upload a stage photo. The cached result is served.
- [ ] **Step 5:** Commit with `feat(demo): profile, upgrade, demo account, prescan and keepalive`.

### Task 16: Deploy and demo-day checklist

**Files:**
- Create: `docs/DEMO-DAY.md`

- [ ] **Step 1:** Deploy to Vercel. Set the env vars, with `IMAGE_PROVIDER=gemini`.
- [ ] **Step 2:** Run `npx vitest run`. Expected: all tests pass.
- [ ] **Step 3:** Write `docs/DEMO-DAY.md`, containing:
  - the day-before steps: switch `IMAGE_PROVIDER=openai` and redeploy; run `prescan` again; open the demo link on the laptop and the phone; wake Supabase;
  - the stage order: upload → result → the free Recipe Guide → the Story Card → toggle to Premium → the Closet → Style me;
  - the fallback: if the network is slow, the demo cache answers within `AI_TIMEOUT_MS`.
- [ ] **Step 4:** Commit with `docs: demo-day checklist`.

## Tier 3: nice to have (only if Tiers 1–2 are demo-ready)

Each item ships behind its spec §9b fallback, which already exists. Do them in this order, one commit each:

1. **Home floating cluster** (`app/page.tsx`, video 3): cut-outs from the demo Closet drifting in depth using the CSS 3D transforms that `prefers-reduced-motion` respects. Fallback: a static cluster.
2. **Tile-dissolve before → after** on the Guide page (video 1). Fallback: crossfade.
3. **Ring layout and pins:** add `ringLayout(phi, W, H)` to `lib/depth/engine.ts` using try-the-look §7.4 (R = 0.62W, P = 1.65W, horizon 0.36H). Test that slot ±1 has scale 0.952 at x 0.795W and 0.205W.
4. **Care-label reading:** wire `readCareLabel` into `/api/label`. The label's fabric is stored as a Correction with `fabric_source='label'` and overrides the vision guess.
5. **Onboarding style questions:** 4 tap questions written to `profiles.style_profile`.
6. **Vector matching** for `redesign` and `fabric` entries only, using a Gemini embedding into `kb_entries.embedding`. Add a test asserting that `history` is never vector-matched.
