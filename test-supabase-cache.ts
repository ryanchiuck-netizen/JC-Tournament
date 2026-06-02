import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

async function run() {
  if (!supabaseUrl || !supabaseKey) {
    console.log("Supabase not set up in env.");
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log("Querying Supabase...");
  const { data, error } = await supabase.from("tournaments").select("id, data").eq("id", "players_cache").single();
  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log("Found players_cache in Supabase");
    const tournamentsCount = data?.data?.tournaments?.length || 0;
    console.log(`Updated at: ${data?.data?.updatedAt}`);
    console.log(`Tournaments in cache: ${tournamentsCount}`);
    if (tournamentsCount > 0) {
      console.log("Tournaments samples in cache:", data.data.tournaments.slice(0, 2));
    }
  }
}

run().catch(console.error);
