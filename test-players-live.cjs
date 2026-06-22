const axios = require('axios');
const cheerio = require('cheerio');
(async () => {
  const url = "https://tournaments.tennis.com.au/tournament/0D46F879-185A-400C-A03A-45CCA7292BF5/Players/GetPlayersContent";
  try {
    const res = await axios.get(url, { headers: { "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0" } });
    console.log("Includes Lyu:", res.data.includes("Lyu"));
    console.log("Includes Shawn:", res.data.includes("Shawn"));
    const $ = cheerio.load(res.data);
    const players = [];
    $("li.js-alphabet-list-item").each((i, el) => {
      players.push($(el).find(".media__title").text().trim());
    });
    console.log("Live Players found count:", players.length);
    console.log("All players:", players);
  } catch (err) {
    console.error("Error fetching players:", err.message);
  }
})();
