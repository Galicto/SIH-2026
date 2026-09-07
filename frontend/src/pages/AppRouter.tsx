import React, { useEffect } from 'react';
import { useWallet } from '@txnlab/use-wallet-react';
import { usePredX } from '../context/PredXContext';
import Home from './Home';
import Markets from './Markets';
import Leaderboard from './Leaderboard';
import BettingTerminal from './BettingTerminal';
import Settings from './Settings';
import MarketScreener from './MarketScreener';
import TradingTerminal from './TradingTerminal';
import Support from './Support';
// ── Finance pages (from src_ref) ──────────────────────────────────────────────
import Analysis from './Analysis';
import Education from './Education';
import Goals from './Goals';
import Transactions from './Transactions';
import WealthOverview from './WealthOverview';
// ── Arthniti pages ────────────────────────────────────────────────────────────
import BusinessAdvisory from './BusinessAdvisory';
import FeasibilityReport from './FeasibilityReport';
import FinancialPlan from './FinancialPlan';
import ArthnitiChat from './ArthnitiChat';
import BusinessComparison from './BusinessComparison';
import ExploreBusinesses from './ExploreBusinesses';
import LocalOpportunities from './LocalOpportunities';
import BankView from './BankView';

// Pages that can be accessed without a wallet (public pages)
const PUBLIC_PAGES = new Set(['home', 'markets', 'leaderboard', 'education', 'support']);

const AppRouter: React.FC = () => {
  const { currentPage, navigate } = usePredX();
  const { activeAddress } = useWallet();

  // ── Auto-redirect logic for login/logout ──
  useEffect(() => {
    if (!activeAddress && !PUBLIC_PAGES.has(currentPage)) {
      // Wallet disconnected while on a protected page → go to login
      navigate('home');
    }
  }, [activeAddress, currentPage, navigate]);

  // ── Guard: if no wallet and not on a public page, show Home (login) ──
  if (!activeAddress && !PUBLIC_PAGES.has(currentPage)) {
    return <Home />;
  }

  switch (currentPage) {
    // ── Existing PredX pages (untouched) ─────────────────────────────────────
    case 'home':
      return <Home />;
    case 'dashboard':
      // The old PredX wallet Dashboard is retired from the user flow; the
      // Feasibility Report is the entrepreneur's results hub.
      return <FeasibilityReport />;
    case 'bank':
      return <BankView />;
    case 'markets':
      return <Markets />;
    case 'leaderboard':
      return <Leaderboard />;
    case 'terminal':
      return <BettingTerminal />;
    case 'settings':
      return <Settings />;
    case 'screener':
      return <MarketScreener />;
    case 'trade':
      return <TradingTerminal />;
    case 'support':
      return <Support />;
    // ── Finance pages ─────────────────────────────────────────────────────────
    case 'analysis':
      return <Analysis />;
    case 'wealth':
      return <WealthOverview />;
    case 'education':
      return <Education />;
    case 'goals':
      return <Goals />;
    case 'transactions':
      return <Transactions />;
    // ── Arthniti pages ────────────────────────────────────────────────────────
    case 'advisory':
      return <BusinessAdvisory />;
    case 'opportunities':
      return <LocalOpportunities />;
    case 'feasibility':
      return <FeasibilityReport />;
    case 'financial-plan':
      return <FinancialPlan />;
    case 'arthniti-chat':
      return <ArthnitiChat />;
    case 'compare':
      return <BusinessComparison />;
    case 'explore':
      return <ExploreBusinesses />;
    default:
      return <Home />;
  }
};

export default AppRouter;

