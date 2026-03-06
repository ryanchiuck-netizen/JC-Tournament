import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const res = await axios.get('https://hkta.tournamentsoftware.com/player-profile/2996953C-3B90-40B4-9780-9240FFEA0E5B');
  const $ = cheerio.load(res.data);
  const html = $.html();
  const idx = html.indexOf('33.3');
  console.log(html.substring(Math.max(0, idx - 500), idx + 500));
}
run();
