# SentiWatch — Enterprise Reputation Intelligence

Monitor, detect, and respond to brand threats before they escalate. AI-powered sentiment analysis and crisis management for enterprises.

🌐 **[sentiwatch.app](https://sentiwatch.app)**

---

## What is SentiWatch?

SentiWatch is a brand intelligence platform that continuously monitors news, social media, Reddit, review sites, and other sources for mentions of your brand. It classifies sentiment, detects narrative themes, scores risk, and alerts your team to crises before they spiral.

**Core capabilities:**

- 🔍 **Brand monitoring** — news, social, Reddit, reviews, RSS, app stores
- 🧠 **AI sentiment analysis** — automatic classification (positive / negative / neutral / mixed)
- 🚨 **Crisis detection** — critical mention alerts, viral risk scoring, incident war-rooms
- 📊 **Dashboard & reporting** — risk index, volume trends, sentiment breakdown, weekly digests
- 🔔 **Notifications** — email alerts, escalation workflows, configurable preferences
- 🏢 **Multi-org** — teams, roles, shared views, audit logs

---

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Supabase (Postgres, Auth, Edge Functions, Realtime)
- **Charts:** Recharts
- **Build:** Vite + Bun

---

## Local Development

### Prerequisites

- Node.js 18+ or Bun
- A Supabase project

### Setup

```sh
# 1. Clone the repo
git clone https://github.com/samxba-design/fact-sentinel-hub.git
cd fact-sentinel-hub

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and add your Supabase URL and anon key

# 4. Start the dev server
npm run dev
```

### Environment Variables

Create a `.env` file at the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key

# Optional — set to "true" to hide upgrade banners in demo environments
VITE_DEMO_MODE=false
```

See `.env.example` for a full template.

---

## Building for Production

```sh
npm run build
```

Output goes to `dist/`. Deploy to any static host (Vercel, Netlify, Cloudflare Pages, etc.).

---

## Running Tests

```sh
npm run test
```

---

## Project Structure

```
src/
  components/     # Reusable UI components
  contexts/       # React context providers (Auth, Org)
  hooks/          # Custom React hooks
  integrations/   # Supabase client & generated types
  pages/          # Route-level page components
  lib/            # Utilities
public/           # Static assets (favicon, og-image, sitemap, robots.txt)
supabase/         # Edge functions & migrations
```

---

## License

Proprietary — © SentiWatch. All rights reserved.
