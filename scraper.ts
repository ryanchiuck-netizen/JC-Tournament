import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";

export interface Tournament {
  name: string;
  dates: string;
  link: string;
  ageGroup: string;
  source: "HK" | "AUS";
  distance?: string;
  mapsLink?: string;
  closingDeadline?: string;
}

async function fetchPage(url: string, page: number, source: "HK" | "AUS"): Promise<{ tournaments: Tournament[], players: string[] }> {
  const params = new URLSearchParams();
  params.append("Page", page.toString());
  params.append("TournamentExtendedFilter.SportID", "0");
  params.append("TournamentFilter.DateFilterType", "0");
  params.append("TournamentFilter.StartDate", "2026-01-01");
  params.append("TournamentFilter.EndDate", "2026-12-31");
  
  if (source === "AUS") {
    params.append("TournamentExtendedFilter.OrganizationStateList[0]", "NSW");
    params.append("TournamentFilter.PostalCode", "2032");
  }

  const response = await axios.post(url, params.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest"
    },
    timeout: 10000
  });

  const $ = cheerio.load(response.data);
  const playersSet = new Set<string>();

  const items = $("li.list__item").toArray();
  const results: Tournament[] = await Promise.all(items.map(async (el) => {
    const nameEl = $(el).find("h4 a");
    const name = nameEl.text().trim();
    const link = nameEl.attr("href") || "";
    const dates = $(el).find("time").map((_, t) => $(t).text().trim()).get().join(" to ") || $(el).find(".media__subheading").text().trim();
    
    let ageGroups: string[] = [];
    const nameLower = name.toLowerCase();
    const subheadingLower = $(el).find(".media__subheading").text().toLowerCase();
    const searchString = nameLower + " " + subheadingLower;
    
    const isU10 = searchString.includes("10 & under") || 
                  searchString.includes("u10") || 
                  searchString.includes("10u") || 
                  searchString.includes("10/u") ||
                  searchString.includes("under 10") ||
                  /\b[gb]10\b/.test(searchString) ||
                  searchString.includes("mini green");
                   
    const isU12 = searchString.includes("12 & under") || 
                  searchString.includes("u12") || 
                  searchString.includes("12u") || 
                  searchString.includes("12/u") ||
                  searchString.includes("under 12") ||
                  /\b[gb]12\b/.test(searchString);

    if (isU10) ageGroups.push("U10");
    if (isU12) ageGroups.push("U12");

    // If it's a junior tournament but doesn't specify age, assume it has both U10 and U12
    if (ageGroups.length === 0) {
      if (nameLower.includes("novice")) {
        ageGroups.push("U10");
      } else if (nameLower.includes("junior") || 
          nameLower.includes("jr") || 
          nameLower.includes("青少年") ||
          /\bj\d+\b/.test(nameLower)) {
        ageGroups.push("U10", "U12");
      } else {
        ageGroups.push("All Ages");
      }
    }

    // Specific overrides based on user feedback
    if (name.includes("JDS CBC Green Northumberland RMS - Lake Macquarie #1")) {
      ageGroups = ["U10", "U12", "All Ages"];
    } else if (name.includes("O3k J125 Shoalhaven Open & Junior")) {
      ageGroups = ["U12", "All Ages"];
    } else if (name.includes("Mini Tennis District Inter-Primary Schools Competitions")) {
      ageGroups = ["All Ages"];
    } else if (name.includes("Tennis For All Junior")) {
      ageGroups = ["All Ages"];
    } else if (name.includes("JDS CBC Green North West RMS - Glen Innes")) {
      ageGroups = ["U10", "U12", "All Ages"];
    } else if (name.includes("JDS CBC Green Central West RMS - Nepean")) {
      ageGroups = ["U10", "All Ages"];
    } else if (name.includes("2026 J250 NSW Age")) {
      ageGroups = ["U12", "All Ages"];
    } else if (name.includes("JDS CBC Green South East RMS - Picton")) {
      ageGroups = ["U10", "U12"];
    }

    const ageGroup = ageGroups.join(", ");

    let distance = undefined;
    let mapsLink = undefined;
    let closingDeadline = undefined;
    
    if (source === "AUS") {
      const subheading = $(el).find(".media__subheading").text();
      const match = subheading.match(/\(([\d.]+\s*km)\)/i);
      if (match) {
        distance = match[1];
      }
    }
      
    if (link) {
      try {
        const idMatch = link.match(/id=([^&]+)/i);
        if (idMatch) {
          const tournamentId = idMatch[1];
          const domain = source === "HK" ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
          const tournamentUrl = `https://${domain}/tournament/${tournamentId}`;
          const playersUrl = `https://${domain}/tournament/${tournamentId}/Players/GetPlayersContent`;
            
          // Fetch tournament page for deadline and maps
          const tRes = await axios.get(tournamentUrl, { timeout: 5000 });
          const $t = cheerio.load(tRes.data);
          
          $t("*").each((_, tEl) => {
            const text = $t(tEl).clone().children().remove().end().text().trim();
            if (text === "Closing deadline" || text === "Entry deadline") {
              const deadlineStr = $t(tEl).next().text().trim();
              const match = deadlineStr.match(/[A-Za-z]{3}\s+(\d{1,2})\s+([A-Za-z]{3})/);
              if (match) {
                const day = parseInt(match[1], 10);
                const monthStr = match[2];
                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const month = months.indexOf(monthStr);
                if (month !== -1) {
                  let year = 2026;
                  const yearMatch = dates.match(/\d{4}/);
                  if (yearMatch) {
                    year = parseInt(yearMatch[0], 10);
                    const tMonthMatch = dates.match(/\d{1,2}\/(\d{1,2})\/\d{4}/);
                    if (tMonthMatch) {
                      const tMonth = parseInt(tMonthMatch[1], 10) - 1;
                      if (tMonth <= 2 && month >= 10) {
                        year -= 1;
                      }
                    }
                  }
                  closingDeadline = `${day}/${month + 1}/${year}`;
                }
              }
            }
          });

          if (source === "AUS") {
            const factsheetUrl = `https://tournaments.tennis.com.au/tournament/${tournamentId}/Factsheet`;
            const fsRes = await axios.get(factsheetUrl, { timeout: 3000 });
            const $fs = cheerio.load(fsRes.data);
            $fs("a").each((_, aEl) => {
              const text = $fs(aEl).text().trim();
              const href = $fs(aEl).attr("href");
              if (text.toLowerCase().includes("maps") || (href && href.includes("maps"))) {
                mapsLink = href;
              }
            });
          }

          // Fetch players for this tournament
          try {
            const pRes = await axios.get(playersUrl, {
              headers: { "X-Requested-With": "XMLHttpRequest" },
              timeout: 5000
            });
            const $p = cheerio.load(pRes.data);
            $p("li.js-alphabet-list-item").each((_, pEl) => {
              const pName = $p(pEl).find(".media__title").text().trim();
              if (pName) playersSet.add(pName);
            });
          } catch (pe) {
            // Ignore player fetch errors
          }
        }
      } catch (e) {
        // Silent fail for factsheet or tournament page
      }
    }

    if (name) {
      return { name, dates, link, ageGroup, source, distance, mapsLink, closingDeadline };
    }
    return null;
  }));

  return {
    tournaments: results.filter((r): r is Tournament => r !== null),
    players: Array.from(playersSet)
  };
}

export async function runScraper() {
  console.log("Starting daily scraper...");
  const allTournaments: Tournament[] = [];
  const allPlayers = new Set<string>();

  try {
    // Scrape HK
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      console.log(`Fetching HK page ${page}...`);
      const { tournaments, players } = await fetchPage("https://hkta.tournamentsoftware.com/find/tournament/DoSearch", page, "HK");
      players.forEach(p => allPlayers.add(p));

      if (tournaments.length === 0) {
        hasMore = false;
      } else {
        // Deduplicate
        const newResults = tournaments.filter(nr => !allTournaments.some(at => at.link === nr.link));
        if (newResults.length === 0 && tournaments.length > 0) {
          hasMore = false;
        } else {
          allTournaments.push(...newResults);
          page++;
        }
      }
      if (page > 20) hasMore = false; 
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Save HK data
    const dataPath = path.join(process.cwd(), "public", "tournaments.json");
    const playersPath = path.join(process.cwd(), "public", "players.json");

    await fs.writeFile(dataPath, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      tournaments: allTournaments
    }, null, 2));
    await fs.writeFile(playersPath, JSON.stringify(Array.from(allPlayers).sort(), null, 2));

    // Scrape AUS
    page = 1;
    hasMore = true;
    while (hasMore) {
      console.log(`Fetching AUS page ${page}...`);
      const { tournaments, players } = await fetchPage("https://tournaments.tennis.com.au/find/tournament/DoSearch", page, "AUS");
      players.forEach(p => allPlayers.add(p));

      if (tournaments.length === 0) {
        hasMore = false;
      } else {
        const newResults = tournaments.filter(nr => !allTournaments.some(at => at.link === nr.link));
        allTournaments.push(...newResults);
        page++;
        
        await fs.writeFile(dataPath, JSON.stringify({
          lastUpdated: new Date().toISOString(),
          tournaments: allTournaments
        }, null, 2));
        await fs.writeFile(playersPath, JSON.stringify(Array.from(allPlayers).sort(), null, 2));
      }
      if (page > 20) hasMore = false;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Scraping complete. Saved ${allTournaments.length} tournaments and ${allPlayers.size} players.`);
  } catch (error) {
    console.error("Error during scraping:", error);
  }
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runScraper();
}
