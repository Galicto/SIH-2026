import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export default function ProviderStatusBadge() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'unavailable'>('checking');
  
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/health`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'ok') {
          setStatus('connected');
        } else {
          setStatus('unavailable');
        }
      })
      .catch(() => setStatus('unavailable'));
  }, []);

  if (status === 'checking') {
    return (
      <div className="mt-3 inline-flex items-center gap-2 bg-on-surface/5 px-3 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse"></span>
        <span className="text-[10px] font-label text-on-surface/50 uppercase tracking-widest font-bold">Checking data sources…</span>
      </div>
    );
  }

  if (status === 'unavailable') {
    return (
      <div className="mt-3 inline-flex items-center gap-2 bg-error/10 px-3 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
        <span className="text-[10px] font-label text-error uppercase tracking-widest font-bold">Some data sources unavailable</span>
      </div>
    );
  }

  return (
    <div className="mt-3 inline-flex items-center gap-2 bg-success/10 px-3 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
      <span className="text-[10px] font-label text-success uppercase tracking-widest font-bold">Verified sources connected</span>
    </div>
  );
}
