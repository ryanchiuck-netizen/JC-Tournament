import axios from "axios";
import * as cheerio from "cheerio";

async function test() {
  const url = "https://tournaments.tennis.com.au/tournament/f234d886-603e-4def-9023-c79527c40461/Factsheet";
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);
  
  $("a").each((i, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href");
    if (text.toLowerCase().includes("maps") || (href && href.includes("maps"))) {
      console.log("Maps link:", text, href);
    }
  });
}

test();
