/*
  # Add AWS Proxy Service URL to Settings

  1. Changes
    - Add `aws_proxy_url` column to `settings` table for storing the AWS proxy service endpoint
    - This URL points to the EC2/AWS service that handles Luna residential proxy routing

  2. Notes
    - The AWS proxy service runs Node.js + Puppeteer and has Luna credentials configured
    - When this URL is set, the edge function will call this service instead of trying direct proxy
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'aws_proxy_url'
  ) THEN
    ALTER TABLE settings ADD COLUMN aws_proxy_url text DEFAULT NULL;
  END IF;
END $$;