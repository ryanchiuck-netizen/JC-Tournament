import React, { useState } from "react";
import { Search, Loader2, ExternalLink, User, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { searchPlayer } from "../services/tournamentService";
import { PlayerWatchResult } from "../types";

export function PlayerWatch() {
  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlayerWatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await searchPlayer(playerName);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to search for player");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 sm:p-8">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <h2 className="text-2xl font-bold text-white tracking-tight">Player Watch</h2>
          <p className="text-gray-400">Enter a player's name to see which tournaments and draws they are appearing in.</p>
          
          <form onSubmit={handleSearch} className="mt-6 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter player name (e.g. Jordan Chiu)"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !playerName.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </button>
          </form>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-900/50 rounded-xl p-4 text-red-400 text-sm flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-gray-400 animate-pulse">Searching through tournament draws...</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" />
              Results for "{result.playerName}"
            </h3>
            <span className="text-sm text-gray-400">{result.matches.length} appearances found</span>
          </div>

          {result.matches.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.matches.map((match, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-gray-900/40 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all group"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-blue-500 uppercase tracking-wider">
                        <Trophy className="w-3 h-3" />
                        {match.drawName}
                      </div>
                      <h4 className="text-white font-medium leading-snug group-hover:text-blue-400 transition-colors">
                        {match.tournamentName}
                      </h4>
                    </div>
                    <a
                      href={match.tournamentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-all"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  
                  {match.drawLink && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <a
                        href={match.drawLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
                      >
                        View Draw <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-gray-900/20 rounded-2xl border border-dashed border-gray-800">
              <p className="text-gray-500">No appearances found for this player.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
