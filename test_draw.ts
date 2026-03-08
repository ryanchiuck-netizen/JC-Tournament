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
    const playerLinks: { name: string, url: string }[] = [];
    
    $('a[href*="/player.aspx?"]').each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href');
      if (name && href && !playerLinks.some(pl => pl.url === href)) {
        playerLinks.push({ name, url: 'https://tournaments.tennis.com.au' + href });
      }
    });
    
    console.log('Found players:', playerLinks.length);
    
    if (playerLinks.length > 0) {
      const firstPlayer = playerLinks[0];
      console.log('Fetching player page:', firstPlayer.url);
      const playerRes = await axios.get(firstPlayer.url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 10000
      });
      const $player = cheerio.load(playerRes.data);
      const profileLink = $player('a[href*="/player-profile/"]').first().attr('href');
      console.log('Profile link:', profileLink);
    }
  } catch (err) {
    console.error(err);
  }
}
run();
