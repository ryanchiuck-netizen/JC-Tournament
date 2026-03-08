import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const drawUrl = 'https://tournaments.tennis.com.au/sport/event.aspx?id=151A2024-1B80-4277-ABAB-5C24159123A5&event=8';
  console.log('Fetching draw:', drawUrl);
  
  try {
    const res = await axios.get(drawUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });
    
    const $ = cheerio.load(res.data);
    console.log('HTML length:', res.data.length);
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && (href.includes('player') || href.includes('draw'))) {
        console.log('Link:', href, 'Text:', $(el).text().trim());
      }
    });
  } catch (err) {
    console.error(err);
  }
}
run();
