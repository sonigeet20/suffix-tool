# URL Tracker - Added Features

## Latest Update: Integrated Tracer in Offer Form + Scripts Navigation

### Redirect Tracer Integrated into Offer Form
The powerful redirect tracer is now built directly into the offer creation/edit dialog as a dedicated tab.

**Access:** Click **Create/Edit** on any offer, then switch to the **Redirect Tracer** tab

**Core Features:**
- **Multi-Method Redirect Detection**:
  - HTTP 3xx redirects (301, 302, 307, 308)
  - Meta refresh redirects
  - JavaScript redirects (multiple patterns: window.location, location.href, location.replace, etc.)
  - Automatic redirect loop detection
  - Relative and absolute URL resolution

- **Proxy & Geo-Targeting Support**:
  - Save unlimited proxy configurations
  - Format: `http://username:password@host:port`
  - Country code labeling for organization
  - Test redirects through different geo-locations

- **Flexible Tracing Options**:
  - Trace any URL (not just saved offers)
  - Select from saved offers or enter custom URL
  - Configurable max redirects (1-50)
  - Adjustable timeout (5-60 seconds)
  - Custom User-Agent strings

- **Comprehensive Results Display**:
  - Step-by-step redirect chain visualization
  - HTTP status codes (color-coded)
  - Redirect type badges (HTTP/Meta/JavaScript/Final/Error)
  - Timing information per step and total
  - Expandable details for each step:
    - Full URL with copy button
    - All query parameters extracted
    - Response headers
    - HTML snippets for meta/JS redirects

- **Parameter Configuration**:
  - Click any step to select as parameter source
  - Visual indicators for selected vs saved configuration
  - Save configuration to offer database
  - Persists trace results with offers

- **Proxy Management**:
  - Add/delete proxy configurations
  - Name and organize proxies
  - Tag with country codes
  - Secure storage in database

**How to Use:**
1. Open an offer (create new or edit existing)
2. Switch to the **Redirect Tracer** tab
3. (Optional) Choose a proxy for geo-targeting
4. (Optional) Adjust advanced settings (max redirects, timeout, UA)
5. Click **Execute Trace**
6. Review the complete redirect chain
7. Expand any step to see detailed information
8. Click **Select** on desired parameter step
9. Click **Use Step X** to set the redirect chain step
10. Return to **Settings** tab and **Save Offer** to persist

### New Scripts Navigation Tab
Centralized location for all integration scripts and code snippets with one-click copy functionality.

**Access:** Click **Scripts** in the main navigation

**Available Scripts:**
- **Google Ads Script (with Rate Control)** - For Google Ads Scripts Editor with built-in API call throttling
  - Configurable `DELAY_MS` parameter at the top of the script
  - Set delay in milliseconds to control call speed:
    - `0` = No delay (fastest, testing only)
    - `1000` = 1 second delay (60 calls/minute)
    - `2000` = 2 seconds delay (30 calls/minute)
    - `5000` = 5 seconds delay (12 calls/minute)
  - Uses `Utilities.sleep()` to add pause between API calls
  - Prevents overwhelming your endpoint with requests
  - Adjust based on your campaign volume and API limits

- **Tracking Template** - Direct URL for Google Ads tracking template field
- **JavaScript Snippet** - Client-side landing page redirect with parameter fetching
- **Tracking Pixel & Redirect** - HTML snippets for visitor tracking
- **cURL Examples** - API testing and integration examples

All scripts use placeholder 'OFFER_NAME' that you replace with your actual offer names during deployment.

**Rate Control Benefits:**
- Control server load by spacing out API requests
- Avoid hitting rate limits on your infrastructure
- Fine-tune speed based on campaign size
- Easy to adjust without modifying core logic

### Rate Limiting Infrastructure
Added database infrastructure for endpoint rate limiting control.

**New Tables:**
- `rate_limit_config` - Store per-endpoint rate limits
  - Configure requests per second/minute/hour
  - Enable/disable rate limiting per endpoint
- `rate_limit_log` - Track API calls for rate limiting
  - Auto-cleanup after 24 hours
  - Indexed for fast lookups

**Available Endpoints for Rate Control:**
- `get-suffix` - Parameter fetching
- `track-hit` - Visitor tracking
- `trace-redirects` - Redirect chain tracing

Rate limits can be configured per user and per endpoint to control API usage speed.

**Technical Details:**
- Handles all redirect types without browser execution
- Parses HTML for meta refresh and JavaScript redirects
- Extracts parameters from each step in the chain
- Detects infinite loops and breaks gracefully
- Records timing for performance analysis
- Stores complete trace history with offers

---

## Previous Update: Integrated Tracer & Google Ads Scripts

### Tracer Under Each Offer
Every offer card now includes an integrated **URL Tracer** section with powerful functionality:

**Features:**
- **Execute Trace Button** - Test your tracking template and follow the redirect chain
- **Step Selector** - Choose which redirect step to extract parameters from
- **Save Configuration** - Persist your parameter extraction settings
- **Visual Status Indicators**:
  - "Selected" (green) - Your current selection
  - "Saved" (blue) - Currently saved in database
- **Show/Hide Scripts** - Toggle display of integration scripts

### Google Ads Scripts & Integration
Each offer now generates ready-to-use scripts for Google Ads integration:

**1. Google Ads Script (Fresh Params)**
- Fetches fresh tracking parameters on each call
- Paste directly into Google Ads Scripts Editor
- Automatically constructs final tracking URL with fresh params
- Returns dynamic URL for use in ad customizers

**2. Google Ads Tracking Template**
- Ready-to-paste tracking template URL
- Fetches fresh parameters on every ad click
- Direct integration with get-suffix endpoint
- Supports automatic redirect to final URL

**3. JavaScript Snippet (Landing Page)**
- Client-side script for landing page integration
- Fetches fresh parameters when page loads
- Automatic redirect with tracking parameters
- Includes error handling and fallback

**How to Use:**
1. In any offer card, find the **URL Tracer** section
2. Click **Show Scripts** to reveal integration code
3. Copy the appropriate script for your use case:
   - **Google Ads Script** - For dynamic parameter generation in Google Ads
   - **Tracking Template** - For Google Ads tracking template field
   - **JavaScript Snippet** - For landing page redirects
4. Click **Execute Trace** to test your tracking template
5. Select the redirect step with desired parameters
6. Click **Save** to persist your configuration

All scripts automatically use your offer configuration and fetch fresh parameters from the API on each request.

## Previous Update: Redirect Chain Trace Viewer in Offer List

### Added to Offer List
Each offer card displays a **Redirect Chain Trace** section (when tracking_template is configured):

- **Expandable trace viewer** - Click to see the complete redirect chain
- **Last trace timestamp** - Shows when the chain was last traced
- **Visual chain flow** - Step-by-step visualization with arrows and connection lines
- **Each step shows:**
  - Step number and status code (color-coded: green=2xx, blue=3xx, red=error)
  - Redirect type (http, meta, javascript, final)
  - Full URL at that step
  - **All query parameters** extracted at each step
  - **"Params Extracted" badge** - Highlights which step parameters were taken from (based on redirect_chain_step setting)

This gives you complete visibility into how your tracking URLs resolve and where the final tracking parameters come from.

## What Was Added

### 1. URL Tracing System
A complete URL tracking system has been implemented to monitor when users actually visit/click on your tracked URLs.

#### New Database Table: `url_traces`
- Tracks visitor IP addresses, user agents, referrers
- Captures device type (mobile, desktop, tablet, bot)
- Records location data (country, city)
- Stores query parameters passed with each visit
- Automatically keeps last 100 traces per offer

### 2. Track-Hit Edge Function
A new Supabase Edge Function `/track-hit` was created to log URL visits:

**Usage:**
```
https://your-project.supabase.co/functions/v1/track-hit?offer=OFFER_NAME&redirect=true
```

**Parameters:**
- `offer` (required) - The offer name to track
- `redirect` (optional) - Set to "true" to automatically redirect to the final URL

**Example Integration:**
```html
<!-- Tracking Pixel (no redirect) -->
<img src="https://your-project.supabase.co/functions/v1/track-hit?offer=my-offer" width="1" height="1" />

<!-- Redirect Link -->
<a href="https://your-project.supabase.co/functions/v1/track-hit?offer=my-offer&redirect=true">
  Click Here
</a>
```

### 3. Enhanced Analytics Dashboard
The Analytics page now shows two types of data for each offer:

**Suffix Requests Tab:**
- Shows the last 10 API calls to get-suffix
- Displays timestamp, suffix returned, and IP address
- This tracks when someone requests the tracking configuration

**URL Traces Tab:**
- Shows the last 100 actual visitor clicks/visits
- Displays detailed information:
  - Timestamp of visit
  - Device type (with colored badges)
  - IP address
  - Geographic location (country, city)
  - Referrer URL (where they came from)
  - Query parameters passed

### 4. Offer-Level Configuration Mapping
All offer-level configurations are fully utilized in the tracing process:

- **tracking_template** - The URL to trace through redirect chains
- **suffix_pattern** - Fallback pattern if tracing fails
- **target_geo** - Country targeting for proxy (used in get-suffix)
- **custom_referrer** - Custom referrer header for all redirects
- **redirect_chain_step** - Which step in the chain to extract params from (0=first, -1=last)

These configurations are used by the `get-suffix` edge function when it traces URLs through redirect chains to extract tracking parameters.

## How It Works

### Flow 1: Getting Tracking Configuration
1. Your application calls `/get-suffix?offer_name=YOUR_OFFER`
2. System loads offer configuration (tracking_template, target_geo, etc.)
3. If tracking_template is set:
   - Traces through all redirects using proxy
   - Applies custom_referrer if configured
   - Extracts params from specified redirect_chain_step
4. Returns the final suffix to use
5. Logs this request in `suffix_requests` table

### Flow 2: Tracking Actual Visits
1. User clicks on your tracked URL with tracking pixel or redirect
2. `/track-hit?offer=YOUR_OFFER` is called
3. System logs:
   - Visitor information (IP, device, location)
   - Referrer (where they came from)
   - Query parameters
4. Increments tracking_hits counter
5. Optionally redirects to final URL if `redirect=true`

## Statistics Tracking

Both operations update the `offer_statistics` table:
- **total_suffix_requests** - How many times configuration was requested
- **total_tracking_hits** - How many actual visitor clicks/views
- **last_request_at** - Most recent activity timestamp

## Automatic Cleanup

To keep the database lean:
- **suffix_requests**: Keeps last 10 per offer
- **url_traces**: Keeps last 100 per offer
- Cleanup happens automatically via database triggers
- All-time totals are preserved in `offer_statistics`
