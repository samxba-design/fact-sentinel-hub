

## Diagnosis: Scans Fail Due to Numeric Overflow

### Root Cause

The edge function logs show this error killing every scan:

```text
run-scan error: {
  code: "22003",
  details: "A field with precision 3, scale 2 must round to an absolute value less than 10^1.",
  message: "numeric field overflow"
}
```

The `mentions.sentiment_confidence` column is defined as `NUMERIC(3,2)`, which only accepts values from **-9.99 to 9.99**.

But the code does this on line 906:
```typescript
sentiment_confidence: a.sentiment_confidence != null
  ? Math.round(a.sentiment_confidence * 100)  // AI returns 0.85 → becomes 85 → OVERFLOW
  : 65,  // default 65 → OVERFLOW
```

Values like `65` or `85` overflow the column, causing the **entire batch insert to fail** — so zero mentions are ever saved.

The same issue exists for `narratives.confidence` (also `NUMERIC(3,2)`) where values like `0.5` are fine, but the column is fragile.

### Fix Plan

**1. Database migration — widen the column**

Alter `mentions.sentiment_confidence` from `NUMERIC(3,2)` to `NUMERIC(5,2)` so it can hold 0–100 values:

```sql
ALTER TABLE mentions ALTER COLUMN sentiment_confidence TYPE NUMERIC(5,2);
```

**2. Fix the default in run-scan code**

Change line 905-907 to clamp the value properly:

```typescript
sentiment_confidence: a.sentiment_confidence != null
  ? Math.min(Math.round(a.sentiment_confidence * 100), 999.99)
  : 0.65,
```

Actually, the better fix is to keep values in 0–1 range (matching the column's original intent) OR widen the column. Widening is simpler and doesn't break existing UI code that may expect 0-100 scale.

**3. Verify no other overflow-prone columns**

- `narratives.confidence` — code passes `0.5` directly, which fits `NUMERIC(3,2)`. Safe.
- `mentions.sentiment_score` — `NUMERIC(4,3)`, holds -1 to 1. Safe.
- `claim_extractions.confidence` — check if normalized similarly.

### Summary of Changes

| File | Change |
|------|--------|
| New migration SQL | `ALTER TABLE mentions ALTER COLUMN sentiment_confidence TYPE NUMERIC(5,2)` |
| `supabase/functions/run-scan/index.ts` | Clamp `sentiment_confidence` to valid range, fix default from `65` to `0.65` or keep `65` with widened column |

This single numeric overflow is why every scan ends with an edge error and zero results.

