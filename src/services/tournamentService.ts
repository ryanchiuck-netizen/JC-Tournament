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

