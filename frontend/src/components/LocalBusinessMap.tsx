import React, { useEffect, useMemo } from 'react';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationProfile, BusinessItem } from '../providers/types';

interface LocalBusinessMapProps {
  location: LocationProfile;
  business: BusinessItem;
}

type MapCenter = [number, number];

function MapViewUpdater({ center }: { center: MapCenter }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), 13), { animate: true });
  }, [center, map]);

  return null;
}

const asFiniteNumber = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

export default function LocalBusinessMap({ location, business }: LocalBusinessMapProps) {
  const center = useMemo<MapCenter | null>(() => {
    const latitude = asFiniteNumber(location.latitude ?? location.coordinates?.lat);
    const longitude = asFiniteNumber(location.longitude ?? location.coordinates?.lng);
    if (latitude === null || longitude === null || (latitude === 0 && longitude === 0)) return null;
    return [latitude, longitude];
  }, [location.coordinates?.lat, location.coordinates?.lng, location.latitude, location.longitude]);

  const radiusKm = Math.max(1, Math.min(20, Number(business.radiusKm) || 5));
  const locationName = location.cityOrVillage || location.village || location.block || location.district || 'Selected location';
  const competitorLabel = business.competitorCount == null
    ? `${business.competitorDensity || 'Unknown'} competition`
    : `${business.competitorCount} mapped competitor${business.competitorCount === 1 ? '' : 's'} · ${business.competitorDensity || 'unknown'} density`;

  if (!center) {
    return (
      <div className="rounded-2xl border border-outline-variant/10 bg-surface-container p-8 text-center">
        <span className="material-symbols-outlined mb-3 block text-4xl text-on-surface/35">map</span>
        <h3 className="font-headline text-lg font-bold text-on-surface">Map needs a valid location</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-on-surface/60">
          Add or update the address in Business Advisory, then generate the report again to open an interactive map.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[430px] w-full overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container">
      <MapContainer
        center={center}
        zoom={13}
        minZoom={3}
        scrollWheelZoom
        className="h-full w-full"
        aria-label={`Interactive OpenStreetMap centered on ${locationName}`}
      >
        <MapViewUpdater center={center} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle
          center={center}
          radius={radiusKm * 1000}
          pathOptions={{ color: '#FF5A00', fillColor: '#FF5A00', fillOpacity: 0.08, weight: 2 }}
        />
        <CircleMarker
          center={center}
          radius={9}
          pathOptions={{ color: '#ffffff', fillColor: '#2563eb', fillOpacity: 1, weight: 3 }}
        >
          <Popup>
            <strong>Proposed business area</strong><br />
            {locationName}<br />
            {radiusKm} km feasibility radius
          </Popup>
        </CircleMarker>
      </MapContainer>

      <div className="pointer-events-none absolute left-4 top-4 z-[500] max-w-[245px] rounded-xl border border-outline-variant/25 bg-surface-container-high/95 p-3 text-xs shadow-lg backdrop-blur">
        <h4 className="mb-1 font-bold text-on-surface">{locationName}</h4>
        <p className="text-on-surface/65">Interactive 2D OpenStreetMap</p>
        <div className="mt-2 space-y-1.5 text-on-surface-variant">
          <p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-white" />Proposed site</p>
          <p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full border border-[#FF5A00] bg-[#FF5A00]/25" />{radiusKm} km study area</p>
          <p>{competitorLabel}</p>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-7 right-4 z-[500] max-w-[290px] rounded-lg bg-surface-container-high/95 px-3 py-2 text-[10px] text-on-surface/65 shadow backdrop-blur">
        Pan, zoom, and tap the blue marker. Competition is shown as a report aggregate; no estimated businesses are plotted as real locations.
      </div>
    </div>
  );
}
