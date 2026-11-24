# REVIVO: Design

REVIVO is the name of the AI-driven circular fashion app (from the team's Canva decks). "Wardrobe OS" (WOS) is the name of its styling part.

Date: 2026-11-19
Status: approved by the owner on 2026-11-22

Marking used below:
- **(decided)**: the project owner chose this in conversation.
- **(proposal)**: Claude's call; the owner may still change it.
- **(builder)**: left to the builder.

---

## 1. Intent and why

This is a capstone project for a four-person team. Its purpose is to test whether a "wardrobe-first" fashion app gives consumers real value and works as a business. The idea is that AI helps people get more from clothes they already own instead of buying new ones.

Source material lives in this folder and in `C:\z-Local-Disk-D\AI-Fashion-App\`:
- `2.0 Capstone Proposal.pdf`: territory, gap, evidence and strategic directions.
- `AI_Driven_Circular_Fashion_Proposal.docx` (in the owner's Downloads): product framework and risks.
- The slide deck "AI-Driven Circular Fashion" (claude.ai artifact).

The app has three linked functions, all from the proposals:

1. **Fashion History and Attribution.** The cultural and historical roots of a garment's design, pattern or technique, shown *only when trustworthy information exists*. The proposals tie this to research on cultural borrowing and appropriation.
2. **Upcycling and Reconstruction.** The user photographs a garment. The app identifies its features and suggests DIY redesigns, each with a difficulty level. **One redesign per Scan is free; the other two or three are Premium** (§6.6).
3. **Wardrobe Operating System, or WOS (freemium).** The user uploads their clothes and accessories, and the app styles looks from them, mixing in upcycled pieces. Free users get a limited number of uploads and looks; Premium is unlimited (§6.6 rule 5).

The first version is a **working web demo** for the capstone presentation, run live from a laptop on a projector. It must:
- prove the core loop works with real AI: photo, then insight and redesign, then closet and outfits;
- look like a polished consumer product, not a data tool;
- show the panel a believable path to scale, owned data and, later, a model of the team's own.

## 2. Goals, non-goals, anti-goals

### Goals
- A live scan from a real photo returns the garment type, its parts, pattern, colours, a fabric guess with a confidence level, redesign ideas with difficulty levels, and history or insight where a vetted source exists.
- Every factual history or culture claim shown to users comes from the team's curated knowledge base and carries a visible source.
- The user can correct the AI's fabric or garment guess. Every scan and every correction is stored as owned, labelled data.
- A shareable **Garment Story card** can be downloaded as an image.
- A **simple working Wardrobe OS**:
  - users upload clothes and accessories to their closet;
  - the AI styles looks from the closet using the user's style profile;
  - free and Premium allowances follow §6.6 rule 5, with no real payment.
- **No shopping of any kind (decided, replaces the earlier gap-filler idea).** The app never suggests buying anything, new or secondhand. Outfits are built only from Garments the user already owns.
- AI "after" images of the redesigned garment can be switched between providers with one setting:
  - free while testing;
  - a paid, higher-quality provider on presentation day.
- A distinctive animated look based on the owner's reference videos and design prompts (section 7).
- It costs almost nothing to run during development.

### Non-goals (first version)
- Real payments or subscriptions.
- A native iOS or Android app.
- Training a custom model. The design keeps the door open, but no training happens now.
- AI-generated video (for example the moving figures in reference video 4).
- Social feeds, a resale marketplace, affiliate revenue, or other languages.
- A full catalogue of world fashion history. The demo knowledge base is small and hand-curated.

### Anti-goals (a failure even if it technically works)
- The AI **inventing** history, cultural origin or attribution claims. A confident made-up origin story about a cultural garment would damage the project's core argument.
- Pushing users to buy clothes, new **or** secondhand. That contradicts the anti-overconsumption message; the app is about using what you already own.
- The live demo failing on stage because of a slow network, a free-tier limit or a paused database.
- The app looking like a dashboard or spreadsheet.

## 3. Constraints
- **Near-zero cost.** Free tiers throughout development. The only spend is optional paid image generation on presentation day, using the owner's key.
- **Presentation setting.** A browser on a laptop, shown on a projector. It must also work in a phone browser.
- **Skills.** The owner is comfortable writing code and wants a say in tools and structure.
- **Free-tier realities** the design must handle:
  - Supabase free projects **pause after about a week of inactivity**.
  - The Gemini free tier has per-minute and per-day request limits, and Google may use free-tier inputs to improve its models.
  - Vercel's free tier limits how long a server function can run.

## 4. Approaches considered

### 4.1 App shape (decided: Next.js web app)
| Option | Trade-off | Outcome |
|---|---|---|
| **Next.js web app + Gemini** | Free, one codebase, looks like a real app on a projector, deploys free on Vercel | **Chosen** |
| Real phone app (Expo or Flutter) | Feels authentic, but more setup and more that can break on the day | Rejected for the first version |
| Python + Streamlit | Fastest in Python, but looks like a data tool; the bold Wardrobe OS theme would be hard to do | Rejected |
| Clickable mockup only | Free and safe, but doesn't prove the AI works | Rejected |

### 4.2 Backend (decided: option 2)
| Option | Trade-off | Outcome |
|---|---|---|
| 1. Knowledge base as JSON files, closet in browser storage | Free and fastest. No real database, so corrections are lost and scale exists only on slides | Rejected |
| **2. Next.js + Supabase free tier** (Postgres, vector search, storage, auth) | Free, about a day more setup. The knowledge base and owned data can be shown to the panel, and data is collected from the first scan | **Chosen** |
| 3. Separate Python AI service + Next.js + Postgres | Ready for a custom model, but two codebases and deployments for a demo | Rejected for now; it is the scale path (section 9) |

Option 2 **replaces** an earlier decision to keep the closet in browser storage.

### 4.3 How fabric and garment knowledge works (proposal, agreed in discussion)
- There is no ready-made public fabric database to look things up in.
  - Fashionpedia and DeepFashion label garment types and details well (collar, sleeves, pattern). They have little on fabric composition.
  - A photo alone cannot reliably tell a blend from a pure fabric.
- So:
  - A vision model (Gemini) **recognises** features and gives a fabric guess with a confidence level.
  - The **care label** is the most accurate fabric source: users can photograph it, and the app reads the text.
  - A quick **confirm tap** (for example "Cotton / Silk / Denim") resolves low-confidence guesses, as the risk plan in the proposal says.
  - The team's own **knowledge base** supplies redesign patterns, DIY guides and cited history, matched to the recognised features.

## 5. System overview

```
Browser (Next.js client)                 Next.js server routes (Vercel)                Supabase
────────────────────────                 ──────────────────────────────               ────────
camera/upload
 → resize to ≤1024px
 → background removal (in browser)
 → upload cut-out + original ───────────────────────────────────────────────────────► Storage
                          ─► POST /api/analyze
                               1. vision model → structured JSON (§6.1)
                               2. if fabric confidence low → ask user
                                  (confirm tap or care-label photo → /api/label)
                               3. match features → knowledge base ◄─────────────────► kb_entries
                                  (tag match, then vector similarity)                  (+ embeddings)
                               4. guide writer: AI turns matched entries into
                                  personalised steps; no facts beyond entries
                               5. save scan, matches, guide ────────────────────────► scans, guides
                          ◄─ result
user confirms/corrects ──► POST /api/correct ─────────────────────────────────────────► corrections
save to closet ─────────► POST /api/closet ───────────────────────────────────────────► garments
"after" image ──────────► POST /api/render   (IMAGE_PROVIDER = gemini | openai)
looks (credits) ────────► POST /api/outfits  (closet + style profile → outfits)
```

- Every AI provider sits behind its own small module (`vision`, `writer`, `imageGen`, `embeddings`). Each is chosen by an environment variable, so a provider, or later the team's own model, can be swapped without touching anything else.
- Results are cached by image hash, so re-scanning the same photo makes no new AI call.

## 6. AI pipeline in detail

### 6.1 Vision step (decided: Gemini Flash, free tier)
The vision model returns **JSON only**, checked against a schema. Proposed shape (proposal):

```json
{
  "garment_type": "button-down shirt",
  "category": "top",
  "parts": {"collar": "point collar", "sleeves": "long", "closure": "buttons", "fit": "oversized"},
  "pattern": "vertical stripes",
  "colors": [{"name": "sage", "hex": "#8fa58a"}, {"name": "cream", "hex": "#f3eee2"}],
  "fabric_guess": {"value": "cotton", "confidence": 0.62, "alternatives": ["linen", "polyester blend"]},
  "condition_notes": "slight fading at cuffs",
  "visible_techniques": ["pleating"],
  "tags": ["shirt", "button-down", "cotton", "stripes", "oversized"]
}
```

- If `fabric_guess.confidence` is below a threshold (proposal: 0.7), the result screen asks the user to confirm with two or three quick-choice buttons, or to photograph the care label.
- The care-label photo is read by the same vision model with a "read the composition text" prompt (`/api/label`). The label reading **overrides** the visual guess.
- Prompts ask for observable features only. **The vision step must not output history or origin claims.**

### 6.2 Knowledge base (the team's curated, cited data)
- A Postgres table `kb_entries`, written and checked by the team. Entry kinds:
  - `history`: a cultural or historical note on a garment type, pattern, technique or detail.
  - `redesign`: a redesign recipe, for example an oversized shirt into a two-piece crop set.
  - `fabric`: fabric facts and care notes.
- Each entry has:
  - a title and body;
  - `tags[]` (garment types, patterns, fabrics, techniques it applies to);
  - for redesigns, `difficulty` (beginner no-sew, intermediate, advanced), the tools needed and the step outline;
  - `sources` (JSON list of citation, URL and access date). **Required for `history` entries.**
  - `status` (`draft` or `reviewed`) and `reviewed_by`;
  - an `embedding` vector.
- **Only `reviewed` entries are shown to users.**
- Matching:
  1. Overlap between the scan's `tags` and entry tags, ranked by overlap.
  2. If fewer than N matches, vector similarity between an embedding of the scan description and entry embeddings (Postgres `pgvector`).
- **History is matched strictly by tags (proposal).** `history` entries are matched **only** by explicit tag overlap, never by vector similarity. Without this, a loose match could attach a reviewed but wrong origin to a garment, for example Breton stripe history on any striped shirt. Vector matching applies only to `redesign` and `fabric` entries. As a result, "no verified history yet" will appear more often, which is the safer failure. The team keeps a fixed tag vocabulary (a list in the repo) so tags on scans and entries line up.
- If no `history` entry matches, the app says plainly that no verified history is available for this piece yet. **It never generates one.**
- Seed size for the demo (proposal): about 25 redesign recipes, about 15 history entries and about 10 fabric entries. They should cover the garments the team will actually scan on stage. The team writes the content; the builder provides an import script, for example from a spreadsheet or CSV.

### 6.2a Who writes the knowledge base (decided)
- **Claude drafts, the team reviews.** Claude drafts entries for the stage garments: history with real, checkable sources, redesign recipes and fabric notes.
- Every draft is imported with `status = draft`. A team member checks each one against its sources and then marks it `reviewed`, with their name in `reviewed_by`.
- **Drafts are never shown to users,** including on demo day. A history entry with an unverifiable source is dropped, not softened.

### 6.3 Guide writer
- Input:
  - the scan JSON;
  - the matched entries, each with its id;
  - the user's chosen difficulty, if set.
- Output: a personalised step-by-step guide.
  - Facts come only from the matched entries.
  - Every history sentence keeps its entry's sources, and the UI shows them.
  - Steps are written in plain language, without sewing jargon, as the proposal promises.
- The guide is cached in `guides`, keyed by scan and recipe.

### 6.4 "After" image generation (decided: switchable)
- `IMAGE_PROVIDER` chooses the backend:
  - `gemini` (free tier, for testing);
  - `openai` (paid image model, for presentation day, using the owner's key).
- The prompt is built from the scan's features and the chosen redesign. It shows the redesigned garment as a clean product cut-out on an off-white background, to match the visual style.
- **Demo safety (proposal):** pre-generate and store "after" images for the garments that will be scanned on stage, and serve the stored image if generation is slow or fails.

### 6.5 Wardrobe OS outfits (decided: simple working version)
- The closet is a list of saved garments. Each has a cut-out image, the scan JSON, confirmed fabric, tags and an "upcycled" flag.
- A **style profile** is set during onboarding and can be edited:
  - favourite styles, colours to avoid, typical occasions, climate.
  - (proposal: a few tap-to-choose questions)
- `/api/outfits` sends the AI the closet item ids and tags, the style profile and an optional occasion. The AI returns outfits **made only of existing item ids**.
  - The server rejects any id not in the user's closet.
  - Each outfit has a name and a one-line reason.
- **Owned pieces only (decided).** Every item in an Outfit is a Garment from the user's Closet. If the Closet can't make a complete Outfit for an occasion, the app says so and suggests scanning more of what the user already owns. It never names something to buy.
- "Premium" is a flag on the user's profile, switched by an "Upgrade" button that unlocks it for the demo. No payment. Free users are limited by Upload and Look credits (§6.6 rule 5). The server checks and spends credits, never the browser.

### 6.6 Domain rules (decided in the design review)
Terms follow `GLOSSARY.md` at the project root. Where this section conflicts with anything earlier in the document, this section wins.

1. **Scan vs. Garment (updated).**
   - A Scan is one analysis of one photo for upcycling and history.
   - A Garment is anything in the user's Closet. It gets there in one of three ways, and each uses one Upload:
     - saving a Scan;
     - a **Quick Add**: a photo, the cut-out and light auto-tags (type, colour, category) for styling only, with no history or Recipes;
     - an Accessory upload.
   - A quick-added clothing Garment can be fully scanned later from the Closet without using another Upload.
   - Unsaved Scans never appear in the Closet.
2. **Redesign Recipe vs. Guide.**
   - Recipes are reviewed, shared knowledge-base entries.
   - A Guide is the personalised text for one Scan and one Recipe.
   - Difficulty belongs to the Recipe. Users choose a different Recipe; the AI never rewrites a Recipe at another level.
3. **History needs a Named Style.**
   - History Entries are tagged only with Named Styles from a fixed list (for example `breton-stripe`, `paisley`, `kimono-sleeve`).
   - The vision step returns `named_styles: [{style, confidence}]`, choosing only from that list.
   - At confidence ≥ 0.8 the history shows.
   - Between 0.5 and 0.8 the result asks "Is this paisley?". A "yes" is recorded as a Correction and unlocks the entry.
   - Below 0.5 nothing is suggested.
   - Generic tags (`stripes`, `cotton`, `shirt`) never match History Entries; they match Recipes and Fabric Notes only.
4. **Corrections** cover fabric, garment type and Named Style confirmation only. After a Correction:
   - matching re-runs immediately;
   - existing Guides for that Scan are marked outdated and regenerated when next opened.
5. **Free vs. Premium (updated 2026-11-22; matches the team's $7.99/month freemium model).** The app has two parts with separate rules.

   **A. Upcycling and fashion history (the app's main purpose)**
   - **Scanning is free:** fabric and Named Style insights, History Entries, and the Garment Story Card.
   - **One Redesign Recipe per Scan is free,** with its Guide and Concept Image.
   - **The other two or three Recipes are Premium.**
   - A scan used only to explore does **not** use an Upload.
   - **Which Recipe is free:** the best-matching **beginner (no-sew)** Recipe, so anyone can try it without skills or tools. If no beginner Recipe matches, the best-matching Recipe of any level is free.
   - **Premium Recipes on the Result screen:** shown as locked cards with their title, difficulty and a short teaser. Their steps and Concept Image stay hidden until the user upgrades.
   - **Garment Story Card:** uses the free Recipe, or any unlocked Recipe for Premium users.

   **B. Wardrobe OS (styling)**
   - **Uploads** (adding a clothing item or an accessory to the Closet, even an earring):
     - new users get their **first 10 free**;
     - after that, free users get **5 per week**;
     - Premium is unlimited.
   - **Looks** (generated Outfits). **One Look credit = one "Style me" request, which returns 3 Looks** to swipe through (decided):
     - new users get their **first 10 free**;
     - after that, free users get **5 per week**;
     - Premium is unlimited.
   - **Refill (decided):** both weekly allowances refill gradually, one credit about every 34 hours, rather than all at once. This is the owner's "some hours duration".
   - **Unused credits do not stack** beyond 5.
   - **Saving a scanned garment to the Closet uses one Upload.**
   - **"I made this" (an Upcycled Garment) does not use an Upload (decided).** It rewards the circular behaviour the app exists for.
   - **Saving a Look as an Outfit is free.** Generating it is what uses a credit.
   - **Deleting a Garment does not refund its Upload (decided).** This prevents users from deleting and re-adding pieces to get around the weekly limit.
   - **Failed AI calls refund automatically (decided).** A credit is spent only when the user actually receives results. If a "Style me" request or image generation fails, the credit is returned.

   **C. Premium ($7.99/month):** unlimited Uploads and Looks, plus every Redesign Recipe.
   - **Downgrade (decided):** if a user stops Premium, every Garment stays in the Closet and can still be styled. Only *new* Uploads and Looks fall back to the free weekly allowance.

   **D. Activity Record.** Every Upload, Upcycled Garment ("reconstructed") and generated Look ("styled") is recorded on the user's profile. This is a personal history that also feeds the KPIs (garments transformed, looks styled).

   (This rule overrides any earlier mention of the Closet or Outfits being Premium-only.)
6. **Upcycled Garments.** "I made this" on a Guide creates a **new** Upcycled Garment, linked to the source Garment and the Recipe.
   - The user is asked to photograph the result.
   - If they skip, the Concept Image is used with a visible "concept" label.
   - The source Garment becomes Transformed and is no longer offered in Outfits.
7. **Outfits.**
   - An Outfit has 2–4 active Garments, all from the user's own Closet.
   - It includes an Upcycled Garment whenever the Closet has one.
   - Outfits are generated fresh on request. **Only Outfits the user saves are stored.**
8. **No shopping links anywhere (updated).** The app never links to stores or resale sites (this removes the earlier Gap Item and its ThredUp, Vinted and Depop links). Missing pieces are handled by scanning more of what the user owns, or by a Recipe that transforms an existing Garment.
9. **Scan safety limit.** Scanning is free, but a hidden cap of 20 Scans per user per day protects the free AI tier. The demo account is exempt.
10. **Demo account (updated).** It has a hidden Free/Premium switch, so the presenter can show the free experience live: locked Recipes and the allowance counters. Tapping "Upgrade" then unlocks everything. It is exempt from all limits either way.
11. **Accessories (decided).** Earrings, bags, shoes, belts and similar pieces can be uploaded to the Closet and used in Looks. They count as Uploads. In the first version they are **not** scanned for history or redesigns: the upcycling flow is for clothing only.
12. **Adapt, meaning fit-based alteration suggestions (decided):** roadmap only, not built now. It is shown as the future tailor and alteration-partnership phase.
13. **Deleting a Garment** removes the Garment and all its images. The Scan's text data and Corrections are kept without images, so training data survives without personal photos.

## 7. Experience and visual design

### 7.1 Direction (decided)
- A completely new design, **not** the deck's palette.
- Calm and gallery-like: an off-white background with garments as the focus, and motion and depth doing the talking.
- "3D" means 2.5D: real photo cut-outs moved with depth, scale, blur and opacity. No real 3D models.
- References in this folder:
  - `reference videos/reference-1.mp4` to `reference-4.mp4`
  - `design references/maison-vell-runway-depth-lookbook.md`
  - `design references/try-the-look-runway-ring.md`
- Borrow the techniques, not the content. The two prompts use other people's images and Nike branding, and **none of it may ship.**

### 7.2 Where each reference lands (decided)
| Screen | Reference | Behaviour |
|---|---|---|
| Home | Video 3 (floating garments) | A cluster of garment cut-outs drifting and turning in depth, with a big "Scan a garment" action |
| Scan result | Video 3 (single garment, colour swatches, large faded text behind) | The scanned cut-out is the hero. Detected colours appear as swatches, the fabric name sits in big faded type behind it, and feature labels connect to the garment |
| Before → after | Video 1 (tile-dissolve product switch) | The original dissolves tile by tile into the AI "after" image, then guides scroll one at a time with difficulty tags |
| Garment Story card / outfit breakdown | Video 4 (receipt layout) | A receipt-style card listing the garment, fabric, story with source, redesign and difficulty. Downloadable as a PNG |
| Wardrobe OS closet | Video 2 (clothing rail) | The user's pieces hang on a rail. Hovering lifts one; clicking brings it forward and blurs the others |
| Wardrobe OS outfits | Both design prompts (depth line or ring + pins) | Outfits stand in depth. Drag brings the next to the front. Numbered dots on each piece link to that garment's detail |

AI video figures from reference 4 are out of scope. Still AI images are used instead.

### 7.3 Shared depth engine (proposal, from the graphify trace of the two prompts)
One small module drives every depth carousel:
1. **Position.** A single float `p` moves toward `target` with an exponential ease or a critically damped spring. Drag sets `target` directly; release snaps it to a whole number.
2. **Depth per item.** `d = wrap(i − p, n)`.
3. **Layout function.** It turns depth into x, foot line, scale, blur, opacity and z. There are three interchangeable layouts:
   - a hand-tuned stop table (Maison Vell style);
   - a perspective ring (desktop);
   - a diagonal line (phones).
4. **Renderer.** It changes only `transform`, `filter` and `opacity`, so items stay sharp and fast.

Also required:
- reduced-motion support, where items jump straight to their place;
- keyboard arrows;
- touch swipe.

### 7.4 Screens (first version)
1. **Home** with the floating garment cluster.
2. **Onboarding**: a short style profile and an anonymous start, with no sign-up wall.
3. **Scan**: camera or upload, plus an optional care-label photo.
4. **Result**:
   - the hero cut-out;
   - features;
   - a fabric confirm prompt if confidence is low;
   - history with sources, or "no verified history yet";
   - one free redesign idea (open), plus two or three Premium ones as locked cards showing title and difficulty.
5. **Guide**: before → after, steps, tools, the source list and "Create Garment Story card".
6. **Closet**: the rail, holding clothing and accessories. It shows the remaining Upload allowance and when the next credit arrives.
7. **Looks**: the depth carousel with pins and the receipt-style breakdown, built only from owned Garments. It shows the remaining Look allowance.
8. **Profile**: the Activity Record of uploaded, reconstructed and styled pieces.
9. **Upgrade**: a simple Premium toggle showing $7.99/month, for the business story.

## 8. Data model (Supabase Postgres, proposal)
| Table | Key columns |
|---|---|
| `profiles` | `id` (auth user), `is_premium`, `style_profile` (jsonb), `upload_credits`, `look_credits`, `uploads_refill_at`, `looks_refill_at`, `free_uploads_used` (0–10), `free_looks_used` (0–10), `created_at` |
| `activity` | `id`, `user_id`, `kind` (`upload` / `reconstruct` / `style`), `garment_id` or `outfit_ref`, `created_at`. The Activity Record |
| `scans` | `id`, `user_id`, `image_path`, `cutout_path`, `image_hash`, `vision_json` (jsonb), `model_name`, `model_version`, `fabric_final`, `fabric_source` (`vision` / `label` / `user`), `created_at` |
| `corrections` | `id`, `scan_id`, `field` (`fabric` / `garment_type` / `named_style`), `ai_value`, `user_value`, `created_at`. **Training data for the future model** |
| `kb_entries` | `id`, `kind`, `title`, `body`, `tags` (text[]), `difficulty`, `tools`, `steps` (jsonb), `sources` (jsonb), `status`, `reviewed_by`, `embedding` (vector) |
| `scan_matches` | `scan_id`, `kb_entry_id`, `score`, `method` (`tag` / `vector`) |
| `guides` | `id`, `scan_id`, `kb_entry_id`, `body` (jsonb), `after_image_path`, `image_provider` |
| `garments` | `id`, `user_id`, `scan_id` (null for accessories uploaded directly), `category` (`clothing` / `accessory`), `name`, `cutout_path`, `image_kind` (`photo` / `concept`), `tags`, `status` (`active` / `transformed`), `source_garment_id` (null unless upcycled), `recipe_id` (null unless upcycled), `created_at` |
| `outfits` | **saved Outfits only**: `id`, `user_id`, `items` (2–4 garment ids), `reason`, `occasion`, `created_at` |

- Row-level security: users can see only their own rows. `kb_entries` with status `reviewed` can be read by everyone.
- Auth: Supabase **anonymous sign-in** for the demo (proposal), so there is no login wall. Accounts can be upgraded to email later.

## 9. Scale path (shown to the panel; nothing beyond step A is built now)
| Stage | Users | Change |
|---|---|---|
| A. Demo (now) | Tens | Next.js on Vercel + Supabase free, Gemini free tier, image-hash cache, client-side resize |
| B. Launch | Thousands | Paid tiers. AI calls move to a background job queue with retries. Per-user rate limits. Image CDN. Real payments |
| C. Growth | Hundreds of thousands | Split the AI work into its own service (option 3 in §4.2). Read replicas. Batch embedding jobs. The knowledge base gets editorial tooling and a review workflow |
| D. Own model | Any | Train a garment and fabric classifier on the `scans` + `corrections` data, starting with public sets such as Fashionpedia and DeepFashion for garment parts. It replaces the vision step behind the same `vision` module to cut cost per scan |

The core argument for the panel: every user correction makes the system smarter and cheaper. That data is a moat no closet app that only organises clothes has.

## 9b. Timeline and scope (decided: one builder, under one week)
The owner builds alone, with Claude's help, in **under one week**. The scope is therefore tiered. Each tier must be demo-ready before the next one starts.

**Tier 1: must have (the core loop, days 1–4)**
- Next.js app on Vercel, the Supabase project, schema and security rules (§8), anonymous sign-in.
- Upload a photo → resize → background removal (falling back to the original photo if it fails) → `/api/analyze` → result screen:
  - the hero cut-out with colour swatches and the fabric name in large faded type behind it;
  - the fabric confirm tap.
- Knowledge base with **tag matching only**. Seeded with Claude-drafted entries for the stage garments (§6.2a). History with sources, or "no verified history yet".
- Result screen shows one free Recipe open and the Premium Recipes as locked cards (§6.6 rule 5).
- Guide screen: AI-written steps from the chosen Recipe, plus the "after" image (`IMAGE_PROVIDER` switch).
- Garment Story card, receipt style, downloadable as a PNG.
- Demo cache: image-hash cache plus pre-scanned stage photos (§10).

**Tier 2: should have (days 5–6)**
- Closet rail with the hover lift and click focus. The demo account is pre-filled (§10).
- Outfits:
  - `/api/outfits` using owned Garments only;
  - shown in the depth carousel using **one layout only**, the diagonal line, which works on desktop and phone;
  - drag, arrow keys and snap;
  - a simple numbered list of pieces instead of pins.
- Premium toggle, plus the Upload and Look allowances (first 10 free, then 5 per week with gradual refill) and the Activity Record.
- Accessory upload: a photo, background removal and a category, with no scan.

**Tier 3: nice to have (cut first if time runs out)**
| Feature | Fallback if cut |
|---|---|
| Home floating cluster in depth | A static arranged cut-out cluster with a gentle CSS float |
| Tile-dissolve before → after | Crossfade |
| Ring layout and pins on outfit pieces | The line layout and a numbered list stay |
| Care-label photo reading | The confirm tap only |
| Onboarding style questions | A preset style profile on the demo account |
| Vector matching for redesign and fabric entries | Tag matching only |

**Stage input (decided):** photos taken earlier and **uploaded** live. Because the same file is uploaded, the image-hash cache fully protects the demo. A live-camera fallback is not needed.

## 10. Demo-day reliability (proposal)
- Wake the Supabase project the day before. A tiny scheduled ping keeps it from pausing.
- Pre-scan the stage garments so their results, guides and "after" images are cached.
- A hidden "demo mode" switch serves cached results if any AI call fails or takes longer than a set time.
- Switch `IMAGE_PROVIDER` to the paid provider and test it the day before.
- **Pre-filled demo profile (proposal).** A hidden link (for example `/demo?key=…`) signs into one seeded demo account. Its closet is stocked with the team's own garments: 8 to 12 pieces scanned through the real pipeline, plus a style profile. This keeps the rail and the outfit carousel from looking empty. Any device can load it, and live scans add to it. A seed script creates it, and the security rules treat it like any other user.

## 10b. Images that aren't user scans (proposal)
- **Home-screen cluster and stage "after" images.** The team photographs 8 to 12 of their own garments and runs them through the app's own scan and background-removal pipeline. The resulting cut-outs feed both the home cluster and the demo closet. That shows the pipeline working on real clothes.
- **Fallback.** AI-generated garment cut-outs, clearly not copied from the references.
- None of the reference videos' or design prompts' images ship.

## 11. Privacy and honesty
- Scan and closet photos are of garments, not people. The UI asks users not to include faces.
- Exception: Premium users may upload one full-length photo of themselves to make an Avatar (see `2026-11-23-avatar-try-on-design.md`). It is sent only to a paid AI provider, used once, and deleted. The Avatar can be deleted at any time.
- Users can delete a scan and its images.
- A one-line note says photos are processed by an AI provider. The free tier may use them to improve models; the paid tier is used on demo day.
- Every history claim shows its source. AI-written steps are labelled as AI-generated guidance.

## 12. What's left to the builder
- Folder structure, component structure, styling approach and animation library. CSS with a small motion library is expected.
- Exact prompt wording within the rules above, and the confidence threshold tuning.
- The background-removal library. Check its licence for the use case.
- The test strategy and how much is unit-tested versus manually tested.
- The import format for the knowledge base, and admin tooling beyond a script.
- Exact embedding model and vector size.
