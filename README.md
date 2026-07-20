# BRONIES .99 Training

Mobile-first training plan builder for the Little Black Pony (Bronies) running crew.
Live at `99-bronies-training.vercel.app`. *"Always finish on the .99."*

## What it does
- **Event training plans** — periodised, phase-based plans (base → build → peak → taper) for a
  target race, event countdown, peak long runs.
- **Beginner track** ("Healthy Bronie") — couch-to-Bronies-run (7.99km) progression for someone
  starting from a 3–5km base, walk/run intervals tapering to continuous running, 10%-rule safety
  checks, a "you did it" celebration on reaching goal week.
- **Race Day tools** — Event Setup (aid stations, fuelling per leg, gear) and a live Race Day view
  for on-course tracking (next aid station, ETA, recalibrate-if-lost).
- **Tools hub** — pace calculator, ad-hoc run/fuel planner, workout creator.
- **Cloud sync** — Supabase auth + per-account sync of plan/profile/nutrition library/completions
  across devices. Signed-out use falls back to local-only storage on that device.

## Stack
- React 18 + Vite, deployed on Vercel (builds from `src/App.jsx`)
- `packages/*` — pure-JS plan-generation engines (`engine-core`, `event-engine`,
  `beginner-engine`, `race-engine`, `scanner-engine`), no React/side-effects, npm workspaces
- Supabase (auth + Postgres) for accounts and cross-device sync
- `@sentry/react` for error tracking + session replay (text masked — see Privacy below)
- `@formspree/react` for the in-app feedback form
- `api/scan.js` — a Vercel serverless function that server-side-fetches a URL (course page,
  nutrition label page) and hands back extracted text for the scanner engine to parse

## Dev
```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
```
No `.env` needed — the Supabase anon key, Formspree form ID, and Sentry DSN are all
public-by-design keys and are hardcoded in `src/App.jsx` / `src/main.jsx`. Real access
control lives in Supabase Row Level Security policies, not in hiding these values.

## Deploy
Push to `main` on GitHub → Vercel auto-builds (`npm run build`, Vite, outputs to `dist/`,
see `vercel.json`). No manual deploy step.

## Status
- ✅ Event plans, beginner track, Race Day live view, Tools hub, cloud sync — live and working.
- ⏸️ **Maintenance Mode** — disabled (`packages/engine-core/src/constants.js`, search
  `TEMPORARILY DISABLED`). The maintenance engine outputs array-shaped sessions; the app expects
  object-keyed sessions. Needs a rewrite of `buildWeek()` before re-enabling.
- ⏸️ **RSVP** (`HangoutView`) — built but parked. Needs a `bronies_rsvp` Supabase table with
  grants for `authenticated` + `anon`. No-ops harmlessly until then.

## Privacy note
Accounts are Supabase-authenticated (email/password). Session replay (Sentry) masks all text
content — it captures layout/colour for debugging visual bugs, not what anyone typed or their
email. No data is sold or shared outside the app's own operation.
