import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const res = await axios.get('https://hkta.tournamentsoftware.com/player-profile/4A01C6A9-E6F7-4952-B437-020F5073105B');
  const $ = cheerio.load(res.data);
  const html = $.html();
  const idx = html.indexOf('32.5');
  console.log(html.substring(Math.max(0, idx - 500), idx + 500));
}
run();
