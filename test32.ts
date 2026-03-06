import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileUrl = 'https://tournaments.tennis.com.au/player-profile/30BB29AE-08E1-4684-8333-74E1FE9D8D81';
  const rankUrl = `${profileUrl}/ranking`;
  console.log('Fetching:', rankUrl);
  
  try {
    const rankRes = await axios.get(rankUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });
    
    const $rank = cheerio.load(rankRes.data);
    console.log($rank('table').html());
  } catch (err) {
    console.error(err);
  }
}
run();
