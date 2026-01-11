/*
  Migration: Add documentation for referrer_hops field
  
  ## Changes
  - Documents the new optional `hops` field in referrer objects
  - No schema changes needed (JSONB is flexible)
  
  ## Referrer Object Structure (Updated)
  ```json
  [{
    "url": "https://example.com/landing",
    "weight": 50,
    "enabled": true,
    "label": "Main Landing Page",
    "hops": [1, 2, 3]  // NEW: Optional array of hop numbers where referrer should be applied
  }]
  ```
  
  ## Field: hops (optional)
  - Type: Array of integers (number[])
  - Purpose: Specifies which redirect hops should include the referrer header
  - Behavior:
    - If null/empty/undefined: Referrer is applied to ALL hops (default behavior)
    - If array provided (e.g., [1]): Referrer only applied to specified hop numbers
  - Use Case: Some networks (like mobupps) detect referrer on all hops as a loop
    - Solution: Apply referrer only on first hop [1] to pass their validation
  - Hop numbering: 1-indexed (first request = hop 1, second = hop 2, etc.)
  
  ## Example Usage
  - Apply to first hop only: "hops": [1]
  - Apply to first two hops: "hops": [1, 2]
  - Apply to all hops: "hops": null or omit field entirely
*/

-- No schema changes needed, this is documentation only
-- The referrers JSONB column already supports arbitrary JSON structures
SELECT 'Referrer hops documentation added - no schema changes required' AS status;
