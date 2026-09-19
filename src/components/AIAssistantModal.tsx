import { useState } from 'react';
import { 
  Sparkles, 
  BrainCircuit, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  X, 
  Shield, 
  Target, 
  Trophy,
  Flame,
  Lightbulb,
  ArrowRight,
  RefreshCw,
  Zap
} from 'lucide-react';
import { PlayerScoutReport, DrawAnalysisReport, ScheduleOptimizationReport, Tournament } from '../types';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'optimizer' | 'chat' | 'scout' | 'draw';
  tournaments?: Tournament[];
  selectedPlayer?: any;
  selectedDraw?: any;
}

export function AIAssistantModal({
  isOpen,
  onClose,
  initialTab = 'optimizer',
  tournaments = [],
  selectedPlayer,
  selectedDraw
}: AIAssistantModalProps) {
  const [activeTab, setActiveTab] = useState<'optimizer' | 'chat' | 'scout' | 'draw'>(initialTab);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; time: string }>>([
    {
      role: 'assistant',
      text: 'Hello! I am your AI Tennis Assistant powered by Gemini 3.1 Flash Lite. Ask me about upcoming tournaments, schedule planning, opponent scouting, or draw strategies!',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Optimizer state
  const [optimizerReport, setOptimizerReport] = useState<ScheduleOptimizationReport | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isOptimizerCached, setIsOptimizerCached] = useState(false);

  // Scout state
  const [scoutReport, setScoutReport] = useState<PlayerScoutReport | null>(null);
  const [isScouting, setIsScouting] = useState(false);
  const [isScoutCached, setIsScoutCached] = useState(false);
  const [scoutPlayerName, setScoutPlayerName] = useState(selectedPlayer?.name || 'Jordan Chiu');
  const [scoutOpponent, setScoutOpponent] = useState('');

  // Draw analysis state
  const [drawReport, setDrawReport] = useState<DrawAnalysisReport | null>(null);
  const [isAnalyzingDraw, setIsAnalyzingDraw] = useState(false);
  const [isDrawCached, setIsDrawCached] = useState(false);
  const [drawNameInput, setDrawNameInput] = useState(selectedDraw?.name || '');

  if (!isOpen) return null;

  // Run Schedule Optimizer with compacted payload to minimize token cost
  const handleOptimizeSchedule = async (forceRefresh = false) => {
    setIsOptimizing(true);
    try {
      // Send only the top 15 upcoming tournaments with essential scalar fields
      const compactTournaments = tournaments.slice(0, 15).map(t => ({
        name: t.name,
        dates: t.dates,
        location: t.location,
        source: t.source,
        closingDeadline: t.closingDeadline,
        ageGroup: t.ageGroup
      }));

      const res = await fetch('/api/ai/optimize-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournaments: compactTournaments,
          preferences: {
            preferredRegion: 'ALL',
            maxTournamentsPerMonth: 3,
            avoidClashes: true
          },
          forceRefresh
        })
      });
      const data = await res.json();
      if (data.report) {
        setOptimizerReport(data.report);
        setIsOptimizerCached(!!data.cached);
      }
    } catch (err) {
      console.error('Failed to optimize schedule:', err);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Run Player Scout with trimmed details
  const handleScoutPlayer = async (playerName: string = scoutPlayerName, opponent: string = scoutOpponent, forceRefresh = false) => {
    setIsScouting(true);
    try {
      const compactPlayerDetails = selectedPlayer ? {
        name: selectedPlayer.name,
        singlesRating: selectedPlayer.singlesRating || selectedPlayer.rating || selectedPlayer.utr,
        ageGroup: selectedPlayer.ageGroup,
        source: selectedPlayer.source
      } : {};

      const res = await fetch('/api/ai/scout-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: playerName || 'Player',
          playerDetails: compactPlayerDetails,
          opponentName: opponent || undefined,
          forceRefresh
        })
      });
      const data = await res.json();
      if (data.report) {
        setScoutReport(data.report);
        setIsScoutCached(!!data.cached);
      }
    } catch (err) {
      console.error('Failed to scout player:', err);
    } finally {
      setIsScouting(false);
    }
  };

  // Run Draw Analysis with compact bracket array
  const handleAnalyzeDraw = async (forceRefresh = false) => {
    setIsAnalyzingDraw(true);
    try {
      const compactMatches = (selectedDraw?.players || []).slice(0, 16).map((p: any) => ({
        name: p.name || p.playerName || '',
        seed: p.seed,
        rating: p.rating || p.utr
      }));

      const res = await fetch('/api/ai/analyze-draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drawName: drawNameInput || selectedDraw?.name || 'Tournament Draw',
          matches: compactMatches,
          playerName: 'Jordan Chiu',
          forceRefresh
        })
      });
      const data = await res.json();
      if (data.report) {
        setDrawReport(data.report);
        setIsDrawCached(!!data.cached);
      }
    } catch (err) {
      console.error('Failed to analyze draw:', err);
    } finally {
      setIsAnalyzingDraw(false);
    }
  };

  // Run Chat with concise context
  const handleSendMessage = async () => {
    const text = inputQuery.trim();
    if (!text || isChatLoading) return;

    const userMsg = {
      role: 'user' as const,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: {
            tournamentsCount: tournaments.length,
            sampleTournaments: tournaments.slice(0, 6).map(t => ({ name: t.name, dates: t.dates, location: t.location, source: t.source }))
          }
        })
      });
      const data = await res.json();
      setChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: data.reply || 'Analysis complete.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error('Chat error:', err);
      setChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: 'Sorry, I encountered an issue processing your request. Please try again.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div 
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">Gemini 3.1 Flash Lite Tennis Intelligence</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5 text-emerald-400" />
                  Ultra Low Cost AI
                </span>
              </div>
              <p className="text-xs text-gray-400">Ultra-efficient Gemini 3.1 Flash Lite engine with smart caching to minimize API costs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 bg-gray-950/30 px-6 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('optimizer')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'optimizer'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Schedule Optimizer
          </button>
          <button
            onClick={() => setActiveTab('scout')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'scout'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Target className="w-4 h-4" />
            Player Scouting
          </button>
          <button
            onClick={() => setActiveTab('draw')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'draw'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Trophy className="w-4 h-4" />
            Draw Breakdown
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'chat'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Bot className="w-4 h-4" />
            AI Assistant Chat
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: SCHEDULE OPTIMIZER */}
          {activeTab === 'optimizer' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/30 to-indigo-950/30 border border-blue-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    Automated Schedule & Clash Analysis
                  </h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Evaluates all upcoming tournaments across Hong Kong and Australia to detect overlapping tournament dates, interstate travel conflicts, and upcoming closing deadlines.
                  </p>
                </div>
                <button
                  onClick={() => handleOptimizeSchedule(false)}
                  disabled={isOptimizing}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 disabled:opacity-50 whitespace-nowrap"
                >
                  {isOptimizing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing Schedule...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate AI Plan
                    </>
                  )}
                </button>
              </div>

              {optimizerReport && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-gray-400 font-medium">Optimization Plan</span>
                    <div className="flex items-center gap-2">
                      {isOptimizerCached && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2.5 py-0.5 rounded-full">
                          <Zap className="w-3 h-3 text-emerald-400" />
                          Cached (0 API Cost)
                        </span>
                      )}
                      <button
                        onClick={() => handleOptimizeSchedule(true)}
                        disabled={isOptimizing}
                        className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-colors disabled:opacity-50"
                        title="Re-run fresh AI plan"
                      >
                        <RefreshCw className={`w-3 h-3 ${isOptimizing ? 'animate-spin' : ''}`} />
                        Re-analyze
                      </button>
                    </div>
                  </div>
                  {/* Optimal Plan */}
                  <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 space-y-3">
                    <h5 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      Recommended Tournament Path
                    </h5>
                    <div className="grid gap-2.5">
                      {optimizerReport.optimalPlan.map((plan, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-gray-900/60 border border-gray-800/80 text-xs text-gray-200">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px]">
                            {idx + 1}
                          </span>
                          <span className="leading-relaxed">{plan}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Clashes & Conflicts */}
                  {optimizerReport.clashesDetected && optimizerReport.clashesDetected.length > 0 && (
                    <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-5 space-y-3">
                      <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        Detected Date / Location Clashes ({optimizerReport.clashesDetected.length})
                      </h5>
                      <div className="grid gap-2">
                        {optimizerReport.clashesDetected.map((clash, idx) => (
                          <div key={idx} className="p-3 rounded-lg bg-gray-900/70 border border-amber-900/30 text-xs text-gray-300 space-y-1">
                            <div className="font-semibold text-amber-300">
                              {clash.tournaments.join(' ⚡ vs ⚡ ')}
                            </div>
                            <div className="text-gray-400">{clash.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deadline Alerts */}
                  {optimizerReport.deadlineAlerts && optimizerReport.deadlineAlerts.length > 0 && (
                    <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-5 space-y-3">
                      <h5 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                        <Flame className="w-4 h-4 text-red-400" />
                        Urgent Closing Deadline Alerts
                      </h5>
                      <div className="grid gap-2">
                        {optimizerReport.deadlineAlerts.map((alert, idx) => (
                          <div key={idx} className="p-3 rounded-lg bg-gray-900/70 border border-red-900/30 text-xs text-red-200">
                            {alert}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strategic Coaching Recommendations */}
                  {optimizerReport.recommendations && (
                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 space-y-3">
                      <h5 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-purple-400" />
                        Periodization & Tournament Strategy
                      </h5>
                      <div className="grid gap-2">
                        {optimizerReport.recommendations.map((rec, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 p-3 rounded-lg bg-gray-900/60 border border-gray-800/80 text-xs text-gray-300">
                            <ArrowRight className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                            <span>{rec}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PLAYER SCOUTING */}
          {activeTab === 'scout' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-400 block mb-1.5">Target Player</label>
                    <input
                      type="text"
                      value={scoutPlayerName}
                      onChange={e => setScoutPlayerName(e.target.value)}
                      placeholder="e.g. Jordan Chiu"
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 block mb-1.5">Opponent (Optional)</label>
                    <input
                      type="text"
                      value={scoutOpponent}
                      onChange={e => setScoutOpponent(e.target.value)}
                      placeholder="e.g. Top Seed / Next Match"
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => handleScoutPlayer()}
                    disabled={isScouting || !scoutPlayerName.trim()}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-600/30 disabled:opacity-50"
                  >
                    {isScouting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating Scouting Dossier...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Run AI Scouting Analysis
                      </>
                    )}
                  </button>
                </div>
              </div>

              {scoutReport && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-gray-400 font-medium">Scouting Dossier: {scoutPlayerName}</span>
                    <div className="flex items-center gap-2">
                      {isScoutCached && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2.5 py-0.5 rounded-full">
                          <Zap className="w-3 h-3 text-emerald-400" />
                          Cached (0 API Cost)
                        </span>
                      )}
                      <button
                        onClick={() => handleScoutPlayer(scoutPlayerName, scoutOpponent, true)}
                        disabled={isScouting}
                        className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-colors disabled:opacity-50"
                        title="Re-run fresh AI scouting report"
                      >
                        <RefreshCw className={`w-3 h-3 ${isScouting ? 'animate-spin' : ''}`} />
                        Re-scout
                      </button>
                    </div>
                  </div>
                  {/* Executive Summary */}
                  <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 space-y-2">
                    <h5 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                      <Target className="w-4 h-4 text-blue-400" />
                      Executive Performance Summary
                    </h5>
                    <p className="text-xs text-gray-200 leading-relaxed">{scoutReport.summary}</p>
                  </div>

                  {/* Strengths & Tactics Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Strengths */}
                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 space-y-3">
                      <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        Key Tactical Strengths
                      </h5>
                      <div className="space-y-2">
                        {scoutReport.strengths.map((str, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs text-gray-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                            <span>{str}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Match Tactics */}
                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 space-y-3">
                      <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                        <Flame className="w-4 h-4 text-amber-400" />
                        Actionable Game Plan
                      </h5>
                      <div className="space-y-2">
                        {scoutReport.tactics.map((tac, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs text-gray-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                            <span>{tac}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Recent Form */}
                  <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 space-y-2">
                    <h5 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                      Recent Form & Momentum Breakdown
                    </h5>
                    <p className="text-xs text-gray-300 leading-relaxed">{scoutReport.recentFormAnalysis}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DRAW BREAKDOWN */}
          {activeTab === 'draw' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-gray-950/60 border border-gray-800 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-400 block mb-1.5">Draw / Event Name</label>
                  <input
                    type="text"
                    value={drawNameInput}
                    onChange={e => setDrawNameInput(e.target.value)}
                    placeholder="e.g. 10 & Under Boys Singles - Main Draw"
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => handleAnalyzeDraw(false)}
                    disabled={isAnalyzingDraw}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-600/30 disabled:opacity-50"
                  >
                    {isAnalyzingDraw ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing Bracket Dynamics...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Analyze Draw Bracket
                      </>
                    )}
                  </button>
                </div>
              </div>

              {drawReport && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-gray-400 font-medium">Draw Bracket Analysis</span>
                    <div className="flex items-center gap-2">
                      {isDrawCached && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2.5 py-0.5 rounded-full">
                          <Zap className="w-3 h-3 text-emerald-400" />
                          Cached (0 API Cost)
                        </span>
                      )}
                      <button
                        onClick={() => handleAnalyzeDraw(true)}
                        disabled={isAnalyzingDraw}
                        className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-colors disabled:opacity-50"
                        title="Re-run fresh AI draw analysis"
                      >
                        <RefreshCw className={`w-3 h-3 ${isAnalyzingDraw ? 'animate-spin' : ''}`} />
                        Re-analyze
                      </button>
                    </div>
                  </div>
                  <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 space-y-2">
                    <h5 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-blue-400" />
                      Bracket Overview & Seeding Strength
                    </h5>
                    <p className="text-xs text-gray-200 leading-relaxed">{drawReport.bracketOverview}</p>
                  </div>

                  <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 space-y-3">
                    <h5 className="text-xs font-bold text-green-400 uppercase tracking-wider">
                      Projected Route Through Rounds
                    </h5>
                    <div className="space-y-2">
                      {drawReport.potentialRoadmap.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs text-gray-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 space-y-3">
                      <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                        Dangerous Floaters & Unseeded Threats
                      </h5>
                      <div className="space-y-2">
                        {drawReport.dangerousFloaters.map((floater, idx) => (
                          <div key={idx} className="text-xs text-gray-300">
                            • {floater}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-5 space-y-3">
                      <h5 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                        Tactical & Physical Preparation Advice
                      </h5>
                      <div className="space-y-2">
                        {drawReport.tacticalAdvice.map((adv, idx) => (
                          <div key={idx} className="text-xs text-gray-300">
                            • {adv}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CHAT COPILOT */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-[480px]">
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 ${
                      msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 text-xs ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-blue-400 border border-gray-700'
                      }`}
                    >
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-tr-none'
                          : 'bg-gray-950/80 border border-gray-800 text-gray-200 rounded-tl-none whitespace-pre-wrap'
                      }`}
                    >
                      {msg.text}
                      <div
                        className={`text-[9px] mt-1.5 ${
                          msg.role === 'user' ? 'text-blue-200' : 'text-gray-500'
                        }`}
                      >
                        {msg.time}
                      </div>
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-xl bg-gray-800 text-blue-400 border border-gray-700 flex items-center justify-center text-xs">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-gray-950/80 border border-gray-800 rounded-2xl rounded-tl-none px-4 py-3 text-xs text-gray-400 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                      Gemini is generating response...
                    </div>
                  </div>
                )}
              </div>

              {/* Input Box */}
              <div className="pt-4 border-t border-gray-800 mt-4 flex items-center gap-2">
                <input
                  type="text"
                  value={inputQuery}
                  onChange={e => setInputQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask about tournament deadlines, player form, or schedule tips..."
                  className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputQuery.trim() || isChatLoading}
                  className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-40 shadow-lg shadow-blue-600/30"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
