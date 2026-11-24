# Avatar Try-On Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Premium user create a stylised Avatar from one full-length photo and see each "Style me" Look worn by it on the Looks runway. Focus mode adds numbered dots that open each closet piece.

**Architecture:**
- **AI calls.** One paid-only provider module (`lib/ai/avatarGen.ts`) draws, dresses and locates. Two service modules hold the logic behind repo seams, following the `runXAction(userId, input, deps)` pattern of `lib/db/outfits.ts`: `lib/db/avatar.ts` and `lib/db/avatarLooks.ts`.
- **Shared rules.** Slot and dot geometry is a pure domain module shared by server and client.
- **Client.** The runway reuses `LooksCarousel` and the depth engine. A new `AvatarFigure` shows the paper doll instantly and crossfades in the AI picture.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres + private Storage bucket `garments`), `openai` (gpt-image-1, gpt-4.1-mini), `@google/genai` (paid key), zod, Vitest + Testing Library, CSS modules with tokens from `app/globals.css`.

**Spec:**
- `docs/superpowers/specs/2026-11-23-avatar-try-on-design.md`. It extends `docs/superpowers/specs/2026-11-19-ai-circular-fashion-app-design.md`, whose §6.6 domain rules still win.
- Terms are in `GLOSSARY.md`.

## Global Constraints

- **Premium only.** Every avatar endpoint checks `profiles.is_premium` (not `is_demo`). Free users get `403 premium_required`. Demo accounts follow the same rule, so the hidden Free/Premium switch shows both states.
- **Paid provider only.** Every call that sends the body photo or the Avatar goes to `AVATAR_PROVIDER` (`openai` | `gemini-paid`), never the free `GEMINI_API_KEY` client.
  - If `AVATAR_PROVIDER` is unset or its key is missing, return `503 avatar_unavailable`.
  - Profile then shows "Avatars aren't available yet".
- **Source photo is always deleted.** The user's photo (`<uid>/avatar-src/…`) is deleted in a `finally`, whether creation succeeds or fails. It is never stored anywhere else and never logged.
- **Redo is an atomic swap.** Write version n+1 first. Delete version n and its Look pictures only after n+1 succeeds.
- **Concept badge on every avatar picture.** The existing `<Badge variant="concept" />` is visible on every avatar picture: Profile, runway, focus mode.
- **Where avatar pictures appear.** Only on Profile and the Looks runway, including focus mode. Never in saved Outfits, the Story card or anything exported.
- **No shopping.** No prices, bag, bundle, "shop" copy or external store links anywhere in this feature.
- **Owned pieces only.** `/api/avatar/look` accepts only active garment ids from the caller's closet (same rule as `/api/outfits`).
- **Exact copy:**
  - consent: "Your photo is used once to draw your avatar, then deleted. Avatar pictures are AI concepts.";
  - busy: "Drawing your avatar…";
  - buttons: "Create my avatar", "Redo", "Delete avatar", "View in closet";
  - unavailable: "Avatars aren't available yet";
  - Looks link: "Create your avatar to see Looks on you";
  - free teaser: "See it on you".
- **Error codes:**
  - `premium_required` (403)
  - `avatar_unavailable` (503)
  - `no_avatar` (409)
  - `bad_request` (400)
  - `ai_busy` (503)
  - `unauthorized` (401)
- **Motion:**
  - front figure sway ±1.5° rotation, 4px drift, about 6 s loop;
  - focus in/out `--dur-base` with `--ease`;
  - AI picture crossfade `--dur-slow`.
  - Reduced motion: no sway, no zoom, instant swap (global rule in `globals.css` already applies; don't override it).
- **Timeouts:**
  - avatar draw and Look dress use `RENDER_TIMEOUT_MS` (default 50000);
  - locate uses `LOCATE_TIMEOUT_MS = 8000`;
  - both avatar routes set `export const maxDuration = 60`.
- **Tokens only.** No raw hex, sizes, radii or durations in new CSS modules.

## Review Focus

1. **A Look shown, then one of its Garments deleted.** The dot panel must show "This piece is no longer in your closet." and must not crash. Its cached Look picture is dropped (Task 4, Task 7 tests).
2. **Looks with 1 piece, or several pieces in the same slot** (two accessories, top plus outer). Every piece gets its own numbered dot and doll layer, with no overlapping identical positions (Task 2 test).
3. **Premium switched off (demo switch) after the runway loaded.** Look-picture requests return 403. The runway quietly keeps the paper doll or cut-outs, with no error banner (Task 6 test).
4. **Avatar photo is HEIC, huge, or not an image.** HEIC is converted and the photo downscaled through the existing `prepareImage`. A non-image gets the existing upload error copy, and nothing is uploaded (Task 5 test).
5. **Locate returns junk**: boxes for ids not in the Look, coordinates outside 0–1, or missing ids. Unknown ids are dropped, values are clamped to 0.04–0.96, and missing ids fall back to their slot position (Task 2 test).

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/env.ts` (modify) | `AVATAR_PROVIDER`, `GEMINI_PAID_API_KEY` |
| `lib/ai/avatarGen.ts` (new) | Paid-only provider calls: draw, dress, locate |
| `lib/domain/slots.ts` (new) | Slot map, slot boxes, look key, dot sanitising and fallback (pure, shared) |
| `supabase/migrations/0005_avatar.sql` (new) | `avatars`, `avatar_looks`, RLS |
| `lib/db/avatar.ts` (new) | Avatar create/redo/delete/get service + Supabase repo |
| `lib/db/avatarLooks.ts` (new) | Avatar-Look picture service + Supabase repo |
| `lib/db/closet.ts` (modify) | Garment delete also drops Avatar-Look rows containing it |
| `app/api/avatar/route.ts`, `app/api/avatar/look/route.ts` (new) | Thin routes |
| `lib/ui/messages.ts` (modify) | Copy for `avatar_unavailable`, `no_avatar` |
| `components/AvatarSection.tsx` + `avatar.module.css` (new) | Profile UI |
| `components/AvatarFigure.tsx` (new) | Doll + AI picture + sway + Concept badge |
| `components/LookFocus.tsx` (new) | Focus dialog, dots, Garment panel |
| `components/LooksCarousel.tsx`, `app/looks/page.tsx`, `app/profile/page.tsx` (modify) | Wiring |
| `scripts/prescan.ts`, `docs/DEMO-DAY.md` (modify) | Demo avatar warm-up |

---

### Task 1: Paid avatar provider and env

**Files:**
- Modify: `lib/env.ts`, `.env.example`
- Create: `lib/ai/avatarGen.ts`
- Test: `tests/ai/avatarGen.test.ts`, `tests/env.test.ts`

**Interfaces:**
- Consumes: `getEnvFor` (`lib/env.ts`), `mapSdkError`, `AiBadOutputError` (`lib/ai/errors.ts`), `GEMINI_IMAGE_MODEL`, `GEMINI_VISION_MODEL` (`lib/ai/gemini.ts`).
- Produces:
  ```ts
  export type AvatarProvider = 'openai' | 'gemini-paid';
  export type Box = { x: number; y: number; w: number; h: number }; // normalised 0–1, top-left origin
  export class AvatarUnavailableError extends Error {}               // message 'avatar_unavailable'
  export function avatarProvider(): AvatarProvider | null;           // null when unset or its key missing
  export async function drawAvatar(photoJpeg: Uint8Array): Promise<{ png: Uint8Array; transparent: boolean }>;
  export async function dressAvatar(avatarPng: Uint8Array, pieces: { id: string; image: Uint8Array }[]): Promise<Uint8Array>;
  export async function locatePieces(imagePng: Uint8Array, pieces: { id: string; label: string }[]): Promise<Record<string, Box>>;
  export const OPENAI_VISION_MODEL = 'gpt-4.1-mini';
  ```

- [ ] **Step 1: Write failing tests.** Mock `openai` and `@google/genai` as `tests/ai/providers.test.ts` does.
  - `avatarProvider()` returns null when `AVATAR_PROVIDER` is unset, and null when it is `openai` without `OPENAI_API_KEY`. The same goes for `gemini-paid` without `GEMINI_PAID_API_KEY`.
  - `drawAvatar` throws `AvatarUnavailableError` when the provider is null, and makes **no** SDK call.
  - `drawAvatar` with `openai`:
    - calls `images.edit` with `model: 'gpt-image-1'`, `background: 'transparent'`, `output_format: 'png'`;
    - returns `transparent: true`.
  - `drawAvatar` with `gemini-paid`:
    - builds its client with `GEMINI_PAID_API_KEY`, and the test asserts the constructor never received `GEMINI_API_KEY`;
    - returns `transparent: false`.
  - `dressAvatar` sends the avatar plus every piece image (openai: an `image` array of length 1 + pieces).
  - `locatePieces` parses `{"boxes":[{"id":"g1","x":0.4,"y":0.2,"w":0.2,"h":0.3}]}` into `{ g1: {…} }`. Malformed JSON throws `AiBadOutputError`.
  - `env.test.ts`: `AVATAR_PROVIDER` accepts `openai` | `gemini-paid`, rejects `gemini`, and is optional.
- [ ] **Step 2:** Run `npx vitest run tests/ai/avatarGen.test.ts tests/env.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
  - Add to the env shape: `AVATAR_PROVIDER: z.enum(['openai','gemini-paid']).optional()` and `GEMINI_PAID_API_KEY: z.string().min(1).optional()`. Add both to `.env.example` with a comment: "Avatar creation only runs on a paid provider; never the free Gemini tier."
  - Prompts: the draw prompt asks for a stylised fashion-sketch figure, full length, front-facing, arms slightly away from the body, plain fitted neutral base clothes, the same build, skin tone and hair as the photo, plain background, no text. The dress prompt asks for the same figure, same style and proportions, wearing exactly the given pieces and nothing else, with no text or logos. Exact wording is the implementer's.
  - Errors go through `mapSdkError`.
- [ ] **Step 4:** Re-run the step 2 command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(avatar): paid-only avatar provider and env`.

### Task 2: Slots, look key and dots (pure)

**Files:**
- Create: `lib/domain/slots.ts`
- Test: `tests/domain/slots.test.ts`

**Interfaces:**
- Consumes: `Box` from Task 1 (re-export the type; don't import runtime code).
- Produces:
  ```ts
  export type Slot = 'top' | 'outer' | 'bottom' | 'one-piece' | 'shoes' | 'accessory';
  export type Dot = { x: number; y: number };                  // normalised centre
  export const SLOT_BOX: Record<Slot, Box>;
  export function slotFor(category: 'clothing' | 'accessory', text: string): Slot;
  export function lookKey(garmentIds: string[]): string;       // sorted ids joined with ','
  export function dollLayout(pieces: { id: string; slot: Slot }[]): Record<string, Box>;
  export function resolveDots(pieces: { id: string; slot: Slot }[], located: Record<string, Box> | null): Record<string, Dot>;
  ```

- [ ] **Step 1: Write failing tests.**
  - **slotFor:**
    - `slotFor('accessory', 'gold hoops')` → `'accessory'`;
    - `('clothing','Linen slip dress')` → `'one-piece'`;
    - `'wide-leg trousers'` → `'bottom'`;
    - `'denim jacket'` → `'outer'`;
    - `'canvas sneakers'` → `'shoes'`;
    - `'striped shirt'` → `'top'`;
    - `'mystery thing'` → `'top'`.
  - **lookKey:** `lookKey(['b','a'])` === `lookKey(['a','b'])` === `'a,b'`.
  - **dollLayout:** two accessories give different boxes (Review Focus 2); `top` + `outer` give different boxes, with outer wider than top.
  - **resolveDots:**
    - unknown ids in `located` are dropped;
    - `x: 1.4` is clamped to `0.96` and `-0.2` to `0.04`;
    - a piece missing from `located` falls back to the centre of its `dollLayout` box;
    - `located = null` puts every piece at its slot centre (Review Focus 5).
- [ ] **Step 2:** Run `npx vitest run tests/domain/slots.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `slotFor` matches case-insensitive keywords on name + tags, in the order one-piece, outer, bottom, shoes, then top.
  - `SLOT_BOX` values are for a front-facing figure (top 0.22–0.52 of height, bottom 0.48–0.92, and so on); exact numbers are the implementer's.
  - Repeated slots offset each next box by 0.08 on x.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(avatar): slots, look key and dot resolution`.

### Task 3: Avatar data and service (create, redo, delete, get)

**Files:**
- Create: `supabase/migrations/0005_avatar.sql`, `lib/db/avatar.ts`, `app/api/avatar/route.ts`
- Modify: `lib/ui/messages.ts`, `lib/db/closet.ts` (export `ownedPath`)
- Test: `tests/api/avatar.test.ts`

**Interfaces:**
- Consumes: `drawAvatar`, `avatarProvider`, `AvatarUnavailableError` (Task 1); `SCAN_ERRORS` (`lib/db/scans.ts`); `adminClient`; the `ownedPath` rule from `lib/db/closet.ts` (export it from there as `ownedPath`).
- Produces:
  ```ts
  export type AvatarRow = { userId: string; version: number; imagePath: string; transparent: boolean; createdAt: string };
  export type AvatarOut = { url: string; version: number; transparent: boolean } | null;
  export interface AvatarRepo {
    isPremium(userId: string): Promise<boolean>;
    getAvatar(userId: string): Promise<AvatarRow | null>;
    readObject(path: string): Promise<Uint8Array>;
    writeObject(path: string, png: Uint8Array): Promise<void>;
    removeObjects(paths: string[]): Promise<void>;
    upsertAvatar(row: Omit<AvatarRow, 'createdAt'>): Promise<void>;
    deleteAvatar(userId: string): Promise<void>;
    listLookPaths(userId: string, version?: number): Promise<string[]>;
    deleteLooks(userId: string, version?: number): Promise<void>;
    signedUrl(path: string): Promise<string>;
  }
  export type AvatarDeps = { repo: AvatarRepo; draw: typeof drawAvatar; available: () => boolean; timeoutMs: number };
  export type AvatarResult = { status: 200 | 400 | 403 | 409 | 503; body: Record<string, unknown> };
  export async function runAvatarAction(userId: string, input: unknown, deps: AvatarDeps): Promise<AvatarResult>;
  // actions: { action:'get' } | { action:'create', sourcePath } | { action:'delete' }
  // 'get' → { available, premium, avatar: AvatarOut }; 'create' (also used for Redo) → { avatar: AvatarOut }
  export const avatarPath = (userId: string, version: number) => `${userId}/avatar/v${version}.png`;
  export const AVATAR_ERRORS = { premiumRequired: 'premium_required', unavailable: 'avatar_unavailable', noAvatar: 'no_avatar' } as const;
  ```

- [ ] **Step 1: Write failing tests.** Use an in-memory repo fake.
  - **Gate order:**
    - a free user on `create` gets 403 `premium_required`, and `draw` and `readObject` are not called;
    - premium with `available()` false gets 503 `avatar_unavailable`, and `draw` is not called.
  - **Source photo checks:**
    - a `sourcePath` not under `<uid>/avatar-src/` gives 400, with no reads;
    - in each of these cases the source path is in `removeObjects` calls:
      - success;
      - `draw` throws, which returns 503 `ai_busy`;
      - `writeObject` throws.
  - **First create:** writes `<uid>/avatar/v1.png` and upserts version 1 with `transparent` from `draw`.
  - **Redo:**
    - From v1, a successful Redo writes v2 first and upserts it. Only then does it remove `v1.png` and its look paths, and call `deleteLooks(userId, 1)`.
    - When `draw` fails on Redo, the v1 row and files are untouched.
  - **Delete:** removes the avatar file and all look paths, and calls `deleteAvatar` and `deleteLooks(userId)`. Deleting with no avatar still returns 200.
  - **Get:** for a free user returns `{ premium:false, avatar:null }`, without signing a URL.
- [ ] **Step 2:** Run `npx vitest run tests/api/avatar.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Migration `0005_avatar.sql`:**
    - `avatars(user_id uuid primary key, version int not null, image_path text not null, transparent boolean not null, created_at timestamptz not null default now())`;
    - `avatar_looks(user_id uuid not null, avatar_version int not null, look_key text not null, garment_ids uuid[] not null, image_path text not null, dots jsonb not null, created_at timestamptz not null default now(), primary key (user_id, avatar_version, look_key))`;
    - both have user FK and cascade matching `garments.user_id` in `0001_init.sql`, RLS enabled, a select-own policy, and no client write policies.
  - **Service:** wraps `draw` with the existing `withGuard`-style timeout, using `deps.timeoutMs` (RENDER_TIMEOUT_MS) without demo caching.
  - **Route:**
    - `app/api/avatar/route.ts`: `POST` with the `currentUserId` pattern of `app/api/outfits/route.ts`, `export const maxDuration = 60`, and `cache-control: no-store`;
    - `defaultAvatarDeps()` wires `available: () => avatarProvider() !== null`.
  - **Messages:** add `avatar_unavailable` → "Avatars aren't available yet." and `no_avatar` → "Create your avatar first." to `messageForError`.
- [ ] **Step 4:** Run `npx vitest run tests/api/avatar.test.ts && npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 5:** Commit: `feat(avatar): avatar table, service and route`.

### Task 4: Avatar-Look pictures service

**Files:**
- Create: `lib/db/avatarLooks.ts`, `app/api/avatar/look/route.ts`
- Modify: `lib/db/closet.ts` (delete flow), its `ClosetRepo`
- Test: `tests/api/avatarLook.test.ts`, `tests/api/closet.test.ts`

**Interfaces:**
- Consumes: `dressAvatar`, `locatePieces` (Task 1); `lookKey`, `slotFor`, `resolveDots`, `Dot` (Task 2); `AvatarRepo` pieces and `AVATAR_ERRORS` (Task 3); `withGuard` signature from `lib/ai/guard.ts`; `GarmentRow` from `lib/db/closet.ts`.
- Produces:
  ```ts
  export type AvatarLookOut = { imageUrl: string; dots: Record<string, Dot>; avatarVersion: number };
  export interface AvatarLookRepo {
    isPremium(userId: string): Promise<boolean>; isDemo(userId: string): Promise<boolean>;
    getAvatar(userId: string): Promise<AvatarRow | null>;
    listGarments(userId: string): Promise<GarmentRow[]>;
    readObject(path: string): Promise<Uint8Array>; writeObject(path: string, png: Uint8Array): Promise<void>;
    getLook(userId: string, version: number, key: string): Promise<{ imagePath: string; dots: Record<string, Dot> } | null>;
    putLook(row: { userId: string; version: number; key: string; garmentIds: string[]; imagePath: string; dots: Record<string, Dot> }): Promise<void>;
    signedUrl(path: string): Promise<string>;
  }
  export type AvatarLookDeps = { repo: AvatarLookRepo; dress: typeof dressAvatar; locate: typeof locatePieces;
    available: () => boolean; guard: typeof withGuard; renderTimeoutMs: number; locateTimeoutMs: number };
  export async function runAvatarLookAction(userId: string, input: unknown, deps: AvatarLookDeps): Promise<{ status: 200|400|403|409|503; body: Record<string, unknown> }>;
  // input { garmentIds: string[] } (1–8 ids) → 200 AvatarLookOut
  export const LOCATE_TIMEOUT_MS = 8000;
  // ClosetRepo gains: deleteAvatarLooksWith(userId: string, garmentId: string): Promise<string[]>  (returns image paths to remove)
  ```

- [ ] **Step 1: Write failing tests.**
  - **Gates:**
    - free → 403, no reads;
    - unavailable → 503;
    - no avatar → 409 `no_avatar`;
    - an id not in the caller's active closet → 400;
    - 0 ids or 9 ids → 400.
  - **Cache:** a hit returns the stored dots and a signed URL, with no `dress` call. The same ids in a different order also hit.
  - **Miss:**
    - `dress` gets the avatar bytes plus each garment's `cutoutPath` bytes;
    - it writes `<uid>/avatar/v<version>-<12-hex hash of key>.png`;
    - `putLook` stores dots from `resolveDots`.
  - **Locate fallback:** when `locate` throws or times out, the result is still 200, with every dot at its slot centre (Review Focus 5 path).
  - **Dress failure:** `dress` throwing → 503 `ai_busy`, and no `putLook`.
  - **Demo guard:** `guard` is called with key `avatar-look:<uid>:<version>:<lookKey>` and `demo: isDemo`.
  - **Closet test** (Review Focus 1): deleting a garment calls `deleteAvatarLooksWith(userId, id)` and removes the returned paths from Storage.
- [ ] **Step 2:** Run `npx vitest run tests/api/avatarLook.test.ts tests/api/closet.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Locate:** `label` is the garment name. Wrap `locate` in its own `Promise.race` with `locateTimeoutMs`. A failure there must not fail the request.
  - **Garment delete:** the Supabase `deleteAvatarLooksWith` uses `garment_ids @> array[id]` and returns the deleted `image_path`s.
  - **Route:** `POST /api/avatar/look` with `maxDuration = 60`.
- [ ] **Step 4:** Run `npx vitest run tests/api && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(avatar): look pictures with cached dots`.

### Task 5: Profile avatar section

**Files:**
- Create: `components/AvatarSection.tsx`, `components/avatar.module.css`
- Modify: `app/profile/page.tsx` (new section before "Your plan")
- Test: `tests/components/AvatarSection.test.tsx`

**Interfaces:**
- Consumes:
  - `POST /api/avatar` actions (Task 3);
  - `prepareImage`, `UnsupportedImageError` (`lib/image/prepare.ts`);
  - the browser Storage upload helper in `lib/ui/closetClient.ts` (upload to `<uid>/avatar-src/<uuid>.jpg`);
  - `Button`, `Badge`, `UpgradeButton`, `messageForError`.
- Produces:
  ```tsx
  export function AvatarSection(props: { api?: AvatarApi }): JSX.Element
  export type AvatarApi = {
    get(): Promise<{ available: boolean; premium: boolean; avatar: AvatarOut }>;
    create(sourcePath: string): Promise<{ avatar: AvatarOut }>;
    remove(): Promise<void>;
    upload(file: Blob): Promise<string>;   // returns the avatar-src path
  };
  ```

- [ ] **Step 1: Write failing tests.** Use a fake `AvatarApi`.
  - **Free user:**
    - shows "See it on you" and an Upgrade button;
    - shows no file input.
  - **Premium, unavailable:** shows "Avatars aren't available yet", and no file input is enabled.
  - **Premium, no avatar:**
    - the file input / "Create my avatar" is disabled until the consent checkbox (label = the exact consent copy) is ticked.
    - After choosing a file, the button shows "Drawing your avatar…" with `aria-busy="true"`.
    - On success, the avatar image shows with a visible "Concept" badge, plus "Redo" and "Delete avatar".
  - **Bad file** (Review Focus 4): a file whose `prepareImage` throws `UnsupportedImageError` shows the existing upload error copy, and `upload` is never called.
  - **create fails:** the previous avatar stays shown, and the `messageForError('ai_busy')` copy appears.
- [ ] **Step 2:** Run `npx vitest run tests/components/AvatarSection.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The default `api` uses `fetch('/api/avatar', …)` and the Storage helper.
  - Styles use only tokens. The avatar sits on `--paper-raised` when `transparent` is false.
- [ ] **Step 4:** Re-run, plus `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(avatar): profile avatar section`.

### Task 6: AvatarFigure on the runway

**Files:**
- Create: `components/AvatarFigure.tsx`
- Modify: `components/LooksCarousel.tsx`, `components/looks.module.css`, `app/looks/page.tsx`
- Test: `tests/components/AvatarFigure.test.tsx`

**Interfaces:**
- Consumes: `dollLayout`, `slotFor`, `Slot`, `Dot` (Task 2); `POST /api/avatar/look`, `GET` via `/api/avatar` `get` (Tasks 3–4); `ClosetGarment` (`lib/db/closet.ts`); the `Badge` component.
- Produces:
  ```tsx
  export type FigureState = { kind: 'doll' } | { kind: 'ai'; imageUrl: string; dots: Record<string, Dot> };
  export function AvatarFigure(props: {
    avatar: { url: string; transparent: boolean };
    pieces: { id: string; slot: Slot; imageUrl: string | null; name: string }[];
    state: FigureState; front: boolean;
  }): JSX.Element
  // LooksCarousel gains optional props:
  //   avatar?: { url: string; transparent: boolean } | null
  //   lookPictures?: Record<string /*lookKey*/, FigureState>
  //   onOpenFocus?: (index: number) => void
  ```

- [ ] **Step 1: Write failing tests.**
  - **Doll state:** renders the avatar image plus one layer per piece, positioned from `dollLayout` (`style.left/top` as %). The Concept badge is present.
  - **AI state:** renders the AI image. The doll layers are still mounted until the image `load` event fires, then they are removed (crossfade).
  - **Sway:** `front` adds the sway class, and a non-front figure doesn't have it.
  - **LooksCarousel:**
    - with `avatar` set, it renders `AvatarFigure` per Look;
    - with `avatar` null, it renders exactly as before (existing snapshot or assertions still pass).
  - **Looks page** (Review Focus 3): when `/api/avatar/look` answers 403 or 503, that Look stays in doll state and no `role="alert"` appears.
- [ ] **Step 2:** Run `npx vitest run tests/components/AvatarFigure.test.tsx tests/components`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Page wiring:**
    - The Looks page calls `/api/avatar` `get` once.
    - When `premium && avatar`, after a successful Style me, it requests `/api/avatar/look` for each Look in order, front first and one at a time. It fills `lookPictures[lookKey]`.
    - The slot comes from `slotFor(category, name + ' ' + tags.join(' '))`.
    - Premium users without an avatar see the link "Create your avatar to see Looks on you" (to `/profile`).
  - **Sway:** a CSS keyframe in `looks.module.css` using the Global Constraints values.
- [ ] **Step 4:** Re-run `npx vitest run tests/components tests/ui && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(avatar): avatar figures on the looks runway`.

### Task 7: Focus mode, dots and Garment panel

**Files:**
- Create: `components/LookFocus.tsx`
- Modify: `components/LooksCarousel.tsx`, `components/looks.module.css`
- Test: `tests/components/LookFocus.test.tsx`

**Interfaces:**
- Consumes: `AvatarFigure`, `FigureState` (Task 6); `dollLayout`, `resolveDots` (Task 2); `ClosetGarment`; `Badge`.
- Produces:
  ```tsx
  export function LookFocus(props: {
    look: Look; index: number; total: number;
    avatar: { url: string; transparent: boolean };
    pieces: { id: string; slot: Slot; imageUrl: string | null; name: string }[];
    garments: Record<string, ClosetGarment>;
    state: FigureState; onClose: () => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Write failing tests.**
  - **Dialog:**
    - it is `role="dialog"`, labelled by the Look name;
    - focus moves inside on open;
    - Escape and the × button call `onClose`;
    - the opener figure button gets focus back.
  - **Dots:**
    - one button per piece, in Look order, with accessible names "1, Linen slip dress", "2, …";
    - positions come from `state.dots` in AI state and from slot centres in doll state.
  - **Panel:** activating a dot opens a panel (`aria-live="polite"`) with:
    - the cut-out;
    - the name;
    - tags;
    - the Reworked badge if `isUpcycled`, or the Accessory badge if an accessory;
    - a "View in closet" link to `/closet?g=<id>`.
  - **Deleted piece** (Review Focus 1): a dot whose id is missing from `garments` shows "This piece is no longer in your closet." and no link.
  - **Concept badge:** visible in focus mode.
  - **No shopping:** the rendered text contains no `$`, "bag", "shop" or "buy", and every `<a>` `href` starts with `/`.
  - **Runway figure button:** named "Look 2 of 3, Gallery evening. Open."; Enter opens focus.
- [ ] **Step 2:** Run `npx vitest run tests/components/LookFocus.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Layout:** the panel is beside the figure at ≥768px and a bottom sheet below that, using CSS only.
  - **Dot styling:** 28px ink circle, paper numeral, 2px paper ring; focus ring per the global `:focus-visible`.
  - **Open/close motion:** focus open/close uses `--dur-base` / `--ease`, and the other figures fade.
  - **Closet deep link:** if `/closet` doesn't read `?g=`, make it select that garment on load (one `useEffect` in `app/closet/page.tsx`).
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit && npm run build`. Expected: all tests pass, the build succeeds.
- [ ] **Step 5:** Commit: `feat(avatar): look focus mode with dots and garment panel`.

### Task 8: Demo avatar warm-up and docs

**Files:**
- Modify: `scripts/prescan.ts`, `scripts/README.md`, `docs/DEMO-DAY.md`, `.gitignore`
- Test: `tests/ui/prescan.test.ts`

**Interfaces:**
- Consumes: `runAvatarAction` and `defaultAvatarDeps` (Task 3), `runAvatarLookAction` (Task 4), `runOutfitsAction` (existing), and the prescan's existing demo-user setup.
- Produces: `npm run prescan -- --avatar-photo <local path> --occasion <text>`.

- [ ] **Step 1: Write failing tests** for an exported `parseAvatarArgs(argv: string[]): { photo: string | null; occasion: string | null }`:
  - `['--avatar-photo','C:/x/me.jpg','--occasion','gallery']` → both set;
  - missing flags → nulls;
  - `--avatar-photo` with no value throws `Error('--avatar-photo needs a file path')`.
- [ ] **Step 2:** Run `npx vitest run tests/ui/prescan.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** When `photo` is set:
  1. read the local file (JPEG or PNG only, at most 10 MB, or exit with a clear message) and upload it as-is — no resize in Node;
  2. upload it to `<demoUid>/avatar-src/<uuid>.jpg`;
  3. call `runAvatarAction(create)`;
  4. run Style me with `--occasion`;
  5. call `runAvatarLookAction` for each returned Look;
  6. print `avatar: ok` and `avatar looks warmed: N/3`.

  Never copy the photo into the repo, and add `demo-photos/` to `.gitignore` as a safe local folder.
  - **`DEMO-DAY.md` additions:**
    - "Set `AVATAR_PROVIDER=openai` and `OPENAI_API_KEY`."
    - "The teammate's consented photo stays on the presenter's laptop (`demo-photos/`), never committed."
    - "Run prescan with `--avatar-photo` and the same occasion you'll use on stage; check `avatar looks warmed: 3/3`."
    - "Don't add or remove closet pieces afterwards."
- [ ] **Step 4:** Run `npx vitest run && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(avatar): demo avatar warm-up in prescan`.

---

## Rulings made while planning

- **Ruling: transparent avatars come from the provider, not `removeBackground`.**
  - What: OpenAI `background: 'transparent'` gives a cut-out; paid Gemini gives a plain background and the doll uses the `paper-raised` card fallback.
  - Why: `lib/image/prepare.ts` background removal is browser-only (`@imgly/background-removal`), so the server can't run it as the spec suggested.
  - Cost if wrong: a client-side removal step on Profile would be needed later.
- **Ruling: Garment slots are inferred from name + tags keywords, with no new column.**
  - Why: `garments` has only `clothing | accessory`, and quick-add pieces have no scan `garment_type`.
  - Cost if wrong: some pieces land in the wrong doll slot until the AI picture replaces the doll.
- **Ruling: dots are located with an 8 s cap inside the same request.**
  - Why: it keeps one round trip per Look and stays under `maxDuration = 60` (50 s render + 8 s locate).
  - Cost if wrong: on slow days dots use slot positions more often.
