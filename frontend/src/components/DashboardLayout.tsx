import React, { useState, useEffect } from 'react';
import { useWallet } from '@txnlab/use-wallet-react';
import { ellipseAddress } from '../utils/ellipseAddress';
import { usePredX } from '../context/PredXContext';
import ConnectWallet from './ConnectWallet';
import { useLanguage } from '../lib/i18n';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { activeAddress } = useWallet();
  const { currentPage, navigate, themeMode, setThemeMode } = usePredX();
  const [openWalletModal, setOpenWalletModal] = useState<boolean>(false);
  const { t, toggleLang } = useLanguage();

  const toggleWalletModal = () => setOpenWalletModal(!openWalletModal);

  const isConnected = !!activeAddress;

  // Prevent auto-open wallet on advisory routes
  useEffect(() => {
    if (['advisory', 'feasibility', 'financial-plan', 'arthniti-chat', 'compare'].includes(currentPage)) {
      setOpenWalletModal(false);
    }
  }, [currentPage]);

  const navItems = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', fill: true },
  ];

  const arthnitiItems = [
    { id: 'advisory', label: t('nav.advisory'), icon: 'business_center' },
    { id: 'opportunities', label: 'Local Opportunities', icon: 'work' },
    { id: 'compare', label: t('nav.compare'), icon: 'compare_arrows' },
    { id: 'feasibility', label: t('nav.feasibility'), icon: 'assessment' },
    { id: 'financial-plan', label: t('nav.financialPlan'), icon: 'calculate' },
    { id: 'arthniti-chat', label: t('nav.chat'), icon: 'smart_toy' },
  ];

  const tradingItems = [
    { id: 'markets', label: 'Markets', icon: 'insert_chart' },
    { id: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
    { id: 'screener', label: 'Screener', icon: 'query_stats' },
    { id: 'trade', label: 'Trade', icon: 'candlestick_chart' },
  ];

  const financeItems = [
    { id: 'analysis',     label: 'Analysis',     icon: 'analytics' },
    { id: 'goals',        label: 'Goals',        icon: 'flag' },
    { id: 'education',    label: 'Education',    icon: 'school' },
  ];

  const topBarClass =
    themeMode === 'light'
      ? 'bg-background/90 border-b border-outline-variant/20 shadow-[0_20px_40px_rgba(255,90,0,0.08)]'
      : 'bg-[#0D0D0F]/60 shadow-[0_20px_40px_rgba(0,0,0,0.5)] border-b border-on-surface/5';

  const sideBarClass =
    themeMode === 'light'
      ? 'bg-gradient-to-b from-on-surface/80 to-on-surface/60 backdrop-blur-2xl border-r border-outline-variant/20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]'
      : 'bg-gradient-to-b from-[#121215]/80 to-[#0A0A0C]/90 backdrop-blur-2xl border-r border-on-surface/5 shadow-[4px_0_24px_rgba(0,0,0,0.4)]';

  const sideItemActiveClass =
    themeMode === 'light'
      ? 'flex items-center gap-3 bg-gradient-to-r from-[#FF5A00]/15 to-[#FF8C00]/5 text-[#FF5A00] rounded-xl mx-3 px-4 py-3 font-body text-sm font-bold cursor-pointer relative border border-[#FF5A00]/20 shadow-[0_2px_10px_rgba(255,90,0,0.1)]'
      : 'flex items-center gap-3 text-on-surface rounded-xl mx-3 px-4 py-3 font-body text-sm font-bold cursor-pointer relative bg-gradient-to-r from-[#FF5A00]/20 to-[#FF8C00]/5 border border-[#FF5A00]/30 shadow-[0_4px_20px_rgba(255,90,0,0.15)] backdrop-blur-md transition-all';

  const sideItemClass =
    themeMode === 'light'
      ? 'flex items-center gap-3 text-on-surface-variant mx-3 px-4 py-3 hover:bg-black/5 hover:text-on-surface transition-all duration-300 font-body text-sm font-semibold rounded-xl cursor-pointer'
      : 'flex items-center gap-3 text-[#e0e2ea]/50 mx-3 px-4 py-3 hover:bg-on-surface/5 hover:text-[#e0e2ea] transition-all duration-300 font-body text-sm font-semibold rounded-xl cursor-pointer';

  /* ─── LOGGED-OUT: render only a minimal transparent header ─── */
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-transparent text-on-surface">
        {/* Minimal transparent header — brand + connect only */}
        <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 md:px-10 h-16 md:h-20 bg-transparent">
          <div
            className="flex items-center cursor-pointer group px-1 py-1 rounded-xl transition-all duration-300"
            onClick={() => navigate('home')}
          >
            <img src="/logo-transparent.png" alt="Arthniti Logo" className={`h-9 w-9 object-contain group-hover:scale-105 transition-transform ${themeMode === 'light' ? '' : 'drop-shadow-[0_0_12px_rgba(255,255,255,0.2)]'}`} />
            <span className={`font-headline font-black text-[22px] tracking-tighter ml-3 bg-clip-text text-transparent bg-gradient-to-r ${themeMode === 'light' ? 'from-gray-900 via-gray-700 to-gray-500' : 'from-white via-[#e0e8e4] to-[#8a9e92]'}`}>Arthniti</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setThemeMode(themeMode === 'light' ? 'dark' : 'light')}
              className="w-10 h-10 rounded-full bg-on-surface/10 border border-on-surface/20 flex items-center justify-center text-on-surface/70 hover:bg-on-surface/20 hover:text-on-surface transition-colors backdrop-blur-md"
            >
              <span className="material-symbols-outlined text-[20px]">{themeMode === 'light' ? 'dark_mode' : 'light_mode'}</span>
            </button>
            <button
              className="arthniti-connect-btn"
              onClick={toggleWalletModal}
            >
              Connect
            </button>
          </div>
        </header>

        {/* Content (the Home page login gateway) */}
        <div className="pt-0">
          {children}
        </div>

        {/* Connect Wallet Modal globally available */}
        <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
      </div>
    );
  }

  /* ─── LOGGED-IN: full dashboard layout (unchanged logic) ─── */
  return (
    <div className="min-h-screen bg-background text-on-surface">
      {/* TopAppBar */}
      <header className={`fixed top-0 w-full z-50 flex justify-between items-center px-6 md:px-8 h-16 md:h-20 backdrop-blur-xl ${topBarClass}`}>
        <div className="flex items-center gap-6 md:gap-12">
          <div 
            className="flex items-center cursor-pointer group px-1 py-1 rounded-xl transition-all duration-300"
            onClick={() => navigate('home')}
          >
            <img src="/logo-transparent.png" alt="Arthniti Logo" className={`h-8 w-8 object-contain mr-3 group-hover:scale-105 transition-transform ${themeMode === 'light' ? '' : 'drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]'}`} />
            <span className="font-headline font-black text-xl tracking-wide text-on-surface uppercase">Arthniti</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={`hidden lg:flex items-center backdrop-blur-md px-4 py-2.5 rounded-xl border transition-all focus-within:border-[#FF5A00]/50 ${themeMode === 'light' ? 'bg-surface-container border-outline-variant/30 focus-within:bg-surface-container-high' : 'bg-on-surface/5 border-on-surface/10 focus-within:bg-on-surface/10'}`}>
            <span className="material-symbols-outlined text-on-surface-variant text-[18px] mr-2">search</span>
            <input className="bg-transparent border-none focus:ring-0 focus:outline-none text-sm w-56 text-on-surface font-body placeholder:text-on-surface-variant/50" placeholder="Search markets, assets, events..." type="text" />
          </div>
          
          {activeAddress && (
            <div className={`hidden sm:flex items-center backdrop-blur-md px-4 py-2.5 rounded-xl border gap-2 ${themeMode === 'light' ? 'bg-surface-container border-outline-variant/30' : 'bg-on-surface/5 border-on-surface/10'}`}>
              <div className="w-1.5 h-1.5 rounded-full bg-[#00FF66] pulse-dot shadow-[0_0_8px_#00FF66]"></div>
              <span className="text-on-surface-variant text-xs font-body font-semibold">WALLET CONNECTED <span className="text-on-surface ml-1">[{ellipseAddress(activeAddress, 4)}]</span></span>
            </div>
          )}
          
          <button
            onClick={toggleLang}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all backdrop-blur-md ${themeMode === 'light' ? 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface' : 'bg-on-surface/5 border-on-surface/10 text-on-surface/70 hover:bg-on-surface/10 hover:border-on-surface/20 hover:text-on-surface'}`}
            title="Switch Language"
          >
            <span className="material-symbols-outlined text-[20px]">translate</span>
          </button>
          <button 
            onClick={() => setThemeMode(themeMode === 'light' ? 'dark' : 'light')}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all backdrop-blur-md ${themeMode === 'light' ? 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface' : 'bg-on-surface/5 border-on-surface/10 text-on-surface/70 hover:bg-on-surface/10 hover:border-on-surface/20 hover:text-on-surface'}`}
          >
            <span className="material-symbols-outlined text-[20px]">{themeMode === 'light' ? 'dark_mode' : 'light_mode'}</span>
          </button>
          
          <button
            className="bg-gradient-to-r from-[#FF6B00] to-[#FF8C00] text-on-surface font-body font-bold px-5 md:px-6 py-2.5 rounded-xl scale-95 active:scale-90 transition-transform hover:shadow-[0_0_20px_rgba(255,107,0,0.4)] text-xs uppercase tracking-wider"
            onClick={toggleWalletModal}
          >
            {activeAddress ? 'Connected' : 'Connect Wallet'}
          </button>
        </div>
      </header>

      {/* SideNavBar */}
      <aside className={`fixed left-0 top-16 md:top-20 h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] w-64 hidden lg:flex flex-col py-6 gap-2 font-body font-semibold text-sm ${sideBarClass} overflow-y-auto custom-scrollbar`}>
        
        <div className="space-y-1">
          <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold opacity-50">Navigation</div>
          
            {navItems.map(item => (
              <a 
                key={item.id}
                className={currentPage === item.id
                  ? sideItemActiveClass
                  : sideItemClass
                }
                onClick={() => navigate(item.id)}
              >
              <span className="material-symbols-outlined" style={item.fill && currentPage === item.id ? { fontVariationSettings: "'FILL' 1" } : {}}>
                {item.icon}
              </span> 
              {item.label}
            </a>
          ))}
        </div>

        {/* Arthniti Section */}
        <div className="space-y-1 mt-4">
          <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold opacity-50">{t('nav.arthniti')}</div>
          {arthnitiItems.map(item => (
            <a
              key={item.id}
              className={currentPage === item.id
                ? sideItemActiveClass
                : sideItemClass
              }
              onClick={() => navigate(item.id)}
            >
              <span className="material-symbols-outlined" style={currentPage === item.id ? { fontVariationSettings: "'FILL' 1" } : {}}>
                {item.icon}
              </span>
              {item.label}
            </a>
          ))}
        </div>

        {/* Finance Section */}
        <div className="space-y-1 mt-4">
          <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold opacity-50">Finance</div>
          {financeItems.map(item => (
            <a
              key={item.id}
              className={currentPage === item.id
                ? sideItemActiveClass
                : sideItemClass
              }
              onClick={() => navigate(item.id)}
            >
              <span className="material-symbols-outlined" style={currentPage === item.id ? { fontVariationSettings: "'FILL' 1" } : {}}>
                {item.icon}
              </span>
              {item.label}
            </a>
          ))}
        </div>


        <div className="mt-auto space-y-1 pt-4">
          <a 
            className={currentPage === 'settings'
              ? sideItemActiveClass
              : sideItemClass
            }
            onClick={() => navigate('settings')}
          >
            <span className="material-symbols-outlined" style={currentPage === 'settings' ? { fontVariationSettings: "'FILL' 1" } : {}}>
              settings
            </span> 
            Settings
          </a>
          <a
            className={currentPage === 'support'
              ? sideItemActiveClass
              : sideItemClass
            }
            onClick={() => navigate('support')}
          >
            <span className="material-symbols-outlined" style={currentPage === 'support' ? { fontVariationSettings: "'FILL' 1" } : {}}>
              support_agent
            </span>
            Support
          </a>
        </div>

        {/* Premium Upgrade Card */}
        <div className="mt-8 mx-4 mb-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#2A1510] to-[#1A0A05] border border-on-surface/5 p-5 text-center shadow-[0_10px_30px_rgba(255,90,0,0.15)] group cursor-pointer">
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-[#FF5A00] rounded-full blur-[40px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-[#FF8C00] rounded-full blur-[40px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
            
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#FF3300] to-[#FF8C00] flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(255,90,0,0.5)]">
                <span className="material-symbols-outlined text-on-surface">diamond</span>
              </div>
              <h4 className="text-on-surface font-headline font-bold text-sm mb-1 uppercase tracking-wide">Premium Upgrade</h4>
              <p className="text-on-surface/60 text-[10px] leading-tight mb-4 font-body">Unlock Pro Features.<br/>Gain Edge Today.</p>
              <button className="bg-on-surface/10 hover:bg-on-surface/20 text-on-surface border border-on-surface/10 rounded-xl px-4 py-2 text-xs font-bold transition-colors w-full">
                Upgrade Now
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="lg:ml-64 pt-16 md:pt-20">
        {children}
      </div>

      {/* Mobile NavBar */}
      <nav className={`md:hidden fixed bottom-0 w-full backdrop-blur-xl border-t border-outline-variant/10 flex justify-around items-center py-3 z-50 ${themeMode === 'light' ? 'bg-background/95' : 'bg-[#101419]/95'}`}>
        {[...navItems, { id: 'screener', label: 'Trade', icon: 'candlestick_chart' }].map(item => (
          <a 
            key={item.id}
            className={`flex flex-col items-center gap-1 cursor-pointer ${currentPage === item.id || (item.id === 'screener' && currentPage === 'trade') ? 'text-primary-container' : 'text-on-surface-variant'}`}
            onClick={() => navigate(item.id)}
          >
            <span className="material-symbols-outlined" style={(currentPage === item.id || (item.id === 'screener' && currentPage === 'trade')) ? { fontVariationSettings: "'FILL' 1" } : {}}>
              {item.icon}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">{item.id === 'dashboard' ? 'Dash' : item.label}</span>
          </a>
        ))}
      </nav>

      {/* Connect Wallet Modal globally available */}
      <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
    </div>
  );
};

export default DashboardLayout;
