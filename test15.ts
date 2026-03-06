import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const searchRes = await axios.get('https://hkta.tournamentsoftware.com/find/player?q=PANG+TSZ+YUI+Iden');
  const $search = cheerio.load(searchRes.data);
  const playerLink = $search('.media__title a').first().attr('href');
  
  const profileRes = await axios.get(`https://hkta.tournamentsoftware.com${playerLink}/ranking`);
  const $profile = cheerio.load(profileRes.data);
  
  $profile('table').each((i, el) => {
    console.log('Table found');
    $profile(el).find('tr').each((j, tr) => {
      console.log($profile(tr).text().trim().replace(/\s+/g, ' '));
    });
  });
}
run();
