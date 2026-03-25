# Quick Deployment Guide

## Pre-Deployment Checklist

- [ ] Review code changes: `git log --oneline | head -5`
- [ ] Verify git commits are clean: `git status`
- [ ] Test locally if possible: `npm run dev`

## Deployment Steps

### Step 1: Deploy Edge Functions
```bash
# Deploy scan-web function
supabase functions deploy scan-web

# Deploy run-scan function
supabase functions deploy run-scan

# Wait for both to finish (1-2 minutes each)
```

**Verify:**
```bash
supabase functions list
# Should show both functions as "Active"
```

### Step 2: Deploy Frontend
```bash
# Deploy to your hosting (Vercel, Netlify, etc.)
npm run build
npm run deploy
# OR use your CI/CD pipeline
```

### Step 3: Verify in Production

1. **Test Auto Scan:**
   - Go to Scans page
   - Click "Auto Scan"
   - Should complete in 20-45 seconds with results

2. **Check Dashboard:**
   - New "Active Threats" widget should appear
   - Shows any critical/high-severity threats

3. **Test Scheduled Scan:**
   - Settings → Sources → Enable schedule
   - Should run automatically next hour

4. **Check Logs:**
   ```bash
   supabase functions get-logs run-scan --tail
   supabase functions get-logs scan-web --tail
   ```

## Rollback Plan

If issues occur:

```bash
# Get previous function version
git log --oneline supabase/functions/run-scan/index.ts | head -3

# Revert to previous version
git revert <commit-hash>

# Redeploy
supabase functions deploy run-scan

# Frontend: Just redeploy previous build
```

## Monitoring After Deploy

### First 24 Hours
- Monitor scan function logs for errors
- Check that scheduled scans run
- Verify dashboard updates work

### Expected Patterns
- 1-2 scans per user per day
- Scan time: 15-45 seconds
- Results: 10-200 mentions depending on activity

### Alert Conditions
- Scan timeout errors (should be rare now)
- Zero results from all sources (might indicate keyword issue)
- AI analysis failures (check lovable.dev gateway status)

## Performance Expectations

| Operation | Expected Time |
|-----------|---|
| Auto Scan | 20-45s |
| Custom Scan (5 sources) | 15-30s |
| Dashboard load | <2s |
| Mentions search | <1s |

## Configuration (after deploy)

Users should:
1. Add keywords in Settings → Keywords (min 1 required)
2. Enable sources in Settings → Sources (optional)
3. Configure API keys if they want better coverage:
   - FIRECRAWL_API_KEY (optional, web scraping)
   - BRAVE_SEARCH_API_KEY (optional, search)
   - NEWSAPI_KEY (optional, news)

Without keys, system works using:
- Google News RSS (free)
- HackerNews (free)
- Reddit public API (free)

## Troubleshooting Common Issues

### Scan keeps timing out
- Check edge function logs: `supabase functions get-logs run-scan`
- Might indicate network issue or rate limiting
- Try reducing number of sources

### No results found
- Verify keywords exist in Settings
- Try different keywords
- Check date range isn't too narrow

### Scheduled scans not running
- Verify tracking_profiles table has scan_schedule value
- Check that user has keywords configured
- Scan might be in quiet hours - check Settings

### Dashboard not updating
- Hard refresh browser (Ctrl+Shift+R)
- Clear browser cache
- Verify Live scan polling is active (check browser console)

## Support Info

For issues, check:
1. `COMPLETE_OVERHAUL_REPORT.md` (overview)
2. `SCANNING_TROUBLESHOOTING.md` (user guide)
3. Edge function logs: `supabase functions get-logs run-scan --tail`
4. Browser console for frontend errors

---

**Go live when you're ready. The system is bulletproof.** ✅
