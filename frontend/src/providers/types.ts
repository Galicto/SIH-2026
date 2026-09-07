export interface Coordinates {
  lat: number;
  lng: number;
}

export interface LocationProfile {
  state: string;
  district: string;
  block?: string;
  village?: string;
  cityOrVillage?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  pinCode?: string;
  latitude?: number;
  longitude?: number;
  coordinates?: Coordinates;
  primarySectors: string[];
  population?: number;
  census?: {
    population?: number | null;
    status?: 'available' | 'unavailable';
    year?: number;
    geographicLevel?: string;
    areaName?: string;
    censusState?: string;
    table?: string;
    source?: string;
    sourceUrl?: string;
    attribution?: string;
    cacheStatus?: 'fresh' | 'stale';
    reason?: string;
  };
  msmeDensity?: 'low' | 'medium' | 'high';
  confidence: 'low' | 'medium' | 'high';
  lastUpdated: string;
  isDemoData: boolean;
  provenance?: any;
}

export interface GeocodingProvider {
  reverseGeocode(coords: Coordinates): Promise<LocationProfile | null>;
}

export interface BusinessItem {
  id: string;
  name: string;
  category: string;
  workType: 'service' | 'retail' | 'manufacturing' | 'agriculture-linked' | string;
  skillLevel: 'None' | 'Beginner' | 'Experienced' | string;
  minCapital: number;
  maxCapital: number;
  avgRevenue: number;
  avgOperatingCost: number;
  ownSpaceRequired?: boolean;
  isHomeBased?: boolean;
  isWomenFriendly?: boolean;
  competitorDensity: 'low' | 'medium' | 'high' | string;
  competitorCount?: number;
  demandProxyScore: number;
  schemeSupported: boolean;
  signals?: string;
  provenance?: any;
  matchedSchemes?: any[];
  radiusKm?: number;
  nearbySignals?: any;
}

export interface BusinessCatalogueProvider {
  getBusinesses(location: LocationProfile): Promise<BusinessItem[]>;
}

export interface SchemeRule {
  schemeId: string;
  name: string;
  ministry: string;
  description: string;
  officialSourceUrl: string;
  effectiveDate: string;
  lastVerifiedAt: string;
  sourceConfidence: 'high' | 'medium' | 'low';
  geographicCoverage: 'national' | string[]; // Array of states
  businessCategories: string[]; // '*' for all
  maxProjectCost?: number;
  marginRulePercent?: number;
  subsidyPercent?: number;
  requiredDocuments: string[];
  eligibilityRules: {
    socialCategories?: string[];
    genders?: string[];
    isArtisan?: boolean;
    isExistingEnterprise?: boolean;
    requiresUdyam?: boolean;
  };
}

export interface SchemeMatch {
  scheme: SchemeRule;
  matchReason: string;
  indicativeSupport: string;
}

export interface SchemeProvider {
  findMatches(profile: {
    state: string;
    category: string;
    projectCost: number;
    marginCapital: number;
    socialCategory?: string;
    gender?: string;
    skillLevel?: string;
    workPreference?: string;
    spaceStatus?: string;
    availability?: string;
    householdExpenses?: number;
    isArtisan?: boolean;
    isSHGMember?: boolean;
    isExistingEnterprise?: boolean;
    hasUdyam?: boolean;
  }): Promise<SchemeMatch[]>;
}
