import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import { runScraper } from "./scraper.js";
import cron from "node-cron";

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
