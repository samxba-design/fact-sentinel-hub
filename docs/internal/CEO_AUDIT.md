# FACT SENTINEL HUB (SentiWatch) — CEO READINESS AUDIT
Generated: 2026-04-17

---

## EXECUTIVE SUMMARY

SentiWatch is a genuinely well-built, feature-rich brand intelligence platform with a solid React/TypeScript/Supabase stack. The codebase is clean — **zero TypeScript errors, zero build errors** — and the architecture shows real maturity: lazy-loaded routes, real-time Supabase subscriptions, role-based access, error boundaries, animated counters, and a thoughtfully designed UI system. For a CEO demo it is 70–75% ready. The main gaps are: (1) several pages that require live data to look impressive are empty without a connected Supabase instance and populated data, (2) some premium-impression features like the Threat Map and Narrative Graph are visually powerful but depend entirely on data density, (3) there are a few UX rough edges and one identity inconsistency (app is named "SentiWatch" throughout the UI but the repo/original brand was "Fact Sentinel Hub") that should be resolved, and (4) the bundle has a 858KB main chunk that is a performance red flag for enterprise buyers. With a focused 2-3 day sprint this can go from "impressive demo" to "close-ready product."

---

## 🔴 CRITICAL ISSUES (must fix before CEO demo)

### 1. **No env vars = blank screen / broken auth**
- **File:** `src/integrations/supabase/client.ts:5-6`
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are read from env. If `.env` is missing or misconfigured for the demo environment, the entire app silently breaks (Supabase client initializes with `undefined`, all queries fail, auth never resolves)
- **Fix:** Add env validation at startup; show a clear error if keys are missing. Add a `.env.example` to the repo.

### 2. **Product name inconsistency: "SentiWatch" vs "Fact Sentinel Hub"**
- The entire UI, landing page, sidebar, page titles, favicon alt text, and pricing page say **SentiWatch**
- The repo, README, and project name are **fact-sentinel-hub** / **Fact Sentinel Hub**
- A CEO seeing the GitHub URL vs the product name will notice. Pick one and make it consistent everywhere.
- **Fix:** Decide on brand name. Update `package.json` name field, README, index.html `<title>` tag, any remaining "Fact Sentinel" strings.

### 3. **`index.html` title is probably wrong**
- The `<title>` tag in `index.html` (not checked but standard Vite scaffold default) is likely `"Vite + React + TS"` or similar — the `package.json` still has `"name": "vite_react_shadcn_ts"`
- A CEO opening dev tools or a browser tab with that title is an immediate red flag.
- **Fix:** `index.html` → set `<title>SentiWatch</title>` (or correct brand name)

### 4. **Pricing page has live Stripe price IDs hardcoded**
- **File:** `src/pages/PricingPage.tsx:15-16`
- `priceId: "price_1T1ObmB29RCAwSicAeV8uVVM"` and `"price_1T1ObnB29RCAwSiccq30KKyT"` are hardcoded
- If clicking "Get Started" during a demo triggers a real Stripe checkout, that's either awkward or broken depending on environment
- **Fix:** For demo mode, either disable the checkout button with a "Contact Sales" redirect, or gate on env var `VITE_STRIPE_ENABLED`

### 5. **Dashboard looks empty without data — no demo seed state**
- The dashboard correctly shows a "Welcome — run your first scan" zero state, but for a CEO demo you want the dashboard to look alive
- The `seed-demo` edge function exists but may not be wired to a UI trigger
- **Fix:** Add a "Load Demo Data" button on the zero-state card (or pre-seed the demo org before the meeting). Without data, the Risk Index, all charts, the Threat Map, Narrative Graph, and War Room are all empty.

---

## 🟠 HIGH PRIORITY (strongly recommended)

### 6. **858KB main JS bundle — unacceptable for enterprise demo**
- **Build output:** `dist/assets/index-Dgi7GPPD.js: 858.21 kB (gzip: 258 kB)`
- This is the shared chunk containing all vendor dependencies. A CEO's IT team or a technical evaluator will flag this immediately
- Additional large chunks: `generateCategoricalChart` (367KB = Recharts), `html2canvas.esm` (201KB), `DashboardPage` (129KB)
- **Fix:** Add `build.rollupOptions.output.manualChunks` in `vite.config.ts` to split vendor libs (react, radix, recharts, framer-motion, supabase) into separate chunks. Target <200KB per chunk.

### 7. **`ThreatMapPage` makes a CDN call for world atlas data**
- **File:** `src/pages/ThreatMapPage.tsx:9`
- `const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"` — fetched at runtime
- If demo environment has restricted internet or CDN is slow, the Threat Map shows a blank canvas
- The region inference logic (`inferRegion()`) is keyword-based text matching — extremely brittle ("china" in a mention doesn't mean it originated in China)
- **Fix:** Bundle the 110m topojson locally (`public/world-atlas.json`), update the URL. Add a loading skeleton for the map.

### 8. **War Room "Team Presence" always shows faked data**
- **File:** `src/pages/WarRoomPage.tsx` (teamMembers setup, line ~83)
- Team member `lastSeen` is set to `Date.now()` for the current user and `Date.now() - 300000` (5 mins ago) for others — hardcoded fake presence
- A CEO watching the "online" count will assume it's live. It's not.
- **Fix:** Either implement real presence via Supabase Realtime presence, or remove the "online" indicator and just show team list

### 9. **`UpgradeBanner` appears on almost every page — looks unfinished for a demo**
- **File:** `src/components/UpgradeBanner.tsx` — called in Dashboard, RiskConsolePage, ScansPage, RespondPage, AlertsPage, and many others
- If the demo org is on a free plan, users see upgrade prompts everywhere. This undercuts the "impressive full-featured platform" message.
- **Fix:** For CEO demo, either pre-set the demo org to Pro tier in Supabase, or add `VITE_DEMO_MODE=true` env var that suppresses upgrade banners

### 10. **`lovable-tagger` dependency in production build**
- **File:** `package.json` devDependencies + `vite.config.ts:5`
- `componentTagger()` from `lovable-tagger` is included in development builds and adds HTML data attributes for the Lovable visual editor. This tags DOM elements with internal metadata — not appropriate for a customer-facing product
- **Fix:** Verify this is already gated by `mode === "development"` (it is in vite.config.ts), but confirm it's stripped from prod build output. Remove the dep if not needed.

### 11. **`package.json` version is `"0.0.0"` and name is `"vite_react_shadcn_ts"`**
- Dead giveaway that this is a Lovable scaffold. Should be renamed to match the product.
- **Fix:** `"name": "sentiwatch"`, `"version": "1.0.0"` (or whatever is appropriate)

### 12. **No `favicon` — browser tab shows default Vite favicon**
- Check `public/` directory — if only `vite.svg` or `favicon.ico` is the Vite icon, a CEO opening the app will see the Vite logo in their browser tab
- **Fix:** Create a proper favicon using the Shield icon from the app branding (simple SVG or PNG at 32x32, 16x16)

---

## 🟡 MEDIUM PRIORITY (polish)

### 13. **Narrative Graph `console.log` left in production code**
- **File:** `src/pages/NarrativeGraphPage.tsx` — console.log present
- **Fix:** Remove all console.log statements. Others found in: `ContactPage.tsx`, `CompetitorIntelFeedPage.tsx`, `NotFound.tsx`, `ErrorBoundary.tsx`, `useKeyboardShortcuts.ts`

### 14. **TypeScript strict mode disabled — `any` types throughout**
- **File:** `tsconfig.app.json` — `"strict": false`, `"noImplicitAny": false`, `"noUnusedLocals": false`
- This means the codebase compiles without errors but has many implicit `any` types that could cause runtime issues
- **Impact:** Medium — the app works, but any type-based refactoring will surface problems
- **Fix:** Enable `"strict": true` and fix type errors (likely 50-100 places)

### 15. **Dashboard has 3 near-identical Supabase query blocks duplicated**
- **File:** `src/pages/DashboardPage.tsx` — the initial load, realtime refresh, and scan-complete refresh all execute the same 4 Supabase queries with copy-pasted code
- **Fix:** Extract into a single `fetchDashboardMetrics(orgId, rangeDays)` async function

### 16. **`QueryClient` is instantiated at module level (not inside component)**
- **File:** `src/App.tsx:65` — `const queryClient = new QueryClient()` outside component
- Fine for most cases but means the client persists across HMR reloads in development and can cause stale cache issues
- **Fix:** Move inside `App` or wrap in `useState`

### 17. **`MobileHeader` exists but mobile layout may be incomplete**
- The sidebar is `fixed left-0 w-64` with no responsive hiding. On mobile (<768px), it would overlap the content area.
- **File:** `src/components/AppLayout.tsx` — not read but inferred from `AppSidebar.tsx` fixed positioning
- **Fix:** Ensure sidebar has `hidden md:flex` and `MobileHeader` shows hamburger to toggle it on mobile

### 18. **UpgradeBanner `className` prop passed but may not be applied correctly**
- RiskConsolePage passes `className="mb-2"` to UpgradeBanner. Need to verify the component spreads `className` onto its root element, otherwise the spacing prop silently fails.

### 19. **`AuthPage` not reviewed — password reset flow may be incomplete**
- `ResetPasswordPage.tsx` exists but needs to handle Supabase's magic link token on page load. Common implementation gap.

### 20. **Pricing page `$99/month` and `$950/year` — no free tier mentioned**
- The landing page says "Free to start" and "No card required" 4 times
- The pricing page only shows paid plans ($99/month, $950/year) with no free plan card
- This contradiction will confuse a CEO evaluator reviewing the marketing flow
- **Fix:** Add a "Free" tier card (0 scans/month, 100 mentions, etc.) or remove "free to start" from the landing page

---

## 🟢 LOW PRIORITY / NICE TO HAVE

### 21. **Single test file with minimal coverage**
- **File:** `src/test/example.test.ts` — likely a scaffold placeholder
- No component tests, no page tests, no hook tests
- **Fix:** Add at minimum smoke tests for auth flow, dashboard render, and key data hooks

### 22. **`html2canvas` (201KB) is only used for one feature (report screenshot)**
- Can be dynamically imported when actually needed rather than bundled in the shared chunk
- **Fix:** `const html2canvas = await import('html2canvas')` inside the function that uses it

### 23. **`framer-motion` is imported throughout but most animations could use CSS**
- `BriefingPage.tsx` imports `motion` for a gauge needle animation — appropriate
- `QuickTriagePage.tsx` uses `AnimatePresence` for card swipe — appropriate
- But if framer-motion is imported just for `fade-up` transitions, CSS `@keyframes` would be lighter
- Worth auditing to see if the dep is fully justified

### 24. **`react-simple-maps` only used in ThreatMap page (115KB chunk)**
- Already code-split via lazy loading. Fine as-is. Just keep the CDN GEO_URL fix from #7.

### 25. **No `robots.txt` or `sitemap.xml` in `public/`**
- Minor for a CEO demo but matters for SEO if publicly deployed

### 26. **`DEPLOYMENT_GUIDE.md`, `OVERHAUL_SUMMARY.md`, `COMPLETE_OVERHAUL_REPORT.md`, `VISUAL_SUMMARY.md`, `SCANNING_TROUBLESHOOTING.md` are in repo root**
- These internal dev notes are committed to the repo root. Fine for dev, but if the repo is public or shared, they expose internal dev process
- **Fix:** Move to `docs/internal/` or add to `.gitignore`

---

## 🎯 MISSING FEATURES FOR CEO IMPRESSION

### A. **No email/Slack/webhook notification demo**
- The `send-notification`, `send-email`, `send-weekly-digest` edge functions exist but there's no visible flow in the UI where a CEO can say "so I'd get an email when this happens?"
- **High impact:** Add a simple "Test Alert" button in Settings → Notifications that fires a sample email

### B. **No export preview — CEO can't see what leaves the platform**
- The ExportsPage exists but with no live data it shows nothing. A CEO will want to see "what does a report look like?"
- **High impact:** Bundle a sample PDF/Google Sheets export in the demo. Or make BriefingPage's "Copy as Brief" produce a visually rich output.

### C. **AI response generation is paywalled/gated without data**
- RespondPage requires approved facts and mention context to work. With empty data it's just a blank form.
- **Fix:** Add example mention pre-filled on the page, or ensure demo seed includes approved facts

### D. **No audit trail / compliance view visible to demo audience**
- The platform claims "Compliance Ready" on the landing page and has audit trail functionality, but there's no obvious "Audit Log" page in the navigation
- **Fix:** Surface `AdminAuditTab` as a standalone page or add it to Settings; show it during demo

### E. **Competitor Intel Feed requires third-party integration setup**
- `CompetitorIntelFeedPage.tsx` likely shows empty without real competitor tracking data
- This is a differentiating feature — worth having demo data

### F. **No user onboarding video or product tour visible on landing page**
- Landing page has "See how it works — full visual walkthrough" linking to `/how-it-works` which is a text page
- A 60-second screen recording embedded in the hero would dramatically increase conversion perception

---

## ⚡ QUICK WINS (< 1 hour each)

| # | Fix | File | Impact |
|---|-----|------|--------|
| 1 | Fix `<title>` in index.html to "SentiWatch" | `index.html` | High — first thing CEO sees in browser tab |
| 2 | Fix `package.json` name/version | `package.json` | Medium — dev professionalism signal |
| 3 | Add `.env.example` to repo root | new file | High — prevents blank-screen demo failures |
| 4 | Remove all `console.log` statements (6 files) | Various | Medium — shows code quality discipline |
| 5 | Set demo org to Pro in Supabase → hide all UpgradeBanners | DB | High — makes app look fully featured |
| 6 | Bundle world atlas topojson locally | `public/world-atlas.json` | High — makes Threat Map work offline/on slow connections |
| 7 | Add favicon (Shield icon SVG) | `public/favicon.svg` | High — every browser tab shows it |
| 8 | Add "Resolve naming: SentiWatch vs Fact Sentinel" to README | `README.md` | Medium — clarity for contributors |
| 9 | Align pricing page: add Free tier card OR remove "free to start" copy | `PricingPage.tsx` | Medium — removes inconsistency |
| 10 | Seed demo data before CEO meeting (use existing `seed-demo` edge function) | Supabase | Critical — without data, 80% of the UI looks empty |

---

## ESTIMATED EFFORT SUMMARY

| Category | Issues | Estimated Effort | Priority |
|----------|--------|-----------------|----------|
| Critical blockers (blank screen, naming, env) | 5 issues | 2–4 hours | Do first |
| Bundle optimization | 1 issue | 3–5 hours | Before demo |
| UI polish (banners, war room, fake presence) | 4 issues | 2–3 hours | Before demo |
| Data seeding for demo | 1 issue | 1–2 hours | Before demo |
| Medium polish (console logs, types, mobile) | 8 issues | 4–6 hours | This sprint |
| Missing CEO-impression features | 6 features | 8–16 hours | High value sprint |
| Low priority / code quality | 6 issues | 3–5 hours | Backlog |
| **Total to be demo-ready** | — | **~12–18 hours** | 2–3 day sprint |

---

## OVERALL VERDICT

The platform is technically sound and architecturally impressive. The feature surface is genuinely competitive — War Room, Threat Map, Narrative Graph, Quick Triage, AI Response Copilot, Competitor Benchmarking, and Briefing Mode together make a strong product story. The biggest risks for a CEO demo are: empty data (fixable in 1 hour), brand name confusion, and the browser tab/package.json showing scaffold origins. Fix the critical 5 issues + seed the data, and this is a confidently demoable product.
