import React, { useState, useMemo, useEffect } from 'react';
import { Search, Loader2, AlertCircle, ExternalLink, Trophy, ChevronUp, ChevronDown } from 'lucide-react';
import { saveToGoogleSheets } from '../services/googleSheetsService';

interface PlayerStats {
  id: string;
  name: string;
  utrSingles?: string;
  points?: string;
  winLossYTD?: string;
  winLossCareer?: string;
  championships?: number;
  profileUrl?: string;
}

type SortConfig = {
  key: keyof PlayerStats;
  direction: 'asc' | 'desc';
} | null;

export function DrawChecker() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'utrSingles', direction: 'desc' });

  const handleCheckDraw = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setPlayers([]);
    setSortConfig({ key: 'utrSingles', direction: 'desc' });

    try {
      const res = await fetch('/api/check-draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (res.ok) {
        const resClone = res.clone();
        try {
          const data = await res.json();
          setPlayers(data.players || []);
        } catch (e) {
          console.error("Failed to parse /api/check-draw JSON. Response text:", await resClone.text());
          setError('Failed to check draw');
        }
      } else {
        const resClone = res.clone();
        try {
          const errData = await res.json();
          setError(errData.error || 'Failed to check draw');
        } catch (e) {
          console.error("Failed to parse /api/check-draw error JSON. Response text:", await resClone.text());
          setError('Failed to check draw');
        }
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while checking the draw');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: keyof PlayerStats) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const playersWithRank = useMemo(() => {
    // Sort by UTR descending to assign ranks
    const sortedByUtr = [...players].sort((a, b) => {
      const aVal = a.utrSingles;
      const bVal = b.utrSingles;
      
      if ((aVal === undefined || aVal === null || aVal === '-') && (bVal === undefined || bVal === null || bVal === '-')) return 0;
      if (aVal === undefined || aVal === null || aVal === '-') return 1;
      if (bVal === undefined || bVal === null || bVal === '-') return -1;
      
      const aNum = parseFloat(aVal.replace(/[^\d.]/g, '')) || 0;
      const bNum = parseFloat(bVal.replace(/[^\d.]/g, '')) || 0;
      return bNum - aNum;
    });

    return players.map(p => {
      const rank = sortedByUtr.findIndex(sp => sp.id === p.id) + 1;
      return { ...p, rank };
    });
  }, [players]);

  const sortedPlayers = useMemo(() => {
    if (!sortConfig) return playersWithRank;

    return [...playersWithRank].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if ((aValue === undefined || aValue === null || aValue === '-') && (bValue === undefined || bValue === null || bValue === '-')) return 0;
      if (aValue === undefined || aValue === null || aValue === '-') return 1;
      if (bValue === undefined || bValue === null || bValue === '-') return -1;

      // Handle numeric values (points, championships)
      if (sortConfig.key === 'championships') {
        return sortConfig.direction === 'asc' 
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }

      if (sortConfig.key === 'points' || sortConfig.key === 'utrSingles') {
        const aNum = parseFloat((aValue as string).replace(/[^\d.]/g, '')) || 0;
        const bNum = parseFloat((bValue as string).replace(/[^\d.]/g, '')) || 0;
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // Handle win/loss ratios (e.g., "10:5")
      if (sortConfig.key === 'winLossYTD' || sortConfig.key === 'winLossCareer') {
        const getRatio = (val: string) => {
          const parts = val.split(':');
          if (parts.length === 2) {
            const wins = parseInt(parts[0]) || 0;
            const losses = parseInt(parts[1]) || 0;
            return losses === 0 ? wins : wins / losses;
          }
          return 0;
        };
        const aRatio = getRatio(aValue as string);
        const bRatio = getRatio(bValue as string);
        return sortConfig.direction === 'asc' ? aRatio - bRatio : bRatio - aRatio;
      }

      // Default string comparison
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [playersWithRank, sortConfig]);

  useEffect(() => {
    if (sortedPlayers.length > 0) {
      saveToGoogleSheets('Draw Checker', sortedPlayers).catch(console.error);
    }
  }, [sortedPlayers]);

  const SortIcon = ({ column }: { column: keyof PlayerStats }) => {
    if (!sortConfig || sortConfig.key !== column) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-blue-400" />
          Draw Checker
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          Enter a tournament draw URL from tournaments.tennis.com.au to see stats for all players in that draw.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://tournaments.tennis.com.au/sport/event.aspx?id=..."
            className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
          <button
            onClick={handleCheckDraw}
            disabled={loading || !url}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Check Draw
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-900/50 rounded-2xl p-4 flex items-start gap-3 text-red-400">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
          <div>
            <p className="font-semibold text-sm text-red-300">Error</p>
            <p className="text-sm opacity-90 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 font-medium">Scraping player data from the draw...</p>
          <p className="text-gray-500 text-sm">This may take a minute depending on the number of players.</p>
        </div>
      )}

      {!loading && players.length > 0 && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden shadow-inner">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800">
              <thead className="bg-gray-900/50">
                <tr>
                  <th 
                    scope="col" 
                    className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Player Name
                      <SortIcon column="name" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                    onClick={() => handleSort('utrSingles')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      UTR Singles
                      <SortIcon column="utrSingles" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                    onClick={() => handleSort('points')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Points
                      <SortIcon column="points" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                    onClick={() => handleSort('winLossYTD')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Win:Loss YTD
                      <SortIcon column="winLossYTD" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                    onClick={() => handleSort('winLossCareer')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Win:Loss Career
                      <SortIcon column="winLossCareer" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800/50 transition-colors"
                    onClick={() => handleSort('championships')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Championships
                      <SortIcon column="championships" />
                    </div>
                  </th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Profile
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-900/20">
                {sortedPlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-6 text-center">
                          {player.rank === 1 ? (
                            <div className="w-6 h-6 mx-auto bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]" title="Rank 1">
                              <span className="text-xs font-bold">1</span>
                            </div>
                          ) : player.rank === 2 ? (
                            <div className="w-6 h-6 mx-auto bg-gray-300/20 text-gray-300 rounded-full flex items-center justify-center border border-gray-300/30" title="Rank 2">
                              <span className="text-xs font-bold">2</span>
                            </div>
                          ) : player.rank === 3 ? (
                            <div className="w-6 h-6 mx-auto bg-amber-700/20 text-amber-600 rounded-full flex items-center justify-center border border-amber-700/30" title="Rank 3">
                              <span className="text-xs font-bold">3</span>
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-gray-500">{player.rank}</span>
                          )}
                        </div>
                        <div className="h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
                          <span className="text-xs font-medium text-gray-400">
                            {player.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        {player.profileUrl ? (
                          <a 
                            href={player.profileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                          >
                            {player.name}
                          </a>
                        ) : (
                          <span className="text-sm font-medium text-gray-200">
                            {player.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
                      {player.utrSingles || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
                      {player.points || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
                      {player.winLossYTD || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
                      {player.winLossCareer || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
                      {player.championships || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {player.profileUrl && (
                        <a
                          href={player.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && players.length === 0 && !error && url && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Trophy className="w-12 h-12 text-gray-800" />
          <p className="text-gray-500 font-medium">No players found in this draw.</p>
        </div>
      )}
    </div>
  );
}
