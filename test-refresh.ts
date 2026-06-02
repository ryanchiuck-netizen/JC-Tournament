import fs from "fs/promises";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

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

async function run() {
  const dataPath = path.join(process.cwd(), "public", "tournaments.json");
  const savedPlayersPath = path.join(process.cwd(), "public", "saved-players.json");

  const playersData = await fs.readFile(savedPlayersPath, "utf-8");
  const savedPlayers = JSON.parse(playersData);
  console.log(`Loaded ${savedPlayers.length} saved players.`);

  const tournamentsData = await fs.readFile(dataPath, "utf-8");
  const { tournaments } = JSON.parse(tournamentsData);
  console.log(`Loaded ${tournaments.length} total tournaments.`);

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

  console.log(`Found ${futureTournaments.length} future tournaments.`);
  
  // Analyze subsets by day range
  const now = new Date();
  const getWithinDays = (days: number) => {
    const limitDate = new Date();
    limitDate.setDate(now.getDate() + days);
    return futureTournaments.filter((t: any) => {
      if (!t.dates) return false;
      const parts = t.dates.split(' to ');
      const dateToParse = parts[0].trim(); // start date of tournament
      const [day, month, year] = dateToParse.split('/');
      if (!day || !month || !year) return false;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return date <= limitDate;
    });
  };

  console.log(`Tournaments starting in next 30 days: ${getWithinDays(30).length}`);
  console.log(`Tournaments starting in next 45 days: ${getWithinDays(45).length}`);
  console.log(`Tournaments starting in next 60 days: ${getWithinDays(60).length}`);
  console.log(`Tournaments starting in next 90 days: ${getWithinDays(90).length}`);

  if (futureTournaments.length > 0) {
    console.log("First 3 future tournaments:", futureTournaments.slice(0, 3));
  }

  // Let's test player matching for the first 5 future tournaments
  for (const tournament of futureTournaments.slice(0, 5)) {
    const likelyPlayers = savedPlayers.filter((player: any) => {
      if (tournament.source === "HK" && player.source !== "HKTA") return false;
      if (tournament.source === "AUS" && player.source !== "TA") return false;

      if (tournament.players && tournament.players.length > 0) {
        const queryParts = getQueryParts(player.name);
        return tournament.players.some((tPlayerName: string) => 
           isPlayerNameMatch(tPlayerName, queryParts)
        );
      }
      return true;
    });

    console.log(`Tournament: "${tournament.name}" (${tournament.source}) has ${likelyPlayers.length} likely players.`);
    if (likelyPlayers.length > 0) {
      console.log(`  Likely players: ${likelyPlayers.slice(0, 3).map((p: any) => p.name).join(", ")}`);
      // Try to fetch for just one
      const domain = tournament.source === "HK" ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
      const id = tournament.link.split("id=")[1];
      const playersUrl = `https://${domain}/tournament/${id}/Players/GetPlayersContent`;
      console.log(`  Fetching: ${playersUrl}`);
      try {
        const response = await axios.get(playersUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "X-Requested-With": "XMLHttpRequest"
          },
          timeout: 5000
        });
        console.log(`  Response status: ${response.status}, HTML length: ${response.data.length}`);
        const dataLower = response.data.toLowerCase().replace(/[,.]/g, '');
        const matches = likelyPlayers.filter((player: any) => {
          const queryParts = getQueryParts(player.name);
          return queryParts.every(part => dataLower.includes(part));
        });
        console.log(`  Matched in HTML: ${matches.map((p: any) => p.name).join(", ")}`);
      } catch (err: any) {
        console.log(`  Fetch failed: ${err.message}`);
      }
    }
  }
}

run().catch(console.error);
