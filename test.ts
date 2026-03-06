import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const res = await axios.get('https://hkta.tournamentsoftware.com/player-profile/2996953C-3B90-40B4-9780-9240FFEA0E5B');
  const $ = cheerio.load(res.data);
  console.log('Carson Leung:');
  $('.list__item').each((i, el) => {
    console.log($(el).find('.list__label').text().trim(), ':', $(el).find('.list__value').text().trim());
  });

  // Let's also search for HONG Wing Ho
  const searchRes = await axios.get('https://hkta.tournamentsoftware.com/find/player?q=HONG+Wing+Ho');
  const $search = cheerio.load(searchRes.data);
  const playerLink = $search('.media__title a').first().attr('href');
  if (playerLink) {
    const profileRes = await axios.get(`https://hkta.tournamentsoftware.com${playerLink}`);
    const $profile = cheerio.load(profileRes.data);
    console.log('\nHONG Wing Ho:');
    $profile('.list__item').each((i, el) => {
      console.log($profile(el).find('.list__label').text().trim(), ':', $profile(el).find('.list__value').text().trim());
    });
  }
}
run();
