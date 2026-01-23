# V5 Webhook System - Test Plan

This checklist gets V5 ready for manual validation. It assumes you have Supabase admin access (service-role key) and can run psql or Supabase CLI.

## 1) Run the migration

```bash
# From repo root
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260123020000_v5_webhook_system.sql
# or: supabase db push  # if using Supabase CLI project binding
```

## 2) Deploy edge functions

Deploy all V5 functions so HTTP entrypoints exist:

```bash
supabase functions deploy v5-webhook-conversion
supabase functions deploy v5-get-multiple-suffixes
supabase functions deploy v5-mark-suffixes-used
supabase functions deploy v5-store-traced-suffixes
supabase functions deploy v5-fetch-queue
```

## 3) Seed minimal test data

Create a mapping and a couple bucket rows so fallback/bucket flows work.

```sql
-- Account/campaign mapping
select insert_v5_mapping_if_missing('acct_1', 'cmp_1', 'OfferA', 'Test Campaign 1');

-- Seed bucket rows (unique suffix_hash = suffix)
insert into v5_suffix_bucket (account_id, offer_name, suffix, suffix_hash, source)
values
  ('acct_1', 'OfferA', 'a=1&b=2', 'a=1&b=2', 'zero_click'),
  ('acct_1', 'OfferA', 'a=3&b=4', 'a=3&b=4', 'traced')
on conflict do nothing;
```

## 4) Endpoint smoke tests (service key)

Export env:

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SERVICE_KEY="<service_role_key>"
```

### 4.1 Enqueue a webhook

```bash
curl -s -X POST "${SUPABASE_URL}/functions/v1/v5-webhook-conversion" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "acct_1",
    "offer_name": "OfferA",
    "campaign_id": "cmp_1",
    "new_suffix": "x=123",
    "trackier_conversion_id": "conv_1",
    "trackier_click_id": "click_1"
  }'
```

### 4.2 Fetch queue (expect 1 pending)

```bash
curl -s "${SUPABASE_URL}/functions/v1/v5-fetch-queue?account_id=acct_1"
```

### 4.3 Pull suffixes from bucket (fallback path)

```bash
curl -s -X POST "${SUPABASE_URL}/functions/v1/v5-get-multiple-suffixes" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "acct_1", "offer_name": "OfferA", "count": 5}'
```

### 4.4 Mark suffixes used (use ids from 4.3 or queue items)

```bash
curl -s -X POST "${SUPABASE_URL}/functions/v1/v5-mark-suffixes-used" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"suffix_ids": ["<uuid-from-queue-or-bucket>"]}'
```

### 4.5 Store traced suffixes (re-seed bucket)

```bash
curl -s -X POST "${SUPABASE_URL}/functions/v1/v5-store-traced-suffixes" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "acct_1",
    "offer_name": "OfferA",
    "suffixes": [
      {"suffix": "z=9", "source": "traced"},
      {"suffix": "z=10", "source": "traced"}
    ]
  }'
```

## 5) Google Ads script wiring (V5 All-In)

- In the UI, copy the "Google Ads Script (V5 Webhook All-In)" card.
- Set `OFFER_DEFAULT` and optionally `OFFER_BY_CAMPAIGN` for your campaign IDs.
- Schedule hourly (or faster) in Google Ads scripts; ensure Trackier webhook is pointing at `v5-webhook-conversion`.
- With the above seed, queue polling should pick the enqueued suffix first, then fall back to bucket rows.

## 6) What to verify

- `v5_fetch_queue` returns pending items and they get consumed after script run (status should move off `pending`).
- `v5_mark_suffixes_used` increments `times_used` and `last_used_at` in `v5_suffix_bucket`.
- Bucket uniques are enforced by `suffix_hash`; duplicates are ignored by insert.
- Campaign URLs in Google Ads receive new suffixes and differ from previous value.

## 7) Clean up

```bash
delete from v5_webhook_queue where account_id = 'acct_1';
delete from v5_suffix_bucket where account_id = 'acct_1';
delete from v5_campaign_offer_mapping where account_id = 'acct_1';
```
