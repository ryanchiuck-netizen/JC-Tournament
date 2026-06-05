import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const url = "https://tournaments.tennis.com.au/sport/event.aspx?id=BE903BBF-1DFF-475D-A5F5-1A68B8D7C25B&event=13";
  console.log("Fetching url:", url);
  try {
    const res = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const $ = cheerio.load(res.data);
    
    // Let's count matching links
    let allLinksCount = 0;
    const playerLinks: { name: string, href: string }[] = [];
    
    $('a[href*="player.aspx"], a[href*="/player/"], a[href*="/player-profile/"]').each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href') || '';
      allLinksCount++;
      const isGeneric = href.toLowerCase().includes('/player-profile/search') || href.toLowerCase().endsWith('/player-profile/') || href.toLowerCase().endsWith('/player-profile');
      if (name) {
        playerLinks.push({ name, href });
      }
    });
    
    console.log("Total matching links found:", allLinksCount);
    console.log("Links with non-empty text:", playerLinks.length);
    
    // Unique URLs
    const uniqueUrls = new Set(playerLinks.map(p => p.href));
    console.log("Unique URLs count:", uniqueUrls.size);
    
    // Let's see some names and their URLs
    console.log("Sample 10 player names and links:");
    playerLinks.slice(0, 15).forEach((p, idx) => {
      console.log(`${idx + 1}: Name: "${p.name}", Href: "${p.href}"`);
    });
    
    // Let's look for how many players are in tables vs other structures
    console.log("Look for table rows or direct names...");
    // Often there are player names that don't have active player links (or have different formats).
    // Or maybe some player profiles don't contain links, but are plain text or in table cells?
    // Let's search for cells/spans that look like player names, or inspect any table rows.
    let rowsCount = 0;
    $('tr').each((i, el) => {
      rowsCount++;
    });
    console.log("Total table rows in the document:", rowsCount);
  } catch (err: any) {
    console.error("Fetch failed:", err.message);
  }
}

run();
