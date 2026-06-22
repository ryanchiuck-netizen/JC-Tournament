const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.log("No Supabase configuration in environment.");
  process.exit(0);
}
const supabase = createClient(supabaseUrl, supabaseKey);
(async () => {
  const { data, error } = await supabase.from("tournaments").select("data").eq("id", "players_cache");
  if (error) {
    console.error("Error:", error.message);
  } else {
    if (data.length > 0) {
      const dbData = data[0].data;
      const t = dbData.tournaments.find(x => x.tournament.name.includes("Mornington Peninsula Premier Junior Tour"));
      if (t) {
        console.log("Found in database cache. Single tournament structure:");
        console.log(JSON.stringify(t, null, 2));
      } else {
        console.log("Not found in db cache!");
      }
    }
  }
})();
