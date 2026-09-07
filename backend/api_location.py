"""
Location profile — Nominatim reverse/forward geocode with explicit provenance.
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, Any, Dict, Tuple
import datetime
import requests
import asyncio
import time
from collections import OrderedDict

# `requests` normally uses its bundled certificate file. On Windows that can
# miss an enterprise/local trust root even though the browser trusts it. Use the
# operating-system trust store for every verified HTTPS call; do not disable TLS
# verification for public data providers.
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

router = APIRouter()

# Known city centroids for common advisory selections (not fake businesses)
KNOWN_PLACES = {
    ("maharashtra", "nagpur"): (21.1458, 79.0882),
    ("telangana", "warangal"): (17.9689, 79.5941),
    ("telangana", "nizamabad"): (18.6725, 78.0941),
    ("telangana", "karimnagar"): (18.4386, 79.1288),
    ("telangana", "siddipet"): (18.1018, 78.8520),
    ("telangana", "kamareddy"): (18.3200, 78.3400),
    ("telangana", "adilabad"): (19.6641, 78.5320),
}

LOCATION_CACHE_TTL_SECONDS = 24 * 60 * 60
LOCATION_STALE_TTL_SECONDS = 7 * 24 * 60 * 60
MAX_LOCATION_CACHE_ENTRIES = 200
_location_cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()

# Official Census of India data. `geo_codes` lets us resolve a human-readable
# area to Census codes; PCA-SD then returns the Total population (indicator 2)
# for a Census 2011 district. Both are cached because the Census service is a
# shared public provider, not a request-time dependency for every page visit.
CENSUS_API_BASE = "https://censusindia.gov.in/nada/index.php/api/tables/data/2011"
CENSUS_GEO_CODES_URL = f"{CENSUS_API_BASE}/geo_codes"
CENSUS_PCA_DISTRICT_URL = f"{CENSUS_API_BASE}/PC11_PCA-SD"
CENSUS_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60
CENSUS_STALE_TTL_SECONDS = 180 * 24 * 60 * 60
MAX_CENSUS_CACHE_ENTRIES = 600
_census_cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()


def _normalise_area_name(value: str) -> str:
    return " ".join(
        "".join(char.lower() if char.isalnum() else " " for char in (value or "")).split()
    )


def _same_area_name(left: str, right: str) -> bool:
    """Treat Census administrative spellings with/without spaces as equivalent."""
    return _normalise_area_name(left).replace(" ", "") == _normalise_area_name(right).replace(" ", "")


def _state_names_match(requested: str, census_state: str) -> bool:
    requested_normalised = _normalise_area_name(requested)
    census_normalised = _normalise_area_name(census_state)
    if not requested_normalised or requested_normalised == census_normalised:
        return True
    # Telangana was part of Andhra Pradesh at the 2011 Census. This only
    # chooses the historical Census record; the UI shows its Census geography.
    legacy_equivalents = {
        "telangana": {"andhra pradesh", "telangana"},
        "andhra pradesh": {"andhra pradesh", "telangana"},
        "odisha": {"orissa", "odisha"},
        "uttarakhand": {"uttaranchal", "uttarakhand"},
    }
    return census_normalised in legacy_equivalents.get(requested_normalised, set())


def _census_cache_get(key: str, allow_stale: bool = False) -> Optional[Tuple[Dict[str, Any], str]]:
    entry = _census_cache.get(key)
    if not entry:
        return None
    age_seconds = time.monotonic() - entry["savedAt"]
    if age_seconds <= CENSUS_CACHE_TTL_SECONDS:
        _census_cache.move_to_end(key)
        return dict(entry["value"]), "fresh"
    if allow_stale and age_seconds <= CENSUS_STALE_TTL_SECONDS:
        _census_cache.move_to_end(key)
        return dict(entry["value"]), "stale"
    if age_seconds > CENSUS_STALE_TTL_SECONDS:
        _census_cache.pop(key, None)
    return None


def _census_cache_put(key: str, value: Dict[str, Any]) -> None:
    _census_cache[key] = {"value": dict(value), "savedAt": time.monotonic()}
    _census_cache.move_to_end(key)
    while len(_census_cache) > MAX_CENSUS_CACHE_ENTRIES:
        _census_cache.popitem(last=False)


def _parse_census_population(value: Any) -> Optional[int]:
    digits = "".join(character for character in str(value or "") if character.isdigit())
    return int(digits) if digits else None


def _unavailable_census(reason: str) -> Dict[str, Any]:
    return {
        "population": None,
        "status": "unavailable",
        "reason": reason,
        "source": "ORGI Census API",
        "year": 2011,
        "attribution": "This product uses the ORGI Census API but is not endorsed or certified by ORGI.",
    }


def _fetch_census_population(state: str, district: str) -> Dict[str, Any]:
    """Return an official Census 2011 total for the resolved area, or no value.

    No seeded/demonstration population is ever substituted here. This keeps a
    missing public-provider response visibly missing instead of looking real.
    """
    cache_key = f"{_normalise_area_name(state)}:{_normalise_area_name(district)}"
    cached = _census_cache_get(cache_key)
    if cached:
        value, cache_status = cached
        value["cacheStatus"] = cache_status
        return value

    try:
        # Census retains historic spellings such as `Rangareddy`, while a
        # current administrative name may be written `Ranga Reddy`. Retry a
        # collapsed-space query, then verify the returned name locally.
        area_queries = [district]
        collapsed_area = "".join((district or "").split())
        census_style_collapsed = collapsed_area.capitalize()
        if census_style_collapsed and census_style_collapsed != district:
            area_queries.append(census_style_collapsed)
        candidates = []
        for area_query in area_queries:
            geo_response = requests.get(
                CENSUS_GEO_CODES_URL,
                params={"areaname": area_query, "level": "district"},
                timeout=5,
            )
            geo_response.raise_for_status()
            candidates.extend((geo_response.json() or {}).get("data") or [])
            if candidates:
                break
        candidates = [
            candidate for candidate in candidates
            if _same_area_name(candidate.get("areaname", ""), district)
            and candidate.get("level") == "district"
        ]
        state_matches = [
            candidate for candidate in candidates
            if _state_names_match(state, candidate.get("state_name", ""))
        ]
        record = (state_matches or candidates or [None])[0]

        # Some current administrative districts did not exist in Census 2011.
        # In that case we can still return an exact Census locality record, but
        # explicitly label its geographic level rather than calling it a district.
        if not record:
            locality_response = requests.get(
                CENSUS_GEO_CODES_URL,
                params={"areaname": district},
                timeout=5,
            )
            locality_response.raise_for_status()
            locality_candidates = (locality_response.json() or {}).get("data") or []
            locality_candidates = [
                candidate for candidate in locality_candidates
                if _same_area_name(candidate.get("areaname", ""), district)
            ]
            locality_state_matches = [
                candidate for candidate in locality_candidates
                if _state_names_match(state, candidate.get("state_name", ""))
            ]
            record = (locality_state_matches or locality_candidates or [None])[0]

        if not record:
            result = _unavailable_census("No matching Census 2011 geography was found for this location.")
            _census_cache_put(cache_key, result)
            return result

        population = _parse_census_population(record.get("population"))
        geographic_level = record.get("level") or "area"
        table = "2011 geo_codes"

        # Use the PCA district table's explicit Total population indicator when
        # the match is a district. The geographic lookup remains the source of
        # the historical area name and Census codes.
        if geographic_level == "district":
            pca_response = requests.get(
                CENSUS_PCA_DISTRICT_URL,
                params={
                    "state": record.get("state"),
                    "district": record.get("district"),
                    "geo_level": 2,
                    "urbrur": 0,
                    "indicator": 2,
                    "limit": 1,
                },
                timeout=5,
            )
            if pca_response.ok:
                rows = (pca_response.json() or {}).get("data") or []
                if rows:
                    population = _parse_census_population(rows[0].get("value")) or population
                    table = "PC11_PCA-SD, indicator 2 (Total population - Both sexes)"

        if population is None:
            result = _unavailable_census("The Census record did not include a total population value.")
            _census_cache_put(cache_key, result)
            return result

        result = {
            "population": population,
            "status": "available",
            "year": 2011,
            "geographicLevel": geographic_level,
            "areaName": record.get("areaname") or district,
            "censusState": record.get("state_name") or state,
            "table": table,
            "source": "ORGI Census API",
            "sourceUrl": "https://censusindia.gov.in/census.website/en/data/api/documentation",
            "attribution": "This product uses the ORGI Census API but is not endorsed or certified by ORGI.",
            "cacheStatus": "fresh",
        }
        _census_cache_put(cache_key, result)
        return result
    except requests.RequestException as error:
        stale = _census_cache_get(cache_key, allow_stale=True)
        if stale:
            value, _ = stale
            value["cacheStatus"] = "stale"
            return value
        print(f"Census API error: {type(error).__name__}")
        return _unavailable_census("The official Census service is temporarily unavailable.")
    except (TypeError, ValueError, KeyError) as error:
        print(f"Census response error: {type(error).__name__}")
        return _unavailable_census("The official Census response could not be read.")


def _cache_get(key: str, allow_stale: bool = False) -> Optional[Tuple[Dict[str, Any], str]]:
    entry = _location_cache.get(key)
    if not entry:
        return None
    age_seconds = time.monotonic() - entry["savedAt"]
    if age_seconds <= LOCATION_CACHE_TTL_SECONDS:
        _location_cache.move_to_end(key)
        return dict(entry["value"]), "fresh"
    if allow_stale and age_seconds <= LOCATION_STALE_TTL_SECONDS:
        _location_cache.move_to_end(key)
        return dict(entry["value"]), "stale"
    if age_seconds > LOCATION_STALE_TTL_SECONDS:
        _location_cache.pop(key, None)
    return None


def _cache_put(key: str, value: Dict[str, Any]) -> None:
    _location_cache[key] = {"value": dict(value), "savedAt": time.monotonic()}
    _location_cache.move_to_end(key)
    while len(_location_cache) > MAX_LOCATION_CACHE_ENTRIES:
        _location_cache.popitem(last=False)


def _nominatim_reverse(lat: float, lng: float) -> Optional[dict]:
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json", "addressdetails": 1},
            headers={"User-Agent": "ArthnitiLocation/1.0"},
            timeout=6,
        )
        if not resp.ok:
            return None
        data = resp.json()
        addr = data.get("address") or {}
        return {
            "state": addr.get("state") or "",
            "district": (
                addr.get("state_district")
                or addr.get("county")
                or addr.get("city")
                or addr.get("town")
                or addr.get("suburb")
                or ""
            ),
            "block": addr.get("suburb") or addr.get("neighbourhood") or "",
            "village": addr.get("village") or addr.get("hamlet") or addr.get("city") or addr.get("town") or "",
            "display": data.get("display_name") or "",
        }
    except Exception as e:
        print(f"Nominatim reverse error: {type(e).__name__}")
        return None


def _nominatim_forward(query: str) -> Optional[tuple]:
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 1},
            headers={"User-Agent": "ArthnitiLocation/1.0"},
            timeout=6,
        )
        if resp.ok and resp.json():
            hit = resp.json()[0]
            return float(hit["lat"]), float(hit["lon"])
    except Exception as e:
        print(f"Nominatim forward error: {type(e).__name__}")
    return None


@router.get("/profile")
async def get_location_profile(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    district: Optional[str] = None,
    state: Optional[str] = None,
    cityOrVillage: Optional[str] = None,
):
    if not district and not cityOrVillage and (lat is None or lng is None):
        raise HTTPException(status_code=400, detail="Must provide lat/lng or district/state")

    timestamp = datetime.datetime.now().isoformat()
    source = "OpenStreetMap Nominatim"
    confidence = "medium"
    resolved_district = district or ""
    resolved_state = state or ""
    block = ""
    village = cityOrVillage or ""
    coords_lat = lat
    coords_lng = lng

    if lat is not None and lng is not None:
        reverse_key = f"reverse:{float(lat):.5f}:{float(lng):.5f}"
        cached_geo = _cache_get(reverse_key)
        geo = cached_geo[0] if cached_geo else await asyncio.to_thread(_nominatim_reverse, lat, lng)
        if geo:
            if not cached_geo:
                _cache_put(reverse_key, geo)
            resolved_state = geo["state"] or resolved_state
            resolved_district = geo["district"] or resolved_district
            block = geo["block"]
            village = geo["village"] or village
            confidence = "high"
            if cached_geo:
                source = "OpenStreetMap Nominatim (cached)"
        else:
            stale_geo = _cache_get(reverse_key, allow_stale=True)
            if stale_geo:
                geo = stale_geo[0]
                resolved_state = geo["state"] or resolved_state
                resolved_district = geo["district"] or resolved_district
                block = geo["block"]
                village = geo["village"] or village
                source = "OpenStreetMap Nominatim (stale cache)"
                confidence = "medium"
                return await _location_response(resolved_state, resolved_district, block, village, coords_lat, coords_lng, source, confidence, timestamp)
            # Deterministic fallback labels from known region (still with real coords)
            key = None
            for (st, dist), (kla, klo) in KNOWN_PLACES.items():
                if abs(kla - lat) < 0.5 and abs(klo - lng) < 0.5:
                    key = (st, dist)
                    break
            if key:
                resolved_state = key[0].title()
                resolved_district = key[1].title()
            source = "GPS coordinates (Nominatim unavailable)"
            confidence = "medium"
    else:
        # Forward geocode district/city
        place_key = ((state or "").strip().lower(), (district or cityOrVillage or "").strip().lower())
        if place_key in KNOWN_PLACES:
            coords_lat, coords_lng = KNOWN_PLACES[place_key]
            resolved_state = state or place_key[0].title()
            resolved_district = district or place_key[1].title()
            confidence = "high"
            source = "Known place centroid + OpenStreetMap"
        else:
            query = ", ".join([p for p in [cityOrVillage, district, state, "India"] if p])
            forward_key = f"forward:{query.casefold()}"
            cached_coords = _cache_get(forward_key)
            fwd = (cached_coords[0]["lat"], cached_coords[0]["lng"]) if cached_coords else await asyncio.to_thread(_nominatim_forward, query)
            if fwd:
                coords_lat, coords_lng = fwd
                confidence = "high"
                if cached_coords:
                    source = "OpenStreetMap Nominatim (cached)"
                else:
                    _cache_put(forward_key, {"lat": coords_lat, "lng": coords_lng})
            else:
                stale_coords = _cache_get(forward_key, allow_stale=True)
                if stale_coords:
                    coords_lat, coords_lng = stale_coords[0]["lat"], stale_coords[0]["lng"]
                    source = "OpenStreetMap Nominatim (stale cache)"
                    confidence = "medium"
                    return await _location_response(resolved_state, resolved_district, block, village, coords_lat, coords_lng, source, confidence, timestamp)
                # Last resort: Nagpur only if user asked for Nagpur-ish
                if "nagpur" in (district or "").lower() or "nagpur" in (cityOrVillage or "").lower():
                    coords_lat, coords_lng = 21.1458, 79.0882
                    resolved_state = "Maharashtra"
                    resolved_district = "Nagpur"
                    source = "Known place centroid (Nagpur)"
                else:
                    raise HTTPException(status_code=404, detail="Could not resolve location coordinates")

    return await _location_response(resolved_state, resolved_district, block, village, coords_lat, coords_lng, source, confidence, timestamp)


async def _location_response(
    resolved_state: str,
    resolved_district: str,
    block: str,
    village: str,
    coords_lat: Optional[float],
    coords_lng: Optional[float],
    source: str,
    confidence: str,
    timestamp: str,
) -> Dict[str, Any]:
    census = await asyncio.to_thread(_fetch_census_population, resolved_state, resolved_district)
    return {
        "location": {
            "state": resolved_state,
            "district": resolved_district,
            "block": block or "Central Block",
            "village": village or resolved_district,
            "cityOrVillage": village or resolved_district,
            "coordinates": {"lat": coords_lat or 0.0, "lng": coords_lng or 0.0},
            "latitude": coords_lat or 0.0,
            "longitude": coords_lng or 0.0,
        },
        "signals": {
            "primarySectors": ["Agriculture", "Retail", "Services"],
            "population": census.get("population"),
            "msmeDensity": "medium",
            "demandAnchors": ["Local Market", "Bus Stand", "School", "Hospital"],
        },
        "provenance": {
            "source": source,
            "retrievedAt": timestamp,
            "confidence": confidence,
            "dataType": "geocode",
        },
        "census": census,
    }
