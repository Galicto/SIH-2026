import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX } from '../context/PredXContext';
import { useLanguage } from '../lib/i18n';
import { safeNumber, safeString } from '../lib/safeFormatters';
import { generatePDFReport } from '../lib/pdfExport';
import { BusinessItem, SchemeMatch } from '../providers/types';
import { schemeProvider } from '../providers/MockProviders';
import { API_BASE_URL } from '../config';
import PanelErrorBoundary from '../components/PanelErrorBoundary';

export const formatINR = (value: number | string | undefined | null) => {
  const num = safeNumber(value);
  if (num === null) return 'Not available';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
};

export default function FinancialPlan() {
  const { navigate } = usePredX();
  const { t, lang } = useLanguage();
  const [schemeMatches, setSchemeMatches] = useState<SchemeMatch[]>([]);
  const [finPlan, setFinPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const profileStr = sessionStorage.getItem('arthniti-profile');
  const profile = profileStr ? JSON.parse(profileStr) : null;
  const businessStr = sessionStorage.getItem('arthniti-selected-business');
  const business: BusinessItem = businessStr ? JSON.parse(businessStr) : null;

  useEffect(() => {
    if (!profile || !business) {
      setLoading(false);
      return;
    }
    
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const matches = await schemeProvider.findMatches({
          state: profile.location.state,
          category: business.category,
          projectCost: business.avgOperatingCost * 6,
          marginCapital: profile.marginCapital,
          socialCategory: profile.socialCategory,
          gender: profile.gender,
          isArtisan: profile.isArtisan,
          isExistingEnterprise: false,
        });
        if (cancelled) return;
        setSchemeMatches(matches);

        // Calculate basic inputs for the engine
        const projectCost = business.avgOperatingCost * 6;
        const applicantMargin = profile.marginCapital;
        const requiredCredit = projectCost - applicantMargin;

        // Extract scheme details if available
        let interestRate = 0;
        let tenure = 0;
        if (matches && matches.length > 0 && matches[0].features) {
           const f = matches[0].features;
           interestRate = f.interestRate ? parseFloat(f.interestRate.toString()) : 0;
           tenure = f.maxTenureYears ? parseInt(f.maxTenureYears.toString()) * 12 : 0;
        }

        const res = await fetch(`${API_BASE_URL}/api/finance/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectCost,
            applicantMargin,
            requiredCredit,
            annualInterestRate: interestRate,
            tenureMonths: tenure,
            monthlyRevenue: business.avgRevenue,
            monthlyOperatingCost: business.avgOperatingCost
          })
        });
        const data = await res.json();
        if (!cancelled) setFinPlan(data);
      } catch (err) {
        if (!cancelled) setFinPlan({ status: 'error', message: 'Unable to reach financial engine.' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    
    loadData();
    return () => { cancelled = true; };
  }, [profile?.location?.district, business?.category]);

  if (!profile || !business) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto px-4 pb-20 pt-20 text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface/30 mb-4">calculate</span>
          <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">No plan yet</h2>
          <p className="text-sm text-on-surface/60 mb-6">
            The financial plan needs your margin capital and a chosen business. Start with
            Business Advisory, then explore and compare options to pick one.
          </p>
          <button onClick={() => navigate('advisory')} className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold">Start Business Advisory</button>
        </div>
      </DashboardLayout>
    );
  }

  const handleDownloadPDF = () => {
    // Requires PDF update for exact schema later, omitted for brevity
  };

  const isReady = finPlan?.status === 'ready';
  const f = finPlan?.financials || {};

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 pb-12 pt-4">
        {/* Header */}
        <section className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <button onClick={() => navigate('feasibility')} className="text-on-surface/50 text-xs font-body font-semibold hover:text-on-surface transition-colors flex items-center gap-1 mb-2">
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>Back to Report
            </button>
            <h1 className="text-2xl md:text-3xl font-headline font-bold text-on-surface">Viability Passport & Financial Plan</h1>
            <p className="text-on-surface/50 text-sm font-body mt-1">
              {business.name} — {profile.location.district}
            </p>
          </div>
          <button onClick={handleDownloadPDF} disabled={!isReady} className="flex items-center gap-2 bg-gradient-to-r from-primary to-[#FF8C00] text-on-primary px-6 py-3 rounded-xl text-sm font-body font-bold hover:shadow-[0_0_20px_rgb(var(--primary)/0.3)] transition-all active:scale-95 disabled:opacity-50">
            <span className="material-symbols-outlined text-[18px]">download</span>Generate Viability Passport
          </button>
        </section>

        {loading ? (
           <div className="h-32 bg-on-surface/5 animate-pulse rounded-2xl w-full"></div>
        ) : !isReady ? (
           <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl mb-6">
             <h3 className="text-red-500 font-bold mb-2">Financial Plan Unavailable</h3>
             <p className="text-red-400 text-sm">{safeString(finPlan?.message) || 'Verified scheme terms are required to generate an EMI plan. Please verify scheme eligibility first.'}</p>
           </div>
        ) : (
          <>
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
              <div className="bg-on-surface/5 backdrop-blur-xl p-5 rounded-2xl border border-on-surface/10">
                <span className="text-[10px] font-label text-on-surface/50 uppercase tracking-widest block mb-2">Project Cost (Est.)</span>
                <span className="text-2xl font-headline font-bold text-on-surface">{formatINR(f.projectCost)}</span>
              </div>
              <div className="bg-on-surface/5 backdrop-blur-xl p-5 rounded-2xl border border-on-surface/10 border-b-2 border-b-primary">
                <span className="text-[10px] font-label text-on-surface/50 uppercase tracking-widest block mb-2">Required Credit</span>
                <span className="text-2xl font-headline font-bold text-on-surface">{formatINR(f.requiredCredit)}</span>
              </div>
              <div className="bg-on-surface/5 backdrop-blur-xl p-5 rounded-2xl border border-on-surface/10">
                <span className="text-[10px] font-label text-on-surface/50 uppercase tracking-widest block mb-2">Monthly EMI</span>
                <span className="text-2xl font-headline font-bold text-on-surface">{formatINR(f.monthlyEmi)}</span>
              </div>
              <div className="bg-on-surface/5 backdrop-blur-xl p-5 rounded-2xl border border-on-surface/10">
                <span className="text-[10px] font-label text-on-surface/50 uppercase tracking-widest block mb-2">Credit Tenure</span>
                <span className="text-2xl font-headline font-bold text-on-surface">{f.tenureMonths} mo <span className="text-sm font-normal text-on-surface/50">@{f.annualInterestRate}%</span></span>
              </div>
            </section>

            <section className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 mb-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-headline font-bold text-on-surface">Financial Viability</h3>
                  <p className="text-sm text-on-surface/60">{finPlan.message}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-on-surface/5 rounded-xl p-4">
                  <span className="text-[10px] uppercase text-on-surface/50 mb-1 block">Est. Revenue</span>
                  <span className="text-lg font-bold">{formatINR(f.monthlyRevenue)}</span>
                </div>
                <div className="bg-on-surface/5 rounded-xl p-4">
                  <span className="text-[10px] uppercase text-on-surface/50 mb-1 block">Est. Operating Cost</span>
                  <span className="text-lg font-bold">{formatINR(f.monthlyOperatingCost)}</span>
                </div>
                <div className={`rounded-xl p-4 border ${f.repaymentReadinessScore >= 70 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : f.repaymentReadinessScore >= 40 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                  <span className="text-[10px] uppercase opacity-70 mb-1 block">Repayment Readiness</span>
                  <span className="text-lg font-bold">{f.repaymentReadinessScore}/100</span>
                  <p className="text-xs mt-1">Determined by Deterministic Engine</p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
