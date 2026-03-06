import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2, ExternalLink, User, Trophy, X, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { searchPlayer, fetchPlayers } from "../services/tournamentService";
import { PlayerWatchResult } from "../types";

export function PlayerWatch() {
  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlayerWatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Autofill states
  const [allPlayers, setAllPlayers] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadPlayers = async () => {
      const players = await fetchPlayers();
      setAllPlayers(players);
    };
    loadPlayers();
  }, []);

  useEffect(() => {
    if (playerName.trim().length >= 2) {
      const filtered = allPlayers
        .filter(p => p.toLowerCase().includes(playerName.toLowerCase()))
        .slice(0, 10);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [playerName, allPlayers]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = async (e?: React.FormEvent, nameToSearch?: string) => {
    if (e) e.preventDefault();
    const name = nameToSearch || playerName;
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    setShowSuggestions(false);
    try {
      const data = await searchPlayer(name);
      setResult(data);
      setPlayerName(name);
    } catch (err: any) {
      setError(err.message || "Failed to search for player");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSuggestion = (name: string) => {
    setPlayerName(name);
    setShowSuggestions(false);
    handleSearch(undefined, name);
  };

  const parseDateRange = (dates: string): { start: Date; end: Date } | null => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const parseSingleDate = (dateStr: string): Date | null => {
      // Try "DD MMM YYYY" format
      const ddmmyyyyMatch = dateStr.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
      if (ddmmyyyyMatch) {
        const day = parseInt(ddmmyyyyMatch[1]);
        const monthIdx = months.findIndex(m => m.toLowerCase() === ddmmyyyyMatch[2].toLowerCase());
        const year = parseInt(ddmmyyyyMatch[3]);
        return new Date(year, monthIdx, day);
      }

      // Try "YYYY-MM-DD" or "DD-MM-YYYY" format
      const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) return new Date(isoMatch[0]);

      const revIsoMatch = dateStr.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (revIsoMatch) {
        const [_, d, m, y] = revIsoMatch;
        return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      }

      // Try "MMM DD, YYYY" format
      const mmmddyyyyMatch = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/i);
      if (mmmddyyyyMatch) {
        const monthIdx = months.findIndex(m => m.toLowerCase() === mmmddyyyyMatch[1].toLowerCase());
        const day = parseInt(mmmddyyyyMatch[2]);
        const year = parseInt(mmmddyyyyMatch[3]);
        return new Date(year, monthIdx, day);
      }

      // Try "DD/MM/YYYY" format
      const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (slashMatch) {
        const day = parseInt(slashMatch[1]);
        const month = parseInt(slashMatch[2]);
        const year = parseInt(slashMatch[3]);
        return new Date(year, month - 1, day);
      }

      return null;
    };

    if (dates.includes(" to ")) {
      const [startStr, endStr] = dates.split(" to ");
      const start = parseSingleDate(startStr);
      const end = parseSingleDate(endStr);
      if (start && end) return { start, end };
      if (start) return { start, end: start };
    }

    const single = parseSingleDate(dates);
    if (single) return { start: single, end: single };

    return null;
  };

  const getMonthHeaders = (dates: string, name: string): string[] => {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const range = parseDateRange(dates);
    if (range) {
      const headers: string[] = [];
      const current = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
      const end = new Date(range.end.getFullYear(), range.end.getMonth(), 1);

      while (current <= end) {
        headers.push(months[current.getMonth()]);
        current.setMonth(current.getMonth() + 1);
      }
      if (headers.length > 0) return headers;
    }

    // Fallback: Scan string for month names if parsing failed
    const foundMonths: string[] = [];
    const combinedText = `${dates} ${name}`;
    months.forEach((m, i) => {
      const regex = new RegExp(`\\b(${m}|${shortMonths[i]})\\b`, 'i');
      if (regex.test(combinedText)) {
        foundMonths.push(m);
      }
    });

    if (foundMonths.length > 0) return foundMonths;

    // Last resort: use the current month instead of "Other"
    const now = new Date();
    return [months[now.getMonth()]];
  };

  const groupedMatches = result?.matches.reduce((acc, match) => {
    const headers = getMonthHeaders(match.tournamentDates, match.tournamentName);
    headers.forEach(header => {
      if (!acc[header]) acc[header] = [];
      acc[header].push(match);
    });
    return acc;
  }, {} as Record<string, typeof result.matches>) || {};

  // Sort matches within each group by start date
  Object.keys(groupedMatches).forEach(header => {
    groupedMatches[header].sort((a, b) => {
      const rangeA = parseDateRange(a.tournamentDates);
      const rangeB = parseDateRange(b.tournamentDates);
      return (rangeA?.start.getTime() || 0) - (rangeB?.start.getTime() || 0);
    });
  });

  const sortedHeaders = Object.keys(groupedMatches).sort((a, b) => {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return months.indexOf(a) - months.indexOf(b);
  });

  return (
    <div className="space-y-8">
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 sm:p-8">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <h2 className="text-2xl font-bold text-white tracking-tight">Player Search</h2>
          <p className="text-gray-400">Enter a player's name to see which tournaments and draws they are appearing in.</p>
          
          <form onSubmit={handleSearch} className="mt-6 flex gap-2">
            <div className="relative flex-1" ref={dropdownRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Enter player name (e.g. Jordan Chiu)"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-10 pr-10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
              />
              {playerName && (
                <button
                  type="button"
                  onClick={() => {
                    setPlayerName("");
                    setShowSuggestions(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <AnimatePresence>
                {showSuggestions && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute z-50 left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
                  >
                    <div className="max-h-60 overflow-y-auto no-scrollbar">
                      {suggestions.map((name, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleSelectSuggestion(name)}
                          className="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-blue-600 hover:text-white flex items-center justify-between group transition-colors"
                        >
                          <span>{name}</span>
                          <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              type="submit"
              disabled={loading || !playerName.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </button>
          </form>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-900/50 rounded-xl p-4 text-red-400 text-sm flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-gray-400 animate-pulse">Searching through tournament draws...</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" />
              Results for "{result.playerName}"
            </h3>
            <span className="text-sm text-gray-400">{result.matches.length} appearances found</span>
          </div>

          {result.matches.length > 0 ? (
            <div className="space-y-12">
              {sortedHeaders.map((header) => (
                <div key={header} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <h4 className="text-xl font-bold text-white min-w-fit">{header}</h4>
                    <div className="h-px bg-gray-800 w-full" />
                  </div>
                  <div className="flex flex-col gap-4">
                    {groupedMatches[header].map((match, idx) => (
                      <motion.div
                        key={`${header}-${idx}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-gray-900/40 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all group w-full"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 text-xs font-bold text-blue-500 uppercase tracking-wider">
                                <Trophy className="w-3 h-3" />
                                {match.drawName}
                              </div>
                              <div className="w-1 h-1 rounded-full bg-gray-700" />
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                                {header}
                              </div>
                            </div>
                            <h4 className="text-white font-medium leading-snug group-hover:text-blue-400 transition-colors">
                              {match.tournamentName}
                            </h4>
                            <p className="text-xs text-gray-500">{match.tournamentDates}</p>
                          </div>
                          <a
                            href={match.tournamentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-all"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                        
                        {match.drawLink && (
                          <div className="mt-4 pt-4 border-t border-gray-800">
                            <a
                              href={match.drawLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gray-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
                            >
                              View Draw <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-gray-900/20 rounded-2xl border border-dashed border-gray-800">
              <p className="text-gray-500">No appearances found for this player.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
