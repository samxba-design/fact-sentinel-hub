-- Schedule check-spikes to run every hour via pg_cron (Supabase Pro+)
-- This ensures spike detection runs independently of scheduled scans
-- Note: Supabase cron jobs are configured in the dashboard or via pg_cron extension
-- This migration documents the intended schedule for reference

-- Weekly digest: every Monday at 7:00 AM UTC
-- check-spikes: every hour at :00
-- scheduled-scan: already configured per org tracking_profile.scan_schedule

-- If pg_cron is available:
-- SELECT cron.schedule('check-spikes-hourly', '0 * * * *', $$
--   SELECT net.http_post(
--     url := current_setting('app.supabase_url') || '/functions/v1/check-spikes',
--     headers := '{"Authorization": "Bearer " || current_setting("app.service_role_key"), "Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb
--   )
-- $$);

-- For now: add a note column to tracking_profiles for last_spike_check
ALTER TABLE tracking_profiles ADD COLUMN IF NOT EXISTS last_spike_check timestamptz DEFAULT NULL;
ALTER TABLE tracking_profiles ADD COLUMN IF NOT EXISTS weekly_digest_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN tracking_profiles.last_spike_check IS 'Timestamp of last check-spikes run for this org';
COMMENT ON COLUMN tracking_profiles.weekly_digest_enabled IS 'Whether weekly digest emails are enabled for this org';
