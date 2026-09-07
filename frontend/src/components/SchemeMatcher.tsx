import React, { useEffect, useState } from 'react';
import { normalizeSchemeMatchResponse } from '../lib/schemas';
import { safeCurrency, safeString, safeDate } from '../lib/safeFormatters';
import PanelErrorBoundary from './PanelErrorBoundary';

interface SchemeMatcherProps {
  status?: "checking" | "ready" | "unavailable" | "no_match" | "error";
  matches?: any[];
  message?: string;
  sources?: any[];
  providerStatus?: string;
  retrievedAt?: string | null;
  onRetry?: () => void;
  profile?: any;
}

function SchemeMatcherContent({ status: propsStatus, matches: propsMatches, message: propsMessage, sources: propsSources, providerStatus: propsProviderStatus, retrievedAt: propsRetrievedAt, onRetry, profile }: SchemeMatcherProps) {
  const [internalState, setInternalState] = useState<{
    status: "checking" | "ready" | "unavailable" | "no_match" | "error";
    matches: any[];
    message: string;
    sources: any[];
    providerStatus: string;
    retrievedAt: string | null;
  }>({
    status: "ready",
    matches: [],
    message: "",
    sources: [],
    providerStatus: "connected",
    retrievedAt: null
  });

  useEffect(() => {
    if (propsStatus !== undefined && propsMatches !== undefined) {
      setInternalState({
        status: propsStatus,
        matches: Array.isArray(propsMatches) ? propsMatches : [],
        message: propsMessage || "",
        sources: Array.isArray(propsSources) ? propsSources : [],
        providerStatus: propsProviderStatus || "connected",
        retrievedAt: propsRetrievedAt || null
      });
      return;
    }
    
    if (profile) {
      setInternalState(prev => ({ ...prev, status: "checking" }));
      const controller = new AbortController();
      fetch('http://localhost:8000/api/schemes/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessCategory: profile.category,
          userProfile: profile,
          location: { state: profile.state }
        }),
        signal: controller.signal
      })
      .then(r => r.json())
      .then(data => {
         const normalized = normalizeSchemeMatchResponse(data);
         setInternalState({
           status: normalized.status,
           matches: normalized.matches,
           message: normalized.message,
           sources: normalized.sources,
           providerStatus: normalized.providerStatus,
           retrievedAt: normalized.retrievedAt
         });
      })
      .catch(e => {
         if (e.name === 'AbortError') return;
         setInternalState(prev => ({ ...prev, status: "error", message: "We could not process scheme matching right now." }));
      });
      
      return () => controller.abort();
    }
  }, [propsStatus, propsMatches, propsMessage, propsSources, propsProviderStatus, propsRetrievedAt, profile]);

  const state = propsStatus !== undefined ? {
    status: propsStatus,
    matches: Array.isArray(propsMatches) ? propsMatches : [],
    message: propsMessage || "",
    sources: Array.isArray(propsSources) ? propsSources : [],
    providerStatus: propsProviderStatus || "connected",
    retrievedAt: propsRetrievedAt || null
  } : internalState;

  if (state.status === "checking") {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-on-surface/5 animate-pulse rounded-xl"></div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="text-xs text-on-surface/80 p-4 bg-error/10 rounded-xl text-center border border-error/20">
        <p className="mb-2 font-bold">{state.message || "We could not process scheme matching right now."}</p>
        {(onRetry || profile) && (
          <button onClick={onRetry || (() => setInternalState(prev => ({ ...prev, status: "checking" })))} className="bg-error/20 text-error px-4 py-1.5 rounded text-xs font-bold hover:bg-error/30 transition-colors">
            Retry
          </button>
        )}
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="text-xs text-on-surface/80 p-4 bg-warning/10 rounded-xl text-center border border-warning/20">
        <p className="mb-2 font-bold">{state.message || "Verified scheme information is temporarily unavailable."}</p>
        <div className="flex justify-center gap-2">
          {(onRetry || profile) && (
            <button onClick={onRetry || (() => setInternalState(prev => ({ ...prev, status: "checking" })))} className="bg-warning/20 text-warning px-4 py-1.5 rounded text-xs font-bold hover:bg-warning/30 transition-colors">
              Retry scheme matching
            </button>
          )}
        </div>
      </div>
    );
  }

  if (state.status === "no_match" || (state.status === "ready" && state.matches.length === 0)) {
    return (
      <div className="text-xs text-on-surface/50 p-4 bg-on-surface/5 rounded-xl text-center">
        <p className="mb-2 font-bold text-on-surface-variant">{state.message || "No verified scheme match was found for this business profile."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Relevant Schemes</h4>
      {(state.matches || []).map((m, idx) => (
        <div key={idx} className="bg-surface-container rounded-xl p-4 border border-outline-variant/10">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h5 className="text-sm font-bold text-on-surface leading-tight">{safeString(m?.name)}</h5>
              <p className="text-[10px] text-on-surface-variant">{safeString(m?.agency)}</p>
            </div>
            {m?.officialUrl && (
              <a href={m.officialUrl} target="_blank" rel="noreferrer" className="shrink-0 w-6 h-6 bg-primary/10 text-primary rounded flex items-center justify-center hover:bg-primary/20 transition-colors" title="Official Source">
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </a>
            )}
          </div>
          
          {m?.whyRelevant && (
            <div className="bg-primary/5 text-primary text-[11px] p-2 rounded mb-3 border border-primary/10 font-medium">
              <span className="material-symbols-outlined text-[12px] align-middle mr-1">tips_and_updates</span>
              {safeString(m.whyRelevant)}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-[10px] mb-3">
            <div>
              <span className="text-on-surface/50 block">Max Project Cost</span>
              <span className="font-semibold text-on-surface">{safeCurrency(m?.maxProjectCost)}</span>
            </div>
            <div>
              <span className="text-on-surface/50 block">Description</span>
              <span className="font-semibold text-on-surface">{safeString(m?.description)}</span>
            </div>
          </div>

          <div className="text-[10px] mb-3">
            <span className="text-on-surface/50 block mb-1">Required Documents to prepare:</span>
            <ul className="list-disc pl-4 text-on-surface/70 space-y-0.5">
              {Array.isArray(m?.requiredDocuments) ? m.requiredDocuments.map((doc: string, i: number) => (
                <li key={i}>{safeString(doc)}</li>
              )) : <li>Not available</li>}
            </ul>
          </div>
          
          <div className="bg-on-surface/5 p-3 rounded-xl border border-outline-variant/5 text-[9px] text-on-surface/70">
            <p className="font-bold mb-1">Data & Sources</p>
            {m?.provenance ? (
              <ul className="list-disc pl-4">
                <li><span className="font-semibold">Source:</span> {safeString(m.provenance.source)}</li>
                <li><span className="font-semibold">Confidence:</span> {safeString(m.provenance.confidence)}</li>
                <li><span className="font-semibold">Retrieved:</span> {safeDate(m.provenance.retrievedAt)}</li>
              </ul>
            ) : (
              'Source metadata unavailable.'
            )}
          </div>
          
          <div className="mt-3 pt-2 border-t border-outline-variant/5 flex items-center justify-between text-[9px] text-on-surface/40">
            <span>{safeString(m?.verificationNote, "Subject to bank approval")}</span>
            <span>{safeString(m?.applicationRoute, "Contact local branch")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SchemeMatcher(props: SchemeMatcherProps) {
  return (
    <PanelErrorBoundary fallbackMessage="Scheme Matcher could not load." onRetry={props.onRetry}>
      <SchemeMatcherContent {...props} />
    </PanelErrorBoundary>
  );
}
