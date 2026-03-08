import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const playerUrl = 'https://tournaments.tennis.com.au/tournament/151A2024-1B80-4277-ABAB-5C24159123A5/player/30';
  console.log('Fetching player page:', playerUrl);
  
  try {
    const res = await axios.get(playerUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });
    
    const $ = cheerio.load(res.data);
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (text.includes('Liam') || text.includes('Bain')) {
        console.log('Link:', href, 'Text:', text);
      }
    });
  } catch (err) {
    console.error(err);
  }
}
run();
