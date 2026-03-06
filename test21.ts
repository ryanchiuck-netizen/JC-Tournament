import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const domain = "hkta.tournamentsoftware.com";
  const searchUrl = `https://hkta.tournamentsoftware.com/tournaments`;
  const res = await axios.get(searchUrl);
  const $ = cheerio.load(res.data);
  let tLink = '';
  $('.media__title a').each((i, el) => {
    if ($(el).text().includes('Bank of China')) {
      tLink = $(el).attr('href') || '';
      return false;
    }
  });
  console.log('Tournament link:', tLink);
  
  if (!tLink) return;
  
  const playersUrl = `https://${domain}/tournament/${tLink.split("id=")[1]}/Players/GetPlayersContent`;
  const response = await axios.get(playersUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest"
    }
  });
  
  const $2 = cheerio.load(response.data);
  let playerDetailLink = "";
  $2("li.js-alphabet-list-item").each((i, el) => {
    const name = $2(el).find(".media__title").text().trim().toLowerCase();
    if (name.includes("hong wing ho")) {
      playerDetailLink = $2(el).find(".media__title a").attr("href") || '';
      console.log('Found player:', name, playerDetailLink);
      return false;
    }
  });
  
  if (playerDetailLink) {
    const fullPlayerUrl = `https://${domain}${playerDetailLink}`;
    console.log('Fetching:', fullPlayerUrl);
    const detailResponse = await axios.get(fullPlayerUrl);
    const $detail = cheerio.load(detailResponse.data);
    
    console.log('Draws HTML:');
    $detail('.media__subheading').each((i, el) => {
      console.log($detail(el).html());
    });
    
    $detail(".media__subheading a").each((i, el) => {
      console.log('Draw:', $detail(el).text().trim(), $detail(el).attr('href'));
    });
  }
}
run();
