# Demo scripts

- `npm run seed:demo [-- --photos <folder>]` creates the demo account and prints `DEMO_USER_ID`.
- `npm run prescan [-- --scan <id>]` warms the free guide and concept image for the demo account's existing scans.

Day before: sign in via `/demo?key=...`, upload each stage photo once in `/scan`, then run `npm run prescan`.
(The browser resizes uploads, so only photos uploaded through the real app warm the right image hash.)
