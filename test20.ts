import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const domain = "hkta.tournamentsoftware.com";
  // We need a tournament ID and player ID for Bank of China Hong Kong National Tennis Championships 2026
  // Let's search for the tournament first
  const searchRes = await axios.get(`https://hkta.tournamentsoftware.com/find/tournament?q=Bank+of+China`);
  const $search = cheerio.load(searchRes.data);
  const tLink = $search('.media__title a').first().attr('href');
  console.log('Tournament link:', tLink);
  
  if (!tLink) return;
  
  const playersUrl = `https://${domain}/tournament/${tLink.split("id=")[1]}/Players/GetPlayersContent`;
  const response = await axios.get(playersUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest"
    }
  });
  
  const $ = cheerio.load(response.data);
  let playerDetailLink = "";
  $("li.js-alphabet-list-item").each((i, el) => {
    const name = $(el).find(".media__title").text().trim().toLowerCase();
    if (name.includes("hong wing ho")) {
      playerDetailLink = $(el).find(".media__title a").attr("href") || "";
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
    console.log($detail('.media__subheading').parent().html());
    
    $detail(".media__subheading a").each((i, el) => {
      console.log('Draw:', $detail(el).text().trim(), $detail(el).attr('href'));
    });
  }
}
run();
