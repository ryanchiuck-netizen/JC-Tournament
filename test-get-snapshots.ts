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
  console.log("Querying tournaments table for ID player_snapshots...");
  try {
    const { data, error } = await supabase.from("tournaments").select("*").eq("id", "player_snapshots");
    if (error) {
      console.error("Error querying tournaments table:", error);
    } else {
      console.log("Result rows count:", data?.length);
      if (data && data.length > 0) {
        const row = data[0];
        console.log("Row ID:", row.id);
        console.log("Created At:", row.created_at);
        const dataArr = row.data;
        console.log("Is array?", Array.isArray(dataArr));
        if (Array.isArray(dataArr)) {
          console.log("Array length:", dataArr.length);
          console.log("Snapshot dates:", dataArr.map((s: any) => s.date));
          if (dataArr.length > 0) {
            console.log("Sample snapshot first item structure keys:", Object.keys(dataArr[0]));
            console.log("Sample snapshot date:", dataArr[0].date);
            console.log("Sample TA players count:", dataArr[0].taPlayers?.length);
            console.log("Sample HKTA players count:", dataArr[0].hktaPlayers?.length);
          }
        } else {
          console.log("Raw row data preview:", JSON.stringify(dataArr).substring(0, 500));
        }
      } else {
        console.log("Row not found in db.");
      }
    }
  } catch (e: any) {
    console.error("Exception:", e);
  }
}

run();
