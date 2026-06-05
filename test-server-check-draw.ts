import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const urlStr = "https://tournaments.tennis.com.au/sport/event.aspx?id=BE903BBF-1DFF-475D-A5F5-1A68B8D7C25B&event=13";
  let url = urlStr;
  let resolvedUrl = urlStr;
  let isPreFetched = false;
  let drawRes: any;

  console.log("MOCKING SERVER CHECK-DRAW FOR:", url);

  if (url.includes('event.aspx')) {
    try {
      console.log(`[check-draw] Detected event.aspx container URL: ${url}. Fetching event page to check for direct players...`);
      const eventPageRes = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 10000
      });
      const $eventPage = cheerio.load(eventPageRes.data);
      
      const directPlayersCount = $eventPage('a[href*="player.aspx?"], a[href*="player.aspx"], a[href*="/player/"], a[href*="/player-profile/"]')
        .filter((_, el) => {
          const href = $eventPage(el).attr('href') || '';
          const isGeneric = href.toLowerCase().includes('/player-profile/search') || href.toLowerCase().endsWith('/player-profile/') || href.toLowerCase().endsWith('/player-profile');
          return !isGeneric;
        }).length;

      console.log("[DEBUG] directPlayersCount on eventPage:", directPlayersCount);

      if (directPlayersCount > 0) {
        console.log(`[check-draw] Found ${directPlayersCount} players directly on ${url}. Skipping resolution.`);
        drawRes = eventPageRes;
        isPreFetched = true;
      } else {
        console.log(`[check-draw] 0 players found on event.aspx. Seeking sub-draw...`);
        let drawLink = '';
        $eventPage('a[href*="draw.aspx?"], a[href*="/draw/"]').each((_, el) => {
          const href = $eventPage(el).attr('href') || '';
          if (href && !href.toLowerCase().includes('draws.aspx')) {
            drawLink = href;
            return false;
          }
        });
        
        if (drawLink) {
          resolvedUrl = `https://tournaments.tennis.com.au/sport/${drawLink}`;
          url = resolvedUrl;
          console.log(`[check-draw] Auto-resolved to sub-draw: ${url}`);
        }
      }
    } catch (err: any) {
      console.error("Error preference:", err.message);
    }
  }

  if (!isPreFetched) {
    console.log("Fetching resolvedUrl:", resolvedUrl);
    drawRes = await axios.get(resolvedUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });
  }

  const $ = cheerio.load(drawRes.data);
  const playerLinks: { name: string, url: string }[] = [];

  $('a[href*="player.aspx"], a[href*="/player/"], a[href*="/player-profile/"]').each((i, el) => {
    const name = $(el).text().trim();
    const href = $(el).attr('href');
    if (name && href) {
      const isGeneric = href.toLowerCase().includes('/player-profile/search') || href.toLowerCase().endsWith('/player-profile/') || href.toLowerCase().endsWith('/player-profile');
      if (!isGeneric) {
        let fullUrl = href;
        if (!href.startsWith('http')) {
          if (href.startsWith('/')) {
            fullUrl = `https://tournaments.tennis.com.au${href}`;
          } else {
            fullUrl = `https://tournaments.tennis.com.au/sport/${href}`;
          }
        }
        
        if (!playerLinks.some(pl => pl.url === fullUrl)) {
          playerLinks.push({ name, url: fullUrl });
        }
      }
    }
  });

  console.log("Final playerLinks length resolved by server method:", playerLinks.length);
}

run();
