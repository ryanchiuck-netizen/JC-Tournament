import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  const profileUrl = 'https://tournaments.tennis.com.au/player-profile/d8c9ab7b-18a8-4631-b8de-4edbf1d543a1';
  
  try {
    const titlesUrl = `${profileUrl}/PersonHome/TitlesFinals`;
    const titlesRes = await axios.get(titlesUrl, {
      headers: { 
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest"
      },
      timeout: 10000
    });
    const $titles = cheerio.load(titlesRes.data);
    
    console.log("Titles HTML snippet:", $titles('body').html()?.substring(0, 1000));
    
    // Let's see what elements exist
    $titles('.list__item').each((i, el) => {
      console.log("List item text:", $titles(el).text().replace(/\s+/g, ' ').trim());
    });
  } catch (e: any) {
    console.log("Error:", e.message);
  }
}

test();
