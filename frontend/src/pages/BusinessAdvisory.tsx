import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX } from '../context/PredXContext';
import { useLanguage } from '../lib/i18n';
import { DISTRICTS, getDistrictById } from '../data/districtData';
import { geocodingProvider } from '../providers/MockProviders';
import { LocationProfile } from '../providers/types';
import ProviderStatusBadge from '../components/ProviderStatusBadge';
import { useAdvisory, type AdvisorySearch } from '../context/AdvisoryContext';

export default function BusinessAdvisory() {
  const { navigate } = usePredX();
  const { t, lang, toggleLang } = useLanguage();
  const { activeSearch, searchHistory, startSearch, restoreSearch, deleteSearch, clearActiveSearch } = useAdvisory();

  // Location state
  const [locationProfile, setLocationProfile] = useState<LocationProfile | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  
  // Manual location state
  const [manualState, setManualState] = useState('');
  const [manualDistrictId, setManualDistrictId] = useState('');
  const [manualBlock, setManualBlock] = useState('');
  const [manualVillage, setManualVillage] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [manualCity, setManualCity] = useState('');
  const [manualPinCode, setManualPinCode] = useState('');

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
  const [isExistingEnterprise, setIsExistingEnterprise] = useState(false);
  const [isSHGMember, setIsSHGMember] = useState(false);
  const [isArtisan, setIsArtisan] = useState(false);
  const [gender, setGender] = useState('');
  const [socialCategory, setSocialCategory] = useState('');

  // Search settings are chosen before the advisory is submitted, then stored
  // with that advisory so restoring it reproduces the same discovery results.
  const [opportunityCategory, setOpportunityCategory] = useState('');
  const [opportunityRadiusKm, setOpportunityRadiusKm] = useState<5 | 10 | 20>(5);
  const [onlyWithinBudget, setOnlyWithinBudget] = useState(true);
  const [onlySchemeSupported, setOnlySchemeSupported] = useState(false);
  const [searchPendingDeletion, setSearchPendingDeletion] = useState<AdvisorySearch | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const profile = activeSearch?.profile;
    if (!profile) return;
    const savedLocation = profile.location as LocationProfile | undefined;
    setLocationProfile(savedLocation || null);
    setManualState(savedLocation?.state || '');
    const savedDistrict = DISTRICTS.find(d => d.name === savedLocation?.district && d.state === savedLocation?.state);
    setManualDistrictId(savedDistrict?.id || '');
    setManualBlock(savedLocation?.block || '');
    setManualVillage(savedLocation?.village || '');
    setAddressLine1(savedLocation?.addressLine1 || '');
    setAddressLine2(savedLocation?.addressLine2 || '');
    setManualCity(savedLocation?.city || '');
    setManualPinCode(savedLocation?.pinCode || '');
    setMarginCapital(profile.marginCapital?.toString() || '');
    setSkillLevel(profile.skillLevel || '');
    setWorkType(profile.workType || '');
    setTimeAvailability(profile.timeAvailability || '');
    setBusinessSpace(profile.businessSpace || '');
    setHouseholdExpenses(profile.householdExpenses?.toString() || '');
    setIsExistingEnterprise(!!profile.isExistingEnterprise);
    setIsSHGMember(!!profile.isSHGMember);
    setIsArtisan(!!profile.isArtisan);
    setGender(profile.gender || '');
    setSocialCategory(profile.socialCategory || '');
    const searchPreferences = profile.discoveryPreferences || {};
    setOpportunityCategory(searchPreferences.category || '');
    setOpportunityRadiusKm([5, 10, 20].includes(searchPreferences.radiusKm) ? searchPreferences.radiusKm : 5);
    setOnlyWithinBudget(searchPreferences.withinBudget !== false);
    setOnlySchemeSupported(!!searchPreferences.schemeSupported);
    setShowMore(true);
  }, [activeSearch?.id]);

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

    // Resolve real lat/lng via backend (Nominatim / known centroids)
    setIsLoadingLocation(true);
    try {
      const { API_BASE_URL } = await import('../config');
      const qs = new URLSearchParams({
        district: district.name,
        state: district.state,
        cityOrVillage: manualCity.trim() || manualVillage.trim() || district.name,
      });
      const res = await fetch(`${API_BASE_URL}/api/location/profile?${qs}`);
      if (res.ok) {
        const data = await res.json();
        const coords = data.location?.coordinates || {};
        setLocationProfile({
          state: data.location?.state || district.state,
          district: data.location?.district || district.name,
          block: data.location?.block,
          village: data.location?.village || district.name,
          cityOrVillage: data.location?.cityOrVillage || district.name,
          addressLine1: addressLine1.trim() || undefined,
          addressLine2: addressLine2.trim() || undefined,
          city: manualCity.trim() || undefined,
          pinCode: manualPinCode.trim() || undefined,
          latitude: data.location?.latitude ?? coords.lat,
          longitude: data.location?.longitude ?? coords.lng,
          coordinates: {
            lat: data.location?.latitude ?? coords.lat ?? 0,
            lng: data.location?.longitude ?? coords.lng ?? 0,
          },
          primarySectors: data.signals?.primarySectors || [district.mainEconomy],
          population: data.census?.population ?? data.signals?.population,
          census: data.census,
          msmeDensity: data.signals?.msmeDensity || 'medium',
          confidence: data.provenance?.confidence || 'high',
          lastUpdated: data.provenance?.retrievedAt || new Date().toISOString(),
          isDemoData: false,
        } as LocationProfile);
      } else {
        setLocationProfile({
          state: district.state,
          district: district.name,
          addressLine1: addressLine1.trim() || undefined,
          addressLine2: addressLine2.trim() || undefined,
          city: manualCity.trim() || undefined,
          pinCode: manualPinCode.trim() || undefined,
          primarySectors: [district.mainEconomy],
          msmeDensity: 'medium',
          confidence: 'medium',
          lastUpdated: new Date().toISOString(),
          isDemoData: false,
        });
      }
    } catch {
      setLocationProfile({
          state: district.state,
          district: district.name,
          addressLine1: addressLine1.trim() || undefined,
          addressLine2: addressLine2.trim() || undefined,
          city: manualCity.trim() || undefined,
          pinCode: manualPinCode.trim() || undefined,
        primarySectors: [district.mainEconomy],
        msmeDensity: 'medium',
        confidence: 'medium',
        lastUpdated: new Date().toISOString(),
        isDemoData: false,
      });
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
    if (manualPinCode.trim() && !/^\d{6}$/.test(manualPinCode.trim())) {
      newErrors.pinCode = 'Enter a valid 6-digit PIN code.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleExplore = () => {
    if (!validate() || !locationProfile) return;

    const completedLocation: LocationProfile = {
      ...locationProfile,
      block: manualBlock.trim() || locationProfile.block,
      village: manualVillage.trim() || locationProfile.village,
      cityOrVillage: manualCity.trim() || manualVillage.trim() || locationProfile.cityOrVillage,
      addressLine1: addressLine1.trim() || undefined,
      addressLine2: addressLine2.trim() || undefined,
      city: manualCity.trim() || undefined,
      pinCode: manualPinCode.trim() || undefined,
    };
    setLocationProfile(completedLocation);

    startSearch({
      location: completedLocation,
      marginCapital: parseFloat(marginCapital),
      skillLevel,
      workType,
      timeAvailability,
      businessSpace,
      householdExpenses: parseFloat(householdExpenses) || 0,
      isExistingEnterprise,
      isSHGMember,
      isArtisan,
      gender,
      socialCategory,
      discoveryPreferences: {
        category: opportunityCategory,
        radiusKm: opportunityRadiusKm,
        withinBudget: onlyWithinBudget,
        schemeSupported: onlySchemeSupported,
      },
    });

    navigate('explore');
  };

  const resetForm = () => {
    setLocationProfile(null);
    setMarginCapital('');
    setSkillLevel('');
    setWorkType('');
    setTimeAvailability('');
    setBusinessSpace('');
    setHouseholdExpenses('');
    setIsExistingEnterprise(false);
    setIsSHGMember(false);
    setIsArtisan(false);
    setGender('');
    setSocialCategory('');
    setManualState('');
    setManualDistrictId('');
    setManualBlock('');
    setManualVillage('');
    setAddressLine1('');
    setAddressLine2('');
    setManualCity('');
    setManualPinCode('');
    setOpportunityCategory('');
    setOpportunityRadiusKm(5);
    setOnlyWithinBudget(true);
    setOnlySchemeSupported(false);
    setErrors({});
  };

  const handleClearCurrentSearch = () => {
    clearActiveSearch();
    resetForm();
  };

  const confirmDeleteSearch = () => {
    if (!searchPendingDeletion) return;
    const isDeletingActiveSearch = activeSearch?.id === searchPendingDeletion.id;
    deleteSearch(searchPendingDeletion.id);
    if (isDeletingActiveSearch) resetForm();
    setSearchPendingDeletion(null);
  };

  return (
    <DashboardLayout>
      <div className="px-4 md:px-8 pb-12 md:pb-8 pt-4 max-w-4xl mx-auto">
        {/* Header */}
        <section className="mb-8">
          <div className="bg-gradient-to-br from-[#FF5A00]/10 to-on-surface/5 backdrop-blur-xl p-6 md:p-10 rounded-3xl border border-[#FF5A00]/20 relative overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
            <div className="absolute right-0 top-0 w-96 h-96 bg-gradient-to-bl from-[#FF5A00]/15 to-transparent rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3"></div>
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

        {activeSearch && (
          <section className="mb-6 rounded-2xl border border-[#FF5A00]/25 bg-[#FF5A00]/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-on-surface">Current advisory is saved</p>
                <p className="text-xs text-on-surface/60">
                  {activeSearch.discovery ? `${activeSearch.discovery.results.length} saved findings` : 'Profile saved — search has not run yet.'}
                  {' · '}Updated {new Date(activeSearch.updatedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                {activeSearch.discovery && (
                  <button onClick={() => navigate('explore')} className="rounded-lg bg-[#FF5A00] px-3 py-2 text-xs font-bold text-white">
                    Open findings
                  </button>
                )}
                <button onClick={handleClearCurrentSearch} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-400/10">
                  Clear current advisory
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Form */}
        <section className="space-y-6">
          {/* Location Selection */}
          <div className="bg-on-surface/5 backdrop-blur-xl p-6 rounded-2xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-body font-semibold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#FF5A00]">my_location</span>
                Set Location Profile
              </label>
              <button
                onClick={handleGetCurrentLocation}
                disabled={isLoadingLocation}
                className="flex items-center gap-1.5 text-xs font-bold text-[#FF5A00] bg-[#FF5A00]/10 px-3 py-1.5 rounded-full hover:bg-[#FF5A00]/20 transition-colors disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[14px] ${isLoadingLocation ? 'animate-spin' : ''}`}>
                  {isLoadingLocation ? 'progress_activity' : 'explore'}
                </span>
                {isLoadingLocation ? 'Locating...' : 'Use my current location'}
              </button>
            </div>

            <div className="mb-4">
              <p className="text-[10px] text-on-surface/50 mb-2 uppercase tracking-widest font-bold">Administrative location</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <select
                  value={manualState}
                  onChange={e => {
                    setManualState(e.target.value);
                    setManualDistrictId('');
                    setManualBlock('');
                    setLocationProfile(null);
                  }}
                  className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-[#FF5A00]/50 focus:outline-none cursor-pointer"
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
                  className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-[#FF5A00]/50 focus:outline-none cursor-pointer disabled:opacity-50"
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
                  className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-[#FF5A00]/50 focus:outline-none cursor-pointer disabled:opacity-50"
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
                  className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-[#FF5A00]/50 focus:outline-none disabled:opacity-50"
                />
              </div>

              <div className="mt-5 border-t border-on-surface/10 pt-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
                  <p className="text-[10px] text-on-surface/50 uppercase tracking-widest font-bold">Address details</p>
                  <p className="text-[10px] text-on-surface/40">Optional — saved with this advisory only</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Address line 1"
                    value={addressLine1}
                    onChange={e => setAddressLine1(e.target.value)}
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-[#FF5A00]/50 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Address line 2 (optional)"
                    value={addressLine2}
                    onChange={e => setAddressLine2(e.target.value)}
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-[#FF5A00]/50 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="City or town"
                    value={manualCity}
                    onChange={e => setManualCity(e.target.value)}
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-[#FF5A00]/50 focus:outline-none"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit PIN code"
                    value={manualPinCode}
                    onChange={e => setManualPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:border-[#FF5A00]/50 focus:outline-none"
                  />
                </div>
                <p className="mt-2 text-[10px] text-on-surface/40">State is selected above so it remains aligned with the district used for local insights.</p>
                {errors.pinCode && <p className="mt-2 text-xs text-red-400">{errors.pinCode}</p>}
              </div>
            </div>

            {errors.location && (
              <p className="text-red-400 text-xs font-body mb-4">{errors.location}</p>
            )}

            {/* Location Profile Card */}
            {locationProfile && (
              <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/10 mt-4 animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-400 text-[18px]">verified</span>
                    <h4 className="text-sm font-bold text-on-surface">
                      {locationProfile.city || manualCity ? `${locationProfile.city || manualCity}, ` : manualVillage ? `${manualVillage}, ` : ''}{manualBlock ? `${manualBlock}, ` : ''}{locationProfile.district}, {locationProfile.state}
                    </h4>
                  </div>
                </div>
                {(locationProfile.addressLine1 || addressLine1 || locationProfile.addressLine2 || addressLine2 || locationProfile.pinCode || manualPinCode) && (
                  <p className="mb-3 text-xs text-on-surface/60">
                    {[locationProfile.addressLine1 || addressLine1, locationProfile.addressLine2 || addressLine2, locationProfile.pinCode || manualPinCode].filter(Boolean).join(', ')}
                  </p>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Primary Sectors</p>
                    <p className="text-xs text-on-surface font-semibold">{locationProfile.primarySectors.join(', ')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">
                      Population {locationProfile.census?.year ? `· Census ${locationProfile.census.year}` : ''}
                    </p>
                    {locationProfile.census?.status === 'available' && locationProfile.population != null ? (
                      <>
                        <p className="text-xs text-on-surface font-semibold">
                          {locationProfile.population.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[10px] text-on-surface/45 mt-1 capitalize">
                          {locationProfile.census.geographicLevel || 'area'}: {locationProfile.census.areaName || locationProfile.district}
                          {locationProfile.census.cacheStatus === 'stale' ? ' · saved Census result' : ''}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-on-surface/60 font-semibold">Official Census data unavailable</p>
                    )}
                  </div>
                  {locationProfile.census?.attribution && (
                    <p className="col-span-2 text-[10px] text-on-surface/45 leading-relaxed -mt-1">
                      {locationProfile.census.attribution}
                    </p>
                  )}
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
              <span className="material-symbols-outlined text-[18px] text-[#FF5A00]">account_balance_wallet</span>
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
                className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl pl-10 pr-4 py-3 text-sm font-headline font-bold focus:border-[#FF5A00]/50 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            {errors.margin && (
              <p className="text-red-400 text-xs mt-2 font-body flex items-center gap-1">
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
                <span className="material-symbols-outlined text-[18px] text-[#FF5A00]">person_add</span>
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
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-3 py-2 text-sm focus:border-[#FF5A00]/50 focus:outline-none"
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
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-3 py-2 text-sm focus:border-[#FF5A00]/50 focus:outline-none"
                  >
                    <option value="">Select</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-body text-on-surface/60 mb-1">Skill Level</label>
                  <select
                    value={skillLevel}
                    onChange={e => setSkillLevel(e.target.value as 'None' | 'Beginner' | 'Experienced' | '')}
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-3 py-2 text-sm focus:border-[#FF5A00]/50 focus:outline-none"
                  >
                    <option value="">Select</option>
                    <option value="None">No prior experience</option>
                    <option value="Beginner">Beginner</option>
                    <option value="Experienced">Experienced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-body text-on-surface/60 mb-1">Preferred Work Type</label>
                  <select
                    value={workType}
                    onChange={e => setWorkType(e.target.value)}
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-3 py-2 text-sm focus:border-[#FF5A00]/50 focus:outline-none"
                  >
                    <option value="">No preference</option>
                    <option value="service">Service</option>
                    <option value="retail">Retail</option>
                    <option value="manufacturing">Manufacturing</option>
                    <option value="agriculture-linked">Agriculture-linked</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-body text-on-surface/60 mb-1">Workspace Available</label>
                  <select
                    value={businessSpace}
                    onChange={e => setBusinessSpace(e.target.value)}
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-3 py-2 text-sm focus:border-[#FF5A00]/50 focus:outline-none"
                  >
                    <option value="">Select</option>
                    <option value="home">Home-based space</option>
                    <option value="shop">Shop or commercial space</option>
                    <option value="shared">Shared workspace</option>
                    <option value="outdoor">Outdoor, farm, or mobile work space</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-body text-on-surface/60 mb-1">Availability</label>
                  <select
                    value={timeAvailability}
                    onChange={e => setTimeAvailability(e.target.value)}
                    className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl px-3 py-2 text-sm focus:border-[#FF5A00]/50 focus:outline-none"
                  >
                    <option value="">Select</option>
                    <option value="part-time">Part-time</option>
                    <option value="full-time">Full-time</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-body text-on-surface/60 mb-1">Monthly Household Expenses</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={householdExpenses}
                      onChange={e => setHouseholdExpenses(e.target.value)}
                      placeholder="e.g. 15000"
                      className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-xl pl-7 pr-3 py-2 text-sm focus:border-[#FF5A00]/50 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="col-span-1 md:col-span-2 flex flex-col items-start gap-3 bg-on-surface/5 p-3 rounded-xl border border-on-surface/5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="artisan" checked={isArtisan} onChange={e => setIsArtisan(e.target.checked)} className="rounded bg-transparent border-on-surface/20 text-[#FF5A00]" />
                    <label htmlFor="artisan" className="text-sm cursor-pointer">I am a traditional artisan / craftsperson</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="existing-enterprise" checked={isExistingEnterprise} onChange={e => setIsExistingEnterprise(e.target.checked)} className="rounded bg-transparent border-on-surface/20 text-[#FF5A00]" />
                    <label htmlFor="existing-enterprise" className="text-sm cursor-pointer">I already run a business</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="shg" checked={isSHGMember} onChange={e => setIsSHGMember(e.target.checked)} className="rounded bg-transparent border-on-surface/20 text-[#FF5A00]" />
                    <label htmlFor="shg" className="text-sm cursor-pointer">I am part of an SHG</label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-on-surface/5 backdrop-blur-xl p-6 rounded-2xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#FF5A00]">tune</span>
              <h2 className="text-sm font-body font-semibold text-on-surface">Opportunity filters</h2>
            </div>
            <p className="mt-1 text-xs text-on-surface/50">Choose what to look for before the search starts. These settings are saved with this advisory.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-on-surface/60">Business category</label>
                <select
                  value={opportunityCategory}
                  onChange={event => setOpportunityCategory(event.target.value)}
                  className="w-full rounded-xl border border-on-surface/10 bg-on-surface/5 px-3 py-2.5 text-sm text-on-surface focus:border-[#FF5A00]/50 focus:outline-none"
                >
                  <option value="">All Categories</option>
                  <option value="retail">Retail</option>
                  <option value="service">Services</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="agriculture-linked">Agriculture Linked</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-on-surface/60">Search radius</label>
                <select
                  value={opportunityRadiusKm}
                  onChange={event => setOpportunityRadiusKm(Number(event.target.value) as 5 | 10 | 20)}
                  className="w-full rounded-xl border border-on-surface/10 bg-on-surface/5 px-3 py-2.5 text-sm text-on-surface focus:border-[#FF5A00]/50 focus:outline-none"
                >
                  <option value={5}>Radius 5 km</option>
                  <option value={10}>Radius 10 km</option>
                  <option value={20}>Radius 20 km</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-on-surface/5 bg-on-surface/[0.03] p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface/80">
                <input type="checkbox" checked={onlyWithinBudget} onChange={event => setOnlyWithinBudget(event.target.checked)} className="rounded text-[#FF5A00] focus:ring-[#FF5A00]/50" />
                Within my budget (₹{Number(marginCapital || 0).toLocaleString('en-IN')})
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface/80">
                <input type="checkbox" checked={onlySchemeSupported} onChange={event => setOnlySchemeSupported(event.target.checked)} className="rounded text-[#FF5A00] focus:ring-[#FF5A00]/50" />
                Scheme Supported
              </label>
            </div>
          </div>

          {/* Explore CTA */}
          <button
            onClick={handleExplore}
            className="w-full bg-gradient-to-r from-[#FF5A00] to-[#FF8C00] text-white font-headline font-bold py-4 px-8 rounded-2xl text-base hover:shadow-[0_0_30px_rgba(255,90,0,0.3)] transition-all active:scale-[0.98] flex items-center justify-center gap-3"
          >
            Explore Business Opportunities
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </section>

        {searchHistory.length > 0 && (
          <section className="mt-8 rounded-2xl border border-on-surface/10 bg-on-surface/5 p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FF5A00]">history</span>
              <div>
                <h2 className="text-base font-bold text-on-surface">Past advisory searches</h2>
                <p className="text-xs text-on-surface/50">Restoring a search also restores its linked findings, comparison, and selected business.</p>
              </div>
            </div>
            <div className="space-y-3">
              {searchHistory.slice(0, 5).map(search => (
                <div key={search.id} className="flex flex-col gap-3 rounded-xl border border-on-surface/10 bg-surface-container p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-on-surface">
                      {search.profile?.location?.district || 'Saved location'}{search.profile?.location?.state ? `, ${search.profile.location.state}` : ''}
                    </p>
                    <p className="text-xs text-on-surface/55">
                      {new Date(search.updatedAt).toLocaleString()} · {search.discovery?.results?.length || 0} findings
                      {search.comparison?.businesses?.length ? ` · ${search.comparison.businesses.length} compared` : ''}
                      {search.selectedBusiness?.name ? ` · ${search.selectedBusiness.name}` : ''}
                      {search.feasibilityReport ? ' · report saved' : ''}
                      {search.financialPlan?.plan ? ' · financial plan saved' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => {
                        restoreSearch(search.id);
                        navigate(search.discovery ? 'explore' : 'advisory');
                      }}
                      className="rounded-lg border border-[#FF5A00]/30 px-3 py-2 text-xs font-bold text-[#FF8C00] hover:bg-[#FF5A00]/10"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => setSearchPendingDeletion(search)}
                      className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-400/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {searchPendingDeletion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-advisory-title">
            <div className="w-full max-w-md rounded-2xl border border-red-400/25 bg-surface-container p-6 shadow-2xl">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined rounded-full bg-red-400/10 p-2 text-red-300">delete_forever</span>
                <div>
                  <h2 id="delete-advisory-title" className="text-lg font-bold text-on-surface">Delete this advisory search?</h2>
                  <p className="mt-2 text-sm text-on-surface/65">
                    This removes the saved profile, findings, comparison, report, and financial plan for <span className="font-semibold text-on-surface">{searchPendingDeletion.profile?.location?.district || 'this location'}</span>. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setSearchPendingDeletion(null)} className="rounded-xl border border-on-surface/15 px-4 py-2 text-sm font-bold text-on-surface/70 hover:bg-on-surface/5">
                  Cancel
                </button>
                <button onClick={confirmDeleteSearch} className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-400">
                  Delete search
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
