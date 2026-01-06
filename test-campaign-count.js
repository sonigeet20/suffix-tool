#!/usr/bin/env node

/**
 * Test script to demonstrate campaign_count behavior
 * Tests both single campaign (backward compatible) and multiple campaigns
 */

const SUPABASE_URL = 'https://rfhuqenntxiqurplenjn.supabase.co';

async function testGetSuffix(offerName, campaignCount = null) {
  let url = `${SUPABASE_URL}/functions/v1/get-suffix?offer_name=${encodeURIComponent(offerName)}`;
  
  if (campaignCount !== null) {
    url += `&campaign_count=${campaignCount}`;
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST: ${campaignCount ? `Multiple campaigns (${campaignCount})` : 'Single campaign (default)'}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(70));
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.success) {
      console.log('❌ Request failed:', data.error || data.message);
      return;
    }
    
    console.log('\n✅ Success!');
    console.log(`\nOffer Name: ${data.offer_name}`);
    console.log(`Trace Successful: ${data.trace_successful}`);
    
    // Check backward compatibility mode (single suffix)
    if (data.suffix && !data.campaign_count) {
      console.log('\n📝 BACKWARD COMPATIBLE MODE (Single Campaign)');
      console.log(`Suffix: ${data.suffix.substring(0, 100)}...`);
      console.log(`Params Extracted: ${Object.keys(data.params_extracted || {}).length} params`);
      console.log(`Proxy IP: ${data.proxy_ip || 'N/A'}`);
      console.log(`User Agent: ${data.user_agent ? data.user_agent.substring(0, 50) + '...' : 'N/A'}`);
      console.log(`Selected Geo: ${data.selected_geo || 'N/A'}`);
    }
    
    // Check multiple campaigns mode
    if (data.campaign_count && data.suffixes) {
      console.log('\n📦 MULTIPLE CAMPAIGNS MODE');
      console.log(`Requested: ${data.campaign_count} campaigns`);
      console.log(`Generated: ${data.suffixes_generated} unique suffixes`);
      
      console.log('\nUnique Suffixes:');
      data.suffixes.forEach((item, index) => {
        console.log(`\n  Campaign ${index + 1}:`);
        console.log(`    Suffix: ${item.suffix.substring(0, 80)}...`);
        console.log(`    Params: ${Object.keys(item.params_extracted || {}).length} params`);
        console.log(`    Proxy IP: ${item.proxy_ip || 'N/A'}`);
        console.log(`    Geo: ${item.selected_geo || 'N/A'}`);
      });
      
      // Verify uniqueness
      const uniqueSuffixes = new Set(data.suffixes.map(s => s.suffix));
      console.log(`\n  ✅ Uniqueness Check: ${uniqueSuffixes.size}/${data.suffixes.length} unique`);
      if (uniqueSuffixes.size < data.suffixes.length) {
        console.log('  ⚠️  WARNING: Some suffixes are duplicates!');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run tests
(async () => {
  const offerName = process.argv[2] || 'test-offer';
  
  console.log('\n' + '='.repeat(70));
  console.log('CAMPAIGN COUNT BEHAVIOR TEST');
  console.log('='.repeat(70));
  console.log(`Testing with offer: ${offerName}`);
  console.log(`Usage: node test-campaign-count.js <offer_name>`);
  
  // Test 1: No campaign_count parameter (backward compatible)
  await testGetSuffix(offerName);
  
  // Test 2: campaign_count=1 (explicit single)
  await testGetSuffix(offerName, 1);
  
  // Test 3: campaign_count=3 (multiple campaigns)
  await testGetSuffix(offerName, 3);
  
  console.log('\n' + '='.repeat(70));
  console.log('TESTS COMPLETE');
  console.log('='.repeat(70) + '\n');
})();
