import React, { useState, useEffect } from 'react';
import { Trophy, Calendar, MapPin, Users, ChevronDown, ChevronUp, CalendarPlus } from 'lucide-react';
import { getGoogleCalendarLink } from '../services/tournamentService';
import { saveToGoogleSheets } from '../services/googleSheetsService';
import { Tournament } from '../types';

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
    source: string;
    distance?: string;
    mapsLink?: string;
    closingDeadline?: string;
  };
  joinedPlayers: JoinedPlayer[];
}

function TournamentItem({ t, index }: { t: TournamentWithPlayers, index: number, key?: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const domain = t.tournament.source === "HK" ? "hkta.tournamentsoftware.com" : "tournaments.tennis.com.au";
  const tournamentUrl = `https://${domain}${t.tournament.link}`;

  return (
    <div className="bg-gray-900/40 border border-gray-800 rounded-2xl overflow-hidden shadow-sm hover:border-gray-700 transition-colors">
      <div 
        className="p-5 border-b border-gray-800/50 bg-gray-800/20 flex flex-col sm:flex-row sm:items-start justify-between gap-4 cursor-pointer hover:bg-gray-800/40 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/20">
              {t.tournament.source === 'AUS' ? '🇦🇺 AUS' : '🇭🇰 HK'}
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
              {t.tournament.ageGroup}
            </span>
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
            {t.tournament.closingDeadline && (
              <div className="flex items-center gap-1.5 text-orange-400/80">
                <span className="font-medium">Closes:</span> {t.tournament.closingDeadline}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-blue-400/80">
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
          <a 
            href={getGoogleCalendarLink(t.tournament as Tournament)}
            target="_blank" 
            rel="noopener noreferrer"
            className="w-9 h-9 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-full transition-colors"
            title="Add to Google Calendar"
            onClick={(e) => e.stopPropagation()}
          >
            <CalendarPlus className="w-4 h-4" />
          </a>
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-800/50 text-gray-400">
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Joined Players ({t.joinedPlayers.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {t.joinedPlayers.map((jp, j) => (
              <div key={j} className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-gray-700 flex items-center justify-center border border-gray-600 shrink-0">
                    <span className="text-[10px] font-medium text-gray-300">
                      {jp.player.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="font-medium text-gray-200 text-sm truncate" title={jp.player.name}>
                    {jp.player.name}
                  </span>
                </div>
                <div className="space-y-1.5 pl-8">
                  {jp.draws.map((draw, k) => (
                    <div key={k} className="text-xs text-gray-400 flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-gray-600 shrink-0" />
                      {draw.drawLink ? (
                        <a href={draw.drawLink} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 hover:underline truncate" title={draw.drawName}>
                          {draw.drawName}
                        </a>
                      ) : (
                        <span className="truncate" title={draw.drawName}>{draw.drawName}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TournamentScreen({ isActive }: { isActive?: boolean }) {
  const [tournaments, setTournaments] = useState<TournamentWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'HK' | 'AUS'>('HK');
  const [notJoinedFilter, setNotJoinedFilter] = useState(false);

  useEffect(() => {
    const fetchTournaments = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/tournaments-for-players');
        if (res.ok) {
          const resClone = res.clone();
          try {
            const data = await res.json();
            setTournaments(data.tournaments || []);
          } catch (e) {
            console.error("Failed to parse /api/tournaments-for-players JSON. Response text:", await resClone.text());
            setError("Failed to fetch tournaments");
          }
        } else {
          setError("Failed to fetch tournaments");
        }
      } catch (e) {
        console.error("Failed to fetch tournaments", e);
        setError("An error occurred while fetching data");
      } finally {
        setLoading(false);
      }
    };
    
    if (isActive !== false) {
      fetchTournaments();
    }
  }, [isActive]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 font-medium">Scanning all future tournaments for saved players...</p>
        <p className="text-gray-500 text-sm">This might take a minute.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-red-400 font-medium">{error}</p>
      </div>
    );
  }

  const filteredTournaments = notJoinedFilter 
    ? tournaments.filter(t => {
        return !t.joinedPlayers.some(jp => 
          jp.player.name.includes("Jordan Chiu") || 
          jp.player.name.includes("CHIU Jordan Chung Shing") ||
          jp.player.id === "66333972211" ||
          jp.player.id === "66419"
        );
      })
    : tournaments;

  if (filteredTournaments.length === 0 && !notJoinedFilter) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Trophy className="w-16 h-16 text-gray-700" />
        <p className="text-gray-400 font-medium text-lg">No future tournaments found</p>
        <p className="text-gray-500 text-sm">None of your saved players have joined any upcoming tournaments.</p>
      </div>
    );
  }

  const ausTournaments = filteredTournaments.filter(t => t.tournament.source === 'AUS');
  const hkTournaments = filteredTournaments.filter(t => t.tournament.source === 'HK');

  const renderTournamentList = (list: TournamentWithPlayers[]) => {
    if (list.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Trophy className="w-16 h-16 text-gray-700" />
          <p className="text-gray-400 font-medium text-lg">No future tournaments found</p>
          <p className="text-gray-500 text-sm">None of your saved players have joined any upcoming tournaments here.</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="grid gap-6">
          {list.map((t, i) => (
            <TournamentItem key={i} t={t} index={i} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            Upcoming Tournaments
          </h2>
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
            <span className="text-sm font-medium text-gray-300">Not Joined</span>
          </label>
        </div>
        <div className="text-sm text-gray-400 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-800 w-fit">
          Found {filteredTournaments.length} tournament{filteredTournaments.length !== 1 ? 's' : ''}
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
