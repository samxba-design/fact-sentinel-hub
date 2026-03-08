

# Full Audit: SentiWatch Platform

## Critical Bugs

### 1. AuthPage: `useState` misused as `useEffect` (line 27)
`useState(() => { setInviteCode(code); setIsSignUp(true); })` is being used to run a side-effect during render. This should be `useEffect`. Calling state setters during initial render can cause React warnings and unpredictable behavior.

### 2. Search Visibility: "Searched for" still shows generic titles
The `isGenericTitle()` function (analyze-link line 158-171) fails to catch titles like "The New York Times - Breaking News, US News..." because:
- The regex only matches exact site names (`/^(the )?(new york times|...)$/i`), not titles that *contain* the site name plus extra words
- A title like "The New York Times - Breaking News, World News & Multimedia" passes all checks since it's >4 chars, not an exact match of a pattern, and contains more than just the domain
- **Fix**: Change the generic title check from exact-match to contains-match for known publications, and add patterns for `"site name - tagline"` format (e.g., `/^(the )?(new york times|nytimes)(\s*[-|·–—]\s*.+)?$/i`)

### 3. Search snippet falls back to `pageDescription` which is the site meta description
Line 589: `const articleSnippet = pageDescription || ...` — if Firecrawl returns the site's default meta description (e.g., "Live news, investigations, opinion..."), this gets used as the snippet. Need to validate that `pageDescription` is article-specific, not generic site-level.

### 4. `title_search_query` (line 594) cascades from the generic title bug
If `pageTitle` is still generic after the fix attempt, the Firecrawl search at line 511-519 queries `"The New York Times - Breaking News"` which returns irrelevant results, poisoning both search_visibility and competing_results.

## Functional Issues

### 5. Paywall bypass chain: services likely fail silently
- `12ft.io/api/proxy` — this API endpoint may no longer exist or work. 12ft.io has changed their service model.
- `removepaywall.com` — frequently goes down or changes domains
- `1ft.io` — same issues
- No rejectIf checks for most services (only google_cache has one), so garbage HTML from error pages passes through if it's >300 chars

### 6. Export JPG/PDF: background color calculation fragile
Lines 107-109: `getComputedStyle(...).getPropertyValue("--background")` returns the raw HSL values, then wraps in `hsl(...)`. If the CSS variable includes the `hsl()` wrapper already or is empty, the background breaks. Hardcoded fallback `"#1a1a2e"` only works for dark theme.

### 7. MentionDetailedView: surfaces_domain not rendered
The MentionDetailedView component (line 233-236) only checks `kw.surfaces_article` with green/gray indicators. It doesn't render the amber `surfaces_domain` state that was added to the LinkScannerDialog, creating inconsistency between the scanner results and saved mention views.

### 8. saveAsMention stores deeply nested flags but types.ts may not support it
The `flags` field is `jsonb` which accepts anything, but the deeply nested structure (search_discovery, brand_impact, etc.) could exceed reasonable size and the MentionDetailedView reads properties that may not all exist, risking silent undefined renders.

### 9. AI summary auto-generates on every mention load
MentionDetailPage line 280-284: `useEffect` fires `generateSummary()` every time the mention loads. This costs AI credits on every page view. Should cache results or only run once.

### 10. Similar mentions query uses `ilike` with content snippet
MentionDetailPage line 171: `ilike("content", `%${searchSnippet}%`)` is extremely slow on large tables — no index supports this, and it only fires for flagged mentions, but could still timeout.

## UI/UX Issues

### 11. Sidebar is cluttered — 17 nav items
The sidebar has 17 navigation items which is overwhelming. Items like "Getting Started", "Pricing", and "Approved Facts" vs "Approved Templates" could be consolidated.

### 12. Flags card on MentionDetailPage shows internal scanner fields
Line 613: `Object.keys(flags).length === 0` — but flags now contains `content_breakdown`, `brand_impact`, `search_discovery`, etc. from the link scanner. The "Flags & Indicators" card would show "No flags detected" only if the mention has zero flags, but if it was from the link scanner, it has many keys but none of the boolean flags (misinformation, coordinated, etc.), leading to a confusing empty display of "No flags detected" when there's actually rich data.

### 13. Confidence score display inconsistency
Across the codebase, confidence is sometimes stored as 0-100 and sometimes 0-1. MentionDetailPage line 585 has a manual check: `Number(confidence) > 1 ? ... : (confidence * 100)`. This is fragile — the link scanner stores `(confidence || 50) / 100` (line 201), creating 0-1 values, while other sources may store 0-100.

## Improvements to Implement

### 14. Generic title detection — comprehensive fix
Add detection for:
- `"Site Name - Tagline"` patterns (dash/pipe/dot separators)
- Content-length check: if pageDescription is <50 chars or matches site boilerplate, flag as generic
- Known publication prefixes/suffixes

### 15. Search snippet validation
Add AI-based or heuristic check to determine if `pageDescription` is article-specific or site-level boilerplate. If generic, use the first 1-2 sentences from the markdown content instead.

### 16. Bypass service health checks
Add `rejectIf` functions for all bypass services (not just google_cache) to detect error pages, CAPTCHAs, and service-unavailable responses.

### 17. Cache AI summaries on mention records
Store generated AI summaries in the mention's `flags` field so they don't regenerate on every page view.

### 18. YouTube transcript extraction
Currently YouTube scanning only gets oEmbed metadata + whatever Firecrawl can scrape. Consider using a transcript API for richer analysis.

## Proposed Implementation Plan

**Phase 1 — Critical Fixes (immediate)**
1. Fix AuthPage `useState` → `useEffect`
2. Fix `isGenericTitle()` to catch "Site Name - Tagline" patterns and partial matches
3. Add `pageDescription` genericness check; fallback to content excerpt for search snippet
4. Update `title_search_query` to use validated article-specific title
5. Sync MentionDetailedView to render `surfaces_domain` amber state
6. Cache AI summaries in mention flags to avoid repeated generation

**Phase 2 — Reliability (next)**
7. Add `rejectIf` checks for all bypass services
8. Fix export background color calculation
9. Fix confidence score normalization (standardize to 0-100 everywhere)
10. Fix Flags card to skip internal scanner keys when counting flags

**Phase 3 — Polish**
11. Deduplicate `cleanContent` functions (exists in 4+ files with slight variations)
12. Consolidate sidebar navigation
13. Add loading states for search discovery section

