import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileRes = await axios.get('https://hkta.tournamentsoftware.com/player-profile/69E6718B-0DE2-4CEC-939F-3BBAAA892DD3');
  const $profile = cheerio.load(profileRes.data);
  console.log('HONG Wing Ho profile:');
  $profile('.tag-duo__title').each((i, el) => {
    console.log($profile(el).text().trim(), ':', $profile(el).next('.tag-duo__value').text().trim());
  });
}
run();
