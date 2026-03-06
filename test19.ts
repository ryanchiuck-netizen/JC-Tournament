import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileUrl = 'https://hkta.tournamentsoftware.com/player-profile/2996953c-3b90-40b4-9780-9240ffea0e5b';
  let rank = '-';
  let points = '-';
  
  const rankUrl = `${profileUrl}/ranking`;
  const rankRes = await axios.get(rankUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 10000
  });
  const $rank = cheerio.load(rankRes.data);
  $rank('table tr').each((i, el) => {
    const text = $rank(el).text().trim().replace(/\s+/g, ' ');
    if (text.includes('Singles')) {
      const cols = $rank(el).find('td');
      if (cols.length >= 2) {
        rank = $rank(cols[0]).text().trim();
        points = $rank(cols[1]).text().trim();
        return false; // break
      }
    }
  });
  console.log('Rank:', rank, 'Points:', points);
}
run();
