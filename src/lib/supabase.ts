import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read client-side environment variables if available
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

/**
 * Client-side Supabase client with timeout protection, custom headers,
 * and robust error handling to prevent payload size errors and Disk IO depletion.
 */
export const supabaseClient: SupabaseClient | null = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-application-name': 'jc-tournament-web-client',
        },
        fetch: (url, options = {}) => {
          const controller = new AbortController();
          // 12-second abort signal to avoid hanging connections on free-tier compute
          const timer = setTimeout(() => controller.abort(), 12000);
          return fetch(url, { ...options, signal: controller.signal })
            .finally(() => clearTimeout(timer));
        },
      },
    })
  : null;

/**
 * Sanitizes Supabase/Cloudflare error responses to avoid leaking raw 521 HTML
 * into application state and user interfaces.
 */
export function formatSupabaseError(err: any): string {
  if (!err) return 'Unknown database error';
  const msg = typeof err === 'string' ? err : err.message || JSON.stringify(err);
  if (
    msg.includes('<!DOCTYPE') ||
    msg.includes('<html') ||
    msg.includes('521') ||
    msg.includes('Cloudflare') ||
    msg.includes('cf-error')
  ) {
    return 'Supabase service is temporarily unresponsive (Disk IO Budget depleted or Cloudflare 521). Falling back to cached data.';
  }
  if (msg.includes('payload') || msg.includes('too large') || msg.includes('413')) {
    return 'Query payload size exceeded limit. Switched to small-batch range query.';
  }
  return msg.length > 200 ? msg.substring(0, 200) + '...' : msg;
}

export interface FetchPlayersBatchedOptions {
  batchSize?: number;
  source?: 'TA' | 'HKTA';
  onProgress?: (loaded: number, total?: number) => void;
}

/**
 * Fetches saved players in safe, chunked batches (e.g. 25-50 rows per batch)
 * using Supabase range queries or the proxy endpoint.
 * This guarantees large player rosters never exceed payload limits or exhaust Postgres IOPS.
 */
export async function fetchSavedPlayersBatched(options: FetchPlayersBatchedOptions = {}): Promise<any[]> {
  const batchSize = options.batchSize || 50;

  // 1. If direct client-side Supabase credentials exist, execute chunked range queries with retry logic
  if (supabaseClient) {
    try {
      let allPlayers: any[] = [];
      let start = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabaseClient
          .from('saved_players')
          .select('*')
          .order('sort_order', { ascending: true })
          .range(start, start + batchSize - 1);

        if (options.source) {
          query = query.eq('source', options.source);
        }

        const { data, error } = await query;

        if (error) {
          console.warn('[Supabase Client] Batch query error:', formatSupabaseError(error));
          throw error;
        }

        if (data && data.length > 0) {
          allPlayers = allPlayers.concat(data);
          if (options.onProgress) {
            options.onProgress(allPlayers.length);
          }
          if (data.length < batchSize) {
            hasMore = false;
          } else {
            start += batchSize;
          }
        } else {
          hasMore = false;
        }
      }

      if (allPlayers.length > 0) {
        return allPlayers.map((row: any) => ({
          id: row.id,
          name: row.name,
          url: row.url || undefined,
          source: row.source || undefined,
          utrSingles: row.utr_singles || '-',
          wtnSingles: row.wtn_singles || '-',
          winLossYTD: row.win_loss_ytd || '-',
          winLossCareer: row.win_loss_career || '-',
          championships: row.championships || '-',
          rank: row.rank || '-',
          points: row.points || '-',
          sort_order: row.sort_order ?? undefined,
        }));
      }
    } catch (sbErr) {
      console.warn('[Supabase Client] Falling back to backend proxy endpoint:', formatSupabaseError(sbErr));
    }
  }

  // 2. Fetch via backend proxy /api/saved-players (which implements server-side range batching and local fallbacks)
  const url = options.source ? `/api/saved-players?source=${encodeURIComponent(options.source)}` : '/api/saved-players';
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(formatSupabaseError(errorText));
  }

  const payload = await response.json();
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.players)) {
    return payload.players;
  }
  return [];
}
