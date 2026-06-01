import React, { useState } from "react";
import { 
  Calendar, 
  MapPin, 
  CalendarPlus, 
  ChevronRight,
  Layers,
  RefreshCw
} from "lucide-react";
import { motion } from "motion/react";
import { Tournament } from "../types";
import { getFullLink, getGoogleCalendarLink, getTournamentState } from "../services/tournamentService";

function normalizeUrl(urlStr: string): string {
  if (!urlStr) return '';
  return urlStr.split('#')[0].toLowerCase().trim();
}

interface TournamentCardProps {
  tournament: Tournament;
  index: number;
  savedDraws?: any[];
  onSavedDrawsChanged?: () => void;
}

export const TournamentCard: React.FC<TournamentCardProps> = ({ tournament, index, savedDraws = [], onSavedDrawsChanged }) => {
  const t = tournament;
  const [isProcessing, setIsProcessing] = useState(false);
  
  const getDeadlineInfo = () => {
    if (!t.closingDeadline) return null;
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
  };

  const fullLink = getFullLink(t.link, t.source);
  const savedDraw = savedDraws.find((sd) => normalizeUrl(sd.url) === normalizeUrl(fullLink));
  const isSaved = !!savedDraw;

  const handleToggleDraws = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsProcessing(true);
    try {
      if (isSaved && savedDraw) {
        const deleteRes = await fetch(`/api/saved-draws/${savedDraw.id}`, {
          method: 'DELETE',
        });
        if (deleteRes.ok && onSavedDrawsChanged) {
          onSavedDrawsChanged();
        }
      } else {
        const checkRes = await fetch('/api/check-draw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: fullLink }),
        });
        
        let finalUrl = fullLink;
        let finalPlayers = [];
        if (checkRes.ok) {
          const data = await checkRes.json();
          if (data.tournamentDate && !finalUrl.includes('#date=')) {
            finalUrl += `#date=${encodeURIComponent(data.tournamentDate)}`;
          }
          if (data.players) {
            finalPlayers = data.players;
          }
        }
        
        const saveRes = await fetch('/api/saved-draws', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: finalUrl,
            region: t.source === 'HK' ? 'HKTA' : 'AUS',
            name: t.name,
            players: finalPlayers
          })
        });
        if (saveRes.ok && onSavedDrawsChanged) {
          onSavedDrawsChanged();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.01 }}
      className="p-4 sm:px-6 hover:bg-gray-800/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
    >
      <div className="flex items-start gap-4 flex-1">
        <div className="w-8 h-8 rounded-full bg-blue-900/30 text-blue-400 flex items-center justify-center font-semibold text-sm shrink-0 mt-0.5 border border-blue-800/50">
          {index + 1}
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
            {t.source === 'AUS' && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border border-teal-800/30 text-teal-400 bg-teal-900/20">
                {getTournamentState(t)}
              </div>
            )}
          </div>
          
          {t.closingDeadline && (
            <div className="flex items-center gap-2 mt-2 text-sm">
              <span className="text-gray-400 font-medium">Entry Closes: {t.closingDeadline}</span>
              {getDeadlineInfo()}
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

          <button
            onClick={handleToggleDraws}
            disabled={isProcessing}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 border cursor-pointer ${
              isProcessing ? 'animate-pulse opacity-75' : ''
            } ${
              isSaved 
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)] animate-none' 
                : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700/50'
            }`}
            title={isSaved ? "Remove from Draw Checker" : "Save to Draw Checker"}
          >
            {isProcessing ? (
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            ) : (
              <Layers className="w-4 h-4" />
            )}
          </button>

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
  );
};
