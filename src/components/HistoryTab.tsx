import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  RefreshCw, 
  Bell, 
  Calendar, 
  Trophy, 
  ChevronRight, 
  Activity, 
  TrendingUp, 
  Award, 
  Shield, 
  SlidersHorizontal,
  MapPin,
  Eye,
  ChevronDown,
  User,
  Globe,
  Filter
} from 'lucide-react';
import { formatDistanceToNow, parseISO, format } from 'date-fns';

export function HistoryTab() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedPlayers, setSavedPlayers] = useState<any[]>([]);

  // Collapsible dashboard state (minimized by default)
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'filter' | 'overview'>('filter');

  // Filter states
  const [selectedPlayer, setSelectedPlayer] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('all'); // 'all', 'HK', 'AUS'

  // Local Display filters (used in display view of historical feed)
  const [displayFilters, setDisplayFilters] = useState<Record<string, boolean>>({
    UTR: true,
    Points: true,
    Rank: true,
    WinLoss: true,
    Championships: true,
    Tournament: true,
    NSW_Tournament: true,
    Draw_Watcher: true,
  });

  // Master monitoring filters (controls what notifications should be monitored/notified by the app)
  const [monitoringFilters, setMonitoringFilters] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('jc_monitoring_filters');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {
      UTR: true,
      Points: true,
      Rank: true,
      WinLoss: true,
      Championships: true,
      Tournament: true,
      NSW_Tournament: true,
      Draw_Watcher: true,
    };
  });

  // Save monitoring filters whenever they change
  useEffect(() => {
    localStorage.setItem('jc_monitoring_filters', JSON.stringify(monitoringFilters));
  }, [monitoringFilters]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications/history');
      if (res.ok) {
        const data = await res.json();
        // Filter out "Other" notifications completely
        const filteredData = (data || []).filter((notif: any) => {
          const cat = getNotificationCategory(notif);
          return cat !== 'Other';
        });
        setNotifications(filteredData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSavedPlayers = async () => {
    try {
      const res = await fetch('/api/saved-players');
      if (res.ok) {
        const data = await res.json();
        setSavedPlayers(data || []);
      }
    } catch (err) {
      console.error("Error fetching saved players:", err);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchSavedPlayers();
  }, []);

  const getNotificationCategory = (notif: any): string => {
    const type = notif.type;
    const title = notif.title || '';
    const body = notif.body || '';
    
    if (type === 'Draw_Watcher' || type === 'Draw' || title.includes('New Player in Draw') || title.includes('Player in Draw') || title.includes('Draw Watcher') || (body.includes('joined') && title.includes('Draw'))) {
      return 'Draw_Watcher';
    }
    if (type === 'NSW_Tournament' || type === 'NSW' || title.includes('NSW_Tournament') || title.includes('NSW Tournament') || title.includes('New NSW Tournament')) {
      return 'NSW_Tournament';
    }
    if (type === 'UTR' || title.includes('UTR') || title.includes('WTN')) {
      return 'UTR';
    }
    if (type === 'Points' || title.includes('Points')) {
      return 'Points';
    }
    if (type === 'Rank' || title.includes('Rank') || title.includes('Rating')) {
      return 'Rank';
    }
    if (type === 'WinLoss' || type === 'Win:Loss' || title.includes('Win:Loss') || title.includes('Win-Loss') || title.includes('YTD') || title.includes('Career')) {
      return 'WinLoss';
    }
    if (type === 'Championships' || title.includes('Championships')) {
      return 'Championships';
    }
    if (type === 'Tournament' || title.includes('Joined') || title.includes('Tournament')) {
      return 'Tournament';
    }
    return 'Other';
  };

  const getCategoryIcon = (key: string, className = "w-4 h-4") => {
    switch (key) {
      case 'UTR':
        return <Activity className={`${className} text-cyan-400`} />;
      case 'Points':
        return <TrendingUp className={`${className} text-emerald-400`} />;
      case 'Rank':
        return <Award className={`${className} text-purple-400`} />;
      case 'WinLoss':
        return <Shield className={`${className} text-yellow-500`} />;
      case 'Championships':
        return <Trophy className={`${className} text-yellow-400`} />;
      case 'Tournament':
        return <Calendar className={`${className} text-teal-400`} />;
      case 'NSW_Tournament':
        return <MapPin className={`${className} text-orange-400`} />;
      case 'Draw_Watcher':
        return <Eye className={`${className} text-indigo-400`} />;
      default:
        return <Bell className={`${className} text-pink-400`} />;
    }
  };

  const categoriesList = [
    { key: 'UTR', label: 'UTR & WTN', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { key: 'Points', label: 'Points Track', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { key: 'Rank', label: 'Rankings', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { key: 'WinLoss', label: 'Win/Loss', color: 'text-yellow-550 border border-yellow-500/10', bg: 'bg-yellow-500/10' },
    { key: 'Championships', label: 'Championships', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    { key: 'Tournament', label: 'Player Tournament Watch', color: 'text-teal-400', bg: 'bg-teal-500/10' },
    { key: 'NSW_Tournament', label: 'NSW Tournament', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { key: 'Draw_Watcher', label: 'Draw Watcher', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  ];

  // Calculate matching counts over the entire unfiltered notification set
  const categoryCounts = notifications.reduce((acc: Record<string, number>, notif) => {
    const cat = getNotificationCategory(notif);
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {
    UTR: 0,
    Points: 0,
    Rank: 0,
    WinLoss: 0,
    Championships: 0,
    Tournament: 0,
    NSW_Tournament: 0,
    Draw_Watcher: 0,
  });

  const toggleAllDisplayFilters = (enable: boolean) => {
    setDisplayFilters({
      UTR: enable,
      Points: enable,
      Rank: enable,
      WinLoss: enable,
      Championships: enable,
      Tournament: enable,
      NSW_Tournament: enable,
      Draw_Watcher: enable,
    });
  };

  const toggleAllMonitoringFilters = (enable: boolean) => {
    setMonitoringFilters({
      UTR: enable,
      Points: enable,
      Rank: enable,
      WinLoss: enable,
      Championships: enable,
      Tournament: enable,
      NSW_Tournament: enable,
      Draw_Watcher: enable,
    });
  };

  // Robust helper to extract/map human player names from arbitrary notification entries
  const getNotificationPlayerName = (notif: any): string => {
    if (!notif) return 'Unknown';
    
    const invalidNames = ['System', 'Unknown', 'UTR', 'Win:Loss', 'Win/Loss', 'Championships', 'Points', 'New', 'Rank', 'Draw_Watcher', 'Other'];
    if (notif.player && !invalidNames.includes(notif.player)) {
      return notif.player;
    }

    // Sort savedPlayers by length desc to match full names first (e.g. "Artemy Tenyaev" before "Artemy")
    const sortedPlayers = [...savedPlayers].sort((a, b) => b.name.length - a.name.length);
    for (const player of sortedPlayers) {
      if (notif.body && notif.body.toLowerCase().includes(player.name.toLowerCase())) {
        return player.name;
      }
      if (notif.title && notif.title.toLowerCase().includes(player.name.toLowerCase())) {
        return player.name;
      }
    }

    // Pattern matching suffixes from standard server logs
    if (notif.body) {
      const suffixes = [
        ' UTR changed ',
        ' WTN changed ',
        ' Win:loss YTD changed ',
        ' win:loss YTD changed ',
        ' championships changed ',
        ' joined ',
        ' points changed ',
        ' rank changed ',
        ' WTN singles changed '
      ];
      for (const suffix of suffixes) {
        if (notif.body.includes(suffix)) {
          return notif.body.split(suffix)[0].trim();
        }
      }
    }

    return notif.player || 'Unknown';
  };

  // Dynamically compile regional available players from both saved-players and notifications sensitive to selectedRegion
  const availablePlayers = Array.from(
    new Set([
      // Players from saved-players (filtered by active selectedRegion)
      ...savedPlayers
        .filter(p => {
          if (selectedRegion === 'all') return true;
          if (selectedRegion === 'HK') return p.source === 'HKTA';
          if (selectedRegion === 'AUS') return p.source === 'TA';
          return true;
        })
        .map(p => p.name),
        
      // Players from historical notifications (filtered by active selectedRegion)
      ...notifications
        .filter(n => {
          const playerName = getNotificationPlayerName(n);
          if (playerName === 'System' || playerName === 'Unknown' || !playerName || invalidNamesCheck(playerName)) return false;
          if (selectedRegion === 'all') return true;
          
          const isHK = n.source === 'HK' || n.url?.includes('hk') || n.url?.includes('hkta');
          const isAUS = n.source === 'AUS' || n.source === 'TA' || n.url?.includes('australia') || n.url?.includes('tennis.com.au');
          if (selectedRegion === 'HK' && !isHK) return false;
          if (selectedRegion === 'AUS' && !isAUS) return false;
          return true;
        })
        .map(n => getNotificationPlayerName(n))
    ])
  ).filter(Boolean).sort() as string[];

  function invalidNamesCheck(name: string): boolean {
    const invalidNames = ['System', 'Unknown', 'UTR', 'Win:Loss', 'Win/Loss', 'Championships', 'Points', 'New', 'Rank', 'Draw_Watcher', 'Other'];
    return invalidNames.includes(name);
  }

  // Reset selected player if it's not in the newly filtered list when region or player list changes
  useEffect(() => {
    if (selectedPlayer !== 'all' && !availablePlayers.includes(selectedPlayer)) {
      setSelectedPlayer('all');
    }
  }, [selectedRegion, savedPlayers, notifications, selectedPlayer]);

  const filteredNotifications = notifications.filter(notif => {
    // 1. Event Category Filter
    const category = getNotificationCategory(notif);
    if (!displayFilters[category]) return false;

    // 2. Player Filter
    if (selectedPlayer !== 'all') {
      const playerName = getNotificationPlayerName(notif);
      if (playerName !== selectedPlayer) return false;
    }

    // 3. Region Filter
    if (selectedRegion !== 'all') {
      const isHK = notif.source === 'HK' || notif.url?.includes('hk') || notif.url?.includes('hkta');
      const isAUS = notif.source === 'AUS' || notif.source === 'TA' || notif.url?.includes('australia') || notif.url?.includes('tennis.com.au');
      if (selectedRegion === 'HK' && !isHK) return false;
      if (selectedRegion === 'AUS' && !isAUS) return false;
    }

    return true;
  });

  // Group notifications into Recent (last 7 days) and Older (grouped by month)
  const [expandedSubgroups, setExpandedSubgroups] = useState<Record<string, boolean>>({});

  const now = new Date();

  const getDaysDiff = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const diffTime = t.getTime() - itemDate.getTime();
      return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return 999; // Fallback to older
    }
  };

  const recentGroups: Record<string, any[]> = {};
  const olderGroups: Record<string, any[]> = {};

  filteredNotifications.forEach((notif) => {
    const dStr = notif.date || notif.timestamp?.split('T')[0] || 'Unknown';
    if (dStr === 'Unknown') {
      if (!olderGroups['Unknown']) olderGroups['Unknown'] = [];
      olderGroups['Unknown'].push(notif);
      return;
    }

    const diff = getDaysDiff(dStr);
    if (diff >= 0 && diff < 7) {
      if (!recentGroups[dStr]) recentGroups[dStr] = [];
      recentGroups[dStr].push(notif);
    } else {
      try {
        const d = parseISO(dStr);
        const groupKey = format(d, 'yyyy-MM'); // e.g. '2026-05' for sorting
        if (!olderGroups[groupKey]) olderGroups[groupKey] = [];
        olderGroups[groupKey].push(notif);
      } catch {
        if (!olderGroups['Unknown']) olderGroups['Unknown'] = [];
        olderGroups['Unknown'].push(notif);
      }
    }
  });

  // Sort recent dates descending
  const sortedRecentDates = Object.keys(recentGroups).sort((a, b) => b.localeCompare(a));

  // Sort older month keys descending (e.g., '2026-05' > '2026-04')
  const sortedOlderMonthKeys = Object.keys(olderGroups).sort((a, b) => {
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    return b.localeCompare(a);
  });

  // Sort notifications inside each older group by timestamp/date descending
  Object.keys(olderGroups).forEach(key => {
    olderGroups[key].sort((a, b) => {
      const timeA = new Date(a.timestamp || a.date).getTime();
      const timeB = new Date(b.timestamp || b.date).getTime();
      return timeB - timeA;
    });
  });

  const toggleSubgroup = (key: string) => {
    setExpandedSubgroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-400" />
            Notification Alerts
          </h2>
          <p className="text-gray-400 mt-1 text-sm bg-blue-900/10 px-2 py-0.5 rounded border border-blue-500/20 inline-block font-mono">
            Generated from daily player stat changes
          </p>
        </div>
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors border border-gray-700 text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Collapsible Toggle Dashboard */}
      {notifications.length > 0 && (
        <div className="bg-gray-900/40 border border-gray-800/80 rounded-2xl mb-8 overflow-hidden select-none">
          {/* Dashboard Header - Clickable to expand/minimize */}
          <button
            type="button"
            onClick={() => setDashboardOpen(!dashboardOpen)}
            className="w-full flex items-center justify-between p-5 bg-gray-950/20 hover:bg-gray-950/40 transition-all select-none text-left cursor-pointer"
          >
            <div className="flex items-center gap-2.5 text-gray-300">
              <SlidersHorizontal className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold uppercase tracking-wider text-gray-200">
                Toggle Dashboard
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-gray-400 bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700/40 font-mono font-medium uppercase">
                {dashboardOpen ? 'Minimise' : 'Expand'}
              </span>
              <motion.div
                animate={{ rotate: dashboardOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-gray-450"
              >
                <ChevronDown className="w-4 h-4" />
              </motion.div>
            </div>
          </button>

          {/* Collapsible Content */}
          {dashboardOpen && (
            <div className="p-5 border-t border-gray-810 bg-gray-950/10">
              {/* Tabs list inside Dashboard */}
              <div className="flex border-b border-gray-800 mb-5">
                <button
                  type="button"
                  onClick={() => setActiveTab('filter')}
                  className={`pb-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 cursor-pointer -mb-px ${
                    activeTab === 'filter'
                      ? 'border-blue-500 text-blue-400 font-bold'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filter Tab
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className={`pb-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 cursor-pointer -mb-px ${
                    activeTab === 'overview'
                      ? 'border-blue-500 text-blue-400 font-bold'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Event Type States
                </button>
              </div>

              {/* FILTER TAB */}
              {activeTab === 'filter' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Player Name Select */}
                    <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800/60">
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        Player Name
                      </label>
                      <div className="relative">
                        <select
                          value={selectedPlayer}
                          onChange={(e) => setSelectedPlayer(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 px-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                        >
                          <option value="all">All Players (Region-Sensitive)</option>
                          {availablePlayers.map((player) => (
                            <option key={player} value={player}>
                              {player}
                            </option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    {/* Region Select */}
                    <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800/60">
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-emerald-400" />
                        Region / Source
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { key: 'all', label: 'All Regions' },
                          { key: 'HK', label: 'Hong Kong' },
                          { key: 'AUS', label: 'Australia' }
                        ].map((reg) => {
                          const isSel = selectedRegion === reg.key;
                          return (
                            <button
                              key={reg.key}
                              type="button"
                              onClick={() => setSelectedRegion(reg.key)}
                              className={`py-2 px-1 text-xs font-semibold rounded-lg border transition-all truncate cursor-pointer ${
                                isSel
                                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/55 shadow shadow-blue-500/10'
                                  : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-gray-200 hover:bg-gray-850'
                              }`}
                            >
                              {reg.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Enable/Disable Category Toggles for comprehensive filters integration */}
                  <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-800/45">
                    <div className="flex items-center justify-between mb-3 border-b border-gray-800/40 pb-2">
                      <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                        Display Filters Checklist (Scroll List Filter)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAllDisplayFilters(true)}
                          className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase"
                        >
                          Enable All
                        </button>
                        <span className="text-gray-700 font-mono text-[10px]">|</span>
                        <button
                          type="button"
                          onClick={() => toggleAllDisplayFilters(false)}
                          className="text-[10px] font-bold text-gray-400 hover:text-gray-300 transition-colors uppercase"
                        >
                          Disable All
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {categoriesList.map((cat) => {
                        const active = !!displayFilters[cat.key];
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => setDisplayFilters(prev => ({ ...prev, [cat.key]: !prev[cat.key] }))}
                            className={`flex items-center gap-2.5 p-2 rounded-lg border text-left truncate transition-colors cursor-pointer ${
                              active
                                ? 'bg-gray-950/80 border-gray-700/80 text-gray-200'
                                : 'bg-gray-950/10 border-gray-850 text-gray-500 hover:text-gray-400'
                            }`}
                          >
                            <span className="shrink-0">{getCategoryIcon(cat.key, "w-3.5 h-3.5")}</span>
                            <span className="text-xs font-semibold truncate leading-none">{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* OVERVIEW EVENT SWITCHES TAB */}
              {activeTab === 'overview' && (
                <div>
                  <div className="flex flex-col gap-1 mb-4 pb-2 border-b border-gray-800/40">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                      Active Notification Monitoring Switches
                    </span>
                    <p className="text-xs text-gray-400 leading-relaxed font-sans">
                      Enable or disable which player categories and tourney events are actively monitored, analyzed, and alerted by the app. This configures the telemetry tracking background and is entirely independent of historical lists view-filters.
                    </p>
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-800/20">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Enable Event Categories
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAllMonitoringFilters(true)}
                          className="text-[10px] font-bold text-blue-400 hover:text-blue-350"
                        >
                          MONITOR ALL
                        </button>
                        <span className="text-gray-700 font-mono">|</span>
                        <button
                          type="button"
                          onClick={() => toggleAllMonitoringFilters(false)}
                          className="text-[10px] font-bold text-gray-400 hover:text-gray-355"
                        >
                          DISABLE ALL
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {categoriesList.map((cat) => {
                      const active = !!monitoringFilters[cat.key];
                      const count = categoryCounts[cat.key] || 0;
                      return (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => setMonitoringFilters(prev => ({ ...prev, [cat.key]: !prev[cat.key] }))}
                          className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all text-left cursor-pointer focus:outline-none select-none ${
                            active 
                              ? 'bg-gray-900 border-gray-700/80 hover:border-gray-650 shadow-md shadow-black/10' 
                              : 'bg-gray-950/20 border-gray-850 hover:bg-gray-950/40'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-4">
                            <div className={`p-1.5 rounded-lg shrink-0 ${cat.bg}`}>
                              {getCategoryIcon(cat.key, "w-4 h-4")}
                            </div>
                            <div className="min-w-0 leading-tight">
                              <p className="text-xs font-semibold text-gray-200 truncate">{cat.label}</p>
                              <p className="text-[10px] text-gray-500 font-mono mt-0.5">{count} events</p>
                            </div>
                          </div>

                          {/* Switch Slider */}
                          <div className={`w-8 h-4.5 rounded-full p-0.5 flex items-center transition-colors shrink-0 ${active ? 'bg-blue-600' : 'bg-gray-800'}`}>
                            <motion.div 
                              className="bg-white w-3.5 h-3.5 rounded-full"
                              layout
                              transition={{ type: "spring", stiffness: 700, damping: 30 }}
                              animate={{ x: active ? 14 : 0 }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loading && notifications.length === 0 ? (
        <div className="text-center py-20 text-gray-500 flex flex-col items-center">
          <RefreshCw className="w-8 h-8 animate-spin mb-4 text-gray-600" />
          <p>Loading history...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-20 text-gray-500 border border-gray-800 rounded-xl bg-gray-900/50">
          <Bell className="w-10 h-10 mx-auto mb-4 text-gray-700" />
          <p>No notifications recorded yet.</p>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="text-center py-20 text-gray-500 border border-gray-800/60 rounded-2xl bg-gray-900/10">
          <SlidersHorizontal className="w-8 h-8 mx-auto mb-4 text-gray-600" />
          <p className="text-base font-semibold text-gray-300">No matching notifications found</p>
          <p className="text-sm text-gray-500 mt-1">Try adjusting your filter settings, player selection, or region options in the dashboard.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Recent Grouped Notifications (Last 7 Days) */}
          {sortedRecentDates.length > 0 && (
            <div className="space-y-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-blue-400 text-shadow">Recent (Last 7 Days)</h3>
              {sortedRecentDates.map((date) => (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-4">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <h4 className="font-semibold text-gray-305 text-gray-300 text-sm">
                      {format(parseISO(date), 'MMMM d, yyyy')}
                    </h4>
                    <div className="h-px bg-gray-800 flex-1 ml-2"></div>
                  </div>
                  <div className="space-y-3">
                    {recentGroups[date].map((notif: any, i: number) => {
                      const title = notif.title || '';
                      const typeIcon = getCategoryIcon(getNotificationCategory(notif), "w-4 h-4");

                      return (
                        <motion.div
                          key={notif.id || i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-gray-900/80 border border-gray-800 p-4 rounded-xl flex sm:items-center flex-col sm:flex-row gap-4 hover:border-gray-700 transition-colors"
                        >
                          <div className="bg-gray-800 p-2.5 rounded-lg shrink-0 w-fit">
                            {typeIcon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-200 text-sm">{title}</h4>
                            <p className="text-gray-400 text-sm mt-0.5 whitespace-pre-line leading-relaxed">{notif.body}</p>
                          </div>
                          <div className="shrink-0 flex items-center justify-between sm:flex-col sm:items-end gap-1">
                            <span className="text-xs text-gray-500 font-mono">
                              {notif.timestamp ? formatDistanceToNow(parseISO(notif.timestamp), { addSuffix: true }) : ''}
                            </span>
                            <a 
                              href={notif.url || '/#player-screen'} 
                              className="text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 hover:bg-blue-500/20 p-1.5 rounded-md"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </a>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Older Subgroups (Collapse by default, sorted Monthly/Yearly) */}
          {sortedOlderMonthKeys.length > 0 && (
            <div className="space-y-6 pt-4 border-t border-gray-800/85">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">Older Notifications</h3>
              <div className="space-y-4">
                {sortedOlderMonthKeys.map((monthKey) => {
                  const isExpanded = !!expandedSubgroups[monthKey];
                  const displayTitle = monthKey === 'Unknown' ? 'Unknown Period' : format(parseISO(`${monthKey}-01`), 'MMMM yyyy');
                  
                  return (
                    <div key={monthKey} className="bg-gray-900/40 border border-gray-850 rounded-xl overflow-hidden">
                      {/* Subgroup Header */}
                      <button
                        onClick={() => toggleSubgroup(monthKey)}
                        className="w-full flex items-center justify-between p-4 bg-gray-950/40 hover:bg-gray-800/10 transition-all select-none text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <div>
                            <h4 className="font-semibold text-gray-200 text-sm">{displayTitle}</h4>
                            <p className="text-xs text-gray-500 mt-0.5 font-mono">
                              {olderGroups[monthKey].length} notification{olderGroups[monthKey].length > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] uppercase font-semibold text-gray-400 bg-gray-800/60 h-5 px-2 flex items-center justify-center rounded border border-gray-700/40 font-mono">
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </span>
                          <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </motion.div>
                        </div>
                      </button>

                      {/* Subgroup Content */}
                      {isExpanded && (
                        <div className="p-4 bg-gray-900/20 border-t border-gray-800/40 space-y-3">
                          {olderGroups[monthKey].map((notif: any, i: number) => {
                            const notifTitle = notif.title || '';
                            const typeIcon = getCategoryIcon(getNotificationCategory(notif), "w-4 h-4");

                            return (
                              <motion.div
                                key={notif.id || i}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-gray-950/40 border border-gray-800/40 p-4 rounded-xl flex sm:items-center flex-col sm:flex-row gap-4 hover:border-gray-750 transition-colors"
                              >
                                <div className="bg-gray-900 p-2 text-gray-400 rounded-lg shrink-0 w-fit">
                                  {typeIcon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium text-gray-300 text-sm">{notifTitle}</h4>
                                  <p className="text-gray-400 text-xs mt-0.5 whitespace-pre-line leading-relaxed">{notif.body}</p>
                                </div>
                                <div className="shrink-0 flex items-center justify-between sm:flex-col sm:items-end gap-1">
                                  <span className="text-[10px] text-gray-500 font-mono">
                                    {notif.timestamp ? format(parseISO(notif.timestamp), 'MMM d, yyyy') : ''}
                                  </span>
                                  <a 
                                    href={notif.url || '/#player-screen'} 
                                    className="text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 hover:bg-blue-500/20 p-1.5 rounded-md"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </a>
                                </div>
                              </motion.div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

