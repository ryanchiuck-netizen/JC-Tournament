import axios from "axios";
import * as cheerio from "cheerio";

async function run() {
  const params = new URLSearchParams();
  params.append("Page", "3");
  params.append("TournamentExtendedFilter.SportID", "0");
  params.append("TournamentFilter.DateFilterType", "0");
  params.append("TournamentFilter.StartDate", "2026-01-01");
  params.append("TournamentFilter.EndDate", "2036-12-31");
  const response = await axios.post("https://tournaments.tennis.com.au/find/tournament/DoSearch", params.toString(), {
    headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" }
  });
  const $ = cheerio.load(response.data);
  const items = $("li.list__item").toArray();
  console.log("Items on page 3:", items.length);
}
run();
