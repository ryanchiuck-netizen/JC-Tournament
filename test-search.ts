import axios from 'axios';
import * as cheerio from 'cheerio';

async function testSearch(name: string) {
  const url = `https://hkta.tournamentsoftware.com/find/player?q=${encodeURIComponent(name)}`;
  
  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    
    const playerLinks: {name: string, url: string}[] = [];
    
    $('.media__title a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && href.includes('/player-profile/')) {
        playerLinks.push({ name: text, url: `https://hkta.tournamentsoftware.com${href}` });
      }
    });
    
    console.log("Found players:", playerLinks);
    
    // If empty, let's dump the HTML of the search results container
    if (playerLinks.length === 0) {
      console.log("No players found. Dumping HTML:");
      console.log($('.media-list').html() || $('.list').html() || $('body').text().replace(/\s+/g, ' ').substring(0, 1000));
    }
  } catch (e: any) {
    console.log(`URL: ${url} - Error: ${e.message}`);
  }
}

testSearch('Jordan Chiu');
