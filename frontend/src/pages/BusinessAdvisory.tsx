import React, { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX } from '../context/PredXContext';
import { useLanguage } from '../lib/i18n';
import { DISTRICTS, getDistrictById } from '../data/districtData';
import { geocodingProvider } from '../providers/MockProviders';
import { LocationProfile } from '../providers/types';
import ProviderStatusBadge from '../components/ProviderStatusBadge';

export default function BusinessAdvisory() {
  const { navigate } = usePredX();
  const { t, lang, toggleLang } = useLanguage();

  // Location state
  const [locationProfile, setLocationProfile] = useState<LocationProfile | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  
  // Manual location state
  const [manualState, setManualState] = useState('');
  const [manualDistrictId, setManualDistrictId] = useState('');
  const [manualBlock, setManualBlock] = useState('');
  const [manualVillage, setManualVillage] = useState('');

  const uniqueStates = Array.from(new Set(DISTRICTS.map(d => d.state)));
  const availableDistricts = DISTRICTS.filter(d => d.state === manualState);

  // Form state
  const [marginCapital, setMarginCapital] = useState('');
  
  // Optional profile fields
  const [showMore, setShowMore] = useState(false);
  const [skillLevel, setSkillLevel] = useState<'None' | 'Beginner' | 'Experienced' | ''>('');
  const [workType, setWorkType] = useState('');
  const [timeAvailability, setTimeAvailability] = useState('');
  const [businessSpace, setBusinessSpace] = useState('');
  const [householdExpenses, setHouseholdExpenses] = useState('');
  const [isSHGMember, setIsSHGMember] = useState(false);
  const [isArtisan, setIsArtisan] = useState(false);
  const [gender, setGender] = useState('');
  const [socialCategory, setSocialCategory] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleGetCurrentLocation = () => {
    setIsLoadingLocation(true);
    setErrors(prev => ({ ...prev, location: '' }));
    
    if (!navigator.geolocation) {
      setErrors(prev => ({ ...prev, location: 'Geolocation is not supported by your browser' }));
      setIsLoadingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const profile = await geocodingProvider.reverseGeocode({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLocationProfile(profile);
          if (profile) {
            const districtOpt = DISTRICTS.find(d => d.name === profile.district);
            if (districtOpt) setManualDistrictId(districtOpt.id);
          }
        } catch (err) {
          setErrors(prev => ({ ...prev, location: 'Failed to fetch location profile.' }));
        } finally {
          setIsLoadingLocation(false);
        }
      },
      (error) => {
        setErrors(prev => ({ ...prev, location: 'Location access denied or failed. Please select manually.' }));
        setIsLoadingLocation(false);
      }
    );
  };

  const handleManualDistrictChange = async (id: string) => {
    setManualDistrictId(id);
    setErrors(prev => ({ ...prev, location: '' }));
    const district = getDistrictById(id);
    if (!district) {
      setLocationProfile(null);
      return;
    }

    // Show something immediately from the seeded district data, then enrich from the backend.
    const districtFallback: LocationProfile = {
      state: district.state,
      district: district.name,
      primarySectors: [district.mainEconomy],
      population: district.population,
      msmeDensity: 'medium',
      confidence: 'medium',
      lastUpdated: new Date().toISOString(),
      isDemoData: true,
    } as LocationProfile;
    setLocationProfile(districtFallback);

    // Resolve real lat/lng via backend (Nominatim / known centroids)
    setIsLoadingLocation(true);
    try {
      const { API_BASE_URL } = await import('../config');
      const qs = new URLSearchParams({
        district: district.name,
        state: district.state,
        cityOrVillage: district.name,
      });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(`${API_BASE_URL}/api/location/profile?${qs}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const coords = data.location?.coordinates || {};
        setLocationProfile({
          state: data.location?.state || district.state,
          district: data.location?.district || district.name,
          block: data.location?.block,
          village: data.location?.village || district.name,
          cityOrVillage: data.location?.cityOrVillage || district.name,
          latitude: data.location?.latitude ?? coords.lat,
          longitude: data.location?.longitude ?? coords.lng,
          coordinates: {
            lat: data.location?.latitude ?? coords.lat ?? 0,
            lng: data.location?.longitude ?? coords.lng ?? 0,
          },
          primarySectors: data.signals?.primarySectors || [district.mainEconomy],
          population: district.population,
          msmeDensity: data.signals?.msmeDensity || 'medium',
          confidence: data.provenance?.confidence || 'high',
          lastUpdated: data.provenance?.retrievedAt || new Date().toISOString(),
          isDemoData: false,
        } as LocationProfile);
      }
      // non-OK response: keep the district fallback already shown
    } catch {
      // network error / timeout: keep the district fallback already shown
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!locationProfile) newErrors.location = 'Please set your location to proceed.';
    if (!marginCapital || parseFloat(marginCapital) <= 0) {
      newErrors.margin = 'Please enter your available margin capital.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleExplore = () => {
    if (!validate() || !locationProfile) return;

    sessionStorage.setItem('arthniti-profile', JSON.stringify({
      location: locationProfile,
      marginCapital: parseFloat(marginCapital),
      skillLevel,
      workType,
      timeAvailability,
      businessSpace,
      householdExpenses: parseFloat(householdExpenses) || 0,
      isSHGMember,
      isArtisan,
      gender,
      socialCategory
    }));

    navigate('explore');
  };

  return (
    <DashboardLayout>
      <div className="px-4 md:px-8 pb-12 md:pb-8 pt-4 max-w-4xl mx-auto">
        {/* Header */}
        <section className="mb-8">
          <div className="bg-gradient-to-br from-primary/10 to-on-surface/5 backdrop-blur-xl p-6 md:p-10 rounded-3xl border border-primary/20 relative overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
            <div className="absolute right-0 top-0 w-96 h-96 bg-gradient-to-bl from-primary/15 to-transparent rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3"></div>
            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-headline font-bold text-on-surface mb-2">
                  Business Advisory
                </h1>
                <p className="text-on-surface/60 text-sm md:text-base font-body max-w-xl">
                  Build a personalized, geo-aware profile to discover and compare rural enterprise opportunities tailored to your location.
                </p>
              </div>
              <button
                onClick={toggleLang}
                className="self-start md:self-center flex items-center gap-2 bg-on-surface/5 border border-on-surface/10 px-4 py-2 rounded-xl text-sm font-body font-semibold text-on-surface/70 hover:bg-on-surface/10 hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">translate</span>
                {t('common.language')}
              </button>
            </div>
            <ProviderStatusBadge />
          </div>
        </section>

        {/* Form */}
        <section className="space-y-6">
          {/* Location Selection */}
          <div className="bg-on-surface/5 backdrop-blur-xl p-6 rounded-2xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-body font-semibold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">my_location</span>
                Set Location Profile
              </label>
              <button
                onClick={handleGetCurrentLocation}
                disabled={isLoadingLocation}
                className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[14px] ${isLoadingLocation ? 'animate-spin' : ''}`}>
                  {isLoadingLocation ? 'progress_activity' : 'explore'}
                </span>
                {isLoadingLocation ? 'Locating...' : 'Use my current location'}
              </button>
            </div>

            <div className="mb-4">
              <p className="text-[10px] text-on-surface/50 mb-2 uppercase tracking-widest font-bold">Or select manually</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <select
                  value={manualState}
                  onChange={e => {
                    setManualState(e.target.value);
                    setManualDistrictId('');
                    setManualBlock('');
                    setLocationProfile(null);
                  }}
                  className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-primary/50 focus:outline-none cursor-pointer"
                >
                  <option value="">Select State</option>
                  {uniqueStates.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
                <select
                  value={manualDistrictId}
                  onChange={e => handleManualDistrictChange(e.target.value)}
                  disabled={!manualState}
                  className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-primary/50 focus:outline-none cursor-pointer disabled:opacity-50"
                >
                  <option value="">Select District</option>
                  {availableDistricts.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={manualBlock}
                  onChange={e => setManualBlock(e.target.value)}
                  disabled={!manualDistrictId}
                  className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-primary/50 focus:outline-none cursor-pointer disabled:opacity-50"
                >
                  <option value="">Select Block</option>
                  <option value="Block A">Block A</option>
                  <option value="Block B">Block B</option>
                  <option value="Block C">Block C</option>
                </select>
                <input
                  type="text"
                  placeholder="Village or PIN Code"
                  value={manualVillage}
                  onChange={e => setManualVillage(e.target.value)}
                  disabled={!manualDistrictId}
                  className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-primary/50 focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            {errors.location && (
              <p className="text-error text-xs font-body mb-4">{errors.location}</p>
            )}

            {/* Location Profile Card */}
            {locationProfile && (
              <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/10 mt-4 animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-success text-[18px]">verified</span>
                    <h4 className="text-sm font-bold text-on-surface">
                      {manualVillage ? `${manualVillage}, ` : ''}{manualBlock ? `${manualBlock}, ` : ''}{locationProfile.district}, {locationProfile.state}
                    </h4>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Primary Sectors</p>
                    <p className="text-xs text-on-surface font-semibold">{locationProfile.primarySectors.join(', ')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Population</p>
                    <p className="text-xs text-on-surface font-semibold">{locationProfile.population?.toLocaleString('en-IN')} (approx)</p>
                  </div>
                  <div className="col-span-2 text-[10px] text-on-surface/40 flex items-center gap-1 mt-2">
                    <span className="material-symbols-outlined text-[12px]">lock</span>
                    Your location is used only to personalise local business insights. You can edit or remove it anytime.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Margin Capital */}
          <div className="bg-on-surface/5 backdrop-blur-xl p-6 rounded-2xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <label className="block text-sm font-body font-semibold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">account_balance_wallet</span>
              Available Margin Capital
            </label>
            <p className="text-[10px] text-on-surface/50 mb-3">How much of your own savings can you invest initially?</p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface/40 font-headline font-bold">₹</span>
              <input
                type="number"
                value={marginCapital}
                onChange={e => { setMarginCapital(e.target.value); setErrors(prev => ({ ...prev, margin: '' })); }}
                placeholder="e.g. 50000"
                min="0"
                className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl pl-10 pr-4 py-3 text-sm font-headline font-bold focus:border-primary/50 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            {errors.margin && (
              <p className="text-error text-xs mt-2 font-body flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {errors.margin}
              </p>
            )}
          </div>

          {/* Optional Profile */}
          <div className="bg-on-surface/5 backdrop-blur-xl p-6 rounded-2xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <button
              onClick={() => setShowMore(!showMore)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">person_add</span>
                <span className="text-sm font-body font-semibold text-on-surface">Build Detailed Profile (Optional)</span>
              </div>
              <span className="material-symbols-outlined text-on-surface/50 transition-transform" style={{ transform: showMore ? 'rotate(180deg)' : 'rotate(0)' }}>
                expand_more
              </span>
            </button>
            <p className="text-xs text-on-surface/50 mt-1">Helps match you with precise government schemes like PM Vishwakarma and NSFDC.</p>

            {showMore && (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in border-t border-on-surface/5 pt-4">
                <div>
                  <label className="block text-xs font-body text-on-surface/60 mb-1">Social Category</label>
                  <select
                    value={socialCategory}
                    onChange={e => setSocialCategory(e.target.value)}
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-3 py-2 text-sm focus:border-primary/50 focus:outline-none"
                  >
                    <option value="">Select</option>
                    <option value="SC">SC</option>
                    <option value="ST">ST</option>
                    <option value="OBC">OBC</option>
                    <option value="General">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-body text-on-surface/60 mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={e => setGender(e.target.value)}
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-3 py-2 text-sm focus:border-primary/50 focus:outline-none"
                  >
                    <option value="">Select</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="col-span-1 md:col-span-2 flex items-center justify-between gap-4 bg-on-surface/5 p-3 rounded-xl border border-on-surface/5">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="artisan" checked={isArtisan} onChange={e => setIsArtisan(e.target.checked)} className="rounded bg-transparent border-on-surface/20 text-primary" />
                    <label htmlFor="artisan" className="text-sm cursor-pointer">I am a traditional artisan / craftsperson</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="shg" checked={isSHGMember} onChange={e => setIsSHGMember(e.target.checked)} className="rounded bg-transparent border-on-surface/20 text-primary" />
                    <label htmlFor="shg" className="text-sm cursor-pointer">I am part of an SHG</label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Explore CTA */}
          <button
            onClick={handleExplore}
            className="w-full bg-gradient-to-r from-primary to-[#FF8C00] text-on-primary font-headline font-bold py-4 px-8 rounded-2xl text-base hover:shadow-[0_0_30px_rgb(var(--primary)/0.3)] transition-all active:scale-[0.98] flex items-center justify-center gap-3"
          >
            Explore Business Opportunities
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </section>
      </div>
    </DashboardLayout>
  );
}
