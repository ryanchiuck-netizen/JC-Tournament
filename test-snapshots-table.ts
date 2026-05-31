import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.log("Supabase credentials missing!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Checking tables in Supabase...");
  
  // Try querying 'player_snapshots'
  try {
    const { data: snapData, error: snapErr } = await supabase
      .from('player_snapshots')
      .select('*')
      .limit(1);
      
    if (snapErr) {
      console.log("player_snapshots table error:", snapErr.message);
    } else {
      console.log("player_snapshots table exists! Sample data row count:", snapData.length);
      console.log(JSON.stringify(snapData, null, 2));
    }
  } catch (e: any) {
    console.log("player_snapshots query failed exception:", e.message || e);
  }

  // Try querying any other possible snapshot table names
  const possibleNames = ['snapshots', 'saved_players_snapshots', 'saved_players_history', 'daily_snapshots', 'player_history'];
  for (const name of possibleNames) {
    try {
      const { data, error } = await supabase.from(name).select('*').limit(1);
      if (!error) {
        console.log(`Table "${name}" EXISTS! Rows:`, data.length);
      } else {
        console.log(`Table "${name}" does not exist or error:`, error.message);
      }
    } catch (e: any) {
      console.log(`Table "${name}" error:`, e.message || e);
    }
  }
}

run();
