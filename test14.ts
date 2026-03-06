import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const profileRes = await axios.get('https://hkta.tournamentsoftware.com/player-profile/2996953c-3b90-40b4-9780-9240ffea0e5b/ranking');
  const $profile = cheerio.load(profileRes.data);
  
  console.log('Ranking page HTML snippet:');
  console.log($profile('body').html()?.substring(0, 2000));
  
  $profile('.list__item').each((i, el) => {
    console.log($profile(el).text().trim().replace(/\s+/g, ' '));
  });
  
  $profile('table').each((i, el) => {
    console.log('Table found');
    $profile(el).find('tr').each((j, tr) => {
      console.log($profile(tr).text().trim().replace(/\s+/g, ' '));
    });
  });
}
run();
