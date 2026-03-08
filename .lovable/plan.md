

# Full Functionality Audit

## Critical Bug: Competitor Scans Are Fundamentally Broken

The "Scan" button on competitors does not work. Here is why:

1. `CompetitorsPage.scanCompetitor()` calls `run-scan` with `keywords: [comp.name]`
2. `run-scan` loads the org's structured keywords from DB (line 275-279) and builds `kwGroups` from those, not from the passed keywords
3. `brandKws` (line 327) uses `kwGroups.brand` (the org's own brand keywords) — NOT the competitor name
4. All search queries are built from `brandKws`, so Firecrawl searches for the ORG's brand, not the competitor
5. The AI relevance filter (line 734-761) judges content against `"${brandContext}"` which is the ORG name — so any content actually about the competitor gets REJECTED as "not about the brand"

**Result**: Competitor scans find content about your own brand, not the competitor. If by chance competitor content slips through, the AI rejects it.

### Fix
When `run-scan` receives explicit `keywords`, it must:
- Use those keywords as `brandKws` for search queries
- Set `brandContext` to the passed keyword (competitor name) for AI relevance judging
- Skip loading DB keywords when explicit keywords are provided

## Critical Bug: Competitor Mention Counting Uses `ilike`

`CompetitorsPage.loadCompetitors()` (line 89) and `CompetitorProfilePage.loadProfile()` (line 51) both use `ilike("content", "%CompetitorName%")` to find competitor mentions. This:
- Is extremely slow on large tables (no index)
- Can match partial words (e.g. "Coin" matching "Bitcoin")
- Doesn't match mentions where the competitor name appears in the URL or author but not content

### Fix
Replace `ilike` with `textSearch("content", competitorName, { type: "plain" })` for better performance and accuracy.

## Scan Inconsistency: Confidence Score Dual-Scale

`run-scan` line 877-881 still has a fragile dual-scale check:
```
(analysis.sentiment_confidence || 0.5) <= 1 
  ? (analysis.sentiment_confidence || 0.5) * 100 
  : (analysis.sentiment_confidence || 50)
```
The AI prompt asks for confidence 0-1, so values like `0.85` correctly multiply to `85`. But if the AI returns `1` (valid 0-1 scale), the check `<= 1` catches it but `1 * 100 = 100` is correct. The real issue: if AI returns something like `0.5`, it becomes `50`, which is correct. But `50` (already 0-100) would NOT be <= 1, so it stays `50`. This actually works, but the code is fragile and confusing.

### Fix
The AI prompt already specifies `0 to 1`. Just always multiply by 100: `Math.round((analysis.sentiment_confidence || 0.5) * 100)`. Add `max(0, min(100, ...))` clamping.

## Performance Issue: Sequential Archive Fallbacks in scan-web

`scan-web` line 293-299: When content is blocked/thin, it calls `fetchArchiveContent()` sequentially for EACH result. With 10+ blocked results, this adds 60+ seconds of serial HTTP calls.

### Fix
Batch archive fallback calls using `Promise.allSettled()` with concurrency limit of 3.

## Missing: Retry Logic for Firecrawl API

No retry on 429 (rate limit) for any Firecrawl calls across `scan-web`, `analyze-link`. A single rate limit kills the entire scan silently.

### Fix
Add `fetchWithRetry()` wrapper with exponential backoff for 429 responses, used by all Firecrawl calls.

## Missing: Competitor Domain/Notes Not Persisted

`CompetitorsPage` collects domain and notes in the "Add Competitor" dialog but never saves them — the `keywords` table only has `value`, `type`, `status`. Domain and notes fields are UI-only.

### Fix
Store domain/notes in the keyword's unused fields or add a simple lookup in org metadata. Alternatively, remove the misleading domain/notes fields from the add dialog to avoid confusion.

## UI Issue: Competitor Profile Data is Unreliable

The competitor profile page shows 0 mentions and 0 narratives because:
- Mentions are matched by `ilike("content", "%name%")` — content may not contain the competitor name verbatim
- Narratives are matched by `ilike("name", "%name%")` — narrative names rarely contain the exact competitor name

### Fix
For mentions: also search by `url` containing the competitor domain, and by `flags->matched_query` containing the competitor name. For narratives: search `description` in addition to `name`.

---

## Implementation Plan

### Phase 1: Fix Competitor Scanning (Critical)
1. **Fix `run-scan`**: When explicit keywords are passed (not from DB), use them as `brandContext` and `brandKws` for both search queries and AI relevance filtering. Add a `scan_context` parameter ("brand" vs "competitor") to control behavior.
2. **Fix competitor mention counting**: Replace `ilike` with `textSearch` in both `CompetitorsPage` and `CompetitorProfilePage`.
3. **Remove misleading domain/notes fields** from Add Competitor dialog (they aren't saved anywhere).

### Phase 2: Reliability
4. **Add `fetchWithRetry`** to `scan-web` for Firecrawl API calls with exponential backoff on 429.
5. **Parallelize archive fallbacks** in `scan-web` with concurrency limit.
6. **Normalize confidence scores**: Always multiply by 100, remove dual-scale check.

### Phase 3: Polish
7. **Improve competitor profile queries**: Search mentions by content text search + matched_query flag. Search narratives by name OR description.

