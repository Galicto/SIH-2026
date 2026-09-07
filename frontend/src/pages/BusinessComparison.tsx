import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX } from '../context/PredXContext';
import { useLanguage } from '../lib/i18n';
import SchemeMatcher from '../components/SchemeMatcher';
import PanelErrorBoundary from '../components/PanelErrorBoundary';
import { calculateFinancials } from '../lib/financialCalculator';
import { BusinessItem } from '../providers/types';
import { API_BASE_URL } from '../config';

type CompareRow = {
  id: string;
  name: string;
  score: number;
  viability: string;
  riskLevel: string;
  financialShortfall: number;
  monthlySurplusEstimate?: number;
  competitorDensity: string;
  competitorCount?: number;
  schemeSupported?: boolean;
  matchedSchemes?: any[];
  confidence?: string;
  recommendedAction?: string;
};

export default function BusinessComparison() {
  const { navigate } = usePredX();
  const { t } = useLanguage();

  const profileStr = sessionStorage.getItem('arthniti-profile');
  const profile = profileStr ? JSON.parse(profileStr) : null;

  const comparedStr = sessionStorage.getItem('arthniti-compared-businesses');
  const compared: BusinessItem[] = comparedStr ? JSON.parse(comparedStr) : [];

  const [apiRows, setApiRows] = useState<CompareRow[]>([]);
  const [summary, setSummary] = useState('');
  const [lowConfidence, setLowConfidence] = useState(false);
  const [missingData, setMissingData] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile || compared.length < 2) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/api/business/compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businesses: compared,
            budget: profile.marginCapital || 0,
            location: profile.location,
          }),
        });
        if (!res.ok) throw new Error(`compare_${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setApiRows(data.comparisonList || []);
        setSummary(data.summary || '');
        setLowConfidence(!!data.lowConfidence);
        setMissingData(data.missingData || []);
        sessionStorage.setItem('arthniti-comparison-result', JSON.stringify(data));
      } catch (e) {
        if (!cancelled) setError('Comparison service unavailable. Showing local deterministic estimates.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!profile || compared.length === 0) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto px-4 pb-20 pt-20 text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface/30 mb-4">compare_arrows</span>
          <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">Nothing to compare yet</h2>
          <p className="text-sm text-on-surface/60 mb-6">
            Pick 2–3 business ideas on Explore, then come back here. Start with Business Advisory
            to set your location and budget.
          </p>
          <button onClick={() => navigate('advisory')} className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold">Start Business Advisory</button>
        </div>
      </DashboardLayout>
    );
  }

  const financials = calculateFinancials(profile.marginCapital);
  const emi = financials.monthlyEMI || 0;

  // Fallback local scoring if API failed
  const localStats = compared.map((c) => {
    const surplus = (c.avgRevenue || 0) - (c.avgOperatingCost || 0);
    const emiRatio = emi > 0 && surplus > 0 ? (emi / surplus) * 100 : 0;
    const densityPenalty = c.competitorDensity === 'high' ? 20 : (c.competitorDensity === 'medium' ? 10 : 0);
    const score = (c.demandProxyScore || 0) - (emiRatio * 0.5) - densityPenalty;
    return { surplus, emiRatio, score };
  });

  const rows = apiRows.length
    ? apiRows
    : compared.map((c, i) => ({
        id: c.id,
        name: c.name,
        score: Math.round(Math.max(0, Math.min(100, localStats[i].score))),
        viability: 'Medium',
        riskLevel: c.competitorDensity === 'high' ? 'High' : 'Medium',
        financialShortfall: Math.max(0, (c.minCapital || 0) - (profile.marginCapital || 0)),
        monthlySurplusEstimate: localStats[i].surplus,
        competitorDensity: c.competitorDensity,
        confidence: (c as any).provenance?.confidence || 'medium',
        recommendedAction: 'Review carefully',
      }));

  const bestIndex = rows.reduce((best, row, i, arr) => (row.score > arr[best].score ? i : best), 0);
  const isNoneSafe = (localStats[bestIndex]?.emiRatio || 0) > 80;

  const handleSelect = (business: BusinessItem) => {
    sessionStorage.setItem('arthniti-selected-business', JSON.stringify(business));
    navigate('feasibility');
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 pb-20 pt-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-headline font-black tracking-tight text-on-surface mb-2">
              Business Comparison
            </h1>
            <p className="text-on-surface-variant font-body text-sm max-w-xl">
              Deterministic scoring from live discovery for <span className="font-bold text-on-surface">{profile.location.district}</span>
            </p>
          </div>
          <button
            onClick={() => navigate('explore')}
            className="flex items-center text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Compare another business
          </button>
        </div>

        {loading && (
          <p className="text-sm text-on-surface/60 mb-4">Computing live comparison…</p>
        )}
        {error && (
          <p className="text-sm text-amber-400 mb-4">{error}</p>
        )}
        {summary && (
          <div className="mb-6 p-4 rounded-xl bg-on-surface/5 border border-outline-variant/10 text-sm text-on-surface/80">
            {summary}
          </div>
        )}
        {lowConfidence && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
            <p className="font-bold mb-1">Low-confidence report</p>
            <p>Some live signals are sparse. Missing: {missingData.join('; ') || 'additional local observations'}.</p>
            <button onClick={() => navigate('explore')} className="mt-2 text-xs font-bold underline">Add manual observations on Explore</button>
          </div>
        )}

        {isNoneSafe && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex gap-3 items-start">
            <span className="material-symbols-outlined">warning</span>
            <div>
              <p className="font-bold mb-1">Warning: High Repayment Risk</p>
              <p>None of the compared options currently meets our repayment-safety threshold (EMI {'>'} 80% of surplus). Consider a smaller project scale, lower-cost category, training, or additional margin capital.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {compared.map((cat, idx) => {
            const row = rows.find(r => r.id === cat.id) || rows[idx];
            const isRecommended = idx === bestIndex && !isNoneSafe && !lowConfidence;
            const stats = localStats[idx];

            return (
              <div
                key={cat.id}
                className={`relative flex flex-col rounded-2xl border transition-all ${
                  isRecommended
                    ? 'border-accent-green/50 bg-accent-green/5 shadow-[0_0_30px_rgba(0,255,102,0.1)] mt-4 xl:mt-0 xl:-translate-y-4'
                    : 'border-outline-variant/30 bg-surface-container mt-4 xl:mt-0'
                }`}
              >
                {isRecommended && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent-green text-surface-container-highest font-bold text-[11px] uppercase tracking-widest px-4 py-1.5 rounded-full shadow-[0_4px_12px_rgba(0,255,102,0.3)] whitespace-nowrap z-10 border border-accent-green/20">
                    Recommended for You
                  </div>
                )}

                <div className={`p-6 border-b ${isRecommended ? 'border-accent-green/20' : 'border-outline-variant/10'}`}>
                  <h3 className="text-xl font-headline font-bold text-on-surface mb-1">{cat.name}</h3>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-on-surface-variant uppercase tracking-wider">Deterministic Score</span>
                    <span className={`text-xl font-bold ${isRecommended ? 'text-accent-green' : 'text-[#FF5A00]'}`}>
                      {row?.score ?? '—'}/100
                    </span>
                  </div>
                  <p className="text-[10px] text-on-surface/40 mt-1">
                    Confidence: {row?.confidence || 'medium'} · {row?.viability} viability · {row?.riskLevel} risk
                  </p>
                </div>

                <div className="p-6 flex-grow flex flex-col gap-4 text-sm">
                  <div className="flex justify-between items-center pb-2 border-b border-outline-variant/5">
                    <span className="text-on-surface-variant">Competition</span>
                    <span className="font-semibold capitalize text-on-surface">
                      {row?.competitorDensity || cat.competitorDensity}
                      {row?.competitorCount != null ? ` (${row.competitorCount})` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-outline-variant/5">
                    <span className="text-on-surface-variant">Est. Revenue</span>
                    <span className="font-semibold text-on-surface">₹{(cat.avgRevenue || 0).toLocaleString('en-IN')} /mo</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-outline-variant/5">
                    <span className="text-on-surface-variant">Monthly Surplus</span>
                    <span className="font-bold text-accent-green">₹{(stats?.surplus || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-outline-variant/5">
                    <span className="text-on-surface-variant">Budget shortfall</span>
                    <span className="font-semibold text-on-surface">₹{(row?.financialShortfall || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-outline-variant/5">
                    <span className="text-on-surface-variant">EMI-to-Surplus</span>
                    <span className={`font-semibold ${(stats?.emiRatio || 0) > 60 ? 'text-[#FF3300]' : 'text-on-surface'}`}>
                      {(stats?.emiRatio || 0).toFixed(1)}%
                    </span>
                  </div>
                  {(cat as any).signals && (
                    <p className="text-xs text-on-surface/60">{(cat as any).signals}</p>
                  )}

                  <div className="mt-4 pt-4 border-t border-outline-variant/10">
                    <PanelErrorBoundary fallbackMessage="Scheme Matcher could not load for this business.">
                      <SchemeMatcher
                        profile={{
                          state: profile.location.state,
                          category: cat.category,
                          projectCost: (cat.maxCapital || cat.minCapital || cat.avgOperatingCost * 6),
                          marginCapital: profile.marginCapital,
                          socialCategory: profile.socialCategory,
                          gender: profile.gender,
                          isArtisan: profile.isArtisan,
                          isExistingEnterprise: false,
                        }}
                      />
                    </PanelErrorBoundary>
                  </div>
                </div>

                <div className="p-6 pt-0 mt-auto">
                  <button
                    onClick={() => handleSelect(cat)}
                    className={`w-full py-3.5 rounded-xl font-bold transition-all border shadow-lg ${
                      isRecommended
                        ? 'bg-accent-green text-surface-container-highest border-transparent hover:bg-accent-green/90'
                        : 'bg-transparent text-on-surface border-outline-variant/30 hover:bg-on-surface/5'
                    }`}
                  >
                    View Complete Report
                  </button>
                  <button
                    onClick={() => navigate('arthniti-chat')}
                    className="w-full mt-3 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface border border-transparent hover:border-outline-variant/20 rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">smart_toy</span>
                    Ask Assistant about this comparison
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
