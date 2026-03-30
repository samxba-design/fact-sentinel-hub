-- Ensure result_snapshot column exists (safe to run multiple times)
ALTER TABLE scan_runs ADD COLUMN IF NOT EXISTS result_snapshot jsonb;
COMMENT ON COLUMN scan_runs.result_snapshot IS 'Scan diagnostics: scan_log, source breakdown, filter stats, error details';

-- Also ensure scan_runs update policy allows service role to update any row
-- (service role bypasses RLS by default, this is just documentation)
-- No change needed — service role key already bypasses RLS
