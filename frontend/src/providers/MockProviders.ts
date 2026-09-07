import { GeocodingProvider, Coordinates, LocationProfile, BusinessItem, BusinessCatalogueProvider, SchemeProvider, SchemeMatch } from './types';

const API_BASE = (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000') + '/api';

export class ApiGeocodingProvider implements GeocodingProvider {
  async reverseGeocode(coords: Coordinates): Promise<LocationProfile | null> {
    try {
      const res = await fetch(`${API_BASE}/location/profile?lat=${coords.lat}&lng=${coords.lng}`);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        state: data.location.state,
        district: data.location.district,
        block: data.location.block,
        village: data.location.village,
        cityOrVillage: data.location.cityOrVillage || data.location.village,
        latitude: data.location.latitude ?? data.location.coordinates?.lat,
        longitude: data.location.longitude ?? data.location.coordinates?.lng,
        coordinates: data.location.coordinates,
        primarySectors: data.signals.primarySectors,
        population: data.signals.population,
        census: data.census,
        msmeDensity: data.signals.msmeDensity,
        confidence: data.provenance.confidence,
        lastUpdated: data.provenance.retrievedAt,
        isDemoData: false,
        provenance: data.provenance
      };
    } catch (e) {
      console.error("Location API failed:", e);
      return null;
    }
  }
}

export const geocodingProvider = new ApiGeocodingProvider();

export class ApiBusinessCatalogueProvider implements BusinessCatalogueProvider {
  async getBusinesses(location: LocationProfile): Promise<BusinessItem[]> {
    try {
      // In production we would pass all profile filters, using a default here to fetch the catalogue
      const reqBody = {
        location: location,
        radius: "5km",
        marginCapital: 0 // Fetch all initially for ExploreBusinesses, filter later
      };
      const res = await fetch(`${API_BASE}/business/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      console.error("Business API failed:", e);
      return [];
    }
  }
}

export const businessCatalogueProvider = new ApiBusinessCatalogueProvider();

export class ApiSchemeProvider implements SchemeProvider {
  async findMatches(profile: {
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
  }): Promise<SchemeMatch[]> {
    try {
      const res = await fetch(`${API_BASE}/schemes/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessCategory: profile.category,
          userProfile: {
            ...profile,
            budget: profile.projectCost,
          },
          location: { state: profile.state },
        })
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.matches || [];
    } catch (e) {
      console.error("Schemes API failed:", e);
      return [];
    }
  }
}

export const schemeProvider = new ApiSchemeProvider();
