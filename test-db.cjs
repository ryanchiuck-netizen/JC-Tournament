const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.log("No Supabase configuration in environment.");
  process.exit(0);
}
const supabase = createClient(supabaseUrl, supabaseKey);
(async () => {
  const { data, error } = await supabase.from("saved_players").select("*");
  if (error) {
    console.error("Error retrieving saved players:", error.message);
  } else {
    console.log("Retrieved", data.length, "saved players.");
    const match = data.find(p => p.name.toLowerCase().includes("shawn") || p.name.toLowerCase().includes("lyu"));
    if (match) {
      console.log("Found match in database:", match);
    } else {
      console.log("No match for 'shawn' or 'lyu' in database.");
    }
  }
})();
