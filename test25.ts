import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const domain = "hkta.tournamentsoftware.com";
  const tLink = '/sport/tournament?id=102E1825-2D36-459C-A327-1F976F2E6DAC';
  
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
    
    console.log('Subheadings:');
    $detail('.media__subheading').each((i, el) => {
      console.log($detail(el).html());
    });
  }
}
run();
