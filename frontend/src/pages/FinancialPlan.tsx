import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX } from '../context/PredXContext';
import { generatePDFReport } from '../lib/pdfExport';
import { BusinessItem } from '../providers/types';
import { API_BASE_URL } from '../config';
import { useAdvisory } from '../context/AdvisoryContext';

const formatINR = (value: unknown) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
const parseStored = <T,>(key: string): T | null => {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
};

export default function FinancialPlan() {
  const { navigate } = usePredX();
  const { activeSearch, updateActiveSearch } = useAdvisory();
  const profile = activeSearch?.profile || parseStored<any>('arthniti-profile');
  const business: BusinessItem | null = activeSearch?.selectedBusiness || parseStored<BusinessItem>('arthniti-selected-business');
  const [finPlan, setFinPlan] = useState<any>(activeSearch?.financialPlan?.plan || null);
  const [schemeMatches, setSchemeMatches] = useState<any[]>(activeSearch?.financialPlan?.matches || []);
  const [loading, setLoading] = useState(!activeSearch?.financialPlan?.plan);
  const [error, setError] = useState('');
  const [pdfError, setPdfError] = useState('');

  useEffect(() => {
    if (!profile || !business) {
      setLoading(false);
      return;
    }
    const savedPlan = activeSearch?.financialPlan?.plan;
    if (savedPlan?.status === 'ready' && savedPlan?.terms && savedPlan?.financials?.requiredCredit != null) {
      setFinPlan(savedPlan);
      setSchemeMatches(activeSearch?.financialPlan?.matches || savedPlan.schemeMatching?.matches || []);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/finance/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ business, userProfile: profile, location: profile.location }),
        });
        if (!response.ok) throw new Error(`finance_${response.status}`);
        const data = await response.json();
        if (cancelled) return;
        const matches = data?.schemeMatching?.matches || [];
        setFinPlan(data);
        setSchemeMatches(matches);
        updateActiveSearch({ financialPlan: { matches, plan: data } });
      } catch (requestError: any) {
        if (!cancelled && requestError?.name !== 'AbortError') setError('The financial plan could not be calculated. Please retry.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // The stored canonical plan is intentionally reused for this advisory search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSearch?.id]);

  if (!profile || !business) {
    return <DashboardLayout><div className="max-w-4xl mx-auto px-4 pb-20 pt-20 text-center"><h2 className="text-2xl font-headline font-bold text-on-surface mb-4">No Financial Data</h2><button onClick={() => navigate('explore')} className="bg-[#FF5A00] text-white px-6 py-3 rounded-xl font-bold">Go Back to Explore</button></div></DashboardLayout>;
  }

  const isReady = finPlan?.status === 'ready';
  const financials = finPlan?.financials || {};
  const terms = finPlan?.terms || {};
  const market = activeSearch?.feasibilityReport?.marketAnalysis || {};
  const readiness = Number(financials.repaymentReadinessScore || 0);
  const readinessClass = readiness >= 70 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : readiness >= 40 ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-red-500/10 border-red-500/30 text-red-300';

  const downloadPassport = () => {
    setPdfError('');
    try {
      generatePDFReport({ location: profile.location, business, profile, financialPlan: finPlan, schemeMatches, feasibilityReport: activeSearch?.feasibilityReport });
    } catch {
      setPdfError('Passport generation failed in this browser. Please retry.');
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 pb-12 pt-4">
        <section className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <button onClick={() => navigate('feasibility')} className="text-on-surface/50 text-xs font-body font-semibold hover:text-on-surface transition-colors flex items-center gap-1 mb-2"><span className="material-symbols-outlined text-[14px]">arrow_back</span>Back to Report</button>
            <h1 className="text-2xl md:text-3xl font-headline font-bold text-on-surface">Viability Passport & Financial Plan</h1>
            <p className="text-on-surface/50 text-sm font-body mt-1">{business.name} — {profile.location.district}, {profile.location.state}</p>
          </div>
          <button onClick={downloadPassport} disabled={!isReady} className="flex items-center gap-2 bg-gradient-to-r from-[#FF5A00] to-[#FF8C00] text-white px-6 py-3 rounded-xl text-sm font-body font-bold hover:shadow-[0_0_20px_rgba(255,90,0,0.3)] transition-all active:scale-95 disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">download</span>Generate Viability Passport</button>
        </section>

        {pdfError && <p className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{pdfError}</p>}
        {loading && <div className="h-36 bg-on-surface/5 animate-pulse rounded-2xl w-full" />}
        {error && <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        {!loading && !error && !isReady && <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl mb-6"><h3 className="text-red-300 font-bold mb-2">Financial Plan Unavailable</h3><p className="text-red-200 text-sm">{finPlan?.message || 'The business needs a positive startup-cost estimate before a plan can be calculated.'}</p></div>}

        {!loading && isReady && <>
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {[
              ['Startup project cost', formatINR(financials.projectCost)],
              ['Own margin used', formatINR(financials.applicantMargin)],
              ['Required credit', formatINR(financials.requiredCredit)],
              ['Estimated EMI', `${formatINR(financials.monthlyEmi)} / mo`],
            ].map(([label, value]) => <div key={label} className="bg-on-surface/5 backdrop-blur-xl p-5 rounded-2xl border border-on-surface/10"><span className="text-[10px] font-label text-on-surface/50 uppercase tracking-widest block mb-2">{label}</span><span className="text-2xl font-headline font-bold text-on-surface">{value}</span></div>)}
          </section>

          <section className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5"><div><h2 className="text-lg font-headline font-bold text-on-surface">One finance model, shown everywhere</h2><p className="mt-1 text-sm text-on-surface/65">{finPlan.message}</p></div><div className={`rounded-xl border px-4 py-3 min-w-[180px] ${readinessClass}`}><p className="text-[10px] uppercase tracking-wider opacity-75">Repayment readiness</p><p className="text-2xl font-bold">{readiness}/100</p></div></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-sm"><div className="bg-on-surface/5 rounded-xl p-4"><p className="text-on-surface/55 text-xs">Revenue / operating cost</p><p className="font-bold text-on-surface mt-1">{formatINR(financials.monthlyRevenue)} / {formatINR(financials.monthlyOperatingCost)}</p></div><div className="bg-on-surface/5 rounded-xl p-4"><p className="text-on-surface/55 text-xs">Household costs / surplus</p><p className="font-bold text-on-surface mt-1">{formatINR(financials.householdExpenses)} / {formatINR(financials.monthlySurplus)}</p></div><div className="bg-on-surface/5 rounded-xl p-4"><p className="text-on-surface/55 text-xs">EMI share of surplus</p><p className="font-bold text-on-surface mt-1">{financials.emiToSurplusRatio}%</p></div></div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10"><h2 className="text-lg font-headline font-bold text-on-surface">Credit terms</h2><p className="text-sm text-on-surface/65 mt-1">{terms.termSource === 'published_scheme_terms' ? 'Published eligible scheme terms applied' : 'Lender-neutral planning baseline applied'}</p><dl className="grid grid-cols-2 gap-4 mt-5 text-sm"><div><dt className="text-on-surface/50">Interest rate</dt><dd className="font-bold text-on-surface">{financials.annualInterestRate}% p.a.</dd></div><div><dt className="text-on-surface/50">Tenure</dt><dd className="font-bold text-on-surface">{financials.tenureMonths} months</dd></div><div><dt className="text-on-surface/50">Total repayment</dt><dd className="font-bold text-on-surface">{formatINR(financials.totalRepayment)}</dd></div><div><dt className="text-on-surface/50">Estimated interest</dt><dd className="font-bold text-on-surface">{formatINR(financials.totalInterest)}</dd></div></dl><p className="mt-4 text-xs text-on-surface/55">{terms.termNote}</p></div>
            <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10"><h2 className="text-lg font-headline font-bold text-on-surface">Matched schemes</h2>{schemeMatches.length ? <ul className="mt-4 space-y-3">{schemeMatches.map((scheme: any) => <li key={scheme.schemeId || scheme.name} className="rounded-xl bg-on-surface/5 p-3"><p className="font-bold text-sm text-on-surface">{scheme.name}</p><p className="text-xs text-on-surface/65 mt-1">{scheme.whyRelevant || scheme.description}</p>{scheme.financeTerms?.note && <p className="text-xs text-[#FF8C00] mt-2">{scheme.financeTerms.note}</p>}</li>)}</ul> : <p className="mt-4 text-sm text-on-surface/60">No scheme was selected for the credit model. The plan remains usable with a transparent planning assumption.</p>}</div>
          </section>

          <section className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10"><h2 className="text-lg font-headline font-bold text-on-surface">Before you apply</h2><ul className="mt-4 grid gap-2 md:grid-cols-2 text-sm text-on-surface/75">{(market.nextSteps || ['Validate supplier quotations and prospective customer demand.', 'Confirm final rate and tenure with the lender before accepting any credit offer.']).slice(0, 6).map((step: string) => <li key={step} className="flex gap-2"><span className="text-[#FF5A00]">•</span><span>{step}</span></li>)}</ul></section>
        </>}
      </div>
    </DashboardLayout>
  );
}
