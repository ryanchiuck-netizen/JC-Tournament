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
  console.log("Listing all public tables in Supabase...");
  try {
    const { data, error } = await supabase.rpc('get_tables');
    if (error) {
      console.log("RPC get_tables failed, trying direct select from information_schema via custom sql or general query...");
      // In Supabase client, we don't have direct SQL execution, but we can query standard tables.
      // But we can check if there are any other tables by trying some names, or let's inspect supabase_setup.sql.
      // Wait! Let's check some common tables. We can query 'tournaments' table to see what other rows there are in tournaments!
    } else {
      console.log("Tables list via RPC:", data);
    }
    
    console.log("Querying all IDs in public.tournaments...");
    const { data: tourData, error: tourErr } = await supabase.from("tournaments").select("id, created_at");
    if (tourErr) {
      console.error("Error querying tournaments table:", tourErr);
    } else {
      console.log("Tournaments table matching IDs:", tourData);
    }
  } catch (e: any) {
    console.log("Error:", e.message || e);
  }
}

run();
