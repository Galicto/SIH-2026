import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX } from '../context/PredXContext';

export default function LocalOpportunities() {
  const { navigate } = usePredX();

  const [profile, setProfile] = useState<any>(null);
  const [discovery, setDiscovery] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const saved = sessionStorage.getItem('arthniti-profile');
    if (saved) setProfile(JSON.parse(saved));
    try {
      setDiscovery(JSON.parse(sessionStorage.getItem('arthniti-discovery-results') || '[]'));
      setMeta(JSON.parse(sessionStorage.getItem('arthniti-discovery-meta') || 'null'));
    } catch { /* ignore */ }
    setIsLoading(false);
  }, []);

  const businessOpps = discovery.slice(0, 6);
  const retrievedAt = meta?.retrievedAt || new Date().toISOString();

  return (
    <DashboardLayout>
      <div className="px-4 md:px-8 pb-12 pt-4 max-w-7xl mx-auto">
        <section className="mb-8">
          <h1 className="text-3xl font-headline font-bold text-on-surface mb-2">Local Opportunities</h1>
          <p className="text-on-surface/60 text-sm font-body max-w-2xl">
            {profile
              ? `Business opportunity signals near ${profile.location.district}. Jobs and business opportunities are shown as separate categories.`
              : 'Set your location to see hyper-local demand signals and opportunities.'}
          </p>
        </section>

        {!profile ? (
          <div className="bg-surface-container p-8 rounded-2xl text-center border border-outline-variant/10 max-w-2xl mx-auto mt-10">
            <span className="material-symbols-outlined text-4xl text-on-surface/40 mb-3">location_off</span>
            <h3 className="text-lg font-bold text-on-surface mb-2">Location Not Set</h3>
            <p className="text-sm text-on-surface/60 mb-6">We need your location to show relevant local opportunities.</p>
            <button onClick={() => navigate('advisory')} className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-[#FF8C00]">Set Location</button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="bg-surface-container border border-outline-variant/10 p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">storefront</span>
                <h2 className="text-xl font-headline font-bold text-on-surface">Business Opportunities</h2>
              </div>
              <p className="text-sm text-on-surface/70 mb-4">
                Based on live map market signals near your location — not job listings.
              </p>

              {isLoading ? (
                <p className="text-sm text-on-surface/50">Loading…</p>
              ) : businessOpps.length === 0 ? (
                <div className="bg-on-surface/5 p-4 rounded-xl">
                  <p className="text-sm text-on-surface/70 mb-3">No discovery results in this session yet.</p>
                  <button onClick={() => navigate('explore')} className="text-xs text-primary font-bold hover:underline">Run Explore Businesses →</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {businessOpps.map((b: any) => (
                    <div key={b.id} className="bg-on-surface/5 p-4 rounded-xl border border-outline-variant/5">
                      <h3 className="text-sm font-bold text-on-surface mb-2">{b.name}</h3>
                      <p className="text-xs text-on-surface/60 mb-2">{b.signals}</p>
                      <p className="text-[10px] text-on-surface/40">
                        Source: {b.provenance?.source || meta?.provider || 'OpenStreetMap'} · {new Date(b.provenance?.retrievedAt || retrievedAt).toLocaleString('en-IN')}
                      </p>
                      <button onClick={() => navigate('explore')} className="mt-2 text-xs text-primary font-bold hover:underline">Explore Businesses →</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-surface-container border border-outline-variant/10 p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">school</span>
                <h2 className="text-xl font-headline font-bold text-on-surface">Training & entrepreneurship support</h2>
              </div>
              <div className="space-y-3">
                <div className="bg-on-surface/5 p-4 rounded-xl">
                  <h3 className="text-sm font-bold text-on-surface mb-1">PM Vishwakarma — skill training & toolkit</h3>
                  <p className="text-xs text-on-surface/60 mb-2">Official programme for traditional artisans and craftspeople.</p>
                  <a href="https://pmvishwakarma.gov.in/" target="_blank" rel="noreferrer" className="text-xs text-primary font-bold">pmvishwakarma.gov.in</a>
                  <p className="text-[10px] text-on-surface/40 mt-1">Source: Ministry of MSME · verified official URL</p>
                </div>
                <div className="bg-on-surface/5 p-4 rounded-xl">
                  <h3 className="text-sm font-bold text-on-surface mb-1">PMMY / MUDRA — self-employment credit</h3>
                  <p className="text-xs text-on-surface/60 mb-2">Collateral-free micro credit for non-farm micro enterprises.</p>
                  <a href="https://www.mudra.org.in/" target="_blank" rel="noreferrer" className="text-xs text-primary font-bold">mudra.org.in</a>
                  <p className="text-[10px] text-on-surface/40 mt-1">Source: Ministry of Finance · verified official URL</p>
                </div>
              </div>
            </div>

            <div className="bg-surface-container border border-outline-variant/10 p-6 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-2xl">work</span>
                  <h2 className="text-xl font-headline font-bold text-on-surface">Jobs</h2>
                </div>
                <span className="bg-on-surface/10 text-on-surface/60 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Not connected</span>
              </div>
              <div className="bg-on-surface/5 border border-outline-variant/10 p-4 rounded-xl">
                <p className="text-sm text-on-surface/80 leading-relaxed">
                  Live job listings are not connected. Vyapar-Mitra is currently showing business opportunities based on local market signals.
                </p>
                <p className="text-[10px] text-on-surface/40 mt-2">
                  No job-board scraping. Approved job APIs can be added when credentials and legal access exist.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
