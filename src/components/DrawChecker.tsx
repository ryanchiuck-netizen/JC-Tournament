import { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Loader2, 
  AlertCircle, 
  ExternalLink, 
  Trophy, 
  ChevronUp, 
  ChevronDown, 
  Trash2, 
  RefreshCw, 
  GripVertical, 
  Clock,
  Calendar,
  ArrowUpDown
} from 'lucide-react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

interface SavedDraw {
  id: string;
  name: string;
  url: string;
  region: 'AUS' | 'HKTA';
  players: PlayerStats[];
  created_at?: string;
  lastUpdated?: string;
  sort_order?: number;
}

interface SortableDrawItemProps {
  draw: SavedDraw;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  isRefreshing: boolean;
  onRefresh: (draw: SavedDraw) => void;
  onDelete: (id: string) => void;
  renderPlayerTable: (players: PlayerStats[], drawId?: string) => React.ReactNode;
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

function SortableDrawItem({
  draw,
  expanded,
  onToggleExpand,
  isRefreshing,
  onRefresh,
  onDelete,
  renderPlayerTable
}: SortableDrawItemProps) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: draw.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 0,
    opacity: isDragging ? 0.5 : 1
  };

  const hasJordan = useMemo(() => {
    return draw.players?.some((p: any) => {
      const pName = p.name ? p.name.toLowerCase() : "";
      return pName.includes("jordan") && pName.includes("chiu");
    });
  }, [draw.players]);

  const drawDateMatch = draw.url.match(/#date=(.*)$/);
  let rawDrawDate = drawDateMatch ? decodeURIComponent(drawDateMatch[1]) : '';
  if (!rawDrawDate) {
    const nameMatch = draw.name.match(/\b\d{1,2}(?:-\d{1,2})?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
    const ddMmYyyyMatch = draw.name.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
    if (nameMatch) {
      rawDrawDate = nameMatch[0];
    } else if (ddMmYyyyMatch) {
      rawDrawDate = ddMmYyyyMatch[0];
    }
  }
  const drawDate = formatDateToDdMmYyyy(rawDrawDate);
  const displayUrl = draw.url.split('#')[0]; // Clean url for linking

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl overflow-hidden transition-all duration-200 border ${
        hasJordan
          ? "bg-yellow-500/5 border-yellow-500/40 shadow-lg shadow-yellow-500/5"
          : "bg-gray-900/40 border-gray-800"
      }`}
    >
      <div 
        className={`p-4 flex items-center justify-between cursor-pointer transition-colors group ${
          hasJordan ? "hover:bg-yellow-500/10" : "hover:bg-gray-800/40"
        }`}
        onClick={() => onToggleExpand(draw.id)}
      >
        <div className="flex items-center gap-4">
          <div 
            {...attributes}
            {...listeners}
            className="text-gray-500 hover:text-gray-300 p-2 cursor-grab active:cursor-grabbing rounded shrink-0"
            onClick={(e) => {
              e.stopPropagation(); // Avoid triggering expand/collapse when dragging
            }}
          >
            <GripVertical className="w-4 h-4" />
          </div>
          
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-gray-400 shrink-0 ${
            hasJordan ? "bg-yellow-500/10 text-yellow-400" : "bg-gray-800"
          }`}>
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className={`text-base font-semibold ${hasJordan ? "text-yellow-400 font-bold" : "text-white"}`}>
                {draw.name}
              </h4>
              {drawDate && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-gray-800 text-blue-300 border border-gray-700 px-2 py-0.5 rounded-lg whitespace-nowrap">
                  <Calendar className="w-3 h-3 text-blue-400" />
                  {drawDate}
                </span>
              )}
              {hasJordan && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold bg-yellow-500/25 text-yellow-400 border border-yellow-500/40 px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping shrink-0" />
                  JORDAN JOINED
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-3 mt-1.5">
              <a 
                href={displayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                View Original Draw <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-[10px] text-gray-500 flex items-center gap-1 font-medium">
                <Clock className="w-3 h-3" />
                Updated: {new Date(draw.lastUpdated || draw.created_at || Date.now()).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onRefresh(draw)}
            disabled={isRefreshing || showConfirmDelete}
            className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh draw data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
          {showConfirmDelete ? (
            <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-lg border border-red-500/30">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(draw.id);
                  setShowConfirmDelete(false);
                }}
                className="px-2 py-1 text-[10px] font-bold bg-red-600 hover:bg-red-500 text-white rounded transition-colors uppercase cursor-pointer"
                title="Confirm delete"
              >
                Delete?
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirmDelete(false);
                }}
                className="px-2 py-1 text-[10px] font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-all cursor-pointer"
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
              className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors cursor-pointer"
              title="Delete saved draw"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="p-4 border-t border-gray-800 bg-gray-950/40">
          {renderPlayerTable(draw.players, draw.id)}
        </div>
      )}
    </div>
  );
}

interface SortablePlayerRowProps {
  player: PlayerStats & { rank?: number };
  isDraggable: boolean;
}

function SortablePlayerRow({ player, isDraggable }: SortablePlayerRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: player.id });

  const style = isDraggable ? {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 0,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: isDragging ? "rgba(17, 24, 39, 0.8)" : undefined
  } : undefined;

  const rowContent = (
    <>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-3">
          {isDraggable && (
            <div 
              {...attributes}
              {...listeners}
              className="text-gray-500 hover:text-gray-300 p-1.5 cursor-grab active:cursor-grabbing hover:bg-gray-800 rounded shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
          )}
          
          <div className="flex-shrink-0 w-6 text-center">
            {player.rank === 1 ? (
              <div className="w-6 h-6 mx-auto bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)] font-mono text-[11px] font-bold" title="Rank 1">
                <span>1</span>
              </div>
            ) : player.rank === 2 ? (
              <div className="w-6 h-6 mx-auto bg-gray-300/20 text-gray-300 rounded-full flex items-center justify-center border border-gray-300/30 font-mono text-[11px] font-bold" title="Rank 2">
                <span>2</span>
              </div>
            ) : player.rank === 3 ? (
              <div className="w-6 h-6 mx-auto bg-amber-700/20 text-amber-600 rounded-full flex items-center justify-center border border-amber-700/30 font-mono text-[11px] font-bold" title="Rank 3">
                <span>3</span>
              </div>
            ) : (
              <span className="text-xs font-semibold text-gray-500 font-mono">{player.rank}</span>
            )}
          </div>

          <div className="h-8 w-8 rounded-full bg-gray-900 flex items-center justify-center border border-gray-800 text-xs font-semibold text-gray-400 uppercase shrink-0">
            {player.name.charAt(0)}
          </div>

          {player.profileUrl ? (
            <a 
              href={player.profileUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-400 hover:text-blue-300 hover:underline transition-colors truncate max-w-[180px]"
            >
              {player.name}
            </a>
          ) : (
            <span className="text-sm font-medium text-gray-200 truncate max-w-[180px]">
              {player.name}
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold font-mono text-gray-400">
        {player.utrSingles || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold font-mono text-gray-400">
        {player.points || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold font-mono text-gray-400">
        {player.winLossYTD || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold font-mono text-gray-400">
        {player.winLossCareer || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold font-mono text-gray-400">
        {player.championships !== undefined ? player.championships : 0}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        {player.profileUrl && (
          <a
            href={player.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1 font-medium"
          >
            View <ExternalLink className="w-3" />
          </a>
        )}
      </td>
    </>
  );

  return (
    <tr 
      ref={isDraggable ? setNodeRef : undefined} 
      style={style} 
      className={`hover:bg-gray-850/40 transition-colors border-b border-gray-800/50 ${isDragging ? "relative z-30" : ""}`}
    >
      {rowContent}
    </tr>
  );
}

export function DrawChecker() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [drawName, setDrawName] = useState('');
  const [tournamentDate, setTournamentDate] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'utrSingles', direction: 'desc' });

  // Saved Draws Section
  const [savedDraws, setSavedDraws] = useState<SavedDraw[]>(() => {
    try {
      const saved = localStorage.getItem("jc_tennis_cached_draw_checker_saved_draws");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [region, setRegion] = useState<'AUS' | 'HKTA'>('AUS');
  const [drawSortOrder, setDrawSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedDraws, setExpandedDraws] = useState<Set<string>>(new Set());
  const [refreshingDraws, setRefreshingDraws] = useState<Set<string>>(new Set());
  const [savedDrawsLastUpdated, setSavedDrawsLastUpdated] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Drag and Drop settings
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchSavedDraws = async () => {
    try {
      const res = await fetch('/api/saved-draws');
      if (res.ok) {
        const data = await res.json();
        const draws = data.draws || [];
        setSavedDraws(draws);
        localStorage.setItem("jc_tennis_cached_draw_checker_saved_draws", JSON.stringify(draws));
        if (data.updatedAt) {
          setSavedDrawsLastUpdated(data.updatedAt);
        }
      }
    } catch (err) {
      console.error("Failed to fetch saved draws:", err);
    }
  };

  useEffect(() => {
    fetchSavedDraws();
  }, []);

  const handleCheckDraw = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setPlayers([]);
    setDrawName('');
    setTournamentDate('');
    setSortConfig({ key: 'utrSingles', direction: 'desc' });

    try {
      const res = await fetch('/api/check-draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (res.ok) {
        try {
          const data = await res.json();
          setPlayers(data.players || []);
          let title = '';
          if (data.tournamentName && data.drawName) {
            const tName = data.tournamentName.trim();
            const dName = data.drawName.trim();
            if (tName.toLowerCase() === dName.toLowerCase()) {
              title = tName;
            } else if (dName.toLowerCase().includes(tName.toLowerCase())) {
              title = dName;
            } else if (tName.toLowerCase().includes(dName.toLowerCase())) {
              title = tName;
            } else if (dName.endsWith(tName)) {
              const cleanedD = dName.substring(0, dName.length - tName.length).trim().replace(/[-–—\s]+$/, '').trim();
              title = cleanedD ? `${tName} - ${cleanedD}` : tName;
            } else {
              title = `${tName} - ${dName}`;
            }
          } else {
            title = data.drawName || data.name || 'Saved Draw';
          }
          setDrawName(title);
          setTournamentDate(data.tournamentDate || '');
        } catch (e) {
          console.error("Failed to parse /api/check-draw JSON", e);
          setError('Failed to parse draw data');
        }
      } else {
        try {
          const errData = await res.json();
          setError(errData.error || 'Failed to check draw');
        } catch (e) {
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

  const handleSaveDraw = async () => {
    if (!url || players.length === 0) return;
    setIsSaving(true);
    
    // Automatically match region based on the URL context
    const resolvedRegion = url.includes("hkta.tournamentsoftware.com") ? "HKTA" : "AUS";
    setRegion(resolvedRegion);

    let finalUrl = url;
    if (tournamentDate && !finalUrl.includes('#date=')) {
      finalUrl += `#date=${encodeURIComponent(tournamentDate)}`;
    }

    try {
      const res = await fetch('/api/saved-draws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: finalUrl,
          region: resolvedRegion,
          name: drawName || "Saved Draw",
          players
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSavedDraws(data.draws || []);
        if (data.updatedAt) {
          setSavedDrawsLastUpdated(data.updatedAt);
        }
        
        // Reset check state
        setUrl('');
        setPlayers([]);
        setDrawName('');

        // Smooth scroll down to saved draws layout
        setTimeout(() => {
          const section = document.getElementById("saved-draws-section");
          if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
      }
    } catch (err) {
      console.error("Failed to save draw:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDraw = async (id: string) => {
    try {
      const res = await fetch(`/api/saved-draws/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        setSavedDraws(data.draws || []);
        if (data.updatedAt) {
          setSavedDrawsLastUpdated(data.updatedAt);
        }
      }
    } catch (err) {
      console.error("Failed to delete draw:", err);
    }
  };

  const handleRefreshDraw = async (draw: SavedDraw) => {
    setRefreshingDraws(prev => {
      const copy = new Set(prev);
      copy.add(draw.id);
      return copy;
    });

    try {
      const res = await fetch('/api/check-draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: draw.url }),
      });

      if (res.ok) {
        const data = await res.json();
        const resolvedRegion = draw.url.includes("hkta.tournamentsoftware.com") ? "HKTA" : "AUS";
        let finalUrl = draw.url;
        if (data.tournamentDate && !finalUrl.includes('#date=')) {
          finalUrl += `#date=${encodeURIComponent(data.tournamentDate)}`;
        }

        const saveRes = await fetch('/api/saved-draws', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: finalUrl,
            region: resolvedRegion,
            name: draw.name,
            players: data.players
          })
        });

        if (saveRes.ok) {
          const saveData = await saveRes.json();
          setSavedDraws(saveData.draws || []);
          if (saveData.updatedAt) {
            setSavedDrawsLastUpdated(saveData.updatedAt);
          }
        }
      }
    } catch (err) {
      console.error("Failed to refresh draw:", err);
    } finally {
      setRefreshingDraws(prev => {
        const copy = new Set(prev);
        copy.delete(draw.id);
        return copy;
      });
    }
  };

  const toggleDrawExpanded = (id: string) => {
    setExpandedDraws(prev => {
      const copy = new Set(prev);
      if (copy.has(id)) {
        copy.delete(id);
      } else {
        copy.add(id);
      }
      return copy;
    });
  };

  // Reordering Saved Draws
  const handleDragEndDraws = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = savedDraws.findIndex(d => d.id === active.id);
      const newIndex = savedDraws.findIndex(d => d.id === over.id);
      const reordered = arrayMove(savedDraws, oldIndex, newIndex);
      setSavedDraws(reordered);

      try {
        await fetch('/api/saved-draws/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draws: reordered })
        });
      } catch (err) {
        console.error("Failed to save reordered draws", err);
      }
    }
  };

  // Reordering Players inside a Saved Draw
  const handleDragEndPlayers = async (event: DragEndEvent, drawId: string) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const draw = savedDraws.find(d => d.id === drawId);
      if (!draw) return;

      const oldIndex = draw.players.findIndex(p => p.id === active.id);
      const newIndex = draw.players.findIndex(p => p.id === over.id);
      const reorderedPlayers = arrayMove(draw.players, oldIndex, newIndex);

      setSavedDraws(prev => prev.map(d => d.id === drawId ? { ...d, players: reorderedPlayers } : d));

      try {
        await fetch(`/api/saved-draws/${drawId}/players`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players: reorderedPlayers })
        });
      } catch (err) {
        console.error("Failed to save reordered players", err);
      }
    }
  };

  const handleSort = (key: keyof PlayerStats) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getPlayersWithRank = (playerList: PlayerStats[]) => {
    // Sort by UTR descending to assign ranks
    const sortedByUtr = [...playerList].sort((a, b) => {
      const aVal = a.utrSingles;
      const bVal = b.utrSingles;
      
      if ((aVal === undefined || aVal === null || aVal === '-') && (bVal === undefined || bVal === null || bVal === '-')) return 0;
      if (aVal === undefined || aVal === null || aVal === '-') return 1;
      if (bVal === undefined || bVal === null || bVal === '-') return -1;
      
      const aNum = parseFloat(aVal.replace(/[^\d.]/g, '')) || 0;
      const bNum = parseFloat(bVal.replace(/[^\d.]/g, '')) || 0;
      return bNum - aNum;
    });

    return playerList.map(p => {
      const rank = sortedByUtr.findIndex(sp => sp.id === p.id) + 1;
      return { ...p, rank };
    });
  };

  const getSortedPlayers = (playerList: PlayerStats[]) => {
    const playersWithRankList = getPlayersWithRank(playerList);
    if (!sortConfig) return playersWithRankList;

    return [...playersWithRankList].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if ((aValue === undefined || aValue === null || aValue === '-') && (bValue === undefined || bValue === null || bValue === '-')) return 0;
      if (aValue === undefined || aValue === null || aValue === '-') return 1;
      if (bValue === undefined || bValue === null || bValue === '-') return -1;

      // Handle numeric values
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
  };

  const activeCheckedPlayersSorted = useMemo(() => {
    return getSortedPlayers(players);
  }, [players, sortConfig]);

  // Google Sheets Auto Sync for looked-up draws
  useEffect(() => {
    if (activeCheckedPlayersSorted.length > 0) {
      saveToGoogleSheets('Draw Checker', activeCheckedPlayersSorted).catch(console.error);
    }
  }, [activeCheckedPlayersSorted]);

  const SortIcon = ({ column }: { column: keyof PlayerStats }) => {
    if (!sortConfig || sortConfig.key !== column) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3" /> : <ChevronDown className="w-3" />;
  };

  const renderPlayerTable = (playerList: PlayerStats[], drawId?: string) => {
    const listToRender = getSortedPlayers(playerList);
    const isDraggable = drawId !== undefined;

    const tableElement = (
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
            
            {isDraggable ? (
              <SortableContext items={listToRender.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <tbody className="divide-y divide-gray-800 bg-gray-900/20">
                  {listToRender.map((player) => (
                    <SortablePlayerRow 
                      key={player.id} 
                      player={player} 
                      isDraggable={true} 
                    />
                  ))}
                </tbody>
              </SortableContext>
            ) : (
              <tbody className="divide-y divide-gray-800 bg-gray-900/20">
                {listToRender.map((player) => (
                  <SortablePlayerRow 
                    key={player.id} 
                    player={player} 
                    isDraggable={false} 
                  />
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>
    );

    if (isDraggable && drawId) {
      return (
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCenter} 
          onDragEnd={(e) => handleDragEndPlayers(e, drawId)}
        >
          {tableElement}
        </DndContext>
      );
    }

    return tableElement;
  };

  const filteredSavedDraws = useMemo(() => {
    return savedDraws
      .filter(d => d.region === region)
      .sort((a, b) => {
        // Attempt to parse dates from the 'url' hash
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
  }, [savedDraws, region, drawSortOrder]);

  return (
    <div className="space-y-6">
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-blue-400" />
          Draw Checker
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          Enter a tournament draw URL from tournaments.tennis.com.au or hkta.tournamentsoftware.com to see stats for all players in that draw.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://tournaments.tennis.com.au/sport/draw.aspx?id=... or HKTA URL"
            className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-sans"
          />
          <button
            onClick={handleCheckDraw}
            disabled={loading || !url}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Check Draw
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-900/50 rounded-2xl p-4 flex items-start gap-3 text-red-400 border border-red-900">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
          <div>
            <p className="font-semibold text-sm text-red-300">Error</p>
            <p className="text-sm opacity-90 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-gray-900/20 rounded-2xl border border-gray-800/40">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 font-semibold text-base">Deep scanning players in the draw (including deep stats)...</p>
          <p className="text-gray-500 text-sm">This may take 30-60 seconds to fetch full credentials and active stats for all players.</p>
        </div>
      )}

      {!loading && players.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-gray-900/30 p-4 rounded-xl border border-gray-850">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Draw Name</span>
              <input
                type="text"
                value={drawName}
                onChange={(e) => setDrawName(e.target.value)}
                className="bg-transparent border-b border-gray-800 text-sm font-medium text-white focus:outline-none focus:border-blue-500 pb-0.5"
                placeholder="Name of this draw"
              />
            </div>
            <button
              onClick={handleSaveDraw}
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
              Save Draw
            </button>
          </div>
          {renderPlayerTable(players)}
        </div>
      )}

      {!loading && players.length === 0 && !error && url && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-gray-900/20 rounded-2xl border border-gray-850/40">
          <Trophy className="w-12 h-12 text-gray-800" />
          <p className="text-gray-500 font-medium">No players found in this draw.</p>
        </div>
      )}

      {/* Persistent Saved Draws Section */}
      <div id="saved-draws-section" className="mt-12 space-y-4 border-t border-gray-900 pt-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-blue-400 animate-pulse" />
            Saved Draws
            {savedDrawsLastUpdated && (
              <span className="text-[10px] text-gray-500 font-normal">
                (Last Synced: {new Date(savedDrawsLastUpdated).toLocaleTimeString()})
              </span>
            )}
          </h3>
          
          <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
            <button
              onClick={() => {
                setDrawSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-350 rounded-lg transition-all cursor-pointer shadow-sm"
              title="Toggle chronological saved draws sorting"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-blue-400" />
              <span>Sort Date: {drawSortOrder === 'asc' ? 'Earliest First' : 'Latest First'}</span>
            </button>

            <div className="flex bg-gray-900/50 p-1 rounded-xl border border-gray-800 shadow-sm">
              <button 
                onClick={() => setRegion("AUS")}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${region === "AUS" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <span>🇦🇺</span> Australia
              </button>
              <button 
                onClick={() => setRegion("HKTA")}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${region === "HKTA" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <span>🇭🇰</span> Hong Kong
              </button>
            </div>
          </div>
        </div>

        {filteredSavedDraws.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndDraws}>
            <SortableContext items={filteredSavedDraws.map(d => d.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {filteredSavedDraws.map((draw) => (
                  <SortableDrawItem 
                    key={draw.id}
                    draw={draw}
                    expanded={expandedDraws.has(draw.id)}
                    onToggleExpand={toggleDrawExpanded}
                    isRefreshing={refreshingDraws.has(draw.id)}
                    onRefresh={handleRefreshDraw}
                    onDelete={handleDeleteDraw}
                    renderPlayerTable={renderPlayerTable}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-gray-900/10 rounded-2xl border border-gray-800/30">
            <div className="w-12 h-12 bg-gray-900/50 rounded-full flex items-center justify-center">
              <Calendar className="w-6 h-6 text-gray-700" />
            </div>
            <p className="text-sm font-semibold text-gray-500">No saved draws for {region === 'AUS' ? 'Australia' : 'Hong Kong'}</p>
            <p className="text-xs text-gray-600 text-center max-w-xs px-4">
              Once you've retrieved a draw above, click the emerald "Save Draw" button to pin it here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
