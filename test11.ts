import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const searchRes = await axios.get('https://hkta.tournamentsoftware.com/find/player?q=PANG+TSZ+YUI+Iden');
  const $search = cheerio.load(searchRes.data);
  const playerLink = $search('.media__title a').first().attr('href');
  if (playerLink) {
    const profileRes = await axios.get(`https://hkta.tournamentsoftware.com${playerLink}`);
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
    console.log('PANG TSZ YUI Iden WTN:', wtnSingles);
  } else {
    console.log('Player not found');
  }
}
run();
