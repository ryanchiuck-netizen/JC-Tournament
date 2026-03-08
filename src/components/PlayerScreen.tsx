import React, { useState, useEffect, useMemo } from 'react';
import { User, Plus, X, Trophy, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
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

function SortablePlayerRow({ player, removePlayer, onRowClick, activeTab, isRefreshing }: { player: SavedPlayer, removePlayer: (id: string) => void | Promise<void>, onRowClick: (player: SavedPlayer) => void, activeTab: 'TA' | 'HKTA', isRefreshing?: boolean, key?: any }) {
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
        {activeTab === 'TA' ? player.utrSingles : (player.wtnSingles || '-')}
      </td>
      {activeTab === 'TA' && (
        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
          {player.points || '-'}
        </td>
      )}
      {activeTab === 'HKTA' && (
        <>
          <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
            {player.rank || '-'}
          </td>
          <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
            {player.points || '-'}
          </td>
        </>
      )}
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
        {player.winLossYTD}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
        {player.winLossCareer}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
        <div className="whitespace-pre-line">{player.championships}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
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

export function PlayerScreen() {
  const [players, setPlayers] = useState<SavedPlayer[]>([]);
  const [activeTab, setActiveTab] = useState<'TA' | 'HKTA'>('TA');
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<SavedPlayer | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

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
            
            // Trigger background refresh
            data.forEach((player: SavedPlayer) => {
              refreshPlayer(player.id);
            });
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
    fetchPlayers();
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
            <User className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Player Roster</h2>
            <p className="text-sm text-gray-400">Manage and track your saved players</p>
          </div>
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

        <div className="flex flex-wrap gap-2 mb-4">
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
                        isRefreshing={refreshingIds.has(player.id)}
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
