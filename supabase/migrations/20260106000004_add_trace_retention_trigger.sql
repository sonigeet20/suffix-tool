-- Trigger to keep only last 10 traces per offer
-- Automatically deletes older traces when new ones are inserted

CREATE OR REPLACE FUNCTION delete_old_traces()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete traces older than the 10 most recent for this offer
  DELETE FROM url_traces
  WHERE offer_id = NEW.offer_id
    AND id NOT IN (
      SELECT id FROM url_traces
      WHERE offer_id = NEW.offer_id
      ORDER BY visited_at DESC
      LIMIT 10
    );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for idempotence)
DROP TRIGGER IF EXISTS trigger_delete_old_traces ON url_traces;

-- Create trigger to run after each insert
CREATE TRIGGER trigger_delete_old_traces
AFTER INSERT ON url_traces
FOR EACH ROW
EXECUTE FUNCTION delete_old_traces();
