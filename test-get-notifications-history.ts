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
  console.log("Querying notifications_history table in Supabase...");
  try {
    const { data, error } = await supabase.from("notifications_history").select("*").limit(10);
    if (error) {
      console.error("Error querying notifications_history table:", error);
    } else {
      console.log("Result rows count in notifications_history:", data?.length);
      console.log("Sample records:");
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (e: any) {
    console.error("Exception:", e);
  }
}

run();
