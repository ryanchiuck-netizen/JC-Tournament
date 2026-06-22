import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import { runScraper } from "./scraper.ts";
import cron from "node-cron";
import axios from "axios";
import * as cheerio from "cheerio";
import pLimitOrig from "p-limit";
const pLimit = (pLimitOrig as any).default || pLimitOrig;
import cookieParser from "cookie-parser";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function getTournamentIdFromLink(link: string): string {
  if (!link) return "";
  const idMatch = link.match(/id=([^&]+)/i);
  if (idMatch) return idMatch[1];
  const pathParts = link.split(/[?#]/)[0].split("/");
  return pathParts[pathParts.length - 1] || "";
}

function cleanPlayerName(name: string): string {
  if (!name) return "";
  let cleaned = name.trim();
  // Remove bracketed or parenthesized player numbers at the end (e.g. Chiu Jordan [66419], Jordan Chiu (66333972211))
  cleaned = cleaned.replace(/\s*[([][^\])]*\d+[^\])]*[)\]]\s*$/g, '');
  // Also remove any trailing open bracketed/parenthesized digits (even if truncated with ellipses, e.g. "Lucius Kanis MacRae (6...")
  cleaned = cleaned.replace(/\s*[([][\d\W]*\d+[\d\W]*$/g, '');
  return cleaned.trim();
}

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

  const getSafeDataPath = async (filename: string, defaultPath: string): Promise<string> => {
    try {
      await fs.access(defaultPath);
      return defaultPath;
    } catch {
      const fallbackPath = path.join(__dirname, "..", "public", filename);
      try {
        await fs.access(fallbackPath);
        return fallbackPath;
      } catch {
        return defaultPath;
      }
    }
  };
  
  const getTournamentsData = async (): Promise<any> => {
    if (supabase) {
      try {
        const { data, error } = await supabase.from("tournaments").select("data").eq("id", "latest");
        if (!error && data && data.length > 0 && data[0].data) {
          const dbData = data[0].data;
          try {
            const resolvedPath = await getSafeDataPath("tournaments.json", dataPath);
            const raw = await fs.readFile(resolvedPath, "utf-8");
            const localParsed = JSON.parse(raw);
            if (localParsed && Array.isArray(localParsed.tournaments) && Array.isArray(dbData.tournaments)) {
              let mergedAny = false;
              const localMap = new Map();
              for (const lt of localParsed.tournaments) {
                if (lt.link && Array.isArray(lt.players) && lt.players.length > 0) {
                  localMap.set(lt.link, lt.players);
                }
              }
              for (const dt of dbData.tournaments) {
                const hasDbPlayers = Array.isArray(dt.players) && dt.players.length > 0;
                if (!hasDbPlayers && dt.link && localMap.has(dt.link)) {
                  dt.players = localMap.get(dt.link);
                  mergedAny = true;
                }
              }
              if (mergedAny) {
                console.log("[Tournament Cache Repair] Successfully merged pre-scraped player lists from local tournaments.json into Supabase tournaments list!");
                supabase.from("tournaments").upsert({ id: "latest", data: dbData }).then(({ error: saveErr }) => {
                  if (saveErr) console.warn("Failed to save repaired tournaments back to Supabase:", saveErr.message);
                  else console.log("Successfully saved repaired database back to Supabase!");
                }).catch(err => {
                  console.warn("Exception saving repaired tournaments back to Supabase:", err.message);
                });
              }
            }
          } catch (repairErr: any) {
            console.warn("[Tournament Cache Repair] Repair skipped:", repairErr.message);
          }
          return dbData;
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
    const resolvedPath = await getSafeDataPath("tournaments.json", dataPath);
    const raw = await fs.readFile(resolvedPath, "utf-8");
    return JSON.parse(raw);
  };

  const saveTournamentsData = async (tournamentsList: any[]): Promise<void> => {
    const freshData = {
      lastUpdated: new Date().toISOString(),
      tournaments: tournamentsList
    };
    if (supabase) {
      try {
        await supabase.from("tournaments").upsert({ id: "latest", data: freshData });
      } catch (err: any) {
        console.warn("Failed to save tournaments to Supabase:", err.message);
      }
    }
    try {
      const resolvedPath = await getSafeDataPath("tournaments.json", dataPath);
      await fs.writeFile(resolvedPath, JSON.stringify(freshData, null, 2));
    } catch (fsErr: any) {
      console.warn("Local file write failed (non-fatal if Supabase is used):", fsErr.message);
    }
  };
  
  let isScraping = false;
  let isGlobalRefreshing = false;
  let sseClients: any[] = [];
  const sentNotificationIds = new Set<string>();
  let refreshTournamentsForPlayersCache: () => Promise<any>;

  const vapidKeysPath = path.join(process.cwd(), "public", "vapid-keys.json");
  const subscriptionsPath = path.join(process.cwd(), "public", "notification-subscriptions.json");

  let vapidKeys: { publicKey: string; privateKey: string } = { publicKey: "", privateKey: "" };

  // Phase 1: Retrieve VAPID Keys securely from Supabase table or local file system
  if (supabase) {
    try {
      const { data: dbKeys, error: dbKeysErr } = await supabase.from("tournaments").select("data").eq("id", "vapid_keys");
      if (!dbKeysErr && dbKeys && dbKeys.length > 0 && dbKeys[0].data) {
        vapidKeys = dbKeys[0].data as { publicKey: string; privateKey: string };
        console.log("[WebPush] Persistent VAPID keys successfully loaded from Supabase.");
      }
    } catch (dbErr: any) {
      console.warn("[WebPush] Database load of VAPID keys failed, attempting fallback:", dbErr.message);
    }
  }

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    try {
      const keysData = await fs.readFile(vapidKeysPath, "utf-8");
      vapidKeys = JSON.parse(keysData);
      console.log("[WebPush] VAPID keys loaded from local file storage.");
      
      // Upload/Seed to Supabase for multi-replica/persistent safety if available
      if (supabase) {
        await supabase.from("tournaments").upsert({ id: "vapid_keys", data: vapidKeys }).catch(err => {
          console.warn("[WebPush] Could not persist local VAPID keys to Supabase:", err.message);
        });
      }
    } catch (err) {
      console.log("[WebPush] No persistent keys found. Generating new permanent VAPID keys...");
      vapidKeys = webpush.generateVAPIDKeys();
      
      try {
        await fs.writeFile(vapidKeysPath, JSON.stringify(vapidKeys, null, 2));
      } catch (saveErr) {
        console.error("[WebPush] Failed to write generated keys to scratch storage:", saveErr);
      }
      
      if (supabase) {
        try {
          await supabase.from("tournaments").upsert({ id: "vapid_keys", data: vapidKeys });
          console.log("[WebPush] Saved newly generated VAPID keys to Supabase.");
        } catch (dbSaveErr: any) {
          console.error("[WebPush] Could not save generated keys to Supabase:", dbSaveErr.message);
        }
      }
    }
  }

  try {
    webpush.setVapidDetails(
      "mailto:ryan.chiu.ck@gmail.com",
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
    console.log("[WebPush] VAPID context defined successfully. Active public key:", vapidKeys.publicKey);
  } catch (configErr: any) {
    console.error("[WebPush] Critical Error configuring WebPush context:", configErr.message || configErr);
  }

  // Phase 2: Create robust subscription sync helpers
  const loadSubscriptions = async (): Promise<any[]> => {
    let subs: any[] = [];
    if (supabase) {
      try {
        const { data: dbSubs, error: dbSubsErr } = await supabase.from("tournaments").select("data").eq("id", "notification_subscriptions");
        if (!dbSubsErr && dbSubs && dbSubs.length > 0 && Array.isArray(dbSubs[0].data)) {
          subs = dbSubs[0].data;
          return subs;
        }
      } catch (dbErr: any) {
        console.warn("[WebPush] Database read of subscriptions failed. Falling back to local:", dbErr.message);
      }
    }
    
    try {
      const fileContent = await fs.readFile(subscriptionsPath, "utf-8");
      subs = JSON.parse(fileContent);
    } catch (err) {
      subs = [];
    }
    return subs;
  };

  const saveSubscriptions = async (subs: any[]) => {
    // Write local backup first
    try {
      await fs.writeFile(subscriptionsPath, JSON.stringify(subs, null, 2));
    } catch (err: any) {
      console.error("[WebPush] Failed saving subscriptions to local file:", err.message);
    }
    
    // Write to Supabase table
    if (supabase) {
      try {
        const { error } = await supabase.from("tournaments").upsert({ id: "notification_subscriptions", data: subs });
        if (error) {
          console.error("[WebPush] Error upserting subscriptions to Supabase:", error.message);
        }
      } catch (dbErr: any) {
        console.error("[WebPush] Failed hard synching subscriptions to Supabase:", dbErr.message);
      }
    }
  };

  const sendWebPushNotification = async (notif: any) => {
    try {
      const subs = await loadSubscriptions();
      if (subs.length === 0) return;
      
      console.log(`[WebPush] Broadcasting to ${subs.length} push subscriptions...`);
      const payload = JSON.stringify({
        id: notif.id,
        title: notif.title || "JC Tennis Alert 🎾",
        body: notif.body || "A tennis alert has been received.",
        url: "/#alerts"
      });

      const invalidSubs: string[] = [];
      
      const pushPromises = subs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, payload);
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`[WebPush] Subscription expired or unsubscribed, marking for cleanup: ${sub.endpoint}`);
            invalidSubs.push(sub.endpoint);
          } else {
            console.warn(`[WebPush] Push failed for endpoint: ${sub.endpoint}, error:`, err.message || err);
          }
        }
      });

      await Promise.all(pushPromises);

      if (invalidSubs.length > 0) {
        const updatedSubs = subs.filter(sub => !invalidSubs.includes(sub.endpoint));
        await saveSubscriptions(updatedSubs);
        console.log(`[WebPush] Cleaned up ${invalidSubs.length} dead subscription(s). New count: ${updatedSubs.length}`);
      }
    } catch (err: any) {
      console.error("[WebPush] Broadcast exception:", err.message || err);
    }
  };  // End of sendWebPushNotification

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
        const newTournNotifications: any[] = [];
        for (const t of parsedNew.tournaments) {
          if (t.link && !oldLinks.has(t.link)) {
            // New tournament!
            const nameUpper = (t.name || "").toUpperCase();
            const locUpper = (t.location || "").toUpperCase();
            if (t.source === "AUS" && (nameUpper.includes("NSW") || locUpper.includes("NSW"))) {
              const dateStr = t.dates || "Unknown Dates";
              newTournNotifications.push({
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
            } else if (t.source === "HK") {
              const dateStr = t.dates || "Unknown Dates";
              newTournNotifications.push({
                id: `hk-tournament-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                player: 'System',
                title: `New HKTA Tournament Created`,
                body: `New HKTA Tournament: ${t.name}\nDates: ${dateStr}\nLocation: ${t.location || "Hong Kong"}`,
                type: 'HK_Tournament',
                source: 'HK',
                date: new Date().toISOString().split('T')[0],
                timestamp: new Date().toISOString(),
                url: `/#tournaments`
              });
            }
          }
        }

        if (newTournNotifications.length > 0) {
          console.log(`Detected ${newTournNotifications.length} new tournaments. Saving alerts...`);
          let existingNotifications = [];
          try {
            existingNotifications = await getNotificationsHistory(null, null);
          } catch (e) {}
          const merged = [...newTournNotifications, ...existingNotifications];
          await saveNotificationsHistory(null, null, merged);
        }
      }
    } catch (e: any) {
      console.error("Error analyzing new tournaments for alerts:", e.message || e);
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
    
    // Check various ways the secret might be provided (including GET query params for ease of setup)
    const providedSecret = 
      req.query.secret || 
      req.query.cron_secret || 
      req.query.key || 
      req.headers["x-cron-secret"] || 
      (req.headers["authorization"] ? req.headers["authorization"].replace("Bearer ", "") : "");

    // 1. Explicit secret match
    if (providedSecret && providedSecret === expectedSecret) {
      return next();
    }

    // 2. Google Cloud Scheduler User-Agent bypass for maximum resilience (since operations are safe background tasks)
    const userAgent = req.headers["user-agent"] || "";
    if (userAgent.includes("Google-Cloud-Scheduler")) {
      console.log(`[Cron Auth] Request authorized via Google Cloud Scheduler User-Agent`);
      return next();
    }

    // 3. OIDC ID Token checks (Google Cloud Scheduler can be configured with OIDC authentication)
    if (providedSecret && (providedSecret.startsWith("eyJ") || providedSecret.includes("."))) {
      try {
        const parts = providedSecret.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
          if (payload && (payload.iss === "https://accounts.google.com" || payload.iss === "accounts.google.com")) {
            console.log(`[Cron Auth] Authorized Google OIDC Service Account: ${payload.email}`);
            return next();
          }
        }
      } catch (e) {
        console.warn("[Cron Auth] Non-fatal issue parsing bearer OIDC token:", e);
      }
    }

    // 4. Fallback: if expectedSecret is the default, we allow it for easy bootstrapping in sandbox envs
    if (expectedSecret === "default_local_cron_secret") {
      console.log("[Cron Auth] Authorized using default fallback token mode.");
      return next();
    }

    console.warn(`[Cron Auth] Blocked request from ${req.ip}. Expected secret: ${expectedSecret ? "configured" : "none"}, Provided: ${providedSecret ? "yes" : "empty"}, UA: ${userAgent}`);
    return res.status(401).json({ error: "Unauthorized: Invalid or missing cron secret" });
  };

  // --- GOOGLE CLOUD SCHEDULER API ENDPOINTS ---
  
  // 1. Tournaments-only Scrape (Target: 3 PM HKT on Monday & Thursday)
  // Cloud Scheduler Schedule: 0 15 * * 1,4 (Timezone: Asia/Hong_Kong)
  const handleScrapeTournaments = async (req: any, res: any) => {
    if (isScraping) {
      return res.status(400).json({ error: "Scraping/refresh already in progress" });
    }
    console.log("Cloud Scheduler triggered tournaments-only scrape...");
    isScraping = true;
    
    // Kick off the scraping in background and handle results asynchronously
    (async () => {
      try {
        await wrappedRunScraper();
        if (refreshTournamentsForPlayersCache) {
          try {
            await refreshTournamentsForPlayersCache();
          } catch (e) {
            console.error("Cloud Scheduler tournaments cache rebuild failed in background:", e);
          }
        }
        console.log("Cloud Scheduler background tournaments-only scrape and cache rebuild completed successfully.");
      } catch (err: any) {
        console.error("Cloud Scheduler background tournaments-only scrape failed:", err);
      } finally {
        isScraping = false;
      }
    })().catch(console.error);

    res.json({ success: true, message: "Tournaments-only scrape triggered in background" });
  };

  app.get("/api/cron/scrape-tournaments", requireCronSecret, handleScrapeTournaments);
  app.post("/api/cron/scrape-tournaments", requireCronSecret, handleScrapeTournaments);

  // 2. Player Stats & Draws Refresh (Target: 8 AM, 12 PM, 4 PM, 8 PM HKT daily)
  // Cloud Scheduler Schedule: 0 8,12,16,20 * * * (Timezone: Asia/Hong_Kong)
  const handleGlobalRefresh = async (req: any, res: any) => {
    if (isGlobalRefreshing) {
      return res.status(400).json({ error: "Global refresh already in progress" });
    }
    console.log("Cloud Scheduler triggered player stats & draw checks update...");
    
    // Trigger task in background without blocking response to avoid Scheduler/Run HTTP timeouts
    runGlobalRefreshTask(false).catch((err) => {
      console.error("Cloud Scheduler background global refresh task failed:", err);
    });

    res.json({ success: true, message: "Player stats & draw checks update triggered in background" });
  };

  app.get("/api/cron/global-refresh", requireCronSecret, handleGlobalRefresh);
  app.post("/api/cron/global-refresh", requireCronSecret, handleGlobalRefresh);

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

  // API route to get player names for autofill
  app.get("/api/players", requireAuth, async (req, res) => {
    try {
      let playersPath = path.join(process.cwd(), "public", "players.json");
      try {
        await fs.access(playersPath);
      } catch {
        // Fallback to check relative to dist folder
        playersPath = path.join(__dirname, "..", "public", "players.json");
      }
      
      const data = await fs.readFile(playersPath, "utf-8");
      res.setHeader("Content-Type", "application/json");
      res.json(JSON.parse(data));
    } catch (error: any) {
      console.error("[Autofill Admin] Failed to load players.json from disk:", error.message || error);
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
      const data = await getTournamentsData() || {};
      const tournaments = data.tournaments || [];
      
      const limit = pLimit(5);
      const matches: any[] = [];
      const queryParts = getQueryParts(playerName);
      let hasUpdates = false;

      // Restrict execution time to prevent 504 Gateway Timeouts on serverless platforms
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`[Player Watch] Search for '${playerName}' exceeded 6s, aborting remaining requests to return partial results.`);
        abortController.abort();
      }, 6000);

      const searchTasks = tournaments.map((tournament: any) => 
        limit(async () => {
          // Check source match if playerSource is provided
          if (playerSource) {
            if (tournament.source === "HK" && playerSource !== "HKTA") return;
            if (tournament.source === "AUS" && playerSource !== "TA") return;
          }

          let isUpcomingOrRecent = false;
            if (tournament.dates) {
              const parts = tournament.dates.split(' to ');
              const endDateParts = parts[parts.length - 1].trim().split('/');
              const startDateParts = parts[0].trim().split('/');
              if (endDateParts.length >= 3 && startDateParts.length >= 3) {
                const endDate = new Date(parseInt(endDateParts[2]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[0]));
                const startDate = new Date(parseInt(startDateParts[2]), parseInt(startDateParts[1]) - 1, parseInt(startDateParts[0]));
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - 30); // Ended maximum 30 days ago
                const futureCutoff = new Date();
                futureCutoff.setDate(futureCutoff.getDate() + 45); // Starts in max 45 days
                if (endDate >= cutoff && startDate <= futureCutoff) {
                  isUpcomingOrRecent = true;
                }
              } else if (endDateParts.length >= 3) {
                const endDate = new Date(parseInt(endDateParts[2]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[0]));
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - 30);
                const futureCutoff = new Date();
                futureCutoff.setDate(futureCutoff.getDate() + 45);
                if (endDate >= cutoff && endDate <= futureCutoff) {
                  isUpcomingOrRecent = true;
                }
              }
            }
            if (!isUpcomingOrRecent) {
              tournament.players = [];
              return;
            }

          const domain = tournament.source === "HK" ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
          const tId = getTournamentIdFromLink(tournament.link);
          if (!tId) return;
          const playersUrl = `https://${domain}/tournament/${tId}/Players/GetPlayersContent`;
          
          try {
            const response = await axios.get(playersUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0",
                "X-Requested-With": "XMLHttpRequest"
              },
              timeout: 10000,
              signal: abortController.signal
            });

            // Extract and save the player list
            const $ = cheerio.load(response.data);
            const scrapedPlayers: string[] = [];
            $("li.js-alphabet-list-item").each((i, el) => {
              const name = cleanPlayerName($(el).find(".media__title").text().trim());
              if (name) scrapedPlayers.push(name);
            });
            tournament.players = scrapedPlayers;
            hasUpdates = true;

            // Quick check if all query parts exist in HTML before parsing
            const dataLower = response.data.toLowerCase().replace(/[,.]/g, '');
            const quickMatch = queryParts.every(part => dataLower.includes(part));

            if (quickMatch) {
              let playerDetailLink = "";

              $("li.js-alphabet-list-item").each((i, el) => {
                const name = cleanPlayerName($(el).find(".media__title").text().trim());
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
                  timeout: 10000,
                  signal: abortController.signal
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
          } catch (e: any) {
            if (e.name === "CanceledError" || e.code === "ERR_CANCELED") {
               // Aborted intentionally
            }
          }
        })
      );

      await Promise.all(searchTasks);
      clearTimeout(timeoutId);

      if (hasUpdates) {
        try {
          await saveTournamentsData(tournaments);
        } catch (err: any) {
          console.warn("[Player Watch] Non-fatal save failed:", err.message);
        }
      }

      res.json({ playerName, matches });
    } catch (error: any) {
      console.error("[Player Watch Error]:", error);
      res.status(500).json({ error: `Failed to search for player: ${error.message || error}` });
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
        console.log("[PLAYER RECOVERY] Local saved-players.json is empty or missing. Restoring players...");
        let snapshots: any[] = [];
        
        // 1. Try to retrieve from Supabase first
        if (supabase) {
          try {
            const { data, error } = await supabase.from("tournaments").select("data").eq("id", "player_snapshots");
            if (!error && data && data.length > 0 && Array.isArray(data[0].data)) {
              snapshots = data[0].data;
              console.log("[PLAYER RECOVERY] Retrieved snapshots from Supabase:", snapshots.length, "entries.");
            }
          } catch (sbErr: any) {
            console.warn("[PLAYER RECOVERY] Failed to load snapshots from Supabase:", sbErr.message);
          }
        }

        // 2. Fall back to local file
        if (snapshots.length === 0) {
          try {
            const snapshotsPath = path.join(process.cwd(), "public", "player-snapshots.json");
            const snapshotsContent = await fs.readFile(snapshotsPath, "utf-8");
            snapshots = JSON.parse(snapshotsContent);
          } catch (fsErr: any) {
            console.warn("[PLAYER RECOVERY] Failed to load snapshots from local file:", fsErr.message);
          }
        }

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

  const playerGroupsPath = path.join(process.cwd(), "public", "player-groups.json");

  const getPlayerGroupsMap = async (): Promise<Record<string, string[]>> => {
    let groupsMap: Record<string, string[]> = {};
    if (supabase) {
      try {
        const { data, error } = await supabase.from("tournaments").select("data").eq("id", "player_groups");
        if (!error && data && data.length > 0 && data[0].data) {
          groupsMap = data[0].data;
          return groupsMap;
        }
      } catch (err: any) {
        console.warn("Failed to load player groups from Supabase:", err.message);
      }
    }
    try {
      const fileContent = await fs.readFile(playerGroupsPath, "utf-8");
      groupsMap = JSON.parse(fileContent);
    } catch {
      groupsMap = {};
    }
    return groupsMap;
  };

  const savePlayerGroupsMap = async (groupsMap: Record<string, string[]>) => {
    try {
      await fs.writeFile(playerGroupsPath, JSON.stringify(groupsMap, null, 2));
    } catch (e: any) {
      console.warn("Failed to save local player-groups.json:", e.message);
    }
    if (supabase) {
      try {
        await supabase.from("tournaments").upsert({ id: "player_groups", data: groupsMap });
      } catch (err: any) {
        console.warn("Failed to save player groups to Supabase:", err.message);
      }
    }
  };

  const playerGroupsOrderPath = path.join(process.cwd(), "public", "player-groups-order.json");

  const getPlayerGroupsOrderMap = async (): Promise<Record<string, string[]>> => {
    let orderMap: Record<string, string[]> = {};
    if (supabase) {
      try {
        const { data, error } = await supabase.from("tournaments").select("data").eq("id", "player_groups_order");
        if (!error && data && data.length > 0 && data[0].data) {
          orderMap = data[0].data;
          return orderMap;
        }
      } catch (err: any) {
        console.warn("Failed to load player groups order from Supabase:", err.message);
      }
    }
    try {
      const fileContent = await fs.readFile(playerGroupsOrderPath, "utf-8");
      orderMap = JSON.parse(fileContent);
    } catch {
      orderMap = {};
    }
    return orderMap;
  };

  const savePlayerGroupsOrderMap = async (orderMap: Record<string, string[]>) => {
    try {
      await fs.writeFile(playerGroupsOrderPath, JSON.stringify(orderMap, null, 2));
    } catch (e: any) {
      console.warn("Failed to save local player-groups-order.json:", e.message);
    }
    if (supabase) {
      try {
        await supabase.from("tournaments").upsert({ id: "player_groups_order", data: orderMap });
      } catch (err: any) {
        console.warn("Failed to save player groups order to Supabase:", err.message);
      }
    }
  };

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
    const groupsMap = await getPlayerGroupsMap();
    const uniquePlayersMap = new Map();
    for (const player of players) {
      if (player.name) {
        player.name = cleanPlayerName(player.name);
      }
      const key = player.url || `${player.name}-${player.source}`;
      if (!uniquePlayersMap.has(key)) {
        player.groups = groupsMap[player.id] || [];
        uniquePlayersMap.set(key, player);
      }
    }
    return Array.from(uniquePlayersMap.values());
  };

  const rebuildPlayerSnapshotsFromHistory = async (rawPlayers?: any[]): Promise<any[]> => {
    if (!supabase) {
      console.log("[Rebuild] Supabase is not configured. Cannot rebuild snapshot history.");
      return [];
    }

    try {
      console.log("[Rebuild] Reconstructing full snapshot history with pagination...");
      let finalPlayers = rawPlayers;
      if (!finalPlayers || finalPlayers.length === 0) {
        finalPlayers = await getSavedPlayers(null, null);
      }

      const currentSnapshotPlayers = (finalPlayers || []).map((p: any) => ({
        id: p.id,
        url: p.url || '',
        name: p.name,
        rank: p.rank || '-',
        points: p.points || '-',
        source: p.source || 'TA',
        utrSingles: p.utr_singles || p.utrSingles || '-',
        winLossYTD: p.win_loss_ytd || p.winLossYTD || '-',
        winLossCareer: p.win_loss_career || p.winLossCareer || '-',
        championships: p.championships || '-',
      }));

      let dbNotifications: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      const targetTypes = ["Rank", "Points", "WinLoss", "Win:Loss", "UTR"];

      while (hasMore) {
        const { data, error } = await supabase
          .from("notifications_history")
          .select("*")
          .in("type", targetTypes)
          .order("timestamp", { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
          throw new Error(`Failed to load historical notifications at page ${page}: ${error.message}`);
        }

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          dbNotifications = dbNotifications.concat(data);
          page++;
          if (data.length < pageSize) {
            hasMore = false;
          }
        }
      }

      console.log(`[Rebuild] Retrieved ${dbNotifications.length} historical player stat notifications.`);

      const uniqueDates = Array.from(new Set(dbNotifications.map((n: any) => n.date)))
        .filter((d): d is string => !!d)
        .sort()
        .reverse();

      console.log(`[Rebuild] Unique snapshot dates to reconstruct: ${uniqueDates.length}`);

      const snapshots: any[] = [];
      let state = JSON.parse(JSON.stringify(currentSnapshotPlayers));

      const parseAndNormalizeValue = (val: string, type: string): string => {
        if (!val) return "-";
        val = val.trim();
        if (type === 'WinLoss' || type === 'Win:Loss') {
          const match = val.match(/^(\d+)\s*[\/\:]\s*(\d+)/);
          if (match) {
            return `${match[1]}:${match[2]}`;
          }
        }
        return val;
      };

      for (let i = 0; i < uniqueDates.length; i++) {
        const date = uniqueDates[i];
        const timestamp = new Date(date).toISOString();

        const taPlayers = state.filter((p: any) => p.source === 'TA');
        const hktaPlayers = state.filter((p: any) => p.source === 'HKTA');

        snapshots.push({
          date,
          timestamp,
          taPlayers,
          hktaPlayers
        });

        const dateNotifs = dbNotifications.filter((n: any) => n.date === date);
        const nextOlderState = JSON.parse(JSON.stringify(state));

        for (const notif of dateNotifs) {
          let playerName = "";
          const body = notif.body || "";
          const type = notif.type;

          if (type === 'Win:Loss' || (notif.player && notif.player.toLowerCase().includes('win:loss'))) {
            const idx = body.toLowerCase().indexOf("win:loss");
            if (idx !== -1) {
              playerName = body.substring(0, idx).trim();
            } else {
              playerName = notif.player?.split('\n')[0].trim() || "";
            }
          } else {
            playerName = notif.player?.split('\n')[0].trim() || "";
          }

          if (!playerName || playerName.toLowerCase() === "new" || playerName.toLowerCase() === "win:loss") {
            continue;
          }

          const pIndex = nextOlderState.findIndex((p: any) => p.name.toLowerCase().trim() === playerName.toLowerCase().trim());
          if (pIndex === -1) continue;

          const match = body.match(/changed from (.*?) to (.*)/i);
          if (match) {
            const rawFromValue = match[1].trim();
            const fromValue = parseAndNormalizeValue(rawFromValue, type);

            if (type === 'Rank') {
              nextOlderState[pIndex].rank = fromValue;
            } else if (type === 'Points') {
              nextOlderState[pIndex].points = fromValue;
            } else if (type === 'UTR' || body.toLowerCase().includes('utr singles')) {
              nextOlderState[pIndex].utrSingles = fromValue;
            } else if (type === 'WinLoss' || type === 'Win:Loss') {
              if (body.toLowerCase().includes('career')) {
                nextOlderState[pIndex].winLossCareer = fromValue;
              } else if (body.toLowerCase().includes('ytd')) {
                nextOlderState[pIndex].winLossYTD = fromValue;
              }
            }
          }
        }

        state = nextOlderState;
      }

      return snapshots;

    } catch (err: any) {
      console.warn("[Rebuild] Failed to reconstruct player snapshots history:", err.message || err);
      return [];
    }
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

      // Try to load from Supabase first
      if (supabase) {
        try {
          const { data, error } = await supabase.from("tournaments").select("data").eq("id", "player_snapshots");
          if (!error && data && data.length > 0 && Array.isArray(data[0].data)) {
            snapshots = data[0].data;
            console.log("[Snapshot] Loaded snapshots from Supabase:", snapshots.length, "entries.");
          }
        } catch (sbErr: any) {
          console.warn("[Snapshot] Failed to load snapshots from Supabase:", sbErr.message);
        }
      }

      // Fallback/Bootstrap if needed
      if (snapshots.length === 0) {
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
      }

      // Rebuild / self-heal snapshots from notification logs in Supabase if thin or empty
      if (snapshots.length <= 1 && supabase) {
        try {
          console.log("[Snapshot] Thin or empty snapshot history found. Attempting to rebuild snap entries from notifications_history audits...");
          const rebuilt = await rebuildPlayerSnapshotsFromHistory(players);
          if (rebuilt && rebuilt.length > 0) {
            snapshots = rebuilt;
            console.log("[Snapshot] Successfully rebuilt historical snapshots! Total dates reconstructed:", snapshots.length);
          }
        } catch (healErr: any) {
          console.warn("[Snapshot] Failed to rebuild snapshot array from notifications_history:", healErr.message);
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

      // Write local backup file
      try {
        await fs.writeFile(snapshotsPath, JSON.stringify(snapshots, null, 2));
      } catch (fsErr: any) {
        console.error("[Snapshot] Failed to write to local backup:", fsErr.message);
      }

      // Sync to Supabase
      if (supabase) {
        try {
          await supabase.from("tournaments").upsert({ id: "player_snapshots", data: snapshots });
          console.log("[Snapshot] Saved snapshots history to Supabase successfully.");
        } catch (sbErr: any) {
          console.error("[Snapshot] Failed to save snapshots to Supabase:", sbErr.message);
        }
      }

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

    // Extract player groups and save
    try {
      const groupsMap: Record<string, string[]> = {};
      players.forEach((p: any) => {
        if (p.id) {
          groupsMap[p.id] = p.groups || [];
        }
      });
      await savePlayerGroupsMap(groupsMap);
    } catch (grpErr: any) {
      console.error("Error saving player-groups map:", grpErr.message || String(grpErr));
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

      const data = await getTournamentsData() || {};
      const tournaments = data.tournaments || [];

      // Filter tournaments to only active ones starting within the next 365 days (or still currently running)
      const futureTournaments = tournaments.filter((t: any) => {
        if (!t.dates) return false;
        const parts = t.dates.split(' to ');
        
        // End date parsing to ensure it's not in the past unless in the current year
        const endDateParts = parts[parts.length - 1].trim().split('/');
        if (endDateParts.length < 3) return false;
        const endDate = new Date(parseInt(endDateParts[2]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[0]));
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const currentYear = today.getFullYear();
        if (endDate < today && endDate.getFullYear() < currentYear) return false;

        // Start date parsing to limit search space to next 365 days
        const startDateParts = parts[0].trim().split('/');
        if (startDateParts.length < 3) return false;
        const startDate = new Date(parseInt(startDateParts[2]), parseInt(startDateParts[1]) - 1, parseInt(startDateParts[0]));
        
        const limitDate = new Date();
        limitDate.setDate(today.getDate() + 365);
        
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

          return true;
        });

        if (likelyPlayers.length === 0) continue;

        // Determine if we already have the players array populated
        const hasPlayersArray = Array.isArray(tournament.players) && tournament.players.length > 0;

        // Perform name-matching completely offline (in-memory) first if players are cached
        let matchesSavedPlayerOffline = false;
        if (hasPlayersArray) {
          matchesSavedPlayerOffline = likelyPlayers.some((player: any) => {
            const queryParts = getQueryParts(player.name);
            return tournament.players.some((tPlayerName: string) => isPlayerNameMatch(tPlayerName, queryParts));
          });

          // If players list is cached but NONE of our saved players are in it, skip this tournament entirely!
          if (!matchesSavedPlayerOffline) {
            continue;
          }
        }

        // If the tournament has NO players array, check if it starts within our active window
        if (!hasPlayersArray) {
          let inActiveWindow = false;
          if (tournament.dates) {
            const parts = tournament.dates.split(' to ');
            const startDateParts = parts[0].trim().split('/');
            if (startDateParts.length >= 3) {
              const startDate = new Date(parseInt(startDateParts[2]), parseInt(startDateParts[1]) - 1, parseInt(startDateParts[0]));
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              // Starts within the next 35 days or started within the last 14 days
              const minDate = new Date();
              minDate.setDate(today.getDate() - 14);
              const maxDate = new Date();
              maxDate.setDate(today.getDate() + 35);
              
              inActiveWindow = startDate >= minDate && startDate <= maxDate;
            }
          }
          
          // If starting far in the future or past with no player list, skip it entirely!
          if (!inActiveWindow) {
            continue;
          }
        }

        searchTasks.push(
          limit(async () => {
            const domain = tournament.source === "HK" ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
            const tId = getTournamentIdFromLink(tournament.link);
            if (!tId) return;
            const playersUrl = `https://${domain}/tournament/${tId}/Players/GetPlayersContent`;
            
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
              
              const scrapedPlayers: string[] = [];
              if (!hasPlayersArray) {
                $("li.js-alphabet-list-item").each((i, el) => {
                  const name = cleanPlayerName($(el).find(".media__title").text().trim());
                  if (name) scrapedPlayers.push(name);
                });
                if (scrapedPlayers.length > 0) {
                  tournament.players = scrapedPlayers;
                }
              }

              const joinedPlayers: any[] = [];

              for (const player of likelyPlayers) {
                const queryParts = getQueryParts(player.name);

                const quickMatch = queryParts.every(part => dataLower.includes(part));

                if (quickMatch) {
                  let playerDetailLink = "";

                  $("li.js-alphabet-list-item").each((i, el) => {
                    const name = cleanPlayerName($(el).find(".media__title").text().trim());
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

                    joinedPlayers.push({
                      player,
                      draws: draws.length > 0 ? draws : []
                    });
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

      // Save any newly/progressively scraped player rosters to tournaments.json and Supabase
      try {
        await saveTournamentsData(tournaments);
        console.log("Tournaments database successfully updated with newly scraped players lists.");
      } catch (err: any) {
        console.error("Failed to persist updated tournaments data during cache rebuild:", err.message);
      }
      
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

  function deduplicatePlayers(players: any[]): any[] {
    if (!Array.isArray(players)) return [];
    const seen = new Set<string>();
    const uniqueList: any[] = [];
    for (const p of players) {
      if (!p || !p.name) continue;
      const cleanedName = cleanPlayerName(p.name);
      const norm = cleanedName.toLowerCase().trim();
      if (!seen.has(norm)) {
        seen.add(norm);
        uniqueList.push({ ...p, name: cleanedName });
      }
    }
    return uniqueList;
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

      // Clean up and deduplicate player entries
      const originalPlayersStr = JSON.stringify(updatedDraw.players || []);
      const deduplicatedPlayers = deduplicatePlayers(updatedDraw.players || []);
      if (JSON.stringify(deduplicatedPlayers) !== originalPlayersStr) {
        updatedDraw.players = deduplicatedPlayers;
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
    
    const rawPlayerName = $('.media__title').first().text().trim() || playerNameFallback;
    const playerName = cleanPlayerName(rawPlayerName);
    
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
      const cleanUrl = url.split('#')[0];
      let resolvedUrl = cleanUrl;
      let drawRes: any;
      let isPreFetched = false;

      // Auto-resolve event.aspx links in tournament software (which are container events, not draw pages)
      if (cleanUrl.includes('event.aspx')) {
        try {
          console.log(`[check-draw] Detected event.aspx container URL: ${cleanUrl}. Fetching event page to check for direct players...`);
          const eventPageRes = await axios.get(cleanUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 10000
          });
          const $eventPage = cheerio.load(eventPageRes.data);
          
          // Verify if there are direct player links on this event page
          const directPlayersCount = $eventPage('a[href*="player.aspx?"], a[href*="player.aspx"], a[href*="/player/"], a[href*="/player-profile/"]')
            .filter((_, el) => {
              const href = $eventPage(el).attr('href') || '';
              const isGeneric = href.toLowerCase().includes('/player-profile/search') || href.toLowerCase().endsWith('/player-profile/') || href.toLowerCase().endsWith('/player-profile');
              return !isGeneric;
            }).length;

          if (directPlayersCount > 0) {
            console.log(`[check-draw] Found ${directPlayersCount} players directly on ${cleanUrl}. Skipping resolution.`);
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
              const domain = cleanUrl.includes("hkta") ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
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

      $('a[href*="player.aspx"], a[href*="/player/"], a[href*="/player-profile/"]').each((i, el) => {
        const name = cleanPlayerName($(el).text().trim());
        const href = $(el).attr('href');
        // Ignore links that don't have a name or are just icons
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
            
            if (!playerLinks.some(pl => pl.url === fullUrl || pl.name.toLowerCase().trim() === name.toLowerCase().trim())) {
              playerLinks.push({ name, url: fullUrl });
            }
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
                  ...stats,
                  id: Math.random().toString(36).substring(7),
                  name: pl.name,
                  profileUrl: finalProfileUrl
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
        players: deduplicatePlayers(playersStats),
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

    // Server-side robust deduplication by player + title + body to guarantee no repeat notifications are returned
    const seenNew = new Set<string>();
    const deduplicated: any[] = [];
    for (const n of notifications) {
      if (!n) continue;
      const key = `${(n.player || '').toLowerCase().trim()}|${(n.title || '').toLowerCase().trim()}|${(n.body || '').toLowerCase().trim()}`;
      if (!seenNew.has(key)) {
        seenNew.add(key);
        deduplicated.push(n);
      }
    }
    return deduplicated;
  };

  const saveNotificationsHistory = async (req: any, res: any, notifications: any[]) => {
    // Deduplicate notifications history by player + body + title to keep history perfectly clean and prevent duplicates
    const seenNotifs = new Set<string>();
    const deduplicatedNotifications: any[] = [];
    if (Array.isArray(notifications)) {
      for (const n of notifications) {
        if (!n) continue;
        const key = `${(n.player || '').toLowerCase().trim()}|${(n.title || '').toLowerCase().trim()}|${(n.body || '').toLowerCase().trim()}`;
        if (!seenNotifs.has(key)) {
          seenNotifs.add(key);
          deduplicatedNotifications.push(n);
        }
      }
    }

    // 1. Identify and broadcast any brand-new notifications over Server-Sent Events (SSE)
    const newNotificationsToBroadcast: any[] = [];
    if (Array.isArray(deduplicatedNotifications)) {
      for (const n of deduplicatedNotifications) {
        if (n && n.id && !sentNotificationIds.has(n.id)) {
          sentNotificationIds.add(n.id);
          newNotificationsToBroadcast.push(n);
        }
      }
    }

    if (newNotificationsToBroadcast.length > 0) {
      console.log(`[SSE] Broadcasting ${newNotificationsToBroadcast.length} new notification(s) in real-time to ${sseClients.length} connected device(s)...`);
      newNotificationsToBroadcast.forEach(notif => {
        const data = JSON.stringify(notif);
        sseClients.forEach((client, idx) => {
          try {
            client.write(`data: ${data}\n\n`);
          } catch (err: any) {
            console.log(`[SSE] Failed writing to client ${idx}, possibly disconnected:`, err.message || err);
          }
        });

        // Offline / background system-level web push notification
        sendWebPushNotification(notif).catch(pushErr => {
          console.error("[WebPush] Background push error:", pushErr.message || pushErr);
        });
      });
    }

    try {
      await fs.writeFile(notificationsHistoryPath, JSON.stringify(deduplicatedNotifications, null, 2));
    } catch (e: any) {
      console.log("Error writing notifications local backup:", e.message || String(e));
    }

    if (supabase) {
      try {
        const rows = deduplicatedNotifications.map((n: any) => ({
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
      
      // Try to load from Supabase first
      if (supabase) {
        try {
          const { data, error } = await supabase.from("tournaments").select("data").eq("id", "player_snapshots");
          if (!error && data && data.length > 0 && Array.isArray(data[0].data)) {
            snapshots = data[0].data;
          }
        } catch (sbErr: any) {
          console.warn("Failed to load player-snapshots from Supabase:", sbErr.message);
        }
      }

      // Fallback/Bootstrap if needed
      if (snapshots.length === 0) {
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

              // Sync bootstrap to Supabase
              if (supabase) {
                await supabase.from("tournaments").upsert({ id: "player_snapshots", data: snapshots }).catch(err => {
                  console.warn("Could not sync bootstrap snapshots to Supabase:", err.message);
                });
              }
            }
          } catch (fetchErr: any) {
            console.log("[snapshots] Seeding snapshot data completed cleanly.");
            snapshots = [];
          }
        }
      }

      // Rebuild / self-heal snapshots from notifications history if thin or empty
      if (snapshots.length <= 1 && supabase) {
        try {
          const players = await getSavedPlayers(req, res);
          const rebuilt = await rebuildPlayerSnapshotsFromHistory(players);
          if (rebuilt && rebuilt.length > 0) {
            snapshots = rebuilt;
            // Backwrite to disk and database to keep state synchronized
            await fs.writeFile(snapshotsPath, JSON.stringify(snapshots, null, 2));
            await supabase.from("tournaments").upsert({ id: "player_snapshots", data: snapshots }).catch(() => {});
          }
        } catch (healErr: any) {
          console.warn("Failed to auto-heal snapshots array in endpoint:", healErr.message);
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
    const rawName = req.body.name;
    if (!rawName || typeof rawName !== 'string') {
      return res.status(400).json({ error: "Player name is required" });
    }
    const name = cleanPlayerName(rawName);
    
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

  app.get("/api/player-groups/order", requireAuth, async (req, res) => {
    try {
      const orderMap = await getPlayerGroupsOrderMap();
      res.json(orderMap);
    } catch (err: any) {
      console.error("Failed to fetch player groups order:", err);
      res.status(500).json({ error: "Failed to fetch player groups order" });
    }
  });

  app.post("/api/player-groups/order", requireAuth, async (req, res) => {
    try {
      const orderMap = req.body;
      if (!orderMap || typeof orderMap !== "object") {
        return res.status(400).json({ error: "Invalid order map" });
      }
      await savePlayerGroupsOrderMap(orderMap);
      res.json({ success: true, order: orderMap });
    } catch (err: any) {
      console.error("Failed to save player groups order:", err);
      res.status(500).json({ error: "Failed to save player groups order" });
    }
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
            const existingNotifications = await getNotificationsHistory(req, res).catch(() => []);
            const existingNotifKeys = new Set(existingNotifications.map((n: any) => 
              `${(n.player || '').toLowerCase().trim()}|${(n.body || '').toLowerCase().trim()}`
            ));

            for (const p of newPlayersInDraw) {
              const utrStr = p.utrSingles && p.utrSingles !== "-" ? `(UTR: ${p.utrSingles})` : "";
              const wtnStr = p.wtnSingles && p.wtnSingles !== "-" ? `(WTN: ${p.wtnSingles})` : "";
              const statsStr = [utrStr, wtnStr].filter(Boolean).join(" ");
              const bodyText = statsStr 
                ? `${p.name} ${statsStr} has joined the draw "${name}".`
                : `${p.name} has joined the draw "${name}".`;
              
              const bodyKey = `${p.name.toLowerCase().trim()}|${bodyText.toLowerCase().trim()}`;
              if (!existingNotifKeys.has(bodyKey)) {
                drawAlerts.push({
                  id: `draw-watcher-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                  player: p.name,
                  title: `New Player in Draw`,
                  body: bodyText,
                  type: 'Draw_Watcher',
                  source: p.source || 'TA',
                  date: new Date().toISOString().split('T')[0],
                  timestamp: new Date().toISOString(),
                  url: `/#saved-draws`
                });
                existingNotifKeys.add(bodyKey);
              }
            }
          }
        }
      }

      const newDraw = {
        id: existingIndex >= 0 ? draws[existingIndex].id : (Date.now().toString() + Math.random().toString(36).substring(7)),
        name,
        url: finalUrl,
        region: region || "AUS",
        players: deduplicatePlayers(players || []),
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

      const existingDraw = draws[drawIndex];
      const name = existingDraw.name || "Draw";
      let drawAlerts: any[] = [];
      if (Array.isArray(existingDraw.players) && existingDraw.players.length > 0 && Array.isArray(players) && players.length > 0) {
        const existingNames = new Set(existingDraw.players.map((p: any) => (p.name || '').toLowerCase().trim()));
        const newPlayersInDraw = players.filter((p: any) => p.name && !existingNames.has(p.name.toLowerCase().trim()));
        
        if (newPlayersInDraw.length > 0) {
          console.log(`[Draw Watcher - PUT] Found ${newPlayersInDraw.length} new players in draw "${name}"`);
          const existingNotifications = await getNotificationsHistory(req, res).catch(() => []);
          const existingNotifKeys = new Set(existingNotifications.map((n: any) => 
            `${(n.player || '').toLowerCase().trim()}|${(n.body || '').toLowerCase().trim()}`
          ));

          for (const p of newPlayersInDraw) {
            const utrStr = p.utrSingles && p.utrSingles !== "-" ? `(UTR: ${p.utrSingles})` : "";
            const wtnStr = p.wtnSingles && p.wtnSingles !== "-" ? `(WTN: ${p.wtnSingles})` : "";
            const statsStr = [utrStr, wtnStr].filter(Boolean).join(" ");
            const bodyText = statsStr 
              ? `${p.name} ${statsStr} has joined the draw "${name}".`
              : `${p.name} has joined the draw "${name}".`;
            
            const bodyKey = `${p.name.toLowerCase().trim()}|${bodyText.toLowerCase().trim()}`;
            if (!existingNotifKeys.has(bodyKey)) {
              drawAlerts.push({
                id: `draw-watcher-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                player: p.name,
                title: `New Player in Draw`,
                body: bodyText,
                type: 'Draw_Watcher',
                source: p.source || 'TA',
                date: new Date().toISOString().split('T')[0],
                timestamp: new Date().toISOString(),
                url: `/#saved-draws`
              });
              existingNotifKeys.add(bodyKey);
            }
          }
        }
      }

      draws[drawIndex].players = deduplicatePlayers(players);
      
      // If we got a tournamentDate and the existing URL doesn't have a date hash, append it
      if (tournamentDate && !draws[drawIndex].url.includes('#date=')) {
        draws[drawIndex].url += `#date=${encodeURIComponent(tournamentDate)}`;
      }

      await saveSavedDraws(req, res, draws);

      if (drawAlerts.length > 0) {
        try {
          const existingNotifications = await getNotificationsHistory(req, res);
          const merged = [...drawAlerts, ...existingNotifications];
          await saveNotificationsHistory(req, res, merged);
          console.log(`[Draw Watcher - PUT] Saved ${drawAlerts.length} new draw alerts to notification history.`);
        } catch (alertErr: any) {
          console.error("Failed to append draw-watcher alerts in PUT:", alertErr.message);
        }
      }

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

  app.get("/api/notifications/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Accel-Buffering", "no");

    // Flush headers to establish connection immediately
    res.flushHeaders();

    // Send standard initial comment
    res.write(": ok\n\n");

    // Add to sseClients pool
    sseClients.push(res);
    console.log(`[SSE] Client connected. Total active clients: ${sseClients.length}`);

    // Standard heartbeat/keep-alive interval
    const keepAliveInterval = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 30000);

    req.on("close", () => {
      clearInterval(keepAliveInterval);
      sseClients = sseClients.filter((client) => client !== res);
      console.log(`[SSE] Client disconnected. Total active clients: ${sseClients.length}`);
    });
  });

  app.get("/api/notifications/vapid-public-key", (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.post("/api/notifications/subscribe", async (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Invalid subscription details provided" });
    }
    
    try {
      const subs = await loadSubscriptions();
      
      const alreadySubscribed = subs.find(s => s.endpoint === subscription.endpoint);
      if (!alreadySubscribed) {
        subs.push(subscription);
        await saveSubscriptions(subs);
        console.log(`[WebPush] New browser subscription registered! Total: ${subs.length}`);
      } else {
        console.log(`[WebPush] Subscription already exists. Total: ${subs.length}`);
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("[WebPush] Failed saving subscription:", err.message);
      res.status(500).json({ error: "Failed to save subscription: " + err.message });
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

  async function refreshSavedDrawsTask() {
    console.log("[Draw Watcher BACKGROUND] Starting automatic saved draws refresh...");
    try {
      const { draws } = await getSavedDraws(null, null);
      if (!Array.isArray(draws) || draws.length === 0) {
        console.log("[Draw Watcher BACKGROUND] No saved draws to refresh.");
        return;
      }

      let existingNotifications = [];
      try {
        existingNotifications = await getNotificationsHistory(null, null);
      } catch (e) {}
      const existingNotifKeys = new Set(existingNotifications.map((n: any) => 
        `${(n.player || '').toLowerCase().trim()}|${(n.body || '').toLowerCase().trim()}`
      ));

      // Fetch currently monitored players to update existing draw player stats
      let savedPlayersForSync = [];
      try {
        savedPlayersForSync = await getSavedPlayers(null, null);
      } catch (e) {
        console.warn("[Draw Watcher BACKGROUND] Could not fetch saved players for sync:", e);
      }
      const savedPlayersMap = new Map();
      for (const p of savedPlayersForSync) {
        if (p.name) {
          savedPlayersMap.set(p.name.toLowerCase().trim(), p);
        }
      }

      let updatedAnyDraw = false;
      const globalNewAlerts: any[] = [];
      const updatedDrawsList = [...draws];

      for (let drawIndex = 0; drawIndex < draws.length; drawIndex++) {
        const draw = draws[drawIndex];
        if (!draw.url) continue;

        console.log(`[Draw Watcher BACKGROUND] Refreshing draw "${draw.name}" (${draw.url})...`);
        try {
          const cleanUrl = draw.url.split('#')[0];
          let resolvedUrl = cleanUrl;
          let drawRes: any;
          let isPreFetched = false;

          // 1. Resolve event.aspx container pages
          if (cleanUrl.includes('event.aspx')) {
            try {
              const eventPageRes = await axios.get(cleanUrl, {
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

              if (directPlayersCount > 0) {
                drawRes = eventPageRes;
                isPreFetched = true;
              } else {
                let drawLink = '';
                $eventPage('a[href*="draw.aspx?"], a[href*="/draw/"]').each((_, el) => {
                  const href = $eventPage(el).attr('href') || '';
                  if (href && !href.toLowerCase().includes('draws.aspx')) {
                    drawLink = href;
                    return false; // Break
                  }
                });
                
                if (drawLink) {
                  const domain = cleanUrl.includes("hkta") ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
                  if (!drawLink.startsWith('http')) {
                    if (drawLink.startsWith('/')) {
                      resolvedUrl = `https://${domain}${drawLink}`;
                    } else {
                      resolvedUrl = `https://${domain}/sport/${drawLink}`;
                    }
                  } else {
                    resolvedUrl = drawLink;
                  }
                }
              }
            } catch (eventErr: any) {
              console.warn(`[Draw Watcher BACKGROUND] Failed to pre-fetch event.aspx for auto-draw-resolution for "${draw.name}":`, eventErr.message);
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

          $('a[href*="player.aspx"], a[href*="/player/"], a[href*="/player-profile/"]').each((i, el) => {
            const name = cleanPlayerName($(el).text().trim());
            const href = $(el).attr('href');
            if (name && href) {
              const isGeneric = href.toLowerCase().includes('/player-profile/search') || href.toLowerCase().endsWith('/player-profile/') || href.toLowerCase().endsWith('/player-profile');
              if (!isGeneric) {
                let fullUrl = href;
                if (!href.startsWith('http')) {
                  const tDomain = draw.url.includes("hkta") ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
                  if (href.startsWith('/')) {
                    fullUrl = `https://${tDomain}${href}`;
                  } else {
                    fullUrl = `https://${tDomain}/sport/${href}`;
                  }
                }
                if (!playerLinks.some(pl => pl.url === fullUrl || pl.name.toLowerCase().trim() === name.toLowerCase().trim())) {
                  playerLinks.push({ name, url: fullUrl });
                }
              }
            }
          });

          // Sync any existing player in this draw with their latest stats from the general player list
          let drawPlayers = draw.players || [];
          let updatedPlayersInThisDraw = false;
          drawPlayers = drawPlayers.map((p: any) => {
            const match = savedPlayersMap.get((p.name || '').toLowerCase().trim());
            if (match) {
              const updatedP = {
                ...p,
                utrSingles: match.utrSingles && match.utrSingles !== "-" ? match.utrSingles : p.utrSingles,
                utrDoubles: match.utrDoubles && match.utrDoubles !== "-" ? match.utrDoubles : p.utrDoubles,
                wtnSingles: match.wtnSingles && match.wtnSingles !== "-" ? match.wtnSingles : p.wtnSingles,
                wtnDoubles: match.wtnDoubles && match.wtnDoubles !== "-" ? match.wtnDoubles : p.wtnDoubles,
                winLossSingles: match.winLossSingles && match.winLossSingles !== "-" ? match.winLossSingles : p.winLossSingles,
                winLossDoubles: match.winLossDoubles && match.winLossDoubles !== "-" ? match.winLossDoubles : p.winLossDoubles,
                points: match.points && match.points !== "-" ? match.points : p.points,
                rank: match.rank && match.rank !== "-" ? match.rank : p.rank,
              };
              if (JSON.stringify(updatedP) !== JSON.stringify(p)) {
                updatedPlayersInThisDraw = true;
              }
              return updatedP;
            }
            return p;
          });

          if (updatedPlayersInThisDraw) {
            draw.players = drawPlayers;
            updatedDrawsList[drawIndex] = draw;
            updatedAnyDraw = true;
          }

          if (playerLinks.length === 0) {
            console.log(`[Draw Watcher BACKGROUND] Scraped 0 players for "${draw.name}". Skipping.`);
            continue;
          }

          // 2. Identify new players
          const existingNames = new Set((draw.players || []).map((p: any) => (p.name || '').toLowerCase().trim()));
          const newPlayersToScrape = playerLinks.filter(pl => pl.name && !existingNames.has(pl.name.toLowerCase().trim()));

          if (newPlayersToScrape.length === 0) {
            console.log(`[Draw Watcher BACKGROUND] No new players joined the draw "${draw.name}".`);
            continue;
          }

          console.log(`[Draw Watcher BACKGROUND] Found ${newPlayersToScrape.length} new players in "${draw.name}". Fetching their details...`);
          
          // 3. Fetch detailed profile stats for ONLY the NEW players
          const limit = pLimit(2);
          const scrapedNewPlayers = await Promise.all(
            newPlayersToScrape.map(pl =>
              limit(async () => {
                try {
                  let finalProfileUrl = '';
                  if (pl.url.includes('/player-profile/')) {
                    finalProfileUrl = pl.url;
                  } else {
                    const playerPageRes = await axios.get(pl.url, {
                      headers: { "User-Agent": "Mozilla/5.0" },
                      timeout: 10000
                    });
                    const $player = cheerio.load(playerPageRes.data);
                    const tDomain = draw.url.includes("hkta") ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
                    
                    let profileRedirectUrl = '';
                    $player(`a[href*="/player-profile/"]`).each((i, el) => {
                      const text = $player(el).text().trim();
                      if (text.toLowerCase().includes(pl.name.toLowerCase().split(' ')[0])) {
                        const href = $player(el).attr('href');
                        profileRedirectUrl = href?.startsWith('http') ? href : `https://${tDomain}${href}`;
                        return false;
                      }
                    });

                    if (!profileRedirectUrl) {
                      const firstPlayerLink = $player('a[href*="/player-profile/"]').first().attr('href');
                      if (firstPlayerLink) {
                        profileRedirectUrl = firstPlayerLink.startsWith('http') ? firstPlayerLink : `https://${tDomain}${firstPlayerLink}`;
                      }
                    }

                    if (!profileRedirectUrl) {
                      $player('a[href*="/player/"]').each((i, el) => {
                        const text = $player(el).text().trim();
                        if (text.toLowerCase().includes(pl.name.toLowerCase().split(' ')[0])) {
                          const href = $player(el).attr('href');
                          profileRedirectUrl = href?.startsWith('http') ? href : `https://${tDomain}${href}`;
                          return false;
                        }
                      });
                    }

                    if (profileRedirectUrl) {
                      const redirectRes = await axios.get(profileRedirectUrl, {
                        headers: { "User-Agent": "Mozilla/5.0" },
                        timeout: 10000,
                        maxRedirects: 5
                      });
                      finalProfileUrl = redirectRes.request.res.responseUrl || profileRedirectUrl;
                    }
                  }

                  if (finalProfileUrl) {
                    const stats = await scrapePlayerProfile(finalProfileUrl, pl.name);
                    return {
                      ...stats,
                      id: Math.random().toString(36).substring(7),
                      name: pl.name,
                      profileUrl: finalProfileUrl
                    };
                  }
                  return {
                    id: Math.random().toString(36).substring(7),
                    name: pl.name,
                    rank: '-',
                    points: '-',
                    profileUrl: pl.url,
                    utrSingles: '-',
                    winLossYTD: '-',
                    wtnSingles: '-',
                    championships: '-',
                    winLossCareer: '-'
                  };
                } catch (err: any) {
                  console.error(`[Draw Watcher BACKGROUND] Error scraping player stats for "${pl.name}" in draw "${draw.name}":`, err.message || err);
                  return {
                    id: Math.random().toString(36).substring(7),
                    name: pl.name,
                    rank: '-',
                    points: '-',
                    profileUrl: pl.url,
                    utrSingles: '-',
                    winLossYTD: '-',
                    wtnSingles: '-',
                    championships: '-',
                    winLossCareer: '-'
                  };
                }
              })
            )
          );

          // 4. Merge new players into existing draw list, making sure there are no duplicate names
          const updatedPlayersList = deduplicatePlayers([...(draw.players || []), ...scrapedNewPlayers]);
          updatedDrawsList[drawIndex] = {
            ...draw,
            players: updatedPlayersList
          };
          updatedAnyDraw = true;

          // 5. Generate and queue alerts
          for (const p of scrapedNewPlayers) {
            const utrStr = p.utrSingles && p.utrSingles !== "-" ? `(UTR: ${p.utrSingles})` : "";
            const wtnStr = p.wtnSingles && p.wtnSingles !== "-" ? `(WTN: ${p.wtnSingles})` : "";
            const statsStr = [utrStr, wtnStr].filter(Boolean).join(" ");
            const bodyText = statsStr 
              ? `${p.name} ${statsStr} has joined the draw "${draw.name}".`
              : `${p.name} has joined the draw "${draw.name}".`;

            const bodyKey = `${p.name.toLowerCase().trim()}|${bodyText.toLowerCase().trim()}`;
            if (!existingNotifKeys.has(bodyKey)) {
              globalNewAlerts.push({
                id: `draw-watcher-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                player: p.name,
                title: `New Player in Draw`,
                body: bodyText,
                type: 'Draw_Watcher',
                source: draw.region === 'HK' ? 'HK' : 'TA',
                date: new Date().toISOString().split('T')[0],
                timestamp: new Date().toISOString(),
                url: `/#saved-draws`
              });
              existingNotifKeys.add(bodyKey);
            }
          }
        } catch (drawErr: any) {
          console.error(`[Draw Watcher BACKGROUND] Failed to refresh draw "${draw.name}":`, drawErr.message || drawErr);
        }
      }

      // Always save updatedDrawsList to update timestamp and satisfy UI feedback (Last Updated)
      console.log(`[Draw Watcher BACKGROUND] Saving draw lists (always saving to refresh timestamp)...`);
      await saveSavedDraws(null, null, updatedDrawsList);

      if (globalNewAlerts.length > 0) {
        console.log(`[Draw Watcher BACKGROUND] Detected ${globalNewAlerts.length} new draw watchlist entries. Saving to notification history...`);
        let existingNotifications = [];
        try {
          existingNotifications = await getNotificationsHistory(null, null);
        } catch (e) {}
        const merged = [...globalNewAlerts, ...existingNotifications];
        await saveNotificationsHistory(null, null, merged);
      }
    } catch (err: any) {
      console.error("[Draw Watcher BACKGROUND] Critical error in automatic draws refresh:", err.message || err);
    }
  }

  async function runGlobalRefreshTask(includeTournamentsScrape: boolean = true) {
    isGlobalRefreshing = true;
    isScraping = true;
    try {
      console.log(`Starting background refresh. Include tournaments scrape: ${includeTournamentsScrape}`);
      
      const players = await getSavedPlayers(null, null);
      
      const limit = pLimit(2); // Concurrency limit of 2 to avoid slamming tennis systems and timeouts
      
      // Task A: Update all player stats in a thread-safe manner
      console.log(`[Global Refresh] Step 1: Updating ${players.length} players' stats...`);
      const results = await Promise.all(
        players.map((p: any) =>
          limit(async () => {
            if (!p.url) return { player: p, changes: [] };
            try {
              const updatedStats = await scrapePlayerProfile(p.url, p.name);
              const updatedPlayer = { ...p, ...updatedStats, name: p.name };
              const newChanges = getPlayerChanges(p, updatedPlayer);
              return { player: updatedPlayer, changes: newChanges };
            } catch (e) {
              console.error(`Failed to refresh player ${p.name} in global refresh:`, e);
              return { player: p, changes: [] };
            }
          })
        )
      );

      const updatedPlayers = results.map(r => r.player);
      const allPlayerChanges = results.flatMap(r => r.changes);

      await savePlayers(null, null, updatedPlayers);
      if (allPlayerChanges.length > 0) {
        let currentNotifications = [];
        try {
          currentNotifications = await getNotificationsHistory(null, null);
        } catch (e) {
          // Ignore
        }
        const mergedNotifications = [...allPlayerChanges, ...currentNotifications];
        await saveNotificationsHistory(null, null, mergedNotifications);
        console.log(`[Global Refresh] Saved ${allPlayerChanges.length} player status notifications.`);
      }

      // Task B: Run tournaments scraper (sequentially after player updates to avoid concurrent write locks)
      if (includeTournamentsScrape) {
        console.log("[Global Refresh] Step 2: Running tournaments scraper...");
        await wrappedRunScraper().catch((e) => {
          console.error("Tournaments scraper failed during global refresh:", e);
        });
      }

      // Task C: Run draws refresh (sequentially after to avoid concurrent file write conflict)
      console.log("[Global Refresh] Step 3: Refreshing saved draws...");
      await refreshSavedDrawsTask().catch((e) => {
        console.error("Draws refresh task failed during global refresh:", e);
      });

      // 2. Now trigger tournaments-for-players cache refresh using the newly updated data
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

    isGlobalRefreshing = true;
    isScraping = true;

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

  // Run background startup sync and preloads without blocking server port binding
  (async () => {
    try {
      await syncSupabaseToLocalTournaments();
    } catch (syncErr: any) {
      console.warn("[Startup] Sync Supabase to local tournaments failed:", syncErr.message || syncErr);
    }

    try {
      const initialNotifs = await getNotificationsHistory(null, null);
      if (Array.isArray(initialNotifs)) {
        initialNotifs.forEach((n: any) => {
          if (n && n.id) {
            sentNotificationIds.add(n.id);
          }
        });
      }
      console.log(`[SSE] Preloaded ${sentNotificationIds.size} existing notification IDs for seen cache.`);
    } catch (preloadErr: any) {
      console.warn("[SSE] Error preloading notifications on startup:", preloadErr.message || preloadErr);
    }
  })();

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
