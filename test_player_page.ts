import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const playerUrl = 'https://tournaments.tennis.com.au/sport/player.aspx?id=151A2024-1B80-4277-ABAB-5C24159123A5&player=30';
  console.log('Fetching player page:', playerUrl);
  
  try {
    const res = await axios.get(playerUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });
    
    const $ = cheerio.load(res.data);
    console.log('HTML length:', res.data.length);
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('player-profile')) {
        console.log('Profile Link:', href, 'Text:', $(el).text().trim());
      }
    });
  } catch (err) {
    console.error(err);
  }
}
run();
