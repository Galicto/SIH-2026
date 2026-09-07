import React, { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX } from '../context/PredXContext';
import { useLanguage } from '../lib/i18n';
import { BusinessItem } from '../providers/types';
import { API_BASE_URL } from '../config';

type DiscoverMeta = {
  provider?: string;
  providerStatus?: string;
  radiusKm?: number;
  retrievedAt?: string;
  latitude?: number;
  longitude?: number;
  coordSource?: string;
  elementCount?: number;
  safeMessage?: string;
  jobsConnected?: boolean;
  filtersApplied?: { withinBudget?: boolean; category?: string | null; schemeSupported?: boolean };
  fallbackNote?: string;
};

type FilteredOut = { id: string; name: string; reason: string };

type EnrichedBusiness = BusinessItem & {
  competitorCount?: number;
  signals?: string;
  provenance?: { source?: string; retrievedAt?: string; confidence?: string };
  matchedSchemes?: any[];
  radiusKm?: number;
  nearbySignals?: any;
};

export default function ExploreBusinesses() {
  const { navigate } = usePredX();
  const { t } = useLanguage();

  const [profile, setProfile] = useState<any>(null);
  const [businesses, setBusinesses] = useState<EnrichedBusiness[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<'ok' | 'provider_unavailable' | 'no_suitable' | 'error'>('ok');
  const [meta, setMeta] = useState<DiscoverMeta | null>(null);
  const [filteredOut, setFilteredOut] = useState<FilteredOut[]>([]);
  const [radiusKm, setRadiusKm] = useState<5 | 10 | 20>(5);
  const [manualNote, setManualNote] = useState('');

  const [filterWorkType, setFilterWorkType] = useState('');
  const [filterCapital, setFilterCapital] = useState(true);
  const [filterScheme, setFilterScheme] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchRef = useRef(0);

  const buildLocationPayload = (p: any, radius: number) => {
    const loc = p.location || {};
    const coords = loc.coordinates || {};
    return {
      latitude: loc.latitude ?? coords.lat ?? loc.lat ?? null,
      longitude: loc.longitude ?? coords.lng ?? loc.lng ?? null,
      state: loc.state || '',
      district: loc.district || '',
      cityOrVillage: loc.cityOrVillage || loc.village || loc.district || '',
      radiusKm: radius,
      coordinates: coords.lat != null ? coords : undefined,
    };
  };

  const fetchBusinesses = useCallback(async (p: any, opts?: { radius?: number; withinBudget?: boolean; category?: string; schemeSupported?: boolean }) => {
    const reqId = ++fetchRef.current;
    setIsLoading(true);
    const radius = opts?.radius ?? radiusKm;
    const withinBudget = opts?.withinBudget ?? filterCapital;
    const category = opts?.category ?? filterWorkType;
    const schemeSupported = opts?.schemeSupported ?? filterScheme;

    try {
      const payload = {
        location: buildLocationPayload(p, radius),
        budget: p.marginCapital ?? 0,
        profile: {
          skills: p.skillLevel ? [p.skillLevel] : [],
          workPreference: p.workType || '',
          spaceStatus: p.businessSpace || '',
          availability: p.timeAvailability || '',
          skillLevel: p.skillLevel || '',
          isArtisan: !!p.isArtisan,
          isWomenEnterprise: p.gender === 'Female',
        },
        filters: {
          category: category || '',
          withinBudget: !!withinBudget,
          schemeSupported: !!schemeSupported,
        },
        // legacy compat
        marginCapital: withinBudget ? (p.marginCapital ?? 0) : 0,
        workType: category || '',
        isArtisan: !!p.isArtisan,
        isWomenEnterprise: p.gender === 'Female',
        radius: `${radius}km`,
      };

      const res = await fetch(`${API_BASE_URL}/api/business/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (reqId !== fetchRef.current) return;
      if (!res.ok) throw new Error(`discover_${res.status}`);

      const data = await res.json();
      // Support both structured response and legacy array
      const results: EnrichedBusiness[] = Array.isArray(data) ? data : (data.results || []);
      const nextStatus = Array.isArray(data) ? (results.length ? 'ok' : 'provider_unavailable') : (data.status || 'ok');
      const nextMeta: DiscoverMeta = Array.isArray(data) ? {} : (data.meta || {});
      const nextFiltered: FilteredOut[] = Array.isArray(data) ? [] : (data.filteredOut || []);

      setBusinesses(results);
      setStatus(nextStatus === 'no_suitable' || nextStatus === 'provider_unavailable' || nextStatus === 'ok' ? nextStatus : 'error');
      setMeta(nextMeta);
      setFilteredOut(nextFiltered);

      sessionStorage.setItem('arthniti-discovery-results', JSON.stringify(results));
      sessionStorage.setItem('arthniti-discovery-meta', JSON.stringify(nextMeta));
      if (manualNote.trim()) {
        sessionStorage.setItem('arthniti-manual-observations', manualNote.trim());
      }
    } catch (e) {
      if (reqId !== fetchRef.current) return;
      setBusinesses([]);
      setStatus('provider_unavailable');
      setMeta({ safeMessage: 'Live local-business data is unavailable for this area right now.' });
      setFilteredOut([]);
    } finally {
      if (reqId === fetchRef.current) setIsLoading(false);
    }
  }, [radiusKm, filterCapital, filterWorkType, filterScheme, manualNote]);

  useEffect(() => {
    const saved = sessionStorage.getItem('arthniti-profile');
    if (saved) {
      const parsed = JSON.parse(saved);
      setProfile(parsed);
      fetchBusinesses(parsed);
    } else {
      navigate('advisory');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    if (profile) fetchBusinesses(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterWorkType, filterCapital, filterScheme, radiusKm]);

  const activeFilterCount = [filterWorkType, filterCapital, filterScheme].filter(Boolean).length;

  const clearFilters = () => {
    setFilterWorkType('');
    setFilterCapital(false);
    setFilterScheme(false);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const handleCompare = () => {
    if (selectedIds.length < 2) return;
    const selectedBusinesses = businesses.filter(b => selectedIds.includes(b.id));
    sessionStorage.setItem('arthniti-compared-businesses', JSON.stringify(selectedBusinesses));
    navigate('compare');
  };

  if (!profile) return null;

  return (
    <DashboardLayout>
      <div className="px-4 md:px-8 pb-12 pt-4 max-w-7xl mx-auto">
        <section className="mb-8 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-headline font-bold text-on-surface mb-2">Explore Businesses</h1>
            <p className="text-on-surface/60 text-sm font-body max-w-2xl">
              Showing opportunities tailored for <span className="font-bold text-on-surface">{profile.location.district}</span>
              {meta?.provider ? <> · Source: {meta.provider}</> : null}
              {meta?.retrievedAt ? <> · {new Date(meta.retrievedAt).toLocaleString('en-IN')}</> : null}
            </p>
          </div>
          <button
            onClick={handleCompare}
            disabled={selectedIds.length < 2}
            className="shrink-0 bg-gradient-to-r from-primary to-[#FF8C00] text-on-primary font-headline font-bold py-2.5 px-6 rounded-xl text-sm hover:shadow-[0_0_20px_rgb(var(--primary)/0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            Compare Selected ({selectedIds.length}/3)
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </section>

        {/* Filters */}
        <section className="mb-6 flex flex-wrap items-center gap-3">
          <select
            value={filterWorkType}
            onChange={e => setFilterWorkType(e.target.value)}
            className="bg-surface-container border border-outline-variant/10 rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none"
          >
            <option value="">All Categories</option>
            <option value="retail">Retail</option>
            <option value="service">Services</option>
            <option value="manufacturing">Manufacturing</option>
            <option value="agriculture-linked">Agriculture Linked</option>
          </select>

          <select
            value={radiusKm}
            onChange={e => setRadiusKm(Number(e.target.value) as 5 | 10 | 20)}
            className="bg-surface-container border border-outline-variant/10 rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none"
          >
            <option value={5}>Radius 5 km</option>
            <option value={10}>Radius 10 km</option>
            <option value={20}>Radius 20 km</option>
          </select>

          <label className="flex items-center gap-2 bg-surface-container border border-outline-variant/10 rounded-lg px-3 py-1.5 text-xs text-on-surface cursor-pointer hover:bg-surface-container-high transition-colors">
            <input type="checkbox" checked={filterCapital} onChange={e => setFilterCapital(e.target.checked)} className="rounded text-primary focus:ring-primary/50" />
            Within my budget (₹{Number(profile.marginCapital || 0).toLocaleString('en-IN')})
          </label>

          <label className="flex items-center gap-2 bg-surface-container border border-outline-variant/10 rounded-lg px-3 py-1.5 text-xs text-on-surface cursor-pointer hover:bg-surface-container-high transition-colors">
            <input type="checkbox" checked={filterScheme} onChange={e => setFilterScheme(e.target.checked)} className="rounded text-primary focus:ring-primary/50" />
            Scheme Supported
          </label>

          {activeFilterCount > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface/50">
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
            </span>
          )}

          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs text-primary underline ml-1">Clear all filters</button>
          )}
        </section>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface/60">
            <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="font-headline font-bold">Searching nearby businesses and opportunity signals…</p>
          </div>
        ) : status === 'provider_unavailable' ? (
          <div className="bg-surface-container p-8 rounded-2xl text-center border border-outline-variant/10 max-w-2xl mx-auto mt-10">
            <span className="material-symbols-outlined text-4xl text-on-surface/40 mb-3">satellite_alt</span>
            <h3 className="text-lg font-bold text-on-surface mb-2">Live local-business data is unavailable for this area right now.</h3>
            <p className="text-sm text-on-surface/60 mb-6">
              {meta?.safeMessage || 'We could not fetch live points of interest for this radius.'}
            </p>
            <div className="flex flex-wrap justify-center gap-3 mb-6">
              <button onClick={() => fetchBusinesses(profile)} className="bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/20">Retry search</button>
              <button onClick={() => setRadiusKm(10)} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-xl text-sm font-bold">Increase radius to 10 km</button>
              <button onClick={() => setRadiusKm(20)} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-xl text-sm font-bold">Increase radius to 20 km</button>
              <button onClick={() => navigate('advisory')} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-xl text-sm font-bold hover:bg-surface-container-highest">Edit location</button>
            </div>
            <div className="text-left max-w-md mx-auto">
              <label className="text-xs font-bold text-on-surface/70 block mb-2">Add manual local observations</label>
              <textarea
                value={manualNote}
                onChange={e => setManualNote(e.target.value)}
                rows={3}
                placeholder="e.g. 2 kirana shops on main road, no print shop near school…"
                className="w-full bg-on-surface/5 border border-outline-variant/20 rounded-xl px-3 py-2 text-sm text-on-surface"
              />
              <button
                onClick={() => {
                  sessionStorage.setItem('arthniti-manual-observations', manualNote);
                  fetchBusinesses(profile);
                }}
                className="mt-2 text-xs font-bold text-primary"
              >
                Save observations & retry
              </button>
            </div>
          </div>
        ) : status === 'no_suitable' || businesses.length === 0 ? (
          <div className="bg-surface-container p-8 rounded-2xl text-center border border-outline-variant/10 max-w-2xl mx-auto mt-10">
            <span className="material-symbols-outlined text-4xl text-on-surface/40 mb-3">filter_list_off</span>
            <h3 className="text-lg font-bold text-on-surface mb-2">Local data was found, but no option currently fits your budget and selected filters.</h3>
            <p className="text-sm text-on-surface/60 mb-4">
              Your margin capital is ₹{Number(profile.marginCapital || 0).toLocaleString('en-IN')}.
              {meta?.elementCount != null ? ` Map provider returned ${meta.elementCount} local points.` : ''}
            </p>
            {filteredOut.length > 0 && (
              <ul className="text-left text-xs text-on-surface/70 mb-6 space-y-2 max-w-md mx-auto">
                {(filteredOut || []).slice(0, 6).map(f => (
                  <li key={f.id} className="bg-on-surface/5 rounded-lg px-3 py-2">
                    <span className="font-bold text-on-surface">{f.name}:</span> {f.reason}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => setFilterCapital(false)} className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-[#FF8C00]">Remove budget filter</button>
              <button onClick={() => setFilterWorkType('')} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-xl text-sm font-bold">Change category</button>
              <button onClick={() => setRadiusKm(radiusKm === 5 ? 10 : 20)} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-xl text-sm font-bold">Increase radius</button>
              <button onClick={() => navigate('advisory')} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-xl text-sm font-bold">Add more margin capital</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {(businesses || []).map(b => {
              const isSelected = selectedIds.includes(b.id);
              const isSelectable = isSelected || selectedIds.length < 3;
              return (
                <div
                  key={b.id}
                  onClick={() => isSelectable && toggleSelection(b.id)}
                  className={`bg-surface-container-low rounded-2xl border transition-all cursor-pointer overflow-hidden ${
                    isSelected
                      ? 'border-primary shadow-[0_4px_20px_rgb(var(--primary)/0.15)] ring-1 ring-primary'
                      : isSelectable
                        ? 'border-outline-variant/10 hover:border-primary/50 hover:bg-surface-container'
                        : 'border-outline-variant/5 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="text-lg font-headline font-bold text-on-surface leading-tight">{b.name}</h3>
                      <div className={`shrink-0 w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                        isSelected ? 'bg-primary border-primary text-on-primary' : 'border-outline-variant/30 text-transparent'
                      }`}>
                        <span className="material-symbols-outlined text-[14px]">check</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant uppercase">{b.category}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
                        b.competitorDensity === 'low' ? 'bg-success/15 text-success' :
                        b.competitorDensity === 'medium' ? 'bg-warning/15 text-warning' :
                        'bg-error/15 text-error'
                      }`}>{b.competitorDensity} Competition · {b.competitorCount ?? '—'} listings</span>
                      {b.schemeSupported && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-primary/15 text-primary uppercase">Scheme match</span>
                      )}
                    </div>

                    <div className="bg-on-surface/5 rounded p-2 mb-4">
                      <p className="text-[10px] text-on-surface-variant mb-1 font-bold">Nearby signals</p>
                      <p className="text-xs text-on-surface">{b.signals || 'Live demand signals retrieved for this idea.'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-surface-container rounded-lg p-2 border border-outline-variant/5">
                        <p className="text-[9px] text-on-surface-variant uppercase tracking-wider mb-0.5">Avg Revenue</p>
                        <p className="text-sm font-bold text-success">₹{((b.avgRevenue || 0) / 1000).toFixed(0)}k <span className="text-[10px] text-on-surface/50 font-normal">/mo</span></p>
                      </div>
                      <div className="bg-surface-container rounded-lg p-2 border border-outline-variant/5">
                        <p className="text-[9px] text-on-surface-variant uppercase tracking-wider mb-0.5">Startup cost</p>
                        <p className="text-sm font-bold text-on-surface">₹{((b.minCapital || 0) / 1000).toFixed(0)}k–₹{((b.maxCapital || 0) / 1000).toFixed(0)}k</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-3 border-t border-outline-variant/10 text-[9px] text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">verified</span>
                        {b.provenance?.source || meta?.provider || 'OpenStreetMap'}
                      </span>
                      <span>
                        {b.radiusKm || radiusKm} km · {b.provenance?.confidence || 'medium'} confidence
                      </span>
                    </div>
                    <p className="text-[9px] text-on-surface/40 mt-1">
                      Retrieved {b.provenance?.retrievedAt ? new Date(b.provenance.retrievedAt).toLocaleString('en-IN') : '—'}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSelection(b.id); }}
                      className="mt-3 w-full text-xs font-bold py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/10"
                    >
                      {isSelected ? 'Selected for compare' : 'Add to Compare'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {import.meta.env.DEV && meta && (
          <div className="mt-8 p-4 rounded-xl bg-on-surface/5 border border-outline-variant/10 text-[10px] font-mono text-on-surface/50">
            <p className="font-bold mb-1 uppercase tracking-wider">Dev diagnostics</p>
            <p>provider: {meta.provider || '—'} · status: {status} · elements: {meta.elementCount ?? '—'}</p>
            <p>coords: {meta.latitude}, {meta.longitude} ({meta.coordSource}) · radius: {meta.radiusKm} km</p>
            <p>jobs connected: {meta.jobsConnected ? 'yes' : 'no'}</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
