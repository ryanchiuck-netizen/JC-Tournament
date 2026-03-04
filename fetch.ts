import axios from "axios";
import * as cheerio from "cheerio";

async function testParse() {
  try {
    const url = "https://hkta.tournamentsoftware.com/find/tournament/DoSearch";
    const params = new URLSearchParams();
    params.append("Page", "1");
    params.append("TournamentExtendedFilter.SportID", "0");
    params.append("TournamentFilter.DateFilterType", "0");
    
    const response = await axios.post(url, params.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    const $ = cheerio.load(response.data);
    const results: any[] = [];

    $("li.list__item").each((i, el) => {
      const nameEl = $(el).find("h4 a");
      const name = nameEl.text().trim();
      const link = nameEl.attr("href") || "";
      const dates = $(el).find("time").map((_, t) => $(t).text().trim()).get().join(" to ") || $(el).find(".media__subheading").text().trim();
      
      let ageGroup = "All Ages";
      const nameLower = name.toLowerCase();
      if (nameLower.includes("10 & under") || nameLower.includes("u10") || nameLower.includes("10u")) {
        ageGroup = "U10";
      }
      if (nameLower.includes("12 & under") || nameLower.includes("u12") || nameLower.includes("12u")) {
        if (ageGroup === "U10") ageGroup = "U10 & U12";
        else ageGroup = "U12";
      }

      if (name) {
        results.push({ name, dates, link, ageGroup, source: "HK" });
      }
    });

    console.log("HK Results:", results.slice(0, 3));

    // Test AUS
    const ausUrl = "https://tournaments.tennis.com.au/find/tournament/DoSearch";
    const ausParams = new URLSearchParams();
    ausParams.append("Page", "1");
    ausParams.append("TournamentExtendedFilter.SportID", "0");
    ausParams.append("TournamentFilter.DateFilterType", "0");
    ausParams.append("TournamentExtendedFilter.OrganizationStateList[0]", "NSW");

    const ausResponse = await axios.post(ausUrl, ausParams.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    const $aus = cheerio.load(ausResponse.data);
    const ausResults: any[] = [];

    $aus("li.list__item").each((i, el) => {
      const nameEl = $aus(el).find("h4 a");
      const name = nameEl.text().trim();
      const link = nameEl.attr("href") || "";
      const dates = $aus(el).find("time").map((_, t) => $aus(t).text().trim()).get().join(" to ") || $aus(el).find(".media__subheading").text().trim();
      
      let ageGroup = "All Ages";
      const nameLower = name.toLowerCase();
      if (nameLower.includes("10 & under") || nameLower.includes("u10") || nameLower.includes("10u")) {
        ageGroup = "U10";
      }
      if (nameLower.includes("12 & under") || nameLower.includes("u12") || nameLower.includes("12u")) {
        if (ageGroup === "U10") ageGroup = "U10 & U12";
        else ageGroup = "U12";
      }

      if (name) {
        ausResults.push({ name, dates, link, ageGroup, source: "AUS" });
      }
    });

    console.log("AUS Results:", ausResults.slice(0, 3));

  } catch (e) {
    console.error(e);
  }
}

testParse();
