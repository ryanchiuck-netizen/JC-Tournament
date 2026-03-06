import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const url = 'https://hkta.tournamentsoftware.com/tournament/9B3A7B6B-B6B1-4B9E-8B1A-5B6B7B8B9B0B/player/123';
  // Wait, I don't have a valid URL.
  // Let's search for a tournament first.
  const res = await axios.get('https://hkta.tournamentsoftware.com/tournaments');
  const $ = cheerio.load(res.data);
  const tLink = $('.media__title a').first().attr('href');
  console.log('Tournament link:', tLink);
  
  if (!tLink) return;
  
  const playersUrl = `https://hkta.tournamentsoftware.com/tournament/${tLink.split("id=")[1]}/Players/GetPlayersContent`;
  const response = await axios.get(playersUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest"
    }
  });
  
  const $2 = cheerio.load(response.data);
  const playerDetailLink = $2("li.js-alphabet-list-item .media__title a").first().attr("href");
  
  if (playerDetailLink) {
    const fullPlayerUrl = `https://hkta.tournamentsoftware.com${playerDetailLink}`;
    console.log('Fetching:', fullPlayerUrl);
    const detailResponse = await axios.get(fullPlayerUrl);
    const $detail = cheerio.load(detailResponse.data);
    
    $detail('.media__subheading').each((i, el) => {
      console.log('Subheading HTML:', $detail(el).html());
    });
  }
}
run();
