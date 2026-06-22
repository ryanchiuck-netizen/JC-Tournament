import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Loader2, 
  AlertCircle, 
  Filter,
  RefreshCw,
  Clock,
  Bell,
  BellOff
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as XLSX from 'xlsx';

import { Tournament, Region, AgeFilter } from "./types";
import { fetchTournaments, getFullLink, getTournamentState } from "./services/tournamentService";
import { TournamentCard } from "./components/TournamentCard";
import { FilterBar } from "./components/FilterBar";
import { MonthTabs } from "./components/MonthTabs";
import { PlayerWatch } from "./components/PlayerWatch";
import { PlayerScreen } from "./components/PlayerScreen";
import { TournamentScreen } from "./components/TournamentScreen";
import { DrawChecker } from "./components/DrawChecker";
import { HistoryTab } from "./components/HistoryTab";
import { cacheDb } from "./lib/db";

export default function App() {
  const [activeTab, setActiveTab] = useState<"tournaments" | "player-watch" | "player-screen" | "tournament-screen" | "draw-checker" | "alerts">("tournament-screen");
  
  // Tournaments-for-players cache states
  const [tournamentsForPlayers, setTournamentsForPlayers] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("jc_tennis_cached_tournaments_for_players");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [tournamentsForPlayersLastUpdated, setTournamentsForPlayersLastUpdated] = useState<string | null>(null);
  const [isTournamentsForPlayersLoading, setIsTournamentsForPlayersLoading] = useState(false);

  const reloadTournamentsForPlayers = async () => {
    setIsTournamentsForPlayersLoading(true);
    try {
      const res = await fetch("/api/tournaments-for-players");
      if (res.ok) {
        const data = await res.json();
        const tours = data.tournaments || [];
        setTournamentsForPlayers(tours);
        try {
          localStorage.setItem("jc_tennis_cached_tournaments_for_players", JSON.stringify(tours));
        } catch (e) {
          console.warn("localStorage quota exceeded for tournamentsForPlayers, relied purely on IndexedDB.");
        }
        await cacheDb.set("tournaments_for_players", tours);
        setTournamentsForPlayersLastUpdated(data.updatedAt || null);
      }
    } catch (err) {
      console.error("Failed to fetch tournaments for players:", err);
    } finally {
      setIsTournamentsForPlayersLoading(false);
    }
  };

  // Notification Permission State
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  const subscribeToWebPush = async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("[WebPush Client] Service workers or Push notifications are not supported on this device/browser.");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration) {
        console.warn("[WebPush Client] Service worker registration not ready.");
        return;
      }

      const keyRes = await fetch("/api/notifications/vapid-public-key");
      if (!keyRes.ok) {
        throw new Error("Failed to fetch VAPID public key");
      }
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        throw new Error("No VAPID public key returned from server");
      }

      const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
      const base64 = (publicKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const uint8Array = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        uint8Array[i] = rawData.charCodeAt(i);
      }

      let existingSubscription = await registration.pushManager.getSubscription();
      let shouldSubscribe = !existingSubscription;

      if (existingSubscription) {
        console.log("[WebPush Client] Active pre-existing subscription found.");
        if (existingSubscription.options && existingSubscription.options.applicationServerKey) {
          const existingKey = new Uint8Array(existingSubscription.options.applicationServerKey);
          let keyMatch = existingKey.length === uint8Array.length;
          if (keyMatch) {
            for (let i = 0; i < uint8Array.length; i++) {
              if (existingKey[i] !== uint8Array[i]) {
                keyMatch = false;
                break;
              }
            }
          }
          if (!keyMatch) {
            console.log("[WebPush Client] Key mismatch detected. Unsubscribing old subscription...");
            await existingSubscription.unsubscribe();
            shouldSubscribe = true;
          }
        } else {
          console.log("[WebPush Client] Cannot verify existing key. Forcing unregistration to ensure sync...");
          await existingSubscription.unsubscribe();
          shouldSubscribe = true;
        }
      }

      let subscription = existingSubscription;
      if (shouldSubscribe) {
        console.log("[WebPush Client] Registering fresh device subscription with pushManager...");
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: uint8Array
        });
      }

      if (subscription) {
        console.log("[WebPush Client] Synchronizing active subscription with server backend...");
        const subscriptionJSON = subscription.toJSON ? subscription.toJSON() : JSON.parse(JSON.stringify(subscription));
        const subRes = await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscriptionJSON)
        });

        if (subRes.ok) {
          console.log("[WebPush Client] Successfully registered active subscription on server database!");
        } else {
          const errText = await subRes.text();
          console.error("[WebPush Client] Backend rejected subscription synchronization:", errText);
        }
      }
    } catch (err: any) {
      console.warn("[WebPush Client] Failed to register subscription for background notifications:", err.message || err);
      // Fallback: if we hit a key mismatch error, try direct cleanup and automatic resubscribe retry
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          console.log("[WebPush Client] Stale mismatched subscription successfully removed. Retrying registration in 500ms...");
          setTimeout(() => {
            subscribeToWebPush().catch(console.error);
          }, 500);
        }
      } catch (innerErr) {
        console.error("[WebPush Client] Mismatched subscription recovery attempt failed:", innerErr);
      }
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === "granted") {
        subscribeToWebPush();
      }
    }
  }, []);

  // Synchronize URL hash with active tabs and sub tabs
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleHashRouting = () => {
      const hash = window.location.hash;
      if (!hash) return;

      if (hash === "#player-screen-hkta") {
        setActiveTab("player-screen");
        // Dispatch custom event to let PlayerScreen set subtab
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("player-screen-set-region", { detail: "HKTA" }));
        }, 80);
      } else if (hash === "#player-screen-ta") {
        setActiveTab("player-screen");
        // Dispatch custom event to let PlayerScreen set subtab
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("player-screen-set-region", { detail: "TA" }));
        }, 80);
      } else if (hash === "#draw-checker") {
        setActiveTab("draw-checker");
      } else if (hash === "#tournament-screen") {
        setActiveTab("tournament-screen");
      } else if (hash === "#alerts") {
        setActiveTab("alerts");
      }
    };

    window.addEventListener("hashchange", handleHashRouting);
    // Trigger on startup (with a slight delay to allow components to mount)
    const initTimeout = setTimeout(handleHashRouting, 350);

    return () => {
      window.removeEventListener("hashchange", handleHashRouting);
      clearTimeout(initTimeout);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleNavigateApp = (e: any) => {
      const { tab, region } = e.detail || {};
      if (tab) {
        setActiveTab(tab);
        if (region) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("player-screen-set-region", { detail: region }));
          }, 80);
        }
      }
    };

    window.addEventListener("navigate-app" as any, handleNavigateApp);
    return () => {
      window.removeEventListener("navigate-app" as any, handleNavigateApp);
    };
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("This browser does not support desktop notifications.");
      return;
    }

    if (Notification.permission === "granted") {
      try {
        await subscribeToWebPush();
        alert("Alert settings synchronized! We have verified and synchronized your active browser credentials with the server. Safe to test notifications now!");
      } catch (err) {
        alert("Verification completed. If notifications fail across devices, try resetting browser permissions.");
      }
      return;
    }
    
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === "granted") {
        new Notification("Notifications Enabled", {
          body: "You will now receive notifications on JC Tennis Tournament Planner!",
          icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTElZ9tTIVQ-qQzRwpEyM5aC2JlP2NbaHA6yR9rObvF7g&s"
        });
        // Subscribe to Web Push background/offline engine
        subscribeToWebPush();
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
    }
  };

  // Refs for tracking seen notification ids, first-run indexing, and refresh monitoring state
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const isFirstNotificationsRunRef = useRef(true);
  const wasRefreshingRef = useRef(false);

  const checkRealTimeNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (seenNotificationIdsRef.current.size === 0) {
      try {
        const saved = localStorage.getItem("jc_tennis_seen_notification_ids");
        if (saved) {
          seenNotificationIdsRef.current = new Set(JSON.parse(saved));
        }
      } catch (e) {
        console.error("Failed to read seen notification IDs from local storage:", e);
      }
    }

    try {
      const res = await fetch("/api/notifications/history");
      if (res.ok) {
        const alerts = await res.json();
        if (Array.isArray(alerts) && alerts.length > 0) {
          // Sort ascending by alert timestamp to show from oldest to newest
          const sortedAlerts = [...alerts].sort((a, b) => {
            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return timeA - timeB;
          });

          if (isFirstNotificationsRunRef.current) {
            // Initial load of the app session: index existing notices without showing popups
            // to prevent flood of historic notification sound/spam
            sortedAlerts.forEach(item => {
              if (item.id) seenNotificationIdsRef.current.add(item.id);
            });
            try {
              localStorage.setItem("jc_tennis_seen_notification_ids", JSON.stringify(Array.from(seenNotificationIdsRef.current)));
            } catch (e) {}
            isFirstNotificationsRunRef.current = false;
            return;
          }

          let modified = false;
          for (const item of sortedAlerts) {
            if (item.id && !seenNotificationIdsRef.current.has(item.id)) {
              seenNotificationIdsRef.current.add(item.id);
              modified = true;

              if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                try {
                  new Notification(item.title || "Tennis Player Alert", {
                    body: item.body || item.message || "Player statistics updated.",
                    icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTElZ9tTIVQ-qQzRwpEyM5aC2JlP2NbaHA6yR9rObvF7g&s",
                    tag: item.id
                  });
                } catch (notifErr) {
                  console.warn("Direct Notification constructor failed in background, trying service worker fallback:", notifErr);
                  if ("serviceWorker" in navigator) {
                    navigator.serviceWorker.ready.then((registration) => {
                      registration.showNotification(item.title || "Tennis Player Alert", {
                        body: item.body || item.message || "Player statistics updated.",
                        icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTElZ9tTIVQ-qQzRwpEyM5aC2JlP2NbaHA6yR9rObvF7g&s",
                        tag: item.id
                      });
                    }).catch((swErr) => {
                      console.error("Service worker background notification failed:", swErr);
                    });
                  }
                }
              }
            }
          }

          if (modified) {
            try {
              localStorage.setItem("jc_tennis_seen_notification_ids", JSON.stringify(Array.from(seenNotificationIdsRef.current)));
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.warn("Failed checking real-time background notifications:", err);
    }
  };

  // Run initial check of notifications and run again if permission changes
  useEffect(() => {
    checkRealTimeNotifications();
  }, [notificationPermission]);

  // Monitor when a scheduled or background refresh finishes (zero database billing impact!)
  useEffect(() => {
    let intervalId: any = null;

    const monitorRefreshCompletion = async () => {
      // ONLY check if tab is active (visible) to save significant Google Cloud billing overnight!
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      try {
        const res = await fetch("/api/admin/refresh-status");
        if (res.ok) {
          const { inProgress } = await res.json();
          if (inProgress) {
            wasRefreshingRef.current = true;
          } else {
            // If it was refreshing previously, and is no longer refreshing, a background/scheduled/manual job just finished!
            if (wasRefreshingRef.current) {
              console.log("App detected background refresh completed! Refreshing lists and notifications once...");
              wasRefreshingRef.current = false;
              
              // Trigger single non-polling updates to sync all data!
              checkRealTimeNotifications();
              initFromCacheAndFetch(); // This retrieves fresh tournaments/players lists from Supabase!
            }
          }
        }
      } catch (err) {
        console.warn("Error monitoring refresh completion:", err);
      }

      // Check for any newly added notifications periodically to sync other devices/containers
      try {
        await checkRealTimeNotifications();
      } catch (err) {
        console.warn("Error in periodic notifications check:", err);
      }
    };

    // Run initially to see if currently refreshing
    monitorRefreshCompletion();

    // Check periodically (every 15s) - extremely lightweight memory-only check, does NOT query database!
    intervalId = setInterval(monitorRefreshCompletion, 15000);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        monitorRefreshCompletion();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      clearInterval(intervalId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, []);

  // Setup real-time cross-device notifications via Server-Sent Events (SSE)
  useEffect(() => {
    if (typeof window === "undefined") return;

    let eventSource: EventSource | null = null;
    let reconnectTimeoutId: any = null;

    const connectSSE = () => {
      // ONLY connect if tab is active (visible) to save severe Cloud Run billing overnight!
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      console.log("[SSE Client] Connecting to real-time notification stream...");
      eventSource = new EventSource("/api/notifications/stream");

      eventSource.onmessage = (event) => {
        try {
          const notif = JSON.parse(event.data);
          if (!notif || !notif.id) return;

          // Ensure seen set is hydrated from localStorage first
          if (seenNotificationIdsRef.current.size === 0) {
            try {
              const saved = localStorage.getItem("jc_tennis_seen_notification_ids");
              if (saved) {
                seenNotificationIdsRef.current = new Set(JSON.parse(saved));
              }
            } catch (e) {}
          }

          // If we have already seen this particular notification ID, skip it
          if (seenNotificationIdsRef.current.has(notif.id)) {
            return;
          }

          // Mark as seen immediately and persist
          seenNotificationIdsRef.current.add(notif.id);
          try {
            localStorage.setItem("jc_tennis_seen_notification_ids", JSON.stringify(Array.from(seenNotificationIdsRef.current)));
          } catch (e) {}

          // Show system-level desktop/phone notification
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              const systemNotifObj = new Notification(notif.title || "Tennis Player Alert", {
                body: notif.body || notif.message || "Player stats changed.",
                icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTElZ9tTIVQ-qQzRwpEyM5aC2JlP2NbaHA6yR9rObvF7g&s",
                tag: notif.id
              });
              systemNotifObj.onclick = (e) => {
                e.preventDefault();
                window.focus();
                const isHK = notif.source === 'HK' || notif.source === 'HKTA' || notif.url?.includes('hk') || notif.url?.includes('hkta') || notif.player_source === 'HKTA' || (notif.body && notif.body.toLowerCase().includes('hong kong')) || (notif.title && notif.title.toLowerCase().includes('hong kong'));
                const isDraw = notif.type === 'Draw_Watcher' || notif.type === 'Draw' || (notif.title && notif.title.includes('Draw'));
                const isNSW = notif.type === 'NSW_Tournament' || notif.type === 'NSW' || (notif.title && notif.title.includes('NSW'));
                const isHKTournament = notif.type === 'HK_Tournament' || (notif.title && notif.title.includes('HKTA Tournament')) || (notif.title && notif.title.includes('HK Tournament')) || (notif.title && notif.title.includes('New HKTA Tournament'));
                
                if (isDraw) {
                  window.location.hash = "#draw-checker";
                } else if (isNSW || isHKTournament) {
                  window.location.hash = "#tournament-screen";
                } else {
                  window.location.hash = isHK ? "#player-screen-hkta" : "#player-screen-ta";
                }
              };
            } catch (notifErr) {
              console.warn("[SSE Client] Direct Notification constructor failed, trying service worker:", notifErr);
              if ("serviceWorker" in navigator) {
                navigator.serviceWorker.ready.then((registration) => {
                  const isHK = notif.source === 'HK' || notif.source === 'HKTA' || notif.url?.includes('hk') || notif.url?.includes('hkta') || notif.player_source === 'HKTA' || (notif.body && notif.body.toLowerCase().includes('hong kong')) || (notif.title && notif.title.toLowerCase().includes('hong kong'));
                  const isDraw = notif.type === 'Draw_Watcher' || notif.type === 'Draw' || (notif.title && notif.title.includes('Draw'));
                  const isNSW = notif.type === 'NSW_Tournament' || notif.type === 'NSW' || (notif.title && notif.title.includes('NSW'));
                  const isHKTournament = notif.type === 'HK_Tournament' || (notif.title && notif.title.includes('HKTA Tournament')) || (notif.title && notif.title.includes('HK Tournament')) || (notif.title && notif.title.includes('New HKTA Tournament'));
                  const swUrl = isDraw ? "/#draw-checker" : (isNSW || isHKTournament) ? "/#tournament-screen" : isHK ? "/#player-screen-hkta" : "/#player-screen-ta";
                  
                  registration.showNotification(notif.title || "Tennis Player Alert", {
                    body: notif.body || notif.message || "Player stats changed.",
                    icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTElZ9tTIVQ-qQzRwpEyM5aC2JlP2NbaHA6yR9rObvF7g&s",
                    tag: notif.id,
                    data: {
                      url: swUrl
                    }
                  });
                }).catch((e) => console.error("[SSE Client] Service worker notification error:", e));
              }
            }
          }

          // Dispatch unified event so any active screens can update lists instantly
          window.dispatchEvent(new CustomEvent("tennis-notification-received", { detail: notif }));
        } catch (err) {
          console.error("[SSE Client] Failed processing stream message:", err);
        }
      };

      eventSource.onerror = (err) => {
        console.warn("[SSE Client] Stream connection closed or errored. Reconnecting in 5 seconds...", err);
        if (eventSource) {
          eventSource.close();
        }
        reconnectTimeoutId = setTimeout(connectSSE, 5000);
      };
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined") {
        if (document.visibilityState === "visible") {
          if (!eventSource) {
            connectSSE();
          }
        } else {
          console.log("[SSE Client] Tab inactive, closing SSE connection to save Cloud Run CPU billing...");
          if (reconnectTimeoutId) {
            clearTimeout(reconnectTimeoutId);
            reconnectTimeoutId = null;
          }
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
        }
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    connectSSE();

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const [savedDraws, setSavedDraws] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("jc_tennis_cached_saved_draws");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [allTournaments, setAllTournaments] = useState<Tournament[]>(() => {
    try {
      const saved = localStorage.getItem("jc_tennis_cached_all_tournaments");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("jc_tennis_cached_last_updated");
      return saved ? new Date(saved) : new Date();
    } catch {
      return new Date();
    }
  });
  const [isScraping, setIsScraping] = useState<boolean>(false);
  
  const [region, setRegion] = useState<Region>("AUS");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("ALL");
  const [within120km, setWithin120km] = useState<boolean>(false);
  
  const currentMonthIndex = new Date().getMonth();
  const currentYearValue = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>(currentMonthIndex);
  const [selectedYear, setSelectedYear] = useState<number>(currentYearValue);
  const [auState, setAuState] = useState<string>("ALL");

  const jordanJoinedUrls = useMemo(() => {
    const urls = new Set<string>();
    tournamentsForPlayers.forEach(tp => {
      const containsJordan = tp.joinedPlayers?.some((jp: any) => {
        const name = jp.player?.name ? jp.player.name.toLowerCase() : "";
        return name.includes("jordan chiu") || name.includes("chiu jordan") || jp.player?.id === "66333972211" || jp.player?.id === "66419";
      });
      if (containsJordan && tp.tournament?.link) {
        const absoluteUrl = getFullLink(tp.tournament.link, tp.tournament.source as any);
        const normalized = absoluteUrl.split('#')[0].toLowerCase().trim();
        urls.add(normalized);
      }
    });
    return urls;
  }, [tournamentsForPlayers]);

  const fetchSavedDraws = async () => {
    try {
      const res = await fetch('/api/saved-draws');
      if (res.ok) {
        const data = await res.json();
        const draws = data.draws || [];
        setSavedDraws(draws);
        localStorage.setItem("jc_tennis_cached_saved_draws", JSON.stringify(draws));
      }
    } catch (err) {
      console.error("Failed to fetch saved draws:", err);
    }
  };

  const fetchStaticData = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("Manual refresh triggered. Fetching all tournaments, draws, and players cache...");
      const [toursData, resSavedDraws, resPlayers] = await Promise.all([
        fetchTournaments(),
        fetch('/api/saved-draws').then(r => r.json()).catch(() => ({ draws: [] })),
        fetch('/api/tournaments-for-players').then(r => r.json()).catch(() => ({ tournaments: [] }))
      ]);

      const tours = toursData.tournaments || [];
      setAllTournaments(tours);
      try {
        localStorage.setItem("jc_tennis_cached_all_tournaments", JSON.stringify(tours));
      } catch (e) {
        console.warn("localStorage space quota exceeded for allTournaments, relying purely on IndexedDB.");
      }
      await cacheDb.set("all_tournaments", tours);
      setIsScraping(!!toursData.isScraping);

      if (toursData.lastUpdated) {
        const updatedDate = new Date(toursData.lastUpdated);
        setLastUpdated(updatedDate);
        localStorage.setItem("jc_tennis_cached_last_updated", updatedDate.toISOString());
      }

      const draws = resSavedDraws.draws || [];
      setSavedDraws(draws);
      localStorage.setItem("jc_tennis_cached_saved_draws", JSON.stringify(draws));

      const tpTours = resPlayers.tournaments || [];
      setTournamentsForPlayers(tpTours);
      try {
        localStorage.setItem("jc_tennis_cached_tournaments_for_players", JSON.stringify(tpTours));
      } catch (e) {
        console.warn("localStorage space quota exceeded for tournamentsForPlayers, relying purely on IndexedDB.");
      }
      await cacheDb.set("tournaments_for_players", tpTours);
      setTournamentsForPlayersLastUpdated(resPlayers.updatedAt || null);
      
      // Check real-time notifications after completing manual refresh
      checkRealTimeNotifications();
    } catch (err: any) {
      console.error("Manual refresh failed:", err);
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  };

  // Safe instant loading utilizing local cache first, then checking for updates silently
  const initFromCacheAndFetch = async () => {
    let hasLocalCache = false;
    // 1. Instantly restore everything from IndexedDB cache or localStorage fallback
    try {
      const cachedAll = await cacheDb.get<Tournament[]>("all_tournaments");
      if (cachedAll && cachedAll.length > 0) {
        setAllTournaments(cachedAll);
        hasLocalCache = true;
      } else {
        const localSaved = localStorage.getItem("jc_tennis_cached_all_tournaments");
        if (localSaved) {
          const parsed = JSON.parse(localSaved);
          setAllTournaments(parsed);
          await cacheDb.set("all_tournaments", parsed);
          hasLocalCache = true;
        }
      }

      const cachedPlayersTours = await cacheDb.get<any[]>("tournaments_for_players");
      if (cachedPlayersTours && cachedPlayersTours.length > 0) {
        setTournamentsForPlayers(cachedPlayersTours);
      } else {
        const localSaved = localStorage.getItem("jc_tennis_cached_tournaments_for_players");
        if (localSaved) {
          const parsed = JSON.parse(localSaved);
          setTournamentsForPlayers(parsed);
          await cacheDb.set("tournaments_for_players", parsed);
        }
      }

      const lastUpText = localStorage.getItem("jc_tennis_cached_last_updated");
      if (lastUpText) {
        setLastUpdated(new Date(lastUpText));
      }
    } catch (e) {
      console.warn("Failed to retrieve initial cache:", e);
    } finally {
      // Direct user access to interactive UI with cached data in < 50ms!
      setLoading(!hasLocalCache);
    }

    // 2. Perform background fetch of all latest data in parallel to keep it completely in sync with Supabase/Server
    try {
      console.log("Background syncing latest data from Supabase/Server...");
      const [toursRes, playersRes, drawsRes] = await Promise.allSettled([
        fetchTournaments(),
        fetch("/api/tournaments-for-players").then(r => r.ok ? r.json() : Promise.reject()),
        fetch("/api/saved-draws").then(r => r.ok ? r.json() : Promise.reject())
      ]);

      if (toursRes.status === "fulfilled" && toursRes.value) {
        const toursData = toursRes.value;
        const tours = toursData.tournaments || [];
        setAllTournaments(tours);
        await cacheDb.set("all_tournaments", tours);
        setIsScraping(!!toursData.isScraping);
        if (toursData.lastUpdated) {
          const updatedDate = new Date(toursData.lastUpdated);
          setLastUpdated(updatedDate);
          localStorage.setItem("jc_tennis_cached_last_updated", updatedDate.toISOString());
        }
      }

      if (playersRes.status === "fulfilled" && playersRes.value) {
        const data = playersRes.value;
        const tours = data.tournaments || [];
        setTournamentsForPlayers(tours);
        await cacheDb.set("tournaments_for_players", tours);
        setTournamentsForPlayersLastUpdated(data.updatedAt || null);
      }

      if (drawsRes.status === "fulfilled" && drawsRes.value) {
        const drawData = drawsRes.value;
        if (drawData && drawData.draws) {
          setSavedDraws(drawData.draws);
          localStorage.setItem("jc_tennis_cached_saved_draws", JSON.stringify(drawData.draws));
        }
      }
      
      console.log("Background sync complete. All views fully populated from Supabase!");
    } catch (err) {
      console.warn("Background update sync failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initFromCacheAndFetch();
  }, []);

  // Filter tournaments based on region, ageFilter, searchTerm, and month
  const filteredTournaments = useMemo(() => {
    return allTournaments.filter(t => {
      // Region filter
      if (region !== 'BOTH' && t.source !== region) return false;
      
      // Age filter
      if (ageFilter === 'U10' && !t.ageGroup.includes('U10')) return false;
      if (ageFilter === 'U12' && !t.ageGroup.includes('U12')) return false;
      
      // Distance filter
      if (within120km && t.distance) {
        const distNum = parseFloat(t.distance.replace(/[^\d.]/g, ''));
        if (!isNaN(distNum) && distNum > 120) {
          return false;
        }
      } else if (within120km && !t.distance && t.source === 'AUS') {
        return false;
      }
      
      // Search filter
      if (searchTerm && !t.name.toLowerCase().includes(searchTerm.toLowerCase()) && !t.dates.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      
      // State filter for tennis Australia tournaments
      if (auState !== "ALL" && t.source === "AUS") {
        if (getTournamentState(t) !== auState) return false;
      }
      
      // Month filter
      if (selectedMonth !== 'ALL') {
        const parts = t.dates.split(" to ");
        if (parts.length === 2) {
          const startMatch = parts[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          const endMatch = parts[1].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (startMatch && endMatch) {
            const startDate = new Date(parseInt(startMatch[3]), parseInt(startMatch[2]) - 1, parseInt(startMatch[1]));
            const endDate = new Date(parseInt(endMatch[3]), parseInt(endMatch[2]) - 1, parseInt(endMatch[1]));
            const targetMonthStart = new Date(selectedYear, selectedMonth as number, 1);
            const targetMonthEnd = new Date(selectedYear, (selectedMonth as number) + 1, 0);
            
            // Check if the tournament range overlaps with the selected month
            if (endDate < targetMonthStart || startDate > targetMonthEnd) return false;
          }
        } else {
          const match = t.dates.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (match) {
            const month = parseInt(match[2], 10) - 1;
            const year = parseInt(match[3], 10);
            if (month !== selectedMonth || year !== selectedYear) return false;
          }
        }
      } else {
        // Year filter when ALL months is selected
        const parts = t.dates.split(" to ");
        if (parts.length === 2) {
          const startMatch = parts[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          const endMatch = parts[1].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (startMatch && endMatch) {
            const startYear = parseInt(startMatch[3], 10);
            const endYear = parseInt(endMatch[3], 10);
            if (selectedYear < startYear || selectedYear > endYear) {
              return false;
            }
          }
        } else {
          const match = t.dates.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (match) {
            const year = parseInt(match[3], 10);
            if (year !== selectedYear) return false;
          }
        }
      }
      
      return true;
    });
  }, [allTournaments, region, ageFilter, searchTerm, selectedMonth, selectedYear, within120km, auState]);

  const handleExport = () => {
    const dataToExport = allTournaments.map(t => ({
      'Tournament Name': t.name,
      'Dates': t.dates,
      'Age Group': t.ageGroup,
      'Region': t.source,
      'State': t.source === 'AUS' ? getTournamentState(t) : '',
      'Distance': t.distance || '',
      'Closing Deadline': t.closingDeadline || '',
      'Link': getFullLink(t.link, t.source),
      'Maps Link': t.mapsLink || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Auto-size columns
    const colWidths = [
      { wch: 50 }, // Name
      { wch: 25 }, // Dates
      { wch: 15 }, // Age Group
      { wch: 10 }, // Region
      { wch: 10 }, // State
      { wch: 15 }, // Distance
      { wch: 15 }, // Closing Deadline
      { wch: 50 }, // Link
      { wch: 50 }  // Maps Link
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tournaments");
    XLSX.writeFile(wb, "Tournaments_2026.xlsx");
  };

  const formatHKT = (dateSource: Date | string | null) => {
    if (!dateSource) return "Never";
    const dateObj = typeof dateSource === "string" ? new Date(dateSource) : dateSource;
    if (isNaN(dateObj.getTime())) return "Never";
    
    const dateStr = dateObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Hong_Kong"
    }).replace(/ /g, "-");

    const timeStr = dateObj.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Hong_Kong"
    });

    return `${dateStr} ${timeStr}`;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-xl border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-0 sm:h-16 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 w-full sm:w-auto">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M6 3.5a9 9 0 0 1 0 17"></path>
                    <path d="M18 3.5a9 9 0 0 0 0 17"></path>
                  </svg>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-2">
                  <div>
                    <h1 className="text-[17px] font-semibold tracking-tight leading-tight text-white">JC Tennis</h1>
                    <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Tournament Planner</p>
                  </div>
                  
                  {/* Last Refresh Indicators */}
                  <div className="flex sm:flex-col gap-x-3 gap-y-0.5 text-[9px] font-mono leading-none border-t sm:border-t-0 sm:border-l border-gray-800 pt-1.5 sm:pt-0 sm:pl-3 text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0 select-none"></span>
                      <span>Version: <b className="text-gray-300 font-semibold">{formatHKT((import.meta as any).env?.VITE_PUBLISH_TIME || new Date().toISOString())}</b></span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 select-none"></span>
                      <span>Scrape: <b className="text-gray-300 font-semibold">{formatHKT(lastUpdated)}</b></span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 select-none"></span>
                      <span>Global: <b className="text-gray-300 font-semibold">{formatHKT(tournamentsForPlayersLastUpdated)}</b></span>
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 sm:hidden">
                <button
                  type="button"
                  onClick={requestNotificationPermission}
                  className={`p-1.5 rounded-xl border transition-all duration-200 cursor-pointer flex items-center gap-1 focus:outline-none select-none ${
                    notificationPermission === "granted"
                      ? "bg-emerald-500/10 text-emerald-405 border-emerald-500/20"
                      : notificationPermission === "denied"
                      ? "bg-rose-500/10 text-rose-405 border-rose-500/20"
                      : "bg-gray-800 hover:bg-gray-750 text-gray-300 border-gray-700/60"
                  }`}
                  title={
                    notificationPermission === "granted"
                      ? "Notifications enabled"
                      : notificationPermission === "denied"
                      ? "Notifications blocked"
                      : "Enable notifications"
                  }
                >
                  {notificationPermission === "granted" ? (
                    <Bell className="w-4.5 h-4.5 text-emerald-400 animate-pulse" />
                  ) : notificationPermission === "denied" ? (
                    <BellOff className="w-4.5 h-4.5 text-rose-405" />
                  ) : (
                    <Bell className="w-4.5 h-4.5 text-gray-400" />
                  )}
                  <span className="text-[10px] font-black uppercase tracking-wider">
                    {notificationPermission === "granted" ? "On" : notificationPermission === "denied" ? "Off" : "Alerts"}
                  </span>
                </button>
              </div>
            </div>

            <nav className="flex items-center gap-1 bg-gray-800/50 p-1 rounded-lg overflow-x-auto w-full sm:w-auto no-scrollbar">
              <button
                onClick={() => setActiveTab("tournament-screen")}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === "tournament-screen" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Tournament Screen
              </button>
              <button
                onClick={() => setActiveTab("draw-checker")}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === "draw-checker" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Draw Checker
              </button>
              <button
                onClick={() => setActiveTab("player-screen")}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === "player-screen" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Player Screen
              </button>
              <button
                onClick={() => setActiveTab("player-watch")}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === "player-watch" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Player Search
              </button>
              <button
                onClick={() => setActiveTab("tournaments")}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === "tournaments" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Tournaments
              </button>
              <button
                onClick={() => setActiveTab("alerts")}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === "alerts" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Alerts
              </button>
            </nav>
          </div>
          
          <div className="hidden sm:flex items-center gap-4">
            <button
              type="button"
              onClick={requestNotificationPermission}
              className={`p-2 px-3 rounded-xl border transition-all duration-200 cursor-pointer flex items-center gap-2 focus:outline-none select-none ${
                notificationPermission === "granted"
                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20"
                  : notificationPermission === "denied"
                  ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20"
                  : "bg-gray-800 hover:bg-gray-750 text-gray-300 border-gray-700/60"
              }`}
              title={
                notificationPermission === "granted"
                  ? "Notifications enabled"
                  : notificationPermission === "denied"
                  ? "Notifications blocked"
                  : "Enable notifications"
              }
            >
              {notificationPermission === "granted" ? (
                <Bell className="w-4 h-4 text-emerald-400 animate-pulse" />
              ) : notificationPermission === "denied" ? (
                <BellOff className="w-4 h-4 text-rose-400" />
              ) : (
                <Bell className="w-4 h-4 text-gray-400" />
              )}
              <span className="text-xs font-bold uppercase tracking-wider">
                {notificationPermission === "granted"
                  ? "Notifications On"
                  : notificationPermission === "denied"
                  ? "Notifications Blocked"
                  : "Enable Alerts"}
              </span>
            </button>
          </div>
        </div>
      </header>

      {activeTab === "tournaments" && (
        <MonthTabs 
          selectedYear={selectedYear} 
          setSelectedYear={setSelectedYear} 
          selectedMonth={selectedMonth} 
          setSelectedMonth={setSelectedMonth} 
        />
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className={activeTab === "tournaments" ? "block" : "hidden"}>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex bg-gray-900/50 p-1 rounded-xl border border-gray-800 shadow-sm">
                <button 
                  onClick={() => setRegion("HK")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${region === "HK" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  <span>🇭🇰</span> HK
                </button>
                <button 
                  onClick={() => setRegion("AUS")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${region === "AUS" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  <span>🇦🇺</span> AUS
                </button>
                <button 
                  onClick={() => setRegion("BOTH")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${region === "BOTH" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  <span>🇭🇰 + 🇦🇺</span>
                </button>
              </div>

              <button 
                onClick={fetchStaticData}
                disabled={loading}
                className="w-10 h-10 flex items-center justify-center bg-gray-900/50 hover:bg-gray-800 text-gray-300 rounded-xl border border-gray-800 transition-all disabled:opacity-50 shadow-sm"
                title="Refresh Database"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              {isScraping && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  Scraper Active
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-900/30 px-3 py-1.5 rounded-lg border border-gray-800/50">
                <Clock className="w-3.5 h-3.5" />
                Updated {lastUpdated.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Hong_Kong' }).replace(/ /g, '-')} {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong' })} HKT
              </div>
            </div>
          </div>

          <FilterBar 
            ageFilter={ageFilter}
            setAgeFilter={setAgeFilter}
            within120km={within120km}
            setWithin120km={setWithin120km}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            handleExport={handleExport}
            auState={auState}
            setAuState={setAuState}
            showStateFilter={region !== 'HK'}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-gray-500 mb-6">
            {loading && (
              <div className="flex items-center gap-1.5 text-orange-400 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                Refreshing data...
              </div>
            )}
          </div>

          <AnimatePresence>
            {error && (
              <div className="bg-red-900/20 border border-red-900/50 rounded-2xl p-4 flex items-start gap-3 text-red-400 mb-6">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="font-semibold text-sm text-red-300">Failed to Load Data</p>
                  <p className="text-sm opacity-90 mt-0.5">{error}</p>
                </div>
              </div>
            )}
          </AnimatePresence>

          <div className="bg-gray-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.2)] border border-gray-800 overflow-hidden">
            <div className="bg-gray-800/50 border-b border-gray-800 px-6 py-3 flex items-center justify-between text-xs font-medium text-gray-400 uppercase tracking-wider">
              <span>{filteredTournaments.length} Tournaments Found</span>
            </div>
            
            <div className="divide-y divide-gray-800/50">
              {loading && allTournaments.length === 0 ? (
                <div className="p-16 flex flex-col items-center justify-center gap-4 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="text-sm font-medium">Loading Database...</p>
                </div>
              ) : filteredTournaments.length > 0 ? (
                filteredTournaments.map((t, i) => {
                  const absoluteUrl = getFullLink(t.link, t.source);
                  const normalized = absoluteUrl.split('#')[0].toLowerCase().trim();
                  const hasJordanJoined = jordanJoinedUrls.has(normalized);
                  return (
                    <TournamentCard 
                      key={i} 
                      tournament={t} 
                      index={i} 
                      savedDraws={savedDraws} 
                      onSavedDrawsChanged={fetchSavedDraws} 
                      hasJordanJoined={hasJordanJoined}
                    />
                  );
                })
              ) : !loading && (
                <div className="p-16 flex flex-col items-center justify-center gap-3 text-gray-500">
                  <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-2">
                    <Filter className="w-6 h-6 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-400">No tournaments found</p>
                  <p className="text-sm text-center max-w-xs">
                    Try adjusting your filters.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={activeTab === "player-watch" ? "block" : "hidden"}>
          <PlayerWatch />
        </div>

        <div className={activeTab === "player-screen" ? "block" : "hidden"}>
          <PlayerScreen 
            tournamentsCache={tournamentsForPlayers}
            isTournamentsCacheLoading={isTournamentsForPlayersLoading}
            reloadTournamentsCache={reloadTournamentsForPlayers}
          />
        </div>

        <div className={activeTab === "tournament-screen" ? "block" : "hidden"}>
          <TournamentScreen 
            isActive={activeTab === "tournament-screen"} 
            tournamentsCache={tournamentsForPlayers}
            isTournamentsCacheLoading={isTournamentsForPlayersLoading}
            reloadTournamentsCache={reloadTournamentsForPlayers}
            tournamentsCacheLastUpdated={tournamentsForPlayersLastUpdated}
          />
        </div>

        <div className={activeTab === "draw-checker" ? "block" : "hidden"}>
          <DrawChecker savedDraws={savedDraws} onSavedDrawsChanged={fetchSavedDraws} />
        </div>

        <div className={activeTab === "alerts" ? "block" : "hidden"}>
          <HistoryTab />
        </div>

      {/* Footer */}
        <footer className="mt-12 pb-8 text-center text-xs text-gray-600 font-medium">
          <p>© 2026 Tennis Tournament Finder</p>
          <p className="mt-1">Data sourced from Tournament Software</p>
        </footer>
      </main>
    </div>
  );
}
