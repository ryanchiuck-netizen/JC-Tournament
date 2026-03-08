import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const playerUrl = 'https://tournaments.tennis.com.au/player/58f1a750-977b-4b37-b610-0a886bd2eb8f/YmFzZTY0OjY2MzMzOTY5OTAy';
  console.log('Fetching player profile redirect:', playerUrl);
  
  try {
    const res = await axios.get(playerUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000,
      maxRedirects: 5
    });
    
    console.log('Final URL:', res.request.res.responseUrl);
  } catch (err) {
    console.error(err);
  }
}
run();
