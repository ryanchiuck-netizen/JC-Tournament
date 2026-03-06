import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const domain = "hkta.tournamentsoftware.com";
  // Let's search for "HONG Wing Ho" in Bank of China Hong Kong National Tennis Championships 2026
  // Actually, I can just search for the player's profile and look at their recent tournaments.
  const searchRes = await axios.get(`https://hkta.tournamentsoftware.com/find/player?q=HONG+Wing+Ho`);
  const $search = cheerio.load(searchRes.data);
  const playerLink = $search('.media__title a').first().attr('href');
  
  if (!playerLink) return;
  
  const profileRes = await axios.get(`https://hkta.tournamentsoftware.com${playerLink}`);
  const $profile = cheerio.load(profileRes.data);
  
  // Find the Bank of China tournament link
  let tLink = '';
  $profile('.media__title a').each((i, el) => {
    if ($profile(el).text().includes('Bank of China')) {
      tLink = $profile(el).attr('href') || '';
      return false;
    }
  });
  
  console.log('Tournament link:', tLink);
  
  if (!tLink) return;
  
  // The tLink is like /sport/tournament.aspx?id=...
  // The player detail link in the tournament is like /sport/player.aspx?id=...&player=...
  // Let's just fetch the player detail page directly from the tournament link.
  // Wait, the tLink from the profile page IS the player detail page in that tournament!
  // Let's fetch it.
  const fullPlayerUrl = `https://${domain}${tLink}`;
  console.log('Fetching:', fullPlayerUrl);
  const detailResponse = await axios.get(fullPlayerUrl);
  const $detail = cheerio.load(detailResponse.data);
  
  console.log('Subheadings:');
  $detail('.media__subheading').each((i, el) => {
    console.log($detail(el).html());
  });
}
run();
