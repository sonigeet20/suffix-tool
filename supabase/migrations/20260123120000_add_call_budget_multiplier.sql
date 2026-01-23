-- Add call_budget_multiplier column to daily_trace_counts table
-- This allows per-account/offer override of daily call budget
-- Default: null (uses script-provided or system default of 5x)
-- Priority: DB override > script parameter > default 5x

ALTER TABLE daily_trace_counts 
ADD COLUMN call_budget_multiplier DECIMAL(4,2) CHECK (call_budget_multiplier IS NULL OR (call_budget_multiplier >= 1.0 AND call_budget_multiplier <= 20.0));

COMMENT ON COLUMN daily_trace_counts.call_budget_multiplier IS 'Budget multiplier for daily API calls. Formula: max_daily_calls = yesterday_clicks × multiplier. Default: 5x. Priority: DB override > script > default.';
