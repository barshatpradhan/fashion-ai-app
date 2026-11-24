# REVIVO demo-day checklist

Plain-language guide for the presenter. Work top to bottom. Commands are run in a terminal inside the project folder. The `npm run` scripts read `.env` themselves.

## 1. One-time setup

1. **Create a Supabase project** at supabase.com (free tier is fine). Note the project URL, the `anon` key and the `service_role` key (Project Settings > API). Keep the service_role key secret.
2. **Apply the database migrations in order**, each file once:
   1. `supabase/migrations/0001_init.sql`
   2. `supabase/migrations/0002_demo_cache.sql`
   3. `supabase/migrations/0003_kb_slug.sql`
   4. `supabase/migrations/0004_closet.sql`
   5. `supabase/migrations/0005_grants.sql` (gives the API roles table access; without it every request fails with "permission denied", code 42501. RLS still decides which rows each user sees.)

   Either paste each file into the SQL editor and run it, or set `SUPABASE_DB_URL` in `.env` (Connect > Session pooler URI, with the database password) and run, for each file:
   `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/<file>`
3. **Turn on Anonymous sign-ins**: Supabase dashboard > Authentication > Sign In / Providers > enable "Allow anonymous sign-ins". Without this, visitors cannot use the app.
4. **Storage bucket**: nothing to click. `0001_init.sql` creates the private `garments` bucket and its access rules. Just check it exists under Storage after migrating.
5. **Get a Gemini API key** (Google AI Studio). For demo day also get an **OpenAI API key** (used when `IMAGE_PROVIDER=openai`).
6. **Fill `.env`**: copy `.env.example` to `.env` and fill in:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same values as the URL and anon key above)
   - `GEMINI_API_KEY`, and `OPENAI_API_KEY` (required whenever `IMAGE_PROVIDER=openai`)
   - `IMAGE_PROVIDER=gemini` for now
   - `DEMO_KEY`: a long random secret (30+ random characters). Anyone with it can sign in as the demo user, so do not share it.
   - `CRON_SECRET` (optional): a long random string. If set, the keep-alive job requires it (Vercel sends it automatically); if left unset, the job needs no auth.
   - `AI_TIMEOUT_MS=20000` and `RENDER_TIMEOUT_MS=50000` (leave as is; image generation needs the longer timeout)
   - `DEMO_USER_ID`: filled in the next step.
7. **Create the demo account**: run `npm run seed:demo` (it only needs the Supabase variables; `DEMO_USER_ID` may still be blank). It prints a `DEMO_USER_ID`; copy it into `.env` (and later into Vercel). The demo user is created with the email `demo@revivo.local`, which `/demo` needs to sign you in. Optional: `npm run seed:demo -- --photos <folder>`.
8. **Check the security rules once**: run `npm run test:smoke`. It reads `.env` and should pass. It **fails** (never skips) if the Supabase variables are missing; if it fails, stop and fix before going on.
9. **Deploy to Vercel (the owner does this)**: import the repo, set the same env vars from `.env`, with `IMAGE_PROVIDER=gemini`. `vercel.json` already schedules the daily keep-alive job (`/api/cron/keepalive`, 06:00 UTC).

## 2. Knowledge base

All history claims come from `content/kb/entries.csv` and only show once a team member marks them reviewed. See `content/kb/README.md`.

1. `npm run kb:import` loads the CSV as drafts. Re-importing leaves unchanged reviewed rows alone; changed rows go back to draft.
2. For each entry, the reviewer opens every source link and checks the claim against it. Only then run:
   `npm run kb:review -- <slug> "<your name>"`
3. **Never review rows titled `[DEV] ...`.** They are placeholders, not real content.
4. A history entry whose source cannot be verified is **dropped** (delete the row, re-import). Do not soften the wording.

## 3. The day before

1. In Vercel, set `IMAGE_PROVIDER=openai` (make sure `OPENAI_API_KEY` is set) and **redeploy**. Use the same value in `.env` so `prescan` uses the same provider.
2. On the **laptop** and the **phone**, open `https://<your-site>/demo?key=<DEMO_KEY>`. It signs you in as the demo user and goes to the home page.
3. Upload **each stage photo once** in `/scan`, through the real app, **on the exact device and browser you will present from** (the browser resizes and re-encodes uploads, so a different phone or browser can produce different image bytes and miss the cache). If you might present from both the laptop and the phone, upload each photo on both. Background removal gives up after 12 s and uses the original photo, so a slow network cannot hang an upload.
4. Run `npm run prescan`. It pre-generates the free guide and concept image for the demo account's scans (`-- --scan <id>` for just one). Check its last line: **"images warmed" must equal the number of scans**. If it is lower, run it again (guides and images already stored are reused, not regenerated).
5. Check Supabase is awake: free projects pause after inactivity. The daily keep-alive cron prevents this; confirm the project is Active in the dashboard and the site loads data.
6. **Rehearse the whole demo once** (see section 4) on the real phone and network. Rehearse **"Style me" with the final closet** and the occasion you will use on stage, then **do not add or remove closet pieces afterwards**: the demo fallback for Looks is keyed by the closet's pieces plus the occasion, so any change means no cached Looks if the AI is slow.

## 4. On stage

Order, with what to say or point at:

1. **Upload** - "I photograph a garment I no longer wear." Use a prescanned stage photo in `/scan`.
2. **Result** - Point at the detected garment, fabric and named style.
3. **Free Recipe Guide** - Open the free recipe: step-by-step redesign with tools and difficulty, plus the sourced history.
4. **Story Card** - Show the shareable card for the piece.
5. **Free/Premium switch** (hidden, on the Profile page) - Before the demo, open **Profile** in the nav (`/profile`) and tap **Free** (under "Flip this account between Free and Premium to show both experiences"). Back on the result screen, point at the locked Recipe cards (marked "Premium", no link). The Upload and Look allowance counters are on **Closet** (`/closet`), **Looks** (`/looks`) and **Profile** (`/profile`), not on the result screen; on Free they show the real free counts (the demo account is still never blocked). Then tap **Upgrade to Premium · $7.99/month** on `/profile` (or **Premium** in the same switch) to unlock everything. If you open a locked guide instead, its page says "This guide is part of Premium" with an **Upgrade · $7.99/month** button.
6. **Closet** - Show the saved pieces.
7. **Style me** - Generate outfits from the closet.

## 5. If something goes wrong

- **Slow network**: the demo cache answers within `AI_TIMEOUT_MS` (20 s). Wait it out; do not refresh repeatedly.
- **"Our stylist is busy right now. Please try again in a moment."**: wait a few seconds and retry once.
- **Do not** scan new, un-prescanned photos on stage. Stick to the photos you uploaded and prescanned.
- If sign-in fails, reopen `/demo?key=...`. If it still fails, check `DEMO_USER_ID` and that the Supabase project is awake.

## 6. Known limits and owner decisions

- The background-removal library (`@imgly/background-removal`) is **AGPL-3.0** and downloads its model files from **IMG.LY** at runtime. Decide on licensing and hosting before any public launch.
- The app has **never been run against a real backend yet**. Rehearse fully, and expect to fix small things.
