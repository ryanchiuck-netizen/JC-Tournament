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
  location?: string;
  distance?: string;
  mapsLink?: string;
  closingDeadline?: string;
}

async function fetchPage(
  url: string,
  page: number,
  source: "HK" | "AUS",
  existingLinks: Set<string> = new Set(),
  startDate: string = "2026-01-01",
  endDate: string = "2036-12-31",
  existingDetails: Record<string, { mapsLink?: string; closingDeadline?: string; location?: string }> = {}
): Promise<{ tournaments: Tournament[], players: string[] }> {
  const params = new URLSearchParams();
  params.append("Page", page.toString());
  params.append("TournamentExtendedFilter.SportID", "0");
  params.append("TournamentFilter.DateFilterType", "0");
  params.append("TournamentFilter.StartDate", startDate);
  params.append("TournamentFilter.EndDate", endDate);

  const response = await axios.post(url, params.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest"
    },
    timeout: 10000
  });

  const $ = cheerio.load(response.data);
  const results: Tournament[] = [];

  const items = $("li.list__item").toArray();
  for (const el of items) {
    const nameEl = $(el).find("h4 a");
    const name = nameEl.text().trim();
    if (!name) continue;

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
    if (source === "AUS") {
      const subheading = $(el).find(".media__subheading").text();
      const match = subheading.match(/\(([\d.]+\s*km)\)/i);
      if (match) {
        distance = match[1];
      }
    }

    const locationSpan = $(el).find(".media__subheading").first().find(".nav-link__value");
    const tLocationText = locationSpan.length > 0 ? locationSpan.text().trim() : $(el).find(".media__subheading").first().text().trim();
    const locationClean = tLocationText.replace(/\s+/g, " ").trim();

    // Re-use already populated parameters if they exist in tournaments.json
    let mapsLink = existingDetails[link]?.mapsLink;
    let closingDeadline = existingDetails[link]?.closingDeadline;

    if (!mapsLink && locationClean) {
      if (source === "AUS") {
        mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationClean + ", Australia")}`;
      } else {
        mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationClean + ", Hong Kong")}`;
      }
    }

    results.push({
      name,
      dates,
      link,
      ageGroup,
      source,
      location: locationClean,
      distance,
      mapsLink,
      closingDeadline
    });
  }

  return {
    tournaments: results,
    players: []
  };
}

export async function runScraper() {
  console.log("Starting daily high-speed scraper...");
  const allTournaments: Tournament[] = [];
  const allPlayers = new Set<string>();

  const dataPath = path.join(process.cwd(), "public", "tournaments.json");
  const playersPath = path.join(process.cwd(), "public", "players.json");

  // Load existing details to avoid re-scraping and preserve manual edits
  let existingDetails: Record<string, { mapsLink?: string; closingDeadline?: string; location?: string }> = {};
  try {
    const rawContent = await fs.readFile(dataPath, "utf-8");
    const parsed = JSON.parse(rawContent);
    if (parsed && Array.isArray(parsed.tournaments)) {
      for (const t of parsed.tournaments) {
        if (t.link) {
          existingDetails[t.link] = {
            mapsLink: t.mapsLink,
            closingDeadline: t.closingDeadline,
            location: t.location
          };
        }
      }
    }
    console.log(`Reused detail maps/deadlines for ${Object.keys(existingDetails).length} existing tournaments.`);
  } catch {
    // File doesn't exist yet, start clean
  }

  try {
    // 1. Scrape HK
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      console.log(`Fetching HK page ${page}...`);
      const { tournaments } = await fetchPage(
        "https://hkta.tournamentsoftware.com/find/tournament/DoSearch", 
        page, 
        "HK", 
        new Set(allTournaments.map(t => t.link)),
        "2026-01-01",
        "2036-12-31",
        existingDetails
      );

      if (tournaments.length === 0) {
        hasMore = false;
      } else {
        const newResults = tournaments.filter(nr => !allTournaments.some(at => at.link === nr.link));
        if (newResults.length === 0) {
          hasMore = false;
        } else {
          allTournaments.push(...newResults);
          page++;
        }
      }
      if (page > 20) hasMore = false;
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Save initial HK data
    await fs.writeFile(dataPath, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      tournaments: allTournaments
    }, null, 2));

    // 2. Scrape AUS month-by-month for the current year (2026) to bypass the 400 results filter cap
    const year = 2026;
    const dateRanges: { start: string; end: string }[] = [];
    for (let month = 1; month <= 12; month++) {
      const startDay = "01";
      const startMonth = month.toString().padStart(2, "0");
      const endDay = new Date(year, month, 0).getDate().toString().padStart(2, "0");
      dateRanges.push({
        start: `${year}-${startMonth}-${startDay}`,
        end: `${year}-${startMonth}-${endDay}`
      });
    }
    // Include 2027-2028 as well
    dateRanges.push({
      start: `${year + 1}-01-01`,
      end: `${year + 2}-12-31`
    });

    for (const range of dateRanges) {
      console.log(`Starting AUS search for range: ${range.start} to ${range.end}...`);
      let rangePage = 1;
      let rangeHasMore = true;
      while (rangeHasMore) {
        console.log(`Fetching AUS range ${range.start} to ${range.end}, page ${rangePage}...`);
        const { tournaments } = await fetchPage(
          "https://tournaments.tennis.com.au/find/tournament/DoSearch",
          rangePage,
          "AUS",
          new Set(allTournaments.map(t => t.link)),
          range.start,
          range.end,
          existingDetails
        );

        if (tournaments.length === 0) {
          rangeHasMore = false;
        } else {
          const newResults = tournaments.filter(nr => !allTournaments.some(at => at.link === nr.link));
          if (newResults.length === 0) {
            rangeHasMore = false;
          } else {
            allTournaments.push(...newResults);
            
            // Write progressively so that tournaments load IMMEDIATELY in the frontend!
            await fs.writeFile(dataPath, JSON.stringify({
              lastUpdated: new Date().toISOString(),
              tournaments: allTournaments
            }, null, 2));
            
            rangePage++;
          }
        }
        if (rangePage > 100) rangeHasMore = false;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`Initial listing scrape complete. Saved ${allTournaments.length} tournaments.`);

    // 3. Sequential Background Detail Enrichment (Closing Deadlines) for Upcoming/Future Tournaments
    const nowLocal = new Date();
    nowLocal.setHours(0, 0, 0, 0);

    const upcomingTournaments = allTournaments.filter(t => {
      if (t.closingDeadline) return false;
      if (!t.dates) return false;

      try {
        const parts = t.dates.split(" to ");
        const dateToParse = parts[parts.length - 1].trim();
        const [day, month, dYear] = dateToParse.split("/");
        if (!day || !month || !dYear) return false;
        const endDate = new Date(parseInt(dYear, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        return endDate >= nowLocal;
      } catch {
        return false;
      }
    });

    console.log(`Background enricher: Found ${upcomingTournaments.length} upcoming tournaments to process.`);

    let enrichCount = 0;
    for (const t of upcomingTournaments) {
      try {
        const idMatch = t.link.match(/id=([^&]+)/i);
        if (idMatch) {
          const tournamentId = idMatch[1];
          const domain = t.source === "HK" ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
          const tournamentUrl = `https://${domain}/tournament/${tournamentId}`;

          console.log(`Background enriching (${enrichCount + 1}/${upcomingTournaments.length}): ${t.name}...`);
          const tRes = await axios.get(tournamentUrl, { timeout: 6000 });
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
                  let dYear = year;
                  const yearMatch = t.dates.match(/\d{4}/);
                  if (yearMatch) {
                    dYear = parseInt(yearMatch[0], 10);
                  }
                  t.closingDeadline = `${day}/${month + 1}/${dYear}`;
                }
              }
            }
          });

          enrichCount++;
          // Periodically save to tournaments.json
          if (enrichCount % 5 === 0 || enrichCount === upcomingTournaments.length) {
            await fs.writeFile(dataPath, JSON.stringify({
              lastUpdated: new Date().toISOString(),
              tournaments: allTournaments
            }, null, 2));
            console.log(`Background enricher saved progress: ${enrichCount} tournaments updated.`);
          }

          // Politeness delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      } catch (err: any) {
        console.error(`Background enricher failed for ${t.name}:`, err.message);
      }
    }

    console.log("Scraping and background enrichment complete.");
  } catch (error) {
    console.error("Error during scraping:", error);
  }
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runScraper();
}
