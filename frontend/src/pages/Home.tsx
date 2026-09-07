import { useWallet } from '@txnlab/use-wallet-react'
import React, { useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import ConnectWallet from '../components/ConnectWallet'
import CinematicBackground from '../components/CinematicBackground'
import { usePredX } from '../context/PredXContext'
import { ellipseAddress } from '../utils/ellipseAddress'

const Home: React.FC = () => {
  const { activeAddress } = useWallet()
  const { navigate } = usePredX()
  const [openWalletModal, setOpenWalletModal] = useState<boolean>(false)

  const toggleWalletModal = () => setOpenWalletModal(!openWalletModal)

  /* ─── LOGGED-OUT: Premium Login Gateway ─── */
  if (!activeAddress) {
    return (
      <DashboardLayout>
        {/* Cinematic animated background */}
        <CinematicBackground onSplineClick={toggleWalletModal} />
        
        {/* Full-screen login gateway */}
        <div className="arthniti-gateway">
          {/* Login panel */}
          <div className="arthniti-login-panel">
            {/* Brand identity */}
            <div className="arthniti-login-brand">
              <img
                src="/logo-transparent.png"
                alt="Vyapar-Mitra"
                className="arthniti-login-logo"
              />
              <h1 className="arthniti-login-title">Vyapar-Mitra</h1>
            </div>

            {/* Decorative separator */}
            <div className="arthniti-login-separator">
              <div className="arthniti-login-separator-line"></div>
              <div className="arthniti-login-separator-diamond"></div>
              <div className="arthniti-login-separator-line"></div>
            </div>

            {/* Tagline */}
            <p className="arthniti-login-tagline">
              Private market intelligence begins here.
            </p>

            {/* Connect CTA */}
            <button
              className="arthniti-login-cta"
              onClick={toggleWalletModal}
            >
              <span className="arthniti-login-cta-icon material-symbols-outlined">account_balance_wallet</span>
              <span>Connect Wallet</span>
            </button>

            {/* Subtle network indicator */}
            <div className="arthniti-login-network">
              <div className="arthniti-login-network-dot"></div>
              <span>Algorand TestNet</span>
            </div>
          </div>



        </div>

        <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
      </DashboardLayout>
    )
  }


  /* ─── LOGGED-IN: Arthniti Welcome Dashboard ─── */
  return (
    <DashboardLayout>
      <div className="px-4 md:px-8 pb-12 md:pb-8 pt-4">
        {/* Welcome Section */}
        <section className="mb-8">
          <div className="bg-gradient-to-br from-[#FF5A00]/10 to-on-surface/5 backdrop-blur-xl p-6 md:p-10 rounded-3xl border border-[#FF5A00]/20 relative overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
            <div className="absolute right-0 top-0 w-96 h-96 bg-gradient-to-bl from-[#FF5A00]/15 to-transparent rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3"></div>
            
            <h1 className="text-3xl md:text-5xl font-headline font-bold text-on-surface mb-2 relative z-10">
              Welcome to Vyapar-Mitra.
            </h1>
            <p className="text-on-surface/60 max-w-xl text-sm md:text-base relative z-10 font-body">
              Connected as <span className="text-[#FF5A00] font-semibold">{ellipseAddress(activeAddress, 6)}</span>. AI-powered business advisory and financial planning for rural micro-entrepreneurs.
            </p>
          </div>
        </section>

        {/* Quick Stats */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
          {/* Business Advisory */}
          <div className="bg-on-surface/5 backdrop-blur-xl p-6 rounded-2xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)] group hover:border-on-surface/20 transition-colors cursor-pointer"
            onClick={() => navigate('advisory')}
          >
            <div className="flex justify-between items-start relative z-10">
              <span className="text-on-surface/50 font-body text-xs uppercase tracking-widest font-semibold">Business Advisory</span>
              <div className="bg-[#FF5A00]/10 border border-[#FF5A00]/20 p-1.5 rounded-lg text-[#FF5A00]"><span className="material-symbols-outlined text-[16px]">business_center</span></div>
            </div>
            <div className="text-2xl font-headline font-bold text-on-surface mt-3 relative z-10">Start Here</div>
            <div className="text-xs text-on-surface/40 mt-2 relative z-10 font-body">Get your feasibility report</div>
          </div>

          <div className="bg-on-surface/5 backdrop-blur-xl p-6 rounded-2xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)] group hover:border-on-surface/20 transition-colors cursor-pointer"
            onClick={() => navigate('feasibility')}
          >
            <div className="flex justify-between items-start relative z-10">
              <span className="text-on-surface/50 font-body text-xs uppercase tracking-widest font-semibold">Feasibility</span>
              <div className="bg-on-surface/5 backdrop-blur-md border border-on-surface/10 p-1.5 rounded-lg text-on-surface/40"><span className="material-symbols-outlined text-[16px]">assessment</span></div>
            </div>
            <div className="text-2xl font-headline font-bold text-on-surface mt-3 relative z-10">Reports</div>
            <div className="text-xs text-on-surface/40 mt-2 relative z-10 font-body">View your generated reports</div>
          </div>

          <div className="bg-on-surface/5 backdrop-blur-xl p-6 rounded-2xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)] group hover:border-on-surface/20 transition-colors cursor-pointer"
            onClick={() => navigate('arthniti-chat')}
          >
            <div className="flex justify-between items-start relative z-10">
              <span className="text-on-surface/50 font-body text-xs uppercase tracking-widest font-semibold">AI Assistant</span>
              <div className="bg-on-surface/5 backdrop-blur-md border border-on-surface/10 p-1.5 rounded-lg text-on-surface/40"><span className="material-symbols-outlined text-[16px]">smart_toy</span></div>
            </div>
            <div className="text-2xl font-headline font-bold text-on-surface mt-3 relative z-10">Chat</div>
            <div className="text-xs text-on-surface/40 mt-2 relative z-10 font-body">Ask about schemes & EMI</div>
          </div>
        </section>

        {/* Primary CTA Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8">
          <div 
            className="bg-gradient-to-br from-[#FF5A00]/20 to-on-surface/5 backdrop-blur-xl p-6 md:p-8 rounded-2xl flex justify-between items-center cursor-pointer group border border-[#FF5A00]/40 hover:border-[#FF5A00]/80 hover:shadow-[0_0_30px_rgba(255,90,0,0.2)] transition-all"
            onClick={() => navigate('advisory')}
          >
            <div>
              <h3 className="font-headline font-bold text-on-surface text-xl md:text-2xl">Start Business Advisory</h3>
              <p className="text-on-surface/70 font-body text-sm mt-1">Get AI-powered feasibility analysis and financial planning</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-[#FF5A00] flex items-center justify-center text-white shadow-[0_4px_15px_rgba(255,90,0,0.5)] group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined">arrow_forward</span>
            </div>
          </div>
          <div 
            className="bg-on-surface/5 backdrop-blur-xl p-6 md:p-8 rounded-2xl flex justify-between items-center cursor-pointer group border border-on-surface/10 hover:border-on-surface/30 transition-all"
            onClick={() => navigate('financial-plan')}
          >
            <div>
              <h3 className="font-headline font-bold text-on-surface text-xl md:text-2xl">Financial Calculator</h3>
              <p className="text-on-surface/60 font-body text-sm mt-1">View your loan scheme, EMI, and repayment plan</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-on-surface/10 border border-on-surface/20 flex items-center justify-center text-on-surface/70 group-hover:bg-on-surface/20 group-hover:text-on-surface transition-colors">
              <span className="material-symbols-outlined">arrow_forward</span>
            </div>
          </div>
        </section>

        {/* Info Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-on-surface/5 backdrop-blur-xl p-6 rounded-2xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-emerald-400">savings</span>
            </div>
            <h4 className="font-headline font-bold text-on-surface text-sm mb-2">10% Margin Model</h4>
            <p className="text-on-surface/50 text-xs font-body leading-relaxed">You provide 10% of project cost as margin capital. The remaining 90% is covered by government-backed loan schemes.</p>
          </div>
          <div className="bg-on-surface/5 backdrop-blur-xl p-6 rounded-2xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-blue-400">verified</span>
            </div>
            <h4 className="font-headline font-bold text-on-surface text-sm mb-2">Two Scheme Options</h4>
            <p className="text-on-surface/50 text-xs font-body leading-relaxed">Micro Finance (up to ₹1.4L at 6.5%) and Term Loan (up to ₹50L at 8%). The system auto-routes based on your project cost.</p>
          </div>
          <div className="bg-on-surface/5 backdrop-blur-xl p-6 rounded-2xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-purple-400">auto_awesome</span>
            </div>
            <h4 className="font-headline font-bold text-on-surface text-sm mb-2">AI-Powered Advisory</h4>
            <p className="text-on-surface/50 text-xs font-body leading-relaxed">Get a hyper-local feasibility report with SWOT analysis, market reach, pricing recommendations, and risk assessment.</p>
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}

export default Home
