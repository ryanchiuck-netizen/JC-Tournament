import React, { useState, useEffect, useMemo } from "react";
import { 
  Loader2, 
  AlertCircle, 
  Filter,
  RefreshCw,
  Clock,
  LogOut
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as XLSX from 'xlsx';

import { Tournament, Region, AgeFilter } from "./types";
import { fetchTournaments, getFullLink } from "./services/tournamentService";
import { TournamentCard } from "./components/TournamentCard";
import { FilterBar } from "./components/FilterBar";
import { MonthTabs } from "./components/MonthTabs";
import { PlayerWatch } from "./components/PlayerWatch";
import { PlayerScreen } from "./components/PlayerScreen";
import { TournamentScreen } from "./components/TournamentScreen";
import { DrawChecker } from "./components/DrawChecker";
import { Login } from "./components/Login";

export default function App() {
  const [user, setUser] = useState<{ email: string; name: string; picture: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"tournaments" | "player-watch" | "player-screen" | "tournament-screen" | "draw-checker">("tournaments");
  const [allTournaments, setAllTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  const [region, setRegion] = useState<Region>("BOTH");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("ALL");
  const [within120km, setWithin120km] = useState<boolean>(false);
  
  const currentMonthIndex = new Date('2026-03-04').getMonth();
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>(currentMonthIndex);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const resClone = res.clone();
        try {
          const data = await res.json();
          setUser(data.user);
        } catch (e) {
          console.error("Failed to parse /api/auth/me JSON. Response text:", await resClone.text());
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  const fetchStaticData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTournaments();
      setAllTournaments(data.tournaments || []);
      if (data.lastUpdated) {
        setLastUpdated(new Date(data.lastUpdated));
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStaticData();
      
      const intervalId = setInterval(() => {
        fetchStaticData();
      }, 60 * 60 * 1000);
      
      return () => clearInterval(intervalId);
    }
  }, [user]);

  // Filter tournaments based on region, ageFilter, searchTerm, and month
  const filteredTournaments = useMemo(() => {
    return allTournaments.filter(t => {
      // Region filter
      if (region !== 'BOTH' && t.source !== region) return false;
      
      // Age filter
      if (ageFilter === 'U10' && !t.ageGroup.includes('U10')) return false;
      if (ageFilter === 'U12' && !t.ageGroup.includes('U12')) return false;
      
      // Distance filter
      if (within120km && t.distance) {
        const distNum = parseFloat(t.distance.replace(/[^\d.]/g, ''));
        if (!isNaN(distNum) && distNum > 120) {
          return false;
        }
      } else if (within120km && !t.distance && t.source === 'AUS') {
        return false;
      }
      
      // Search filter
      if (searchTerm && !t.name.toLowerCase().includes(searchTerm.toLowerCase()) && !t.dates.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      
      // Month filter
      if (selectedMonth !== 'ALL') {
        const parts = t.dates.split(" to ");
        if (parts.length === 2) {
          const startMatch = parts[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          const endMatch = parts[1].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (startMatch && endMatch) {
            const startDate = new Date(parseInt(startMatch[3]), parseInt(startMatch[2]) - 1, parseInt(startMatch[1]));
            const endDate = new Date(parseInt(endMatch[3]), parseInt(endMatch[2]) - 1, parseInt(endMatch[1]));
            const targetMonthStart = new Date(2026, selectedMonth, 1);
            const targetMonthEnd = new Date(2026, selectedMonth + 1, 0);
            
            // Check if the tournament range overlaps with the selected month
            if (endDate < targetMonthStart || startDate > targetMonthEnd) return false;
          }
        } else {
          const match = t.dates.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (match) {
            const month = parseInt(match[2], 10) - 1;
            if (month !== selectedMonth) return false;
          }
        }
      }
      
      return true;
    });
  }, [allTournaments, region, ageFilter, searchTerm, selectedMonth, within120km]);

  const handleExport = () => {
    const dataToExport = allTournaments.map(t => ({
      'Tournament Name': t.name,
      'Dates': t.dates,
      'Age Group': t.ageGroup,
      'Region': t.source,
      'Distance': t.distance || '',
      'Closing Deadline': t.closingDeadline || '',
      'Link': getFullLink(t.link, t.source),
      'Maps Link': t.mapsLink || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Auto-size columns
    const colWidths = [
      { wch: 50 }, // Name
      { wch: 25 }, // Dates
      { wch: 15 }, // Age Group
      { wch: 10 }, // Region
      { wch: 15 }, // Distance
      { wch: 15 }, // Closing Deadline
      { wch: 50 }, // Link
      { wch: 50 }  // Maps Link
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tournaments");
    XLSX.writeFile(wb, "Tournaments_2026.xlsx");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={checkAuth} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-xl border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-0 sm:h-16 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 w-full sm:w-auto">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M6 3.5a9 9 0 0 1 0 17"></path>
                    <path d="M18 3.5a9 9 0 0 0 0 17"></path>
                  </svg>
                </div>
                <div>
                  <h1 className="text-[17px] font-semibold tracking-tight leading-tight text-white">JC Tennis</h1>
                  <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Tournament Planner</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 sm:hidden">
                {user.picture && (
                  <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                )}
                <button
                  onClick={handleLogout}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            <nav className="flex items-center gap-1 bg-gray-800/50 p-1 rounded-lg overflow-x-auto w-full sm:w-auto no-scrollbar">
              <button
                onClick={() => setActiveTab("tournaments")}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === "tournaments" 
                    ? "bg-gray-700 text-white shadow-sm" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Tournaments
              </button>
              <button
                onClick={() => setActiveTab("player-watch")}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === "player-watch" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Player Search
              </button>
              <button
                onClick={() => setActiveTab("player-screen")}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === "player-screen" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Player Screen
              </button>
              <button
                onClick={() => setActiveTab("tournament-screen")}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === "tournament-screen" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Tournament Screen
              </button>
              <button
                onClick={() => setActiveTab("draw-checker")}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === "draw-checker" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Draw Checker
              </button>
            </nav>
          </div>
          
          <div className="hidden sm:flex items-center gap-4">
            <div className="flex items-center gap-2">
              {user.picture && (
                <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
              )}
              <span className="text-sm font-medium text-gray-300">{user.name}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {activeTab === "tournaments" && (
        <MonthTabs selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className={activeTab === "tournaments" ? "block" : "hidden"}>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex bg-gray-900/50 p-1 rounded-xl border border-gray-800 shadow-sm">
                <button 
                  onClick={() => setRegion("HK")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${region === "HK" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  <span>🇭🇰</span> HK
                </button>
                <button 
                  onClick={() => setRegion("AUS")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${region === "AUS" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  <span>🇦🇺</span> AUS
                </button>
                <button 
                  onClick={() => setRegion("BOTH")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${region === "BOTH" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  <span>🇭🇰 + 🇦🇺</span>
                </button>
              </div>

              <button 
                onClick={fetchStaticData}
                disabled={loading}
                className="w-10 h-10 flex items-center justify-center bg-gray-900/50 hover:bg-gray-800 text-gray-300 rounded-xl border border-gray-800 transition-all disabled:opacity-50 shadow-sm"
                title="Refresh Database"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-900/30 px-3 py-1.5 rounded-lg border border-gray-800/50">
              <Clock className="w-3.5 h-3.5" />
              Updated {lastUpdated.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Hong_Kong' }).replace(/ /g, '-')} {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong' })} HKT
            </div>
          </div>

          <FilterBar 
            ageFilter={ageFilter}
            setAgeFilter={setAgeFilter}
            within120km={within120km}
            setWithin120km={setWithin120km}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            handleExport={handleExport}
            loading={loading}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-gray-500 mb-6">
            {loading && (
              <div className="flex items-center gap-1.5 text-orange-400 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                Refreshing data...
              </div>
            )}
          </div>

          <AnimatePresence>
            {error && (
              <div className="bg-red-900/20 border border-red-900/50 rounded-2xl p-4 flex items-start gap-3 text-red-400 mb-6">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="font-semibold text-sm text-red-300">Failed to Load Data</p>
                  <p className="text-sm opacity-90 mt-0.5">{error}</p>
                </div>
              </div>
            )}
          </AnimatePresence>

          <div className="bg-gray-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2)] border border-gray-800 overflow-hidden">
            <div className="bg-gray-800/50 border-b border-gray-800 px-6 py-3 flex items-center justify-between text-xs font-medium text-gray-400 uppercase tracking-wider">
              <span>{filteredTournaments.length} Tournaments Found</span>
            </div>
            
            <div className="divide-y divide-gray-800/50">
              {loading && allTournaments.length === 0 ? (
                <div className="p-16 flex flex-col items-center justify-center gap-4 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="text-sm font-medium">Loading Database...</p>
                </div>
              ) : filteredTournaments.length > 0 ? (
                filteredTournaments.map((t, i) => (
                  <TournamentCard key={i} tournament={t} index={i} />
                ))
              ) : !loading && (
                <div className="p-16 flex flex-col items-center justify-center gap-3 text-gray-500">
                  <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-2">
                    <Filter className="w-6 h-6 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-400">No tournaments found</p>
                  <p className="text-sm text-center max-w-xs">
                    Try adjusting your filters.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={activeTab === "player-watch" ? "block" : "hidden"}>
          <PlayerWatch />
        </div>

        <div className={activeTab === "player-screen" ? "block" : "hidden"}>
          <PlayerScreen />
        </div>

        <div className={activeTab === "tournament-screen" ? "block" : "hidden"}>
          <TournamentScreen isActive={activeTab === "tournament-screen"} />
        </div>

        <div className={activeTab === "draw-checker" ? "block" : "hidden"}>
          <DrawChecker />
        </div>

      {/* Footer */}
        <footer className="mt-12 pb-8 text-center text-xs text-gray-600 font-medium">
          <p>© 2026 Tennis Tournament Finder</p>
          <p className="mt-1">Data sourced from Tournament Software</p>
        </footer>
      </main>
    </div>
  );
}
