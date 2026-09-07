import React, { useEffect, useRef, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX } from '../context/PredXContext';

const FAQS = [
  {
    q: 'How do I connect my Pera Wallet?',
    a: 'Click the "Connect" button in the top-right corner. Select Pera Wallet from the modal and scan the QR code using the Pera mobile app. Make sure you are on Algorand TestNet.',
  },
  {
    q: 'How does prediction betting work?',
    a: 'Browse markets, choose YES or NO on any question, and stake ALGO. If you predicted correctly when the market resolves, you earn proportional winnings from the pool.',
  },
  {
    q: 'What is the Trading Terminal?',
    a: 'The Trading Terminal lets you place buy/sell trades on Indian stocks (NSE/BSE) and crypto assets using ALGO with simulation pricing. It uses 1 ALGO = ₹10,000 for position sizing, routes buys into the trading bank app, and sends sell withdrawals back to your wallet via Pera-signed transactions.',
  },
  {
    q: 'Is real money involved?',
    a: 'No. Vyapar-Mitra runs entirely on Algorand TestNet. The ALGO used is test currency with no real-world value. You can get free TestNet ALGO from the Algorand faucet.',
  },
  {
    q: 'How do I get TestNet ALGO?',
    a: 'Visit https://bank.testnet.algorand.network/ and enter your wallet address. You\'ll receive free TestNet ALGO within seconds.',
  },
  {
    q: 'What is the AI Analyzer on the Dashboard?',
    a: 'The Vyapar-Mitra AI Core uses advanced neural models to analyze your portfolio, market sentiment, and provide optimized resource allocation suggestions in real-time.',
  },
  {
    q: 'Can I view my trade history?',
    a: 'Yes! Go to the Trading Terminal and click the "History" tab in the order panel. Each trade includes the transaction link for on-chain verification in Pera Explorer.',
  },
  {
    q: 'How do I claim winnings from prediction markets?',
    a: 'Navigate to the market in the Betting Terminal. If the market is resolved and you won, a "Claim Winnings" button will appear. Click it and sign the transaction in Pera.',
  },
];

const HELP_TOPICS = [
  {
    icon: 'account_balance_wallet',
    title: 'Wallet Setup',
    desc: 'Connect Pera Wallet, get TestNet ALGO',
    color: 'bg-blue-500/15 text-blue-400',
  },
  {
    icon: 'casino',
    title: 'Prediction Markets',
    desc: 'Place bets, claim winnings, track positions',
    color: 'bg-purple-500/15 text-purple-400',
  },
  {
    icon: 'candlestick_chart',
    title: 'Trading Terminal',
    desc: 'Buy/sell stocks & crypto with ALGO',
    color: 'bg-emerald-500/15 text-emerald-400',
  },
  {
    icon: 'smart_toy',
    title: 'AI Features',
    desc: 'Market analysis, resource allocation',
    color: 'bg-amber-500/15 text-amber-400',
  },
];

const Support: React.FC = () => {
  const { themeMode } = usePredX();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <DashboardLayout>
      <div className="pt-4 pb-12 px-4 md:px-6 max-w-[1400px] mx-auto">
        {/* ─── Header ──────────────────────────────────────── */}
        <header className="mb-8">
          <div className="bg-gradient-to-br from-surface-container-high via-surface-container to-surface-container-low p-8 md:p-12 rounded-2xl border border-primary-container/10 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-80 h-80 bg-primary-container/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3" />
            <div className="absolute left-10 bottom-0 w-48 h-48 bg-purple-500/5 rounded-full blur-[80px] translate-y-1/2" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary-container/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary-container text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-black font-headline text-on-surface tracking-tight leading-none">
                    Help & <span className="text-primary-container">Support</span>
                  </h1>
                  <p className="text-sm text-on-surface-variant mt-1">
                    Get instant answers with our AI assistant or browse help topics below
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ─── Main Grid ───────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ─── LEFT: Help Content ────────────────────────── */}
          <div className="lg:col-span-7 space-y-6">
            {/* Help Topics */}
            <div className="grid grid-cols-2 gap-3">
              {HELP_TOPICS.map((topic, i) => (
                <div
                  key={i}
                  className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-5 hover:border-primary-container/20 transition-all cursor-pointer group"
                >
                  <div className={`w-10 h-10 rounded-lg ${topic.color} flex items-center justify-center mb-3`}>
                    <span className="material-symbols-outlined text-lg">{topic.icon}</span>
                  </div>
                  <h3 className="text-sm font-bold text-on-surface group-hover:text-primary-container transition-colors mb-1">
                    {topic.title}
                  </h3>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">{topic.desc}</p>
                </div>
              ))}
            </div>

            {/* FAQ */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-outline-variant/10">
                <h2 className="text-sm font-bold font-headline text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary-container text-[18px]">help</span>
                  Frequently Asked Questions
                </h2>
              </div>
              <div className="divide-y divide-outline-variant/5">
                {FAQS.map((faq, i) => (
                  <div key={i}>
                    <button
                      className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-surface-container-highest/10 transition-colors"
                      onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    >
                      <span className="text-sm font-semibold text-on-surface">{faq.q}</span>
                      <span className={`material-symbols-outlined text-on-surface-variant text-[18px] transition-transform ${expandedFaq === i ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    </button>
                    {expandedFaq === i && (
                      <div className="px-5 pb-4 -mt-1">
                        <p className="text-sm text-on-surface-variant leading-relaxed bg-surface-container-highest/20 rounded-lg p-3">
                          {faq.a}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* System Status */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-5">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-emerald-400 text-[18px]">monitor_heart</span>
                System Status
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Algorand TestNet', status: 'Operational', ok: true },
                  { label: 'Binance API', status: 'Operational', ok: true },
                  { label: 'AI Services', status: 'Active', ok: true },
                  { label: 'Smart Contracts', status: 'Deployed', ok: true },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-2 bg-surface-container-highest/20 rounded-lg p-3">
                    <span className={`w-2 h-2 rounded-full ${s.ok ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                    <div>
                      <p className="text-[10px] text-on-surface-variant">{s.label}</p>
                      <p className="text-[11px] font-bold text-on-surface">{s.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── RIGHT: AI Chat Panel ──────────────────────── */}
          <div className="lg:col-span-5 space-y-6">
            {/* Live Chat Card */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-outline-variant/10 bg-gradient-to-r from-primary-container/5 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-container/10 flex items-center justify-center relative">
                    <span className="material-symbols-outlined text-primary-container text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-surface-container-low animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface">Vyapar-Mitra AI Assistant</h3>
                    <p className="text-[10px] text-primary-container font-bold">Powered by ElevenLabs · Online</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <p className="text-sm text-on-surface-variant mb-4 leading-relaxed">
                  Talk to our AI voice assistant for instant help. Ask about wallet setup, market predictions, trading features, or anything about Vyapar-Mitra.
                </p>

                {/* Feature Tags */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {['Voice Chat', 'Real-time', 'Platform Help', 'Trading Tips'].map(tag => (
                    <span key={tag} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface-variant">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Suggested Questions */}
                <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">Try asking:</h4>
                <div className="space-y-2 mb-5">
                  {[
                    'How do I place a prediction bet?',
                    'What markets are trending right now?',
                    'How does ALGO trading work?',
                    'Help me understand the leaderboard',
                  ].map((q, i) => (
                    <div key={i} className="flex items-center gap-2 bg-surface-container-highest/20 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-surface-container-highest/40 transition-colors group">
                      <span className="material-symbols-outlined text-[14px] text-primary-container">mic</span>
                      <span className="text-xs text-on-surface-variant group-hover:text-on-surface transition-colors">{q}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-surface-container-highest/30 rounded-lg p-4 text-center border border-outline-variant/5">
                  <span className="material-symbols-outlined text-3xl text-primary-container/50 mb-2 block">record_voice_over</span>
                  <p className="text-xs text-on-surface-variant">
                    Look for the <strong className="text-primary-container">floating chat widget</strong> in the bottom-right corner of the screen to start a voice conversation.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-5">
              <h3 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary-container">link</span>
                Quick Links
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'TestNet Faucet', url: 'https://bank.testnet.algorand.network/', icon: 'water_drop' },
                  { label: 'Pera Explorer', url: 'https://testnet.explorer.perawallet.app/', icon: 'explore' },
                  { label: 'Algorand Docs', url: 'https://developer.algorand.org/', icon: 'menu_book' },
                ].map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between bg-surface-container-highest/20 rounded-lg px-3 py-2.5 hover:bg-surface-container-highest/40 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">{link.icon}</span>
                      <span className="text-xs font-semibold text-on-surface">{link.label}</span>
                    </div>
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant group-hover:text-primary-container transition-colors">open_in_new</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Support;
