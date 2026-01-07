import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Add trace_date column
    const { error: alterError } = await supabaseClient.rpc('exec_sql', {
      sql: 'ALTER TABLE daily_trace_counts ADD COLUMN IF NOT EXISTS trace_date DATE DEFAULT CURRENT_DATE;'
    });

    if (alterError) {
      console.error('Error adding column:', alterError);
      // Try direct query
      const { error: directError } = await supabaseClient
        .from('daily_trace_counts')
        .select('trace_date')
        .limit(1);
      
      if (directError && directError.message.includes('does not exist')) {
        return Response.json({
          success: false,
          error: 'Please run this SQL in Supabase Dashboard SQL Editor:\n\nALTER TABLE daily_trace_counts ADD COLUMN IF NOT EXISTS trace_date DATE DEFAULT CURRENT_DATE;\nCREATE INDEX IF NOT EXISTS idx_daily_trace_counts_date ON daily_trace_counts(offer_name, account_id, trace_date);\nUPDATE daily_trace_counts SET trace_date = CURRENT_DATE WHERE trace_date IS NULL;'
        }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      message: 'Migration completed successfully'
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message,
      instructions: 'Please run this SQL in Supabase Dashboard SQL Editor:\n\nALTER TABLE daily_trace_counts ADD COLUMN IF NOT EXISTS trace_date DATE DEFAULT CURRENT_DATE;\nCREATE INDEX IF NOT EXISTS idx_daily_trace_counts_date ON daily_trace_counts(offer_name, account_id, trace_date);\nUPDATE daily_trace_counts SET trace_date = CURRENT_DATE WHERE trace_date IS NULL;'
    }, { status: 500 });
  }
});
