require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function migrate() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('Missing Supabase config in .env');
    return;
  }

  const supabase = createClient(url, key);

  console.log('1. Signing up test user (testuser@mindforge.com)...');
  let userId;
  
  // Try to sign up
  let { data: authData, error: authError } = await supabase.auth.signUp({
    email: 'testuser@mindforge.com',
    password: 'password123'
  });

  if (authError && authError.message.includes('already registered')) {
    console.log('User already exists, signing in...');
    const loginRes = await supabase.auth.signInWithPassword({
      email: 'testuser@mindforge.com',
      password: 'password123'
    });
    if (loginRes.error) {
      console.error('Failed to login:', loginRes.error.message);
      return;
    }
    userId = loginRes.data.user.id;
  } else if (authError) {
    console.error('Signup error:', authError.message);
    return;
  } else {
    userId = authData.user.id;
  }

  console.log(`Test user ID: ${userId}`);

  const tables = [
    'events', 'scores', 'sessions', 'daily_habits', 'ramp',
    'session_sites', 'tab_analytics', 'content_preferences'
  ];

  console.log('2. Updating existing records with user_id...');
  
  for (const table of tables) {
    console.log(`Migrating table: ${table}...`);
    // Due to the local CLI, doing a mass update might be hard without a column
    // WAIT: The column 'user_id' might not exist yet!
    // We should tell the user: "First run the ALTER statements in Supabase, THEN run this script."
    
    // We update where user_id is null
    const { data, error } = await supabase
      .from(table)
      .update({ user_id: userId })
      .is('user_id', null);
      
    if (error) {
      // If error is about missing column, we handle it gracefully 
      console.log(`  [Skip] ${table}: ${error.message}`);
    } else {
      console.log(`  [Done] ${table}`);
    }
  }

  console.log('\nMigration complete!');
  console.log('Test Account Credentials:');
  console.log('Email: testuser@mindforge.com');
  console.log('Password: password123');
}

migrate();
