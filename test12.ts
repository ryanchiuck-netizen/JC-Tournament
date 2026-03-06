import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileRes = await axios.get('https://hkta.tournamentsoftware.com/player-profile/2996953C-3B90-40B4-9780-9240FFEA0E5B');
  const $profile = cheerio.load(profileRes.data);
  
  console.log('Ranking section:');
  $profile('.list__item').each((i, el) => {
    console.log($profile(el).find('.list__label').text().trim(), ':', $profile(el).find('.list__value').text().trim());
  });
  
  console.log('All tags:');
  $profile('.tag-duo__title').each((i, el) => {
    console.log($profile(el).text().trim(), ':', $profile(el).next('.tag-duo__value').text().trim());
  });
  
  console.log('Ranking tab:');
  const rankTab = $profile('#tabRanking').html();
  if (rankTab) {
    console.log(rankTab.substring(0, 1000));
  } else {
    console.log('No #tabRanking found.');
  }
}
run();
