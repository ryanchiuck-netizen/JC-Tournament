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
    
    console.log('All modules:');
    $rank('.module').each((i, el) => {
      console.log('Module', i, $rank(el).text().trim().replace(/\s+/g, ' '));
    });
    
    console.log('All tabs:');
    $rank('.nav-tabs li').each((i, el) => {
      console.log('Tab', i, $rank(el).text().trim().replace(/\s+/g, ' '));
    });
  } catch (err) {
    console.error(err);
  }
}
run();
