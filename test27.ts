import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileUrl = 'https://tournaments.tennis.com.au/player/E7A1370F-E3B2-4309-906D-130B1C438D35';
  const rankUrl = `${profileUrl}/ranking`;
  console.log('Fetching:', rankUrl);
  
  try {
    const rankRes = await axios.get(rankUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });
    
    const $rank = cheerio.load(rankRes.data);
    let rank = '-';
    let points = '-';
    
    $rank('table.table--compact tbody tr').each((i, el) => {
      const text = $rank(el).text().trim().replace(/\s+/g, ' ');
      console.log('Row text:', text);
      const cols = $rank(el).find('td');
      if (cols.length >= 2) {
        const r = $rank(cols[0]).text().trim();
        const p = $rank(cols[1]).text().trim();
        console.log('Rank:', r, 'Points:', p);
      }
    });
  } catch (err) {
    console.error(err);
  }
}
run();
