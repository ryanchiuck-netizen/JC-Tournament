import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileUrl = 'https://hkta.tournamentsoftware.com/player-profile/2996953c-3b90-40b4-9780-9240ffea0e5b';
  let rank = '-';
  let points = '-';
  
  if (profileUrl.includes('hkta.tournamentsoftware.com')) {
    try {
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
          if (cols.length >= 3) {
            const r = $rank(cols[1]).text().trim();
            const p = $rank(cols[2]).text().trim();
            if (r && p) {
              rank = r;
              points = p;
              return false; // break
            }
          }
        }
      });
    } catch (err) {
      console.error(`Failed to fetch ranking:`, err);
    }
  }
  console.log('Rank:', rank, 'Points:', points);
}
run();
