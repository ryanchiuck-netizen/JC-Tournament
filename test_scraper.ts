import axios from "axios";
import * as cheerio from "cheerio";

async function test() {
  const params = new URLSearchParams();
  params.append("Page", "1");
  params.append("TournamentExtendedFilter.SportID", "0");
  params.append("TournamentFilter.DateFilterType", "0");
  params.append("TournamentFilter.StartDate", "2026-01-01");
  params.append("TournamentFilter.EndDate", "2026-12-31");
  params.append("TournamentExtendedFilter.OrganizationStateList[0]", "NSW");
  params.append("TournamentFilter.PostalCode", "2032");
  params.append("TournamentExtendedFilter.Distance", "1000"); // maybe?

  const response = await axios.post("https://tournaments.tennis.com.au/find/tournament/DoSearch", params.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest"
    }
  });

  console.log(response.data.substring(0, 1000));
  
  const $ = cheerio.load(response.data);
  $("li.list__item").each((i, el) => {
    console.log($(el).text().replace(/\s+/g, ' '));
  });
}

test();
