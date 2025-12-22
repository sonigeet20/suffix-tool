const axios = require('axios');

const TEST_SCENARIOS = [
  {
    name: 'Baseline Test - Simple URL',
    url: 'https://httpstat.us/301', // Simple HTTP redirect for baseline
    expected_type: 'http_redirect',
    max_redirects: 2
  },
  {
    name: 'Your Tracking Template Test',
    url: process.env.TEST_TRACKING_URL || 'REPLACE_WITH_YOUR_TRACKING_URL',
    expected_type: 'complex_chain',
    max_redirects: 20
  }
];

const PROXY_SERVICE_URL = process.env.PROXY_URL || 'http://localhost:3000';

async function testSingleUrl(testCase, runNumber) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Run #${runNumber}: ${testCase.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`URL: ${testCase.url}`);
  console.log(`Max Redirects: ${testCase.max_redirects}`);

  const startTime = Date.now();
  let result = {
    success: false,
    totalTime: 0,
    redirectCount: 0,
    perRedirectAvg: 0,
    breakdown: [],
    error: null
  };

  try {
    const response = await axios.post(`${PROXY_SERVICE_URL}/trace`, {
      url: testCase.url,
      max_redirects: testCase.max_redirects,
      timeout_ms: 60000
    }, {
      timeout: 65000 // Slightly longer than server timeout
    });

    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    result.success = response.data.success;
    result.totalTime = totalDuration;
    result.redirectCount = response.data.total_steps || 0;
    result.perRedirectAvg = result.redirectCount > 0
      ? totalDuration / result.redirectCount
      : 0;

    console.log(`\n✅ SUCCESS`);
    console.log(`   Total Time: ${totalDuration}ms (${(totalDuration/1000).toFixed(2)}s)`);
    console.log(`   Redirects Found: ${result.redirectCount}`);
    console.log(`   Time Per Redirect: ${result.perRedirectAvg.toFixed(0)}ms`);
    console.log(`   Final URL: ${response.data.final_url?.substring(0, 80)}...`);

    if (response.data.chain && response.data.chain.length > 0) {
      console.log(`\n   📊 Detailed Timing Breakdown:`);
      console.log(`   ${'─'.repeat(56)}`);
      console.log(`   Step | Type       | Status | Time    | URL Preview`);
      console.log(`   ${'─'.repeat(56)}`);

      response.data.chain.forEach((step, i) => {
        const timing = step.timing_ms || 0;
        const type = (step.redirect_type || 'unknown').padEnd(10);
        const status = (step.status || 'N/A').toString().padStart(3);
        const urlPreview = step.url.substring(0, 30);

        console.log(`   ${String(i+1).padStart(4)} | ${type} | ${status}    | ${timing.toString().padStart(6)}ms | ${urlPreview}...`);

        result.breakdown.push({
          step: i + 1,
          type: step.redirect_type,
          timing_ms: timing,
          url: step.url
        });
      });

      console.log(`   ${'─'.repeat(56)}`);
    }

    // Performance analysis
    console.log(`\n   🔍 Performance Analysis:`);
    if (result.perRedirectAvg > 10000) {
      console.log(`   ⚠️  VERY SLOW: ${(result.perRedirectAvg/1000).toFixed(1)}s per redirect`);
      console.log(`   💡 Recommendation: Implement Phase 1 optimizations`);
    } else if (result.perRedirectAvg > 5000) {
      console.log(`   ⚠️  SLOW: ${(result.perRedirectAvg/1000).toFixed(1)}s per redirect`);
      console.log(`   💡 Recommendation: Consider Phase 1 optimizations`);
    } else if (result.perRedirectAvg > 2000) {
      console.log(`   ⚡ MODERATE: ${(result.perRedirectAvg/1000).toFixed(1)}s per redirect`);
      console.log(`   💡 Recommendation: Good, but Phase 1 could help`);
    } else {
      console.log(`   ✨ FAST: ${(result.perRedirectAvg/1000).toFixed(1)}s per redirect`);
      console.log(`   💡 Performance is acceptable`);
    }

  } catch (error) {
    const endTime = Date.now();
    result.totalTime = endTime - startTime;
    result.error = error.message;

    console.log(`\n❌ FAILED`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Time Before Failure: ${result.totalTime}ms`);

    if (error.response) {
      console.log(`   Response Status: ${error.response.status}`);
      console.log(`   Response Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }

  return result;
}

async function runPerformanceTestSuite() {
  console.log('\n🧪 REDIRECT PERFORMANCE TEST SUITE');
  console.log('=' .repeat(60));
  console.log(`Testing against: ${PROXY_SERVICE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const results = {
    timestamp: new Date().toISOString(),
    proxy_url: PROXY_SERVICE_URL,
    tests: []
  };

  // Check if proxy service is running
  try {
    await axios.get(`${PROXY_SERVICE_URL}/health`);
    console.log('✅ Proxy service is running\n');
  } catch (error) {
    console.log('❌ Cannot connect to proxy service!');
    console.log(`   Make sure the service is running on ${PROXY_SERVICE_URL}`);
    console.log(`   Start it with: cd proxy-service && npm start\n`);
    return;
  }

  // Run each test scenario
  for (let i = 0; i < TEST_SCENARIOS.length; i++) {
    const testCase = TEST_SCENARIOS[i];

    if (testCase.url.includes('REPLACE_WITH')) {
      console.log(`\n⏭️  Skipping: ${testCase.name} (URL not configured)`);
      continue;
    }

    const result = await testSingleUrl(testCase, i + 1);
    results.tests.push({
      scenario: testCase.name,
      ...result
    });

    // Wait between tests
    if (i < TEST_SCENARIOS.length - 1) {
      console.log(`\n⏳ Waiting 3 seconds before next test...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Summary
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(60));

  const successfulTests = results.tests.filter(t => t.success);
  const failedTests = results.tests.filter(t => !t.success);

  console.log(`\n✅ Successful Tests: ${successfulTests.length}/${results.tests.length}`);
  console.log(`❌ Failed Tests: ${failedTests.length}/${results.tests.length}`);

  if (successfulTests.length > 0) {
    console.log(`\n📈 Performance Metrics (Successful Tests Only):`);

    const avgTotalTime = successfulTests.reduce((sum, t) => sum + t.totalTime, 0) / successfulTests.length;
    const avgPerRedirect = successfulTests.reduce((sum, t) => sum + t.perRedirectAvg, 0) / successfulTests.length;
    const totalRedirects = successfulTests.reduce((sum, t) => sum + t.redirectCount, 0);

    console.log(`   Average Total Time: ${avgTotalTime.toFixed(0)}ms (${(avgTotalTime/1000).toFixed(2)}s)`);
    console.log(`   Average Per Redirect: ${avgPerRedirect.toFixed(0)}ms (${(avgPerRedirect/1000).toFixed(2)}s)`);
    console.log(`   Total Redirects Traced: ${totalRedirects}`);

    console.log(`\n🎯 Optimization Recommendations:`);
    if (avgPerRedirect > 10000) {
      console.log(`   ⚠️  CRITICAL: Average ${(avgPerRedirect/1000).toFixed(1)}s per redirect`);
      console.log(`   📝 Action: Immediately implement Phase 1 optimizations:`);
      console.log(`      1. Change networkidle2 → domcontentloaded`);
      console.log(`      2. Remove 2000ms wait timeout`);
      console.log(`   💡 Expected improvement: 80-90% faster`);
    } else if (avgPerRedirect > 5000) {
      console.log(`   ⚠️  SLOW: Average ${(avgPerRedirect/1000).toFixed(1)}s per redirect`);
      console.log(`   📝 Action: Implement Phase 1 optimizations`);
      console.log(`   💡 Expected improvement: 60-80% faster`);
    } else if (avgPerRedirect > 2000) {
      console.log(`   ⚡ MODERATE: Average ${(avgPerRedirect/1000).toFixed(1)}s per redirect`);
      console.log(`   📝 Action: Consider Phase 1 for further improvement`);
      console.log(`   💡 Expected improvement: 40-60% faster`);
    } else {
      console.log(`   ✨ GOOD: Average ${(avgPerRedirect/1000).toFixed(1)}s per redirect`);
      console.log(`   📝 Performance is acceptable`);
      console.log(`   💡 Phase 2 hybrid approach could still provide gains`);
    }
  }

  // Save results to file
  const fs = require('fs');
  const resultsFile = `performance-results-${Date.now()}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Detailed results saved to: ${resultsFile}`);

  console.log(`\n${'='.repeat(60)}\n`);
}

// Run the test suite
if (require.main === module) {
  runPerformanceTestSuite().catch(error => {
    console.error('\n💥 Test suite crashed:', error);
    process.exit(1);
  });
}

module.exports = { testSingleUrl, runPerformanceTestSuite };
