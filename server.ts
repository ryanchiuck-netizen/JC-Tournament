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

function getQueryParts(playerName: string): string[] {
  if (!playerName) return [];
  const clean = playerName
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .toLowerCase()
    .trim();
  return clean.split(/[\s,.-]+/).filter(Boolean);
}

function isPlayerNameMatch(tPlayerName: string, queryParts: string[]): boolean {
  if (!tPlayerName || queryParts.length === 0) return false;
  const cleanCandidate = tPlayerName
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .toLowerCase()
    .trim();
  const candidateWords = cleanCandidate.split(/[\s,.-]+/).filter(Boolean);
  return queryParts.every(part => 
    candidateWords.some(word => word === part)
  );
}

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
  const tournamentsPlayersCachePath = path.join(process.cwd(), "public", "tournaments-for-players.json");
  
  const getTournamentsData = async (): Promise<any> => {
    if (supabase) {
      try {
        const { data, error } = await supabase.from("tournaments").select("data").eq("id", "latest");
        if (!error && data && data.length > 0 && data[0].data) {
          return data[0].data;
        }
        if (error) {
          if (error.message?.includes("Could not find the table") || error.message?.includes("relation \"public.tournaments\" does not exist")) {
            console.warn("Supabase 'tournaments' table not found. Please run supabase_setup.sql. Falling back to public/tournaments.json.");
          } else {
            console.warn("Supabase tournaments fetch failed, using local file fallback:", error.message);
          }
        }
      } catch (err: any) {
        console.warn("Supabase exception in getTournamentsData:", err.message || err);
      }
    }
    const raw = await fs.readFile(dataPath, "utf-8");
    return JSON.parse(raw);
  };
  
  let isScraping = false;
  let isGlobalRefreshing = false;
  let refreshTournamentsForPlayersCache: () => Promise<any>;

  const wrappedRunScraper = async () => {
    // 1. Get existing tournament links
    const oldLinks = new Set<string>();
    try {
      const rawContent = await fs.readFile(dataPath, "utf-8");
      const parsed = JSON.parse(rawContent);
      if (parsed && Array.isArray(parsed.tournaments)) {
        for (const t of parsed.tournaments) {
          if (t.link) {
            oldLinks.add(t.link);
          }
        }
      }
    } catch (e) {
      console.log("No previous tournaments before runScraper.");
    }

    // 2. Run the actual scraper
    await runScraper();

    if (supabase) {
      try {
         const rawNew = await fs.readFile(dataPath, "utf-8");
         const parsedNew = JSON.parse(rawNew);
         await supabase.from("tournaments").upsert({ id: "latest", data: parsedNew });
         console.log("Successfully backed up scraped tournaments to Supabase!");
      } catch (err: any) {
         console.error("Error saving tournaments to Supabase:", err.message);
      }
    }

    // 3. Analyze newly added tournaments
    try {
      const rawNew = await fs.readFile(dataPath, "utf-8");
      const parsedNew = JSON.parse(rawNew);
      if (parsedNew && Array.isArray(parsedNew.tournaments)) {
        const newNSWNotifications: any[] = [];
        for (const t of parsedNew.tournaments) {
          if (t.link && !oldLinks.has(t.link)) {
            // New tournament!
            const nameUpper = (t.name || "").toUpperCase();
            const locUpper = (t.location || "").toUpperCase();
            if (t.source === "AUS" && (nameUpper.includes("NSW") || locUpper.includes("NSW"))) {
              const dateStr = t.dates || "Unknown Dates";
              newNSWNotifications.push({
                id: `nsw-tournament-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                player: 'System',
                title: `New NSW Tournament Created`,
                body: `New NSW Tournament: ${t.name}\nDates: ${dateStr}\nLocation: ${t.location || "Unknown"}`,
                type: 'NSW_Tournament',
                source: 'AUS',
                date: new Date().toISOString().split('T')[0],
                timestamp: new Date().toISOString(),
                url: `/#tournaments`
              });
            }
          }
        }

        if (newNSWNotifications.length > 0) {
          console.log(`Detected ${newNSWNotifications.length} new NSW tournaments. Saving alerts...`);
          let existingNotifications = [];
          try {
            existingNotifications = await getNotificationsHistory(null, null);
          } catch (e) {}
          const merged = [...newNSWNotifications, ...existingNotifications];
          await saveNotificationsHistory(null, null, merged);
        }
      }
    } catch (e: any) {
      console.error("Error analyzing new tournaments for NSW alerts:", e.message || e);
    }
  };

  // Automatic migration/sync on startup: Supabase -> Local for Tournaments
  const syncSupabaseToLocalTournaments = async () => {
    if (!supabase) {
        console.warn("Supabase not configured, skipping tournaments sync on startup.");
        return;
    }
    try {
      const { count, error: countErr } = await supabase.from("tournaments").select("id", { count: "exact", head: true });
      if (countErr) {
        if (countErr.message?.includes("Could not find the table") || countErr.message?.includes("relation \"public.tournaments\" does not exist")) {
          console.warn("Supabase 'tournaments' table not found on startup sync. Please run supabase_setup.sql in your Supabase dashboard.");
        } else {
          console.warn("Failed to check tournaments count from Supabase on startup sync:", countErr.message);
        }
        return;
      }
      if (count === null || count === 0) {
         console.log("Supabase tournaments table empty. Seeding with local files...");
         try {
           const raw = await fs.readFile(dataPath, "utf-8");
           const parsed = JSON.parse(raw);
           await supabase.from("tournaments").upsert({ id: "latest", data: parsed });
           console.log("Successfully seeded local tournaments to Supabase!");
           
           try {
             const cacheContent = await fs.readFile(tournamentsPlayersCachePath, "utf-8");
             const cacheParsed = JSON.parse(cacheContent);
             await supabase.from("tournaments").upsert({ id: "players_cache", data: cacheParsed });
             console.log("Successfully seeded local tournaments-for-players cache to Supabase!");
           } catch {
             console.log("No local custom players cache file found to seed.");
           }
         } catch (seedErr: any) {
           console.warn("Failed to seed Supabase table on startup:", seedErr.message);
         }
         
         // Trigger an automatic background adhoc scrape so they have completely updated data in Supabase immediately!
         console.log("Triggering background adhoc tournaments scrape on startup to ensure fresh data...");
         isScraping = true;
         wrappedRunScraper()
           .then(async () => {
             if (refreshTournamentsForPlayersCache) {
               await refreshTournamentsForPlayersCache().catch(console.error);
             }
           })
           .catch(err => console.error("Adhoc startup scrape failed:", err))
           .finally(() => { isScraping = false; });
         return;
      }
      
      const { data, error } = await supabase.from("tournaments").select("data").eq("id", "latest");
      if (error) {
        console.warn("Failed to fetch tournaments from supabase:", error.message);
        return;
      }
      if (!data || data.length === 0) {
        console.log("No row with id 'latest' in Supabase tournaments table. Seeding from local tournaments.json...");
        try {
          const raw = await fs.readFile(dataPath, "utf-8");
          const parsed = JSON.parse(raw);
          await supabase.from("tournaments").upsert({ id: "latest", data: parsed });
          console.log("Successfully seeded 'latest' state to Supabase!");
        } catch(e: any) {
          console.error("Seeding 'latest' failed:", e.message);
        }
      } else if (data[0] && data[0].data) {
        await fs.writeFile(dataPath, JSON.stringify(data[0].data, null, 2));
        console.log("Successfully restored tournaments.json from Supabase!");
      }

      const { data: cacheData, error: cacheErr } = await supabase.from("tournaments").select("data").eq("id", "players_cache");
      if (!cacheErr && cacheData && cacheData.length > 0 && cacheData[0].data) {
         await fs.writeFile(tournamentsPlayersCachePath, JSON.stringify(cacheData[0].data, null, 2));
         console.log("Successfully restored tournaments-for-players.json from Supabase!");
      } else if (!cacheErr && (!cacheData || cacheData.length === 0)) {
         console.log("No custom players cache found in Supabase. Backing up local cache to Supabase...");
         try {
           const cacheContent = await fs.readFile(tournamentsPlayersCachePath, "utf-8");
           const cacheParsed = JSON.parse(cacheContent);
           await supabase.from("tournaments").upsert({ id: "players_cache", data: cacheParsed });
           console.log("Successfully backed up local players cache to Supabase!");
         } catch {
           console.log("No local players cache file found to backup.");
         }
      } else if (cacheErr) {
         console.warn("Error checking custom players cache in Supabase:", cacheErr.message);
      }
    } catch(err: any) {
      console.warn("Error restoring tournaments from supabase:", err.message);
    }
  };
  
  // Secure Cron Middleware: checks for CRON_SECRET to authorize external scheduler requests (or falls back to default_local_cron_secret)
  const requireCronSecret = (req: any, res: any, next: any) => {
    const expectedSecret = process.env.CRON_SECRET || "default_local_cron_secret";
    const providedSecret = req.headers["x-cron-secret"] || (req.headers["authorization"] ? req.headers["authorization"].replace("Bearer ", "") : "");

    if (!providedSecret || providedSecret !== expectedSecret) {
      console.warn(`[Cron Auth] Blocked request from ${req.ip}. Expected secret: ${expectedSecret ? "configured" : "none"}, Provided: ${providedSecret ? "yes" : "empty"}`);
      return res.status(401).json({ error: "Unauthorized: Invalid or missing cron secret" });
    }
    next();
  };

  // --- GOOGLE CLOUD SCHEDULER API ENDPOINTS ---
  
  // 1. Tournaments-only Scrape (Target: 3 PM HKT on Monday & Thursday)
  // Cloud Scheduler Schedule: 0 15 * * 1,4 (Timezone: Asia/Hong_Kong)
  app.post("/api/cron/scrape-tournaments", requireCronSecret, async (req, res) => {
    if (isScraping) {
      return res.status(400).json({ error: "Scraping/refresh already in progress" });
    }
    console.log("Cloud Scheduler triggered tournaments-only scrape...");
    isScraping = true;
    
    wrappedRunScraper()
      .then(async () => {
        if (refreshTournamentsForPlayersCache) {
          try {
            await refreshTournamentsForPlayersCache();
          } catch (e) {
            console.error("Cloud Scheduler tournaments cache rebuild failed:", e);
          }
        }
      })
      .catch((err) => {
        console.error("Cloud Scheduler tournaments-only scrape failed:", err);
      })
      .finally(() => { isScraping = false; });

    res.json({ success: true, message: "Tournaments-only scrape triggered in background" });
  });

  // 2. Player Stats & Draws Refresh (Target: 8 AM, 12 PM, 4 PM, 8 PM HKT daily)
  // Cloud Scheduler Schedule: 0 8,12,16,20 * * * (Timezone: Asia/Hong_Kong)
  app.post("/api/cron/global-refresh", requireCronSecret, async (req, res) => {
    if (isGlobalRefreshing) {
      return res.status(400).json({ error: "Global refresh already in progress" });
    }
    console.log("Cloud Scheduler triggered player stats & draw checks update...");
    
    runGlobalRefreshTask(false).catch((err) => {
      console.error("Cloud Scheduler global refresh task failed:", err);
    });

    res.json({ success: true, message: "Global refresh task triggered in background" });
  });

  /*
  // NOTE: IN-MEMORY NODE-CRONS ARE DISABLED to allow Google Cloud Scheduler to handle scheduling natively.
  // This reduces base memory/compute overhead and prevents concurrent duplicate execution under Cloud Run auto-scaling.
  
  // Tournaments tab: refresh at 3 PM HKT on Monday and Thursday only
  cron.schedule('0 15 * * 1,4', () => {
    console.log("Running scheduled tournaments-only scrape at 3 PM HKT (Mondays & Thursdays)...");
    isScraping = true;
    wrappedRunScraper()
      .then(async () => {
        if (refreshTournamentsForPlayersCache) {
          try {
            await refreshTournamentsForPlayersCache();
          } catch (e) {
            console.error("Scheduled 3 PM Monday/Thursday tournaments cache rebuild failed:", e);
          }
        }
      })
      .finally(() => { isScraping = false; });
  }, {
    timezone: "Asia/Hong_Kong"
  });

  // Tournament screen, draw checker, player screen, alerts: 8AM, 12PM, 4PM, 8PM HKT daily
  cron.schedule('0 8,12,16,20 * * *', () => {
    console.log("Running scheduled player statistics, draw checks, and alerts update at 8 AM/12 PM/4 PM/8 PM HKT...");
    if (isGlobalRefreshing) {
      console.log("Scheduled global refresh skipped because another refresh is already in progress.");
      return;
    }
    runGlobalRefreshTask(false).catch(console.error);
  }, {
    timezone: "Asia/Hong_Kong"
  });
  */

  // API route to get the static tournaments data (and support legacy route)
  const getTournamentsHandler = async (req: any, res: any) => {
    try {
      const parsed = await getTournamentsData();
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

  app.get("/api/tournaments/metadata", requireAuth, async (req, res) => {
    try {
      if (supabase) {
        const { data, error } = await supabase.from("tournaments").select("data").eq("id", "latest");
        if (!error && data && data.length > 0 && data[0].data) {
          const d = data[0].data;
          return res.json({
            lastUpdated: d.lastUpdated || null,
            count: d.tournaments ? d.tournaments.length : 0
          });
        }
      }
      const raw = await fs.readFile(dataPath, "utf-8");
      const parsed = JSON.parse(raw);
      return res.json({
        lastUpdated: parsed.lastUpdated || null,
        count: parsed.tournaments ? parsed.tournaments.length : 0
      });
    } catch (err) {
      console.error("Failed to get tournaments metadata:", err);
      res.status(500).json({ error: "Failed to get metadata" });
    }
  });

  app.get("/api/tournaments-for-players/metadata", requireAuth, async (req, res) => {
    try {
      if (supabase) {
        const { data, error } = await supabase.from("tournaments").select("data").eq("id", "players_cache");
        if (!error && data && data.length > 0 && data[0].data) {
          return res.json({
            updatedAt: data[0].data.updatedAt || null,
            count: data[0].data.tournaments ? data[0].data.tournaments.length : 0
          });
        }
      }
      const raw = await fs.readFile(tournamentsPlayersCachePath, "utf-8");
      const parsed = JSON.parse(raw);
      return res.json({
        updatedAt: parsed.updatedAt || null,
        count: parsed.tournaments ? parsed.tournaments.length : 0
      });
    } catch (err) {
      console.error("Failed to get tournaments-for-players metadata:", err);
      res.status(500).json({ error: "Failed to get metadata" });
    }
  });

  app.post("/api/force-scrape", requireAuth, async (req, res) => {
    if (isScraping) {
      return res.status(400).json({ error: "Scraping already in progress" });
    }
    isScraping = true;
    wrappedRunScraper()
      .then(async () => {
        if (refreshTournamentsForPlayersCache) {
          await refreshTournamentsForPlayersCache().catch(console.error);
        }
      })
      .finally(() => { isScraping = false; });
    res.json({ message: "Scraping started in background" });
  });

  // Google Sheets Proxy Endpoint
  app.post("/api/save-google-sheet", requireAuth, async (req, res) => {
    try {
      const { sheetName, data } = req.body;
      const response = await axios.post("https://script.google.com/macros/s/AKfycbxvoYQvw9S3ctCEuShwtHyZL19IZnu2HeXK7ZQp-HYs5cReS0mvNZL_vid8wifj88vyDg/exec", {
        sheetName,
        data
      }, {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 20000
      });
      res.json({ success: true, response: response.data });
    } catch (err: any) {
      console.error("Error proxying to Google Sheets:", err.message);
      res.status(500).json({ error: "Failed to save to Google Sheets via proxy", details: err.message });
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
      const data = await getTournamentsData();
      const { tournaments } = data;
      
      const limit = pLimit(5);
      const matches: any[] = [];
      const queryParts = getQueryParts(playerName);

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
               isPlayerNameMatch(tPlayerName, queryParts)
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
                const name = $(el).find(".media__title").text().trim();
                // Match if all parts of the query are found in the player's name
                if (isPlayerNameMatch(name, queryParts)) {
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
    const forceRefresh = req.query.refresh === "true";
    try {
      if (forceRefresh) {
        console.log("Forced live update of tournaments-for-players cache...");
        const data = await refreshTournamentsForPlayersCache();
        return res.json(data);
      }

      // Try reading directly from Supabase first
      if (supabase) {
        try {
          const { data: cacheRow, error: cacheErr } = await supabase.from("tournaments").select("data").eq("id", "players_cache");
          if (!cacheErr && cacheRow && cacheRow.length > 0 && cacheRow[0].data) {
            return res.json(cacheRow[0].data);
          } else if (cacheErr) {
            if (cacheErr.message?.includes("Could not find the table") || cacheErr.message?.includes("relation \"public.tournaments\" does not exist")) {
              console.warn("Supabase 'tournaments' table not found, trying local file for player cache instead.");
            } else {
              console.warn("Failed to fetch tournaments-for-players from Supabase, trying local file:", cacheErr.message);
            }
          }
        } catch (supabaseErr: any) {
          console.warn("Supabase query failed in tournaments_for_players, trying local file:", supabaseErr.message || supabaseErr);
        }
      }

      // Try reading from cache file first
      try {
        const cachedContent = await fs.readFile(tournamentsPlayersCachePath, "utf-8");
        return res.json(JSON.parse(cachedContent));
      } catch {
        // If cache doesn't exist, return empty. Do NOT scrape on demand.
        console.log("No cache found for tournaments-for-players. Returning empty...");
        return res.json({ tournaments: [] });
      }
    } catch (error) {
      console.error("Failed to fetch tournaments for players", error);
      res.status(500).json({ error: "Failed to fetch tournaments for players" });
    }
  });

  // --- Global Saved Players Routes ---
  const savedPlayersPath = path.join(process.cwd(), "public", "saved-players.json");

  // Local file recovery from player-snapshots.json if empty
  const recoverLocalPlayersFromSnapshots = async () => {
    try {
      let runRecovery = false;
      try {
        const rawPlayers = await fs.readFile(savedPlayersPath, "utf-8");
        const players = JSON.parse(rawPlayers);
        if (!Array.isArray(players) || players.length === 0) {
          runRecovery = true;
        }
      } catch {
        runRecovery = true;
      }

      if (runRecovery) {
        console.log("[PLAYER RECOVERY] Local saved-players.json is empty or missing. Restoring from player-snapshots.json...");
        const snapshotsPath = path.join(process.cwd(), "public", "player-snapshots.json");
        const snapshotsContent = await fs.readFile(snapshotsPath, "utf-8");
        const snapshots = JSON.parse(snapshotsContent);
        if (Array.isArray(snapshots) && snapshots.length > 0) {
          // Find the latest snapshot that contains players
          const latestSnapshot = snapshots.find(snap => 
            (snap.taPlayers && snap.taPlayers.length > 0) || 
            (snap.hktaPlayers && snap.hktaPlayers.length > 0)
          );
          if (latestSnapshot) {
            const taPlayers = latestSnapshot.taPlayers || [];
            const hktaPlayers = latestSnapshot.hktaPlayers || [];
            const recoveredPlayers = [...taPlayers, ...hktaPlayers];
            if (recoveredPlayers.length > 0) {
              await fs.writeFile(savedPlayersPath, JSON.stringify(recoveredPlayers, null, 2));
              console.log(`[PLAYER RECOVERY] Restored ${recoveredPlayers.length} players from snapshot dated ${latestSnapshot.date}`);
            }
          }
        }
      }
    } catch (recoveryErr: any) {
      console.error("[PLAYER RECOVERY] Failed to recover players:", recoveryErr.message);
    }
  };

  // Automatic migration/sync on startup: Local file -> Supabase
  const syncLocalToSupabase = async () => {
    // Attempt recovery first if local file was cleared
    await recoverLocalPlayersFromSnapshots();
    
    if (!supabase) return;
    try {
      // 1. Sync saved players
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

      // 2. Sync tournaments database rows (latest & players_cache)
      try {
        const { data: existingTours, error: toursErr } = await supabase
          .from("tournaments")
          .select("id");

        if (!toursErr) {
          const existingIds = new Set((existingTours || []).map((t: any) => t.id));

          if (!existingIds.has("latest")) {
            console.log("Supabase tournaments table is missing 'latest' row. Syncing local tournaments.json...");
            try {
              const rawTours = await fs.readFile(dataPath, "utf-8");
              const parsedTours = JSON.parse(rawTours);
              await supabase.from("tournaments").insert({ id: "latest", data: parsedTours });
              console.log("Successfully seeded 'latest' tournaments to Supabase.");
            } catch (fsErr) {
              console.warn("Could not seed local tournaments.json:", fsErr);
            }
          }

          if (!existingIds.has("players_cache")) {
            console.log("Supabase tournaments table is missing 'players_cache' row. Syncing local tournaments-players-cache.json...");
            try {
              const rawCache = await fs.readFile(tournamentsPlayersCachePath, "utf-8");
              const parsedCache = JSON.parse(rawCache);
              await supabase.from("tournaments").insert({ id: "players_cache", data: parsedCache });
              console.log("Successfully seeded 'players_cache' to Supabase.");
            } catch (fsErr) {
              console.warn("Could not seed local tournaments-players-cache.json:", fsErr);
            }
          }
        }
      } catch (toursSetupErr: any) {
        console.warn("Could not sync tournaments setup to Supabase:", toursSetupErr.message || toursSetupErr);
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
          if (error.message.includes("Could not find the table")) {
            console.log("Supabase 'saved_players' table not found yet. Using local files fallback.");
          } else {
            console.log("Failed to get players from Supabase, falling back to local files:", error.message);
          }
          throw error;
        }

        if (data && data.length > 0) {
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
        } else {
          // Table queried successfully but returned empty. Fall back to local backup.
          try {
            const localRaw = await fs.readFile(savedPlayersPath, "utf-8");
            players = JSON.parse(localRaw);
          } catch {
            players = [];
          }
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

  const takePlayerSnapshot = async (playersList?: any[]) => {
    try {
      const players = playersList || await getSavedPlayers(null, null);
      if (!players || players.length === 0) return;

      const timestamp = new Date().toISOString();
      const date = timestamp.split('T')[0];

      const taPlayers = players.filter((p: any) => p.source === 'TA').map((p: any) => ({
        id: p.id,
        url: p.url,
        name: p.name,
        rank: p.rank || '-',
        points: p.points || '-',
        source: p.source || 'TA',
        utrSingles: p.utrSingles || p.utr_singles || '-',
        winLossYTD: p.winLossYTD || p.win_loss_ytd || '-',
        winLossCareer: p.winLossCareer || p.win_loss_career || '-',
        championships: p.championships || '-',
      }));

      const hktaPlayers = players.filter((p: any) => p.source === 'HKTA').map((p: any) => ({
        id: p.id,
        url: p.url,
        name: p.name,
        rank: p.rank || '-',
        points: p.points || '-',
        source: p.source || 'HKTA',
        utrSingles: p.utrSingles || p.utr_singles || '-',
        winLossYTD: p.winLossYTD || p.win_loss_ytd || '-',
        winLossCareer: p.winLossCareer || p.win_loss_career || '-',
        championships: p.championships || '-',
      }));

      const snapshotsPath = path.join(process.cwd(), "public", "player-snapshots.json");
      let snapshots: any[] = [];
      try {
        const fileContent = await fs.readFile(snapshotsPath, "utf-8");
        snapshots = JSON.parse(fileContent);
      } catch (err) {
        try {
          const resp = await axios.get('https://jc-tournament-planner-569341375821.us-west1.run.app/api/player-snapshots', { timeout: 4000 });
          if (Array.isArray(resp.data)) {
            snapshots = resp.data;
          }
        } catch {
          snapshots = [];
        }
      }

      const existingIndex = snapshots.findIndex((s: any) => s.date === date);
      const newSnapshot = {
        date,
        timestamp,
        taPlayers,
        hktaPlayers
      };

      if (existingIndex !== -1) {
        snapshots[existingIndex] = newSnapshot;
      } else {
        snapshots.unshift(newSnapshot);
      }

      await fs.writeFile(snapshotsPath, JSON.stringify(snapshots, null, 2));
      console.log(`[Snapshot] Daily snap taken for ${date}. Counts TA: ${taPlayers.length}, HKTA: ${hktaPlayers.length}`);
    } catch (err: any) {
      console.log("[Snapshot] Failed to take daily snapshot:", err.message || err);
    }
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

    // Trigger taking a daily player snapshots history entry
    takePlayerSnapshot(players).catch(() => {});
  };

  refreshTournamentsForPlayersCache = async () => {
    try {
      console.log("Refreshing tournaments-for-players cache...");
      const savedPlayers = await getSavedPlayers(null, null);
      if (!savedPlayers || savedPlayers.length === 0) {
        await fs.writeFile(tournamentsPlayersCachePath, JSON.stringify({ tournaments: [] }, null, 2));
        return { tournaments: [] };
      }

      const data = await getTournamentsData();
      const { tournaments } = data;

      // Filter tournaments to only active ones starting within the next 60 days (or still currently running)
      const futureTournaments = tournaments.filter((t: any) => {
        if (!t.dates) return false;
        const parts = t.dates.split(' to ');
        
        // End date parsing to ensure it's not in the past
        const endDateParts = parts[parts.length - 1].trim().split('/');
        if (endDateParts.length < 3) return false;
        const endDate = new Date(parseInt(endDateParts[2]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[0]));
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (endDate < today) return false;

        // Start date parsing to limit search space to next 60 days
        const startDateParts = parts[0].trim().split('/');
        if (startDateParts.length < 3) return false;
        const startDate = new Date(parseInt(startDateParts[2]), parseInt(startDateParts[1]) - 1, parseInt(startDateParts[0]));
        
        const limitDate = new Date();
        limitDate.setDate(today.getDate() + 60);
        
        return startDate <= limitDate;
      });

      const limit = pLimit(5);
      const results: any[] = [];
      const searchTasks: any[] = [];

      for (const tournament of futureTournaments) {
        // Find which savedPlayers are likely in this tournament
        const likelyPlayers = savedPlayers.filter((player: any) => {
          if (tournament.source === "HK" && player.source !== "HKTA") return false;
          if (tournament.source === "AUS" && player.source !== "TA") return false;

          // If we have pre-scraped players, filter.
          if (tournament.players && tournament.players.length > 0) {
            const queryParts = getQueryParts(player.name);
            return tournament.players.some((tPlayerName: string) => 
               isPlayerNameMatch(tPlayerName, queryParts)
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
                const queryParts = getQueryParts(player.name);

                const quickMatch = queryParts.every(part => dataLower.includes(part));

                if (quickMatch) {
                  let playerDetailLink = "";

                  $("li.js-alphabet-list-item").each((i, el) => {
                    const name = $(el).find(".media__title").text().trim();
                    if (isPlayerNameMatch(name, queryParts)) {
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

      const outputData = { tournaments: results, updatedAt: new Date().toISOString() };
      await fs.writeFile(tournamentsPlayersCachePath, JSON.stringify(outputData, null, 2));
      console.log("Cached tournaments-for-players list updated successfully.");
      
      if (supabase) {
        try {
          await supabase.from("tournaments").upsert({ id: "players_cache", data: outputData });
          console.log("Successfully backed up tournaments-for-players cache to Supabase.");
        } catch (e: any) {
           console.error("Failed to backup players cache to Supabase:", e.message);
        }
      }

      return outputData;
    } catch (error) {
      console.error("Failed to build tournaments-for-players cache", error);
      throw error;
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

  function parseAndFormatDate(dateStr: string, tournamentName?: string): string {
    if (!dateStr) return '';
    let str = decodeURIComponent(dateStr).trim();
    
    // Extract year
    let year = '';
    // Check if string contains 4-digit year starting with 20
    const yearInStrMatch = str.match(/\b(20[2-9][0-9])\b/);
    if (yearInStrMatch) {
      year = yearInStrMatch[1];
      // Remove year from str for easier parsing
      str = str.replace(year, '').replace(/,\s*$/, '').trim();
    } else if (tournamentName) {
      const yearInTNameMatch = tournamentName.match(/\b(20[2-9][0-9])\b/);
      if (yearInTNameMatch) {
        year = yearInTNameMatch[1];
      }
    }
    
    if (!year) {
      year = new Date().getFullYear().toString();
    }

    // Strip trailing slashes that can remain from previous year stripping or raw data
    str = str.replace(/\/+(\s|$)/g, '$1').trim();

    // Normalize separators: replace 'to', '-', '–', '—' with ' - '
    str = str.replace(/\s*(to|–|—|-)\s*/gi, ' - ');
    
    // If it's a numeric date like dd/mm/yyyy (or just dd/mm after year strip)
    const dmyMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})(?:[\/\.-](\d{2,4}))?$/);
    if (dmyMatch) {
      const d = parseInt(dmyMatch[1], 10);
      const m = parseInt(dmyMatch[2], 10);
      const y = dmyMatch[3] ? (dmyMatch[3].length === 2 ? '20' + dmyMatch[3] : dmyMatch[3]) : year;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (m >= 1 && m <= 12) {
        return `${d} ${months[m - 1]} ${y}`;
      }
    }

    // If it's numeric date range like "dd/mm/yyyy - dd/mm/yyyy"
    const dmyRangeMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})\s*-\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
    if (dmyRangeMatch) {
      const d1 = parseInt(dmyRangeMatch[1], 10);
      const m1 = parseInt(dmyRangeMatch[2], 10);
      const y1 = dmyRangeMatch[3].length === 2 ? '20' + dmyRangeMatch[3] : dmyRangeMatch[3];
      const d2 = parseInt(dmyRangeMatch[4], 10);
      const m2 = parseInt(dmyRangeMatch[5], 10);
      const y2 = dmyRangeMatch[6].length === 2 ? '20' + dmyRangeMatch[6] : dmyRangeMatch[6];
      
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (m1 >= 1 && m1 <= 12 && m2 >= 1 && m2 <= 12) {
        if (m1 === m2 && y1 === y2) {
          return `${d1} - ${d2} ${months[m1 - 1]} ${y1}`;
        } else {
          return `${d1} ${months[m1 - 1]} - ${d2} ${months[m2 - 1]} ${y2}`;
        }
      }
    }

    // If it's numeric range like "dd/mm - dd/mm" (month as number, since year was stripped)
    const dmRangeMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})\s*-\s*(\d{1,2})[\/\.-](\d{1,2})$/);
    if (dmRangeMatch) {
      const d1 = parseInt(dmRangeMatch[1], 10);
      const m1 = parseInt(dmRangeMatch[2], 10);
      const d2 = parseInt(dmRangeMatch[3], 10);
      const m2 = parseInt(dmRangeMatch[4], 10);
      
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (m1 >= 1 && m1 <= 12 && m2 >= 1 && m2 <= 12) {
        if (m1 === m2) {
          return `${d1} - ${d2} ${months[m1 - 1]} ${year}`;
        } else {
          return `${d1} ${months[m1 - 1]} - ${d2} ${months[m2 - 1]} ${year}`;
        }
      }
    }

    const monthsMap: Record<string, string> = {
      jan: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', may: 'May', jun: 'Jun',
      jul: 'Jul', aug: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec',
      january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr', june: 'Jun',
      july: 'Jul', august: 'Aug', september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec'
    };

    const getMonthAbbrev = (mStr: string): string => {
      const key = mStr.toLowerCase().trim();
      return monthsMap[key] || mStr;
    };

    // Check for formats like "21 - 22 Jun" or "21-22 Jun"
    const dayDayMonthMatch = str.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+([a-zA-Z]{3,10})$/i);
    if (dayDayMonthMatch) {
      const d1 = dayDayMonthMatch[1];
      const d2 = dayDayMonthMatch[2];
      const m = getMonthAbbrev(dayDayMonthMatch[3]);
      return `${d1} - ${d2} ${m} ${year}`;
    }

    // Check for formats like "Jun 21-22" or "Jun 21 - 22"
    const monthDayDayMatch = str.match(/^([a-zA-Z]{3,10})\s+(\d{1,2})\s*-\s*(\d{1,2})$/i);
    if (monthDayDayMatch) {
      const m = getMonthAbbrev(monthDayDayMatch[1]);
      const d1 = monthDayDayMatch[2];
      const d2 = monthDayDayMatch[3];
      return `${d1} - ${d2} ${m} ${year}`;
    }

    // Check for formats like "5 Jun - 8 Jun"
    const dayMonthDayMonthMatch = str.match(/^(\d{1,2})\s+([a-zA-Z]{3,10})\s*-\s*(\d{1,2})\s+([a-zA-Z]{3,10})$/i);
    if (dayMonthDayMonthMatch) {
      const d1 = dayMonthDayMonthMatch[1];
      const m1 = getMonthAbbrev(dayMonthDayMonthMatch[2]);
      const d2 = dayMonthDayMonthMatch[3];
      const m2 = getMonthAbbrev(dayMonthDayMonthMatch[4]);
      if (m1 === m2) {
        return `${d1} - ${d2} ${m1} ${year}`;
      }
      return `${d1} ${m1} - ${d2} ${m2} ${year}`;
    }

    // Check for format "21 Jun"
    const dayMonthMatch = str.match(/^(\d{1,2})\s+([a-zA-Z]{3,10})$/i);
    if (dayMonthMatch) {
      const d = dayMonthMatch[1];
      const m = getMonthAbbrev(dayMonthMatch[2]);
      return `${d} ${m} ${year}`;
    }

    // Check for format "Jun 21"
    const monthDayMatch = str.match(/^([a-zA-Z]{3,10})\s+(\d{1,2})$/i);
    if (monthDayMatch) {
      const m = getMonthAbbrev(monthDayMatch[1]);
      const d = monthDayMatch[2];
      return `${d} ${m} ${year}`;
    }

    // Fallback: simple cleanup
    let finalStr = str;
    for (const [full, abbrev] of Object.entries(monthsMap)) {
      if (full.length > 3) {
        finalStr = finalStr.replace(new RegExp(`\\b${full}\\b`, 'gi'), abbrev);
      }
    }

    if (finalStr && !finalStr.includes(year)) {
      return `${finalStr} ${year}`;
    }

    return finalStr || '';
  }

  function normalizeDrawName(name: string): string {
    if (!name) return 'Saved Draw';
    let cleaned = name.trim();
    
    // Split by hyphen variations
    let parts = cleaned.split(/\s+[-–—]\s+/).map(p => p.trim()).filter(Boolean);
    
    // Deduplicate consecutive identical parts
    let uniqueParts: string[] = [];
    for (const part of parts) {
      if (uniqueParts.length === 0 || uniqueParts[uniqueParts.length - 1].toLowerCase() !== part.toLowerCase()) {
        uniqueParts.push(part);
      }
    }
    
    cleaned = uniqueParts.join(' - ');

    // Deduplicate wrap-around/duplicate at the end
    // e.g. "Some Tournament Name - BS U10 Some Tournament Name"
    for (let len = 5; len < cleaned.length / 2; len++) {
      const suffix = cleaned.substring(cleaned.length - len);
      const prefix = cleaned.substring(0, len);
      if (suffix.toLowerCase() === prefix.toLowerCase()) {
        const remaining = cleaned.substring(0, cleaned.length - len).trim().replace(/[-–—\s]+$/, '').trim();
        if (remaining.toLowerCase().startsWith(prefix.toLowerCase())) {
          let eventPart = remaining.substring(prefix.length).trim().replace(/^[-–—\s]+/, '').trim();
          if (eventPart) {
            return `${prefix} - ${eventPart}`;
          }
        }
      }
    }

    return cleaned;
  }

  function normalizeUrl(urlStr: string): string {
    if (!urlStr) return '';
    return urlStr.split('#')[0].toLowerCase().trim();
  }

  const getSavedDraws = async (req: any, res: any) => {
    let draws: any[] = [];
    let updatedAt: string = new Date().toISOString();

    // Load tournaments for lazy date lookup
    let cachedTournaments: any[] = [];
    try {
      const data = await getTournamentsData();
      cachedTournaments = data.tournaments || [];
    } catch (err) {
      console.warn("Could not load tournaments data for metadata lookup", err);
    }

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

        if (data && data.length > 0) {
          draws = data.map((row: any) => ({
            id: row.id,
            name: row.name,
            url: row.url,
            region: row.region || "AUS",
            players: row.players || [],
            sort_order: row.sort_order ?? undefined,
          }));
          updatedAt = new Date().toISOString();
        } else {
          // Table queried successfully but returned empty. Fall back to local backup.
          try {
            const raw = await fs.readFile(savedDrawsPath, "utf-8");
            const parsed = JSON.parse(raw);
            draws = parsed.draws || [];
            updatedAt = parsed.updatedAt || updatedAt;
          } catch {
            draws = [];
          }
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

    // Clean up, format event names, and backfill dates
    let hasChanges = false;
    const formattedDraws = draws.map((draw: any) => {
      let updatedDraw = { ...draw };
      
      // Clean up draw name
      const normalizedName = normalizeDrawName(updatedDraw.name);
      if (normalizedName !== updatedDraw.name) {
        updatedDraw.name = normalizedName;
        hasChanges = true;
      }

      // Check if URL has a date, otherwise try to lookup from cachedTournaments
      let urlWithHash = updatedDraw.url || '';
      let baseUrl = urlWithHash.split('#')[0];
      let hash = urlWithHash.split('#')[1] || '';
      let dateFromUrl = '';
      
      const dateMatch = hash.match(/date=(.*)$/i);
      if (dateMatch) {
        dateFromUrl = decodeURIComponent(dateMatch[1]);
      } else {
        // Try to match tournament ID in cachedTournaments
        const idMatch = baseUrl.match(/id=([a-zA-Z0-9\-]+)/i);
        if (idMatch) {
          const idValue = idMatch[1].toLowerCase();
          const matchedTournament = cachedTournaments.find((t: any) => {
            if (!t.link) return false;
            const tMatch = t.link.match(/id=([a-zA-Z0-9\-]+)/i);
            return tMatch && tMatch[1].toLowerCase() === idValue;
          });
          if (matchedTournament && matchedTournament.dates) {
            dateFromUrl = matchedTournament.dates;
          }
        }
      }

      // Process and format the date
      if (dateFromUrl) {
        const parsedDate = parseAndFormatDate(dateFromUrl, updatedDraw.name);
        if (parsedDate) {
          const newUrl = `${baseUrl}#date=${encodeURIComponent(parsedDate)}`;
          if (newUrl !== updatedDraw.url) {
            updatedDraw.url = newUrl;
            hasChanges = true;
          }
        }
      }

      return updatedDraw;
    });

    // Deduplicate draws by normalized URL, preferring URLs with #date=
    const uniqueDrawsMap = new Map();
    for (const draw of formattedDraws) {
      if (!draw.url) continue;
      const key = normalizeUrl(draw.url);
      const existing = uniqueDrawsMap.get(key);
      if (!existing || (!existing.url.includes('#date=') && draw.url.includes('#date='))) {
        uniqueDrawsMap.set(key, draw);
      }
    }
    
    const finalDraws = Array.from(uniqueDrawsMap.values());
    
    // If we changed names or backfilled dates, save the cleaned-up list!
    if (hasChanges || finalDraws.length !== draws.length) {
      try {
        await fs.writeFile(savedDrawsPath, JSON.stringify({ draws: finalDraws, updatedAt }, null, 2));
        if (supabase) {
          const rows = finalDraws.map((d: any, index: number) => ({
            id: d.id,
            name: d.name,
            url: d.url,
            region: d.region || "AUS",
            players: d.players || [],
            sort_order: d.sort_order !== undefined ? d.sort_order : index,
            updated_at: updatedAt,
          }));
          await supabase.from("saved_draws").upsert(rows);
        }
      } catch (e) {
        console.error("Failed to persist normalized draws on lookup:", e);
      }
    }

    return { draws: finalDraws, updatedAt };
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
    let { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "Draw URL is required" });
    }

    try {
      let resolvedUrl = url;
      let drawRes: any;
      let isPreFetched = false;

      // Auto-resolve event.aspx links in tournament software (which are container events, not draw pages)
      if (url.includes('event.aspx')) {
        try {
          console.log(`[check-draw] Detected event.aspx container URL: ${url}. Fetching event page to check for direct players...`);
          const eventPageRes = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 10000
          });
          const $eventPage = cheerio.load(eventPageRes.data);
          
          // Verify if there are direct player links on this event page
          const directPlayersCount = $eventPage('a[href*="player.aspx?"], a[href*="/player/"]')
            .filter((_, el) => {
              const href = $eventPage(el).attr('href') || '';
              return !href.includes('/player-profile/');
            }).length;

          if (directPlayersCount > 0) {
            console.log(`[check-draw] Found ${directPlayersCount} players directly on ${url}. Skipping resolution.`);
            drawRes = eventPageRes;
            isPreFetched = true;
          } else {
            console.log(`[check-draw] 0 players found on event.aspx. Seeking a specific sub-draw link...`);
            let drawLink = '';
            
            // Look for any links containing "draw.aspx?" or "/draw/" but NOT "draws.aspx" (which is the main draws index)
            $eventPage('a[href*="draw.aspx?"], a[href*="/draw/"]').each((_, el) => {
              const href = $eventPage(el).attr('href') || '';
              if (href && !href.toLowerCase().includes('draws.aspx')) {
                drawLink = href;
                return false; // Break
              }
            });
            
            if (drawLink) {
              const domain = url.includes("hkta") ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
              if (!drawLink.startsWith('http')) {
                if (drawLink.startsWith('/')) {
                  resolvedUrl = `https://${domain}${drawLink}`;
                } else {
                  resolvedUrl = `https://${domain}/sport/${drawLink}`;
                }
              } else {
                resolvedUrl = drawLink;
              }
              url = resolvedUrl;
              console.log(`[check-draw] Successfully auto-resolved event.aspx to sub-draw: ${url}`);
            } else {
              console.log(`[check-draw] No specific draw link found for event page.`);
            }
          }
        } catch (eventErr: any) {
          console.warn("[check-draw] Failed to pre-fetch event.aspx for auto-draw-resolution:", eventErr.message);
        }
      }

      if (!isPreFetched) {
        drawRes = await axios.get(resolvedUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          timeout: 10000
        });
      }

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
      let drawNameCandidate = '';
      const pageTitle = $('title').text().trim();
      if (pageTitle.includes(' - Draws - ')) {
        drawNameCandidate = pageTitle.split(' - Draws - ')[1];
      } else if (pageTitle.includes(' - Draw - ')) {
        drawNameCandidate = pageTitle.split(' - Draw - ')[1];
      } else if (pageTitle.includes(' - Event - ')) {
        drawNameCandidate = pageTitle.split(' - Event - ')[1];
      } else if (pageTitle.includes(' - Matches - ')) {
        drawNameCandidate = pageTitle.split(' - Matches - ')[1];
      }

      if (!drawNameCandidate) {
        // Fallback to h2 or first media title
        drawNameCandidate = $("h2").first().text().trim() || $(".media__title").first().text().trim();
        if (drawNameCandidate.includes('- Draws - ')) {
          drawNameCandidate = drawNameCandidate.split('- Draws - ')[1];
        } else if (drawNameCandidate.includes('- Draw - ')) {
          drawNameCandidate = drawNameCandidate.split('- Draw - ')[1];
        }
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
          
          // Try to find an item that contains a date pattern
          const dateRegexes = [
            /\d{1,2}\/\d{1,2}\/\d{4}/,       // DD/MM/YYYY
            /\d{4}-\d{1,2}-\d{1,2}/,       // YYYY-MM-DD
            /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,  // 12 Jan
            /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i   // Jan 12
          ];
          
          let foundDate = false;
          for (const item of items) {
            if (dateRegexes.some(rx => rx.test(item))) {
              tournamentDate = item;
              foundDate = true;
              break;
            }
          }
          
          // Fallback if no specific date pattern found but items exist
          if (!foundDate && items.length > 1 && !items[1].includes("GMT") && !items[1].toLowerCase().includes("entries")) {
            tournamentDate = items[1];
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

  // --- Notifications History & Changes Tracking ---
  const notificationsHistoryPath = path.join(process.cwd(), "public", "notifications-history.json");

  function getPlayerChanges(oldPlayer: any, newPlayer: any): any[] {
    const changes: any[] = [];
    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0];
    const source = newPlayer.source || oldPlayer.source || 'TA';
    const player = newPlayer.name;

    // 1. UTR Changes
    if (oldPlayer.utrSingles && newPlayer.utrSingles && oldPlayer.utrSingles !== '-' && newPlayer.utrSingles !== '-' && oldPlayer.utrSingles !== newPlayer.utrSingles) {
      changes.push({
        id: `${player}-UTR-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        player,
        title: `${player} - UTR Changed`,
        body: `UTR singles changed from ${oldPlayer.utrSingles} to ${newPlayer.utrSingles}`,
        type: 'UTR',
        source,
        date,
        timestamp
      });
    }

    // WTN Changes (maps to UTR filter type in UI)
    if (oldPlayer.wtnSingles && newPlayer.wtnSingles && oldPlayer.wtnSingles !== '-' && newPlayer.wtnSingles !== '-' && oldPlayer.wtnSingles !== newPlayer.wtnSingles) {
      changes.push({
        id: `${player}-WTN-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        player,
        title: `${player} - WTN Changed`,
        body: `WTN singles changed from ${oldPlayer.wtnSingles} to ${newPlayer.wtnSingles}`,
        type: 'UTR',
        source,
        date,
        timestamp
      });
    }

    // 2. Points Changes
    if (oldPlayer.points && newPlayer.points && oldPlayer.points !== '-' && newPlayer.points !== '-' && oldPlayer.points !== newPlayer.points) {
      changes.push({
        id: `${player}-Points-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        player,
        title: `${player} - Points Changed`,
        body: `Points changed from ${oldPlayer.points} to ${newPlayer.points}`,
        type: 'Points',
        source,
        date,
        timestamp
      });
    }

    // 3. Rank Changes
    if (oldPlayer.rank && newPlayer.rank && oldPlayer.rank !== '-' && newPlayer.rank !== '-' && oldPlayer.rank !== newPlayer.rank) {
      changes.push({
        id: `${player}-Rank-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        player,
        title: `${player} - Rank Changed`,
        body: `Rank changed from ${oldPlayer.rank} to ${newPlayer.rank}`,
        type: 'Rank',
        source,
        date,
        timestamp
      });
    }

    // 4. WinLoss YTD Changes
    if (oldPlayer.winLossYTD && newPlayer.winLossYTD && oldPlayer.winLossYTD !== '-' && newPlayer.winLossYTD !== '-' && oldPlayer.winLossYTD !== newPlayer.winLossYTD) {
      changes.push({
        id: `${player}-WinLossYTD-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        player,
        title: `${player} - YTD Win-Loss Changed`,
        body: `YTD Win-Loss changed from ${oldPlayer.winLossYTD} to ${newPlayer.winLossYTD}`,
        type: 'WinLoss',
        source,
        date,
        timestamp
      });
    }

    // 5. WinLoss Career Changes
    if (oldPlayer.winLossCareer && newPlayer.winLossCareer && oldPlayer.winLossCareer !== '-' && newPlayer.winLossCareer !== '-' && oldPlayer.winLossCareer !== newPlayer.winLossCareer) {
      changes.push({
        id: `${player}-WinLossCareer-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        player,
        title: `${player} - Career Win-Loss Changed`,
        body: `Career Win-Loss changed from ${oldPlayer.winLossCareer} to ${newPlayer.winLossCareer}`,
        type: 'WinLoss',
        source,
        date,
        timestamp
      });
    }

    // 6. Championships Changes
    if (oldPlayer.championships && newPlayer.championships && oldPlayer.championships !== '-' && newPlayer.championships !== '-' && oldPlayer.championships !== newPlayer.championships) {
      changes.push({
        id: `${player}-Championships-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        player,
        title: `${player} - Championships Updated`,
        body: `Championships updated:\nFrom:\n${oldPlayer.championships}\n\nTo:\n${newPlayer.championships}`,
        type: 'Championships',
        source,
        date,
        timestamp
      });
    }

    return changes;
  }

  const getNotificationsHistory = async (req: any, res: any) => {
    let notifications: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("notifications_history")
          .select("*")
          .order("timestamp", { ascending: false });

        if (error) {
          if (error.message.includes("Could not find the table")) {
            console.log("Supabase 'notifications_history' table not found yet. Using local files fallback.");
          } else {
            console.log("Failed to get notifications from Supabase, falling back to local files:", error.message);
          }
          throw error;
        }

        if (data) {
          notifications = data.map((row: any) => ({
            id: row.id,
            player: row.player,
            title: row.title,
            body: row.body,
            type: row.type,
            source: row.source,
            date: row.date,
            timestamp: row.timestamp || row.created_at,
          }));
        }
      } catch (err) {
        try {
          const data = await fs.readFile(notificationsHistoryPath, "utf-8");
          notifications = JSON.parse(data);
        } catch {
          notifications = [];
        }
      }
    } else {
      try {
        const data = await fs.readFile(notificationsHistoryPath, "utf-8");
        notifications = JSON.parse(data);
      } catch {
        notifications = [];
      }
    }
    return notifications;
  };

  const saveNotificationsHistory = async (req: any, res: any, notifications: any[]) => {
    try {
      await fs.writeFile(notificationsHistoryPath, JSON.stringify(notifications, null, 2));
    } catch (e: any) {
      console.log("Error writing notifications local backup:", e.message || String(e));
    }

    if (supabase) {
      try {
        const rows = notifications.map((n: any) => ({
          id: n.id,
          player: n.player,
          title: n.title,
          body: n.body,
          type: n.type,
          source: n.source,
          date: n.date,
          timestamp: n.timestamp,
        }));

        const { error } = await supabase
          .from("notifications_history")
          .upsert(rows, { onConflict: "id" });

        if (error) {
          if (error.message.includes("Could not find the table")) {
            console.log("Supabase 'notifications_history' table not found. Skipping Supabase backup (local save succeeded).");
          } else if (error.code === '42501' || error.message.includes("row-level security")) {
            console.log("Supabase RLS is blocking notifications insert. Please run 'alter table public.notifications_history disable row level security;' in your Supabase SQL editor. Local fallback used successfully.");
          } else {
            console.log("Supabase notifications write warning:", error.message);
          }
        }
      } catch (err: any) {
        console.log("Supabase notifications write failed:", err.message || err);
      }
    }
  };

  // Sync notifications from local file -> Supabase on startup
  const syncLocalNotificationsToSupabase = async () => {
    if (!supabase) return;
    try {
      const { count, error } = await supabase
        .from("notifications_history")
        .select("id", { count: "exact", head: true });

      if (error) {
        if (error.message.includes("Could not find the table")) {
          console.log("Supabase 'notifications_history' table is not available yet. Using local backup storage.");
        } else {
          console.log("Could not inspect notifications_history table in Supabase:", error.message);
        }
        return;
      }

      if (count === 0 || count === null) {
        console.log("Supabase notifications_history table is empty. Syncing local notifications...");
        try {
          const rawData = await fs.readFile(notificationsHistoryPath, "utf-8");
          const localNotifications = JSON.parse(rawData);
          if (localNotifications && localNotifications.length > 0) {
            const rows = localNotifications.map((n: any) => ({
              id: n.id,
              player: n.player,
              title: n.title,
              body: n.body,
              type: n.type,
              source: n.source,
              date: n.date,
              timestamp: n.timestamp,
            }));

            const { error: upsertError } = await supabase
              .from("notifications_history")
              .upsert(rows, { onConflict: "id" });

            if (upsertError) {
              if (upsertError.code === '42501' || upsertError.message.includes("row-level security")) {
                console.log("Supabase RLS is blocking migration. Please run 'alter table public.notifications_history disable row level security;' in your SQL editor.");
              } else {
                console.log("Failed to migrate local notifications to Supabase warning:", upsertError.message);
              }
            } else {
              console.log(`Successfully migrated ${localNotifications.length} notifications to Supabase!`);
            }
          }
        } catch (fsErr) {
          // Local file might not exist yet, which is fine
        }
      }
    } catch (err: any) {
      console.log("Could not sync local notifications to Supabase:", err.message || err);
    }
  };

  syncLocalNotificationsToSupabase();

  // Seed daily snapshot on server startup
  takePlayerSnapshot().catch((err) => {
    console.error("Startup snapshot trigger error:", err);
  });

  app.get("/api/saved-players", requireAuth, async (req, res) => {
    const players = await getSavedPlayers(req, res);
    res.json(players);
  });

  app.get("/api/player-snapshots", requireAuth, async (req, res) => {
    const snapshotsPath = path.join(process.cwd(), "public", "player-snapshots.json");
    try {
      let snapshots: any[] = [];
      try {
        const fileContent = await fs.readFile(snapshotsPath, "utf-8");
        snapshots = JSON.parse(fileContent);
      } catch (err) {
        // Bootstrap by fetching from the live reference app
        try {
          const resp = await axios.get('https://jc-tournament-planner-569341375821.us-west1.run.app/api/player-snapshots', { timeout: 3500 });
          if (Array.isArray(resp.data)) {
            snapshots = resp.data;
            // Save local cache so we don't have to fetch next time
            await fs.writeFile(snapshotsPath, JSON.stringify(snapshots, null, 2));
          }
        } catch (fetchErr: any) {
          console.log("[snapshots] Seeding snapshot data completed cleanly.");
          snapshots = [];
        }
      }
      res.json(snapshots);
    } catch (err: any) {
      console.error("Failed to fetch player snapshots:", err);
      res.status(500).json({ error: "Failed to fetch player snapshots" });
    }
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
      
      const newChanges = getPlayerChanges(p, updatedPlayer);
      if (newChanges.length > 0) {
        let notifications = [];
        try {
          notifications = await getNotificationsHistory(req, res);
        } catch (e) {}
        notifications = [...newChanges, ...notifications];
        await saveNotificationsHistory(req, res, notifications);
      }

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
      const existingIndex = draws.findIndex((d: any) => normalizeUrl(d.url) === normalizeUrl(url));
      
      let finalUrl = url;
      if (existingIndex >= 0) {
        // Preserve #date= if the new URL doesn't have it but the existing one does
        const existingUrl = draws[existingIndex].url;
        if (!finalUrl.includes('#date=') && existingUrl.includes('#date=')) {
          finalUrl = existingUrl;
        }
      }

      let drawAlerts: any[] = [];
      if (existingIndex >= 0) {
        const existingDraw = draws[existingIndex];
        if (Array.isArray(existingDraw.players) && existingDraw.players.length > 0 && Array.isArray(players) && players.length > 0) {
          const existingNames = new Set(existingDraw.players.map((p: any) => (p.name || '').toLowerCase().trim()));
          const newPlayersInDraw = players.filter((p: any) => p.name && !existingNames.has(p.name.toLowerCase().trim()));
          
          if (newPlayersInDraw.length > 0) {
            console.log(`[Draw Watcher] Found ${newPlayersInDraw.length} new players in draw "${name}"`);
            for (const p of newPlayersInDraw) {
              const utrStr = p.utrSingles && p.utrSingles !== "-" ? `(UTR: ${p.utrSingles})` : "";
              const wtnStr = p.wtnSingles && p.wtnSingles !== "-" ? `(WTN: ${p.wtnSingles})` : "";
              const statsStr = [utrStr, wtnStr].filter(Boolean).join(" ");
              
              drawAlerts.push({
                id: `draw-watcher-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                player: p.name,
                title: `New Player in Draw`,
                body: `${p.name} ${statsStr} has joined the draw "${name}".`,
                type: 'Draw_Watcher',
                source: p.source || 'TA',
                date: new Date().toISOString().split('T')[0],
                timestamp: new Date().toISOString(),
                url: `/#saved-draws`
              });
            }
          }
        }
      }

      const newDraw = {
        id: existingIndex >= 0 ? draws[existingIndex].id : (Date.now().toString() + Math.random().toString(36).substring(7)),
        name,
        url: finalUrl,
        region: region || "AUS",
        players: players || [],
        sort_order: existingIndex >= 0 ? (draws[existingIndex].sort_order !== undefined ? draws[existingIndex].sort_order : existingIndex) : draws.length
      };

      if (existingIndex >= 0) {
        draws[existingIndex] = newDraw;
      } else {
        draws.push(newDraw);
      }

      await saveSavedDraws(req, res, draws);

      if (drawAlerts.length > 0) {
        try {
          const existingNotifications = await getNotificationsHistory(req, res);
          const merged = [...drawAlerts, ...existingNotifications];
          await saveNotificationsHistory(req, res, merged);
          console.log(`[Draw Watcher] Saved ${drawAlerts.length} new draw alerts to notification history.`);
        } catch (alertErr: any) {
          console.error("Failed to append draw-watcher alerts:", alertErr.message);
        }
      }

      const currentData = await getSavedDraws(req, res);
      res.json(currentData);
    } catch (error) {
      console.error("Failed to save draw:", error);
      res.status(500).json({ error: "Failed to save draw" });
    }
  });

  app.delete("/api/saved-draws/:id", requireAuth, async (req, res) => {
    const { id } = req.params;

    const { draws } = await getSavedDraws(req, res);
    const drawToDelete = draws.find((d: any) => d.id === id);

    if (supabase) {
      try {
        await supabase.from("saved_draws").delete().eq("id", id);
        if (drawToDelete) {
          // Also delete by URL to make sure we remove any other duplicates in Supabase
          await supabase.from("saved_draws").delete().eq("url", drawToDelete.url);
        }
      } catch (err: any) {
        console.error("Error deleting from Supabase database:", err.message || err);
      }
    }

    const filteredDraws = draws.filter((d: any) => d.id !== id && (!drawToDelete || normalizeUrl(d.url) !== normalizeUrl(drawToDelete.url)));
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
    const { players, tournamentDate } = req.body;
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
      
      // If we got a tournamentDate and the existing URL doesn't have a date hash, append it
      if (tournamentDate && !draws[drawIndex].url.includes('#date=')) {
        draws[drawIndex].url += `#date=${encodeURIComponent(tournamentDate)}`;
      }

      await saveSavedDraws(req, res, draws);
      const currentData = await getSavedDraws(req, res);
      res.json(currentData);
    } catch (error) {
      console.error("Failed to update players in draw:", error);
      res.status(500).json({ error: "Failed to update players in draw" });
    }
  });

  app.get("/api/notifications/history", requireAuth, async (req, res) => {
    try {
      let notifications = await getNotificationsHistory(req, res);
      
      // Bootstrap from reference app if empty
      if (notifications.length === 0) {
        try {
          const resp = await axios.get('https://jc-tournament-planner-569341375821.us-west1.run.app/api/notifications/history', { timeout: 3500 });
          if (Array.isArray(resp.data) && resp.data.length > 0) {
            const flatNotifications: any[] = [];
            resp.data.forEach((group: any) => {
              if (group.notifications && Array.isArray(group.notifications)) {
                group.notifications.forEach((n: any, index: number) => {
                  const titleUpper = (n.title || '').toUpperCase();
                  const bodyUpper = (n.body || '').toUpperCase();
                  const isNSW = titleUpper.includes('NSW') || bodyUpper.includes('NSW') || bodyUpper.includes('TWEED COAST') || titleUpper.includes('NSW_TOURNAMENT') || n.type === 'NSW_Tournament' || n.type === 'NSW';
                  const isDrawWatcher = titleUpper.includes('NEW PLAYER IN DRAW') || titleUpper.includes('DRAW WATCHER') || n.type === 'Draw_Watcher' || n.type === 'Draw' || (bodyUpper.includes('JOINED') && titleUpper.includes('DRAW'));
                  
                  flatNotifications.push({
                    id: `bootstrapped-${Date.now()}-${group.date}-${index}`,
                    player: isNSW ? 'System' : (n.title?.split(' ')[0] || n.body?.split(' ')[0] || 'Unknown'),
                    title: n.title || 'Notification',
                    body: n.body || '',
                    type: n.title?.includes('Win:Loss') ? 'Win:Loss' : n.title?.includes('Joined') ? 'Tournament' : isNSW ? 'NSW_Tournament' : isDrawWatcher ? 'Draw_Watcher' : 'Other',
                    source: 'Unknown',
                    date: group.date || n.timestamp?.split('T')[0] || new Date().toISOString().split('T')[0],
                    timestamp: n.timestamp || new Date().toISOString(),
                    url: n.url || (isNSW ? '/#tournaments' : isDrawWatcher ? '/#saved-draws' : '/#player-screen')
                  });
                });
              }
            });
            
            if (flatNotifications.length > 0) {
              notifications = flatNotifications;
              await saveNotificationsHistory(req, res, notifications);
            }
          }
        } catch (fetchErr: any) {
          console.log("[notifications] Seeding notification data from local database...");
          try {
            const data = await fs.readFile(notificationsHistoryPath, "utf-8");
            notifications = JSON.parse(data);
            if (notifications.length > 0) {
              await saveNotificationsHistory(req, res, notifications);
            }
          } catch (localErr: any) {
            console.log("[notifications] Local database pre-fill completed cleanly.");
          }
        }
      }

      res.json(notifications);
    } catch (err) {
      console.error("Failed to get notifications history:", err);
      res.status(500).json({ error: "Failed to query notifications history" });
    }
  });

  app.post("/api/notifications/test", requireAuth, async (req, res) => {
    try {
      let notifications = await getNotificationsHistory(req, res);
      const testId = `test-${Date.now()}`;
      const newNotification = {
        id: testId,
        player: "Test Bot 🎾",
        title: "Test Tennis Alert 🎾",
        body: "Success! Connection test passed! Your phone can receive real-time notifications on JC Tennis.",
        type: "Other",
        source: "System",
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
        url: "/#alerts"
      };

      notifications.unshift(newNotification);
      await saveNotificationsHistory(req, res, notifications);
      res.json({ success: true, notification: newNotification });
    } catch (err: any) {
      console.error("Failed to append test notification:", err);
      res.status(500).json({ error: "Failed to issue test notification: " + err.message });
    }
  });

  app.post("/api/notifications/delete", requireAuth, async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Items array is required" });
    }

    try {
      let notifications = await getNotificationsHistory(req, res);
      
      if (supabase) {
        try {
          for (const item of items) {
            await supabase
              .from("notifications_history")
              .delete()
              .eq("date", item.date)
              .eq("timestamp", item.timestamp);
          }
        } catch (err: any) {
          if (err.code === '42501' || (err.message && err.message.includes("row-level security"))) {
            console.log("Supabase RLS is blocking deletion. Please disable RLS. Local fallback used.");
          } else {
            console.log("Supabase deletion warning:", err.message || err);
          }
        }
      }

      notifications = notifications.filter(
        (n: any) => !items.some((item: any) => item.date === n.date && item.timestamp === n.timestamp)
      );

      try {
        await fs.writeFile(notificationsHistoryPath, JSON.stringify(notifications, null, 2));
      } catch (e: any) {
        console.error("Error writing notifications local backup:", e.message || String(e));
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete notifications:", err);
      res.status(500).json({ error: "Failed to delete notifications" });
    }
  });

  app.get("/api/admin/refresh-status", requireAuth, (req, res) => {
    res.json({ inProgress: isGlobalRefreshing });
  });

  async function runGlobalRefreshTask(includeTournamentsScrape: boolean = true) {
    isGlobalRefreshing = true;
    isScraping = true;
    try {
      console.log(`Starting background refresh. Include tournaments scrape: ${includeTournamentsScrape}`);
      
      const players = await getSavedPlayers(null, null);
      let notifications: any[] = [];
      try {
        notifications = await getNotificationsHistory(null, null);
      } catch (e) {
        // Ignore
      }

      const limit = pLimit(2); // Concurrency limit of 2 to avoid slamming tennis systems and timeouts
      
      // Task A: update all player stats
      const playersPromise = Promise.all(
        players.map((p: any) =>
          limit(async () => {
            if (!p.url) return p;
            try {
              const updatedStats = await scrapePlayerProfile(p.url, p.name);
              const updatedPlayer = { ...p, ...updatedStats, name: p.name };
              
              const newChanges = getPlayerChanges(p, updatedPlayer);
              if (newChanges.length > 0) {
                notifications = [...newChanges, ...notifications];
              }

              return updatedPlayer;
            } catch (e) {
              console.error(`Failed to refresh player ${p.name} in global refresh:`, e);
              return p; // Return unchanged on failure
            }
          })
        )
      ).then(async (updatedPlayers) => {
        await savePlayers(null, null, updatedPlayers);
        if (notifications.length > 0) {
          await saveNotificationsHistory(null, null, notifications);
        }
      });

      // Task B: run tournaments scraper (only if includeTournamentsScrape is true)
      let scraperPromise = Promise.resolve();
      if (includeTournamentsScrape) {
        scraperPromise = wrappedRunScraper().catch((e) => {
          console.error("Tournaments scraper failed during global refresh:", e);
        });
      }

      // Wait for both tasks to complete
      await Promise.all([playersPromise, scraperPromise]);

      // 2. Now trigger tournaments-for-players cache refresh using the newly updated data!
      if (refreshTournamentsForPlayersCache) {
        console.log("Rebuilding tournaments-for-players cache...");
        await refreshTournamentsForPlayersCache().catch(console.error);
      }
      console.log("Background global refresh completed successfully.");
    } catch (err) {
      console.error("Background refresh all failed:", err);
    } finally {
      isGlobalRefreshing = false;
      isScraping = false;
    }
  }

  app.post("/api/admin/refresh-all", requireAuth, async (req, res) => {
    if (isGlobalRefreshing) {
      return res.status(400).json({ error: "Global refresh already in progress" });
    }

    runGlobalRefreshTask(true).catch((err) => {
      console.error("Failed to execute admin refresh-all:", err);
    });

    res.json({ success: true, message: "Global refresh triggered in background" });
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

  await syncSupabaseToLocalTournaments();

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
