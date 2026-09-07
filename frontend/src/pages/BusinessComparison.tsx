import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX } from '../context/PredXContext';
import SchemeMatcher from '../components/SchemeMatcher';
import PanelErrorBoundary from '../components/PanelErrorBoundary';
import { BusinessItem } from '../providers/types';
import { API_BASE_URL } from '../config';
import { useAdvisory } from '../context/AdvisoryContext';

type ScorePart = { label: string; score: number; max: number };

type CompareRow = {
  id: string;
  name: string;
  score: number;
  weightedScore: number;
  viability: string;
  riskLevel: string;
  financialShortfall: number;
  monthlySurplusEstimate: number;
  competitorDensity: string;
  competitorCount?: number;
  schemeSupported?: boolean;
  matchedSchemes?: any[];
  confidence: string;
  recommendationReasons: string[];
  recommendedAction: string;
  metrics: {
    projectCost: number;
    capitalGap: number;
    monthlySurplus: number;
    estimatedEmi: number;
    emiBurdenPercent: number;
    householdExpenses: number;
    demandAnchors?: Record<string, number>;
  };
  scoreBreakdown: Record<string, ScorePart>;
};

type ComparisonResult = {
  comparisonList: CompareRow[];
  summary?: string;
  lowConfidence?: boolean;
  missingData?: string[];
  isViabilityCheck?: boolean;
  recommendation?: { businessId?: string; headline?: string; reasons?: string[] };
  assumptions?: Record<string, string>;
};

const formatCurrency = (amount: number) => `₹${Math.round(amount || 0).toLocaleString('en-IN')}`;
const scoreKeys = ['demand', 'competition', 'capitalGap', 'monthlySurplus', 'emiBurden', 'skills', 'schemeFit', 'confidence'];

const savedJson = <T,>(key: string, fallback: T): T => {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
};

function ScoreBar({ part }: { part?: ScorePart }) {
  if (!part) return <span className="text-on-surface/45">—</span>;
  const percent = part.max > 0 ? Math.max(0, Math.min(100, (part.score / part.max) * 100)) : 0;
  return (
    <div className="min-w-[110px]">
      <div className="flex justify-between gap-2 text-xs font-semibold text-on-surface">
        <span>{part.score}/{part.max}</span>
        <span className="text-on-surface/45">{Math.round(percent)}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-on-surface/10 overflow-hidden">
        <div className="h-full rounded-full bg-[#FF5A00]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function BusinessComparison() {
  const { navigate } = usePredX();
  const { activeSearch, updateActiveSearch } = useAdvisory();
  const profile = activeSearch?.profile || savedJson<any | null>('arthniti-profile', null);
  const compared: BusinessItem[] = activeSearch?.comparison?.businesses || savedJson<BusinessItem[]>('arthniti-compared-businesses', []);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const hasUsableSavedResult = (candidate: any): candidate is ComparisonResult => (
    Array.isArray(candidate?.comparisonList)
    && candidate.comparisonList.length > 0
    && candidate.comparisonList.every((row: any) => row?.scoreBreakdown && row?.metrics)
  );

  useEffect(() => {
    if (!profile || compared.length === 0) {
      setLoading(false);
      return;
    }

    const saved = activeSearch?.comparison?.result;
    if (hasUsableSavedResult(saved)) {
      setResult(saved);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/business/compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ businesses: compared, budget: profile.marginCapital || 0, location: profile.location, profile }),
        });
        if (!response.ok) throw new Error(`compare_${response.status}`);
        const data = await response.json() as ComparisonResult;
        if (cancelled) return;
        setResult(data);
        updateActiveSearch({ comparison: { businesses: compared, result: data } });
      } catch (requestError: any) {
        if (!cancelled && requestError?.name !== 'AbortError') {
          setError('The weighted viability service is unavailable. No estimate has been substituted; please retry.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // A saved comparison is deliberately reused for this advisory search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSearch?.id]);

  const rows = result?.comparisonList || [];
  const rowForBusiness = useMemo(() => new Map(rows.map(row => [row.id, row])), [rows]);
  const isViabilityCheck = compared.length === 1;
  const recommendation = result?.recommendation || (rows[0]
    ? { businessId: rows[0].id, headline: `Recommended option: ${rows[0].name}`, reasons: rows[0].recommendationReasons }
    : undefined);

  if (!profile || compared.length === 0) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto px-4 pb-20 pt-20 text-center">
          <h2 className="text-2xl font-headline font-bold text-on-surface mb-4">No Business Selected</h2>
          <p className="text-sm text-on-surface/60 mb-6">Select one opportunity for a viability check, or two or more to compare them.</p>
          <button onClick={() => navigate('explore')} className="bg-[#FF5A00] text-white px-6 py-3 rounded-xl font-bold">Explore businesses</button>
        </div>
      </DashboardLayout>
    );
  }

  const handleSelect = (business: BusinessItem) => {
    updateActiveSearch({ selectedBusiness: business });
    navigate('feasibility');
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 pb-20 pt-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-headline font-black tracking-tight text-on-surface mb-2">
              {isViabilityCheck ? 'Business Viability Check' : 'Business Comparison'}
            </h1>
            <p className="text-on-surface-variant font-body text-sm max-w-2xl">
              {isViabilityCheck
                ? `A weighted viability view for ${compared[0].name} in ${profile.location.district}.`
                : `Side-by-side weighted comparison for ${compared.length} opportunities in ${profile.location.district}.`}
            </p>
          </div>
          <button onClick={() => navigate('explore')} className="flex items-center text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors">
            {isViabilityCheck ? 'Check another business' : 'Change selected businesses'}
          </button>
        </div>

        {loading && <p className="text-sm text-on-surface/60 mb-4">Calculating weighted viability…</p>}
        {error && (
          <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="mt-2 text-xs font-bold underline">Retry</button>
          </div>
        )}
        {result?.summary && <div className="mb-6 p-4 rounded-xl bg-on-surface/5 border border-outline-variant/10 text-sm text-on-surface/80">{result.summary}</div>}
        {result?.lowConfidence && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm">
            <p className="font-bold mb-1">Validate sparse local signals</p>
            <p>{result.missingData?.join('; ') || 'Some local signals are incomplete.'}</p>
          </div>
        )}

        {recommendation && rows.length > 0 && (
          <section className="mb-6 rounded-2xl border border-accent-green/30 bg-accent-green/5 p-5">
            <p className="text-xs uppercase tracking-wider font-bold text-accent-green mb-1">{isViabilityCheck ? 'Viability result' : 'Recommendation'}</p>
            <h2 className="text-xl font-headline font-bold text-on-surface">{recommendation.headline}</h2>
            <ul className="mt-3 grid gap-2 md:grid-cols-2 text-sm text-on-surface/80">
              {(recommendation.reasons || []).slice(0, 4).map(reason => <li key={reason} className="flex gap-2"><span className="text-accent-green">•</span><span>{reason}</span></li>)}
            </ul>
          </section>
        )}

        {rows.length > 0 && (
          <section className="mb-8 rounded-2xl border border-outline-variant/20 bg-surface-container p-5 overflow-hidden">
            <div className="mb-4"><h2 className="text-lg font-headline font-bold text-on-surface">Weighted score chart</h2><p className="text-xs text-on-surface/55">Every column uses the same weights; bars show the earned share of each factor.</p></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left border-separate border-spacing-0"><thead><tr><th className="pb-3 pr-4 text-xs font-bold uppercase tracking-wider text-on-surface/50">Factor</th>{rows.map(row => <th key={row.id} className="pb-3 px-3 min-w-[190px] text-sm font-bold text-on-surface"><div>{row.name}</div><span className="text-[#FF5A00] text-lg">{row.weightedScore}/100</span></th>)}</tr></thead><tbody>
              <tr className="bg-on-surface/[0.03]"><th className="py-3 pr-4 text-sm font-bold text-on-surface">Overall weighted score</th>{rows.map(row => <td key={row.id} className="py-3 px-3"><ScoreBar part={{ label: 'Overall', score: row.weightedScore, max: 100 }} /></td>)}</tr>
              {scoreKeys.map(key => { const label = rows[0]?.scoreBreakdown[key]?.label || key; return <tr key={key} className="border-t border-outline-variant/10"><th className="py-3 pr-4 text-xs font-semibold text-on-surface/75">{label}</th>{rows.map(row => <td key={row.id} className="py-3 px-3"><ScoreBar part={row.scoreBreakdown[key]} /></td>)}</tr>; })}
            </tbody></table></div>
          </section>
        )}

        {rows.length > 0 && (
          <section className="mb-8 rounded-2xl border border-outline-variant/20 bg-surface-container p-5 overflow-hidden">
            <h2 className="text-lg font-headline font-bold text-on-surface mb-1">Financial side-by-side</h2><p className="text-xs text-on-surface/55 mb-4">Monthly surplus includes your stated household expenses. EMI is an estimate only, not a loan quote.</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr><th className="pb-3 pr-4 text-xs font-bold uppercase tracking-wider text-on-surface/50">Metric</th>{rows.map(row => <th key={row.id} className="pb-3 px-3 text-sm font-bold text-on-surface">{row.name}</th>)}</tr></thead><tbody className="text-sm">
              {[
                ['Estimated project cost', (row: CompareRow) => formatCurrency(row.metrics.projectCost)],
                ['Capital gap', (row: CompareRow) => formatCurrency(row.metrics.capitalGap)],
                ['Monthly surplus', (row: CompareRow) => formatCurrency(row.metrics.monthlySurplus)],
                ['Estimated EMI', (row: CompareRow) => formatCurrency(row.metrics.estimatedEmi)],
                ['EMI / surplus', (row: CompareRow) => `${row.metrics.emiBurdenPercent.toFixed(1)}%`],
                ['Competition', (row: CompareRow) => `${row.competitorDensity}${row.competitorCount != null ? ` (${row.competitorCount})` : ''}`],
                ['Signal confidence', (row: CompareRow) => row.confidence],
              ].map(([label, format]) => <tr key={label as string} className="border-t border-outline-variant/10"><th className="py-3 pr-4 text-xs font-semibold text-on-surface/75">{label as string}</th>{rows.map(row => <td key={row.id} className="py-3 px-3 font-semibold text-on-surface">{(format as (item: CompareRow) => string)(row)}</td>)}</tr>)}
            </tbody></table></div>
          </section>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {compared.map(business => {
            const row = rowForBusiness.get(business.id);
            const recommended = recommendation?.businessId === business.id && rows.length > 0;
            return <article key={business.id} className={`relative flex flex-col rounded-2xl border ${recommended ? 'border-accent-green/50 bg-accent-green/5' : 'border-outline-variant/30 bg-surface-container'}`}>
              {recommended && <div className="absolute -top-3 left-4 rounded-full bg-accent-green px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-surface-container-highest">{isViabilityCheck ? 'Viability result' : 'Recommended'}</div>}
              <div className="p-6 border-b border-outline-variant/10"><h3 className="text-xl font-headline font-bold text-on-surface">{business.name}</h3>{row ? <div className="mt-4 flex justify-between items-end gap-3"><div><p className="text-xs text-on-surface-variant">{row.viability} viability · {row.riskLevel} risk</p><p className="text-[10px] text-on-surface/45 mt-1">Signal confidence: {row.confidence}</p></div><span className="text-2xl font-bold text-[#FF5A00]">{row.weightedScore}/100</span></div> : <p className="mt-4 text-sm text-on-surface/55">Awaiting weighted result.</p>}</div>
              <div className="p-6 flex-grow">{row && <><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-on-surface/55">Capital gap</dt><dd className="font-bold text-on-surface">{formatCurrency(row.metrics.capitalGap)}</dd></div><div><dt className="text-on-surface/55">Monthly surplus</dt><dd className={`font-bold ${row.metrics.monthlySurplus > 0 ? 'text-accent-green' : 'text-red-300'}`}>{formatCurrency(row.metrics.monthlySurplus)}</dd></div><div><dt className="text-on-surface/55">Est. EMI</dt><dd className="font-bold text-on-surface">{formatCurrency(row.metrics.estimatedEmi)}</dd></div><div><dt className="text-on-surface/55">EMI / surplus</dt><dd className={`font-bold ${row.metrics.emiBurdenPercent > 60 ? 'text-red-300' : 'text-on-surface'}`}>{row.metrics.emiBurdenPercent.toFixed(1)}%</dd></div></dl><div className="mt-5 border-t border-outline-variant/10 pt-4"><p className="text-xs uppercase tracking-wider text-on-surface/50 font-bold mb-2">Why this result</p><ul className="space-y-2 text-xs text-on-surface/75">{row.recommendationReasons.slice(0, 4).map(reason => <li key={reason} className="flex gap-2"><span className="text-[#FF5A00]">•</span><span>{reason}</span></li>)}</ul></div></>}
                <div className="mt-5 pt-4 border-t border-outline-variant/10"><PanelErrorBoundary fallbackMessage="Scheme Matcher could not load for this business."><SchemeMatcher profile={{ state: profile.location.state, category: business.category, projectCost: business.maxCapital || business.minCapital || business.avgOperatingCost * 6, budget: profile.marginCapital, marginCapital: profile.marginCapital, socialCategory: profile.socialCategory, gender: profile.gender, skillLevel: profile.skillLevel, workPreference: profile.workType || business.workType, spaceStatus: profile.businessSpace, availability: profile.timeAvailability, householdExpenses: profile.householdExpenses, isArtisan: profile.isArtisan, isSHGMember: profile.isSHGMember, isExistingEnterprise: !!profile.isExistingEnterprise }} /></PanelErrorBoundary></div>
              </div>
              <div className="p-6 pt-0"><button onClick={() => handleSelect(business)} className="w-full rounded-xl bg-[#FF5A00] py-3 font-bold text-white transition-colors hover:bg-[#e95000]">View Complete Report</button></div>
            </article>;
          })}
        </div>

        {result?.assumptions && <section className="mt-8 rounded-xl border border-outline-variant/15 bg-on-surface/[0.03] p-4"><h2 className="text-sm font-bold text-on-surface mb-2">Scoring assumptions</h2><ul className="space-y-1 text-xs text-on-surface/60">{Object.values(result.assumptions).map(assumption => <li key={assumption}>• {assumption}</li>)}</ul></section>}
      </div>
    </DashboardLayout>
  );
}
