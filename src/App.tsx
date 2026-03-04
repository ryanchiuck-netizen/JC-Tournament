import React, { useState, useEffect, useMemo } from "react";
import { 
  Search, 
  Calendar, 
  Loader2, 
  AlertCircle, 
  Trophy,
  Filter,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Clock,
  Globe,
  MapPin,
  CalendarPlus,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from 'xlsx';

// Types
interface Tournament {
  name: string;
  dates: string;
  link: string;
  ageGroup: string;
  source: "HK" | "AUS";
  distance?: string;
  mapsLink?: string;
  closingDeadline?: string;
}

type Region = "HK" | "AUS" | "BOTH";
type AgeFilter = "ALL" | "U10" | "U12";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export default function App() {
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

  const fetchStaticData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tournaments/static');
      if (!response.ok) {
        throw new Error('Data not available yet. Scraper might be running.');
      }
      const data = await response.json();
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
    fetchStaticData();
    
    const intervalId = setInterval(() => {
      fetchStaticData();
    }, 60 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, []);

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

  const getFullLink = (link: string, source: "HK" | "AUS") => {
    if (link.startsWith('http')) return link;
    const base = source === "HK" ? "https://hkta.tournamentsoftware.com" : "https://tournaments.tennis.com.au";
    return `${base}${link.startsWith('/') ? '' : '/'}${link}`;
  };

  const getGoogleCalendarLink = (tournament: Tournament) => {
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
  };

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

    // Make first row bold
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:H1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[address]) continue;
      ws[address].s = { font: { bold: true } };
    }

    // Freeze first row
    ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

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

  // Generate month tabs from January to December
  const monthTabs = useMemo(() => {
    const tabs = [];
    for (let i = 0; i < 12; i++) {
      tabs.push({ index: i, name: MONTHS[i] });
    }
    return tabs;
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-xl border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight leading-tight text-white">JC Tennis</h1>
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Tournament Planner</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Region Tabs */}
            <div className="flex bg-gray-800/80 p-1 rounded-lg shrink-0">
              <button 
                onClick={() => setRegion("HK")}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${region === "HK" ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <span>🇭🇰</span> HK
              </button>
              <button 
                onClick={() => setRegion("AUS")}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${region === "AUS" ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <span>🇦🇺</span> AUS
              </button>
              <button 
                onClick={() => setRegion("BOTH")}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${region === "BOTH" ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <span>🇭🇰 + 🇦🇺</span>
              </button>
            </div>

            <button 
              onClick={fetchStaticData}
              disabled={loading}
              className="w-8 h-8 flex items-center justify-center bg-gray-800/80 hover:bg-gray-700 text-gray-300 rounded-full transition-colors disabled:opacity-50 shrink-0"
              title="Refresh Now"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Month Tabs */}
      <div className="bg-gray-900 border-b border-gray-800 sticky top-16 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex overflow-x-auto no-scrollbar py-2 gap-2">
            <button
              onClick={() => setSelectedMonth('ALL')}
              className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all ${
                selectedMonth === 'ALL' 
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                  : 'bg-gray-800/50 text-gray-400 border border-transparent hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              All Year
            </button>
            {monthTabs.map(tab => (
              <button
                key={tab.index}
                onClick={() => setSelectedMonth(tab.index)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all ${
                  selectedMonth === tab.index 
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                    : 'bg-gray-800/50 text-gray-400 border border-transparent hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        
        {/* Controls Row */}
        <div className="flex flex-col gap-6 mb-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Age Filter Tabs - Visible on all devices */}
            <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
              <div className="flex bg-gray-900/50 p-1 rounded-xl border border-gray-800 overflow-x-auto no-scrollbar">
                <button 
                  onClick={() => setAgeFilter("ALL")}
                  className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${ageFilter === "ALL" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  All
                </button>
                <button 
                  onClick={() => setAgeFilter("U10")}
                  className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${ageFilter === "U10" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  U10
                </button>
                <button 
                  onClick={() => setAgeFilter("U12")}
                  className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${ageFilter === "U12" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  U12
                </button>
              </div>
              
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
                <input 
                  type="checkbox" 
                  checked={within120km}
                  onChange={(e) => setWithin120km(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                />
                Within 120km
              </label>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={handleExport}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors shadow-sm w-full md:w-auto"
              >
                <Download className="w-4 h-4" />
                Export Excel
              </button>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter locally..."
                  className="w-full bg-gray-900 border border-gray-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 transition-all outline-none shadow-sm"
                />
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Updated {lastUpdated.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Hong_Kong' }).replace(/ /g, '-')} {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong' })} HKT
            </div>
            {loading && (
              <div className="flex items-center gap-1.5 text-orange-400 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                Refreshing data...
              </div>
            )}
          </div>
        </div>

        {/* Error State */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-red-900/20 border border-red-900/50 rounded-2xl p-4 flex items-start gap-3 text-red-400">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="font-semibold text-sm text-red-300">Failed to Load Data</p>
                  <p className="text-sm opacity-90 mt-0.5">{error}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Data View */}
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
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.01 }}
                  className="p-4 sm:px-6 hover:bg-gray-800/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-8 h-8 rounded-full bg-blue-900/30 text-blue-400 flex items-center justify-center font-semibold text-sm shrink-0 mt-0.5 border border-blue-800/50">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-100 text-[15px] leading-snug mb-2 group-hover:text-blue-400 transition-colors">
                        {t.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 opacity-70" />
                          {t.dates}
                        </div>
                        <div className="w-1 h-1 rounded-full bg-gray-700"></div>
                        {t.ageGroup.replace('U10 & U12', 'U10, U12').split(', ').map((age, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-blue-400 bg-blue-900/20 border border-blue-800/30 px-2 py-0.5 rounded-md text-xs font-semibold">
                            {age}
                          </div>
                        ))}
                        <div className="w-1 h-1 rounded-full bg-gray-700"></div>
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border ${t.source === 'HK' ? 'text-red-400 bg-red-900/20 border-red-800/30' : 'text-emerald-400 bg-emerald-900/20 border-emerald-800/30'}`}>
                          <span>{t.source === 'HK' ? '🇭🇰' : '🇦🇺'}</span>
                          {t.source}
                        </div>
                      </div>
                      
                      {t.closingDeadline && (
                        <div className="flex items-center gap-2 mt-2 text-sm">
                          <span className="text-gray-400 font-medium">Entry Closes: {t.closingDeadline}</span>
                          {(() => {
                            const parts = t.closingDeadline.split('/');
                            if (parts.length === 3) {
                              const deadline = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                              const today = new Date('2026-03-04T00:00:00');
                              const diffTime = deadline.getTime() - today.getTime();
                              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                              
                              if (diffDays > 0) {
                                return <span className="text-amber-400 font-semibold bg-amber-900/20 px-2 py-0.5 rounded-md text-xs">({diffDays} days left)</span>;
                              } else if (diffDays === 0) {
                                return <span className="text-red-400 font-semibold bg-red-900/20 px-2 py-0.5 rounded-md text-xs">(Closes today)</span>;
                              } else {
                                return <span className="text-gray-500 font-semibold bg-gray-800 px-2 py-0.5 rounded-md text-xs">(Closed)</span>;
                              }
                            }
                            return null;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto pl-12 sm:pl-0 mt-4 sm:mt-0">
                    {(t.mapsLink || t.distance) && (
                      <div className="flex flex-col items-center gap-1">
                        {t.mapsLink ? (
                          <a 
                            href={t.mapsLink}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-9 h-9 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-full transition-colors"
                            title="Open in Google Maps"
                          >
                            <MapPin className="w-4 h-4" />
                          </a>
                        ) : (
                          <div className="w-9 h-9 flex items-center justify-center bg-gray-800 text-gray-500 rounded-full">
                            <MapPin className="w-4 h-4" />
                          </div>
                        )}
                        {t.distance && (
                          <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">{t.distance}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 h-9">
                      <a 
                        href={getGoogleCalendarLink(t)}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-9 h-9 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-full transition-colors"
                        title="Add to Google Calendar"
                      >
                        <CalendarPlus className="w-4 h-4" />
                      </a>
                      <a 
                        href={getFullLink(t.link, t.source)}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-4 h-9 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-full transition-colors border border-gray-700"
                      >
                        Details <ChevronRight className="w-4 h-4 opacity-50" />
                      </a>
                    </div>
                  </div>
                </motion.div>
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

        {/* Footer */}
        <footer className="mt-12 pb-8 text-center text-xs text-gray-600 font-medium">
          <p>© 2026 Tennis Tournament Finder</p>
          <p className="mt-1">Data sourced from Tournament Software</p>
        </footer>
      </main>
    </div>
  );
}
