import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileRes = await axios.get('https://hkta.tournamentsoftware.com/player-profile/2996953C-3B90-40B4-9780-9240FFEA0E5B');
  const $profile = cheerio.load(profileRes.data);
  
  $profile('a').each((i, el) => {
    const text = $profile(el).text().trim();
    if (text.includes('Rank') || text.includes('rank')) {
      console.log(text, $profile(el).attr('href'));
    }
  });
}
run();
