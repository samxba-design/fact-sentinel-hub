# Scanning Troubleshooting Guide

## Common Issues & Solutions

### 1. "Scan complete — no new mentions found"

**Possible Causes:**

1. **All results are duplicates** (already in database from previous scan)
   - Check the Mentions page to see existing results
   - Try a different time period (e.g., "last 24 hours" instead of "last 7 days")
   - Try brand-specific keywords not used before

2. **Keywords not found anywhere** 
   - Verify keywords are spelled correctly in Settings
   - Try shorter/broader keywords (e.g., "Binance" instead of "Binance API vulnerability")
   - Add more keyword variations in Settings → Keywords

3. **Date range too narrow**
   - If scanning "today only", might not have enough volume
   - Try "last 7 days" for better coverage

4. **No external API keys configured** (Firecrawl, Brave, NewsAPI)
   - This is OK - Google News RSS will still work
   - But you might get fewer results
   - Configure keys in Settings → Connections for better coverage

5. **Google News RSS blocked**
   - Rare but can happen if IP is rate-limited
   - Try again in 1-2 hours
   - Check edge function logs for details

### 2. Scan times out or gets cut off

**Symptoms:**
- Scan shows "Scanning..." then suddenly stops
- Only partial results returned

**Fixes:**
- This should be rare now (200s timeout increased from 90s)
- If still happening: check server logs for timeouts
- Reduce number of sources (don't select all sources)
- Use shorter date range

### 3. Mentions are all low-quality or irrelevant

**Likely Cause:** AI filter being too permissive on borderline content

**Fix:**
- Check Risk Console for severity scoring
- Use sentiment filter ("negative only" to focus on threats)
- Manually label some mentions as "ignored" to train the system

### 4. Scheduled scans not running

**Symptoms:**
- Configured daily scan but no results appearing
- Last scan timestamp isn't updating

**Check:**
1. Go to Settings → Sources, verify schedule is enabled
2. Verify you have keywords configured (at least 1)
3. Check server logs for `scheduled-scan` function errors
4. The scan might be running in quiet hours - check Settings → Notification Settings

**Root cause:** Service role auth was broken (now fixed in this update)

### 5. "Unauthorized" error when running scan

**Cause:** 
- User not member of organization
- Session expired

**Fix:**
- Refresh page (re-authenticate)
- Verify user is invited to organization
- Check org membership in Settings → Team

## How to Debug

### View Scan Details
1. Go to Scans page
2. Click on any scan result
3. Drawer shows:
   - Total found vs saved
   - Filter breakdown (junk, AI rejected, deduplicated)
   - Sources that were scanned
   - Keywords that were used
   - Any errors that occurred

### Check Logs (For Admins)
```bash
# Supabase logs
supabase functions get-logs run-scan --follow

# Cloud function logs (if using Vercel/Railway)
# Check deployment logs for edge function execution
```

### Test Search Engines Independently
1. **Firecrawl**: Check FIRECRAWL_API_KEY exists and has credits
2. **Brave Search**: Check BRAVE_SEARCH_API_KEY is valid
3. **Google News RSS**: Try accessing in browser:
   ```
   https://news.google.com/rss/search?q=Binance&hl=en-US&gl=US&ceid=US:en
   ```
   - If it loads, RSS is working

## Expected Performance

### Scan Speed
- **Auto Scan**: 15-45 seconds (depends on keyword count + sources)
- **Custom Scan**: 10-30 seconds (fewer sources/keywords = faster)
- **Scheduled Scan**: 5-15 seconds (lightweight background task)

### Result Volume
- **News/Social focused**: 20-100 mentions per scan
- **Niche brands**: 5-20 mentions
- **Global brands (Binance, Amazon, etc)**: 50-500+ mentions
- **No activity**: 0 mentions (normal - not all brands mentioned every day)

### Data Quality
- ~70-80% of results are high-quality, relevant mentions
- ~20-30% might be tangential but still potentially useful
- AI filtering removes obvious spam/junk

## Features Now Working

✅ Scanning without API keys (Google News RSS fallback)
✅ Auto scans every hour/day (scheduled scans)
✅ Sentiment analysis on all mentions
✅ Threat severity scoring (critical/high/medium/low)
✅ Narrative clustering (auto-detecting themes)
✅ Real-time dashboard updates during scan
✅ Deduplication (won't add same URL twice)
✅ Multi-source aggregation (news + social + forums + reviews)

## Advanced: Adjusting Filter Sensitivity

If you want to:

1. **Include MORE borderline content**
   - Edit `run-scan` AI prompt, change to "INCLUDE when uncertain"
   - Increase `cleanedResults` length threshold from 50 to 30 chars

2. **Include LESS borderline content**
   - Edit AI prompt to hard-reject more categories
   - Increase content length threshold to 100+ chars

3. **Focus on HIGH-SEVERITY threats**
   - Use "negative only" sentiment filter when scanning
   - Check Risk Console priority sort

4. **Track competitor mentions**
   - Use "Competitor Scan" mode (passes competitor as brand context)
   - Add competitor keywords in custom scan

## Getting More Results

1. **Add more keywords** - each keyword expands the search surface
2. **Enable more sources** - especially social media (Reddit, Twitter, YouTube)
3. **Broaden date range** - 30 days catches more than 7 days
4. **Add competitor keywords** - "Coinbase", "Kraken" etc for Binance scans
5. **Configure external API keys** - Firecrawl, Brave, NewsAPI for premium coverage

## Common Questions

**Q: Why do I get fewer results than expected?**
A: Could be due date range, keywords being too specific, or brand not mentioned much. Try broader keywords or longer time period.

**Q: Are old mentions hidden or deleted?**
A: No, they're kept forever in the Mentions database. Use filters to find them.

**Q: Can I manually add a mention?**
A: Yes, Dashboard has "Add Mention" button. Useful for tracking offline mentions.

**Q: What happens if I change keywords mid-scan?**
A: Doesn't affect current scan. Changes apply to next scan only.

**Q: How do I know if a mention is a duplicate?**
A: Mentions page shows URL - same URL won't be added twice.

**Q: What's the difference between "negative" sentiment and "critical" severity?**
A: Sentiment = how negative the tone is (-1 to 1)
Severity = reputational impact (low/medium/high/critical)
A mention can be slightly negative sentiment but critical severity if it's about security/regulatory issues.
