import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AdvisoryDiscovery = {
  results: any[];
  meta?: any;
  filteredOut?: any[];
  status?: string;
  manualNote?: string;
};

export type AdvisoryComparison = {
  businesses: any[];
  result?: any;
};

export type AdvisorySearch = {
  id: string;
  createdAt: string;
  updatedAt: string;
  profile: any;
  discovery?: AdvisoryDiscovery;
  comparison?: AdvisoryComparison;
  selectedBusiness?: any;
  feasibilityReport?: any;
  financialPlan?: { matches?: any[]; plan?: any };
};

type AdvisoryContextValue = {
  activeSearch: AdvisorySearch | null;
  searchHistory: AdvisorySearch[];
  startSearch: (profile: any) => AdvisorySearch;
  updateActiveSearch: (patch: Partial<AdvisorySearch>) => void;
  restoreSearch: (searchId: string) => void;
  deleteSearch: (searchId: string) => void;
  clearActiveSearch: () => void;
};

const AdvisoryContext = createContext<AdvisoryContextValue | undefined>(undefined);

const ACTIVE_SEARCH_KEY = 'arthniti-active-advisory-search';
const SEARCH_HISTORY_KEY = 'arthniti-advisory-search-history';
const MAX_HISTORY = 10;
const LEGACY_KEYS = [
  'arthniti-profile',
  'arthniti-discovery-results',
  'arthniti-discovery-meta',
  'arthniti-manual-observations',
  'arthniti-compared-businesses',
  'arthniti-comparison-result',
  'arthniti-selected-business',
  'arthniti-feasibility-report',
  'arthniti-financial-plan',
  'arthniti-scheme-matches',
];

const safeParse = <T,>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const safeSet = (storage: Storage, key: string, value: unknown) => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable or full; the in-memory session still remains usable.
  }
};

const syncLegacySession = (search: AdvisorySearch | null) => {
  if (typeof window === 'undefined') return;

  if (!search) {
    LEGACY_KEYS.forEach(key => window.sessionStorage.removeItem(key));
    return;
  }

  const { sessionStorage } = window;
  safeSet(sessionStorage, 'arthniti-profile', search.profile);
  if (search.discovery) {
    safeSet(sessionStorage, 'arthniti-discovery-results', search.discovery.results || []);
    safeSet(sessionStorage, 'arthniti-discovery-meta', search.discovery.meta || null);
    if (search.discovery.manualNote) safeSet(sessionStorage, 'arthniti-manual-observations', search.discovery.manualNote);
  }
  if (search.comparison) {
    safeSet(sessionStorage, 'arthniti-compared-businesses', search.comparison.businesses || []);
    if (search.comparison.result) safeSet(sessionStorage, 'arthniti-comparison-result', search.comparison.result);
  }
  if (search.selectedBusiness) safeSet(sessionStorage, 'arthniti-selected-business', search.selectedBusiness);
  if (search.feasibilityReport) safeSet(sessionStorage, 'arthniti-feasibility-report', search.feasibilityReport);
  if (search.financialPlan) {
    safeSet(sessionStorage, 'arthniti-financial-plan', search.financialPlan.plan || null);
    safeSet(sessionStorage, 'arthniti-scheme-matches', search.financialPlan.matches || []);
  }
};

const getInitialActiveSearch = (): AdvisorySearch | null => {
  if (typeof window === 'undefined') return null;

  const savedSearch = safeParse<AdvisorySearch>(window.localStorage.getItem(ACTIVE_SEARCH_KEY));
  if (savedSearch?.profile) return savedSearch;

  const legacyProfile = safeParse<any>(window.sessionStorage.getItem('arthniti-profile'));
  if (!legacyProfile) return null;

  const now = new Date().toISOString();
  return {
    id: `legacy-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    profile: legacyProfile,
    discovery: {
      results: safeParse<any[]>(window.sessionStorage.getItem('arthniti-discovery-results')) || [],
      meta: safeParse<any>(window.sessionStorage.getItem('arthniti-discovery-meta')),
      manualNote: window.sessionStorage.getItem('arthniti-manual-observations') || undefined,
    },
    comparison: {
      businesses: safeParse<any[]>(window.sessionStorage.getItem('arthniti-compared-businesses')) || [],
      result: safeParse<any>(window.sessionStorage.getItem('arthniti-comparison-result')),
    },
    selectedBusiness: safeParse<any>(window.sessionStorage.getItem('arthniti-selected-business')),
    feasibilityReport: safeParse<any>(window.sessionStorage.getItem('arthniti-feasibility-report')),
  };
};

const getInitialHistory = (): AdvisorySearch[] => {
  if (typeof window === 'undefined') return [];
  const history = safeParse<AdvisorySearch[]>(window.localStorage.getItem(SEARCH_HISTORY_KEY));
  return Array.isArray(history) ? history.slice(0, MAX_HISTORY) : [];
};

export const AdvisoryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeSearch, setActiveSearch] = useState<AdvisorySearch | null>(getInitialActiveSearch);
  const [searchHistory, setSearchHistory] = useState<AdvisorySearch[]>(getInitialHistory);

  const persistSearch = useCallback((search: AdvisorySearch) => {
    setActiveSearch(search);
    if (typeof window !== 'undefined') {
      safeSet(window.localStorage, ACTIVE_SEARCH_KEY, search);
      syncLegacySession(search);
    }
    setSearchHistory(previous => {
      const next = [search, ...previous.filter(item => item.id !== search.id)].slice(0, MAX_HISTORY);
      if (typeof window !== 'undefined') safeSet(window.localStorage, SEARCH_HISTORY_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!activeSearch) return;
    syncLegacySession(activeSearch);
    if (!searchHistory.some(search => search.id === activeSearch.id)) persistSearch(activeSearch);
  }, [activeSearch, searchHistory, persistSearch]);

  const startSearch = useCallback((profile: any) => {
    const now = new Date().toISOString();
    const search = {
      id: `advisory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
      profile,
    } satisfies AdvisorySearch;
    persistSearch(search);
    return search;
  }, [persistSearch]);

  const updateActiveSearch = useCallback((patch: Partial<AdvisorySearch>) => {
    if (!activeSearch) return;
    persistSearch({ ...activeSearch, ...patch, updatedAt: new Date().toISOString() });
  }, [activeSearch, persistSearch]);

  const restoreSearch = useCallback((searchId: string) => {
    const savedSearch = searchHistory.find(search => search.id === searchId);
    if (!savedSearch) return;
    persistSearch({ ...savedSearch, updatedAt: new Date().toISOString() });
  }, [searchHistory, persistSearch]);

  const deleteSearch = useCallback((searchId: string) => {
    const isActive = activeSearch?.id === searchId;
    setSearchHistory(previous => {
      const next = previous.filter(search => search.id !== searchId);
      if (typeof window !== 'undefined') safeSet(window.localStorage, SEARCH_HISTORY_KEY, next);
      return next;
    });

    if (isActive) {
      setActiveSearch(null);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(ACTIVE_SEARCH_KEY);
        syncLegacySession(null);
      }
    }
  }, [activeSearch]);

  const clearActiveSearch = useCallback(() => {
    setActiveSearch(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ACTIVE_SEARCH_KEY);
      syncLegacySession(null);
    }
  }, []);

  const value = useMemo(() => ({
    activeSearch,
    searchHistory,
    startSearch,
    updateActiveSearch,
    restoreSearch,
    deleteSearch,
    clearActiveSearch,
  }), [activeSearch, searchHistory, startSearch, updateActiveSearch, restoreSearch, deleteSearch, clearActiveSearch]);

  return <AdvisoryContext.Provider value={value}>{children}</AdvisoryContext.Provider>;
};

export const useAdvisory = (): AdvisoryContextValue => {
  const context = useContext(AdvisoryContext);
  if (!context) throw new Error('useAdvisory must be used within AdvisoryProvider');
  return context;
};
