import { z } from 'zod';

// Scheme Match Schema
export const SchemeMatchResponseSchema = z.object({
  status: z.enum(['ready', 'no_match', 'unavailable', 'error']),
  matches: z.array(z.any()),
  message: z.string(),
  sources: z.array(z.any()),
  retrievedAt: z.string().nullable(),
  providerStatus: z.enum(['connected', 'unavailable', 'not_configured'])
});

export function normalizeSchemeMatchResponse(payload: any) {
  const parsed = SchemeMatchResponseSchema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }
  
  // Safe Fallback Normalizer
  return {
    status: (['ready', 'no_match', 'unavailable', 'error'].includes(payload?.status) ? payload.status : 'error') as 'ready' | 'no_match' | 'unavailable' | 'error',
    matches: Array.isArray(payload?.matches) ? payload.matches : (Array.isArray(payload?.schemes) ? payload.schemes : []),
    message: typeof payload?.message === 'string' ? payload.message : 'Invalid response from scheme provider.',
    sources: Array.isArray(payload?.sources) ? payload.sources : [],
    retrievedAt: typeof payload?.retrievedAt === 'string' ? payload.retrievedAt : null,
    providerStatus: (['connected', 'unavailable', 'not_configured'].includes(payload?.providerStatus) ? payload.providerStatus : 'unavailable') as 'connected' | 'unavailable' | 'not_configured'
  };
}

// Strategic Advisory Schema
export const StrategicAdvisoryResponseSchema = z.object({
  status: z.enum(['ready', 'unavailable', 'error']),
  advisory: z.object({
    whyRecommended: z.array(z.any()),
    risksAndMitigations: z.array(z.any()),
    opportunities: z.array(z.any()),
    dataGaps: z.array(z.any()),
    confidence: z.enum(['high', 'medium', 'low']).nullable()
  }),
  message: z.string(),
  citations: z.array(z.any()),
  generatedAt: z.string().nullable()
});

export function normalizeStrategicAdvisoryResponse(payload: any) {
  const parsed = StrategicAdvisoryResponseSchema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }
  
  // Safe Fallback Normalizer
  const advisory = payload?.advisory || {};
  return {
    status: (['ready', 'unavailable', 'error'].includes(payload?.status) ? payload.status : 'error') as 'ready' | 'unavailable' | 'error',
    advisory: {
      whyRecommended: Array.isArray(advisory?.whyRecommended) ? advisory.whyRecommended : (Array.isArray(payload?.whyRecommended) ? payload.whyRecommended : []),
      risksAndMitigations: Array.isArray(advisory?.risksAndMitigations) ? advisory.risksAndMitigations : (Array.isArray(payload?.risksAndMitigations) ? payload.risksAndMitigations : []),
      opportunities: Array.isArray(advisory?.opportunities) ? advisory.opportunities : [],
      dataGaps: Array.isArray(advisory?.dataGaps) ? advisory.dataGaps : (Array.isArray(payload?.dataGaps) ? payload.dataGaps : []),
      confidence: ['high', 'medium', 'low'].includes(advisory?.confidence) ? advisory.confidence : null
    },
    message: typeof payload?.message === 'string' ? payload.message : 'AI Advisory unavailable.',
    citations: Array.isArray(payload?.citations) ? payload.citations : [],
    generatedAt: typeof payload?.generatedAt === 'string' ? payload.generatedAt : null
  };
}

// Full Feasibility Report Schema
export const FeasibilityReportResponseSchema = z.object({
  status: z.enum(['complete', 'partial', 'error']),
  reportId: z.string(),
  generatedAt: z.string(),
  summary: z.any(),
  financials: z.any(),
  locationContext: z.any(),
  marketAnalysis: z.any().optional(),
  strategicAdvisory: z.any(),
  schemeMatching: z.any(),
  sources: z.array(z.any()),
  dataGaps: z.array(z.any()),
  providerStatus: z.any()
});

export function normalizeFeasibilityReportResponse(payload: any) {
  // Normalize internal pieces first
  const normalizedScheme = normalizeSchemeMatchResponse(payload?.schemeMatching);
  const normalizedAdvisory = normalizeStrategicAdvisoryResponse(payload?.strategicAdvisory);
  
  return {
    status: (['complete', 'partial', 'error'].includes(payload?.status) ? payload.status : 'error') as 'complete' | 'partial' | 'error',
    reportId: typeof payload?.reportId === 'string' ? payload.reportId : 'unknown-id',
    generatedAt: typeof payload?.generatedAt === 'string' ? payload.generatedAt : new Date().toISOString(),
    summary: payload?.summary || {},
    financials: payload?.financials || {},
    locationContext: payload?.locationContext || {},
    marketAnalysis: payload?.marketAnalysis || {},
    strategicAdvisory: normalizedAdvisory,
    schemeMatching: normalizedScheme,
    sources: Array.isArray(payload?.sources) ? payload.sources : [],
    dataGaps: Array.isArray(payload?.dataGaps) ? payload.dataGaps : [],
    providerStatus: payload?.providerStatus || {}
  };
}
