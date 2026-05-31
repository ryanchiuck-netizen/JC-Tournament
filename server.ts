import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import { runScraper } from "./scraper.ts";
import cron from "node-cron";
import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import cookieParser from "cookie-parser";
import { createClient } from "@supabase/supabase-js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cookieParser());
  app.use(express.json());

  // Initialize Supabase Client
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

  if (supabase) {
    console.log("Supabase client initialized successfully. Connected to:", supabaseUrl);
  } else {
    console.log("Supabase environment variables not found. Falling back to local saved-players.json format.");
  }

  // Middleware to check auth (disabled)
  const requireAuth = (req: any, res: any, next: any) => {
    next();
  };

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

  // API route to get the static tournaments data (and support legacy route)
  const getTournamentsHandler = async (req: any, res: any) => {
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
  };

  app.get("/api/tournaments/static", requireAuth, getTournamentsHandler);
  app.get("/api/tournaments", requireAuth, getTournamentsHandler);

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

          // If we have pre-scraped players, filter. If empty or absent, we assume they could be in it.
          if (tournament.players && tournament.players.length > 0) {
            const isMatch = tournament.players.some((tPlayerName: string) => 
               queryParts.every(part => tPlayerName.toLowerCase().replace(/[,.]/g, '').includes(part))
            );
            if (!isMatch) return;
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
      const savedPlayers = await getSavedPlayers(req, res);
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
      const searchTasks: any[] = [];

      for (const tournament of futureTournaments) {
        // Find which savedPlayers are likely in this tournament
        const likelyPlayers = savedPlayers.filter((player: any) => {
          if (tournament.source === "HK" && player.source !== "HKTA") return false;
          if (tournament.source === "AUS" && player.source !== "TA") return false;

          // If we have pre-scraped players, filter. If empty or absent, we must assume they could be in it.
          if (tournament.players && tournament.players.length > 0) {
            const cleanPlayerName = player.name.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[,.]/g, '').trim();
            const queryParts = cleanPlayerName.toLowerCase().split(/\s+/);
            return tournament.players.some((tPlayerName: string) => 
               queryParts.every(part => tPlayerName.toLowerCase().replace(/[,.]/g, '').includes(part))
            );
          }
          return true;
        });

        if (likelyPlayers.length === 0) continue;

        searchTasks.push(
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

              for (const player of likelyPlayers) {
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
      }

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

  // Automatic migration/sync on startup: Local file -> Supabase
  const syncLocalToSupabase = async () => {
    if (!supabase) return;
    try {
      const { count, error } = await supabase
        .from("saved_players")
        .select("id", { count: "exact", head: true });

      if (!error && (count === 0 || count === null)) {
        console.log("Supabase saved_players table is empty. Syncing local players...");
        try {
          const rawData = await fs.readFile(savedPlayersPath, "utf-8");
          const localPlayers = JSON.parse(rawData);
          if (localPlayers && localPlayers.length > 0) {
            const rows = localPlayers.map((p: any, index: number) => ({
              id: p.id,
              name: p.name,
              url: p.url || null,
              source: p.source || null,
              utr_singles: p.utrSingles || "-",
              wtn_singles: p.wtnSingles || "-",
              win_loss_ytd: p.winLossYTD || "-",
              win_loss_career: p.winLossCareer || "-",
              championships: p.championships || "-",
              rank: p.rank || "-",
              points: p.points || "-",
              sort_order: p.sort_order !== undefined ? p.sort_order : index,
            }));

            const { error: upsertError } = await supabase
              .from("saved_players")
              .upsert(rows, { onConflict: "id" });

            if (upsertError) {
              console.error("Failed to migrate local players to Supabase:", upsertError.message);
            } else {
              console.log(`Successfully migrated ${localPlayers.length} players to Supabase!`);
            }
          }
        } catch (fsErr) {
          // Local file might not exist yet, which is fine
        }
      }
    } catch (err: any) {
      console.warn("Could not sync local data to Supabase (Ensure your saved_players table is configured in your Supabase SQL editor):", err.message || err);
    }
  };

  syncLocalToSupabase();

  const getSavedPlayers = async (req: any, res: any) => {
    let players: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("saved_players")
          .select("*")
          .order("sort_order", { ascending: true });

        if (error) {
          console.warn("Failed to get players from Supabase, falling back to local files:", error.message);
          throw error;
        }

        if (data) {
          players = data.map((row: any) => ({
            id: row.id,
            name: row.name,
            url: row.url || undefined,
            source: row.source || undefined,
            utrSingles: row.utr_singles || "-",
            wtnSingles: row.wtn_singles || "-",
            winLossYTD: row.win_loss_ytd || "-",
            winLossCareer: row.win_loss_career || "-",
            championships: row.championships || "-",
            rank: row.rank || "-",
            points: row.points || "-",
            sort_order: row.sort_order ?? undefined,
          }));
        }
      } catch (err) {
        // Fallback to local files
        try {
          const data = await fs.readFile(savedPlayersPath, "utf-8");
          players = JSON.parse(data);
        } catch {
          players = [];
        }
      }
    } else {
      try {
        const data = await fs.readFile(savedPlayersPath, "utf-8");
        players = JSON.parse(data);
      } catch {
        players = [];
      }
    }

    // Deduplicate players by URL (or name + source if URL is missing)
    const uniquePlayersMap = new Map();
    for (const player of players) {
      const key = player.url || `${player.name}-${player.source}`;
      if (!uniquePlayersMap.has(key)) {
        uniquePlayersMap.set(key, player);
      }
    }
    return Array.from(uniquePlayersMap.values());
  };

  const savePlayers = async (req: any, res: any, players: any[]) => {
    // Save to local backup file as offline/failover secondary copy
    try {
      await fs.writeFile(savedPlayersPath, JSON.stringify(players, null, 2));
    } catch (e: any) {
      console.error("Error writing saved-players local backup:", e.message || String(e));
    }

    if (supabase) {
      try {
        const rows = players.map((p: any, index: number) => ({
          id: p.id,
          name: p.name,
          url: p.url || null,
          source: p.source || null,
          utr_singles: p.utrSingles || "-",
          wtn_singles: p.wtnSingles || "-",
          win_loss_ytd: p.winLossYTD || "-",
          win_loss_career: p.winLossCareer || "-",
          championships: p.championships || "-",
          rank: p.rank || "-",
          points: p.points || "-",
          sort_order: p.sort_order !== undefined ? p.sort_order : index,
        }));

        const { error } = await supabase
          .from("saved_players")
          .upsert(rows, { onConflict: "id" });

        if (error) {
          console.error("Error saving players to Supabase:", error.message);
        }
      } catch (err: any) {
        console.error("Supabase write failed:", err.message || err);
      }
    }
  };

  // --- Saved Draws Helpers & Sync ---
  const savedDrawsPath = path.join(process.cwd(), "public", "saved-draws.json");

  // Sync saved draws from local file -> Supabase on startup
  const syncLocalDrawsToSupabase = async () => {
    if (!supabase) return;
    try {
      const { count, error } = await supabase
        .from("saved_draws")
        .select("id", { count: "exact", head: true });

      if (!error && (count === 0 || count === null)) {
        console.log("Supabase saved_draws table is empty. Syncing local draws...");
        try {
          const rawData = await fs.readFile(savedDrawsPath, "utf-8");
          const { draws } = JSON.parse(rawData);
          if (draws && draws.length > 0) {
            const rows = draws.map((d: any, index: number) => ({
              id: d.id,
              name: d.name,
              url: d.url,
              region: d.region || "AUS",
              players: d.players || [],
              sort_order: d.sort_order !== undefined ? d.sort_order : index,
            }));

            const { error: upsertError } = await supabase
              .from("saved_draws")
              .upsert(rows, { onConflict: "id" });

            if (upsertError) {
              console.error("Failed to migrate local draws to Supabase:", upsertError.message);
            } else {
              console.log(`Successfully migrated ${draws.length} draws to Supabase!`);
            }
          }
        } catch (fsErr) {
          // Local file might not exist yet, which is fine
        }
      }
    } catch (err: any) {
      console.warn("Could not sync local draws to Supabase:", err.message || err);
    }
  };

  syncLocalDrawsToSupabase();

  const getSavedDraws = async (req: any, res: any) => {
    let draws: any[] = [];
    let updatedAt: string = new Date().toISOString();

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("saved_draws")
          .select("*")
          .order("sort_order", { ascending: true });

        if (error) {
          console.warn("Failed to get draws from Supabase, falling back to local files:", error.message);
          throw error;
        }

        if (data) {
          draws = data.map((row: any) => ({
            id: row.id,
            name: row.name,
            url: row.url,
            region: row.region || "AUS",
            players: row.players || [],
            sort_order: row.sort_order ?? undefined,
          }));
          updatedAt = new Date().toISOString();
        }
      } catch (err) {
        // Fallback to local files
        try {
          const raw = await fs.readFile(savedDrawsPath, "utf-8");
          const parsed = JSON.parse(raw);
          draws = parsed.draws || [];
          updatedAt = parsed.updatedAt || updatedAt;
        } catch {
          draws = [];
        }
      }
    } else {
      try {
        const raw = await fs.readFile(savedDrawsPath, "utf-8");
        const parsed = JSON.parse(raw);
        draws = parsed.draws || [];
        updatedAt = parsed.updatedAt || updatedAt;
      } catch {
        draws = [];
      }
    }

    // Deduplicate draws by URL
    const uniqueDrawsMap = new Map();
    for (const draw of draws) {
      const key = draw.url;
      if (!uniqueDrawsMap.has(key)) {
        uniqueDrawsMap.set(key, draw);
      }
    }
    return { draws: Array.from(uniqueDrawsMap.values()), updatedAt };
  };

  const saveSavedDraws = async (req: any, res: any, draws: any[]) => {
    const updatedAt = new Date().toISOString();
    // Save to local backup file
    try {
      await fs.writeFile(savedDrawsPath, JSON.stringify({ draws, updatedAt }, null, 2));
    } catch (e: any) {
      console.error("Error writing saved-draws local backup:", e.message || String(e));
    }

    if (supabase) {
      try {
        const rows = draws.map((d: any, index: number) => ({
          id: d.id,
          name: d.name,
          url: d.url,
          region: d.region || "AUS",
          players: d.players || [],
          sort_order: d.sort_order !== undefined ? d.sort_order : index,
        }));

        const { error } = await supabase
          .from("saved_draws")
          .upsert(rows, { onConflict: "id" });

        if (error) {
          console.error("Error saving draws to Supabase:", error.message);
        }
      } catch (err: any) {
        console.error("Supabase draws write failed:", err.message || err);
      }
    }
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

  app.post("/api/check-draw", requireAuth, async (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "Draw URL is required" });
    }

    try {
      const drawRes = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 10000
      });

      const $ = cheerio.load(drawRes.data);
      const playerLinks: { name: string, url: string }[] = [];

      $('a[href*="player.aspx?"], a[href*="/player/"]').each((i, el) => {
        const name = $(el).text().trim();
        const href = $(el).attr('href');
        // Ignore links that don't have a name or are just icons
        if (name && href && !href.includes('/player-profile/')) {
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
      });

      // Check for draw name / tournament name
      let drawNameCandidate = $("h2").text().trim() || $(".media__title").first().text().trim();
      if (drawNameCandidate.includes('- Draws - ')) {
        drawNameCandidate = drawNameCandidate.split('- Draws - ')[1];
      }
      
      let tournamentName = '';
      let tournamentDate = '';

      try {
        const tournamentIdMatch = url.match(/id=([a-zA-Z0-9\-]+)/);
        if (tournamentIdMatch) {
          const tDomain = url.includes("hkta") ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
          const tUrl = `https://${tDomain}/sport/tournament.aspx?id=${tournamentIdMatch[1]}`;
          const tRes = await axios.get(tUrl, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 10000 });
          const $t = cheerio.load(tRes.data);
          
          tournamentName = $t(".media__title").first().text().trim();
          const items = $t(".media__content small, .media__content .text-muted, .text-muted.media__subheading, .media__title + span, span[class*=\"date\"]").map((_, e)=>$t(e).text().trim()).get();
          if (items.length > 1) {
            tournamentDate = items[1]; // Typically "6 Jul to 10 Jul" etc
          }
        }
      } catch (e: any) {
        console.warn("Failed to fetch tournament metadata", e.message);
      }

      if (playerLinks.length === 0) {
        return res.json({ players: [] });
      }

      const limit = pLimit(3); // Scrape 3 players at a time
      const playersStats = await Promise.all(
        playerLinks.map(pl => 
          limit(async () => {
            try {
              let finalProfileUrl = '';
              
              if (pl.url.includes('/player-profile/')) {
                finalProfileUrl = pl.url;
              } else {
                // 1. Fetch player page to find profile link
                const playerPageRes = await axios.get(pl.url, {
                  headers: { "User-Agent": "Mozilla/5.0" },
                  timeout: 10000
                });
                const $player = cheerio.load(playerPageRes.data);
                
                // Find the link that goes to /player-profile/
                let profileRedirectUrl = '';
                $player('a[href*="/player-profile/"]').each((i, el) => {
                  const text = $player(el).text().trim();
                  if (text.toLowerCase().includes(pl.name.toLowerCase().split(' ')[0])) {
                    const href = $player(el).attr('href');
                    profileRedirectUrl = href?.startsWith('http') ? href : 'https://tournaments.tennis.com.au' + href;
                    return false;
                  }
                });

                if (!profileRedirectUrl) {
                  // Try any /player-profile/ link if name match fails
                  const firstPlayerLink = $player('a[href*="/player-profile/"]').first().attr('href');
                  if (firstPlayerLink) {
                    profileRedirectUrl = firstPlayerLink.startsWith('http') ? firstPlayerLink : 'https://tournaments.tennis.com.au' + firstPlayerLink;
                  }
                }

                if (!profileRedirectUrl) {
                  // Fallback: maybe it's still using the old /player/ format
                  $player('a[href*="/player/"]').each((i, el) => {
                    const text = $player(el).text().trim();
                    if (text.toLowerCase().includes(pl.name.toLowerCase().split(' ')[0])) {
                      const href = $player(el).attr('href');
                      profileRedirectUrl = href?.startsWith('http') ? href : 'https://tournaments.tennis.com.au' + href;
                      return false;
                    }
                  });
                  
                  if (!profileRedirectUrl) {
                    const firstPlayerLink = $player('a[href*="/player/"]').first().attr('href');
                    if (firstPlayerLink) {
                      profileRedirectUrl = firstPlayerLink.startsWith('http') ? firstPlayerLink : 'https://tournaments.tennis.com.au' + firstPlayerLink;
                    }
                  }
                }

                if (profileRedirectUrl) {
                  // 2. Follow redirect to get final profile URL
                  const redirectRes = await axios.get(profileRedirectUrl, {
                    headers: { "User-Agent": "Mozilla/5.0" },
                    timeout: 10000,
                    maxRedirects: 5
                  });
                  finalProfileUrl = redirectRes.request.res.responseUrl || profileRedirectUrl;
                }
              }

              if (finalProfileUrl) {
                // 3. Scrape profile stats
                const stats = await scrapePlayerProfile(finalProfileUrl, pl.name);
                return {
                  id: Math.random().toString(36).substring(7),
                  name: pl.name,
                  profileUrl: finalProfileUrl,
                  ...stats
                };
              }

              return { id: Math.random().toString(36).substring(7), name: pl.name };
            } catch (e) {
              console.error(`Failed to scrape player ${pl.name} from draw:`, e);
              return { id: Math.random().toString(36).substring(7), name: pl.name };
            }
          })
        )
      );

      res.json({ 
        players: playersStats,
        drawName: drawNameCandidate,
        tournamentName,
        tournamentDate
      });
    } catch (error) {
      console.error("Draw check error:", error);
      res.status(500).json({ error: "Failed to check draw stats" });
    }
  });

  app.get("/api/saved-players", requireAuth, async (req, res) => {
    const players = await getSavedPlayers(req, res);
    res.json(players);
  });

  app.post("/api/refresh-player/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const players = await getSavedPlayers(req, res);
    const playerIndex = players.findIndex((p: any) => p.id === id);
    
    if (playerIndex === -1) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    const p = players[playerIndex];
    if (!p.url) {
      return res.json(p);
    }
    
    try {
      const updatedStats = await scrapePlayerProfile(p.url, p.name);
      const updatedPlayer = { ...p, ...updatedStats, name: p.name };
      players[playerIndex] = updatedPlayer;
      await savePlayers(req, res, players);
      res.json(updatedPlayer);
    } catch (e) {
      console.error(`Failed to refresh player ${p.name}:`, e);
      res.status(500).json({ error: "Failed to refresh player" });
    }
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
      const players = await getSavedPlayers(req, res);
      
      let playerAlreadyExists = false;
      
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
            
            // Check if player already exists
            const exists = players.some((p: any) => p.url === profileUrl || (p.name.toLowerCase() === name.toLowerCase() && p.source === platform.id));
            if (exists) {
              playerAlreadyExists = true;
              continue; // Skip adding duplicate
            }
            
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
        if (playerAlreadyExists) {
          return res.status(400).json({ error: "Player already added" });
        }
        return res.status(404).json({ error: "Player not found on Tennis Australia or HKTA" });
      }
      
      await savePlayers(req, res, players);
      res.json(newPlayers);
      
    } catch (error) {
      console.error("Search/Scraping error:", error);
      res.status(500).json({ error: "Failed to search and scrape player data" });
    }
  });

  app.delete("/api/saved-players/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    
    if (supabase) {
      try {
        await supabase.from("saved_players").delete().eq("id", id);
      } catch (err: any) {
        console.error("Error deleting from Supabase database:", err.message || err);
      }
    }

    let players = await getSavedPlayers(req, res);
    players = players.filter((p: any) => p.id !== id);
    await savePlayers(req, res, players);
    res.json({ success: true });
  });

  app.put("/api/saved-players/reorder", requireAuth, async (req, res) => {
    const { players } = req.body;
    if (!Array.isArray(players)) {
      return res.status(400).json({ error: "Players array is required" });
    }
    await savePlayers(req, res, players);
    res.json({ success: true });
  });

  // --- Saved Draws API Endpoints ---
  app.get("/api/saved-draws", requireAuth, async (req, res) => {
    try {
      const data = await getSavedDraws(req, res);
      res.json(data);
    } catch (err: any) {
      console.error("Failed to query saved draws:", err);
      res.status(500).json({ error: "Failed to query saved draws" });
    }
  });

  app.post("/api/saved-draws", requireAuth, async (req, res) => {
    const { url, region, name, players } = req.body;
    if (!url || !name) {
      return res.status(400).json({ error: "Draw URL and name are required" });
    }

    try {
      const { draws } = await getSavedDraws(req, res);
      const existingIndex = draws.findIndex((d: any) => d.url === url);
      const newDraw = {
        id: existingIndex >= 0 ? draws[existingIndex].id : (Date.now().toString() + Math.random().toString(36).substring(7)),
        name,
        url,
        region: region || "AUS",
        players: players || [],
        sort_order: existingIndex >= 0 ? draws[existingIndex].sort_order : draws.length
      };

      if (existingIndex >= 0) {
        draws[existingIndex] = newDraw;
      } else {
        draws.push(newDraw);
      }

      await saveSavedDraws(req, res, draws);
      const currentData = await getSavedDraws(req, res);
      res.json(currentData);
    } catch (error) {
      console.error("Failed to save draw:", error);
      res.status(500).json({ error: "Failed to save draw" });
    }
  });

  app.delete("/api/saved-draws/:id", requireAuth, async (req, res) => {
    const { id } = req.params;

    if (supabase) {
      try {
        await supabase.from("saved_draws").delete().eq("id", id);
      } catch (err: any) {
        console.error("Error deleting from Supabase database:", err.message || err);
      }
    }

    const { draws } = await getSavedDraws(req, res);
    const filteredDraws = draws.filter((d: any) => d.id !== id);
    await saveSavedDraws(req, res, filteredDraws);
    const currentData = await getSavedDraws(req, res);
    res.json(currentData);
  });

  app.put("/api/saved-draws/reorder", requireAuth, async (req, res) => {
    const { draws } = req.body;
    if (!Array.isArray(draws)) {
      return res.status(400).json({ error: "Draws array is required" });
    }
    await saveSavedDraws(req, res, draws);
    const currentData = await getSavedDraws(req, res);
    res.json(currentData);
  });

  app.put("/api/saved-draws/:id/players", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { players } = req.body;
    if (!Array.isArray(players)) {
      return res.status(400).json({ error: "Players array is required" });
    }

    try {
      const { draws } = await getSavedDraws(req, res);
      const drawIndex = draws.findIndex((d: any) => d.id === id);
      if (drawIndex === -1) {
        return res.status(404).json({ error: "Draw not found" });
      }

      draws[drawIndex].players = players;
      await saveSavedDraws(req, res, draws);
      const currentData = await getSavedDraws(req, res);
      res.json(currentData);
    } catch (error) {
      console.error("Failed to update players in draw:", error);
      res.status(500).json({ error: "Failed to update players in draw" });
    }
  });

  app.get("/api/download-project", (req, res) => {
    const filePath = path.join(process.cwd(), "public", "project.zip");
    res.download(filePath, "jc-tennis-project.zip", (err) => {
      if (err) {
        console.error("Error downloading file:", err);
        if (!res.headersSent) {
          res.status(404).send("File not found");
        }
      }
    });
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
