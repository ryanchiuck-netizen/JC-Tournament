import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileRes = await axios.get('https://hkta.tournamentsoftware.com/player-profile/69E6718B-0DE2-4CEC-939F-3BBAAA892DD3');
  const $profile = cheerio.load(profileRes.data);
  console.log($profile('.tag-duo__title').parent().html());
}
run();
