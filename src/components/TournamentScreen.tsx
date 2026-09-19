import { useState, useEffect, useMemo } from 'react';
import { Trophy, Calendar, MapPin, Users, ChevronDown, ChevronUp, CalendarPlus, RefreshCw, Layers, Trash2, ExternalLink, Clock, ArrowUpDown, Search, X } from 'lucide-react';
import { getGoogleCalendarLink, parseAnyDateToDate, getDeadlineDaysLeft, parseDrawAndTournamentName, cleanDisplayDrawName, isPlayerMatch } from '../services/tournamentService';
import { Tournament } from '../types';

function normalizeUrl(urlStr: string): string {
  if (!urlStr) return '';
  return urlStr.split('#')[0].toLowerCase().trim();
}

export const formatDateToDdMmYyyy = (dateStr: string): string => {
  if (!dateStr) return '';
  const cleanStr = dateStr.trim();
  if (!cleanStr) return '';

  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthsFull = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

  const getMonthIndex = (str: string): number => {
    const s = str.toLowerCase();
    let idx = months.findIndex(m => s.includes(m));
    if (idx === -1) {
      idx = monthsFull.findIndex(m => s.includes(m));
    }
    return idx;
  };

  // Zero padding helper
  const pad = (num: number) => num.toString().padStart(2, '0');

  // Helper to format Date object to DD/MM/YYYY
  const formatDateObj = (d: Date) => {
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  // 1. DD/MM/YYYY or D/M/YYYY
  const ddMmyYyyyMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddMmyYyyyMatch) {
    const day = parseInt(ddMmyYyyyMatch[1], 10);
    const month = parseInt(ddMmyYyyyMatch[2], 10);
    const year = parseInt(ddMmyYyyyMatch[3], 10);
    return `${pad(day)}/${pad(month)}/${year}`;
  }

  // 2. YYYY-MM-DD
  const yyyyMmDdMatch = cleanStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (yyyyMmDdMatch) {
    const year = parseInt(yyyyMmDdMatch[1], 10);
    const month = parseInt(yyyyMmDdMatch[2], 10);
    const day = parseInt(yyyyMmDdMatch[3], 10);
    return `${pad(day)}/${pad(month)}/${year}`;
  }

  // 3. DD-MM-YYYY
  const ddMmYyyyDashMatch = cleanStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (ddMmYyyyDashMatch) {
    const day = parseInt(ddMmYyyyDashMatch[1], 10);
    const month = parseInt(ddMmYyyyDashMatch[2], 10);
    const year = parseInt(ddMmYyyyDashMatch[3], 10);
    return `${pad(day)}/${pad(month)}/${year}`;
  }

  // Extract year if present, otherwise default to current year
  let year = new Date().getFullYear();
  const yearMatch = cleanStr.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // Remove the year and commas from cleanStr to simplify parsing of day and month
  let parseStr = cleanStr.replace(/\b20\d{2}\b/g, '').replace(/,/g, '').trim();

  // 4. Day range with single month: e.g. "21-22 Jun" or "21 - 22 Jun"
  const dayRangeSingleMonth = parseStr.match(/^(\d{1,2})\s*[-–—to/\s]+\s*(\d{1,2})\s+([a-zA-Z]{3,10})$/i);
  if (dayRangeSingleMonth) {
    const day = parseInt(dayRangeSingleMonth[1], 10);
    const monthIdx = getMonthIndex(dayRangeSingleMonth[3]);
    if (monthIdx !== -1) {
      return formatDateObj(new Date(year, monthIdx, day));
    }
  }

  // 5. Month with day range: e.g. "Jun 21-22"
  const monthDayRange = parseStr.match(/^([a-zA-Z]{3,10})\s+(\d{1,2})\s*[-–—to/\s]+\s*(\d{1,2})$/i);
  if (monthDayRange) {
    const monthIdx = getMonthIndex(monthDayRange[1]);
    const day = parseInt(monthDayRange[2], 10);
    if (monthIdx !== -1) {
      return formatDateObj(new Date(year, monthIdx, day));
    }
  }

  // 6. Full range "6 Jul to 10 Jul" -> split and parse first part
  if (parseStr.includes(" to ") || parseStr.includes(" - ") || parseStr.includes(" – ") || parseStr.includes(" — ")) {
    const parts = parseStr.split(/\s+(?:to|-|–|—)\s+/i);
    if (parts.length > 0) {
      const startPart = parts[0].trim();
      
      const dayMonth = startPart.match(/^(\d{1,2})\s+([a-zA-Z]{3,10})$/i);
      if (dayMonth) {
        const day = parseInt(dayMonth[1], 10);
        const monthIdx = getMonthIndex(dayMonth[2]);
        if (monthIdx !== -1) {
          return formatDateObj(new Date(year, monthIdx, day));
        }
      }
      const monthDay = startPart.match(/^([a-zA-Z]{3,10})\s+(\d{1,2})$/i);
      if (monthDay) {
        const monthIdx = getMonthIndex(monthDay[1]);
        const day = parseInt(monthDay[2], 10);
        if (monthIdx !== -1) {
          return formatDateObj(new Date(year, monthIdx, day));
        }
      }
    }
  }

  // 7. Just DD MMM (e.g. "21 Jun")
  const singleDayMonth = parseStr.match(/^(\d{1,2})\s+([a-zA-Z]{3,10})$/i);
  if (singleDayMonth) {
    const day = parseInt(singleDayMonth[1], 10);
    const monthIdx = getMonthIndex(singleDayMonth[2]);
    if (monthIdx !== -1) {
      return formatDateObj(new Date(year, monthIdx, day));
    }
  }

  // 8. Just MMM DD (e.g. "Jun 21")
  const singleMonthDay = parseStr.match(/^([a-zA-Z]{3,10})\s+(\d{1,2})$/i);
  if (singleMonthDay) {
    const monthIdx = getMonthIndex(singleMonthDay[1]);
    const day = parseInt(singleMonthDay[2], 10);
    if (monthIdx !== -1) {
      return formatDateObj(new Date(year, monthIdx, day));
    }
  }

  // 9. Standard Date.parse fallback
  let rawParsed = Date.parse(`${parseStr} ${year}`);
  if (!isNaN(rawParsed)) {
    return formatDateObj(new Date(rawParsed));
  }

  return cleanStr;
};

interface TournamentSavedDrawItemProps {
  draw: any;
  onRefresh: (drawId: string, url: string) => Promise<void>;
  onDelete: (drawId: string) => Promise<void>;
}

function TournamentSavedDrawItem({ draw, onRefresh, onDelete }: TournamentSavedDrawItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  
  // Sort State
  const [sortField, setSortField] = useState<'name' | 'utrSingles' | 'points' | 'winLossYTD' | 'winLossCareer' | 'championships' | null>('utrSingles');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const hasJordan = useMemo(() => {
    return draw.players?.some((p: any) => {
      const pName = p.name ? p.name.toLowerCase() : "";
      return pName.includes("jordan") && pName.includes("chiu");
    });
  }, [draw.players]);

  const drawDateMatch = draw.url?.match(/#date=(.*)$/);
  let rawDrawDate = drawDateMatch ? decodeURIComponent(drawDateMatch[1]) : '';
  if (!rawDrawDate) {
    const nameMatch = draw.name?.match(/\b\d{1,2}(?:-\d{1,2})?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
    const ddMmYyyyMatch = draw.name?.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
    if (nameMatch) {
      rawDrawDate = nameMatch[0];
    } else if (ddMmYyyyMatch) {
      rawDrawDate = ddMmYyyyMatch[0];
    }
  }
  const drawDate = formatDateToDdMmYyyy(rawDrawDate);
  const displayUrl = draw.url?.split('#')[0] || '';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh(draw.id, draw.url);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSort = (field: 'name' | 'utrSingles' | 'points' | 'winLossYTD' | 'winLossCareer' | 'championships') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc'); // default desc for stats
    }
  };

  const parseValueForSort = (player: any, field: string) => {
    const val = player[field];
    if (field === 'name') return val ? val.toLowerCase() : '';
    if (field === 'championships') return val !== undefined ? Number(val) : 0;
    
    if (field === 'utrSingles') {
      const parsed = parseFloat(val);
      return isNaN(parsed) ? (sortDirection === 'asc' ? 99 : -1) : parsed;
    }
    
    if (field === 'points') {
      const parsed = parseInt(val ? val.replace(/,/g, '') : '', 10);
      return isNaN(parsed) ? (sortDirection === 'asc' ? 999999 : -1) : parsed;
    }

    if (field === 'winLossYTD' || field === 'winLossCareer') {
      if (!val || val === '-') return sortDirection === 'asc' ? 999 : -1;
      const parts = val.split(':');
      if (parts.length === 2) {
        const wins = parseInt(parts[0], 10);
        const losses = parseInt(parts[1], 10);
        if (!isNaN(wins) && !isNaN(losses)) {
          return wins + losses > 0 ? wins / (wins + losses) : 0;
        }
      }
      return sortDirection === 'asc' ? 999 : -1;
    }

    return val;
  };

  const sortedPlayers = useMemo(() => {
    const playersCopy = [...(draw.players || [])];
    if (!sortField) return playersCopy;

    return playersCopy.sort((a, b) => {
      const valA = parseValueForSort(a, sortField);
      const valB = parseValueForSort(b, sortField);

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [draw.players, sortField, sortDirection]);

  return (
    <div className={`rounded-xl overflow-hidden border ${
      hasJordan
        ? "bg-yellow-500/5 border-yellow-500/35"
        : "bg-gray-950 border-gray-800"
    }`}>
      {/* Header */}
      <div 
        className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
          hasJordan ? "hover:bg-yellow-500/10" : "hover:bg-gray-800/20"
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          <div className="text-gray-400 shrink-0 mt-0.5 sm:mt-0">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h4 className={`text-sm sm:text-base font-semibold break-words ${hasJordan ? "text-yellow-400 font-bold" : "text-white"}`}>
                {draw.name}
              </h4>
              {drawDate && (
                <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold bg-gray-800 text-blue-300 border border-gray-700 px-2 py-0.5 rounded-lg whitespace-nowrap">
                  <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
                  {drawDate}
                </span>
              )}
              {hasJordan && (
                <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-extrabold bg-yellow-500/25 text-yellow-400 border border-yellow-500/40 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                  JORDAN JOINED
                </span>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
              <a 
                href={displayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 font-medium shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                View Original Draw <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-gray-500 flex items-center gap-1 text-[10px] font-medium shrink-0">
                <Clock className="w-3.5 h-3.5" />
                Updated: {new Date(draw.lastUpdated || draw.created_at || Date.now()).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div 
          className="flex items-center justify-end gap-1.5 sm:gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-800/60 shrink-0" 
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || showConfirmDelete}
            className="p-2 text-gray-400 hover:text-blue-400 bg-gray-850 hover:bg-blue-400/10 border border-gray-800 rounded-lg transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1 text-xs"
            title="Refresh draw data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : ""}`} />
            <span className="inline sm:hidden text-[11px] text-gray-400">Refresh</span>
          </button>
          
          {showConfirmDelete ? (
            <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-lg border border-red-500/40 shadow-sm">
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  await onDelete(draw.id);
                  setShowConfirmDelete(false);
                }}
                className="px-2.5 py-1.5 text-[11px] font-bold bg-red-600 hover:bg-red-500 text-white rounded transition-colors uppercase cursor-pointer"
              >
                Delete?
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirmDelete(false);
                }}
                className="px-2 py-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowConfirmDelete(true);
              }}
              className="p-2 text-red-400/90 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-medium"
              title="Delete saved draw"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="inline sm:hidden text-[11px]">Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Table */}
      {expanded && (
        <div className="border-t border-gray-800 bg-gray-950/40 p-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-800 text-xs">
            <thead className="bg-gray-900/50">
              <tr>
                <th 
                  scope="col" 
                  className="px-4 py-3 text-left font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  Player Name {sortField === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th 
                  scope="col" 
                  className="px-4 py-3 text-center font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => handleSort('utrSingles')}
                >
                  UTR Singles {sortField === 'utrSingles' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th 
                  scope="col" 
                  className="px-4 py-3 text-center font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => handleSort('points')}
                >
                  Points {sortField === 'points' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th 
                  scope="col" 
                  className="px-4 py-3 text-center font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => handleSort('winLossYTD')}
                >
                  Win:Loss YTD {sortField === 'winLossYTD' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th 
                  scope="col" 
                  className="px-4 py-3 text-center font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => handleSort('winLossCareer')}
                >
                  Win:Loss Career {sortField === 'winLossCareer' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th 
                  scope="col" 
                  className="px-4 py-3 text-center font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => handleSort('championships')}
                >
                  Championships {sortField === 'championships' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th scope="col" className="px-4 py-3 text-right text-gray-400 uppercase tracking-wider">
                  Link
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-900/10">
              {sortedPlayers.map((player: any, idx: number) => {
                const isPlayerJordan = player.name?.toLowerCase().includes("jordan") && player.name?.toLowerCase().includes("chiu");
                return (
                  <tr key={player.id || idx} className={`hover:bg-gray-800/25 ${isPlayerJordan ? 'bg-yellow-500/5' : ''}`}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-gray-900 flex items-center justify-center border border-gray-800 text-[10px] font-semibold text-gray-400 uppercase">
                          {player.name ? player.name.charAt(0) : '?'}
                        </div>
                        {player.profileUrl ? (
                          <a 
                            href={player.profileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="font-medium text-blue-400 hover:underline truncate max-w-[150px]"
                          >
                            {player.name}
                          </a>
                        ) : (
                          <span className="font-medium text-gray-200 truncate max-w-[150px]">
                            {player.name}
                          </span>
                        )}
                        {isPlayerJordan && (
                          <span className="text-[10px]" title="Jordan Chiu">⭐</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono font-medium text-gray-300">
                      {player.utrSingles || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono font-medium text-gray-300">
                      {player.points || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono font-medium text-gray-300">
                      {player.winLossYTD || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono font-medium text-gray-300">
                      {player.winLossCareer || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono font-medium text-gray-300">
                      {player.championships !== undefined ? player.championships : 0}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {player.profileUrl && (
                        <a
                          href={player.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          Profile
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sortedPlayers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                    No players found in this draw.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface JoinedPlayer {
  player: {
    id: string;
    name: string;
    url?: string;
    source?: string;
  };
  draws: {
    drawName: string;
    drawLink?: string;
  }[];
}

interface TournamentWithPlayers {
  tournament: {
    name: string;
    dates: string;
    link: string;
    ageGroup: string;
    source: 'HK' | 'AUS';
    location?: string;
    distance?: string;
    mapsLink?: string;
    closingDeadline?: string;
  };
  joinedPlayers: JoinedPlayer[];
}

function TournamentItem({ 
  t, 
  savedDraws, 
  onSavedDrawsChanged 
}: { 
  t: TournamentWithPlayers; 
  savedDraws: any[]; 
  onSavedDrawsChanged: () => void;
  key?: any;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [drawSortOrder, setDrawSortOrder] = useState<'asc' | 'desc'>('asc');
  const domain = t.tournament.source === "HK" ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
  const tournamentUrl = `https://${domain}${t.tournament.link}`;

  const containsJordan = t.joinedPlayers.some(jp => 
    jp.player.name.toLowerCase().includes("jordan chiu") || 
    jp.player.name.toLowerCase().includes("chiu jordan") ||
    jp.player.id === "66333972211" ||
    jp.player.id === "66419"
  );

  const uniqueDraws = useMemo(() => {
    const list: { name: string; url: string }[] = [];
    t.joinedPlayers.forEach(jp => {
      jp.draws.forEach(d => {
        if (d.drawLink) {
          const domainName = t.tournament.source === "HK" ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
          const absoluteUrl = d.drawLink.startsWith('http') ? d.drawLink : `https://${domainName}${d.drawLink}`;
          const cleanName = cleanDisplayDrawName(d.drawName, t.tournament.name);
          
          if (!list.some(item => normalizeUrl(item.url) === normalizeUrl(absoluteUrl))) {
            list.push({
              name: cleanName,
              url: absoluteUrl
            });
          }
        }
      });
    });
    return list;
  }, [t.joinedPlayers, t.tournament.source, t.tournament.name]);

  const matchedSavedDraws = useMemo(() => {
    const list = savedDraws.filter(sd => 
      uniqueDraws.some(ud => normalizeUrl(sd.url) === normalizeUrl(ud.url))
    );

    const getDrawDate = (urlStr: string) => {
      const match = urlStr.match(/#date=(.*)$/);
      if (!match) return 0;
      let dateStr = decodeURIComponent(match[1]).trim();
      if (!dateStr) return 0;

      // 1. Extract 4-digit year starting with 20
      let year = new Date().getFullYear();
      const yearMatch = dateStr.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }

      // Remove the year and trailing slashes/spaces/commas
      dateStr = dateStr.replace(/\b20\d{2}\b/g, '').replace(/,/g, '').trim();

      // Normalize trailing slashes on parts
      dateStr = dateStr.replace(/\/+$/g, '').trim();

      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const monthsFull = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

      const getMonthIndex = (str: string): number => {
        const s = str.toLowerCase();
        let idx = months.findIndex(m => s.includes(m));
        if (idx === -1) {
          idx = monthsFull.findIndex(m => s.includes(m));
        }
        return idx;
      };

      // Check for range separators
      if (dateStr.includes(" to ") || dateStr.includes("-") || dateStr.includes("–") || dateStr.includes("—")) {
        const parts = dateStr.split(/\s*(?:to|-|–|—)\s*/gi);
        if (parts.length > 0) {
          const leftPart = parts[0].trim().replace(/\/+$/g, '').trim();
          const rightPart = (parts[1] || '').trim().replace(/\/+$/g, '').trim();

          // Case A: Day range with single month like "21-22 Jun"
          if (/^\d{1,2}$/.test(leftPart)) {
            const day = parseInt(leftPart, 10);
            const monthIdx = getMonthIndex(rightPart);
            if (monthIdx !== -1) {
              return new Date(year, monthIdx, day).getTime();
            }
          }

          // Case B: Slash date range like "5/06 - 8/06" (month as number!)
          const slashMatchesLeft = leftPart.match(/^(\d{1,2})\/(\d{1,2})$/);
          if (slashMatchesLeft) {
            const day = parseInt(slashMatchesLeft[1], 10);
            const month = parseInt(slashMatchesLeft[2], 10) - 1; // 0-indexed
            return new Date(year, month, day).getTime();
          }

          // Case C: Range with names like "5 Jun - 8 Jun"
          const dayMonthLeft = leftPart.match(/^(\d{1,2})\s+([a-zA-Z]{3,10})$/i);
          if (dayMonthLeft) {
            const day = parseInt(dayMonthLeft[1], 10);
            const monthIdx = getMonthIndex(dayMonthLeft[2]);
            if (monthIdx !== -1) {
              return new Date(year, monthIdx, day).getTime();
            }
          }
          
          const monthDayLeft = leftPart.match(/^([a-zA-Z]{3,10})\s+(\d{1,2})$/i);
          if (monthDayLeft) {
            const monthIdx = getMonthIndex(monthDayLeft[1]);
            const day = parseInt(monthDayLeft[2], 10);
            if (monthIdx !== -1) {
              return new Date(year, monthIdx, day).getTime();
            }
          }
        }
      }

      // Case D: Single slash date, clean up trailing slash (e.g. "20/09")
      const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (slashMatch) {
        const day = parseInt(slashMatch[1], 10);
        const month = parseInt(slashMatch[2], 10) - 1;
        return new Date(year, month, day).getTime();
      }

      // Case E: Simple single "21 Jun" or "Jun 21"
      const dayMonth = dateStr.match(/^(\d{1,2})\s+([a-zA-Z]{3,10})$/i);
      if (dayMonth) {
        const day = parseInt(dayMonth[1], 10);
        const monthIdx = getMonthIndex(dayMonth[2]);
        if (monthIdx !== -1) {
          return new Date(year, monthIdx, day).getTime();
        }
      }

      const monthDay = dateStr.match(/^([a-zA-Z]{3,10})\s+(\d{1,2})$/i);
      if (monthDay) {
        const monthIdx = getMonthIndex(monthDay[1]);
        const day = parseInt(monthDay[2], 10);
        if (monthIdx !== -1) {
          return new Date(year, monthIdx, day).getTime();
        }
      }

      // Fallback to standard parsing
      let rawParsed = Date.parse(`${dateStr} ${year}`);
      if (!isNaN(rawParsed)) return rawParsed;

      return 0;
    };

    return list.sort((a, b) => {
      const dateA = getDrawDate(a.url);
      const dateB = getDrawDate(b.url);

      if (dateA === 0 && dateB !== 0) return 1;
      if (dateB === 0 && dateA !== 0) return -1;

      if (dateA !== dateB) {
        return drawSortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      }

      return drawSortOrder === 'asc'
        ? (a.sort_order ?? 0) - (b.sort_order ?? 0)
        : (b.sort_order ?? 0) - (a.sort_order ?? 0);
    });
  }, [savedDraws, uniqueDraws, drawSortOrder]);

  const isAnySaved = matchedSavedDraws.length > 0;
  const isAllSaved = uniqueDraws.length > 0 && matchedSavedDraws.length === uniqueDraws.length;
  const isGreen = isAnySaved;

  const buttonTitle = useMemo(() => {
    if (uniqueDraws.length === 0) return "No event draws found for players";
    if (isAllSaved) return `Remove all ${uniqueDraws.length} event draws from Draw Checker`;
    if (isAnySaved) return `Saved partially. Click to remove active entries.`;
    return `Add all ${uniqueDraws.length} event draws to Draw Checker`;
  }, [uniqueDraws.length, isAllSaved, isAnySaved]);

  const handleToggleDraws = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uniqueDraws.length === 0) return;
    
    setIsProcessing(true);
    try {
      if (isGreen) {
        // Delete matched draws
        for (const sd of matchedSavedDraws) {
          const deleteRes = await fetch(`/api/saved-draws/${sd.id}`, {
            method: 'DELETE',
          });
          if (!deleteRes.ok) {
            console.error(`Failed to delete saved draw ${sd.id}`);
          }
        }
      } else {
        // Add unique draws
        for (const ud of uniqueDraws) {
          const alreadySaved = matchedSavedDraws.some(sd => normalizeUrl(sd.url) === normalizeUrl(ud.url));
          if (alreadySaved) continue;
          
          const checkRes = await fetch('/api/check-draw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: ud.url }),
          });
          
          if (checkRes.ok) {
            const data = await checkRes.json();
            
            let finalUrl = ud.url;
            if (data.tournamentDate && !finalUrl.includes('#date=')) {
              finalUrl += `#date=${encodeURIComponent(data.tournamentDate)}`;
            }
            
            let displayName = `${t.tournament.name} - ${data.drawName || ud.name}`;
            
            const saveRes = await fetch('/api/saved-draws', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: finalUrl,
                region: t.tournament.source === 'HK' ? 'HKTA' : 'AUS',
                name: displayName,
                players: data.players || []
              }),
            });
            if (!saveRes.ok) {
              console.error(`Failed to save draw for ${ud.url}`);
            }
          } else {
            console.error(`Failed to check draw for ${ud.url}`);
          }
        }
      }
      
      onSavedDrawsChanged();
    } catch (err) {
      console.error("Error processing saved draws toggle:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRefreshSavedDraw = async (drawId: string, drawUrl: string) => {
    const checkRes = await fetch('/api/check-draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: drawUrl }),
    });
    if (checkRes.ok) {
      const data = await checkRes.json();
      
      await fetch(`/api/saved-draws/${drawId}/players`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          players: data.players || [],
          tournamentDate: data.tournamentDate || ''
        }),
      });
      
      onSavedDrawsChanged();
    }
  };

  const handleDeleteSavedDraw = async (drawId: string) => {
    const deleteRes = await fetch(`/api/saved-draws/${drawId}`, {
      method: 'DELETE',
    });
    if (deleteRes.ok) {
      onSavedDrawsChanged();
    }
  };

  return (
    <div className={`rounded-2xl overflow-hidden shadow-sm transition-all ${
      containsJordan 
        ? 'bg-yellow-950/15 border border-yellow-500/30 shadow-yellow-500/5 hover:border-yellow-500/50' 
        : 'bg-gray-900/40 border border-gray-800 hover:border-gray-700'
    }`}>
      <div 
        className={`p-5 border-b flex flex-col sm:flex-row sm:items-start justify-between gap-4 cursor-pointer transition-colors ${
          containsJordan 
            ? 'border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10' 
            : 'border-gray-800/50 bg-gray-800/20 hover:bg-gray-800/40'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/20">
              {t.tournament.source === 'AUS' ? '🇦🇺 AUS' : '🇭🇰 HK'}
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
              {t.tournament.ageGroup}
            </span>
            {containsJordan && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold bg-yellow-500/25 text-yellow-400 border border-yellow-500/40 px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping shrink-0" />
                JORDAN JOINED
              </span>
            )}
          </div>
          <a 
            href={tournamentUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-lg font-semibold text-white hover:text-blue-400 hover:underline transition-colors line-clamp-2"
            onClick={(e) => e.stopPropagation()}
          >
            {t.tournament.name}
          </a>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-400">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-gray-500" />
              {t.tournament.dates}
            </div>
            {t.tournament.closingDeadline && (() => {
              const diffDays = getDeadlineDaysLeft(t.tournament.closingDeadline);
              return (
                <div className="flex items-center gap-1.5 text-orange-400/80">
                  <span className="font-medium">Closes:</span> {t.tournament.closingDeadline}
                  {diffDays !== null && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                      diffDays > 0 ? 'text-amber-400 bg-amber-950/40 border border-amber-800/40' :
                      diffDays === 0 ? 'text-red-400 bg-red-950/40 border border-red-800/40' :
                      'text-gray-500 bg-gray-800/50'
                    }`}>
                      {diffDays > 0 ? `${diffDays}d left` : diffDays === 0 ? 'Today' : 'Closed'}
                    </span>
                  )}
                </div>
              );
            })()}
            <div className={`flex items-center gap-1.5 font-medium ${containsJordan ? 'text-yellow-400/90' : 'text-blue-400/80'}`}>
              <Users className="w-4 h-4" />
              {t.joinedPlayers.length} player{t.joinedPlayers.length !== 1 ? 's' : ''}
            </div>
            {t.tournament.distance && (
              <div className="flex items-center gap-1.5 text-gray-400">
                <MapPin className="w-4 h-4 text-gray-500" />
                {t.tournament.distance}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {t.tournament.mapsLink && (
            <a 
              href={t.tournament.mapsLink}
              target="_blank" 
              rel="noopener noreferrer"
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
                containsJordan 
                  ? 'bg-yellow-500/10 hover:bg-yellow-500/25 text-yellow-400' 
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
              title="Open in Google Maps"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="w-4 h-4" />
            </a>
          )}

          <a 
            href={getGoogleCalendarLink(t.tournament as Tournament)}
            target="_blank" 
            rel="noopener noreferrer"
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
              containsJordan 
                ? 'bg-yellow-500/10 hover:bg-yellow-500/25 text-yellow-400' 
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
            }`}
            title="Add to Google Calendar"
            onClick={(e) => e.stopPropagation()}
          >
            <CalendarPlus className="w-4 h-4" />
          </a>

          <button
            onClick={handleToggleDraws}
            disabled={isProcessing || uniqueDraws.length === 0}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 border cursor-pointer ${
              isProcessing ? 'animate-pulse opacity-75' : ''
            } ${
              isGreen 
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)] animate-none' 
                : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700/50'
            }`}
            title={buttonTitle}
          >
            {isProcessing ? (
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            ) : (
              <Layers className="w-4 h-4" />
            )}
          </button>

          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
            containsJordan ? 'bg-yellow-500/10 text-yellow-400' : 'bg-gray-800/50 text-gray-400'
          }`}>
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-5">
          <h3 className={`text-sm font-medium mb-4 flex items-center gap-2 ${containsJordan ? 'text-yellow-400/80' : 'text-gray-400'}`}>
            <Users className="w-4 h-4" />
            Joined Players ({t.joinedPlayers.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {t.joinedPlayers.map((jp, j) => {
              const isJordan = jp.player.name.toLowerCase().includes("jordan chiu") || 
                               jp.player.name.toLowerCase().includes("chiu jordan") ||
                               jp.player.id === "66333972211" ||
                               jp.player.id === "66419";
              return (
                <div 
                  key={j} 
                  className={`border rounded-xl p-3 flex flex-col gap-2 transition-all ${
                    isJordan 
                      ? 'bg-yellow-500/10 border-yellow-500/30 shadow-sm shadow-yellow-500/5 ring-1 ring-yellow-500/10' 
                      : 'bg-gray-800/40 border-gray-700/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center border shrink-0 ${
                      isJordan 
                        ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300' 
                        : 'bg-gray-700 border-gray-600 text-gray-300'
                    }`}>
                      <span className="text-[10px] font-bold">
                        {isJordan ? '⭐' : jp.player.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span 
                      className={`font-semibold text-sm truncate ${isJordan ? 'text-yellow-300' : 'text-gray-200'}`} 
                      title={jp.player.name}
                    >
                      {jp.player.name}
                    </span>
                  </div>
                  <div className="space-y-1.5 pl-8">
                    {jp.draws.map((draw, k) => {
                      const displayDrawName = cleanDisplayDrawName(draw.drawName, t.tournament.name);
                      return (
                        <div key={k} className="text-xs text-gray-400 flex items-center gap-1.5">
                          <div className={`w-1 h-1 rounded-full shrink-0 ${isJordan ? 'bg-yellow-500' : 'bg-gray-600'}`} />
                          {draw.drawLink ? (
                            <a 
                              href={draw.drawLink.startsWith('http') ? draw.drawLink : `https://${domain}${draw.drawLink}`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className={`hover:underline truncate ${isJordan ? 'text-yellow-200/80 hover:text-yellow-400' : 'hover:text-blue-400'}`} 
                              title={displayDrawName}
                            >
                              {displayDrawName}
                            </a>
                          ) : (
                            <span className="truncate" title={displayDrawName}>{displayDrawName}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Saved Draws as per Draw Checker under the player list */}
          {matchedSavedDraws.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-800/60 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2 pb-2 border-b border-gray-800/40">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Saved Event Draws ({matchedSavedDraws.length})
                </h3>
                <button
                  onClick={() => {
                    setDrawSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-300 rounded-lg transition-all cursor-pointer shadow-sm self-start sm:self-auto"
                  title="Toggle chronological saved draws sorting"
                >
                  <ArrowUpDown className="w-3 h-3 text-blue-400" />
                  <span>Sort Date: {drawSortOrder === 'asc' ? 'Earliest First' : 'Latest First'}</span>
                </button>
              </div>
              <div className="grid gap-4">
                {matchedSavedDraws.map((draw) => (
                  <TournamentSavedDrawItem
                    key={draw.id}
                    draw={draw}
                    onRefresh={handleRefreshSavedDraw}
                    onDelete={handleDeleteSavedDraw}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const parseDateRange = (dates: string): { start: Date; end: Date } | null => {
  if (!dates) return null;
  const parts = dates.split(" to ");
  const start = parseAnyDateToDate(parts[0]);
  const end = parts.length > 1 ? parseAnyDateToDate(parts[parts.length - 1]) : start;
  if (start && end) return { start, end };
  if (start) return { start, end: start };
  return null;
};

const isCompleted = (datesStr: string): boolean => {
  const range = parseDateRange(datesStr);
  if (!range) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(range.end);
  end.setHours(23, 59, 59, 999);
  return end < today;
};

export function TournamentScreen({ 
  tournamentsCache = [],
  isTournamentsCacheLoading = false,
  reloadTournamentsCache,
  tournamentsCacheLastUpdated
}: { 
  isActive?: boolean,
  tournamentsCache?: TournamentWithPlayers[],
  isTournamentsCacheLoading?: boolean,
  reloadTournamentsCache?: () => void,
  tournamentsCacheLastUpdated?: string | null
}) {
  const [tournaments, setTournaments] = useState<TournamentWithPlayers[]>(tournamentsCache);
  const [savedDraws, setSavedDraws] = useState<any[]>([]);
  const [savedPlayers, setSavedPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(isTournamentsCacheLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(tournamentsCacheLastUpdated || null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'HK' | 'AUS'>('AUS');
  const [searchQuery, setSearchQuery] = useState('');
  const [notJoinedFilter, setNotJoinedFilter] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [isGlobalRefreshing, setIsGlobalRefreshing] = useState(false);

  // Sync with parent cache
  useEffect(() => {
    if (tournamentsCache && tournamentsCache.length > 0) {
      setTournaments(tournamentsCache);
    }
  }, [tournamentsCache]);

  useEffect(() => {
    if (tournamentsCacheLastUpdated) {
      setLastUpdated(tournamentsCacheLastUpdated);
    }
  }, [tournamentsCacheLastUpdated]);

  const fetchSavedDraws = async () => {
    try {
      const res = await fetch('/api/saved-draws');
      if (res.ok) {
        const data = await res.json();
        setSavedDraws(data.draws || []);
      }
    } catch (err) {
      console.error("Failed to fetch saved draws:", err);
    }
  };

  const fetchTournaments = async (force: boolean = false) => {
    if (force) {
      setIsRefreshing(true);
    } else if (tournaments.length === 0) {
      setLoading(true);
    }
    setError(null);
    try {
      const url = force ? '/api/tournaments-for-players?refresh=true' : '/api/tournaments-for-players';
      
      const [resTournaments, resSavedDraws, resSavedPlayers] = await Promise.all([
        fetch(url),
        fetch('/api/saved-draws'),
        fetch('/api/saved-players')
      ]);

      if (resTournaments.ok) {
        try {
          const data = await resTournaments.json();
          if (data.tournaments) {
            setTournaments(data.tournaments);
          }
          if (data.updatedAt) {
            setLastUpdated(data.updatedAt);
          }
          if (reloadTournamentsCache) {
            reloadTournamentsCache();
          }
        } catch (e) {
          console.error("Failed to parse /api/tournaments-for-players JSON:", e);
        }
      }

      if (resSavedDraws.ok) {
        const drawData = await resSavedDraws.json();
        setSavedDraws(drawData.draws || []);
      }

      if (resSavedPlayers.ok) {
        const playersData = await resSavedPlayers.json();
        setSavedPlayers(Array.isArray(playersData) ? playersData : []);
      }
    } catch (e) {
      console.error("Failed to fetch data", e);
      if (tournaments.length === 0) {
        setError("An error occurred while fetching data");
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Poll for background global refresh status
  useEffect(() => {
    let intervalId: any = null;

    const checkRefreshStatus = async () => {
      try {
        const res = await fetch("/api/admin/refresh-status");
        if (res.ok) {
          const data = await res.json();
          if (data.inProgress) {
            setIsGlobalRefreshing(true);
            if (!intervalId) {
              intervalId = setInterval(checkRefreshStatus, 3000);
            }
          } else {
            if (isGlobalRefreshing) {
              // Rebuild finished! Reload cache
              setIsGlobalRefreshing(false);
              fetchTournaments(false);
            }
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
          }
        }
      } catch (err) {
        console.warn("Failed to check refresh status:", err);
      }
    };

    checkRefreshStatus();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isGlobalRefreshing]);

  useEffect(() => {
    fetchTournaments(false);
  }, []);

  // Merge saved draws with joined players into tournaments list
  const mergedTournaments = useMemo(() => {
    const list: TournamentWithPlayers[] = (tournaments || []).map(t => {
      const filteredJoined: JoinedPlayer[] = [];
      for (const jp of (t.joinedPlayers || [])) {
        // Find if this player matches one of our saved players
        const matchedSaved = (savedPlayers || []).length === 0
          ? jp.player
          : (savedPlayers || []).find(sp => isPlayerMatch(sp, jp.player, t.tournament.source));

        if (matchedSaved) {
          const cleanDraws = (jp.draws || []).map(d => ({
            ...d,
            drawName: cleanDisplayDrawName(d.drawName, t.tournament.name)
          }));

          const existingJp = filteredJoined.find(ej => 
            isPlayerMatch(ej.player, matchedSaved, t.tournament.source)
          );

          if (existingJp) {
            for (const cd of cleanDraws) {
              if (!existingJp.draws.some(d => normalizeUrl(d.drawLink || '') === normalizeUrl(cd.drawLink || ''))) {
                existingJp.draws.push(cd);
              }
            }
          } else {
            filteredJoined.push({
              player: {
                ...jp.player,
                name: matchedSaved.name || jp.player.name,
                id: matchedSaved.id || jp.player.id,
                source: matchedSaved.source || jp.player.source
              },
              draws: cleanDraws
            });
          }
        }
      }

      return {
        tournament: { ...t.tournament },
        joinedPlayers: filteredJoined
      };
    });

    // Check savedDraws for any tournaments not in list or needing extra info
    for (const draw of (savedDraws || [])) {
      if (!draw.players || !Array.isArray(draw.players) || draw.players.length === 0) continue;

      const { tournamentName, eventName } = parseDrawAndTournamentName(draw.name || '');
      const drawContextRegion = draw.region || (draw.url?.includes('hkta') ? 'HK' : 'AUS');

      // ONLY match saved players that belong to savedPlayers (Player Screen)
      const matchedSavedPlayersInDraw: JoinedPlayer[] = [];
      for (const sPlayer of (savedPlayers || [])) {
        const foundInDraw = draw.players.find((dp: any) => 
          isPlayerMatch(sPlayer, dp, drawContextRegion)
        );

        if (foundInDraw) {
          matchedSavedPlayersInDraw.push({
            player: {
              id: sPlayer.id || foundInDraw.id || '',
              name: sPlayer.name,
              url: sPlayer.url || foundInDraw.url || foundInDraw.profileUrl,
              source: sPlayer.source || (drawContextRegion === 'HK' ? 'HKTA' : 'TA')
            },
            draws: [{
              drawName: eventName,
              drawLink: draw.url
            }]
          });
        }
      }

      // If no player in user's Player Screen is in this draw, do not add it!
      if (matchedSavedPlayersInDraw.length === 0) continue;

      const normDrawUrl = normalizeUrl(draw.url);
      const existing = list.find(t => 
        normalizeUrl(t.tournament.link) === normDrawUrl ||
        (t.tournament.name && (
          t.tournament.name.toLowerCase().includes(tournamentName.toLowerCase()) ||
          tournamentName.toLowerCase().includes(t.tournament.name.toLowerCase()) ||
          t.tournament.name.toLowerCase().includes(draw.name.toLowerCase()) ||
          draw.name.toLowerCase().includes(t.tournament.name.toLowerCase())
        ))
      );

      // Extract date
      const drawDateMatch = draw.url?.match(/#date=(.*)$/);
      let rawDate = drawDateMatch ? decodeURIComponent(drawDateMatch[1]).trim() : '';
      if (!rawDate) {
        const nameMatch = draw.name?.match(/\b\d{1,2}(?:-\d{1,2})?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
        const ddMmYyyyMatch = draw.name?.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
        if (nameMatch) rawDate = nameMatch[0];
        else if (ddMmYyyyMatch) rawDate = ddMmYyyyMatch[0];
      }
      if (!rawDate) rawDate = "20/09/2026";
      const formattedDate = formatDateToDdMmYyyy(rawDate) || rawDate;

      if (existing) {
        if (formattedDate && (!existing.tournament.dates || existing.tournament.dates === 'TBD')) {
          existing.tournament.dates = formattedDate;
        }
        for (const jp of matchedSavedPlayersInDraw) {
          const existingJp = existing.joinedPlayers.find(ej => 
            isPlayerMatch(ej.player, jp.player, existing.tournament.source)
          );
          if (existingJp) {
            for (const d of jp.draws) {
              if (!existingJp.draws.some(ed => normalizeUrl(ed.drawLink || '') === normalizeUrl(d.drawLink || ''))) {
                existingJp.draws.push(d);
              }
            }
          } else {
            existing.joinedPlayers.push(jp);
          }
        }
      } else {
        list.push({
          tournament: {
            name: tournamentName,
            dates: formattedDate,
            link: draw.url,
            source: drawContextRegion === 'HK' ? 'HK' : 'AUS',
            ageGroup: draw.name?.includes('10u') || draw.name?.includes('U10') ? 'U10' : (draw.name?.includes('12u') || draw.name?.includes('U12') ? 'U12' : 'All Ages'),
            location: tournamentName.includes('Bulli') ? 'Bulli Tennis Club | NSW' : (tournamentName.includes('Panania') ? 'Canterbury Bankstown Tennis Association | Sydney' : (tournamentName || 'Australia'))
          },
          joinedPlayers: matchedSavedPlayersInDraw
        });
      }
    }

    return list;
  }, [tournaments, savedDraws, savedPlayers]);

  const filteredTournaments = useMemo(() => {
    let result = mergedTournaments;

    if (notJoinedFilter) {
      result = result.filter(t => {
        return !t.joinedPlayers.some(jp => 
          jp.player.name.toLowerCase().includes("jordan chiu") || 
          jp.player.name.toLowerCase().includes("chiu jordan") ||
          jp.player.id === "66333972211" ||
          jp.player.id === "66419"
        );
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(t => 
        t.tournament.name.toLowerCase().includes(q) ||
        (t.tournament.location && t.tournament.location.toLowerCase().includes(q)) ||
        (t.tournament.ageGroup && t.tournament.ageGroup.toLowerCase().includes(q)) ||
        (t.tournament.dates && t.tournament.dates.toLowerCase().includes(q)) ||
        t.joinedPlayers.some(jp => jp.player.name.toLowerCase().includes(q))
      );
    }

    return result;
  }, [mergedTournaments, notJoinedFilter, searchQuery]);

  const ausTournaments = filteredTournaments.filter(t => t.tournament.source === 'AUS');
  const hkTournaments = filteredTournaments.filter(t => t.tournament.source === 'HK');

  const renderTournamentList = (list: TournamentWithPlayers[]) => {
    if (loading && list.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 font-medium">Scanning all future tournaments for saved players...</p>
          <p className="text-gray-500 text-sm">This might take a minute.</p>
        </div>
      );
    }

    if (list.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4 border border-gray-800/40 rounded-2xl bg-gray-900/20">
          <Trophy className="w-12 h-12 text-gray-700" />
          <p className="text-gray-400 font-medium text-lg">No tournaments found</p>
          <p className="text-gray-500 text-sm text-center max-w-md">
            {searchQuery 
              ? `No tournaments matching "${searchQuery}".`
              : notJoinedFilter 
                ? 'No tournaments found where saved players have not joined.' 
                : 'Click "Rescan" or "Refresh All" above to load and update tournament rosters.'}
          </p>
        </div>
      );
    }

    const activeList = list.filter(t => !isCompleted(t.tournament.dates));
    const completedList = list.filter(t => isCompleted(t.tournament.dates));

    if (activeList.length === 0 && completedList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4 border border-gray-800/40 rounded-2xl bg-gray-900/20">
          <Trophy className="w-12 h-12 text-gray-700" />
          <p className="text-gray-400 font-medium text-lg">No tournaments found</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {activeList.length > 0 ? (
          <div className="grid gap-6">
            {activeList.map((t, i) => (
              <TournamentItem 
                key={`active-${i}-${t.tournament.name}`} 
                t={t} 
                savedDraws={savedDraws} 
                onSavedDrawsChanged={fetchSavedDraws} 
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-2 border border-gray-800/40 rounded-2xl bg-gray-900/10 text-gray-400">
            <Calendar className="w-8 h-8 text-gray-600" />
            <p className="font-semibold text-sm">No ongoing or upcoming tournaments in this view.</p>
            {completedList.length > 0 && (
              <p className="text-xs text-gray-500">See completed tournaments below ({completedList.length}).</p>
            )}
          </div>
        )}

        {completedList.length > 0 && (
          <div className="mt-8 border-t border-gray-800/40 pt-6">
            <button
              onClick={() => setCompletedExpanded(!completedExpanded)}
              className="flex items-center justify-between w-full p-4 rounded-xl bg-gray-900/30 hover:bg-gray-900/50 border border-gray-800/80 transition-all text-left group"
            >
              <div className="flex items-center gap-2.5">
                <Trophy className="w-4 h-4 text-gray-500 group-hover:text-gray-400 transition-colors" />
                <span className="font-semibold text-gray-300 text-sm">
                  Completed Tournaments
                </span>
                <span className="bg-gray-800 text-gray-500 px-2.5 py-0.5 rounded-full text-xs font-bold border border-gray-700/50">
                  {completedList.length}
                </span>
              </div>
              <div className="text-gray-400 group-hover:text-gray-300 transition-colors">
                {completedExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>
            
            {completedExpanded && (
              <div className="grid gap-6 mt-4">
                {completedList.map((t, i) => (
                  <TournamentItem 
                    key={`completed-${i}-${t.tournament.name}`} 
                    t={t} 
                    savedDraws={savedDraws} 
                    onSavedDrawsChanged={fetchSavedDraws} 
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {isGlobalRefreshing && (
        <div className="bg-blue-950/30 border border-blue-900/50 rounded-xl p-4 flex items-center gap-3 text-blue-300/90 animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-400 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-semibold text-white">Global Database Refresh in progress...</span> Updating all player profiles and future tournament entries. Page will auto-update as soon as complete.
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              Upcoming Tournaments
            </h2>
            <button
              onClick={() => fetchTournaments(true)}
              disabled={isRefreshing || loading}
              className={`p-1.5 rounded-lg border border-gray-800 bg-gray-900/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold ${isRefreshing ? 'cursor-not-allowed opacity-75' : ''}`}
              title="Rescan & Update live from sources (takes a minute)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
              {isRefreshing ? 'Scanning...' : 'Rescan'}
            </button>
            <button
              onClick={async () => {
                if (!isGlobalRefreshing) {
                  setIsGlobalRefreshing(true);
                  try {
                    await fetch("/api/admin/refresh-all", { method: "POST" });
                  } catch (err) {
                    console.error("Failed to trigger global refresh from Tournament Screen:", err);
                  }
                }
              }}
              disabled={isGlobalRefreshing}
              className={`p-1.5 rounded-lg border border-gray-800 transition-all flex items-center gap-1.5 text-xs font-semibold ${
                isGlobalRefreshing
                  ? "bg-blue-900/20 text-blue-400 border-blue-800/50 cursor-not-allowed"
                  : "bg-gray-900/50 text-gray-400 hover:text-green-400 hover:bg-gray-800"
              }`}
              title="Scrapes and refreshes all saved player profiles & latest tournaments"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGlobalRefreshing ? 'animate-spin text-green-400' : ''}`} />
              {isGlobalRefreshing ? 'Refreshing All...' : 'Refresh All'}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search tournament, player..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-gray-900/60 border border-gray-800 rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-44 sm:w-56"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-800 hover:bg-gray-800 transition-colors w-fit">
              <div className="relative">
                <input 
                  type="checkbox" 
                  className="sr-only" 
                  checked={notJoinedFilter}
                  onChange={() => setNotJoinedFilter(!notJoinedFilter)}
                />
                <div className={`block w-10 h-6 rounded-full transition-colors ${notJoinedFilter ? 'bg-blue-500' : 'bg-gray-700'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${notJoinedFilter ? 'transform translate-x-4' : ''}`}></div>
              </div>
              <span className="text-xs font-medium text-gray-300">Not Joined</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm text-gray-400">
          {lastUpdated && (
            <span className="text-xs text-gray-500 font-medium">
              Last Scraped: {new Date(lastUpdated).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} HKT
            </span>
          )}
          <div className="text-xs bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-800 w-fit">
            Found {filteredTournaments.length} tournament{filteredTournaments.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 bg-gray-900/50 p-1 rounded-xl border border-gray-800 w-fit">
        <button
          onClick={() => setActiveTab('HK')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'HK' 
              ? 'bg-gray-800 text-white shadow-sm border border-gray-700' 
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          <span>🇭🇰</span>
          Hong Kong
          <span className="bg-gray-900 text-gray-400 px-2 py-0.5 rounded-full text-xs ml-1">
            {hkTournaments.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('AUS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'AUS' 
              ? 'bg-gray-800 text-white shadow-sm border border-gray-700' 
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          <span>🇦🇺</span>
          Australia
          <span className="bg-gray-900 text-gray-400 px-2 py-0.5 rounded-full text-xs ml-1">
            {ausTournaments.length}
          </span>
        </button>
      </div>

      {activeTab === 'HK' && renderTournamentList(hkTournaments)}
      {activeTab === 'AUS' && renderTournamentList(ausTournaments)}
    </div>
  );
}

