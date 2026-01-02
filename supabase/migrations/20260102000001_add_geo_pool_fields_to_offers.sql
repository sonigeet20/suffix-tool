/*
  # Add geo_pool and strategy fields to offers

  - Adds geo_pool (jsonb), geo_strategy (text), geo_weights (jsonb)
  - geo_strategy constrained to known values; defaults to 'weighted'
  - Safe to re-run if columns already exist
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'geo_pool'
  ) THEN
    ALTER TABLE offers
      ADD COLUMN geo_pool jsonb DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN offers.geo_pool IS 'Array of country codes for geo routing, e.g., ["US","GB"]';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'geo_strategy'
  ) THEN
    ALTER TABLE offers
      ADD COLUMN geo_strategy text DEFAULT 'weighted';
    COMMENT ON COLUMN offers.geo_strategy IS 'Geo selection strategy: weighted, random, sequential (future)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'geo_weights'
  ) THEN
    ALTER TABLE offers
      ADD COLUMN geo_weights jsonb DEFAULT '{}'::jsonb;
    COMMENT ON COLUMN offers.geo_weights IS 'Weights map for geo_pool entries, e.g., {"US":70,"GB":30}';
  END IF;
END $$;

-- Add simple check constraint for geo_strategy values (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'offers' AND constraint_name = 'offers_geo_strategy_check'
  ) THEN
    ALTER TABLE offers
      ADD CONSTRAINT offers_geo_strategy_check
      CHECK (geo_strategy IN ('weighted', 'random', 'sequential'));
  END IF;
END $$;
