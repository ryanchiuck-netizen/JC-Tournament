import { StaticData, PlayerWatchResult } from "../types";

export async function fetchTournaments(): Promise<StaticData> {
  const response = await fetch('/api/tournaments/static');
  if (!response.ok) {
    throw new Error('Data not available yet. Scraper might be running.');
  }
  try {
    return await response.json();
  } catch (e) {
    const text = await response.text();
    console.error("fetchTournaments failed to parse JSON. Response text:", text);
    throw e;
  }
}

export async function fetchPlayers(): Promise<string[]> {
  const response = await fetch('/api/players');
  if (!response.ok) {
    return [];
  }
  try {
    return await response.json();
  } catch (e) {
    const text = await response.text();
    console.error("fetchPlayers failed to parse JSON. Response text:", text);
    throw e;
  }
}

export function getFullLink(link: string, source: "HK" | "AUS") {
  if (link.startsWith('http')) return link;
  const base = source === "HK" ? "https://hkta.tournamentsoftware.com" : "https://tournaments.tennis.com.au";
  return `${base}${link.startsWith('/') ? '' : '/'}${link}`;
}

export async function searchPlayer(name: string): Promise<PlayerWatchResult> {
  const response = await fetch(`/api/player-watch?name=${encodeURIComponent(name)}`);
  if (!response.ok) {
    try {
      const errData = await response.json();
      throw new Error(errData.error || 'Failed to search for player');
    } catch {
      throw new Error('Failed to search for player');
    }
  }
  try {
    return await response.json();
  } catch (e) {
    const text = await response.text();
    console.error("searchPlayer failed to parse JSON. Response text:", text);
    throw e;
  }
}
export function parseAnyDateToDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    january: 0, february: 1, march: 2, april: 3, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
  };

  // DD/MM/YYYY
  const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    return new Date(parseInt(slashMatch[3]), parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]));
  }

  // YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // DD-MM-YYYY
  const dashMatch = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dashMatch) {
    return new Date(parseInt(dashMatch[3]), parseInt(dashMatch[2]) - 1, parseInt(dashMatch[1]));
  }

  // 20 Sep 2026
  const wordMatch = clean.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/i);
  if (wordMatch) {
    const m = months[wordMatch[2].toLowerCase()];
    if (m !== undefined) {
      return new Date(parseInt(wordMatch[3]), m, parseInt(wordMatch[1]));
    }
  }

  // Sep 20 2026
  const mWordMatch = clean.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (mWordMatch) {
    const m = months[mWordMatch[1].toLowerCase()];
    if (m !== undefined) {
      return new Date(parseInt(mWordMatch[3]), m, parseInt(mWordMatch[2]));
    }
  }

  const parsed = new Date(clean);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function getGoogleCalendarLink(tournament: { name: string; dates: string; mapsLink?: string; link: string; source: "HK" | "AUS" }) {
  const { name, dates, mapsLink } = tournament;
  let startStr = "";
  let endStr = "";
  
  if (dates) {
    const parts = dates.split(" to ");
    const startDate = parseAnyDateToDate(parts[0]);
    const endDate = parts.length > 1 ? parseAnyDateToDate(parts[parts.length - 1]) : startDate;

    if (startDate) {
      const sYear = startDate.getFullYear();
      const sMonth = (startDate.getMonth() + 1).toString().padStart(2, '0');
      const sDay = startDate.getDate().toString().padStart(2, '0');
      startStr = `${sYear}${sMonth}${sDay}`;

      const finalEnd = endDate ? new Date(endDate) : new Date(startDate);
      finalEnd.setDate(finalEnd.getDate() + 1);
      const eYear = finalEnd.getFullYear();
      const eMonth = (finalEnd.getMonth() + 1).toString().padStart(2, '0');
      const eDay = finalEnd.getDate().toString().padStart(2, '0');
      endStr = `${eYear}${eMonth}${eDay}`;
    }
  }

  const datesParam = startStr && endStr ? `&dates=${startStr}/${endStr}` : "";
  const locationParam = mapsLink ? `&location=${encodeURIComponent(mapsLink)}` : "";
  const fullLink = getFullLink(tournament.link, tournament.source);
  const details = `${name}\n\n${fullLink}`;
  const detailsParam = `&details=${encodeURIComponent(details)}`;
  
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(name)}${datesParam}${locationParam}${detailsParam}`;
}

export function getDeadlineDaysLeft(closingDeadline?: string): number | null {
  if (!closingDeadline) return null;
  const parts = closingDeadline.split('/');
  if (parts.length === 3) {
    const deadline = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    deadline.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = deadline.getTime() - today.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  }
  return null;
}

export function parseDrawAndTournamentName(rawName: string): { tournamentName: string; eventName: string } {
  if (!rawName) return { tournamentName: 'Saved Draw', eventName: 'Draw' };
  const cleaned = rawName.trim();

  // Split on hyphens / dashes: " - ", " – ", " — "
  const parts = cleaned.split(/\s+[-–—]\s+/).map(p => p.trim()).filter(Boolean);

  if (parts.length >= 2) {
    // The last part is the specific draw / event name (e.g. "BS U10 JDS (Green Ball)", "BS 10", "10/U Boys Singles")
    const eventName = parts[parts.length - 1];
    // The preceding parts form the tournament name and venue
    const tournamentName = parts.slice(0, parts.length - 1).join(' - ');
    return { tournamentName, eventName };
  }

  // If there's no hyphen separator, check common event patterns at the end
  const eventRegex = /\b(BS\s*\d+|GS\s*\d+|BD\s*\d+|GD\s*\d+|Boys\s+\d+|Girls\s+\d+|\d+\s*u\s*(?:Green|Orange|Yellow|Singles|Doubles)?|\d+\/U\s*(?:Boys|Girls|Singles|Doubles)?|Green\s+Ball|Orange\s+Ball|Singles|Doubles)\b/i;
  const match = cleaned.match(eventRegex);
  if (match && match.index && match.index > 0) {
    const tournamentName = cleaned.slice(0, match.index).trim().replace(/[-–—\s]+$/, '');
    const eventName = cleaned.slice(match.index).trim();
    if (tournamentName && eventName) {
      return { tournamentName, eventName };
    }
  }

  return { tournamentName: cleaned, eventName: cleaned };
}

export function cleanDisplayDrawName(drawName?: string, tournamentName?: string): string {
  if (!drawName) return '';
  let cleaned = drawName.trim();

  // If the drawName contains tournamentName at start, remove it
  if (tournamentName) {
    const tClean = tournamentName.trim().toLowerCase();
    if (cleaned.toLowerCase().startsWith(tClean)) {
      cleaned = cleaned.slice(tClean.length).replace(/^[\s\-–—:]+/, '').trim();
    }
  }

  // If still contains hyphens and has multiple segments, take the last segment which is the event name
  const parts = cleaned.split(/\s+[-–—]\s+/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }

  return cleaned || drawName;
}

export function isPlayerMatch(
  savedPlayer: { id?: string; player_id?: string; name: string; url?: string; source?: string },
  candidate: { id?: string; player_id?: string; name: string; url?: string; profileUrl?: string; source?: string },
  contextRegion?: string
): boolean {
  if (!savedPlayer || !candidate) return false;

  // 1. Direct ID match
  const sId = savedPlayer.id || savedPlayer.player_id ? String(savedPlayer.id || savedPlayer.player_id).trim() : '';
  const cId = candidate.id || candidate.player_id ? String(candidate.id || candidate.player_id).trim() : '';
  if (sId && cId && sId === cId) return true;

  // 2. Direct Profile URL match (Extract GUIDs or compare normalized URL paths)
  const sUrl = (savedPlayer.url || '').toLowerCase().trim();
  const cUrl = (candidate.url || candidate.profileUrl || '').toLowerCase().trim();
  
  if (sUrl && cUrl) {
    const sGuid = sUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase();
    const cGuid = cUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase();
    if (sGuid && cGuid) {
      if (sGuid === cGuid) return true;
      // Different GUID on profile URL
      return false;
    }
    const cleanS = sUrl.split('?')[0].split('#')[0].replace(/\/+$/, '');
    const cleanC = cUrl.split('?')[0].split('#')[0].replace(/\/+$/, '');
    if (cleanS === cleanC) return true;
  }

  // 3. Source / Region compatibility check
  const sSource = (savedPlayer.source || (sUrl.includes('hkta') ? 'HKTA' : 'TA')).toUpperCase();
  const cSource = (candidate.source || (contextRegion === 'HK' || (cUrl && cUrl.includes('hkta')) ? 'HKTA' : 'TA')).toUpperCase();

  // If savedPlayer is explicitly HKTA and tournament/draw is TA, do not match (and vice versa)
  if (sSource === 'HKTA' && (cSource === 'TA' || cSource === 'AUS' || (cUrl && cUrl.includes('tennis.com.au')) || contextRegion === 'AUS')) {
    return false;
  }
  if ((sSource === 'TA' || sSource === 'AUS') && (cSource === 'HKTA' || cSource === 'HK' || (cUrl && cUrl.includes('hkta')) || contextRegion === 'HK')) {
    return false;
  }

  // 4. Name Matching
  const sName = (savedPlayer.name || '').trim();
  const cName = (candidate.name || '').trim();
  if (!sName || !cName) return false;

  // Exact string match (case-insensitive)
  if (sName.toLowerCase() === cName.toLowerCase()) return true;

  // Extract variants from savedPlayer name, e.g. "Andy (Yuhao) Liu"
  const getVariants = (name: string): string[][] => {
    const clean = name.replace(/\[.*?\]/g, '').trim(); // strip seeds [1]
    const parenMatch = clean.match(/\((.*?)\)/);
    const variants: string[][] = [];

    if (parenMatch) {
      const alias = parenMatch[1].trim();
      const withoutParen = clean.replace(/\(.*?\)/g, ' ').trim();
      
      const wordsMain = withoutParen.toLowerCase().split(/[\s,.-]+/).filter(Boolean);
      const wordsAlias = (withoutParen.split(/[\s,.-]+/)[0] + ' ' + alias).toLowerCase().split(/[\s,.-]+/).filter(Boolean);
      const wordsAll = clean.toLowerCase().split(/[\s,.-]+/).filter(Boolean);

      if (wordsMain.length > 0) variants.push(wordsMain);
      if (wordsAlias.length > 0) variants.push(wordsAlias);
      if (wordsAll.length > 0) variants.push(wordsAll);
    } else {
      const words = clean.toLowerCase().split(/[\s,.-]+/).filter(Boolean);
      if (words.length > 0) variants.push(words);
    }
    return variants;
  };

  const candClean = cName.replace(/\[.*?\]|\(.*?\)/g, '').toLowerCase().trim();
  const candWords = candClean.split(/[\s,.-]+/).filter(Boolean);
  if (candWords.length === 0) return false;

  const savedVariants = getVariants(sName);

  return savedVariants.some(variantWords => {
    if (variantWords.length !== candWords.length) return false;
    const sortedV = [...variantWords].sort().join(' ');
    const sortedC = [...candWords].sort().join(' ');
    return sortedV === sortedC;
  });
}

export const getStateFromPostcode = (pc: string): string | null => {
  const code = parseInt(pc, 10);
  if (isNaN(code)) return null;
  if (code >= 2600 && code <= 2619) return 'ACT';
  if (code >= 2900 && code <= 2920) return 'ACT';
  if (code >= 1000 && code <= 2599) return 'NSW';
  if (code >= 2620 && code <= 2899) return 'NSW';
  if (code >= 2921 && code <= 2999) return 'NSW';
  if ((code >= 3000 && code <= 3999) || (code >= 8000 && code <= 8999)) return 'VIC';
  if ((code >= 4000 && code <= 4999) || (code >= 9000 && code <= 9999)) return 'QLD';
  if (code >= 5000 && code <= 5999) return 'SA';
  if (code >= 6000 && code <= 6999) return 'WA';
  if (code >= 7000 && code <= 7999) return 'TAS';
  if (code >= 800 && code <= 899) return 'NT';
  return null;
};

export const getTournamentState = (t: { name: string; mapsLink?: string; location?: string; source: "HK" | "AUS" }): string => {
  if (t.source !== 'AUS') return '';
  const locationText = t.location || '';
  const text = (decodeURIComponent(t.mapsLink || '') + ' ' + locationText + ' ' + t.name).toLowerCase();
  
  // Try state code / name first
  if (/\b(nsw|new south wales)\b/.test(text) || text.includes(',nsw') || text.includes(' nsw')) return 'NSW';
  if (/\b(vic|victoria|melbourne|ao26)\b/.test(text) || text.includes(',vic') || text.includes(' vic')) return 'VIC';
  if (/\b(qld|queensland)\b/.test(text) || text.includes(',qld') || text.includes(' qld')) return 'QLD';
  if (/\b(wa|western australia|perth)\b/.test(text) || text.includes(',wa') || text.includes(' wa')) return 'WA';
  if (/\b(sa|south australia|adelaide)\b/.test(text) || text.includes(',sa') || text.includes(' sa')) return 'SA';
  if (/\b(tas|tasmania|hobart)\b/.test(text) || text.includes(',tas') || text.includes(' tas')) return 'TAS';
  if (/\b(act|australian capital territory|canberra)\b/.test(text) || text.includes(',act') || text.includes(' act')) return 'ACT';
  if (/\b(nt|northern territory|darwin)\b/.test(text) || text.includes(',nt') || text.includes(' nt')) return 'NT';

  // Geographic context mapping for common locations
  if (/\b(sydney|parramatta|macquarie|ballina|newcastle|wollongong|coffs|albury|picton|nepean|dubbo|wagga|tamworth|nelson bay|gosford|penrith|bathurst|orange|leumeah|asquith|rockdale|tweed heads|springwood|ulladulla|castle hill|forster|naremburn|bomaderry|inverell|gloucester|grafton|wyong|batemans bay|goulburn|lismore|kooroora|griffith|terranora|merimbula|homebush|pennant hills)\b/i.test(text)) return 'NSW';
  if (/\b(geelong|bendigo|ballarat|shepparton|wangaratta|frankston|craigieburn|rosebud|leongatha|benalla|ringwood|mildura|warrnambool|traralgon|latrobe|sunbury|werribee|kyneton|altona|essendon|lara|taylors lakes|armadale|point lonsdale|drysdale|epping|heathmont|coburg|herne hill|gisborne|boronia|fawkner|pakenham|parkville|rye|ivanhoe|glen iris|carnegie|caroline springs|malvern east|kooyong|toorak|tullamarine|bairnsdale|templestowe|kerang|myrtleford|hurstbridge|somerville|wodonga|eynesbury|balwyn north|cobram|donald|wycheproof|kew|hawthorn|fitzroy|echuca|yea|maffra|nathalia|cohuna|robinvale|st arnaud|swan hill|brighton|mornington|dendy park|parkdale|dingley|doveton|macedon|red hill)\b/i.test(text)) return 'VIC';
  if (/\b(brisbane|gold coast|cairns|townsville|toowoomba|sunshine coast|rockhampton|mackay|bundaberg|gympie|gladstone|noosa|yeppoon|mooloolaba|springfield central|beenleigh|buddina|ingham|emerald|tara|proserpine|charters towers|carrara|goondiwindi|hervey bay)\b/i.test(text)) return 'QLD';
  if (/\b(perth|fremantle|bunbury|geraldton|kalgoorlie|albany|mandurah|busselton|duncraig|margaret river|menora|bridgetown)\b/i.test(text)) return 'WA';
  if (/\b(adelaide|henley|millswood|gawler|mount gambier|whyalla|murray bridge|port lincoln|victor harbor|kensington gardens|seacliff|elizabeth east|lucindale|woodville|marleston|aberfoyle park|west lakes shore|banksia park|tea tree gully|kadina|loxton|clare|renmark|beverley|broadview|colonel light gardens)\b/i.test(text)) return 'SA';
  if (/\b(hobart|launceston|devonport|burnie|ulverstone|cygnet)\b/i.test(text)) return 'TAS';
  if (/\b(canberra|tuggeranong|belconnen|gungahlin|woden|lyneham|weston creek)\b/i.test(text)) return 'ACT';
  if (/\b(darwin|alice springs|palmerston|katherine)\b/i.test(text)) return 'NT';

  // Try postcode match in mapsLink or location ONLY (avoid getting year like 2026 from name)
  const searchAddress = (decodeURIComponent(t.mapsLink || '') + ' ' + locationText).toLowerCase();
  const postcodes = searchAddress.match(/\b\d{4}\b/g);
  if (postcodes) {
    for (const pc of postcodes) {
      if (pc !== '2024' && pc !== '2025' && pc !== '2026' && pc !== '2027') {
        const state = getStateFromPostcode(pc);
        if (state) {
          return state;
        }
      }
    }
  }

  return 'Unknown';
};

