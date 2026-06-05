import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

async function run() {
  console.log("Checking saved-draws.json counts...");
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "public", "saved-draws.json"), "utf-8");
    const content = JSON.parse(raw);
    const draws = content.draws || [];
    const springwood = draws.find((d: any) => d.name.includes("Springwood Junior - Under 10 Mixed"));
    if (springwood) {
      console.log("Found in local saved-draws.json!");
      console.log("Local draw Name:", springwood.name);
      console.log("Local draw player count:", springwood.players?.length);
    } else {
      console.log("Springwood not found in local saved-draws.json");
    }
  } catch (err: any) {
    console.error("Local read failed:", err.message);
  }

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log("\nChecking Supabase saved_draws table...");
    try {
      const { data, error } = await supabase.from("saved_draws").select("*");
      if (error) {
        console.error("Supabase query error:", error.message);
      } else {
        const springwoodDB = data?.find((d: any) => d.name?.includes("Springwood Junior - Under 10 Mixed"));
        if (springwoodDB) {
          console.log("Found in Supabase!");
          console.log("DB draw Name:", springwoodDB.name);
          console.log("DB draw players list is array?", Array.isArray(springwoodDB.players));
          console.log("DB draw player count:", springwoodDB.players?.length);
        } else {
          console.log("Springwood not found in Supabase saved_draws table");
        }
      }
    } catch (e: any) {
      console.error("Supabase exception:", e);
    }
  }
}

run();
