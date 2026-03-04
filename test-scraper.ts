import axios from 'axios';
import * as cheerio from 'cheerio';

import fs from 'fs/promises';

async function test() {
  const id = 'FD5EA231-3AE9-4E06-842C-7210BECE9297';
  const url = `https://tournaments.tennis.com.au/sport/draws.aspx?id=${id}`;
  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    console.log($('title').text());
    
    // Find all draws
    const draws = [];
    $('.drawname').each((i, el) => {
      draws.push({
        name: $(el).text().trim(),
        link: $(el).attr('href')
      });
    });
    await fs.writeFile('test-draws.html', res.data);
    console.log("Wrote to test-draws.html");
  } catch (e) {
    console.error(e.message);
  }
}

test();
