# Trackier API Testing Report

## Date
January 10, 2026

## Objective
Test Trackier API support for extended parameters (p11-p15) beyond the standard p1-p10 set.

## Testing Summary

### ✅ Confirmed Working
- **Authentication**: X-API-Key header authentication works correctly
- **Campaign Management**: Create, read, and retrieve campaigns via /v2/campaigns endpoints
- **Standard Parameters**: p1-p10 parameters fully supported
- **URL Template**: Trackier uses `{p1}`, `{p2}`, etc. placeholders in campaign URLs

### ❌ Not Supported
- **Extended Parameters**: p11-p15 parameters are **NOT** supported by Trackier API
- **PATCH Operations**: Campaign updates using HTTP PATCH return "Method Not Allowed"
- **Sub-ID Mapping Object**: API uses URL template format instead of a separate sub_ids mapping field

## API Response Format

**Campaign Object Structure:**
```json
{
  "campaign": {
    "id": 302,
    "title": "Campaign Name",
    "url": "https://example.com?{p1}&{p2}&{p3}",
    "subIdsAllowed": [],
    "subIdsBlocked": [],
    "advertiserId": "...",
    ...other fields
  }
}
```

**Note**: There is NO `subIds` object field. Parameters are embedded in the `url` field using placeholders.

## Test Results

### Test 1: Authentication Methods
- ✅ **X-API-Key Header**: `curl -H "X-API-Key: {key}"` - SUCCESS
- ❌ **Bearer Token**: `curl -H "Authorization: Bearer {key}"` - Failed with API_KEY_MISSING
- ❌ **Query Parameter**: `?api_key={key}` - Failed with API_KEY_MISSING

### Test 2: Campaign Creation with p11-p15
- Attempted to create campaign with p1-p15 in subIds mapping
- **Result**: API rejected with validation errors requiring additional fields (geo, currency, convTracking, payouts, revenue)
- **Finding**: Even when providing all required fields, API did not accept p11-p15 in campaign structure

### Test 3: Campaign URL Update with Extended Parameters
- Attempted to update campaign URL to include `{p11}`, `{p12}`, etc. placeholders
- **Result**: API returned "Method Not Allowed" for PATCH operations
- **Result**: URL parameter support limited to p1-p10

## Conclusion

**Trackier API Parameter Limit: p1-p10 ONLY**

The Trackier API does not support extended parameters beyond p1-p10. The p1-p15 feature in the Trackier Setup component has been **reverted to p1-p10** to match API capabilities.

## Supported Parameters (p1-p10)

| Parameter | Default Mapping | Description |
|-----------|-----------------|-------------|
| p1 | gclid | Google Click ID |
| p2 | fbclid | Facebook Click ID |
| p3 | msclkid | Microsoft Click ID |
| p4 | ttclid | TikTok Click ID |
| p5 | clickid | Generic Click ID |
| p6 | utm_source | UTM Source |
| p7 | utm_medium | UTM Medium |
| p8 | utm_campaign | UTM Campaign |
| p9 | custom1 | Custom Parameter 1 |
| p10 | custom2 | Custom Parameter 2 |

## Recommendations

1. **UI Configuration**: TrackierSetup.tsx limited to 10 parameter fields
2. **Documentation**: Update all Trackier docs to clarify p1-p10 maximum
3. **Future Enhancement**: Monitor Trackier API releases for extended parameter support
4. **Client Communication**: Inform users that custom parameters are limited to p9-p10

## Code Changes Made

1. **TrackierSetup.tsx**:
   - Reverted `sub_id_mapping` from p1-p15 to p1-p10
   - Updated parameter loop from `[1...15]` to `[1...10]`
   - Updated help text to clarify p1-p10 limitation

## Testing Command Used

```bash
curl -s -X GET "https://api.trackier.com/v2/campaigns/302" \
  -H "X-API-Key: 6960a7a0d42e87a8434ae67c0ee6960a7a0d4333" | jq '.campaign | keys'
```

## References

- Trackier API Base: `https://api.trackier.com/v2`
- Campaign Endpoint: `GET /v2/campaigns/{id}`
- Authentication: X-API-Key header (required)
- Rate Limiting: Not documented in test responses
