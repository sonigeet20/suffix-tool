const supabaseUrl = 'https://rfhuqenntxiqurplenjn.supabase.co';

async function testTraceRedirects() {
  try {
    console.log('Testing trace-redirects function...');

    const response = await fetch(`${supabaseUrl}/functions/v1/trace-redirects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://bit.ly/3wZ9Qxz',
        max_redirects: 20,
        timeout_ms: 15000,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        user_id: 'f9a22630-9c70-4f4c-b3ac-421d1fd4ad2b',
        use_proxy: true,
      }),
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }

    const result = await response.json();
    console.log('\nTrace result:');
    console.log('- Success:', result.success);
    console.log('- Proxy used:', result.proxy_used);
    console.log('- Proxy IP:', result.proxy_ip);
    console.log('- Geo location:', JSON.stringify(result.geo_location, null, 2));
    console.log('- Chain length:', result.chain?.length);
    console.log('\nFull result:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testTraceRedirects();
