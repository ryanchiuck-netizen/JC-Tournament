import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import { runScraper } from "./scraper.js";
import cron from "node-cron";
import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cookieParser());
  app.use(express.json());

  const ALLOWED_EMAILS = ["ryan.chiu.ck@gmail.com", "annycheng68@gmail.com"];
  const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-12345";

  // Middleware to check auth
  const requireAuth = (req: any, res: any, next: any) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // Auth Routes
  app.get("/api/auth/url", (req, res) => {
    // Ensure no trailing slash on APP_URL
    const baseUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    const redirectUri = `${baseUrl}/api/auth/callback`;
    
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "email profile",
      access_type: "offline",
      prompt: "consent"
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  app.get(["/api/auth/callback", "/api/auth/callback/"], async (req, res) => {
    const { code } = req.query;
    // Ensure no trailing slash on APP_URL
    const baseUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    const redirectUri = `${baseUrl}/api/auth/callback`;

    try {
      // Exchange code for token
      const tokenRes = await axios.post("https://oauth2.googleapis.com/token", {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      });

      const { access_token } = tokenRes.data;

      // Get user info
      const userRes = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` }
      });

      const email = userRes.data.email;

      if (!ALLOWED_EMAILS.includes(email)) {
        return res.send(`
          <html><body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: 'Email not authorized' }, '*');
                window.close();
              }
            </script>
            <p>Unauthorized email. You can close this window.</p>
          </body></html>
        `);
      }

      // Generate JWT
      const token = jwt.sign({ email, name: userRes.data.name, picture: userRes.data.picture }, JWT_SECRET, { expiresIn: "7d" });

      // Set cookie
      res.cookie("auth_token", token, {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.send(`
        <html><body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body></html>
      `);
    } catch (error: any) {
      console.error("OAuth error:", error.response?.data || error.message);
      res.send(`
        <html><body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: 'Authentication failed' }, '*');
              window.close();
            }
          </script>
          <p>Authentication failed. You can close this window.</p>
        </body></html>
      `);
    }
  });

  app.get("/api/auth/me", requireAuth, (req: any, res) => {
    res.json({ user: req.user });
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("auth_token", {
      secure: true,
      sameSite: "none",
      httpOnly: true,
    });
    res.json({ success: true });
  });

  // Run scraper on startup if data doesn't exist
  const dataPath = path.join(process.cwd(), "public", "tournaments.json");
  
  let isScraping = false;

  const checkAndScrape = async () => {
    try {
      await fs.access(dataPath);
      console.log("tournaments.json exists. Skipping initial scrape.");
    } catch {
      console.log("tournaments.json not found. Running initial scrape...");
      isScraping = true;
      runScraper().finally(() => { isScraping = false; });
    }
  };
  
  checkAndScrape();
  
  // Schedule daily scrape at 2 AM Hong Kong time
  cron.schedule('0 2 * * *', () => {
    console.log("Running daily scrape at 2 AM HKT...");
    isScraping = true;
    runScraper().finally(() => { isScraping = false; });
  }, {
    timezone: "Asia/Hong_Kong"
  });

  // API route to get the static tournaments data
  app.get("/api/tournaments/static", requireAuth, async (req, res) => {
    try {
      const data = await fs.readFile(dataPath, "utf-8");
      const parsed = JSON.parse(data);
      parsed.isScraping = isScraping;
      res.setHeader("Content-Type", "application/json");
      res.json(parsed);
    } catch (error) {
      res.status(200).json({ 
        tournaments: [], 
        isScraping: isScraping,
        message: "Data not available yet. Scraper is running."
      });
    }
  });

  // API route to get player names for autofill
  app.get("/api/players", requireAuth, async (req, res) => {
    try {
      const playersPath = path.join(process.cwd(), "public", "players.json");
      const data = await fs.readFile(playersPath, "utf-8");
      res.setHeader("Content-Type", "application/json");
      res.json(JSON.parse(data));
    } catch (error) {
      res.json([]);
    }
  });

  // API route for Player Watch
  app.get("/api/player-watch", requireAuth, async (req, res) => {
    const playerName = req.query.name as string;
    const playerSource = req.query.source as string;
    if (!playerName) {
      return res.status(400).json({ error: "Player name is required" });
    }

    try {
      const data = await fs.readFile(dataPath, "utf-8");
      const { tournaments } = JSON.parse(data);
      
      const limit = pLimit(5);
      const matches: any[] = [];
      const cleanPlayerName = playerName.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[,.]/g, '').trim();
      const queryParts = cleanPlayerName.toLowerCase().split(/\s+/);

      const searchTasks = tournaments.map((tournament: any) => 
        limit(async () => {
          // Check source match if playerSource is provided
          if (playerSource) {
            if (tournament.source === "HK" && playerSource !== "HKTA") return;
            if (tournament.source === "AUS" && playerSource !== "TA") return;
          }

          const domain = tournament.source === "HK" ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
          const playersUrl = `https://${domain}/tournament/${tournament.link.split("id=")[1]}/Players/GetPlayersContent`;
          
          try {
            const response = await axios.get(playersUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0",
                "X-Requested-With": "XMLHttpRequest"
              },
              timeout: 10000
            });

            // Quick check if all query parts exist in HTML before parsing
            const dataLower = response.data.toLowerCase().replace(/[,.]/g, '');
            const quickMatch = queryParts.every(part => dataLower.includes(part));

            if (quickMatch) {
              const $ = cheerio.load(response.data);
              let playerDetailLink = "";

              $("li.js-alphabet-list-item").each((i, el) => {
                const name = $(el).find(".media__title").text().trim().toLowerCase().replace(/[,.]/g, '');
                // Match if all parts of the query are found in the player's name
                if (queryParts.every(part => name.includes(part))) {
                  playerDetailLink = $(el).find(".media__title a").attr("href") || "";
                  return false; // break
                }
              });

              if (playerDetailLink) {
                const fullPlayerUrl = `https://${domain}${playerDetailLink}`;
                const detailResponse = await axios.get(fullPlayerUrl, {
                  headers: { "User-Agent": "Mozilla/5.0" },
                  timeout: 10000
                });
                const $detail = cheerio.load(detailResponse.data);
                
                $detail(".media__subheading").each((i, el) => {
                  const firstLink = $detail(el).find("a").first();
                  if (firstLink.length > 0) {
                    const drawName = firstLink.text().trim();
                    const drawLink = firstLink.attr("href");
                    matches.push({
                      tournamentName: tournament.name,
                      tournamentLink: `https://${domain}${tournament.link}`,
                      tournamentDates: tournament.dates,
                      drawName: drawName,
                      drawLink: drawLink ? `https://${domain}${drawLink}` : undefined
                    });
                  }
                });
              }
            }
          } catch (e) {
            // Skip failed requests
          }
        })
      );

      await Promise.all(searchTasks);
      res.json({ playerName, matches });
    } catch (error) {
      res.status(500).json({ error: "Failed to search for player" });
    }
  });

  app.get("/api/tournaments-for-players", requireAuth, async (req, res) => {
    try {
      const savedPlayers = await getSavedPlayers();
      if (!savedPlayers || savedPlayers.length === 0) {
        return res.json({ tournaments: [] });
      }

      const data = await fs.readFile(dataPath, "utf-8");
      const { tournaments } = JSON.parse(data);

      // Filter tournaments to only future ones
      const futureTournaments = tournaments.filter((t: any) => {
        if (!t.dates) return false;
        const parts = t.dates.split(' to ');
        const dateToParse = parts[parts.length - 1].trim();
        const [day, month, year] = dateToParse.split('/');
        if (!day || !month || !year) return false;
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date >= today;
      });

      const limit = pLimit(5);
      const results: any[] = [];

      const searchTasks = futureTournaments.map((tournament: any) => 
        limit(async () => {
          const domain = tournament.source === "HK" ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
          const playersUrl = `https://${domain}/tournament/${tournament.link.split("id=")[1]}/Players/GetPlayersContent`;
          
          try {
            const response = await axios.get(playersUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0",
                "X-Requested-With": "XMLHttpRequest"
              },
              timeout: 10000
            });

            const dataLower = response.data.toLowerCase().replace(/[,.]/g, '');
            const $ = cheerio.load(response.data);
            
            const joinedPlayers: any[] = [];

            for (const player of savedPlayers) {
              // Check source match
              if (tournament.source === "HK" && player.source !== "HKTA") continue;
              if (tournament.source === "AUS" && player.source !== "TA") continue;

              const cleanPlayerName = player.name.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[,.]/g, '').trim();
              const queryParts = cleanPlayerName.toLowerCase().split(/\s+/);

              const quickMatch = queryParts.every(part => dataLower.includes(part));

              if (quickMatch) {
                let playerDetailLink = "";

                $("li.js-alphabet-list-item").each((i, el) => {
                  const name = $(el).find(".media__title").text().trim().toLowerCase().replace(/[,.]/g, '');
                  if (queryParts.every(part => name.includes(part))) {
                    playerDetailLink = $(el).find(".media__title a").attr("href") || "";
                    return false; // break
                  }
                });

                if (playerDetailLink) {
                  const fullPlayerUrl = `https://${domain}${playerDetailLink}`;
                  const detailResponse = await axios.get(fullPlayerUrl, {
                    headers: { "User-Agent": "Mozilla/5.0" },
                    timeout: 10000
                  });
                  const $detail = cheerio.load(detailResponse.data);
                  
                  const draws: any[] = [];
                  $detail(".media__subheading").each((i, el) => {
                    const firstLink = $detail(el).find("a").first();
                    if (firstLink.length > 0) {
                      const drawName = firstLink.text().trim();
                      const drawLink = firstLink.attr("href");
                      draws.push({
                        drawName: drawName,
                        drawLink: drawLink ? `https://${domain}${drawLink}` : undefined
                      });
                    }
                  });

                  if (draws.length > 0) {
                    joinedPlayers.push({
                      player,
                      draws
                    });
                  }
                }
              }
            }

            if (joinedPlayers.length > 0) {
              results.push({
                tournament,
                joinedPlayers
              });
            }
          } catch (e) {
            // Skip failed requests
          }
        })
      );

      await Promise.all(searchTasks);
      
      // Sort results by tournament date
      results.sort((a, b) => {
        const parseDate = (d: string) => {
          const parts = d.split(' to ');
          const dateToParse = parts[0].trim();
          const [day, month, year] = dateToParse.split('/');
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
        };
        return parseDate(a.tournament.dates) - parseDate(b.tournament.dates);
      });

      res.json({ tournaments: results });
    } catch (error) {
      console.error("Failed to fetch tournaments for players", error);
      res.status(500).json({ error: "Failed to fetch tournaments for players" });
    }
  });

  // --- Global Saved Players Routes ---
  const savedPlayersPath = path.join(process.cwd(), "public", "saved-players.json");

  const getSavedPlayers = async () => {
    try {
      const data = await fs.readFile(savedPlayersPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return [];
    }
  };

  const savePlayers = async (players: any[]) => {
    await fs.writeFile(savedPlayersPath, JSON.stringify(players, null, 2));
  };

  async function scrapePlayerProfile(profileUrl: string, playerNameFallback: string) {
    const profileRes = await axios.get(profileUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });
    
    const $ = cheerio.load(profileRes.data);
    
    const playerName = $('.media__title').first().text().trim() || playerNameFallback;
    
    let utrSingles = '-';
    let wtnSingles = '-';
    
    // Check for UTR
    $('a[href*="utrsports.net"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text && !isNaN(Number(text))) {
        utrSingles = text;
        return false;
      }
    });

    // Check for WTN
    $('.tag-duo__title').each((i, el) => {
      if ($(el).text().trim() === 'Singles') {
        const parentTitle = $(el).parent().attr('title');
        if (parentTitle && parentTitle.includes('World Tennis Number')) {
          const value = $(el).next('.tag-duo__value').text().trim();
          if (value) {
            wtnSingles = value;
          }
        }
      }
    });

    // Fallback for WTN
    if (wtnSingles === '-') {
      $('.list__item').each((i, el) => {
        const label = $(el).find('.list__label').text().trim();
        if (label === 'WTN Singles' || label === 'ITF World Tennis Number' || label === 'ITF World Tennis Number (Singles)') {
          const value = $(el).find('.list__value').text().trim();
          if (value) {
            wtnSingles = value;
          }
        }
      });
    }
    
    let winLossYTD = '-';
    let winLossCareer = '-';
    
    const statsContainer = $('#tabStatsSingles').length > 0 ? $('#tabStatsSingles') : $('#tabStatsTotal');
    statsContainer.find('.list__item').each((i, el) => {
      const label = $(el).find('.list__label').text().trim();
      const value = $(el).find('.list__value-start').text().trim().split('(')[0].trim().replace(' / ', ':');
      
      if (label === 'This year') winLossYTD = value;
      if (label === 'Career') winLossCareer = value;
    });
    
    let titlesByYear: string[] = [];
    
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
      
      $titles('.list__item > .list__label--loud').each((i, el) => {
        const year = $titles(el).text().trim();
        const count = $titles(el).next('dd').find('li.list__item').length;
        if (year && count > 0) {
          titlesByYear.push(`${year}: ${count}`);
        }
      });
    } catch (err) {
      // Fallback to main page titles if the modal fetch fails
      const titlesSection = $('h3:contains("Titles/Finals")').closest('.module');
      titlesSection.find('.list__item > .list__label--loud').each((i, el) => {
        const year = $(el).text().trim();
        const count = $(el).next('dd').find('li.list__item').length;
        if (year && count > 0) {
          titlesByYear.push(`${year}: ${count}`);
        }
      });
    }
    
    const championships = titlesByYear.length > 0 ? titlesByYear.join('\n') : '-';
    
    let rank = '-';
    let points = '-';
    
    if (profileUrl.includes('hkta.tournamentsoftware.com')) {
      try {
        const rankUrl = `${profileUrl}/ranking`;
        const rankRes = await axios.get(rankUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          timeout: 10000
        });
        const $rank = cheerio.load(rankRes.data);
        $rank('table tr').each((i, el) => {
          const text = $rank(el).text().trim().replace(/\s+/g, ' ');
          if (text.includes('Singles')) {
            const cols = $rank(el).find('td');
            if (cols.length >= 2) {
              const r = $rank(cols[0]).text().trim();
              const p = $rank(cols[1]).text().trim();
              if (r && p) {
                rank = r;
                points = p;
                return false; // break
              }
            }
          }
        });
      } catch (err) {
        console.error(`Failed to fetch ranking for ${playerName}:`, err);
      }
    } else if (profileUrl.includes('tournaments.tennis.com.au')) {
      try {
        const rankUrl = `${profileUrl}/ranking`;
        const rankRes = await axios.get(rankUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          timeout: 10000
        });
        const $rank = cheerio.load(rankRes.data);
        
        // Find the table and get the first row with data
        const firstDataRow = $rank('table tbody tr').first();
        if (firstDataRow.length > 0) {
          const cols = firstDataRow.find('td');
          if (cols.length >= 1) {
            // Usually Category is th, Points is first td, Tournaments is second td
            const p = $rank(cols[0]).text().trim();
            if (p) {
              points = p;
            }
          }
        }
      } catch (err) {
        console.error(`Failed to fetch ranking for ${playerName}:`, err);
      }
    }
    
    return {
      name: playerName,
      utrSingles,
      wtnSingles,
      winLossYTD,
      winLossCareer,
      championships,
      rank,
      points
    };
  }

  app.get("/api/saved-players", requireAuth, async (req, res) => {
    const players = await getSavedPlayers();
    
    // Refresh players data
    const limit = pLimit(5);
    const updatedPlayers = await Promise.all(
      players.map((p: any) => 
        limit(async () => {
          if (!p.url) return p;
          try {
            const updatedStats = await scrapePlayerProfile(p.url, p.name);
            return { ...p, ...updatedStats, name: p.name };
          } catch (e) {
            console.error(`Failed to refresh player ${p.name}:`, e);
            return p;
          }
        })
      )
    );
    
    await savePlayers(updatedPlayers);
    res.json(updatedPlayers);
  });

  app.post("/api/saved-players", requireAuth, async (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: "Player name is required" });
    }
    
    try {
      const searchName = encodeURIComponent(name.trim());
      const platforms = [
        { id: 'TA', searchUrl: `https://tournaments.tennis.com.au/find/player?q=${searchName}`, baseUrl: 'https://tournaments.tennis.com.au' },
        { id: 'HKTA', searchUrl: `https://hkta.tournamentsoftware.com/find/player?q=${searchName}`, baseUrl: 'https://hkta.tournamentsoftware.com' }
      ];
      
      const newPlayers = [];
      const players = await getSavedPlayers();
      
      for (const platform of platforms) {
        try {
          // 1. Search for the player
          const searchRes = await axios.get(platform.searchUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 10000
          });
          
          const $search = cheerio.load(searchRes.data);
          const firstPlayerLink = $search('.media__title a').first();
          const href = firstPlayerLink.attr('href');
          
          if (href && href.includes('/player-profile/')) {
            const profileUrl = `${platform.baseUrl}${href}`;
            
            // 2. Scrape the profile
            const stats = await scrapePlayerProfile(profileUrl, name);
            
            const newPlayer = {
              id: Date.now().toString() + Math.random().toString(36).substring(7),
              url: profileUrl,
              source: platform.id,
              ...stats
            };
            
            newPlayers.push(newPlayer);
            players.push(newPlayer);
          }
        } catch (err) {
          console.error(`Error scraping ${platform.id} for ${name}:`, err);
        }
      }
      
      if (newPlayers.length === 0) {
        return res.status(404).json({ error: "Player not found on Tennis Australia or HKTA" });
      }
      
      await savePlayers(players);
      res.json(newPlayers);
      
    } catch (error) {
      console.error("Search/Scraping error:", error);
      res.status(500).json({ error: "Failed to search and scrape player data" });
    }
  });

  app.delete("/api/saved-players/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    let players = await getSavedPlayers();
    players = players.filter((p: any) => p.id !== id);
    await savePlayers(players);
    res.json({ success: true });
  });

  app.put("/api/saved-players/reorder", requireAuth, async (req, res) => {
    const { players } = req.body;
    if (!Array.isArray(players)) {
      return res.status(400).json({ error: "Players array is required" });
    }
    await savePlayers(players);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
