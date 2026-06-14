# TT Membership Manager

A full-stack web app for managing Thousand Trails and Encore membership stays, built with Next.js and deployable to Vercel in minutes.

## Features

- **Dashboard** — Track your 120 TT annual nights with a live progress bar. Track Encore rotation status (last checkout + next eligible date).
- **Trip log** — Log and review all stays with check-in/out dates and night counts.
- **Rules reference** — Booking rules for both TT and Encore, plus full-timer strategy tips.
- **AI assistant** — Powered by Claude. Knows your remaining nights, your trip history, and the accurate rule that Encore has no annual cap.

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/tt-membership-manager.git
cd tt-membership-manager
npm install
```

### 2. Add your Anthropic API key

Create a `.env.local` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Get your key at [console.anthropic.com](https://console.anthropic.com).

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

### Option A — Vercel CLI

```bash
npm i -g vercel
vercel
```

### Option B — Vercel Dashboard

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo.
3. Add environment variable: `ANTHROPIC_API_KEY` = your key.
4. Click Deploy.

That's it. Vercel auto-detects Next.js.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key. The AI assistant tab won't work without it. |

## How the memberships work

- **Thousand Trails**: 120-night annual cap. Resets on anniversary. Max 21 consecutive nights per park.
- **Encore / Trails Collection**: No annual night cap. Limited to 14 consecutive nights per park, then a mandatory 7-night out-of-system wait before your next Encore stay.

## Tech stack

- [Next.js 14](https://nextjs.org) (Pages Router)
- [TypeScript](https://typescriptlang.org)
- [Anthropic Claude API](https://anthropic.com) via a server-side API route (your key never hits the browser)
- CSS Modules — no external UI library dependencies
- `localStorage` for trip persistence
