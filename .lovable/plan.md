

## Fix: Duplicate variable declarations in App.tsx

The build fails because `EntityRecordsPage` and `EntityDetailPage` are declared twice in `src/App.tsx` (lines 59-62 are duplicates of lines 57-58). There are also duplicate route entries for `/entities` and `/entities/:id` further down.

### Changes

**File: `src/App.tsx`**
1. Remove the duplicate lazy imports on lines 61-62
2. Remove the duplicate route entries for `/entities` and `/entities/:id` (around lines 153-154, which duplicate lines 140-141)

That's it — one file, removing 4 duplicate lines.

