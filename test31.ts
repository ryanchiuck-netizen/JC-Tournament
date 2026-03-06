import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const searchUrl = 'https://tournaments.tennis.com.au/find/player?q=Gavrilo+Novkovic';
  console.log('Fetching:', searchUrl);
  
  try {
    const searchRes = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });
    
    const $search = cheerio.load(searchRes.data);
    let profileUrl = '';
    $search('.media__title a').each((i, el) => {
      const text = $search(el).text().trim();
      if (text.includes('Gavrilo')) {
        profileUrl = 'https://tournaments.tennis.com.au' + $search(el).attr('href');
        return false;
      }
    });
    
    console.log('Profile URL:', profileUrl);
    
    if (profileUrl) {
      const rankUrl = `${profileUrl}/ranking`;
      console.log('Fetching:', rankUrl);
      const rankRes = await axios.get(rankUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 10000
      });
      
      const $rank = cheerio.load(rankRes.data);
      $rank('table').each((i, el) => {
        console.log('Table', i);
        $rank(el).find('tr').each((j, tr) => {
          console.log('  Row', j, $rank(tr).text().trim().replace(/\s+/g, ' '));
        });
      });
    }
  } catch (err) {
    console.error(err);
  }
}
run();
