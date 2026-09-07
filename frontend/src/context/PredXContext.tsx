import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useMarket } from '../hooks/useMarket';
import type { CalculatedLeaderboardEntry } from '../lib/marketContract';

// Types
export interface Market {
  id: string;
  id_onchain: number;
  title: string;
  volume: number;
  liquidity: number;
  participants: number;
  aiScore: number;
  probabilityYes: number;
  probabilityNo: number;
  optionA: string;
  optionB: string;
  image: string;
  endDate: string;
  endTimeStamp: number;
  category: string;
  status: 'active' | 'resolved';
}

export interface Better {
  id: string;
  name: string;
  address: string;
  accuracy: number;
  resolvedBets: number;
  wins: number;
  winsLast24h: number;
  bestWinStreak: number;
  volume: number;
  profit: number;
  avatar: string;
  tier: string;
  rank: number;
}

export interface Position {
  id: string;
  marketId: string;
  outcome: 'YES' | 'NO';
  amount: number;
  potential: number;
  status: 'running' | 'won' | 'lost';
}

export interface TradeRecord {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  priceAtTrade: number
  priceAtTradeINR: number
  algoAmount: number
  txId?: string
  mode: 'simulation' | 'transaction'
  timestamp: Date
  assetType: 'stock' | 'crypto'
}

export type ThemeMode = 'dark' | 'light';
export type LayoutMode = 'detailed' | 'compact';

interface PredXContextType {
  markets: Market[];
  marketsRefreshing: boolean;
  leaderboard: Better[];
  leaderboardLoading: boolean;
  myPositions: Position[];
  myTrades: TradeRecord[];
  currentPage: string;
  navigate: (page: string, props?: any) => void;
  pageProps: any;
  placePrediction: (marketId: string, outcome: number, amount: number) => void;
  addTrade: (trade: TradeRecord) => void;
  refreshMarketsOnce: () => Promise<void>;
  appId: number;
  resolveMarket: (marketId: number, winningOutcome: number) => void;
  addMarket: (m: Market) => void;
  isBalanceHidden: boolean;
  toggleBalanceVisibility: () => void;
  privatePortfolioMode: boolean;
  setPrivatePortfolioMode: (enabled: boolean) => void;
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  browserNotificationsEnabled: boolean;
  setBrowserNotificationsEnabled: (enabled: boolean) => void;
  systemAlertsEnabled: boolean;
  setSystemAlertsEnabled: (enabled: boolean) => void;
  requestBrowserNotificationPermission: () => Promise<NotificationPermission | 'unsupported'>;
  pushBrowserNotification: (
    title: string,
    body: string,
    options?: { type?: 'market' | 'system'; tag?: string }
  ) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const PredXContext = createContext<PredXContextType | undefined>(undefined);

const toBetter = (entry: CalculatedLeaderboardEntry): Better => ({
  id: entry.id,
  name: entry.name,
  address: entry.address,
  accuracy: entry.accuracy,
  resolvedBets: entry.resolvedBets,
  wins: entry.wins,
  winsLast24h: entry.winsLast24h,
  bestWinStreak: entry.bestWinStreak,
  volume: entry.volume,
  profit: entry.profit,
  avatar: entry.avatar,
  tier: entry.tier,
  rank: entry.rank,
});

const appId = Number(import.meta.env.VITE_CONTRACT_APP_ID ?? 0);
const THEME_STORAGE_KEY = 'predx-theme-mode';
const LAYOUT_STORAGE_KEY = 'predx-layout-mode';
const PRIVATE_PORTFOLIO_STORAGE_KEY = 'predx-private-portfolio-mode';
const BROWSER_NOTIFICATIONS_STORAGE_KEY = 'predx-browser-notifications';
const SYSTEM_ALERTS_STORAGE_KEY = 'predx-system-alerts';

const getInitialThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  // No saved preference: match the OS, same as the pre-paint script in index.html
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

const getInitialLayoutMode = (): LayoutMode => {
  if (typeof window === 'undefined') return 'detailed';
  return window.localStorage.getItem(LAYOUT_STORAGE_KEY) === 'compact' ? 'compact' : 'detailed';
};

const getInitialPrivatePortfolioMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(PRIVATE_PORTFOLIO_STORAGE_KEY) === 'true';
};

const getInitialBrowserNotificationsEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(BROWSER_NOTIFICATIONS_STORAGE_KEY) !== 'false';
};

const getInitialSystemAlertsEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SYSTEM_ALERTS_STORAGE_KEY) !== 'false';
};

export const PredXProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [markets, setMarkets] = useState<Market[]>([]);
  const isFetchingMarketsRef = React.useRef(false);
  const [marketsRefreshing, setMarketsRefreshing] = useState<boolean>(false);
  const [leaderboard, setLeaderboard] = useState<Better[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState<boolean>(true);
  const [myPositions, setMyPositions] = useState<Position[]>(() => {
    const saved = localStorage.getItem('predx-positions');
    return saved ? JSON.parse(saved) : [];
  });
  const [myTrades, setMyTrades] = useState<TradeRecord[]>(() => {
    const saved = localStorage.getItem('predx-trades');
    return saved
      ? JSON.parse(saved).map((t: any) => ({
          ...t,
          mode: t.mode === 'transaction' ? 'transaction' : 'simulation',
          txId: t.txId ?? undefined,
          priceAtTradeINR: typeof t.priceAtTradeINR === 'number'
            ? t.priceAtTradeINR
            : (typeof t.priceAtTrade === 'number' ? t.priceAtTrade : 0),
          timestamp: new Date(t.timestamp),
        }))
      : [];
  });
  const [isBalanceHidden, setIsBalanceHidden] = useState<boolean>(getInitialPrivatePortfolioMode);
  const [privatePortfolioMode, setPrivatePortfolioModeState] = useState<boolean>(getInitialPrivatePortfolioMode);
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>(getInitialLayoutMode);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabledState] = useState<boolean>(getInitialBrowserNotificationsEnabled);
  const [systemAlertsEnabled, setSystemAlertsEnabledState] = useState<boolean>(getInitialSystemAlertsEnabled);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getInitialThemeMode);

  // Custom router state — persisted in URL hash so refresh stays on same page
  const getInitialPage = (): string => {
    if (typeof window === 'undefined') return 'home';
    const hash = window.location.hash.slice(1); // strip '#'
    const validPages = [
      'home','dashboard','markets','leaderboard','terminal','settings','screener','trade','support',
      // Finance pages
      'analysis','wealth','education','goals','transactions',
      // Arthniti pages
      'advisory','feasibility','financial-plan','arthniti-chat','bank',
      'explore','opportunities','compare',
    ];
    return validPages.includes(hash) ? hash : 'home';
  };
  const [currentPage, setCurrentPage] = useState<string>(getInitialPage);
  const [pageProps, setPageProps] = useState<any>({});
  
  const { getMarkets, getLeaderboard } = useMarket();

  const fetchLiveMarkets = async (showLoading: boolean = false) => {
    if (isFetchingMarketsRef.current) return;
    isFetchingMarketsRef.current = true;
    if (showLoading) setMarketsRefreshing(true);
    try {
      const liveMarkets = await getMarkets();
      if (liveMarkets && liveMarkets.length > 0) {
        setMarkets(liveMarkets);
      }
    } catch (err) {
      console.error("Failed to sync live markets overall:", err);
    } finally {
      if (showLoading) setMarketsRefreshing(false);
      isFetchingMarketsRef.current = false;
    }
  };

  const fetchLiveLeaderboard = async () => {
    setLeaderboardLoading(true);
    try {
      const liveLeaderboard = await getLeaderboard();
      setLeaderboard(liveLeaderboard.map(toBetter));
    } catch (err) {
      console.error('Failed to sync live leaderboard:', err);
      setLeaderboard([]);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  useEffect(() => {
    // Reset guard on mount so StrictMode double-invoke works correctly
    isFetchingMarketsRef.current = false;
    fetchLiveMarkets(true); // show spinner on first load
    fetchLiveLeaderboard();
    const intervalId = setInterval(fetchLiveMarkets, 60000); // refresh every 60s (boxes are slow)
    const leaderboardIntervalId = setInterval(fetchLiveLeaderboard, 60000);
    return () => {
      clearInterval(intervalId);
      clearInterval(leaderboardIntervalId);
      isFetchingMarketsRef.current = false;
    };
  }, [getMarkets, getLeaderboard]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const isLight = themeMode === 'light';
    root.classList.toggle('theme-light', isLight);
    root.classList.toggle('theme-dark', !isLight);
    root.setAttribute('data-theme', isLight ? 'algolight' : 'algodark');
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PRIVATE_PORTFOLIO_STORAGE_KEY, String(privatePortfolioMode));
  }, [privatePortfolioMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BROWSER_NOTIFICATIONS_STORAGE_KEY, String(browserNotificationsEnabled));
  }, [browserNotificationsEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SYSTEM_ALERTS_STORAGE_KEY, String(systemAlertsEnabled));
  }, [systemAlertsEnabled]);

  const navigate = (page: string, props: any = {}) => {
    setCurrentPage(page);
    setPageProps(props);
    if (typeof window !== 'undefined') {
      window.location.hash = page;
    }
    window.scrollTo(0, 0);
  };

  const placePrediction = (marketId: string, outcome: number, amount: number) => {
    const market = markets.find(m => m.id === marketId);
    if (!market) return;

    // Simulate placing a bet
    const newPosition: Position = {
      id: Math.random().toString(36).substr(2, 9),
      marketId,
      outcome: outcome === 0 ? 'YES' : 'NO',
      amount,
      potential: outcome === 0 ? amount * (100 / market.probabilityYes) : amount * (100 / market.probabilityNo),
      status: 'running'
    };

    setMyPositions(prev => {
      const updated = [newPosition, ...prev];
      localStorage.setItem('predx-positions', JSON.stringify(updated));
      return updated;
    });

    // Update market volume
    setMarkets(prev => prev.map(m => {
      if (m.id === marketId) {
        return {
          ...m,
          volume: m.volume + amount,
          participants: m.participants + 1
        };
      }
      return m;
    }));
  };

  const addTrade = (trade: TradeRecord) => {
    setMyTrades(prev => {
      const updated = [trade, ...prev];
      localStorage.setItem('predx-trades', JSON.stringify(updated));
      return updated;
    });
  };

  const resolveMarket = (marketId: number, winningOutcome: number) => {
    console.log('Admin resolve:', marketId, winningOutcome);
  };

  const addMarket = (m: Market) => {
    setMarkets(prev => [m, ...prev]);
  };

  const toggleBalanceVisibility = () => {
    setIsBalanceHidden(!isBalanceHidden);
  };

  const setPrivatePortfolioMode = (enabled: boolean) => {
    setPrivatePortfolioModeState(enabled);
    if (enabled) setIsBalanceHidden(true);
  };

  const setLayoutMode = (mode: LayoutMode) => {
    setLayoutModeState(mode);
  };

  const setBrowserNotificationsEnabled = (enabled: boolean) => {
    setBrowserNotificationsEnabledState(enabled);
  };

  const setSystemAlertsEnabled = (enabled: boolean) => {
    setSystemAlertsEnabledState(enabled);
  };

  const requestBrowserNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return Notification.requestPermission();
  };

  const pushBrowserNotification = (
    title: string,
    body: string,
    options?: { type?: 'market' | 'system'; tag?: string }
  ) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const type = options?.type ?? 'market';
    const isEnabled = type === 'system' ? systemAlertsEnabled : browserNotificationsEnabled;
    if (!isEnabled) return;

    new Notification(title, { body, tag: options?.tag });
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
  };

  const refreshMarketsOnce = async () => {
    await fetchLiveMarkets(true);
  };

  return (
    <PredXContext.Provider value={{
      markets,
      marketsRefreshing,
      leaderboard,
      leaderboardLoading,
      myPositions,
      myTrades,
      currentPage,
      navigate,
      pageProps,
      placePrediction,
      addTrade,
      refreshMarketsOnce,
      appId,
      resolveMarket,
      addMarket,
      isBalanceHidden,
      toggleBalanceVisibility,
      privatePortfolioMode,
      setPrivatePortfolioMode,
      layoutMode,
      setLayoutMode,
      browserNotificationsEnabled,
      setBrowserNotificationsEnabled,
      systemAlertsEnabled,
      setSystemAlertsEnabled,
      requestBrowserNotificationPermission,
      pushBrowserNotification,
      themeMode,
      setThemeMode
    }}>
      {children}
    </PredXContext.Provider>
  );
};

export const usePredX = () => {
  const context = useContext(PredXContext);
  if (context === undefined) {
    throw new Error('usePredX must be used within a PredXProvider');
  }
  return context;
};
