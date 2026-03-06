import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileUrl = 'https://hkta.tournamentsoftware.com/player-profile/2996953c-3b90-40b4-9780-9240ffea0e5b';
  
  const rankUrl = `${profileUrl}/ranking`;
  const rankRes = await axios.get(rankUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 10000
  });
  const $rank = cheerio.load(rankRes.data);
  $rank('table tr').each((i, el) => {
    const text = $rank(el).text().trim().replace(/\s+/g, ' ');
    console.log('Row text:', text);
    const cols = $rank(el).find('td');
    console.log('Cols length:', cols.length);
    if (cols.length >= 3) {
      console.log('Col 0:', $rank(cols[0]).text().trim());
      console.log('Col 1:', $rank(cols[1]).text().trim());
      console.log('Col 2:', $rank(cols[2]).text().trim());
    }
  });
}
run();
