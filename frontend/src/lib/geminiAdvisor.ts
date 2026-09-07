/**
 * geminiAdvisor.ts — AI-powered feasibility analysis for Arthniti
 * Delegates all AI processing to the Arthniti Python backend.
 */

import type { FinancialResult, ViabilityFactor } from './financialCalculator';
import { LocationProfile, BusinessItem } from '../providers/types';

// Feasibility report orchestration moved to backend: POST /api/feasibility/report

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

export type ModelSource = 'gemini' | 'openrouter' | 'ollama' | 'ollama_cloud';

export type ChatResult =
  | { ok: true; response: string }
  | { ok: false; statusCode: number; message: string };

export async function chatWithAdvisor(
  message: string,
  fullContext?: {
    language?: string;
    modelSource?: ModelSource;
    location?: any;
    businessDiscoveryResults?: any[];
    selectedBusinesses?: any[];
    comparison?: any;
    financialPlan?: any;
    schemeMatches?: any[];
    sourceMetadata?: any[];
    context?: any;
  }
): Promise<ChatResult> {
  try {
    const res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        ...fullContext
      }),
    });

    if (!res.ok) {
      let detail = 'AI service is unavailable. Retry after the service is restored.';
      try {
        const errBody = await res.json();
        if (typeof errBody?.detail === 'string') detail = errBody.detail;
      } catch { /* ignore */ }
      return { ok: false, statusCode: res.status, message: detail };
    }

    const data = await res.json();
    return { ok: true, response: data.response };
  } catch (err) {
    console.error('Chat error:', err);
    return {
      ok: false,
      statusCode: 0,
      message: 'AI service is unavailable. Retry after the service is restored.',
    };
  }
}

export async function fetchAiHealth(source: ModelSource): Promise<{
  status: 'connected' | 'unavailable' | 'not_configured';
  provider: string;
  model: string | null;
  checkedAt: string;
  safeReason: string;
}> {
  const res = await fetch(`${API_BASE}/api/ai/health?source=${source}`);
  if (!res.ok) throw new Error(`health_${res.status}`);
  const data = await res.json();
  return {
    status: data.status,
    provider: data.provider || 'gemini',
    model: data.model || null,
    checkedAt: data.checkedAt || '',
    safeReason: data.safeReason || '',
  };
}
