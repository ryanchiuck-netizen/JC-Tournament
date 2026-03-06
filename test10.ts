import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileRes = await axios.get('https://hkta.tournamentsoftware.com/player-profile/2996953C-3B90-40B4-9780-9240FFEA0E5B');
  const $profile = cheerio.load(profileRes.data);
  
  let wtnSingles = '-';
  $profile('.tag-duo__title').each((i, el) => {
    if ($profile(el).text().trim() === 'Singles') {
      const parentTitle = $profile(el).parent().attr('title');
      if (parentTitle && parentTitle.includes('World Tennis Number')) {
        wtnSingles = $profile(el).next('.tag-duo__value').text().trim();
      }
    }
  });
  console.log('Carson Leung WTN:', wtnSingles);
}
run();
