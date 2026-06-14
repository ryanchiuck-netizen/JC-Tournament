const axios = require('axios');
const cheerio = require('cheerio');
(async () => {
function cleanPlayerName(name) {
  return name.replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").trim();
}
function getQueryParts(playerName) {
  if (!playerName) return [];
  const clean = playerName
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .toLowerCase()
    .trim();
  return clean.split(/[\s,.-]+/).filter(Boolean);
}
function isPlayerNameMatch(tPlayerName, queryParts) {
  if (!tPlayerName || queryParts.length === 0) return false;
  const cleanCandidate = tPlayerName
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .toLowerCase()
    .trim();
  const candidateWords = cleanCandidate.split(/[\s,.-]+/).filter(Boolean);
  return queryParts.every(part => 
    candidateWords.some(word => word === part)
  );
}

const likelyPlayers = [
  { name: "Gavrilo Novkovic" },
  { name: "Jordan Chiu" },
  { name: "Edwin Huxue" }
];

  const url = "https://tournaments.tennis.com.au/tournament/5B2F0DF6-9A96-414C-B1C9-1615410E4582/Players/GetPlayersContent";
  const res = await axios.get(url, { headers: { "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0" } });
  const dataLower = res.data.toLowerCase().replace(/[,.]/g, '');
  const $ = cheerio.load(res.data);
  const domain = "tournaments.tennis.com.au";
  const joinedPlayers = [];

  for (const player of likelyPlayers) {
    const queryParts = getQueryParts(player.name);

    const quickMatch = queryParts.every(part => dataLower.includes(part));

    if (quickMatch) {
      let playerDetailLink = "";

      $("li.js-alphabet-list-item").each((i, el) => {
        const name = cleanPlayerName($(el).find(".media__title").text().trim());
        if (isPlayerNameMatch(name, queryParts)) {
          playerDetailLink = $(el).find(".media__title a").attr("href") || "";
          return false; // break
        }
      });
      console.log(player.name, playerDetailLink);
      
      if (playerDetailLink) {
        const fullPlayerUrl = `https://${domain}${playerDetailLink}`;
        const detailResponse = await axios.get(fullPlayerUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          timeout: 10000
        });
        const $detail = cheerio.load(detailResponse.data);
        
        const draws = [];
        $detail(".media__subheading").each((i, el) => {
          const firstLink = $detail(el).find("a").first();
          if (firstLink.length > 0) {
            const drawName = firstLink.text().trim();
            const drawLink = firstLink.attr("href");
            draws.push({
              drawName: drawName,
              drawLink: drawLink ? `https://${domain}${drawLink}` : undefined
            });
          }
        });

        if (draws.length > 0) {
          joinedPlayers.push({
            player,
            draws
          });
          console.log(`Success pushed ${player.name}`);
        } else {
          console.log(`No draws for ${player.name}`);
        }
      }
    } else {
      console.log("No quickMatch", player.name);
    }
  }
})();
