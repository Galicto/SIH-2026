import React, { useState, useMemo } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX, Market } from '../context/PredXContext';
import { useOraclePrice } from '../hooks/useOraclePrice';

type ViewMode = 'grid' | 'table';

const Markets: React.FC = () => {
  const { markets, navigate, refreshMarketsOnce, marketsRefreshing } = usePredX();
  const { algoPrice } = useOraclePrice();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const categoryOptions = useMemo(() => {
    const categories = new Set(markets.map(m => m.category).filter(Boolean));
    return ['All', ...Array.from(categories).sort((a, b) => a.localeCompare(b))];
  }, [markets]);

  // Top 3 trending categories by current market volume
  const trendingCategories = useMemo(() => {
    const categoryStats = new Map<string, { volume: number; count: number }>();

    for (const market of markets) {
      const current = categoryStats.get(market.category) ?? { volume: 0, count: 0 };
      categoryStats.set(market.category, {
        volume: current.volume + market.volume,
        count: current.count + 1,
      });
    }

    return Array.from(categoryStats.entries())
      .sort((a, b) => {
        if (b[1].volume !== a[1].volume) return b[1].volume - a[1].volume;
        if (b[1].count !== a[1].count) return b[1].count - a[1].count;
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 3)
      .map(([category]) => category);
  }, [markets]);

  // Filter markets
  const filteredMarkets = useMemo(() => {
    return markets.filter(m => {
      const matchesCat = selectedCategory === 'All' || m.category === selectedCategory;
      const matchesSearch = m.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [markets, selectedCategory, searchQuery]);

  return (
    <DashboardLayout>
      <div className="px-6 pb-12">
        {/* Price Ticker / Top Stats */}
        <section className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-container-low p-4 rounded-xl border border-primary-container/10 flex items-center justify-between group hover:border-primary-container/40 transition-all duration-500">
            <div>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-black mb-1 opacity-60">Showcase Price</p>
              <h3 className="text-xl font-headline font-black text-on-surface">1 ALGO</h3>
            </div>
            <div className="text-right">
              <div className="text-xl font-headline font-black text-primary-container animate-pulse">₹10,000</div>
              <p className="text-[10px] text-on-surface-variant font-bold">≈ ${algoPrice?.toFixed(2) ?? '...'} USD</p>
            </div>
          </div>
          
          <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex items-center gap-4">
             <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
               <span className="material-symbols-outlined text-primary-container">trending_up</span>
             </div>
             <div>
               <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-black opacity-60">Market Health</p>
               <p className="text-sm font-bold text-on-surface">Optimistic Alpha</p>
             </div>
          </div>

          <div className="hidden lg:flex bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 items-center gap-4">
             <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
               <span className="material-symbols-outlined text-primary-container">database</span>
             </div>
             <div>
               <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-black opacity-60">Indexed Markets</p>
               <p className="text-sm font-bold text-on-surface">{markets.length} Liquidity Pools</p>
             </div>
          </div>

          <div className="hidden lg:flex bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 items-center gap-4">
             <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
               <span className="material-symbols-outlined text-primary-container">shield_check</span>
             </div>
             <div>
               <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-black opacity-60">Protocol Status</p>
               <p className="text-sm font-bold text-on-surface">Secure Settlement</p>
             </div>
          </div>
        </section>

        {/* Header Section */}
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-black font-headline text-on-surface tracking-tight leading-none mb-4">
              Market <span className="text-primary-container">Screener</span>
            </h1>
            <p className="text-on-surface-variant text-lg font-body leading-relaxed">
              Live prediction markets powered by Polymarket data, settled on the Algorand TestNet.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              className="px-4 py-2 rounded-lg text-sm font-bold bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors flex items-center gap-1.5 disabled:opacity-60"
              onClick={() => void refreshMarketsOnce()}
              disabled={marketsRefreshing}
            >
              <span className={`material-symbols-outlined text-sm ${marketsRefreshing ? 'animate-spin' : ''}`}>
                {marketsRefreshing ? 'progress_activity' : 'refresh'}
              </span>
              {marketsRefreshing ? 'Refreshing...' : 'Refresh All'}
            </button>
            {/* Grid / Table Toggle */}
            <div className="bg-surface-container-low p-1 rounded-xl flex">
              <button 
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${viewMode === 'grid' ? 'bg-surface-container-highest text-primary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => setViewMode('grid')}
              >Grid</button>
              <button 
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${viewMode === 'table' ? 'bg-surface-container-highest text-primary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => setViewMode('table')}
              >Table</button>
            </div>
          </div>
        </header>

        {/* Filters Bar */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-sm">search</span>
            <input 
              className="w-full bg-surface-container-low border border-outline-variant/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary-container/40 focus:outline-none font-label text-on-surface placeholder:text-on-surface-variant/40"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {/* Trending + Generic Category Filter */}
          <div className="flex flex-wrap gap-2 items-center">
            {trendingCategories.map(cat => (
              <button
                key={cat}
                className={`px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all ${
                  selectedCategory === cat 
                    ? 'bg-primary-container text-on-primary' 
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="appearance-none bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high px-4 py-2 pr-9 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all border border-outline-variant/10 focus:outline-none focus:ring-1 focus:ring-primary-container/40"
              >
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant pointer-events-none">
                expand_more
              </span>
            </div>
          </div>
        </div>

        {/* Live Status Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-[11px] font-bold text-on-surface-variant">
            <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
            {filteredMarkets.length} Markets Active
          </div>
          {algoPrice && (
            <div className="text-xs text-on-surface-variant">
              ALGO/USD: <span className="text-primary-container font-bold">${algoPrice.toFixed(4)}</span>
            </div>
          )}
        </div>

        {/* GRID VIEW */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredMarkets.map((market: Market) => (
              <div 
                key={market.id} 
                className="bg-surface-container p-5 rounded-lg border border-outline-variant/10 hover:border-primary-container/30 transition-all duration-300 cursor-pointer group"
                onClick={() => navigate('terminal', { marketId: market.id })}
              >
                <div className="flex items-start justify-between mb-4">
                  <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded uppercase tracking-wider">
                    {market.category}
                  </span>
                  <span className="text-[10px] font-bold text-on-surface-variant opacity-60">
                    {market.volume >= 1000 ? `$${(market.volume / 1000).toFixed(1)}K` : `${market.volume.toFixed(2)} ALGO`}
                  </span>
                </div>
                <h4 className="font-headline font-bold text-on-surface mb-4 line-clamp-2 h-12 group-hover:text-primary-container transition-colors">{market.title}</h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-[11px] font-bold mb-1.5">
                      <span className="text-primary-container">{market.optionA || 'YES'} {market.probabilityYes}%</span>
                      <span className="text-on-surface-variant">{market.optionB || 'NO'} {market.probabilityNo}%</span>
                    </div>
                    <div className="flex h-1.5 w-full bg-surface-container-lowest rounded-full overflow-hidden">
                      <div className="bg-primary-container" style={{ width: `${market.probabilityYes}%` }}></div>
                      <div className="bg-surface-container-highest" style={{ width: `${market.probabilityNo}%` }}></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[10px] text-on-surface-variant">Ends {market.endDate}</span>
                    <button className="bg-surface-container-highest hover:bg-primary-container hover:text-on-primary transition-all px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                      Trade
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-surface-container-highest/30 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/10">
              <div className="col-span-5">Market</div>
              <div className="col-span-2 text-center">Category</div>
              <div className="col-span-2 text-center">Probability</div>
              <div className="col-span-1 text-center">Volume</div>
              <div className="col-span-1 text-center">Ends</div>
              <div className="col-span-1 text-center"></div>
            </div>
            {/* Table Rows */}
            {filteredMarkets.map((market: Market) => (
              <div
                key={market.id}
                className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-outline-variant/5 last:border-b-0 hover:bg-surface-container-highest/10 transition-colors cursor-pointer items-center"
                onClick={() => navigate('terminal', { marketId: market.id })}
              >
                <div className="col-span-5">
                  <p className="font-bold text-sm text-on-surface line-clamp-1">{market.title}</p>
                </div>
                <div className="col-span-2 text-center">
                  <span className="text-[10px] font-bold bg-surface-container-highest px-2 py-0.5 rounded uppercase tracking-wider text-on-surface-variant">
                    {market.category}
                  </span>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2 justify-center">
                    <span className="text-xs font-bold text-primary-container">{market.probabilityYes}%</span>
                    <div className="flex h-1.5 w-16 bg-surface-container-lowest rounded-full overflow-hidden">
                      <div className="bg-primary-container" style={{ width: `${market.probabilityYes}%` }}></div>
                    </div>
                    <span className="text-xs font-bold text-on-surface-variant">{market.probabilityNo}%</span>
                  </div>
                </div>
                <div className="col-span-1 text-center">
                  <span className="text-xs font-bold text-on-surface">
                    {market.volume >= 1000 ? `$${(market.volume / 1000).toFixed(1)}K` : `${market.volume.toFixed(1)}`}
                  </span>
                </div>
                <div className="col-span-1 text-center">
                  <span className="text-[10px] text-on-surface-variant">{market.endDate}</span>
                </div>
                <div className="col-span-1 text-center">
                  <button className="bg-surface-container-highest hover:bg-primary-container hover:text-on-primary transition-all px-3 py-1 rounded-full text-[10px] font-black uppercase">
                    Trade
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading State */}
        {marketsRefreshing && filteredMarkets.length === 0 && (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-5xl text-primary-container animate-spin mb-4">progress_activity</span>
            <h3 className="font-headline font-bold text-lg text-on-surface mb-2">Loading Markets...</h3>
            <p className="text-sm text-on-surface-variant">Fetching live prediction markets from Algorand TestNet.</p>
          </div>
        )}

        {/* Initial fetch state - markets may still be loading on first render */}
        {!marketsRefreshing && filteredMarkets.length === 0 && markets.length === 0 && (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-5xl text-primary-container animate-pulse mb-4">download</span>
            <h3 className="font-headline font-bold text-lg text-on-surface mb-2">Syncing with Algorand...</h3>
            <p className="text-sm text-on-surface-variant mb-4">Fetching prediction markets from the blockchain. This may take up to 30 seconds.</p>
            <button
              className="px-6 py-2.5 rounded-lg text-sm font-bold bg-primary-container text-on-primary hover:bg-primary-container/90 transition-colors"
              onClick={() => void refreshMarketsOnce()}
            >
              Refresh Now
            </button>
          </div>
        )}

        {/* Empty State - only when markets exist but filter returns nothing */}
        {!marketsRefreshing && filteredMarkets.length === 0 && markets.length > 0 && (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4">search_off</span>
            <h3 className="font-headline font-bold text-lg text-on-surface mb-2">No Markets Found</h3>
            <p className="text-sm text-on-surface-variant">Try adjusting your filters or search query.</p>
          </div>
        )}

        {/* Stats Footer */}
        <footer className="mt-20 border-t border-outline-variant/10 pt-8 flex flex-wrap gap-8 justify-between opacity-80">
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Total Volume</p>
              <p className="text-xl font-headline font-bold">
                {markets.reduce((sum, m) => sum + m.volume, 0).toFixed(2)} ALGO
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">Active Markets</p>
              <p className="text-xl font-headline font-bold">{markets.length}</p>
            </div>
            {algoPrice && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-1">ALGO Price</p>
                <p className="text-xl font-headline font-bold text-primary-container">${algoPrice.toFixed(4)}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 bg-primary-container/10 text-primary-container text-[11px] font-bold rounded-full">Algorand TestNet</span>
            <span className="text-on-surface-variant text-xs">© 2024 Vyapar-Mitra Terminal</span>
          </div>
        </footer>
      </div>
    </DashboardLayout>
  );
};

export default Markets;
