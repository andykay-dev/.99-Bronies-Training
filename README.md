# .99 Training — Beta Deployment Guide

The BRONIES training planner. Embrace the .99 chaos.

This folder is everything you need to ship the artifact as a live, share-with-the-Bronies beta website. **Zero ongoing costs.** No API keys. No server. Just a static site that runs entirely in the browser.

---

## What you're getting

A real React app (Vite + React 18) that runs the same code as the Claude artifact, with one production adjustment:

- **A `window.storage` shim** that stores user data in their browser's `localStorage` so profiles, events, and feedback persist across sessions. Each member's data stays in their own browser — nothing leaves their device.

That's the entire production architecture. No database. No auth. No backend. No API keys. No costs beyond Vercel's free hosting tier.

---

## What you'll need before starting

- A GitHub account (free)
- A Vercel account (free, sign in with GitHub)
- About **20 minutes** of focused time

That's it. No API keys, no payment cards, no servers.

---

## Step-by-step deployment

### 1. Get the files onto your computer

Download this whole `bronies-beta` folder to your laptop. It should contain:

```
bronies-beta/
├── public/                 ← (optional static files like favicon)
├── src/
│   ├── App.jsx             ← the full app
│   ├── main.jsx            ← React entry point
│   └── storage-shim.js     ← localStorage adapter
├── index.html              ← Vite entry HTML
├── package.json
├── vite.config.js
└── .gitignore
```

### 2. (Optional) Test it locally first

Skip this if you want to go straight to deploying. If you'd like to try locally first, install Node.js, open a terminal in the folder, and run:

```
npm install
npm run dev
```

Open `http://localhost:5173`. You should see the welcome screen.

### 3. Push to GitHub

1. Go to **github.com**, click **New repository**.
2. Name it `bronies-99-training` (or anything you like).
3. Choose **Private** if you want only the Bronies to see the code, or Public if you don't mind.
4. **Don't tick** "Initialise with README" — you already have one.
5. Click **Create repository**.

On the next page GitHub shows a snippet. Open a terminal in your `bronies-beta` folder and run those commands. The full sequence looks like:

```
git init
git add .
git commit -m "initial beta"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/bronies-99-training.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### 4. Deploy on Vercel

1. Go to **vercel.com** and sign in with GitHub.
2. Click **Add New → Project**.
3. Find `bronies-99-training` in the list and click **Import**.
4. **Framework Preset** should auto-detect as **Vite**. If not, select it manually.
5. Leave the build settings as defaults.
6. Click **Deploy**.

After about 60 seconds, you'll get a URL like `bronies-99-training.vercel.app`. **That's your beta.** Share it with the Bronies.

### 5. (Optional) Custom domain

If you own `bronies.run` (or any domain):

1. In your Vercel project, go to **Settings → Domains**.
2. Add the domain. Vercel will tell you which DNS records to set at your registrar.
3. Apply those changes at your registrar. It takes 5–60 minutes to propagate.

### 6. Pushing updates

Any time you want to release a new version:

```
git add .
git commit -m "what changed"
git push
```

Vercel auto-deploys every push to `main`. Your live URL updates in about a minute.

---

## What works in beta

- Welcome screen with the horse silhouette and tagline
- Full onboarding wizard with four branches: Goal Event / Healthier / Returning / Coffee With the Boys
- Reference-time-driven training paces (Easy / Tempo / Intervals / Warm Up)
- Day-by-day plan generation — pick which days run, and what type each one should be (workout / easy / long / BRONIES / rest)
- Phase-based periodisation (Base → Build → Peak → Taper → Race)
- Down weeks every 3rd week, proper taper, race-week protocol
- Elevation gain slider with race-distance-aware scale guidance
- Manual trail-type description field
- Weekly volume chart, filter pills, week detail modal
- Weekly feedback that adjusts upcoming weeks
- All 6 demo scenarios (Newcastle, Melbourne, Rafferty's, Rumble, Elephant, Hangout)
- Bronie hangout view with chaos suggestions (Coffee Roulette, Drag the Chain, etc.)
- Garmin Connect step exports for every workout
- Per-browser persistence via localStorage

## What's coming next (Phase 2)

- AI-powered event website scanning — needs a headless-browser + vision approach to handle modern JS-heavy race sites and elevation profile images
- Race-day planner companion app with nutrition guide and course strategy
- Strength training module (bodyweight + light kit, short sessions)
- Per-week elevation prescription based on event profile
- A/B race blending (multi-event with shared periodisation)
- Beginner couch-to-5k branch with walk/run progressions
- Multi-user accounts with cloud sync

---

## Costs

- **Vercel free tier**: 100GB bandwidth/month — easily enough for the whole club
- **No AI API costs** — plan generation runs entirely in the browser
- **Domain (optional)**: ~$15 AUD/year if you want `bronies.run`

Total ongoing cost: **$0** unless you buy a custom domain.

---

## Privacy

Each user's profile, event, and feedback live in their own browser's localStorage. None of it is sent to a server. Each Bronie's data stays on their device.

If they clear their browser data, their plan is gone. If they want it to sync across devices, that's the Phase 2 cloud-sync work.

---

## Troubleshooting

**Blank screen after deployment**
Open your browser's dev tools (Cmd/Ctrl+Shift+J), check the Console tab for errors. Most common cause is a build failure — check the Vercel deployment logs for the actual error.

**Data lost after browser refresh**
If localStorage is full or disabled (some private/incognito modes block it), the app will reload to the welcome screen. The app shows a console warning when this happens.

**Plan looks off after entering reference time**
Double-check the time format. Use `mm:ss` for distances up to 15km (e.g. `52:00` for a 10km), and `h:mm:ss` for half marathon and longer (e.g. `1:55:00` for a half).

---

Embrace the .99 chaos.
