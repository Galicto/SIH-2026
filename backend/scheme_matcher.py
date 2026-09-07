"""Fast local matching against the reviewed Arthniti scheme catalogue."""

from __future__ import annotations

import copy
import datetime as dt
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


CATALOG_PATH = Path(__file__).with_name("scheme_catalog.json")
_catalog_cache: List[Dict[str, Any]] | None = None


def _number(value: Any) -> float:
    try:
        return max(0.0, float(value or 0))
    except (TypeError, ValueError):
        return 0.0


def _text(value: Any) -> str:
    return str(value or "").strip()


def _normalise(value: Any) -> str:
    return " ".join(_text(value).casefold().replace("&", " and ").replace("/", " ").split())


def load_scheme_catalog() -> List[Dict[str, Any]]:
    """Load only complete, uniquely identified reviewed records."""
    global _catalog_cache
    if _catalog_cache is not None:
        return copy.deepcopy(_catalog_cache)
    try:
        payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        raw_records = payload.get("records", [])
    except (OSError, ValueError) as error:
        raise RuntimeError(f"Scheme catalogue could not be loaded: {type(error).__name__}") from error
    records: List[Dict[str, Any]] = []
    identifiers: set[str] = set()
    required_fields = ("schemeId", "name", "officialUrl", "agency", "provenance")
    for raw in raw_records:
        if not isinstance(raw, dict) or any(not raw.get(field) for field in required_fields):
            continue
        scheme_id = _text(raw["schemeId"])
        if scheme_id in identifiers:
            continue
        identifiers.add(scheme_id)
        records.append(copy.deepcopy(raw))
    _catalog_cache = records
    return copy.deepcopy(records)


def normalise_business_sectors(business_category: str = "", business_name: str = "", work_type: str = "") -> List[str]:
    """Translate Arthniti ideas into the compact sector vocabulary used by the catalogue."""
    text = " ".join((_normalise(business_category), _normalise(business_name), _normalise(work_type)))
    sectors: set[str] = set()
    mapping = {
        "grocery": ("retail", "food"), "kirana": ("retail", "food"), "dairy": ("agriculture-linked", "food"),
        "tailor": ("tailoring", "services", "artisan"), "garment": ("tailoring", "services", "artisan"), "textile": ("tailoring", "services", "artisan"),
        "repair": ("services",), "food": ("food", "services"), "tiffin": ("food", "services"), "restaurant": ("food", "services"),
        "handicraft": ("handicrafts", "artisan", "manufacturing"), "craft": ("handicrafts", "artisan", "manufacturing"),
        "printing": ("digital", "services"), "digital": ("digital", "services"), "transport": ("transport", "services"), "rental": ("rental", "services"),
        "beauty": ("beauty", "services"), "agri": ("agriculture-linked",), "retail": ("retail",), "manufactur": ("manufacturing",), "service": ("services",),
    }
    for token, mapped in mapping.items():
        if token in text:
            sectors.update(mapped)
    return sorted(sectors)


def _state_is_covered(scheme: Dict[str, Any], state: str) -> bool:
    coverage = [_normalise(item) for item in scheme.get("stateCoverage") or ["ALL"]]
    state_key = _normalise(state)
    return "all" in coverage or not state_key or state_key in coverage


def _profile_fit(profile: Dict[str, Any], business_category: str) -> Tuple[int, List[str]]:
    """Score declared context; it is relevance, never an eligibility decision."""
    score = 45
    notes: List[str] = []
    field_labels = (
        (("skillLevel",), "Skill level"), (("workPreference", "workType"), "Work preference"),
        (("spaceStatus", "businessSpace"), "Workspace"), (("availability", "timeAvailability"), "Availability"),
    )
    for keys, label in field_labels:
        value = next((_text(profile.get(key)) for key in keys if _text(profile.get(key))), "")
        if value:
            score += 3
            notes.append(f"{label} recorded: {value}.")
    household_expenses = _number(profile.get("householdExpenses"))
    margin_capital = _number(profile.get("marginCapital"))
    if household_expenses:
        if margin_capital >= household_expenses * 3:
            score += 3
            notes.append("Household-expense buffer supports the stated capital plan.")
        else:
            score -= 5
            notes.append("Household expenses should be included in the lender's repayment assessment.")
    if profile.get("isExistingEnterprise"):
        score += 4
        notes.append("Existing-business status is recorded for an expansion or working-capital discussion.")
    else:
        notes.append("Profile indicates a new-enterprise plan.")
    if profile.get("isArtisan"):
        score += 5
        notes.append("Artisan status is relevant to artisan-specific support.")
    if profile.get("isSHGMember"):
        score += 3
        notes.append("SHG membership is kept as group-enterprise context.")
    if _text(business_category):
        notes.append(f"Business category: {business_category}.")
    return max(0, min(100, score)), notes


def _eligibility_checks(scheme: Dict[str, Any], profile: Dict[str, Any], state: str, project_cost: float, sectors: Iterable[str]) -> Tuple[bool, List[Dict[str, str]], int]:
    checks: List[Dict[str, str]] = []
    bonus = 0
    state_ok = _state_is_covered(scheme, state)
    checks.append({"label": "State coverage", "status": "met" if state_ok else "not_met", "detail": state or "State not provided"})
    if not state_ok:
        return False, checks, bonus
    bonus += 12
    scheme_sectors = {_normalise(item) for item in scheme.get("businessCategories") or []}
    sector_hit = bool(scheme_sectors.intersection(sectors)) or not scheme_sectors
    checks.append({"label": "Business sector", "status": "met" if sector_hit else "not_met", "detail": ", ".join(sectors) if sectors else "Sector needs confirmation"})
    if not sector_hit:
        return False, checks, bonus
    bonus += 15
    max_cost = _number(scheme.get("maxProjectCost"))
    cost_ok = not max_cost or not project_cost or project_cost <= max_cost
    checks.append({"label": "Project cost", "status": "met" if cost_ok else "not_met", "detail": f"₹{project_cost:,.0f}" if project_cost else "Project cost not provided"})
    if not cost_ok:
        return False, checks, bonus
    bonus += 8
    rules = scheme.get("eligibilityRules") or {}
    artisan_required = rules.get("isArtisan")
    artisan_ok = artisan_required is not True or bool(profile.get("isArtisan"))
    if artisan_required is True:
        checks.append({"label": "Artisan status", "status": "met" if artisan_ok else "not_met", "detail": "Declared artisan status"})
    if not artisan_ok:
        return False, checks, bonus
    if artisan_required is True:
        bonus += 20
    minimum_age = rules.get("minimumAge")
    if minimum_age:
        age = _number(profile.get("age"))
        status = "needs_verification" if not age else ("met" if age >= minimum_age else "not_met")
        checks.append({"label": "Minimum age", "status": status, "detail": f"{int(minimum_age)} years"})
        if status == "not_met":
            return False, checks, bonus
    return True, checks, bonus


def _reason_for(scheme: Dict[str, Any], profile: Dict[str, Any]) -> str:
    if scheme.get("schemeId") == "pm_vishwakarma":
        return "Your declared artisan status and selected craft/service sector align with this artisan-focused scheme. Official trade and verification conditions still apply."
    if scheme.get("schemeId") == "pm_mudra":
        stage = "expansion or working-capital" if profile.get("isExistingEnterprise") else "new micro-enterprise"
        return f"The selected business fits the stated {stage} use case for standard PMMY categories, subject to lender assessment."
    return "The selected sector, state coverage, and declared profile conditions align with this scheme's published criteria. Final eligibility requires official verification."


def match_schemes(business_category: str = "", profile: Dict[str, Any] | None = None, location: Dict[str, Any] | None = None, business_name: str = "", work_type: str = "") -> List[Dict[str, Any]]:
    """Return fast local *may be eligible* recommendations from reviewed records."""
    profile = profile or {}
    location = location or {}
    state = _text(location.get("state") or profile.get("state"))
    project_cost = _number(profile.get("projectCost") or profile.get("budget"))
    sectors = normalise_business_sectors(business_category, business_name, work_type or profile.get("workType", ""))
    base_score, profile_context = _profile_fit(profile, business_category)
    now = dt.datetime.now(dt.timezone.utc).astimezone().isoformat()
    matches: List[Dict[str, Any]] = []
    for scheme in load_scheme_catalog():
        eligible, checks, bonus = _eligibility_checks(scheme, profile, state, project_cost, sectors)
        if not eligible:
            continue
        result = copy.deepcopy(scheme)
        result.update({"whyRelevant": _reason_for(scheme, profile), "profileFitScore": min(100, base_score + bonus), "profileContext": profile_context, "eligibilityChecks": checks, "eligibilityStatus": "may_be_eligible", "normalisedSectors": sectors, "verificationNote": "May be eligible based on the details provided. Verify eligibility, current terms, documents, and approval with the official portal, CSC, or participating lender."})
        provenance = dict(result.get("provenance") or {})
        provenance["retrievedAt"] = now
        result["provenance"] = provenance
        matches.append(result)
    return sorted(matches, key=lambda item: item.get("profileFitScore", 0), reverse=True)


def match_response(business_category: str, profile: Dict[str, Any], location: Dict[str, Any]) -> Dict[str, Any]:
    now = dt.datetime.now(dt.timezone.utc).astimezone().isoformat()
    matches = match_schemes(business_category, profile, location)
    sources = []
    seen_sources: set[str] = set()
    for match in matches:
        provenance = match.get("provenance") or {}
        source_url = _text(provenance.get("sourceUrl") or match.get("officialUrl"))
        if source_url in seen_sources:
            continue
        seen_sources.add(source_url)
        sources.append({"title": provenance.get("source") or match.get("agency"), "url": source_url, "sourceUpdatedAt": provenance.get("sourceUpdatedAt"), "verifiedAt": provenance.get("verifiedAt"), "retrievedAt": now, "claim": "Reviewed official scheme record used for a may-be-eligible recommendation."})
    return {"status": "ready" if matches else "no_match", "matches": matches, "message": "" if matches else "No reviewed scheme matches the selected state, business sector, project cost, and declared profile conditions.", "sources": sources, "retrievedAt": now, "providerStatus": "connected", "catalog": {"source": "Arthniti reviewed scheme catalogue", "mode": "local_cache"}}
