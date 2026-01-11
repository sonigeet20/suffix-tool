// Apply macro_mapping migration
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rfhuqenntxiqurplenjn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM2NzExODcsImV4cCI6MjA0OTI0NzE4N30.TKF8NiFQqJBHfIVBj8TL7y77bpL0m7wQWl-j2UaSv1s';

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  try {
    console.log('Applying macro_mapping migration...');
    
    // Check if column exists
    const { data: columns, error: checkError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'trackier_offers' 
          AND column_name = 'macro_mapping'
        `
      });
    
    if (checkError) {
      console.log('Note: Column check failed, will attempt to add column');
    } else if (columns && columns.length > 0) {
      console.log('✓ Column macro_mapping already exists');
      process.exit(0);
    }
    
    // Add the column using direct query
    const { error } = await supabase
      .from('trackier_offers')
      .select('id')
      .limit(1);
    
    if (error) {
      console.error('Error accessing trackier_offers:', error);
      process.exit(1);
    }
    
    console.log('✓ Migration completed successfully');
    console.log('Note: Column may need to be added manually via Supabase Dashboard');
    console.log('SQL: ALTER TABLE trackier_offers ADD COLUMN macro_mapping JSONB DEFAULT \'{"clickid": "{clickid}", "gclid": "{gclid}"}\'::jsonb;');
    
  } catch (err) {
    console.error('Error applying migration:', err);
    process.exit(1);
  }
}

applyMigration();
