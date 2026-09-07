"""Business discovery & comparison using free OpenStreetMap providers only."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union, Tuple
import datetime
import math
import requests
import asyncio
import time
from collections import OrderedDict
import finance_engine
import scheme_matcher

router = APIRouter()

# Public providers need a conservative request rate. These bounded in-memory
# caches remove repeat requests while keeping the underlying map data recent.
COORDINATE_CACHE_TTL_SECONDS = 24 * 60 * 60
MAP_SIGNAL_CACHE_TTL_SECONDS = 10 * 60
MAP_SIGNAL_STALE_SECONDS = 6 * 60 * 60
MAX_COORDINATE_CACHE_ENTRIES = 100
MAX_MAP_SIGNAL_CACHE_ENTRIES = 80
OVERPASS_QUERY_TIMEOUT_SECONDS = 18
OVERPASS_REQUEST_TIMEOUT_SECONDS = 18
OVERPASS_TOTAL_BUDGET_SECONDS = 25

_coordinate_cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
_map_signal_cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
_map_signal_inflight: Dict[str, asyncio.Task] = {}
_map_signal_lock = asyncio.Lock()

# ── Request models (accept both new + legacy shapes) ─────────────────────────

class LocationBody(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    state: Optional[str] = ""
    district: Optional[str] = ""
    cityOrVillage: Optional[str] = ""
    block: Optional[str] = ""
    village: Optional[str] = ""
    radiusKm: Optional[int] = None
    coordinates: Optional[Dict[str, Any]] = None

    class Config:
        extra = "allow"


class ProfileBody(BaseModel):
    skills: Optional[List[str]] = []
    workPreference: Optional[str] = ""
    spaceStatus: Optional[str] = ""
    availability: Optional[str] = ""
    skillLevel: Optional[str] = ""
    workType: Optional[str] = ""
    householdExpenses: Optional[float] = 0
    isArtisan: Optional[bool] = False
    isSHGMember: Optional[bool] = False
    isExistingEnterprise: Optional[bool] = False
    isWomenEnterprise: Optional[bool] = False

    class Config:
        extra = "allow"


class FiltersBody(BaseModel):
    category: Optional[str] = ""
    withinBudget: Optional[bool] = None
    schemeSupported: Optional[bool] = None

    class Config:
        extra = "allow"


class DiscoverRequest(BaseModel):
    location: Dict[str, Any]
    budget: Optional[float] = None
    profile: Optional[Dict[str, Any]] = None
    filters: Optional[Dict[str, Any]] = None
    # Legacy fields
    radius: Optional[Union[str, int, float]] = None
    marginCapital: Optional[float] = None
    skillLevel: Optional[str] = ""
    workType: Optional[str] = ""
    isArtisan: Optional[bool] = False
    isWomenEnterprise: Optional[bool] = False


class CompareRequest(BaseModel):
    businesses: List[dict]
    budget: float
    location: Optional[Dict[str, Any]] = None
    schemeMatches: Optional[List[dict]] = None
    profile: Optional[Dict[str, Any]] = None


# ── Category taxonomy queried from live providers ────────────────────────────

CATEGORY_QUERIES = {
    "grocery": {"osm_shop": ["convenience", "supermarket", "grocery", "general"], "places": "grocery store|kirana"},
    "dairy": {"osm_shop": ["dairy", "cheese"], "places": "dairy|milk"},
    "food": {"osm_amenity": ["restaurant", "cafe", "fast_food", "food_court"], "places": "restaurant|tiffin"},
    "tailoring": {"osm_shop": ["tailor", "clothes", "boutique", "fabric"], "osm_craft": ["tailor"], "places": "tailor|garment"},
    "printing": {"osm_shop": ["copyshop", "stationery", "books"], "places": "printing|stationery|xerox"},
    "repair": {"osm_shop": ["mobile_phone", "electronics", "computer", "car_repair", "motorcycle"], "places": "mobile repair|electronics repair"},
    "agriculture": {"osm_shop": ["agrarian", "farm", "garden_centre"], "places": "agricultural supplier|fertilizer"},
    "rental": {"osm_shop": ["rental", "hardware"], "places": "equipment rental|tool rental"},
    "transport": {"osm_amenity": ["taxi", "bus_station"], "osm_shop": ["car"], "places": "transport|logistics|tempo"},
    "handicrafts": {"osm_craft": ["handicraft", "pottery", "jeweller", "basket_maker"], "osm_shop": ["gift", "art"], "places": "handicraft|artisan"},
    "beauty": {"osm_shop": ["beauty", "hairdresser", "cosmetics"], "places": "salon|beauty parlor"},
    "digital": {"osm_amenity": ["internet_cafe"], "osm_shop": ["computer", "mobile_phone"], "places": "cyber cafe|CSC|documentation"},
}

DEMAND_ANCHORS = {
    "schools": {"osm_amenity": ["school", "college", "university", "kindergarten"]},
    "hospitals": {"osm_amenity": ["hospital", "clinic", "doctors"]},
    "markets": {"osm_amenity": ["marketplace", "bus_station", "townhall"], "osm_shop": ["mall", "marketplace"]},
    "industrial": {"osm_landuse": ["industrial", "commercial"]},
}


def _coordinate_cache_get(key: str) -> Optional[Tuple[float, float, str]]:
    entry = _coordinate_cache.get(key)
    if not entry:
        return None
    age_seconds = time.monotonic() - entry["savedAt"]
    if age_seconds > COORDINATE_CACHE_TTL_SECONDS:
        _coordinate_cache.pop(key, None)
        return None
    _coordinate_cache.move_to_end(key)
    return entry["lat"], entry["lon"], f"cache:{entry['source']}"


def _coordinate_cache_put(key: str, lat: float, lon: float, source: str) -> None:
    _coordinate_cache[key] = {
        "lat": lat,
        "lon": lon,
        "source": source,
        "savedAt": time.monotonic(),
    }
    _coordinate_cache.move_to_end(key)
    while len(_coordinate_cache) > MAX_COORDINATE_CACHE_ENTRIES:
        _coordinate_cache.popitem(last=False)


async def _resolve_coords(location: dict) -> tuple:
    lat = location.get("latitude") or location.get("lat")
    lon = location.get("longitude") or location.get("lng")
    coords = location.get("coordinates") or {}
    if lat is None:
        lat = coords.get("lat") or coords.get("latitude")
    if lon is None:
        lon = coords.get("lng") or coords.get("longitude")
    if lat is not None and lon is not None:
        return float(lat), float(lon), "provided"

    # Geocode via Nominatim when only place names exist
    place_parts = [
        location.get("cityOrVillage") or location.get("village") or "",
        location.get("district") or "",
        location.get("state") or "",
        "India",
    ]
    query = ", ".join([p for p in place_parts if p])
    if query.strip(", India"):
        cache_key = f"forward:{query.casefold()}"
        cached = _coordinate_cache_get(cache_key)
        if cached:
            return cached
        try:
            resp = await asyncio.to_thread(
                requests.get,
                "https://nominatim.openstreetmap.org/search",
                params={"q": query, "format": "json", "limit": 1},
                headers={"User-Agent": "ArthnitiBusinessDiscovery/1.0"},
                timeout=6,
            )
            if resp.ok and resp.json():
                hit = resp.json()[0]
                resolved_lat, resolved_lon = float(hit["lat"]), float(hit["lon"])
                _coordinate_cache_put(cache_key, resolved_lat, resolved_lon, "nominatim")
                return resolved_lat, resolved_lon, f"nominatim:{query}"
        except Exception as e:
            print(f"Nominatim geocode error: {type(e).__name__}")

    # Nagpur center — last-resort known demo point (explicitly attributed)
    return 21.1458, 79.0882, "fallback:nagpur_center"


def _parse_radius_km(req: DiscoverRequest) -> int:
    loc = req.location or {}
    if loc.get("radiusKm") in (5, 10, 20):
        return int(loc["radiusKm"])
    if req.radius is not None:
        if isinstance(req.radius, str) and req.radius.endswith("km"):
            try:
                return max(1, int(req.radius.replace("km", "")))
            except ValueError:
                pass
        elif isinstance(req.radius, (int, float)):
            return max(1, int(req.radius))
    return 5


def _budget(req: DiscoverRequest) -> float:
    if req.budget is not None:
        return float(req.budget)
    if req.marginCapital is not None:
        return float(req.marginCapital)
    return 0.0


def query_overpass(lat: float, lon: float, radius_meters: int) -> Dict[str, Any]:
    """Fetch only the OSM tags used by Arthniti's deterministic ranking."""
    radius_meters = min(int(radius_meters), 20000)
    query = f"""
    [out:json][timeout:{OVERPASS_QUERY_TIMEOUT_SECONDS}];
    (
      node["shop"~"convenience|supermarket|grocery|general|dairy|cheese|copyshop|stationery|books|tailor|clothes|boutique|fabric|mobile_phone|electronics|computer|car_repair|motorcycle|agrarian|farm|garden_centre|rental|hardware|car|gift|art|beauty|hairdresser|cosmetics"](around:{radius_meters},{lat},{lon});
      way["shop"~"convenience|supermarket|grocery|general|dairy|cheese|copyshop|stationery|books|tailor|clothes|boutique|fabric|mobile_phone|electronics|computer|car_repair|motorcycle|agrarian|farm|garden_centre|rental|hardware|car|gift|art|beauty|hairdresser|cosmetics"](around:{radius_meters},{lat},{lon});
      node["amenity"~"school|college|university|kindergarten|hospital|clinic|doctors|restaurant|cafe|fast_food|food_court|marketplace|bus_station|townhall|internet_cafe|taxi"](around:{radius_meters},{lat},{lon});
      way["amenity"~"school|college|university|hospital|clinic|marketplace|bus_station"](around:{radius_meters},{lat},{lon});
      node["craft"~"tailor|handicraft|pottery|jeweller|basket_maker"](around:{radius_meters},{lat},{lon});
      way["landuse"~"industrial|commercial|retail"](around:{radius_meters},{lat},{lon});
    );
    out center tags 160;
    """
    headers = {
        "User-Agent": "ArthnitiBusinessDiscovery/1.0 (local-dev)",
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    mirrors = [
        "https://overpass-api.de/api/interpreter",
        "https://lz4.overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]
    last_error = None
    deadline = time.monotonic() + OVERPASS_TOTAL_BUDGET_SECONDS
    for overpass_url in mirrors:
        remaining = deadline - time.monotonic()
        if remaining <= 1:
            last_error = "request_budget_exhausted"
            break
        try:
            response = requests.post(
                overpass_url,
                data={"data": query},
                headers=headers,
                timeout=min(OVERPASS_REQUEST_TIMEOUT_SECONDS, remaining),
            )
            if response.status_code in (429, 504, 502, 406):
                last_error = f"http_{response.status_code}"
                continue
            response.raise_for_status()
            data = response.json()
            elements = data.get("elements") or []
            return {
                "ok": True,
                "reason": "ok" if elements else "empty_area",
                "elements": elements,
                "provider": f"OpenStreetMap Overpass API ({overpass_url.split('/')[2]})",
                "count": len(elements),
            }
        except Exception as e:
            last_error = type(e).__name__
            print(f"Overpass API Error ({overpass_url.split('/')[2]}): {last_error}")
            continue
    return {
        "ok": False,
        "reason": "provider_error",
        "elements": [],
        "provider": "OpenStreetMap Overpass API",
        "count": 0,
        "lastError": last_error,
    }


def _signal_cache_key(lat: float, lon: float, radius_meters: int) -> str:
    # Roughly 11 m precision prevents GPS jitter from defeating cache reuse.
    return f"{lat:.4f}:{lon:.4f}:{int(radius_meters)}"


def _copy_provider_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {**payload, "elements": list(payload.get("elements") or [])}


def _store_map_signal(key: str, payload: Dict[str, Any]) -> None:
    _map_signal_cache[key] = {"payload": _copy_provider_payload(payload), "savedAt": time.monotonic()}
    _map_signal_cache.move_to_end(key)
    while len(_map_signal_cache) > MAX_MAP_SIGNAL_CACHE_ENTRIES:
        _map_signal_cache.popitem(last=False)


def _cached_map_signal(key: str, max_age_seconds: float) -> Optional[Tuple[Dict[str, Any], int]]:
    entry = _map_signal_cache.get(key)
    if not entry:
        return None
    age_seconds = time.monotonic() - entry["savedAt"]
    if age_seconds > max_age_seconds:
        return None
    _map_signal_cache.move_to_end(key)
    return _copy_provider_payload(entry["payload"]), int(age_seconds)


async def get_osm_signals(lat: float, lon: float, radius_meters: int) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Serve fresh cache, share duplicate work, and use a labelled stale fallback."""
    key = _signal_cache_key(lat, lon, radius_meters)
    cached = _cached_map_signal(key, MAP_SIGNAL_CACHE_TTL_SECONDS)
    if cached:
        payload, age_seconds = cached
        return payload, {"cacheStatus": "fresh", "cacheAgeSeconds": age_seconds, "providerLatencyMs": 0, "stale": False}

    async with _map_signal_lock:
        cached = _cached_map_signal(key, MAP_SIGNAL_CACHE_TTL_SECONDS)
        if cached:
            payload, age_seconds = cached
            return payload, {"cacheStatus": "fresh", "cacheAgeSeconds": age_seconds, "providerLatencyMs": 0, "stale": False}
        task = _map_signal_inflight.get(key)
        if task is None:
            task = asyncio.create_task(asyncio.to_thread(query_overpass, lat, lon, radius_meters))
            _map_signal_inflight[key] = task

            def cache_completed(completed_task: asyncio.Task) -> None:
                if _map_signal_inflight.get(key) is completed_task:
                    _map_signal_inflight.pop(key, None)
                if completed_task.cancelled():
                    return
                try:
                    completed_payload = completed_task.result()
                except Exception:
                    return
                if completed_payload.get("ok"):
                    _store_map_signal(key, completed_payload)

            task.add_done_callback(cache_completed)

    started = time.perf_counter()
    payload = await asyncio.shield(task)
    provider_latency_ms = round((time.perf_counter() - started) * 1000)

    if payload.get("ok"):
        return payload, {"cacheStatus": "miss", "cacheAgeSeconds": 0, "providerLatencyMs": provider_latency_ms, "stale": False}

    stale = _cached_map_signal(key, MAP_SIGNAL_STALE_SECONDS)
    if stale:
        stale_payload, age_seconds = stale
        stale_payload["fallbackNote"] = "Live OSM data is temporarily unavailable; showing the most recent cached local signals."
        return stale_payload, {"cacheStatus": "stale", "cacheAgeSeconds": age_seconds, "providerLatencyMs": provider_latency_ms, "stale": True}

    return payload, {"cacheStatus": "miss", "cacheAgeSeconds": None, "providerLatencyMs": provider_latency_ms, "stale": False}


def analyze_elements(elements: List[dict]) -> Dict[str, int]:
    counts = {
        "grocery": 0, "dairy": 0, "food": 0, "tailoring": 0, "printing": 0,
        "repair": 0, "agriculture": 0, "rental": 0, "transport": 0,
        "handicrafts": 0, "beauty": 0, "digital": 0,
        "schools": 0, "hospitals": 0, "markets": 0, "industrial": 0,
        "total": len(elements),
    }

    for el in elements:
        tags = el.get("tags") or {}
        amenity = (tags.get("amenity") or "").lower()
        shop = (tags.get("shop") or "").lower()
        craft = (tags.get("craft") or "").lower()
        landuse = (tags.get("landuse") or "").lower()
        types = [str(t).lower() for t in (tags.get("types") or [])]
        blob = " ".join([amenity, shop, craft, landuse] + types)

        if amenity in ("school", "college", "university", "kindergarten") or "school" in types:
            counts["schools"] += 1
        if amenity in ("hospital", "clinic", "doctors") or "hospital" in types:
            counts["hospitals"] += 1
        if amenity in ("marketplace", "bus_station", "townhall") or shop in ("mall", "marketplace") or "bus_station" in types:
            counts["markets"] += 1
        if landuse in ("industrial", "commercial", "retail"):
            counts["industrial"] += 1

        if shop in ("convenience", "supermarket", "grocery", "general") or "supermarket" in types or "grocery" in blob:
            counts["grocery"] += 1
        if shop in ("dairy", "cheese") or "dairy" in blob or "milk" in blob:
            counts["dairy"] += 1
        if amenity in ("restaurant", "cafe", "fast_food", "food_court") or "restaurant" in types or "cafe" in types:
            counts["food"] += 1
        if shop in ("tailor", "clothes", "boutique", "fabric") or craft == "tailor" or "clothing" in blob:
            counts["tailoring"] += 1
        if shop in ("copyshop", "stationery", "books") or "stationery" in blob or "print" in blob:
            counts["printing"] += 1
        if shop in ("mobile_phone", "electronics", "computer", "car_repair", "motorcycle") or "electronics" in types or "repair" in blob:
            counts["repair"] += 1
        if shop in ("agrarian", "farm", "garden_centre") or "agricultur" in blob or "fertilizer" in blob:
            counts["agriculture"] += 1
        if shop in ("rental", "hardware") or "rental" in blob:
            counts["rental"] += 1
        if amenity in ("taxi", "bus_station") or "transport" in blob or "logistics" in blob:
            counts["transport"] += 1
        if craft in ("handicraft", "pottery", "jeweller", "basket_maker") or shop in ("gift", "art") or "handicraft" in blob:
            counts["handicrafts"] += 1
        if shop in ("beauty", "hairdresser", "cosmetics") or "beauty" in types or "salon" in blob:
            counts["beauty"] += 1
        if amenity == "internet_cafe" or "cyber" in blob or "documentation" in blob:
            counts["digital"] += 1

    return counts


def _density_label(comp_count: int, radius_km: float) -> str:
    """Absolute listing counts are more actionable than sparse OSM density ratios."""
    # Scale soft thresholds with radius (5km baseline)
    scale = max(1.0, radius_km / 5.0)
    if comp_count >= int(15 * scale):
        return "high"
    if comp_count >= int(5 * scale):
        return "medium"
    return "low"


# The form uses a small, explicit vocabulary for space and availability.  Keeping
# the mapping here makes the ranking explainable and avoids inferring a user's
# circumstances from location data.
IDEA_PROFILE_REQUIREMENTS = {
    "idea-grocery": {"workspaces": ("shop",), "availability": "full-time", "businessStage": "expansion", "shgFriendly": False, "artisanFriendly": False},
    "idea-dairy": {"workspaces": ("outdoor",), "availability": "full-time", "businessStage": "expansion", "shgFriendly": True, "artisanFriendly": False},
    "idea-food": {"workspaces": ("home", "shop"), "availability": "part-time", "businessStage": "startup", "shgFriendly": True, "artisanFriendly": False},
    "idea-tailoring": {"workspaces": ("home", "shop"), "availability": "part-time", "businessStage": "startup", "shgFriendly": True, "artisanFriendly": True},
    "idea-printing": {"workspaces": ("shop",), "availability": "full-time", "businessStage": "expansion", "shgFriendly": False, "artisanFriendly": False},
    "idea-repair": {"workspaces": ("shop",), "availability": "full-time", "businessStage": "expansion", "shgFriendly": False, "artisanFriendly": True},
    "idea-agri": {"workspaces": ("shop", "outdoor"), "availability": "full-time", "businessStage": "expansion", "shgFriendly": True, "artisanFriendly": False},
    "idea-rental": {"workspaces": ("shop", "outdoor"), "availability": "full-time", "businessStage": "expansion", "shgFriendly": False, "artisanFriendly": False},
    "idea-beauty": {"workspaces": ("home", "shop"), "availability": "flexible", "businessStage": "startup", "shgFriendly": True, "artisanFriendly": False},
    "idea-digital": {"workspaces": ("shop",), "availability": "full-time", "businessStage": "expansion", "shgFriendly": False, "artisanFriendly": False},
    "idea-transport": {"workspaces": ("outdoor",), "availability": "full-time", "businessStage": "expansion", "shgFriendly": False, "artisanFriendly": False},
    "idea-handicrafts": {"workspaces": ("home", "shared"), "availability": "part-time", "businessStage": "startup", "shgFriendly": True, "artisanFriendly": True},
}


def _profile_fit(idea: dict, profile: dict) -> tuple[int, dict]:
    """Return a transparent profile-fit score without changing scores for an empty optional profile."""
    requirements = IDEA_PROFILE_REQUIREMENTS.get(idea["id"], {})
    factors = {}
    points = 5

    work_preference = str(profile.get("workPreference") or "").strip().lower()
    if not work_preference or work_preference == idea["workType"]:
        points += 2
        factors["workType"] = "match"
    else:
        factors["workType"] = "different preference"

    skill_level = str(profile.get("skillLevel") or "").strip().lower()
    idea_skill = str(idea["skillLevel"]).lower()
    if not skill_level or idea_skill == "beginner" or idea_skill == skill_level:
        points += 3
        factors["skillLevel"] = "match"
    else:
        factors["skillLevel"] = "requires more experience"

    workspace = str(profile.get("spaceStatus") or "").strip().lower()
    if workspace:
        compatible_spaces = {workspace}
        if workspace == "shared":
            compatible_spaces.update(("home", "shop"))
        required_spaces = set(requirements.get("workspaces", ()))
        if compatible_spaces.intersection(required_spaces):
            points += 2
            factors["workspace"] = "match"
        else:
            points -= 2
            factors["workspace"] = "space may be needed"

    availability = str(profile.get("availability") or "").strip().lower()
    if availability:
        required_availability = requirements.get("availability")
        if availability == "flexible" or availability == required_availability:
            points += 2
            factors["availability"] = "match"
        elif availability == "full-time" and required_availability == "part-time":
            points += 1
            factors["availability"] = "sufficient"
        else:
            points -= 1
            factors["availability"] = "limited"

    try:
        household_expenses = max(0, float(profile.get("householdExpenses") or 0))
    except (TypeError, ValueError):
        household_expenses = 0
    if household_expenses > 0:
        available_surplus = idea["avgRevenue"] - idea["avgOperatingCost"] - household_expenses
        if available_surplus >= 0:
            points += 2
            factors["householdExpenses"] = "covered by estimated monthly surplus"
        else:
            points -= 3
            factors["householdExpenses"] = "estimated surplus may not cover household expenses"

    if profile.get("isExistingEnterprise"):
        if requirements.get("businessStage") == "expansion":
            points += 2
            factors["businessStatus"] = "expansion fit"
        else:
            factors["businessStatus"] = "new-line diversification"

    if profile.get("isArtisan") and requirements.get("artisanFriendly"):
        points += 3
        factors["artisan"] = "artisan fit"

    if profile.get("isSHGMember") and requirements.get("shgFriendly"):
        points += 2
        factors["shg"] = "SHG-friendly"

    return max(0, min(20, points)), factors


def _match_schemes_for_idea(idea: dict, profile: dict, budget: float, location: dict) -> List[dict]:
    """Use the same reviewed scheme matcher as ``/api/schemes/match``."""
    matcher_profile = dict(profile or {})
    matcher_profile.setdefault("projectCost", idea.get("minCapital") or idea.get("maxCapital") or 0)
    if budget and not matcher_profile.get("marginCapital"):
        matcher_profile["marginCapital"] = budget

    _, profile_factors = _profile_fit(idea, profile or {})
    matches = scheme_matcher.match_schemes(
        business_category=idea.get("category") or "",
        business_name=idea.get("name") or "",
        work_type=idea.get("workType") or "",
        profile=matcher_profile,
        location=location or {},
    )
    for match in matches:
        match["profileFactors"] = profile_factors
    return matches


def build_opportunities(
    counts: Dict[str, int],
    radius_km: float,
    budget: float,
    apply_budget: bool,
    profile: dict,
    location: dict,
    provider_name: str,
    timestamp: str,
) -> tuple:
    """Build evidence-based ideas using a 5-factor deterministic scoring model. Returns (results, filtered_out)."""
    results = []
    filtered_out = []

    # Idea templates driven by evidence rules (not hardcoded fake cards)
    ideas = [
        {
            "id": "idea-grocery",
            "name": "Grocery / Kirana Store",
            "category": "Retail and Kirana",
            "workType": "retail",
            "skillLevel": "None",
            "minCapital": 25000,
            "maxCapital": 150000,
            "avgRevenue": 30000,
            "avgOperatingCost": 22000,
            "comp_key": "grocery",
            "anchor": counts["markets"] + counts["schools"] + counts["industrial"],
            "rule": "Dense residential + market anchors support daily-needs retail.",
            "prefer_when": lambda c: c["markets"] + c["schools"] >= 2,
        },
        {
            "id": "idea-dairy",
            "name": "Dairy & Milk Products",
            "category": "Dairy and Animal Husbandry",
            "workType": "agriculture-linked",
            "skillLevel": "Beginner",
            "minCapital": 30000,
            "maxCapital": 200000,
            "avgRevenue": 35000,
            "avgOperatingCost": 20000,
            "comp_key": "dairy",
            "anchor": counts["markets"] + counts["agriculture"],
            "rule": "Dairy recommended only when competition is not already dense.",
            "prefer_when": lambda c: c["dairy"] < 8 and (c["markets"] > 0 or c["agriculture"] > 0),
        },
        {
            "id": "idea-food",
            "name": "Food / Tiffin Service",
            "category": "Food & Beverage",
            "workType": "service",
            "skillLevel": "Beginner",
            "minCapital": 15000,
            "maxCapital": 50000,
            "avgRevenue": 25000,
            "avgOperatingCost": 12000,
            "comp_key": "food",
            "anchor": counts["hospitals"] + counts["markets"] + counts["schools"] + counts["industrial"],
            "rule": "Offices, schools, hospitals and markets create meal demand.",
            "prefer_when": lambda c: (c["hospitals"] + c["markets"] + c["schools"] + c["industrial"]) >= 2,
        },
        {
            "id": "idea-tailoring",
            "name": "Tailoring / Garment Unit",
            "category": "Tailoring, Garment, and Textile Work",
            "workType": "service",
            "skillLevel": "Experienced",
            "minCapital": 10000,
            "maxCapital": 80000,
            "avgRevenue": 25000,
            "avgOperatingCost": 10000,
            "comp_key": "tailoring",
            "anchor": counts["markets"] + counts["schools"],
            "rule": "Local garment demand near markets and residential clusters.",
            "prefer_when": lambda c: True,
        },
        {
            "id": "idea-printing",
            "name": "Printing & Stationery",
            "category": "Retail",
            "workType": "retail",
            "skillLevel": "Beginner",
            "minCapital": 15000,
            "maxCapital": 70000,
            "avgRevenue": 20000,
            "avgOperatingCost": 8000,
            "comp_key": "printing",
            "anchor": counts["schools"],
            "rule": "Schools + limited print shops → stationery/xerox opportunity.",
            "prefer_when": lambda c: c["schools"] >= 1 and c["printing"] <= 3,
        },
        {
            "id": "idea-repair",
            "name": "Mobile / Electronics Repair",
            "category": "Electronics and Repair",
            "workType": "service",
            "skillLevel": "Experienced",
            "minCapital": 20000,
            "maxCapital": 100000,
            "avgRevenue": 40000,
            "avgOperatingCost": 15000,
            "comp_key": "repair",
            "anchor": counts["markets"] + counts["schools"] + counts["hospitals"],
            "rule": "Service anchors support repair demand.",
            "prefer_when": lambda c: (c["markets"] + c["schools"] + c["hospitals"]) >= 2,
        },
        {
            "id": "idea-agri",
            "name": "Agricultural Inputs / Supplier",
            "category": "Agriculture Linked",
            "workType": "agriculture-linked",
            "skillLevel": "Beginner",
            "minCapital": 40000,
            "maxCapital": 250000,
            "avgRevenue": 45000,
            "avgOperatingCost": 30000,
            "comp_key": "agriculture",
            "anchor": counts["agriculture"] + counts["markets"] + counts["industrial"],
            "rule": "Agricultural activity near markets supports agri-input retail.",
            "prefer_when": lambda c: c["agriculture"] > 0 or c["industrial"] > 0 or c["markets"] > 0,
        },
        {
            "id": "idea-rental",
            "name": "Equipment Rental",
            "category": "Services",
            "workType": "service",
            "skillLevel": "Beginner",
            "minCapital": 50000,
            "maxCapital": 300000,
            "avgRevenue": 40000,
            "avgOperatingCost": 18000,
            "comp_key": "rental",
            "anchor": counts["agriculture"] + counts["industrial"] + counts["markets"],
            "rule": "Agri/industrial activity + low rental listings → equipment rental gap.",
            "prefer_when": lambda c: (c["agriculture"] + c["industrial"]) >= 1 and c["rental"] <= 2,
        },
        {
            "id": "idea-beauty",
            "name": "Beauty / Wellness Salon",
            "category": "Beauty and Wellness",
            "workType": "service",
            "skillLevel": "Beginner",
            "minCapital": 20000,
            "maxCapital": 120000,
            "avgRevenue": 30000,
            "avgOperatingCost": 14000,
            "comp_key": "beauty",
            "anchor": counts["markets"] + counts["schools"],
            "rule": "Residential + market clusters support local beauty services.",
            "prefer_when": lambda c: c["markets"] + c["schools"] >= 1,
        },
        {
            "id": "idea-digital",
            "name": "Digital / Documentation Centre (CSC-style)",
            "category": "Digital Services",
            "workType": "service",
            "skillLevel": "Beginner",
            "minCapital": 25000,
            "maxCapital": 100000,
            "avgRevenue": 28000,
            "avgOperatingCost": 12000,
            "comp_key": "digital",
            "anchor": counts["markets"] + counts["schools"] + counts["hospitals"] + counts["industrial"],
            "rule": "Service anchors create demand for documentation & digital access.",
            "prefer_when": lambda c: (c["markets"] + c["schools"] + c["hospitals"]) >= 2 and c["digital"] <= 3,
        },
        {
            "id": "idea-transport",
            "name": "Local Transport / Logistics",
            "category": "Transport and Logistics",
            "workType": "service",
            "skillLevel": "Beginner",
            "minCapital": 50000,
            "maxCapital": 400000,
            "avgRevenue": 50000,
            "avgOperatingCost": 28000,
            "comp_key": "transport",
            "anchor": counts["markets"] + counts["industrial"],
            "rule": "Market and industrial anchors create last-mile logistics demand.",
            "prefer_when": lambda c: c["markets"] + c["industrial"] >= 1,
        },
        {
            "id": "idea-handicrafts",
            "name": "Handicrafts / Artisan Products",
            "category": "Handicrafts",
            "workType": "manufacturing",
            "skillLevel": "Experienced",
            "minCapital": 10000,
            "maxCapital": 80000,
            "avgRevenue": 22000,
            "avgOperatingCost": 9000,
            "comp_key": "handicrafts",
            "anchor": counts["markets"] + counts["handicrafts"],
            "rule": "Local craft activity near markets supports artisan enterprise.",
            "prefer_when": lambda c: profile.get("isArtisan") or c["handicrafts"] > 0 or c["markets"] > 0,
        },
    ]

    confidence = "high" if counts["total"] > 25 else ("medium" if counts["total"] > 8 else "low")

    for idea in ideas:
        if not idea["prefer_when"](counts):
            if counts["total"] == 0:
                continue

        comp_count = counts.get(idea["comp_key"], 0)
        density = _density_label(comp_count, radius_km)
        schemes = _match_schemes_for_idea(idea, profile, budget, location)
        within_budget = budget <= 0 or budget >= idea["minCapital"]

        # Factor 1: Local Demand (0-30)
        demand_points = min(30, max(5, idea["anchor"] * 4))
        if idea["id"] == "idea-printing" and counts["schools"] >= 1: demand_points += 5
        if idea["id"] == "idea-rental" and (counts["agriculture"] + counts["industrial"]) >= 1: demand_points += 5
        demand_points = min(30, demand_points)

        # Factor 2: Competition density (0-25)
        if density == "high": comp_points = 5
        elif density == "medium": comp_points = 15
        else: comp_points = 25

        # Factor 3: Financial viability (0-25)
        fin_points = 25 if within_budget else 10
        margin = max(0, idea["avgRevenue"] - idea["avgOperatingCost"])
        if margin > 15000: fin_points = min(25, fin_points + 5)
        
        # Factor 4: User profile fit (0-20).  This stays at the previous 10
        # points when optional profile information is not provided.
        profile_points, profile_factors = _profile_fit(idea, profile)

        # Factor 5: Verified scheme fit (0-10)
        scheme_points = 10 if len(schemes) > 0 else 0

        total_score = int(demand_points + comp_points + fin_points + profile_points + scheme_points)
        # Cap at 95 unless it's a completely perfect match across the board, which is rare.
        total_score = min(98, total_score)

        item = {
            "id": idea["id"],
            "name": idea["name"],
            "category": idea["category"],
            "workType": idea["workType"],
            "skillLevel": idea["skillLevel"],
            "minCapital": idea["minCapital"],
            "maxCapital": idea["maxCapital"],
            "avgRevenue": idea["avgRevenue"],
            "avgOperatingCost": idea["avgOperatingCost"],
            "ownSpaceRequired": False,
            "isHomeBased": idea["workType"] in ("service", "manufacturing"),
            "isWomenFriendly": True,
            "competitorDensity": density,
            "competitorCount": comp_count,
            "demandProxyScore": total_score,
            "scoreBreakdown": {
                "demand": demand_points,
                "competition": comp_points,
                "finance": fin_points,
                "profile": profile_points,
                "schemes": scheme_points,
                "profileFactors": profile_factors,
            },
            "schemeSupported": len(schemes) > 0,
            "matchedSchemes": schemes,
            "radiusKm": radius_km,
            "signals": (
                f"{idea['rule']} Nearby: {comp_count} similar listings; "
                f"demand anchors — schools {counts['schools']}, markets {counts['markets']}, "
                f"hospitals {counts['hospitals']}, industrial/commercial {counts['industrial']} "
                f"(radius {radius_km} km)."
            ),
            "nearbySignals": {
                "competitorCount": comp_count,
                "schools": counts["schools"],
                "markets": counts["markets"],
                "hospitals": counts["hospitals"],
                "industrial": counts["industrial"],
                "categoryCount": counts.get(idea["comp_key"], 0),
            },
            "provenance": {
                "source": provider_name,
                "retrievedAt": timestamp,
                "dataType": "Live local map signals",
                "confidence": confidence,
            },
            "withinBudget": within_budget,
        }

        if apply_budget and not within_budget:
            filtered_out.append({
                "id": idea["id"],
                "name": idea["name"],
                "reason": f"Requires ₹{idea['minCapital']:,}–₹{idea['maxCapital']:,}; your budget is ₹{int(budget):,}.",
            })
            continue

        results.append(item)

    # Sort: prefer higher total score
    results.sort(key=lambda r: -r["demandProxyScore"])
    return results, filtered_out


@router.post("/discover")
async def discover_businesses(req: DiscoverRequest):
    timestamp = datetime.datetime.now().isoformat()
    request_started = time.perf_counter()
    lat, lon, coord_source = await _resolve_coords(req.location or {})
    radius_km = _parse_radius_km(req)
    radius_m = radius_km * 1000
    budget = _budget(req)
    profile = req.profile or {}
    if req.skillLevel:
        profile.setdefault("skillLevel", req.skillLevel)
    if req.workType:
        profile.setdefault("workPreference", req.workType)
    if req.isArtisan:
        profile["isArtisan"] = True
    if req.isWomenEnterprise:
        profile["isWomenEnterprise"] = True

    filters = req.filters or {}
    # withinBudget: default True when budget > 0 unless explicitly false
    within_budget_flag = filters.get("withinBudget")
    if within_budget_flag is None:
        within_budget_flag = budget > 0
    apply_budget = bool(within_budget_flag) and budget > 0

    category_filter = (filters.get("category") or req.workType or profile.get("workPreference") or "").strip().lower()
    scheme_only = bool(filters.get("schemeSupported"))

    # OpenStreetMap Overpass is the only runtime provider. Caching happens
    # before the public request, and duplicate requests share one fetch.
    provider_payload, provider_cache = await get_osm_signals(lat, lon, radius_m)
    request_latency_ms = round((time.perf_counter() - request_started) * 1000)

    if not provider_payload.get("ok") or (
        provider_payload.get("reason") in ("provider_error", "provider_unavailable")
        and not provider_payload.get("elements")
    ):
        return {
            "status": "provider_unavailable",
            "results": [],
            "filteredOut": [],
            "meta": {
                "provider": provider_payload.get("provider", "none"),
                "providerStatus": "unavailable",
                "radiusKm": radius_km,
                "retrievedAt": timestamp,
                "latitude": lat,
                "longitude": lon,
                "coordSource": coord_source,
                "elementCount": 0,
                "safeMessage": "Live local-business data is unavailable for this area right now.",
                "jobsConnected": False,
                "cacheStatus": provider_cache["cacheStatus"],
                "cacheAgeSeconds": provider_cache["cacheAgeSeconds"],
                "providerLatencyMs": provider_cache["providerLatencyMs"],
                "requestLatencyMs": request_latency_ms,
            },
        }

    elements = provider_payload.get("elements") or []
    # empty_area with zero elements → still honest provider-unavailable-ish for that radius
    if len(elements) == 0:
        return {
            "status": "provider_unavailable",
            "results": [],
            "filteredOut": [],
            "meta": {
                "provider": provider_payload.get("provider"),
                "providerStatus": "empty",
                "radiusKm": radius_km,
                "retrievedAt": timestamp,
                "latitude": lat,
                "longitude": lon,
                "coordSource": coord_source,
                "elementCount": 0,
                "safeMessage": "Live local-business data is unavailable for this area right now.",
                "jobsConnected": False,
                "suggestions": ["Increase radius to 10 km or 20 km", "Edit location", "Add manual local observations"],
                "cacheStatus": provider_cache["cacheStatus"],
                "cacheAgeSeconds": provider_cache["cacheAgeSeconds"],
                "providerLatencyMs": provider_cache["providerLatencyMs"],
                "requestLatencyMs": request_latency_ms,
            },
        }

    counts = analyze_elements(elements)
    results, filtered_out = build_opportunities(
        counts, radius_km, budget, apply_budget, profile, req.location or {},
        provider_payload.get("provider", "OpenStreetMap"), timestamp,
    )

    # Category / workType filter
    if category_filter:
        before = results[:]
        results = [
            r for r in results
            if category_filter in (r.get("category") or "").lower()
            or category_filter in (r.get("name") or "").lower()
            or category_filter == (r.get("workType") or "").lower()
            or (category_filter == "agriculture-linked" and r.get("workType") == "agriculture-linked")
            or (category_filter == "manufacturing" and r.get("workType") == "manufacturing")
        ]
        for r in before:
            if r not in results:
                filtered_out.append({
                    "id": r["id"],
                    "name": r["name"],
                    "reason": f"Does not match category filter “{category_filter}”.",
                })

    if scheme_only:
        before = results[:]
        results = [r for r in results if r.get("schemeSupported")]
        for r in before:
            if r not in results:
                filtered_out.append({
                    "id": r["id"],
                    "name": r["name"],
                    "reason": "No verified official scheme match for this idea under current profile.",
                })

    status = "ok" if results else "no_suitable"
    return {
        "status": status,
        "results": results,
        "filteredOut": filtered_out,
        "counts": counts,
        "meta": {
            "provider": provider_payload.get("provider"),
            "providerStatus": "stale" if provider_cache["stale"] else "connected",
            "radiusKm": radius_km,
            "retrievedAt": timestamp,
            "latitude": lat,
            "longitude": lon,
            "coordSource": coord_source,
            "elementCount": len(elements),
            "budget": budget,
            "filtersApplied": {
                "withinBudget": apply_budget,
                "category": category_filter or None,
                "schemeSupported": scheme_only,
            },
            "jobsConnected": False,
            "fallbackNote": provider_payload.get("fallbackNote"),
            "safeMessage": provider_payload.get("fallbackNote"),
            "cacheStatus": provider_cache["cacheStatus"],
            "cacheAgeSeconds": provider_cache["cacheAgeSeconds"],
            "providerLatencyMs": provider_cache["providerLatencyMs"],
            "requestLatencyMs": request_latency_ms,
        },
    }


COMPARISON_WEIGHTS = {
    "demand": 18,
    "competition": 15,
    "capitalGap": 13,
    "monthlySurplus": 18,
    "emiBurden": 14,
    "skills": 10,
    "schemeFit": 7,
    "confidence": 5,
}


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _confidence_score(confidence: str) -> int:
    return {"high": 5, "medium": 3, "low": 1}.get(confidence.lower(), 1)


def _comparison_profile_score(business: Dict[str, Any], profile: Dict[str, Any]) -> int:
    score_breakdown = business.get("scoreBreakdown") or {}
    existing = score_breakdown.get("profile")
    if existing is not None:
        return int(round(max(0, min(20, _number(existing))) / 20 * COMPARISON_WEIGHTS["skills"]))

    user_skill = str(profile.get("skillLevel") or "").strip().lower()
    required_skill = str(business.get("skillLevel") or "").strip().lower()
    if not user_skill or required_skill in ("", "none", "beginner"):
        return 7
    if user_skill == required_skill:
        return COMPARISON_WEIGHTS["skills"]
    if user_skill == "experienced":
        return 9
    return 3


def _comparison_scheme_score(business: Dict[str, Any]) -> int:
    matches = business.get("matchedSchemes") or []
    if not matches and not business.get("schemeSupported"):
        return 0
    best_fit = max((_number(match.get("profileFitScore")) for match in matches), default=0)
    if best_fit > 0:
        return int(round(min(20, best_fit) / 20 * COMPARISON_WEIGHTS["schemeFit"]))
    return 4


def _comparison_reasons(row: Dict[str, Any]) -> List[str]:
    metrics = row["metrics"]
    reasons = []
    if row["scoreBreakdown"]["demand"]["score"] >= 13:
        reasons.append("Strong local demand anchors support this category.")
    if row["competitorDensity"] == "low":
        reasons.append("Local competition is low for this category.")
    elif row["competitorDensity"] == "high":
        reasons.append("High nearby competition requires a clear differentiator.")

    if metrics["capitalGap"] <= 0:
        reasons.append("Your stated margin capital covers the estimated starting capital.")
    else:
        reasons.append(f"An estimated ₹{metrics['capitalGap']:,.0f} capital gap needs funding or a smaller starting scale.")

    if metrics["monthlySurplus"] > 0:
        reasons.append(f"Estimated monthly surplus after operating and household costs is ₹{metrics['monthlySurplus']:,.0f}.")
    else:
        reasons.append("Estimated revenue does not cover operating and stated household costs yet.")

    if metrics["emiBurdenPercent"] > 60:
        reasons.append("The estimated EMI would take more than 60% of projected monthly surplus.")
    elif metrics["estimatedEmi"] > 0:
        reasons.append(f"Estimated EMI uses {metrics['emiBurdenPercent']:.0f}% of projected monthly surplus.")

    if row["scoreBreakdown"]["skills"]["score"] >= 8:
        reasons.append("The opportunity fits the skills and operating preferences in your advisory profile.")
    if row["scoreBreakdown"]["schemeFit"]["score"] > 0:
        reasons.append("At least one verified scheme is relevant to this opportunity.")
    if row["confidence"] == "low":
        reasons.append("Local map signals are incomplete, so validate demand on the ground before investing.")
    return reasons[:6]


@router.post("/compare")
async def compare_businesses(req: CompareRequest):
    if not req.businesses:
        raise HTTPException(status_code=400, detail="Choose at least one business for a viability check")

    profile = req.profile or {}
    budget = max(0, _number(req.budget))
    household_expenses = max(0, _number(profile.get("householdExpenses")))
    comparisons = []
    missing_data = []

    for business in req.businesses:
        density = str(business.get("competitorDensity") or "medium").lower()
        if density not in ("low", "medium", "high"):
            density = "medium"
        confidence = str((business.get("provenance") or {}).get("confidence") or "low").lower()
        if confidence not in ("high", "medium", "low"):
            confidence = "low"
        has_signals = bool(
            business.get("signals")
            or business.get("nearbySignals")
            or business.get("competitorCount") is not None
        )
        if not has_signals:
            missing_data.append(f"{business.get('name') or business.get('id') or 'unknown'}: incomplete local signals")

        score_breakdown = business.get("scoreBreakdown") or {}
        demand_raw = _number(score_breakdown.get("demand"))
        if demand_raw <= 0:
            demand_raw = min(30, _number(business.get("demandProxyScore")) * 0.3)
        demand_score = int(round(max(0, min(30, demand_raw)) / 30 * COMPARISON_WEIGHTS["demand"]))
        competition_score = {"low": 15, "medium": 8, "high": 2}[density]

        min_capital = max(0, _number(business.get("minCapital")))
        max_capital = max(min_capital, _number(business.get("maxCapital")))
        project_cost = min_capital or max_capital
        canonical_finance = finance_engine.build_business_financial_plan(
            project_cost=project_cost,
            applicant_margin=budget,
            monthly_revenue=max(0, _number(business.get("avgRevenue"))),
            monthly_operating_cost=max(0, _number(business.get("avgOperatingCost"))),
            household_expenses=household_expenses,
            scheme_matches=business.get("matchedSchemes") or [],
        )
        finance_metrics = canonical_finance.get("financials") or {}
        capital_gap = _number(finance_metrics.get("requiredCredit"))
        capital_score = int(round(max(0, 1 - (capital_gap / max(project_cost, 1))) * COMPARISON_WEIGHTS["capitalGap"]))

        monthly_surplus = _number(finance_metrics.get("monthlySurplus"))
        surplus_score = int(round(min(1, max(0, monthly_surplus) / 25_000) * COMPARISON_WEIGHTS["monthlySurplus"]))
        estimated_emi = _number(finance_metrics.get("monthlyEmi"))
        emi_burden = _number(finance_metrics.get("emiToSurplusRatio"))
        if estimated_emi <= 0:
            emi_score = COMPARISON_WEIGHTS["emiBurden"]
        elif emi_burden <= 25:
            emi_score = COMPARISON_WEIGHTS["emiBurden"]
        elif emi_burden <= 40:
            emi_score = 10
        elif emi_burden <= 60:
            emi_score = 5
        else:
            emi_score = 0

        skills_score = _comparison_profile_score(business, profile)
        scheme_score = _comparison_scheme_score(business)
        confidence_score = _confidence_score(confidence)
        weighted_score = sum((
            demand_score,
            competition_score,
            capital_score,
            surplus_score,
            emi_score,
            skills_score,
            scheme_score,
            confidence_score,
        ))
        if not has_signals:
            weighted_score = min(weighted_score, 55)

        if weighted_score >= 70 and emi_burden <= 40:
            viability, risk = "Strong", "Low"
        elif weighted_score >= 50 and emi_burden <= 60:
            viability, risk = "Promising", "Medium"
        elif weighted_score >= 35:
            viability, risk = "Cautious", "High"
        else:
            viability, risk = "High risk", "High"

        row = {
            "id": business.get("id"),
            "name": business.get("name") or "Business opportunity",
            "score": int(weighted_score),
            "weightedScore": int(weighted_score),
            "viability": viability,
            "riskLevel": risk,
            "financialShortfall": round(capital_gap),
            "monthlySurplusEstimate": round(monthly_surplus),
            "competitorDensity": density,
            "competitorCount": business.get("competitorCount"),
            "schemeSupported": bool(business.get("schemeSupported")),
            "matchedSchemes": business.get("matchedSchemes") or [],
            "confidence": confidence,
            "provenance": business.get("provenance"),
            "metrics": {
                "projectCost": round(project_cost),
                "capitalGap": round(capital_gap),
                "monthlySurplus": round(monthly_surplus),
                "estimatedEmi": round(estimated_emi),
                "emiBurdenPercent": round(emi_burden, 1),
                "householdExpenses": round(household_expenses),
                "annualInterestRate": finance_metrics.get("annualInterestRate"),
                "tenureMonths": finance_metrics.get("tenureMonths"),
                "termSource": (canonical_finance.get("terms") or {}).get("termSource"),
                "demandAnchors": business.get("nearbySignals") or {},
            },
            "scoreBreakdown": {
                "demand": {"label": "Demand", "score": demand_score, "max": COMPARISON_WEIGHTS["demand"]},
                "competition": {"label": "Competition", "score": competition_score, "max": COMPARISON_WEIGHTS["competition"]},
                "capitalGap": {"label": "Capital gap", "score": capital_score, "max": COMPARISON_WEIGHTS["capitalGap"]},
                "monthlySurplus": {"label": "Monthly surplus", "score": surplus_score, "max": COMPARISON_WEIGHTS["monthlySurplus"]},
                "emiBurden": {"label": "EMI burden", "score": emi_score, "max": COMPARISON_WEIGHTS["emiBurden"]},
                "skills": {"label": "Skills & profile fit", "score": skills_score, "max": COMPARISON_WEIGHTS["skills"]},
                "schemeFit": {"label": "Scheme fit", "score": scheme_score, "max": COMPARISON_WEIGHTS["schemeFit"]},
                "confidence": {"label": "Signal confidence", "score": confidence_score, "max": COMPARISON_WEIGHTS["confidence"]},
            },
        }
        row["recommendationReasons"] = _comparison_reasons(row)
        row["recommendedAction"] = (
            "Validate local demand and reduce the capital gap before proceeding."
            if risk == "High"
            else "Proceed to the detailed feasibility report and validate costs with local suppliers."
        )
        comparisons.append(row)

    comparisons.sort(key=lambda item: item["weightedScore"], reverse=True)
    top = comparisons[0]
    low_confidence = any(item.get("confidence") == "low" for item in comparisons) or bool(missing_data)
    is_viability_check = len(comparisons) == 1
    summary = (
        f"Viability check: {top['name']} scores {top['weightedScore']}/100 and is a {top['viability'].lower()} option. "
        f"The result combines local demand, competition, finances, profile fit, verified scheme fit, and data confidence."
        if is_viability_check
        else f"{top['name']} ranks first at {top['weightedScore']}/100. Its strongest factors are shown alongside the other selected opportunities; use the reasons below before choosing."
    )

    return {
        "comparisonList": comparisons,
        "topRecommendation": top["id"] if top["weightedScore"] >= 35 else None,
        "recommendation": {
            "businessId": top["id"],
            "name": top["name"],
            "headline": ("Viability check" if is_viability_check else "Recommended option") + f": {top['name']}",
            "reasons": top["recommendationReasons"],
        },
        "isViabilityCheck": is_viability_check,
        "lowConfidence": low_confidence,
        "missingData": list(dict.fromkeys(missing_data)),
        "summary": summary,
        "scoreWeights": COMPARISON_WEIGHTS,
        "assumptions": {
            "capitalBasis": "Minimum stated startup capital minus your stated margin capital.",
            "monthlySurplus": "Estimated revenue minus operating cost and stated household expenses.",
            "emi": f"Reducing-balance EMI. Published applicable scheme terms are used when available; otherwise the planning baseline is {finance_engine.DEFAULT_ANNUAL_INTEREST_RATE:.0f}% for {finance_engine.DEFAULT_TENURE_MONTHS} months. It is not a loan offer.",
        },
        "retrievedAt": datetime.datetime.now().isoformat(),
    }
