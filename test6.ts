import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileRes = await axios.get('https://hkta.tournamentsoftware.com/player-profile/756F53F2-CA4D-43AB-9B93-BE5AF0A1A266');
  const $profile = cheerio.load(profileRes.data);
  console.log('HONG Wing Ho profile:');
  $profile('.tag-duo__title').each((i, el) => {
    console.log($profile(el).text().trim(), ':', $profile(el).next('.tag-duo__value').text().trim());
  });
  $profile('.list__item').each((i, el) => {
    console.log($profile(el).find('.list__label').text().trim(), ':', $profile(el).find('.list__value').text().trim());
  });
}
run();
