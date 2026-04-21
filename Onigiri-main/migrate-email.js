/**
 * Quick migration: create email_reports table in Supabase
 * Run: node migrate-email.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function migrate() {
  console.log('[Migrate] Creating email_reports table...');
  
  const { error } = await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS email_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id),
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        html_content TEXT,
        sent_at TIMESTAMPTZ DEFAULT now(),
        status TEXT DEFAULT 'sent'
      );
      CREATE INDEX IF NOT EXISTS idx_email_reports_user ON email_reports (user_id);
      CREATE INDEX IF NOT EXISTS idx_email_reports_sent_at ON email_reports (sent_at);
    `
  });

  if (error) {
    console.log('[Migrate] RPC not available — table may need to be created manually in Supabase SQL Editor.');
    console.log('[Migrate] Copy the SQL from the bottom of supabase_schema.sql');
    console.log('[Migrate] Error:', error.message);
  } else {
    console.log('[Migrate] ✓ email_reports table created successfully');
  }
}

migrate();
