import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const searchRes = await axios.get('https://hkta.tournamentsoftware.com/find/player?q=HONG+Wing+Ho');
  const $search = cheerio.load(searchRes.data);
  $search('.media__title a').each((i, el) => {
    console.log($search(el).text().trim(), $search(el).attr('href'));
  });
}
run();
