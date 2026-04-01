

## Long-term cleanup: Add `mention_type` + `competitor_name` columns and fix all build errors

### Why this keeps breaking

The `run-scan` edge function already writes `mention_type` and `competitor_name` into every insert, but these columns do not exist in the live database. Supabase silently ignores unknown columns on insert (no error), but the generated `types.ts` doesn't include them, so any TypeScript code that tries to `.eq("mention_type", ...)` or `.select("competitor_name")` fails at build time. The external editor keeps adding those filters, the build breaks, I remove them, the cycle repeats.

### Fix — three steps

**Step 1: Run the migration to add the columns**

Apply the existing migration file `supabase/migrations/20260331000001_add_mention_type_competitor_separation.sql` using the migration tool. This will:
- Add `mention_type text NOT NULL DEFAULT 'brand'` to `mentions`
- Add `competitor_name text DEFAULT NULL` to `mentions`
- Create indexes for fast filtering
- After applying, `types.ts` will auto-regenerate with both columns

**Step 2: Fix the 4 TS2589 "excessively deep type" build errors**

These occur in files where Supabase query builders are used inside `.then()` chains or `Promise.all()` tuples, causing TypeScript to blow up on deep generic inference. The fix for each:

| File | Fix |
|------|-----|
| `LiveThreatFeed.tsx` (line 46) | Extract query into an `async` function, `await` it, cast result |
| `NarrativeNow.tsx` (line 79) | Same — extract `Promise.all` items into separate `await` calls with typed results |
| `SentimentSparklines.tsx` (line 29) | Same — break `.then()` chain into `async/await` with explicit typing |
| `CompetitorProfilePage.tsx` (line 59) | Same — extract the 4-query `Promise.all` into individually awaited calls |

Pattern for each fix:
```typescript
// Before (causes TS2589):
supabase.from("mentions").select("...").eq(...).then(({ data }) => { ... });

// After:
const { data } = await supabase.from("mentions").select("...").eq(...);
// process data...
```

**Step 3: Add `mention_type` filters to brand-only queries**

Once the columns exist and `types.ts` is regenerated, add `.eq("mention_type", "brand")` to all dashboard/brand queries so competitor mentions are properly excluded. This covers ~15 files:

- Dashboard widgets: `ActiveThreatsWidget`, `LiveThreatFeed`, `NarrativeNow`, `SentimentSparklines`, `SentimentForecastWidget`, `WatchlistDiscoveryWidget`, `NarrativeHealthWidget`, `MonitoringWidget`
- Pages: `BriefingPage`, `DashboardPage`, `MentionsPage`, `WarRoomPage`, `RiskConsolePage`, `NarrativeDetailPage`, `NarrativeGraphPage`
- Competitor pages already use content-based keyword matching; optionally add `.eq("mention_type", "competitor")` to `CompetitorFeedWidget`, `CompetitorIntelFeedPage`, `CompetitorProfilePage` for cleaner filtering

**Step 4: Fix `sentiment_confidence` value in `run-scan`**

Line 937-939 of `run-scan/index.ts` multiplies confidence by 100 then caps at 999.99 — but the column is `NUMERIC(5,2)` which maxes at 999.99. The default fallback of `65` is fine for the widened column. No change needed here since the earlier migration already widened it.

### Result

After this, the external editor can safely add `mention_type` filters without breaking the build, scans will properly tag brand vs competitor mentions, and dashboard metrics will correctly exclude competitor data.

