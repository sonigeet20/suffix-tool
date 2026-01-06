/*
  # Add device_distribution to offers

  - Adds device_distribution (jsonb) column for custom user agent device percentages
  - Default: [{"deviceCategory":"mobile","weight":60},{"deviceCategory":"desktop","weight":30},{"deviceCategory":"tablet","weight":10}]
  - Safe to re-run if column already exists
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'device_distribution'
  ) THEN
    ALTER TABLE offers
      ADD COLUMN device_distribution jsonb DEFAULT '[{"deviceCategory":"mobile","weight":60},{"deviceCategory":"desktop","weight":30},{"deviceCategory":"tablet","weight":10}]'::jsonb;
    COMMENT ON COLUMN offers.device_distribution IS 'Custom device type distribution for user agent generation, e.g., [{"deviceCategory":"mobile","weight":60}]';
  END IF;
END $$;
