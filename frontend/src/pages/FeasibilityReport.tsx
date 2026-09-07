import React, { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX } from '../context/PredXContext';
import { BusinessItem, LocationProfile } from '../providers/types';
import SchemeMatcher from '../components/SchemeMatcher';
import LocalBusinessMap from '../components/LocalBusinessMap';
import PanelErrorBoundary from '../components/PanelErrorBoundary';
import { normalizeFeasibilityReportResponse } from '../lib/schemas';
import { safeNumber, safeCurrency, safeString, safeDate } from '../lib/safeFormatters';
import { API_BASE_URL } from '../config';
import { useAdvisory } from '../context/AdvisoryContext';

export default function FeasibilityReport() {
  const { navigate } = usePredX();
  const { activeSearch, updateActiveSearch } = useAdvisory();
  const [activeTab, setActiveTab] = useState<'report' | 'map'>('report');
  
  // States
  const [report, setReport] = useState<any>(activeSearch?.feasibilityReport || null);
  const [loading, setLoading] = useState(!activeSearch?.feasibilityReport);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestIdRef = useRef<number>(0);

  const profileStr = sessionStorage.getItem('arthniti-profile');
  const profile = activeSearch?.profile || (profileStr ? JSON.parse(profileStr) : null);
  const businessStr = sessionStorage.getItem('arthniti-selected-business');
  const business: BusinessItem = activeSearch?.selectedBusiness || (businessStr ? JSON.parse(businessStr) : null);

  const fetchReport = async () => {
    if (!profile || !business) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    const requestId = Date.now();
    lastRequestIdRef.current = requestId;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/feasibility/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: profile.location,
          business: business,
          userProfile: profile,
          budget: profile.marginCapital || 0,
          selectedScenario: 'expected'
        }),
        signal: controller.signal
      });

      if (!res.ok) throw new Error('Failed to fetch report');

      const data = await res.json();
      if (lastRequestIdRef.current === requestId) {
        const normalized = normalizeFeasibilityReportResponse(data);
        setReport(normalized);
        updateActiveSearch({ feasibilityReport: normalized });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (lastRequestIdRef.current === requestId) {
        setError('We could not retrieve this insight right now. Retry or continue with available report data.');
      }
    } finally {
      if (lastRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const cachedAdvisoryMessage = String(activeSearch?.feasibilityReport?.strategicAdvisory?.message || '').toLowerCase();
    const cachedAdvisoryTimedOut = cachedAdvisoryMessage.includes('timed out') || cachedAdvisoryMessage.includes('response window');
    const cachedAdvisoryUnavailable = ['unavailable', 'error'].includes(activeSearch?.feasibilityReport?.strategicAdvisory?.status);
    if (activeSearch?.feasibilityReport?.marketAnalysis && activeSearch?.feasibilityReport?.financials?.terms && !cachedAdvisoryTimedOut && !cachedAdvisoryUnavailable) {
      setReport(activeSearch.feasibilityReport);
      setLoading(false);
      return;
    }
    fetchReport();
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [activeSearch?.id, profile?.location?.district, business?.category]);

  if (!profile || !business) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto px-4 pb-20 pt-20 text-center">
          <h2 className="text-2xl font-headline font-bold text-on-surface mb-4">No Report Data</h2>
          <button onClick={() => navigate('explore')} className="bg-[#FF5A00] text-white px-6 py-3 rounded-xl font-bold">Go Back to Explore</button>
        </div>
      </DashboardLayout>
    );
  }

  const financials = report?.financials?.financials || {};
  const market = report?.marketAnalysis || {};
  const monthlySurplus = Number(financials.monthlySurplus ?? (business.avgRevenue - business.avgOperatingCost - Number(profile.householdExpenses || 0)));
  const recoveryMonths = market?.breakEven?.estimatedCapitalRecoveryMonths;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 pb-20 pt-4">
        
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <button
              onClick={() => navigate('compare')}
              className="flex items-center text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors mb-2"
            >
              <span className="material-symbols-outlined mr-1 text-[14px]">arrow_back</span>
              Back to Comparison
            </button>
            <h1 className="text-3xl font-headline font-black tracking-tight text-on-surface mb-1">
              {business.name} Feasibility Report
            </h1>
            <p className="text-on-surface-variant font-body text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px]">location_on</span>
              {profile.location.district}, {profile.location.state}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('arthniti-chat', {
                assistantLaunch: {
                  id: `feasibility-${activeSearch?.id || business.id}-${report?.reportId || 'current'}`,
                  prompt: `Please help with ${business.name} Feasibility Report.`,
                  pageLabel: `${business.name} Feasibility Report`,
                  context: {
                    page: 'feasibility_report',
                    business,
                    location: profile.location,
                    userProfile: profile,
                    feasibilityReport: report,
                    financialPlan: report?.financials,
                    schemeMatches: report?.schemeMatching?.matches || business.matchedSchemes || [],
                  },
                },
              })}
              className="flex items-center gap-2 bg-on-surface/5 border border-on-surface/10 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-on-surface/10 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">smart_toy</span>
              Ask Assistant
            </button>
            <button
              onClick={() => navigate('financial-plan')}
              className="flex items-center gap-2 bg-gradient-to-r from-[#FF5A00] to-[#FF8C00] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              View Passport
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 border-b border-outline-variant/10 mb-6">
          <button
            onClick={() => setActiveTab('report')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'report' ? 'border-[#FF5A00] text-[#FF5A00]' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          >
            Detailed Analysis
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'map' ? 'border-[#FF5A00] text-[#FF5A00]' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          >
            Local Business Map
            {profile.location.isDemoData && <span className="bg-amber-500/20 text-amber-500 text-[9px] px-1.5 py-0.5 rounded uppercase">Demo</span>}
          </button>
        </div>

        {activeTab === 'report' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left Column */}
            <div className="md:col-span-2 space-y-6">
              
              {/* Executive Summary */}
              <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10">
                <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-4 flex items-center justify-between">
                  Executive Summary
                  {report?.strategicAdvisory?.status === 'ready' && (
                    <span className="text-[10px] bg-[#FF5A00]/20 text-[#FF5A00] px-2 py-1 rounded-md">AI Verified</span>
                  )}
                </h3>
                
                {loading ? (
                  <div className="animate-pulse space-y-2 mb-4">
                    <div className="h-4 bg-on-surface/10 rounded w-full"></div>
                    <div className="h-4 bg-on-surface/10 rounded w-5/6"></div>
                    <div className="h-4 bg-on-surface/10 rounded w-4/6"></div>
                  </div>
                ) : error ? (
                  <div className="text-sm text-red-400 mb-4 bg-red-500/10 p-3 rounded-lg border border-red-500/20 flex justify-between items-center">
                    {error}
                    <button onClick={fetchReport} className="px-3 py-1 bg-red-500/20 rounded hover:bg-red-500/30">Retry</button>
                  </div>
                ) : (
                  <p className="text-sm text-on-surface leading-relaxed mb-4">
                    {report?.summary?.headline || `A location-aware feasibility view for ${business.name} in ${profile.location.district}.`} Financial, demand and scheme sections use the same planning assumptions as the Viability Passport.
                  </p>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-on-surface/5 rounded-xl p-3 border border-outline-variant/5">
                    <p className="text-[10px] text-on-surface-variant uppercase mb-1">Viability Score</p>
                    <p className="text-xl font-bold text-[#00FFA3]">{report?.summary?.viabilityScore ?? business.demandProxyScore}</p>
                  </div>
                  <div className="bg-on-surface/5 rounded-xl p-3 border border-outline-variant/5">
                    <p className="text-[10px] text-on-surface-variant uppercase mb-1">Competition</p>
                    <p className="text-xl font-bold text-on-surface capitalize">{business.competitorDensity}</p>
                  </div>
                  <div className="bg-on-surface/5 rounded-xl p-3 border border-outline-variant/5">
                    <p className="text-[10px] text-on-surface-variant uppercase mb-1">Est. Surplus</p>
                    <p className={`text-xl font-bold ${monthlySurplus > 0 ? 'text-[#00FFA3]' : 'text-red-300'}`}>₹{(monthlySurplus/1000).toFixed(0)}k</p>
                  </div>
                  <div className="bg-on-surface/5 rounded-xl p-3 border border-outline-variant/5">
                    <p className="text-[10px] text-on-surface-variant uppercase mb-1">Capital recovery</p>
                    <p className="text-xl font-bold text-on-surface">{recoveryMonths ? `~${recoveryMonths} mo` : 'Review plan'}</p>
                  </div>
                </div>
              </div>

              {/* AI Deep Dive */}
              <PanelErrorBoundary fallbackMessage="Strategic Advisory could not load." onRetry={fetchReport}>
                <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 min-h-[300px]">
                  <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-4">Strategic Advisory</h3>
                  
                  {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                      <div className="bg-on-surface/5 animate-pulse h-32 rounded-xl"></div>
                      <div className="bg-on-surface/5 animate-pulse h-32 rounded-xl"></div>
                    </div>
                  ) : report?.strategicAdvisory?.status === 'unavailable' || report?.strategicAdvisory?.status === 'error' ? (
                    <div className="mb-6 p-4 bg-red-500/10 rounded-xl border border-red-500/20 text-center">
                      <p className="text-xs text-on-surface/80 mb-2">{report.strategicAdvisory.message || "This insight is temporarily unavailable. Your financial plan is still available."}</p>
                      <button onClick={fetchReport} className="bg-red-500/20 text-red-500 px-4 py-1.5 rounded text-xs font-bold hover:bg-red-500/30 transition-colors">
                        Retry AI Insight
                      </button>
                    </div>
                  ) : (
                    <>
                      {report?.strategicAdvisory?.status === 'fallback' && (
                        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-center">
                          <p className="text-xs text-on-surface/80 mb-2">{report.strategicAdvisory.message}</p>
                          <button onClick={fetchReport} className="rounded bg-amber-500/15 px-4 py-1.5 text-xs font-bold text-amber-500 transition-colors hover:bg-amber-500/25">
                            Retry AI Insight
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
                          <h4 className="text-emerald-500 font-bold text-xs uppercase mb-2">Why Recommended</h4>
                          <ul className="text-xs text-on-surface/80 space-y-1 list-disc pl-4">
                            {report?.strategicAdvisory?.advisory?.whyRecommended?.map((r: any, i: number) => <li key={i}>{typeof r === 'object' ? JSON.stringify(r) : safeString(r)}</li>)}
                          </ul>
                        </div>
                        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
                          <h4 className="text-red-400 font-bold text-xs uppercase mb-2">Risks & Mitigations</h4>
                          <ul className="text-xs text-on-surface/80 space-y-2 pl-2">
                            {report?.strategicAdvisory?.advisory?.risksAndMitigations?.map((r: any, i: number) => (
                              <li key={i}>
                                <span className="font-bold text-red-400 block">{typeof r?.risk === 'object' ? JSON.stringify(r.risk) : (safeString(r?.risk) || 'Risk factor')}</span>
                                <span className="text-on-surface/60">{typeof r?.mitigation === 'object' ? JSON.stringify(r.mitigation) : (safeString(r?.mitigation) || typeof r === 'string' ? safeString(r) : 'Mitigation unavailable')}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </>
                  )}

                  <h4 className="text-xs font-bold text-on-surface mb-2">Data & Sources Provenance</h4>
                  <div className="bg-on-surface/5 p-4 rounded-xl border border-outline-variant/5 text-xs text-on-surface/70">
                    {loading ? (
                      <div className="animate-pulse h-6 bg-on-surface/10 rounded w-1/2"></div>
                    ) : Array.isArray(report?.sources) && report.sources.length > 0 ? (
                      <ul className="list-disc pl-4 space-y-2">
                        {report.sources.map((c: any, i: number) => (
                          <li key={i}>
                            <span className="font-bold">{safeString(c?.title)}</span> ({safeDate(c?.retrievedAt)}): {safeString(c?.claim)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      'Production source unavailable. Using deterministic estimates.'
                    )}
                  </div>
                </div>
              </PanelErrorBoundary>

              {!loading && (
                <section className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10">
                  <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-4">Market, costs & next steps</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="rounded-xl bg-on-surface/5 p-4">
                      <p className="text-xs font-bold text-on-surface mb-2">Demand & customers</p>
                      <p className="text-on-surface/70 text-xs">{market?.demand?.summary || business.signals || 'Local demand details are unavailable.'}</p>
                      <ul className="mt-3 space-y-1 text-xs text-on-surface/70">{(market?.customerSegments || []).slice(0, 3).map((segment: string) => <li key={segment}>• {segment}</li>)}</ul>
                    </div>
                    <div className="rounded-xl bg-on-surface/5 p-4">
                      <p className="text-xs font-bold text-on-surface mb-2">Cost & break-even</p>
                      <p className="text-xs text-on-surface/70">Startup cost: {safeCurrency(financials.projectCost)} · Monthly operating cost: {safeCurrency(financials.monthlyOperatingCost)}</p>
                      <p className="mt-2 text-xs text-on-surface/70">Monthly revenue needed: {safeCurrency(market?.breakEven?.monthlyRevenueNeeded)}.</p>
                      <p className="mt-2 text-xs text-on-surface/70">Estimated EMI: {safeCurrency(financials.monthlyEmi)} · {financials.emiToSurplusRatio ?? '—'}% of projected surplus.</p>
                    </div>
                    <div className="rounded-xl bg-red-500/5 border border-red-500/15 p-4">
                      <p className="text-xs font-bold text-red-300 mb-2">Risks & mitigations</p>
                      <ul className="space-y-2 text-xs text-on-surface/70">{(market?.risksAndMitigations || []).slice(0, 3).map((item: any, index: number) => <li key={index}><span className="font-semibold text-on-surface">{safeString(item?.risk)}</span><br />{safeString(item?.mitigation)}</li>)}</ul>
                    </div>
                    <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-4">
                      <p className="text-xs font-bold text-emerald-300 mb-2">Next steps</p>
                      <ol className="space-y-2 text-xs text-on-surface/70">{(market?.nextSteps || []).slice(0, 4).map((step: string, index: number) => <li key={step}>{index + 1}. {step}</li>)}</ol>
                    </div>
                  </div>
                </section>
              )}

            </div>

            {/* Right Column */}
            <div className="space-y-6">
              
              {/* Location Profile Context */}
              <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10">
                <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-4">Location Context</h3>
                {loading ? (
                  <div className="space-y-3">
                    <div className="h-8 bg-on-surface/5 animate-pulse rounded"></div>
                    <div className="h-8 bg-on-surface/5 animate-pulse rounded"></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] text-on-surface-variant uppercase">Primary Sectors</p>
                      <p className="text-sm font-semibold text-on-surface">{report?.locationContext?.primarySectors?.join(', ') || (profile?.location?.primarySectors || []).join(', ')}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-on-surface-variant uppercase">Population Base</p>
                      <p className="text-sm font-semibold text-on-surface">{report?.locationContext?.population?.toLocaleString('en-IN') || 'Official Census data unavailable'}</p>
                      {report?.locationContext?.census?.year && <p className="text-[10px] text-on-surface/45 mt-1">Census {report.locationContext.census.year} · {report.locationContext.census.geographicLevel || 'area'}</p>}
                    </div>
                    {report?.locationContext?.census?.attribution && <p className="text-[10px] text-on-surface/45 leading-relaxed">{report.locationContext.census.attribution}</p>}
                  </div>
                )}
              </div>

              {/* Scheme Matcher */}
              <div className="bg-surface-container-high rounded-2xl p-6 border border-[#FF5A00]/20 shadow-[0_4px_20px_rgba(255,90,0,0.05)] min-h-[300px]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[#FF5A00]">assured_workload</span>
                  <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Scheme Matching</h3>
                </div>
                <p className="text-xs text-on-surface/60">Based on your {profile.isArtisan ? 'artisan' : ''} profile in {profile.location.state}.</p>
                
                {loading ? (
                  <div className="mt-4 space-y-4">
                    <div className="h-24 bg-on-surface/5 animate-pulse rounded-xl"></div>
                    <div className="h-24 bg-on-surface/5 animate-pulse rounded-xl"></div>
                  </div>
                ) : (
                  <SchemeMatcher 
                    status={report?.schemeMatching?.status || "unavailable"}
                    matches={report?.schemeMatching?.matches || []}
                    message={report?.schemeMatching?.message}
                    sources={report?.schemeMatching?.sources || []}
                    providerStatus={report?.schemeMatching?.providerStatus}
                    retrievedAt={report?.schemeMatching?.retrievedAt}
                    onRetry={fetchReport}
                  />
                )}
              </div>

            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            <PanelErrorBoundary fallbackMessage="The map visualization could not be loaded.">
              <LocalBusinessMap location={profile.location} business={business} />
            </PanelErrorBoundary>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
