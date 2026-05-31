import React, { useState, useEffect, useMemo } from 'react';
import { User, Plus, X, Trophy, GripVertical, ArrowUp, ArrowDown, Clock, ArrowLeft, Calendar, RefreshCw, Search } from 'lucide-react';
import { saveToGoogleSheets } from '../services/googleSheetsService';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SavedPlayer {
  id: string;
  name: string;
  url?: string;
  source?: string;
  utrSingles: string;
  wtnSingles?: string;
  winLossYTD: string;
  winLossCareer: string;
  championships: string;
  rank?: string;
  points?: string;
}

function PlayerTournamentsModal({ player, onClose }: { player: SavedPlayer, onClose: () => void }) {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const res = await fetch(`/api/player-watch?name=${encodeURIComponent(player.name)}&source=${encodeURIComponent(player.source || '')}`);
        if (res.ok) {
          const resClone = res.clone();
          try {
            const data = await res.json();
            const futureTournaments = data.matches.filter((m: any) => {
              if (!m.tournamentDates) return false;
              const parts = m.tournamentDates.split(' to ');
              const dateToParse = parts[parts.length - 1].trim();
              const [day, month, year] = dateToParse.split('/');
              if (!day || !month || !year) return false;
              const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return date >= today;
            });
            setTournaments(futureTournaments);
          } catch (e) {
            console.error("Failed to parse /api/player-watch JSON. Response text:", await resClone.text());
          }
        }
      } catch (e) {
        console.error("Failed to fetch player tournaments", e);
      } finally {
        setLoading(false);
      }
    };
    fetchTournaments();
  }, [player.name]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-semibold text-white">{player.name}'s Future Tournaments</h2>
            <p className="text-sm text-gray-400 mt-1">Tournaments they have joined</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">Searching for tournaments...</p>
            </div>
          ) : tournaments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Trophy className="w-10 h-10 text-gray-700" />
              <p className="text-gray-400 text-sm">No future tournaments found for this player.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tournaments.map((t, i) => (
                <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 hover:bg-gray-800 transition-colors">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <a href={t.tournamentLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline font-medium text-lg">
                        {t.tournamentName}
                      </a>
                      <p className="text-sm text-gray-400 mt-1">{t.tournamentDates}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-700/50">
                    <p className="text-sm text-gray-300">
                      <span className="text-gray-500 mr-2">Draw:</span>
                      {t.drawLink ? (
                        <a href={t.drawLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">
                          {t.drawName}
                        </a>
                      ) : (
                        t.drawName
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SortablePlayerRow({ 
  player, 
  removePlayer, 
  onRowClick, 
  activeTab, 
  isRefreshing, 
  onViewHistory,
  previousPlayerData
}: { 
  player: SavedPlayer, 
  removePlayer: (id: string) => void | Promise<void>, 
  onRowClick: (player: SavedPlayer) => void, 
  activeTab: 'TA' | 'HKTA', 
  isRefreshing?: boolean, 
  onViewHistory: (playerName: string) => void,
  previousPlayerData?: any,
  key?: any 
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: player.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  const renderStat = (current: string | undefined, previous: string | undefined) => {
    const safeCurrent = current || '-';
    // Some values may have missing properties, normalize to check difference
    // Check if previous exists and is truly different than current
    if (previous && previous !== '-' && previous !== safeCurrent && previous !== '.') {
      return (
        <div className="flex flex-col items-center justify-center -gap-0.5 min-h-[3.5rem] py-1">
          <span className="text-[10px] text-red-500 line-through opacity-70 mb-0.5 whitespace-pre-line leading-tight">{previous}</span>
          <span className="text-yellow-400 font-bold whitespace-pre-line leading-tight">{safeCurrent}</span>
        </div>
      );
    }
    return <div className="whitespace-pre-line py-1 min-h-[3.5rem] flex items-center justify-center">{safeCurrent}</div>;
  };

  return (
    <tr 
      ref={setNodeRef} 
      style={style} 
      className="hover:bg-gray-800/50 transition-colors group relative bg-gray-900/20 cursor-pointer"
      onClick={() => onRowClick(player)}
    >
      <td className="px-2 py-4 whitespace-nowrap w-10" onClick={(e) => e.stopPropagation()}>
        <button
          {...attributes}
          {...listeners}
          className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing p-1 rounded"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="relative h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700 mr-3">
            {isRefreshing ? (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-xs font-medium text-gray-300">
                {player.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-medium text-gray-200 flex items-center gap-2">
              {player.url ? (
                <a 
                  href={player.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-blue-400 hover:underline transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {player.name}
                </a>
              ) : (
                player.name
              )}
              {player.source === 'TA' && <span title="Tennis Australia" className="text-lg">🇦🇺</span>}
              {player.source === 'HKTA' && <span title="Hong Kong Tennis Association" className="text-lg">🇭🇰</span>}
            </div>
            {player.source && (
              <div className="text-xs text-gray-500 mt-0.5">
                {player.source === 'TA' ? 'Tennis Australia' : 'HKTA'}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
        {renderStat(activeTab === 'TA' ? player.utrSingles : (player.wtnSingles || '-'), previousPlayerData ? (activeTab === 'TA' ? previousPlayerData.utrSingles : previousPlayerData.wtnSingles) : undefined)}
      </td>
      {activeTab === 'TA' && (
        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
          {renderStat(player.points || '-', previousPlayerData?.points)}
        </td>
      )}
      {activeTab === 'HKTA' && (
        <>
          <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
            {renderStat(player.rank || '-', previousPlayerData?.rank)}
          </td>
          <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
            {renderStat(player.points || '-', previousPlayerData?.points)}
          </td>
        </>
      )}
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
        {renderStat(player.winLossYTD, previousPlayerData?.winLossYTD)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
        {renderStat(player.winLossCareer, previousPlayerData?.winLossCareer)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
        {renderStat(player.championships, previousPlayerData?.championships)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onViewHistory(player.name)}
          className="text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 p-2 rounded-lg transition-colors mr-1"
          title="View player history"
        >
          <Clock className="w-4 h-4" />
        </button>
        <button
          onClick={() => removePlayer(player.id)}
          className="text-gray-500 hover:text-red-400 hover:bg-red-400/10 p-2 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Remove player"
        >
          <X className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

function HistoryView({ 
  onClose, 
  initialPlayerName = "" 
}: { 
  onClose: () => void, 
  savedPlayers?: SavedPlayer[], 
  initialPlayerName?: string 
}) {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [selectedRegion, setSelectedRegion] = useState<"TA" | "HKTA">("TA");
  const [searchPlayer, setSearchPlayer] = useState<string>(initialPlayerName);

  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/player-snapshots");
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data || []);
        if (data && data.length > 0) {
          setSelectedSnapshot(data[0]);
        }
      }
    } catch (e) {
      console.error("Failed to fetch player snapshots:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshots();
  }, []);

  const formatDateHeader = (dateStr: string) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    if (dateStr === today) return "Today";
    if (dateStr === yesterday) return "Yesterday";
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  const currentPlayers = useMemo(() => {
    if (!selectedSnapshot) return [];
    const playersList = selectedRegion === "TA" ? selectedSnapshot.taPlayers : selectedSnapshot.hktaPlayers;
    if (!playersList) return [];
    
    if (searchPlayer.trim() !== "") {
      return playersList.filter((p: any) => 
        p.name.toLowerCase().includes(searchPlayer.toLowerCase())
      );
    }
    return playersList;
  }, [selectedSnapshot, selectedRegion, searchPlayer]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose} 
            className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl transition-all border border-gray-750"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-white">Historical Player Data</h2>
            <p className="text-sm text-gray-400 mt-0.5">View daily snapshots of the player roster</p>
          </div>
        </div>

        {/* Search bar inside snapshots view */}
        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-500" />
          </div>
          <input
            type="text"
            value={searchPlayer}
            onChange={(e) => setSearchPlayer(e.target.value)}
            placeholder="Filter by player name..."
            className="w-full bg-gray-950 text-gray-300 border border-gray-800 rounded-xl px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
          {searchPlayer && (
            <button 
              onClick={() => setSearchPlayer("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm font-medium">Retrieving daily roster snapshots...</p>
        </div>
      ) : snapshots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center bg-gray-900 border border-gray-800 rounded-2xl">
          <Clock className="w-12 h-12 text-gray-700 mb-2" />
          <p className="text-gray-405 text-base font-semibold">No snapshots found</p>
          <p className="text-xs text-gray-500 max-w-sm">
            Snapshots are taken automatically on server startup or when any player stats are fetched or updated.
          </p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start h-[calc(100vh-270px)] overflow-hidden">
          {/* Sidebar - Select Date */}
          <div className="w-full lg:w-60 bg-gray-950 border border-gray-800 rounded-2xl p-4 flex flex-col h-full max-h-[250px] lg:max-h-full overflow-hidden">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Select Date</h3>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {snapshots.map((s) => (
                <button
                  key={s.date}
                  onClick={() => setSelectedSnapshot(s)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedSnapshot?.date === s.date
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/10"
                      : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                  }`}
                >
                  <span className="block font-semibold">{formatDateHeader(s.date)}</span>
                  <span className={`text-[10px] block mt-0.5 font-mono ${
                    selectedSnapshot?.date === s.date ? "text-blue-200" : "text-gray-500"
                  }`}>
                    {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Snapshot Table Details Column */}
          <div className="flex-grow flex-1 w-full bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden flex flex-col h-full">
            {/* Snapshot Subheader */}
            <div className="p-4 border-b border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-900/10">
              <div className="flex bg-gray-900 p-1 rounded-xl border border-gray-800/80">
                <button
                  onClick={() => setSelectedRegion("TA")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedRegion === "TA"
                      ? "bg-blue-600 text-white shadow"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Tennis Australia
                </button>
                <button
                  onClick={() => setSelectedRegion("HKTA")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedRegion === "HKTA"
                      ? "bg-blue-600 text-white shadow"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  HKTA
                </button>
              </div>

              <div className="text-xs text-gray-500 font-mono flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-600" />
                <span>Snapshot taken: {selectedSnapshot ? new Date(selectedSnapshot.timestamp).toLocaleString() : '-'}</span>
              </div>
            </div>

            {/* Roster Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-800 bg-gray-950 sticky top-0 z-10 shadow-sm">
                    <th scope="col" className="px-6 py-3.5">Player Name</th>
                    {selectedRegion === "TA" ? (
                      <th scope="col" className="px-6 py-3.5 text-center">UTR</th>
                    ) : (
                      <th scope="col" className="px-6 py-3.5 text-center">Rank</th>
                    )}
                    <th scope="col" className="px-6 py-3.5 text-center">Points</th>
                    <th scope="col" className="px-6 py-3.5 text-center">Win:Loss YTD</th>
                    <th scope="col" className="px-6 py-3.5 text-center">Win:Loss Career</th>
                    <th scope="col" className="px-6 py-3.5 text-center">Championships</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/65 bg-gray-900/10">
                  {currentPlayers.map((p: any) => (
                    <tr 
                      key={p.id || p.name} 
                      className="hover:bg-gray-900/40 transition-colors"
                    >
                      <td className="px-6 py-3.5 font-medium text-white">{p.name}</td>
                      {selectedRegion === "TA" ? (
                        <td className="px-6 py-3.5 text-center font-bold text-blue-400">{p.utrSingles || p.utr_singles || '-'}</td>
                      ) : (
                        <td className="px-6 py-3.5 text-center font-bold text-amber-500">{p.rank || '-'}</td>
                      )}
                      <td className="px-6 py-3.5 text-center text-gray-300 font-medium">{p.points || '-'}</td>
                      <td className="px-6 py-3.5 text-center text-gray-300 font-mono text-xs">{p.winLossYTD || p.win_loss_ytd || '-'}</td>
                      <td className="px-6 py-3.5 text-center text-gray-300 font-mono text-xs">{p.winLossCareer || p.win_loss_career || '-'}</td>
                      <td className="px-6 py-3.5 text-center text-xs text-gray-400 font-normal whitespace-pre-line max-w-[170px] truncate-championships hover:whitespace-pre-line hover:overflow-visible hover:max-w-none transition-all">
                        {p.championships || '-'}
                      </td>
                    </tr>
                  ))}

                  {currentPlayers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <Search className="w-5 h-5 text-gray-700" />
                          <p className="text-sm font-medium">No historical records found</p>
                          <p className="text-xs text-gray-600">
                            {searchPlayer ? "Try adjusting your search query filter." : "This snapshot contains no players for the selected region."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PlayerScreen() {
  const [players, setPlayers] = useState<SavedPlayer[]>([]);
  const [activeTab, setActiveTab] = useState<'TA' | 'HKTA'>('TA');
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<SavedPlayer | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyPlayerFilter, setHistoryPlayerFilter] = useState<string>("");
  const [yesterdaySnapshot, setYesterdaySnapshot] = useState<any>(null);

  type SortField = 'name' | 'utrSingles' | 'wtnSingles' | 'points' | 'rank' | 'winLossYTD' | 'winLossCareer' | 'championships' | 'custom';
  const [sortField, setSortField] = useState<SortField>('custom');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // When activeTab changes, reset sort to default
  useEffect(() => {
    if (activeTab === 'TA') {
      setSortField('utrSingles');
      setSortDirection('desc');
    } else {
      setSortField('rank');
      setSortDirection('asc');
    }
  }, [activeTab]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'rank' || field === 'name' ? 'asc' : 'desc');
    }
  };

  // Load from server on mount
  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const res = await fetch('/api/saved-players');
        if (res.ok) {
          const resClone = res.clone();
          try {
            const data = await res.json();
            setPlayers(data);
          } catch (e) {
            console.error("Failed to parse /api/saved-players JSON. Response text:", await resClone.text());
          }
        }
      } catch (e) {
        console.error("Failed to fetch saved players", e);
      } finally {
        setLoading(false);
      }
    };
    const fetchYesterdaySnapshot = async () => {
      try {
        const res = await fetch('/api/player-snapshots');
        if (res.ok) {
          const snapshots = await res.json();
          if (snapshots && snapshots.length > 0) {
            const todayDate = new Date().toISOString().split('T')[0];
            const previous = snapshots.find((s: any) => s.date !== todayDate);
            if (previous) {
              setYesterdaySnapshot(previous);
            } else if (snapshots.length > 1) {
              setYesterdaySnapshot(snapshots[1]);
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch player snapshots for difference", e);
      }
    };
    fetchPlayers();
    fetchYesterdaySnapshot();
  }, []);

  // Manual refresh helper is retained for potential future manual trigger controls
  /*
  const refreshPlayer = async (id: string) => {
    setRefreshingIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/refresh-player/${id}`, { method: 'POST' });
      if (res.ok) {
        const updatedPlayer = await res.json();
        setPlayers(prev => prev.map(p => p.id === id ? updatedPlayer : p));
      }
    } catch (e) {
      console.error(`Failed to refresh player ${id}`, e);
    } finally {
      setRefreshingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };
  */

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setAdding(true);
    setError(null);

    try {
      const res = await fetch('/api/saved-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
      });
      
      if (res.ok) {
        const resClone = res.clone();
        try {
          const newPlayers = await res.json();
          setPlayers([...players, ...newPlayers]);
          setNewName('');
        } catch (e) {
          console.error("Failed to parse POST /api/saved-players JSON. Response text:", await resClone.text());
          setError("Failed to add player");
        }
      } else {
        const resClone = res.clone();
        try {
          const data = await res.json();
          setError(data.error || "Failed to add player");
        } catch (e) {
          console.error("Failed to parse POST /api/saved-players error JSON. Response text:", await resClone.text());
          setError("Failed to add player");
        }
      }
    } catch (e) {
      console.error("Failed to add player", e);
      setError("An unexpected error occurred");
    } finally {
      setAdding(false);
    }
  };

  const removePlayer = async (id: string) => {
    try {
      const res = await fetch(`/api/saved-players/${id}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        setPlayers(players.filter(p => p.id !== id));
      }
    } catch (e) {
      console.error("Failed to remove player", e);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const currentList = sortedPlayers;
      const oldIndex = currentList.findIndex((p) => p.id === active.id);
      const newIndex = currentList.findIndex((p) => p.id === over.id);
      
      const newFilteredPlayers = arrayMove(currentList, oldIndex, newIndex);
      const otherPlayers = players.filter(p => p.source !== activeTab);
      
      const newPlayers = [...newFilteredPlayers, ...otherPlayers];
      
      setPlayers(newPlayers);
      setSortField('custom');
      
      try {
        await fetch('/api/saved-players/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players: newPlayers })
        });
      } catch (e) {
        console.error("Failed to save reordered players", e);
      }
    }
  };

  const filteredPlayers = players.filter(p => p.source === activeTab);

  const sortedPlayers = useMemo(() => {
    if (sortField === 'custom') return filteredPlayers;

    return [...filteredPlayers].sort((a, b) => {
      let aVal: any = a[sortField as keyof SavedPlayer];
      let bVal: any = b[sortField as keyof SavedPlayer];

      const parseNum = (val: any, isRank: boolean) => {
        if (!val || val === '-') return isRank ? Infinity : -Infinity;
        const num = parseFloat(val.toString().replace(/[^\d.-]/g, ''));
        return isNaN(num) ? (isRank ? Infinity : -Infinity) : num;
      };

      if (sortField === 'utrSingles' || sortField === 'wtnSingles' || sortField === 'points' || sortField === 'rank') {
        aVal = parseNum(aVal, sortField === 'rank');
        bVal = parseNum(bVal, sortField === 'rank');
      } else if (sortField === 'winLossYTD' || sortField === 'winLossCareer') {
        const parseWinRatio = (val: any) => {
          if (!val || val === '-') return -1;
          const parts = val.toString().split('/');
          if (parts.length === 2) {
            const wins = parseFloat(parts[0]);
            const losses = parseFloat(parts[1]);
            const total = wins + losses;
            return total === 0 ? 0 : wins / total;
          }
          return -1;
        };
        aVal = parseWinRatio(aVal);
        bVal = parseWinRatio(bVal);
      } else if (sortField === 'championships') {
        const countChamps = (val: any) => {
          if (!val || val === '-') return 0;
          return val.toString().split('\n').filter((s: string) => s.trim().length > 0).length;
        };
        aVal = countChamps(aVal);
        bVal = countChamps(bVal);
      } else {
        aVal = (aVal || '').toString().toLowerCase();
        bVal = (bVal || '').toString().toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredPlayers, sortField, sortDirection]);

  useEffect(() => {
    if (players.length > 0) {
      saveToGoogleSheets('Player Screen', players).catch(console.error);
    }
  }, [players]);

  const SortableHeader = ({ field, label, align = 'center' }: { field: SortField, label: string, align?: 'left' | 'center' | 'right' }) => {
    const isActive = sortField === field;
    return (
      <th 
        scope="col" 
        className={`px-6 py-4 text-${align} text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none`}
        onClick={() => handleSort(field)}
      >
        <div className={`flex items-center gap-1 justify-${align === 'center' ? 'center' : align === 'right' ? 'end' : 'start'}`}>
          {label}
          <div className={`flex flex-col transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
            {isActive && sortDirection === 'asc' ? (
              <ArrowUp className="w-3 h-3 text-blue-400" />
            ) : isActive && sortDirection === 'desc' ? (
              <ArrowDown className="w-3 h-3 text-blue-400" />
            ) : (
              <ArrowDown className="w-3 h-3" />
            )}
          </div>
        </div>
      </th>
    );
  };

  if (showHistory) {
    return (
      <HistoryView 
        onClose={() => {
          setShowHistory(false);
          setHistoryPlayerFilter("");
        }} 
        savedPlayers={players} 
        initialPlayerName={historyPlayerFilter}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Player Roster</h2>
              <p className="text-sm text-gray-400">Manage and track your saved players</p>
            </div>
          </div>
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm font-medium rounded-xl transition-all border border-gray-700 shadow-sm"
          >
            <Clock className="w-4 h-4" />
            View History
          </button>
        </div>

        <form onSubmit={handleAddPlayer} className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1 w-full sm:max-w-2xl">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-gray-500" />
            </div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter player name to search on TA & HKTA (e.g. Jordan Chiu)"
              className="block w-full pl-10 pr-3 py-2.5 border border-gray-700 rounded-xl leading-5 bg-gray-800 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all shadow-inner"
            />
          </div>
          <button
            type="submit"
            disabled={!newName.trim() || adding}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-xl transition-colors shadow-sm whitespace-nowrap shrink-0"
          >
            {adding ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {adding ? 'Searching...' : 'Search & Add'}
          </button>
        </form>
        {error && (
          <p className="text-sm text-red-400 mb-4 -mt-4">{error}</p>
        )}

        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('TA')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'TA'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              🇦🇺 Tennis Australia
            </button>
            <button
              onClick={() => setActiveTab('HKTA')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'HKTA'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              🇭🇰 Hong Kong (HKTA)
            </button>
          </div>

          <button
            onClick={async () => {
              if (!isRefreshingAll) {
                setIsRefreshingAll(true);
                try {
                  await fetch("/api/admin/refresh-all", { method: "POST" });
                  // Reload players
                  const res = await fetch('/api/saved-players');
                  if (res.ok) {
                    const data = await res.json();
                    setPlayers(data);
                  }
                } catch (err) {
                  console.error("Failed to trigger refresh", err);
                } finally {
                  setIsRefreshingAll(false);
                }
              }
            }}
            disabled={isRefreshingAll}
            className={`text-xs flex items-center gap-1.5 transition-colors px-3 py-2 rounded-lg border ${
              isRefreshingAll
                ? "bg-blue-900/20 text-blue-400 border-blue-800/50 cursor-not-allowed"
                : "bg-gray-800/50 text-gray-400 hover:text-blue-400 border-gray-700/50"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? "animate-spin" : ""}`} />
            {isRefreshingAll ? "Refreshing..." : "Refresh All"}
          </button>
        </div>

        <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden shadow-inner">
          <div className="overflow-x-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <table className="min-w-full divide-y divide-gray-800">
                <thead className="bg-gray-900/50">
                <tr>
                  <th scope="col" className="px-2 py-4 w-10"></th>
                  <SortableHeader field="name" label="Player Name" align="left" />
                  <SortableHeader field={activeTab === 'TA' ? 'utrSingles' : 'wtnSingles'} label={activeTab === 'TA' ? 'UTR for Singles' : 'WTN Singles'} />
                  {activeTab === 'TA' && (
                    <SortableHeader field="points" label="Points" />
                  )}
                  {activeTab === 'HKTA' && (
                    <>
                      <SortableHeader field="rank" label="Rank" />
                      <SortableHeader field="points" label="Points" />
                    </>
                  )}
                  <SortableHeader field="winLossYTD" label="Win:Loss YTD" />
                  <SortableHeader field="winLossCareer" label="Win:Loss Career" />
                  <SortableHeader field="championships" label="Championships in Total" />
                  <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-900/20">
                {loading ? (
                  <tr>
                    <td colSpan={activeTab === 'HKTA' ? 8 : 7} className="px-6 py-12 text-center text-sm text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2" />
                        <p>Loading players...</p>
                      </div>
                    </td>
                  </tr>
                ) : sortedPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'HKTA' ? 9 : 8} className="px-6 py-12 text-center text-sm text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Trophy className="w-8 h-8 text-gray-700 mb-2" />
                        <p>No players added for {activeTab === 'TA' ? 'Tennis Australia' : 'HKTA'} yet.</p>
                        <p className="text-xs text-gray-600">Enter a player name above to start tracking.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <SortableContext
                    items={sortedPlayers.map(p => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {sortedPlayers.map((player) => (
                      <SortablePlayerRow 
                        key={player.id} 
                        player={player} 
                        removePlayer={removePlayer} 
                        onRowClick={setSelectedPlayer} 
                        activeTab={activeTab} 
                        isRefreshing={false}
                        onViewHistory={(name) => {
                          setHistoryPlayerFilter(name);
                          setShowHistory(true);
                        }}
                        previousPlayerData={
                          yesterdaySnapshot 
                            ? (activeTab === 'TA' ? yesterdaySnapshot.taPlayers : yesterdaySnapshot.hktaPlayers)?.find((p: any) => p.name === player.name) 
                            : null
                        }
                      />
                    ))}
                  </SortableContext>
                )}
              </tbody>
            </table>
            </DndContext>
          </div>
        </div>
      </div>
      
      {selectedPlayer && (
        <PlayerTournamentsModal 
          player={selectedPlayer} 
          onClose={() => setSelectedPlayer(null)} 
        />
      )}
    </div>
  );
}
