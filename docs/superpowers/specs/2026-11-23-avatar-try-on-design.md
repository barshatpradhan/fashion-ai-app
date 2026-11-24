# Avatar try-on for Looks: design

Status: approved in conversation on 2026-11-23, pending review of this document.
Extends: `docs/superpowers/specs/2026-11-19-ai-circular-fashion-app-design.md` (the main spec). Terms follow `GLOSSARY.md`; new terms are listed in §9.
Visual reference: "Try the Look — Runway" (the team's design prompt and its AI Studio prototype). It provides the runway, focus mode and numbered dots. Its shopping parts are not used.

## 1. Intent and why

Today a "Style me" request returns three Looks. Each Look is shown as a stack of the user's own closet cut-outs on the depth-line runway (main spec §7.3). The cut-outs show *what* to wear together, but not how it looks on *you*.

This feature lets a Premium user see each Look worn by an avatar of themselves:

1. The user creates an avatar once from one full-length photo.
2. The avatar appears in every Look on the runway.
3. The figures float side by side and glide left and right.
4. Tapping the front figure brings it into focus, with numbered dots on each piece.
5. Tapping a dot shows that one closet piece on its own.

The point is the same as the rest of Wardrobe OS: make clothes the user already owns feel new, so they rewear and remake instead of buying.

## 2. Goals, non-goals, anti-goals

### Goals
- **Avatar.** A stylised avatar (a fashion-sketch figure, not a photo) that keeps the user's build, skin tone and hair, made from one full-length photo.
- **Runway of avatars.** Each "Style me" Look is shown on the avatar, on the existing Looks runway, with the existing spring, drag and keyboard behaviour.
- **Focus mode.** Tapping the front figure isolates it. Numbered dots mark each Garment in the Look, and a dot opens a panel for that Garment alone.
- **Never broken.** The user always sees something immediately (the paper doll, §5.3). The AI picture replaces it when ready.
- **Demo.** The feature is in the capstone demo build, with the demo account's avatar and Looks made ahead of time.

### Non-goals
- **Redesign Recipe results on the avatar.** The avatar wears only Style me Looks, not concept images of upcycled garments.
- **Photo-real try-on or a face-accurate "digital twin".**
- **Pose control, 360° views, video or walking animation.** The motion is the runway plus a gentle sway, done in CSS and JS.
- **More than one avatar per user.**
- **Avatar try-on for free users** beyond a locked teaser.

### Anti-goals: a failure even if it technically works
- **Shopping.** Any price, bag, bundle, "shop the look" or store link. The reference has all of these; none may appear. Dots open the user's own Garment.
- **Real-person deception.** An avatar picture presented as a real photo. Every avatar picture shows the **Concept** badge.
- **Silent body-photo storage.** Keeping the user's full-length photo after the avatar is made, or using it for anything else.
- **A broken runway.** A blank or broken runway on stage because an AI picture is slow.

## 3. Constraints

- **Premium only (decided).**
  - Free users keep today's cut-out Looks and see a locked "See it on you" teaser that leads to Upgrade.
  - In demo mode the access check is `is_premium`, as with recipes after fix C1, so the hidden Free/Premium switch shows both states.
- **Cost.** Each Look on the avatar is one AI image plus one vision call, so a Style me request costs up to 3 extra images.
  - Images are cached per avatar and Look (§5.4), so the same Look never costs twice.
  - Premium Looks are unlimited (main spec), so no allowance is spent.
- **Privacy (changes main spec §11).** §11 says photos are of garments, not people. This feature adds one photo of a person.
  - **Consent first.** The user ticks a consent line before uploading.
  - **Avatar step only.** The photo is used only to make the avatar.
  - **Deleted straight away.** It is deleted from Storage as soon as the avatar is made, or if making it fails.
  - **Delete any time.** The user can delete the avatar at any time, which also deletes its cached Look pictures.
  - **Provider.** The photo and avatar go only to a paid AI provider, never a free tier (§8.1).
- **Honesty.** Every avatar and avatar-Look picture carries the Concept badge, including in focus mode.
- **Owned pieces only.** The avatar wears only the Garments in the Look. The image prompt says to add nothing else (no extra items, logos or text).
- **Reduced motion.** No sway, the runway jumps (as today), and focus mode appears without a zoom.
- **Stack.** Next.js App Router, Supabase (Postgres, private Storage, RLS), `lib/ai/imageGen.ts` provider switch (`IMAGE_PROVIDER`: Gemini `gemini-2.5-flash-image` / OpenAI `gpt-image-1`), `withGuard` demo cache, `lib/depth/engine.ts`.

## 4. Approaches considered

| Approach | What it is | Trade-off |
|---|---|---|
| A. AI image only | An AI draws the avatar wearing each Look; a vision pass places the dots | Closest to the reference; slow (about 10–20 s per Look) and fails to a flat-lay |
| B. Paper doll only | Cut-outs layered on a base avatar at fixed body spots | Instant, free, dots come free; looks like a collage |
| **C. A, with B as backup (chosen)** | B shows instantly; A replaces it when ready; B stays if A fails | Most reliable for the demo; a little more work than A |

Avatar style alternatives considered: photo-real twin (faces drift between images, deepfake and privacy concerns), and the user's own photo with only the clothes repainted (needs a try-on model, keeps the body photo central). **Stylised figure chosen.**

## 5. Design

### 5.1 Creating the avatar (Profile)
- **Entry.** Profile → "Your avatar" section → **Create my avatar**. Premium only; free users see the locked teaser.
- **Before upload:**
  - The page shows a short note: one full-length photo, standing, plain background, fitted clothes.
  - The consent checkbox reads: "Your photo is used once to draw your avatar, then deleted. Avatar pictures are AI concepts."
  - Upload stays disabled until it is ticked.
- **Server step** (`POST /api/avatar`):
  1. Store the photo in a private path.
  2. Ask the image model for a stylised full-length figure, front-facing, arms slightly away from the body, in plain neutral base clothes (fitted tee and leggings), on a transparent or plain background. It keeps build, skin tone and hair from the photo.
  3. Run the result through the existing background removal (`lib/image/prepare.ts`, 12 s timeout) so the avatar is a transparent cut-out, whichever provider drew it. *(builder-check call)* If removal fails, keep the plain-background PNG; the paper doll then draws the avatar on a soft `paper-raised` card instead of free-standing.
  4. Save the avatar PNG.
  5. **Delete the original photo** in a `finally` block, so it goes whether the request succeeds or fails.
- **Redo is an atomic swap.** *(builder-check call)* The new avatar is written as the next `version` first. Only after it succeeds are the old avatar and its cached Look pictures deleted. If Redo fails, the user keeps the avatar they had.
- **Waiting and errors.** While it runs, the button shows its busy ring with "Drawing your avatar…". On failure it shows the usual "Our stylist is busy…" message and nothing is kept.
- **Afterwards.** The avatar is shown with the Concept badge, plus **Redo** (upload again) and **Delete avatar**.
- **Delete avatar** removes the avatar and every cached Look picture made from it.
- **No avatar yet.** The Looks screen behaves exactly as today, with a small "Create your avatar to see Looks on you" link for Premium users.

### 5.2 The runway (Looks screen)
- The same three Looks and the same depth-line runway, engine and controls (`LooksCarousel`).
- Each runway item becomes an **avatar figure** instead of a cut-out stack.
- **Idle sway.** The front figure breathes and sways: about ±1.5° rotation and 4px drift on a slow loop (about 6 s). The others hold still, blurred by depth as today.
- **Focus mode** (tap or Enter on the front figure):
  - The other figures fade out and the chosen one centres and scales up (`dur-base`, `ease`).
  - Numbered dots ① ② ③ appear on its pieces, and a header shows the Look name and its reason.
  - A close button (×) and Escape return to the runway.
- **Dot → Garment panel.** Tapping a dot (or Tab, then Enter) opens a small panel beside the figure on desktop, or a bottom sheet on a phone. It shows:
  - that Garment's own cut-out;
  - its name, fabric and tags, plus the Reworked / Accessory badge where relevant;
  - **View in closet**, which opens that Garment on `/closet`.

  The dot under the pointer or in focus also highlights its piece in the list, as in the reference.
- **Saving.** Saving a Look works as today; the avatar picture is not part of the saved Outfit.
- **Where avatar pictures appear.** *(builder-check call)* Avatar pictures appear in only two places: the Looks runway (and its focus mode) and the Profile avatar section. Saved Outfits, the Story card and shared images never show them. The Concept badge is the existing shared `Badge variant="concept"`.

```
 LOOK 2 · Gallery evening                        [Concept]   ×
                     ▓▓ FIGURE ▓▓
                     ① linen slip dress
                     ② woven tote          ┌─────────────────────┐
                     ③ sandals             │ [cut-out] Woven tote │
                                           │ Accessory · straw    │
 "The slip dress with the tote keeps it    │ View in closet →     │
  light."                                  └─────────────────────┘
```

### 5.3 Paper doll (instant layer and fallback)
- The doll is the avatar PNG with the Look's Garment cut-outs layered on top at body **slots**:

  | Slot | Placement |
  |---|---|
  | top | chest to hips |
  | outer | over top, slightly wider |
  | bottom | waist to ankles |
  | one-piece | shoulders to knees or ankles |
  | shoes | feet |
  | accessory | at hand or shoulder by type |

- **Slot source.** Each Garment's slot comes from its garment type (scan `garment_type` or quick-add type), using a fixed map. Unknown types go to `top` for clothing and `accessory` for accessories.
- **Dots on the doll.** Dot positions come from the slot boxes, so focus mode and dots work on the doll too.
- **Hand-off.** The doll shows instantly. When the AI picture for that Look arrives it crossfades in (`dur-slow`), and the dots move to the detected positions.
- **Fallback.** If the AI picture fails or takes longer than the render timeout, the doll stays, with no error shown.

### 5.4 AI picture per Look
- **Request.** `POST /api/avatar/look` takes the Look's garment ids. It runs only for Premium users, and only for ids in the user's closet, as for outfits today.
- **Generate.** Send the image model the avatar PNG plus each Garment's cut-out. Prompt: draw the same figure, same style and proportions, wearing exactly these pieces, front-facing, plain background; no other items, no text, no logos.
- **Locate.** Send the result to the vision model, asking for one box per Garment id (normalised 0–1). Each dot goes at the box centre.
  - A Garment with no box falls back to its slot position.
  - A vision call that fails or times out puts all dots at their slot positions.
- **Cache.** Key: avatar version + sorted garment ids. Store the PNG and the dot positions; the same Look on the same avatar returns at once. Deleting the avatar or a Garment drops its entries.
- **Order.** The three Looks render in the order they appear on the runway, front Look first.
- **Demo account.** The avatar and the Looks for the rehearsed "Style me" (main spec M5: final closet + occasion) are made ahead by the prescan script, through `withGuard` and `demo_cache` as today.

### 5.5 Data (proposal)
- **`avatars` table:** `user_id` (primary key), `version` (int, bumped on Redo), `image_path`, `created_at`.
  - RLS: select own; all writes through the service role.
- **`avatar_looks` table:** `user_id`, `avatar_version`, `look_key` (sorted garment ids), `image_path`, `dots` (jsonb `{garmentId: {x, y}}`), `created_at`.
  - Primary key: `user_id, avatar_version, look_key`.
  - RLS: select own; writes through the service role.
- **Storage:** private paths under the user's folder in the existing `garments` bucket (`<uid>/avatar/…`).
  - The upload photo lives at a separate `<uid>/avatar-src/…` path and is always removed.
- **Garment slots:** the map lives in code (`lib/domain/slots.ts`); no new column.

### 5.6 Motion and visual
- Use the design system's tokens and the existing depth engine.
- Focus mode, dot and panel styling follow the reference's layout, in REVIVO's paper/ink palette.
- Dots are 28px ink circles with paper numerals and a 2px paper ring, using the `accent` focus ring.
- The Concept badge sits top-left of the figure in both runway and focus mode.

## 6. Accessibility
- **Figures.** Each figure is a button: "Look 2 of 3, Gallery evening. Open."
- **Dots.** Dots are buttons in reading order: "1, Linen slip dress".
- **Focus mode.** Focus mode is a dialog: focus moves in, Escape closes it, and focus returns to the figure.
- **Garment panel.** The panel is `aria-live="polite"`.
- **No hover-only content.** Everything works by keyboard and touch.

## 7. What's left to the builder
- **Prompt wording** for avatar and Look images, including how to keep the stylised figure consistent across Looks. Tune it against the team's demo photos.
- **Slot details.** The exact slot boxes and the garment-type → slot map.
- **Look response.** Whether `/api/avatar/look` is called per Look from the client (simpler, progressive) or once for all three. Per Look from the client is my call (it shows each picture as soon as it is ready), using the existing `RENDER_TIMEOUT_MS`.
- **Cut-out quality.** How to handle Garments whose cut-out is a full photo (background removal failed). They are still sent to the model, and the doll shows them in their slot box with `object-fit: contain`.
- **Tests.** Cover:
  - premium gate (free → 403 `premium_required`);
  - owned-ids check;
  - photo deleted on success and on failure;
  - cache hit;
  - avatar delete cascades to its Look pictures;
  - dot fallback to slots;
  - Concept badge present in runway and focus mode;
  - no shop links or prices anywhere.

## 8. Owner decisions (decided 2026-11-23)
1. **Paid service only for body photos.**
   - **Which calls.** Avatar creation, and every Look picture (which sends the avatar), run only on a paid provider: OpenAI `gpt-image-1`, or Gemini with a paid key. This applies whatever `IMAGE_PROVIDER` says for concept images.
   - **Settings.** Add `AVATAR_PROVIDER` (`openai` | `gemini-paid`) with its key. Env validation for the avatar routes requires them.
   - **Without a paid key.** `/api/avatar` returns `503 avatar_unavailable`. The Profile button reads "Avatars aren't available yet". Looks fall back to today's cut-outs, and nothing is sent to a free tier.
   - **Vision pass.** The dot-finding vision call also uses the paid provider.
2. **The demo avatar comes from a consenting teammate.**
   - The photo stays only on the presenter's laptop. It is never committed and never in the repo, and is passed to the prescan script as a local file path argument.
   - The script makes the avatar, then deletes its uploaded copy from Storage, as in §5.1.
   - The avatar PNG and the demo Looks pictures are stored like any user's (`avatars` / `avatar_looks`), under the demo account.
3. **Main spec §11 is updated** with: "Premium users may upload one full-length photo of themselves to make an Avatar. It is sent only to a paid AI provider, used once, and deleted; the Avatar can be deleted at any time."

## 9. Glossary additions
- **Avatar:** a stylised AI drawing of the user, made once from their full-length photo, used to show Looks on them. It is always labelled as a concept. *Avoid:* twin, model, mannequin.
- **Paper doll:** the instant version of a Look on the Avatar, with the user's cut-outs layered at body slots. It is internal only; users just see their Look.
