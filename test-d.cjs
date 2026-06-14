const axios = require('axios');
const cheerio = require('cheerio');
(async () => {
  const url = "https://tournaments.tennis.com.au/sport/player.aspx?id=5b2f0df6-9a96-414c-b1c9-1615410e4582&player=14";
  const res = await axios.get(url, { headers: { "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0" } });
  const $detail = cheerio.load(res.data);
  const draws = [];
  $detail(".media__subheading").each((i, el) => {
    const firstLink = $detail(el).find("a").first();
    if (firstLink.length > 0) {
      const drawName = firstLink.text().trim();
      const drawLink = firstLink.attr("href");
      draws.push({
        drawName: drawName,
        drawLink: drawLink ? `https://tournaments.tennis.com.au${drawLink}` : undefined
      });
    }
  });
  console.log(JSON.stringify(draws, null, 2));
})();
