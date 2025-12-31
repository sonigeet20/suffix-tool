/**
 * Test local proxy service with enhanced browser redirect detection
 */

const fetch = require('node-fetch');

const LOCAL_PROXY_URL = 'http://localhost:3001';

async function testBrowserMode(testUrl, mode = 'browser', targetCountry = null) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing Enhanced Browser Mode Locally`);
  console.log(`${'='.repeat(80)}`);
  console.log(`🎯 Target URL: ${testUrl}`);
  console.log(`🔧 Mode: ${mode}`);
  if (targetCountry) {
    console.log(`🌍 Geo-targeting: ${targetCountry}`);
  }
  console.log(`⏰ Timestamp: ${new Date().toISOString()}\n`);

  const startTime = Date.now();

  try {
    const response = await fetch(`${LOCAL_PROXY_URL}/trace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: testUrl,
        mode: mode,
        max_redirects: 20,
        timeout_ms: 90000,
        target_country: targetCountry,
      }),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Request failed with status ${response.status}`);
      console.error(`Error: ${error}`);
      return { success: false, error };
    }

    const result = await response.json();

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Test Results`);
    console.log(`${'='.repeat(80)}`);
    console.log(`⏱️ Total Duration: ${duration}ms`);
    console.log(`✅ Success: ${result.success}`);
    console.log(`🎯 Initial URL: ${testUrl}`);
    console.log(`🏁 Final URL: ${result.final_url}`);
    console.log(`📄 Total Steps: ${result.total_steps || result.chain?.length || 0}`);
    console.log(`🪟 Popups: ${result.total_popups || 0}`);

    if (result.js_redirects && result.js_redirects.length > 0) {
      console.log(`\n🔍 JavaScript Redirects Detected: ${result.js_redirects.length}`);
      result.js_redirects.forEach((redirect, i) => {
        console.log(`  ${i + 1}. ${redirect.type}`);
        if (redirect.url) console.log(`     URL: ${redirect.url}`);
        if (redirect.delay) console.log(`     Delay: ${redirect.delay}ms`);
      });
    } else {
      console.log(`\n🔍 JavaScript Redirects: 0`);
    }

    if (result.form_submissions && result.form_submissions.length > 0) {
      console.log(`\n📝 Form Submissions Detected: ${result.form_submissions.length}`);
      result.form_submissions.forEach((form, i) => {
        console.log(`  ${i + 1}. ${form.method} ${form.action}`);
      });
    } else {
      console.log(`\n📝 Form Submissions: 0`);
    }

    if (result.network_stats) {
      console.log(`\n📊 Network Statistics:`);
      console.log(`  ├─ Document requests: ${result.network_stats.document_requests}`);
      console.log(`  ├─ Total network clicks: ${result.network_stats.total_network_clicks}`);
      console.log(`  ├─ Retry attempts: ${result.network_stats.retry_attempts}`);
      console.log(`  ├─ JS redirect attempts: ${result.network_stats.js_redirect_attempts || 0}`);
      console.log(`  ├─ Form submissions: ${result.network_stats.form_submission_count || 0}`);
      console.log(`  └─ Request ratio: ${result.network_stats.request_ratio}x`);
    }

    if (result.chain && result.chain.length > 0) {
      console.log(`\n🔗 Redirect Chain:`);
      result.chain.forEach((step, i) => {
        console.log(`  ${i + 1}. [${step.status}] ${step.redirect_type} - ${step.url}`);
      });
    }

    if (result.popup_chains && result.popup_chains.length > 0) {
      console.log(`\n🪟 Popup Chains:`);
      result.popup_chains.forEach((popup, i) => {
        console.log(`  Popup ${i + 1}:`);
        console.log(`    Opener: ${popup.opener_url}`);
        console.log(`    Final: ${popup.final_url}`);
      });
    }

    console.log(`\n${'='.repeat(80)}\n`);

    return { success: true, result, duration };

  } catch (error) {
    console.error(`\n❌ Test failed:`, error.message);
    return { success: false, error: error.message };
  }
}

// Run test
const testUrl = process.argv[2] || 'https://tatrck.com/h/0Hu30-ze0jAg?model=cpc';
const mode = process.argv[3] || 'browser';
const targetCountry = process.argv[4] || null;

(async () => {
  const result = await testBrowserMode(testUrl, mode, targetCountry);
  
  if (result.success) {
    console.log(`✅ Test completed successfully`);
    console.log(`   Duration: ${result.duration}ms`);
    if (result.result.js_redirects) {
      console.log(`   JS Redirects: ${result.result.js_redirects.length}`);
    }
    if (result.result.form_submissions) {
      console.log(`   Form Submissions: ${result.result.form_submissions.length}`);
    }
  } else {
    console.log(`❌ Test failed: ${result.error}`);
  }
  
  process.exit(0);
})();
