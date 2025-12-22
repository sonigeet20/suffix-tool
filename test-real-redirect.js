const supabaseUrl = 'https://rfhuqenntxiqurplenjn.supabase.co';

async function testTraceRedirects() {
  try {
    console.log('Testing trace-redirects with a real redirect URL...\n');

    const response = await fetch(`${supabaseUrl}/functions/v1/trace-redirects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://amzn.to/3BxQqXv',
        max_redirects: 20,
        timeout_ms: 15000,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        use_proxy: false,
      }),
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }

    const result = await response.json();
    console.log('\n✅ TRACE SUCCESSFUL!\n');
    console.log('- Total steps:', result.total_steps);
    console.log('- Total timing:', result.total_timing_ms + 'ms');
    console.log('- Proxy used:', result.proxy_used);
    console.log('- Final URL:', result.final_url);

    console.log('\n📍 REDIRECT CHAIN:');
    result.chain.forEach((step, index) => {
      console.log(`\nStep ${index + 1}:`);
      console.log('  URL:', step.url);
      console.log('  Status:', step.status);
      console.log('  Type:', step.redirect_type);
      console.log('  Method:', step.method);
      console.log('  Timing:', step.timing_ms + 'ms');
      if (step.error) {
        console.log('  Error:', step.error);
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testTraceRedirects();
