import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const searchRes = await axios.get('https://hkta.tournamentsoftware.com/find/player?q=HONG+Wing+Ho');
  const $search = cheerio.load(searchRes.data);
  const playerLink = $search('.media__title a').first().attr('href');
  console.log('Player link:', playerLink);
  if (playerLink) {
    const profileRes = await axios.get(`https://hkta.tournamentsoftware.com${playerLink}`);
    const $profile = cheerio.load(profileRes.data);
    const html = $profile.html();
    const idx = html.indexOf('32.5');
    if (idx !== -1) {
      console.log(html.substring(Math.max(0, idx - 500), idx + 500));
    } else {
      console.log('32.5 not found. Looking for WTN or Singles...');
      $profile('span').each((i, el) => {
        if ($profile(el).text().includes('Singles')) {
          console.log($profile(el).parent().html());
        }
      });
    }
  }
}
run();
