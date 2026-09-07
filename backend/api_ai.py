from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional, Literal, Tuple
import os
import json
import datetime
import asyncio
import requests

router = APIRouter()

import google.generativeai as genai

ModelSource = Literal["gemini", "openrouter", "ollama", "ollama_cloud"]
GEMINI_DEFAULT_MODEL = "models/gemini-2.5-flash"
OPENROUTER_DEFAULT_MODEL = "google/gemini-2.5-flash"
OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
OLLAMA_DEFAULT_MODEL = "llama3.2"
OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434"
OLLAMA_CLOUD_DEFAULT_MODEL = "gpt-oss:120b"
OLLAMA_CLOUD_BASE_URL = "https://ollama.com"
ADVISORY_PROVIDER_TIMEOUT_SECONDS = 20


def _gemini_model_name(value: str) -> str:
    """Convert an OpenRouter-style Gemini model name to the Gemini SDK format."""
    model_name = value.strip()
    if model_name.startswith("google/"):
        model_name = model_name.removeprefix("google/")
    if not model_name.startswith("models/"):
        model_name = f"models/{model_name}"
    return model_name


def _provider_config(source: ModelSource) -> Tuple[str, str]:
    """Read provider configuration at request time without exposing credentials."""
    if source == "openrouter":
        return (
            (os.getenv("OPENROUTER_API_KEY") or "").strip(),
            (os.getenv("OPENROUTER_MODEL") or OPENROUTER_DEFAULT_MODEL).strip(),
        )
    if source == "ollama":
        return (
            "",
            (os.getenv("OLLAMA_MODEL") or OLLAMA_DEFAULT_MODEL).strip(),
        )
    if source == "ollama_cloud":
        return (
            (os.getenv("OLLAMA_API_KEY") or "").strip(),
            (os.getenv("OLLAMA_CLOUD_MODEL") or OLLAMA_CLOUD_DEFAULT_MODEL).strip(),
        )
    return (
        (os.getenv("GEMINI_API_KEY") or "").strip(),
        _gemini_model_name(os.getenv("GEMINI_MODEL") or GEMINI_DEFAULT_MODEL),
    )


def _ollama_base_url() -> str:
    return (os.getenv("OLLAMA_BASE_URL") or OLLAMA_DEFAULT_BASE_URL).strip().rstrip("/")


def _key_configured(source: ModelSource = "gemini") -> bool:
    # Ollama is a local service and intentionally requires no secret key.
    if source == "ollama":
        return True
    key, _ = _provider_config(source)
    return bool(key)


def _generate(
    prompt: str,
    source: ModelSource = "gemini",
    timeout_seconds: int = 35,
) -> Tuple[str, str]:
    """Generate a response through the selected provider and return its model name."""
    key, model_name = _provider_config(source)
    if source != "ollama" and not key:
        raise RuntimeError(f"{source} API key not configured")

    try:
        if source == "gemini":
            genai.configure(api_key=key)
            response = genai.GenerativeModel(model_name).generate_content(
                prompt,
                request_options={"timeout": timeout_seconds},
            )
            response_text = (getattr(response, "text", "") or "").strip()
        elif source == "openrouter":
            response = requests.post(
                OPENROUTER_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                },
                timeout=timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
            response_text = (
                payload.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
        else:
            is_cloud = source == "ollama_cloud"
            response = requests.post(
                f"{OLLAMA_CLOUD_BASE_URL if is_cloud else _ollama_base_url()}/api/chat",
                headers={"Authorization": f"Bearer {key}"} if is_cloud else None,
                json={
                    "model": model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "options": {"temperature": 0.2},
                },
                timeout=timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
            response_text = (
                payload.get("message", {})
                .get("content", "")
                .strip()
            )

        if not response_text:
            raise RuntimeError("Provider returned an empty response")
        return response_text, model_name
    except requests.exceptions.Timeout as exc:
        raise TimeoutError("Provider request timed out") from exc
    except requests.exceptions.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else 0
        if status_code == 402:
            raise RuntimeError("PaymentRequired") from exc
        if status_code == 429:
            raise RuntimeError("ResourceExhausted") from exc
        if status_code in (401, 403):
            raise PermissionError(f"HTTP {status_code}") from exc
        if status_code == 404:
            raise FileNotFoundError("Configured model was not found") from exc
        raise
    except Exception as exc:
        err_msg = str(exc).lower()
        if "quota" in err_msg or "429" in err_msg:
            raise RuntimeError("ResourceExhausted") from exc
        if "permission" in err_msg or "401" in err_msg or "403" in err_msg:
            raise PermissionError("HTTP 401/403") from exc
        raise


# In-memory last health check
_last_ai_health: Dict[str, Dict[str, Any]] = {}


def probe_ai(source: ModelSource = "gemini") -> Dict[str, Any]:
    """Validate selected provider config + reachability. Never logs secrets."""
    global _last_ai_health
    now = datetime.datetime.now().isoformat()
    _, model_name = _provider_config(source)
    if not _key_configured(source):
        health = {
            "status": "not_configured",
            "provider": source,
            "model": model_name,
            "checkedAt": now,
            "safeReason": "missing_api_key"
        }
        _last_ai_health[source] = health
        return health

    try:
        response_text, used_model = _generate("Reply with exactly: OK", source)
        text = (response_text or "").strip().upper()
        if "OK" in text or len(text) > 0:
            health = {
                "status": "connected",
                "provider": source,
                "model": used_model,
                "checkedAt": now,
                "safeReason": "connected"
            }
        else:
            health = {
                "status": "unavailable",
                "provider": source,
                "model": used_model,
                "checkedAt": now,
                "safeReason": "malformed_response"
            }
    except Exception as e:
        err_name = type(e).__name__
        err_msg = str(e)
        print(f"AI health probe failed: {err_name} - {err_msg}")
        safe_reason = "network_failure"
        
        if (
            "FileNotFoundError" in err_name
            or "InvalidArgument" in err_name
            or "404" in err_msg
            or "400" in err_msg
        ):
            safe_reason = "invalid_model"
        elif "PaymentRequired" in err_msg or "402" in err_msg:
            safe_reason = "payment_required"
        elif "ResourceExhausted" in err_msg or "429" in err_msg:
            safe_reason = "quota_exceeded"
        elif "Timeout" in err_name:
            safe_reason = "provider_timeout"
        elif "PermissionError" in err_name or "401" in err_msg or "403" in err_msg:
            safe_reason = "invalid_credentials"
            
        health = {
            "status": "unavailable",
            "provider": source,
            "model": model_name,
            "checkedAt": now,
            "safeReason": safe_reason
        }
    _last_ai_health[source] = health
    return health


def probe_gemini() -> Dict[str, Any]:
    """Compatibility wrapper for older callers."""
    return probe_ai("gemini")


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _advisory_failure_message(error: Optional[Exception]) -> str:
    """Return a useful, secret-free explanation for a failed provider request."""
    text = str(error or "").lower()
    if "resourceexhausted" in text or "quota" in text or "429" in text:
        return "Gemini's free request quota is currently exhausted. The report is showing grounded planning notes until the provider is available again."
    if "paymentrequired" in text or "402" in text:
        return "The configured backup AI provider has no available credit. The report is showing grounded planning notes instead."
    if isinstance(error, TimeoutError) or "timeout" in text:
        return "The AI provider took too long to respond. The report is showing grounded planning notes instead."
    if isinstance(error, PermissionError) or "401" in text or "403" in text:
        return "The configured AI credentials were rejected. The report is showing grounded planning notes instead."
    return "AI advice is temporarily unavailable. The report is showing grounded planning notes instead."


def _deterministic_advisory(req: "AdvisoryRequest", timestamp: str, message: str) -> Dict[str, Any]:
    """Keep feasibility useful when no external AI provider can answer.

    These notes are intentionally derived only from the exact report inputs and
    are labelled as a fallback rather than being presented as AI output.
    """
    business = req.business or {}
    finance = req.finance or {}
    financials = finance.get("financials") if isinstance(finance, dict) else {}
    financials = financials if isinstance(financials, dict) else {}
    business_name = str(business.get("name") or "This business")
    project_cost = _number(financials.get("projectCost"))
    monthly_surplus = _number(financials.get("monthlySurplus"))
    monthly_emi = _number(financials.get("monthlyEmi"))
    competition = str((req.competition or {}).get("density") or business.get("competitorDensity") or "unknown").lower()

    why_recommended = []
    if project_cost > 0:
        why_recommended.append(f"{business_name} is assessed using the shared project cost of ₹{project_cost:,.0f} in this report.")
    if monthly_surplus > 0:
        why_recommended.append(f"The current plan projects ₹{monthly_surplus:,.0f} monthly surplus after the stated operating and household costs.")
    else:
        why_recommended.append("The plan needs a verified positive monthly surplus before taking on business credit.")

    risks = []
    if competition == "high":
        risks.append({"risk": "High reported local competition may pressure prices.", "mitigation": "Validate competitor pricing and secure a clear service or convenience advantage before committing capital."})
    elif competition == "low":
        risks.append({"risk": "Low reported competition does not by itself prove local demand.", "mitigation": "Interview prospective customers and record local price quotations before launch."})
    else:
        risks.append({"risk": "Local competition is not fully verified in this plan.", "mitigation": "Check nearby alternatives and customer demand on the ground before investing."})
    if monthly_surplus <= 0:
        risks.append({"risk": "Projected monthly surplus is not positive.", "mitigation": "Rework price, operating costs, and startup scale before applying for a loan."})
    elif monthly_emi > monthly_surplus * 0.5:
        risks.append({"risk": "Estimated EMI takes a high share of projected surplus.", "mitigation": "Increase own contribution, reduce the initial setup, or confirm lower-risk lender terms."})

    data_gaps = []
    if not req.demandAnchors:
        data_gaps.append("No named demand anchors were available in the report input.")
    if not req.schemes:
        data_gaps.append("No matched scheme details were available for this advisory.")

    return {
        "status": "fallback",
        "fallback": True,
        "provider": "deterministic",
        "model": None,
        "failureReason": message,
        "advisory": {
            "whyRecommended": why_recommended,
            "risksAndMitigations": risks,
            "opportunities": ["Validate customer demand, supplier quotations, and repayment capacity with the same assumptions used in this report."],
            "dataGaps": data_gaps,
            "confidence": "medium" if monthly_surplus > 0 else "low",
        },
        "message": message,
        "citations": [],
        "generatedAt": timestamp,
    }


class AdvisoryRequest(BaseModel):
    business: Dict[str, Any]
    modelSource: ModelSource = "gemini"
    location: Optional[Dict[str, Any]] = None
    finance: Optional[Dict[str, Any]] = None
    competition: Optional[Dict[str, Any]] = None
    demandAnchors: Optional[List[Dict[str, Any]]] = None
    schemes: Optional[List[Dict[str, Any]]] = None
    sourceMetadata: Optional[List[Dict[str, Any]]] = None

class ChatRequest(BaseModel):
    message: str
    language: str = "en"
    modelSource: ModelSource = "gemini"
    location: Optional[Dict[str, Any]] = None
    businessDiscoveryResults: Optional[List[Dict[str, Any]]] = None
    selectedBusinesses: Optional[List[Dict[str, Any]]] = None
    comparison: Optional[Dict[str, Any]] = None
    financialPlan: Optional[Dict[str, Any]] = None
    schemeMatches: Optional[List[Dict[str, Any]]] = None
    sourceMetadata: Optional[List[Dict[str, Any]]] = None
    context: Optional[Dict[str, Any]] = None

@router.post("/advisory")
async def generate_advisory(req: AdvisoryRequest):
    timestamp = datetime.datetime.now().isoformat()
    # Gemini is the free/default provider. A configured secondary provider is
    # attempted only after the preferred provider fails, so a transient vendor
    # timeout does not discard an otherwise complete feasibility report.
    candidate_sources: List[ModelSource] = []
    for source in (req.modelSource, "gemini", "openrouter"):
        if source not in candidate_sources and _key_configured(source):
            candidate_sources.append(source)

    if not candidate_sources:
        return {
            "status": "unavailable",
            "advisory": {
                "whyRecommended": [],
                "risksAndMitigations": [],
                "opportunities": [],
                "dataGaps": [],
                "confidence": None
            },
            "message": "AI service is unavailable. Retry after the service is restored.",
            "citations": [],
            "generatedAt": timestamp
        }

    prompt = f"""
You are an expert rural business advisor for Arthniti (India).
You MUST output ONLY valid JSON matching this exact schema:
{{
  "advisory": {{
    "whyRecommended": ["string", "string"],
    "risksAndMitigations": [
      {{ "risk": "string", "mitigation": "string" }}
    ],
    "opportunities": ["string"],
    "dataGaps": ["string"],
    "confidence": "high" | "medium" | "low"
  }}
}}

INPUT DATA:
Business: {json.dumps(req.business)}
Location: {json.dumps(req.location)}
Finance: {json.dumps(req.finance)}
Competition: {json.dumps(req.competition)}
Demand Anchors: {json.dumps(req.demandAnchors)}
Schemes: {json.dumps(req.schemes)}

RULES:
- Base analysis ONLY on actual evidence provided.
- Do not hallucinate external schemes or financial values.
"""
    async def attempt_parse(p: str, source: ModelSource):
        response_text, used_model = await asyncio.to_thread(
            _generate,
            p,
            source,
            ADVISORY_PROVIDER_TIMEOUT_SECONDS,
        )
        text = response_text.strip()
        if text.startswith("```json"): text = text[7:]
        if text.startswith("```"): text = text[3:]
        if text.endswith("```"): text = text[:-3]
        parsed = json.loads(text.strip())
        
        # Normalize response
        advisory = parsed.get("advisory", {}) if isinstance(parsed, dict) else {}
        
        def enforce_list(val):
            if isinstance(val, list): return val
            if isinstance(val, str): return [val]
            return []
            
        return {
            "status": "ready",
            "advisory": {
                "whyRecommended": enforce_list(advisory.get("whyRecommended")),
                "risksAndMitigations": enforce_list(advisory.get("risksAndMitigations")),
                "opportunities": enforce_list(advisory.get("opportunities")),
                "dataGaps": enforce_list(advisory.get("dataGaps")),
                "confidence": advisory.get("confidence", None)
            },
            "message": "",
            "citations": [],
            "generatedAt": timestamp,
            "provider": source,
            "model": used_model,
        }

    provider_errors: Dict[ModelSource, Exception] = {}
    for source in candidate_sources:
        try:
            return await attempt_parse(prompt, source)
        except json.JSONDecodeError:
            try:
                repair_prompt = prompt + "\n\nWARNING: Your last output was not valid JSON. Fix it and return ONLY valid JSON."
                return await attempt_parse(repair_prompt, source)
            except Exception as error:
                provider_errors[source] = error
        except Exception as error:
            provider_errors[source] = error

    last_error = provider_errors.get(req.modelSource) or provider_errors.get("gemini") or next(iter(provider_errors.values()), None)
    if last_error:
        print(f"Advisory Generation Error: {type(last_error).__name__} - {str(last_error)}")
    return _deterministic_advisory(req, timestamp, _advisory_failure_message(last_error))


@router.post("/chat")
async def chat_with_advisor(req: ChatRequest):
    if not _key_configured(req.modelSource):
        raise HTTPException(
            status_code=503,
            detail="AI service is unavailable. Retry after the service is restored.",
        )

    lang_note = {
        "en": "Respond in clear English.",
        "hi": "Respond in Hindi (Devanagari).",
        "te": "Respond in Telugu.",
    }.get(req.language, "Respond in clear English.")

    has_discovery = bool(req.businessDiscoveryResults)
    has_schemes = bool(req.schemeMatches)
    has_comparison = bool(req.comparison)
    has_finance = bool(req.financialPlan)
    session_context = req.context if isinstance(req.context, dict) else {}
    profile = session_context.get("profile") if isinstance(session_context.get("profile"), dict) else {}
    finance_data = req.financialPlan if isinstance(req.financialPlan, dict) else {}
    financials = finance_data.get("financials") if isinstance(finance_data.get("financials"), dict) else finance_data

    margin_capital = _number(profile.get("marginCapital") or profile.get("budget") or profile.get("availableCapital"))
    project_cost = _number(financials.get("projectCost"))
    monthly_surplus = _number(financials.get("monthlySurplus"))
    monthly_emi = _number(financials.get("monthlyEmi"))
    decision_snapshot = {
        "availableOwnContribution": margin_capital if margin_capital > 0 else None,
        "projectCost": project_cost if project_cost > 0 else None,
        "monthlySurplus": monthly_surplus if monthly_surplus else None,
        "monthlyEmi": monthly_emi if monthly_emi else None,
        "selectedBusinessCount": len(req.selectedBusinesses or []),
        "discoveredBusinessCount": len(req.businessDiscoveryResults or []),
    }

    prompt = f"""You are Arthniti Assistant — a grounded financial advisor for rural micro-entrepreneurs in India.
{lang_note}
Keep answers practical, friendly, and concise (3–6 short sentences or bullets). Use Markdown. No raw HTML.

CRITICAL GROUNDING RULES — violation is not allowed:
1. Use ONLY the context JSON below. Do NOT invent nearby businesses, job listings, government scheme terms, eligibility, loan approvals, or financial calculations.
2. If a field is null/empty, say it plainly and helpfully: for example, "I don't have your saved budget in this search yet." Do not use robotic phrases such as "Based on the provided information" or "the data does not contain".
3. Never claim provider data exists when discovery results are empty.
4. SAFE LANGUAGE: Never say "You are eligible" or "You will get a loan". Use "You may be eligible" / "Verify with your bank/SCA".
5. When referencing schemes, only use schemeMatches or matchedSchemes present in context; cite officialUrl if present.
6. When comparing businesses, use comparison / selectedBusinesses / businessDiscoveryResults only.
7. Cite sources from sourceMetadata or provenance fields when available.
8. Always suggest a concrete next step (explore, compare, verify documents, visit bank).

RESPONSE STYLE — required:
1. Lead with the practical answer, using "you". If the decision snapshot has an availableOwnContribution, name it as the user's saved available capital; do not say the budget is missing.
2. For a question about the safest business, explain affordability first: available capital versus project cost, then monthly surplus/EMI if present. If two or more businesses are available, name the strongest option and a reason. If only one business is available, say you can assess its affordability but cannot honestly rank it against alternatives yet.
3. A scheme match is potential support, not proof that the business is affordable. Do not make a scheme the main answer unless the user asks specifically about schemes.
4. Never repeat raw catalogue descriptions, eligibility checklists, or generic "consult an advisor" boilerplate unless the user asks for them.

CONTEXT AVAILABILITY:
- discovery: {has_discovery}
- schemes: {has_schemes}
- comparison: {has_comparison}
- financialPlan: {has_finance}

DECISION SNAPSHOT (prioritize this for budget questions):
{json.dumps(decision_snapshot)}

Context JSON:
Location: {json.dumps(req.location)}
Discovery Results: {json.dumps(req.businessDiscoveryResults)}
Selected Businesses: {json.dumps(req.selectedBusinesses)}
Comparison: {json.dumps(req.comparison)}
Financial Plan: {json.dumps(req.financialPlan)}
Scheme Matches: {json.dumps(req.schemeMatches)}
Source Metadata: {json.dumps(req.sourceMetadata)}
Other Context: {json.dumps(req.context)}

User Question: {req.message}
"""
    try:
        response_text, used_model = await asyncio.to_thread(_generate, prompt, req.modelSource)
        return {
            "response": response_text.strip(),
            "status": "ok",
            "provider": req.modelSource,
            "model": used_model,
        }
    except Exception as e:
        print(f"Chat Error: {type(e).__name__} - {str(e)}")
        raise HTTPException(
            status_code=503,
            detail="AI service is unavailable. Retry after the service is restored.",
        )
