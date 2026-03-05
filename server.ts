import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import { runScraper } from "./scraper.js";
import cron from "node-cron";
import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

async function startServer() {
  const app = express();
  const PORT = 3000;

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
  app.get("/api/tournaments/static", async (req, res) => {
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

  // API route for Player Watch
  app.get("/api/player-watch", async (req, res) => {
    const playerName = req.query.name as string;
    if (!playerName) {
      return res.status(400).json({ error: "Player name is required" });
    }

    try {
      const data = await fs.readFile(dataPath, "utf-8");
      const { tournaments } = JSON.parse(data);
      
      const limit = pLimit(5);
      const matches: any[] = [];

      const searchTasks = tournaments.map((tournament: any) => 
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

            // Quick check if name exists in HTML before parsing
            if (response.data.toLowerCase().includes(playerName.toLowerCase())) {
              const $ = cheerio.load(response.data);
              let playerDetailLink = "";

              $("li.js-alphabet-list-item").each((i, el) => {
                const name = $(el).find(".media__title").text().trim();
                if (name.toLowerCase().includes(playerName.toLowerCase())) {
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
                
                $detail(".media__subheading a").each((i, el) => {
                  const drawName = $detail(el).text().trim();
                  const drawLink = $detail(el).attr("href");
                  matches.push({
                    tournamentName: tournament.name,
                    tournamentLink: `https://${domain}${tournament.link}`,
                    drawName: drawName,
                    drawLink: drawLink ? `https://${domain}${drawLink}` : undefined
                  });
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
