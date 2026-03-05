import { StaticData, PlayerWatchResult } from "../types";

export async function fetchTournaments(): Promise<StaticData> {
  const response = await fetch('/api/tournaments/static');
  if (!response.ok) {
    throw new Error('Data not available yet. Scraper might be running.');
  }
  return response.json();
}

export function getFullLink(link: string, source: "HK" | "AUS") {
  if (link.startsWith('http')) return link;
  const base = source === "HK" ? "https://hkta.tournamentsoftware.com" : "https://tournaments.tennis.com.au";
  return `${base}${link.startsWith('/') ? '' : '/'}${link}`;
}

export async function searchPlayer(name: string): Promise<PlayerWatchResult> {
  const response = await fetch(`/api/player-watch?name=${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error('Failed to search for player');
  }
  return response.json();
}
export function getGoogleCalendarLink(tournament: { name: string; dates: string; mapsLink?: string; link: string; source: "HK" | "AUS" }) {
  const { name, dates, mapsLink } = tournament;
  let startStr = "";
  let endStr = "";
  
  const parts = dates.split(" to ");
  if (parts.length === 2) {
    const startMatch = parts[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const endMatch = parts[1].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    
    if (startMatch && endMatch) {
      const start = `${startMatch[3]}${startMatch[2].padStart(2, '0')}${startMatch[1].padStart(2, '0')}`;
      const endDate = new Date(parseInt(endMatch[3]), parseInt(endMatch[2]) - 1, parseInt(endMatch[1]) + 1);
      const end = `${endDate.getFullYear()}${(endDate.getMonth() + 1).toString().padStart(2, '0')}${endDate.getDate().toString().padStart(2, '0')}`;
      startStr = start;
      endStr = end;
    }
  } else {
    const match = dates.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      const start = `${match[3]}${match[2].padStart(2, '0')}${match[1].padStart(2, '0')}`;
      const endDate = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]) + 1);
      const end = `${endDate.getFullYear()}${(endDate.getMonth() + 1).toString().padStart(2, '0')}${endDate.getDate().toString().padStart(2, '0')}`;
      startStr = start;
      endStr = end;
    }
  }

  const datesParam = startStr && endStr ? `&dates=${startStr}/${endStr}` : "";
  const locationParam = mapsLink ? `&location=${encodeURIComponent(mapsLink)}` : "";
  const fullLink = getFullLink(tournament.link, tournament.source);
  const details = `${name}\n\n${fullLink}`;
  const detailsParam = `&details=${encodeURIComponent(details)}`;
  
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(name)}${datesParam}${locationParam}${detailsParam}`;
}
