"""Location-aware, deterministic feasibility reports."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any, List
import asyncio
import datetime
import hashlib
import json
import math
import uuid

import api_location
import api_schemes
import api_ai
import api_finance

router = APIRouter()


class FeasibilityRequest(BaseModel):
    location: dict
    business: dict
    userProfile: dict
    budget: float
    selectedScenario: str = "expected"


_cache: Dict[str, Dict[str, Any]] = {}


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def get_cache_key(req: FeasibilityRequest) -> str:
    profile_fields = {
        key: req.userProfile.get(key)
        for key in (
            "marginCapital", "skillLevel", "workType", "businessSpace", "timeAvailability",
            "householdExpenses", "isExistingEnterprise", "isArtisan", "isSHGMember",
        )
    }
    identity = {
        "location": {key: req.location.get(key) for key in ("state", "district", "cityOrVillage", "village")},
        "business": {key: req.business.get(key) for key in ("id", "name", "category", "minCapital", "avgRevenue", "avgOperatingCost")},
        "profile": profile_fields,
    }
    return hashlib.sha256(json.dumps(identity, sort_keys=True, default=str).encode()).hexdigest()


def _customer_segments(business: dict, district: str) -> List[str]:
    work_type = str(business.get("workType") or "").lower()
    category = str(business.get("category") or business.get("name") or "this business").lower()
    common = [f"Households in and around {district}", "Walk-in customers near local market and transport anchors"]
    if work_type == "agriculture-linked" or any(word in category for word in ("dairy", "agri", "poultry", "fertilizer", "rental")):
        return [f"Small and marginal farmers around {district}", "Farmer groups and agricultural-input buyers", "Local traders and collection points"]
    if work_type == "manufacturing" or any(word in category for word in ("tailor", "garment", "handicraft", "processing")):
        return ["Local households seeking made-to-order products", "Retailers and resellers in nearby market clusters", "Seasonal/event customers"]
    if work_type == "service":
        return [f"Households and small businesses in {district}", "Students, commuters, and customers near service anchors", "Repeat customers needing repairs or recurring service"]
    return common + ["Small shops and micro-enterprises requiring regular supply"]


def _market_analysis(business: dict, location: dict, finance_plan: dict, scheme_matches: List[dict]) -> dict:
    financials = finance_plan.get("financials") or {}
    signals = business.get("nearbySignals") or {}
    demand_points = _number((business.get("scoreBreakdown") or {}).get("demand"))
    demand_score = round((demand_points / 30 * 100) if demand_points else min(100, _number(business.get("demandProxyScore"))))
    district = location.get("district") or "your selected area"
    competition = str(business.get("competitorDensity") or "medium").lower()
    monthly_surplus = _number(financials.get("monthlySurplus"))
    project_cost = _number(financials.get("projectCost"))
    monthly_break_even_revenue = (
        _number(financials.get("monthlyOperatingCost"))
        + _number(financials.get("householdExpenses"))
        + _number(financials.get("monthlyEmi"))
    )
    recovery_months = math.ceil(project_cost / monthly_surplus) if monthly_surplus > 0 else None

    risks = []
    if competition == "high":
        risks.append({"risk": "High local competition may pressure prices.", "mitigation": "Start with a narrow customer segment, service differentiation, and a small pilot before committing full capital."})
    elif competition == "low":
        risks.append({"risk": "Low map competition can also mean demand is unverified.", "mitigation": "Interview potential customers and collect at least three local price quotations before launch."})
    else:
        risks.append({"risk": "Moderate competition requires reliable pricing and repeat customers.", "mitigation": "Track competitor prices and offer a clear service or convenience advantage."})
    if _number(financials.get("emiToSurplusRatio")) > 50:
        risks.append({"risk": "EMI takes a high share of projected surplus.", "mitigation": "Increase own margin, reduce the first-stage setup, or secure supplier credit before applying."})
    if monthly_surplus <= 0:
        risks.append({"risk": "Projected surplus is not positive after household costs.", "mitigation": "Rework expected pricing, recurring costs, and household cash buffer before borrowing."})
    if str(business.get("skillLevel") or "").lower() == "experienced" and str(location.get("skillLevel") or "").lower() in ("none", "beginner"):
        risks.append({"risk": "The business may require more experience than stated in the profile.", "mitigation": "Plan training, mentoring, or a limited service menu during the first months."})

    next_steps = [
        "Validate prices, supplier quotations, and at least ten prospective customers locally.",
        "Start with the minimum-capital setup reflected in this plan; do not treat the estimate as a bank sanction.",
        "Keep a written monthly cash-flow record that separates business costs from household expenses.",
    ]
    if scheme_matches:
        next_steps.append("Review the matched scheme's official portal and documents, then confirm final terms with the lender or CSC.")
    else:
        next_steps.append("Discuss lender-specific rate and tenure with a bank branch before committing to credit.")

    anchors = [
        f"{key.replace('_', ' ').title()}: {value}"
        for key, value in signals.items()
        if isinstance(value, (int, float)) and key not in ("competitorCount", "categoryCount")
    ]
    return {
        "demand": {
            "score": demand_score,
            "summary": business.get("signals") or "Demand estimate is based on available local map anchors and category signals.",
            "localSignals": anchors,
            "competition": competition,
            "competitorCount": business.get("competitorCount"),
        },
        "customerSegments": _customer_segments(business, district),
        "costStructure": {
            "startupProjectCost": round(project_cost),
            "monthlyOperatingCost": round(_number(financials.get("monthlyOperatingCost"))),
            "householdExpenses": round(_number(financials.get("householdExpenses"))),
            "estimatedEmi": round(_number(financials.get("monthlyEmi"))),
        },
        "breakEven": {
            "monthlyRevenueNeeded": round(monthly_break_even_revenue),
            "estimatedCapitalRecoveryMonths": recovery_months,
            "note": "Revenue needed covers operating costs, stated household expenses, and estimated EMI. Capital recovery is a simple project-cost / monthly-surplus estimate.",
        },
        "risksAndMitigations": risks,
        "schemes": [{"name": item.get("name"), "officialUrl": item.get("officialUrl"), "whyRelevant": item.get("whyRelevant")} for item in scheme_matches],
        "nextSteps": next_steps,
    }


@router.post("/report")
async def generate_feasibility_report(req: FeasibilityRequest):
    cache_key = get_cache_key(req)
    now = datetime.datetime.now()
    cached = _cache.get(cache_key)
    if cached and now < cached["expires_at"]:
        return cached["data"]

    async def fetch_location():
        try:
            return await asyncio.wait_for(
                api_location.get_location_profile(
                    district=req.location.get("district"),
                    state=req.location.get("state"),
                    cityOrVillage=req.location.get("cityOrVillage") or req.location.get("village"),
                ),
                timeout=8.0,
            )
        except Exception as error:
            print(f"Feasibility location error: {type(error).__name__}")
            return None

    async def fetch_schemes():
        try:
            project_cost = req.business.get("minCapital") or req.business.get("maxCapital") or 0
            scheme_profile = {**(req.userProfile or {}), "projectCost": project_cost}
            scheme_req = api_schemes.SchemeMatchRequest(
                businessCategory=req.business.get("category", ""),
                userProfile=scheme_profile,
                location=req.location,
            )
            return await asyncio.wait_for(api_schemes.match_schemes(scheme_req), timeout=4.0)
        except asyncio.TimeoutError:
            return {"status": "unavailable", "matches": [], "message": "Scheme matching provider timed out.", "sources": [], "retrievedAt": now.isoformat(), "providerStatus": "unavailable"}
        except Exception as error:
            print(f"Feasibility scheme error: {type(error).__name__}")
            return {"status": "error", "matches": [], "message": "Scheme matching provider failed.", "sources": [], "retrievedAt": now.isoformat(), "providerStatus": "unavailable"}

    async def fetch_advisory(finance_data):
        try:
            raw_signals = req.business.get("nearbySignals")
            demand_anchors = (
                [{"name": str(key), "value": value} for key, value in raw_signals.items()]
                if isinstance(raw_signals, dict)
                else raw_signals if isinstance(raw_signals, list) else []
            )
            advisory_req = api_ai.AdvisoryRequest(
                business=req.business,
                location=req.location,
                finance=finance_data or {},
                competition={
                    "density": req.business.get("competitorDensity"),
                    "count": req.business.get("competitorCount"),
                },
                demandAnchors=demand_anchors,
                schemes=scheme_result.get("matches") or [],
            )
            # The old eight-second cap routinely cancelled a healthy Gemini
            # response. Each provider has its own bounded request timeout; this
            # outer budget permits a configured fallback to run as well.
            return await asyncio.wait_for(api_ai.generate_advisory(advisory_req), timeout=45.0)
        except asyncio.TimeoutError:
            return {"status": "unavailable", "advisory": {"whyRecommended": [], "risksAndMitigations": [], "opportunities": [], "dataGaps": [], "confidence": None}, "message": "AI advisory exceeded the response window. You can retry this report.", "citations": [], "generatedAt": now.isoformat()}
        except Exception as error:
            print(f"Feasibility advisory error: {type(error).__name__}")
            return {"status": "unavailable", "advisory": {"whyRecommended": [], "risksAndMitigations": [], "opportunities": [], "dataGaps": [], "confidence": None}, "message": "AI advisory unavailable.", "citations": [], "generatedAt": now.isoformat()}

    location_task = asyncio.create_task(fetch_location())
    scheme_result = await fetch_schemes()
    finance_request = api_finance.FinancialPlanRequest(
        business=req.business,
        userProfile=req.userProfile,
        location=req.location,
        schemeMatches=scheme_result.get("matches") or [],
    )
    finance_result = await api_finance.financial_plan(finance_request)
    advisory_task = asyncio.create_task(fetch_advisory(finance_result))
    location_result, advisory_result = await asyncio.gather(location_task, advisory_task, return_exceptions=True)
    if isinstance(location_result, Exception):
        location_result = None
    if isinstance(advisory_result, Exception):
        advisory_result = {"status": "unavailable", "advisory": {"whyRecommended": [], "risksAndMitigations": [], "opportunities": [], "dataGaps": [], "confidence": None}, "message": "AI advisory unavailable.", "citations": [], "generatedAt": now.isoformat()}

    location_payload = location_result or {}
    location_context = {
        "state": (location_payload.get("location") or {}).get("state") or req.location.get("state"),
        "district": (location_payload.get("location") or {}).get("district") or req.location.get("district"),
        "primarySectors": (location_payload.get("signals") or {}).get("primarySectors") or req.location.get("primarySectors") or [],
        "population": (location_payload.get("census") or {}).get("population") or (req.location.get("census") or {}).get("population"),
        "census": location_payload.get("census") or req.location.get("census"),
        "provenance": location_payload.get("provenance") or req.location.get("provenance"),
    }
    market = _market_analysis(req.business, {**location_context, **req.userProfile}, finance_result, scheme_result.get("matches") or [])
    complete = finance_result.get("status") == "ready" and scheme_result.get("status") in ("ready", "no_match")
    report = {
        "status": "complete" if complete else "partial",
        "reportId": str(uuid.uuid4()),
        "generatedAt": now.isoformat(),
        "summary": {
            "headline": f"{req.business.get('name') or 'Business'} feasibility for {location_context.get('district') or 'your selected area'}",
            "viabilityScore": req.business.get("demandProxyScore"),
            "readinessScore": (finance_result.get("financials") or {}).get("repaymentReadinessScore"),
        },
        "financials": finance_result,
        "locationContext": location_context,
        "marketAnalysis": market,
        "strategicAdvisory": advisory_result,
        "schemeMatching": scheme_result,
        "sources": [
            *([location_context.get("census")] if location_context.get("census") else []),
            *(scheme_result.get("sources") or []),
            *(advisory_result.get("citations") or []),
        ],
        "dataGaps": (advisory_result.get("advisory") or {}).get("dataGaps") or [],
        "providerStatus": {
            "location": "ready" if location_result else "unavailable",
            "finance": finance_result.get("status"),
            "schemes": scheme_result.get("status"),
            "advisory": advisory_result.get("status"),
        },
    }
    # Do not preserve a transient AI failure for thirty minutes. Successful
    # reports remain cached, while an unavailable advisory can recover on Retry.
    if advisory_result.get("status") == "ready":
        _cache[cache_key] = {"data": report, "expires_at": now + datetime.timedelta(minutes=30)}
    return report
