-- Add result_snapshot to scan_runs for persisting scan diagnostics
ALTER TABLE scan_runs ADD COLUMN IF NOT EXISTS result_snapshot jsonb;

COMMENT ON COLUMN scan_runs.result_snapshot IS 'Stores scan_log, keyword_groups, filter stats, zero_reason, and source breakdown for UI diagnostics';
