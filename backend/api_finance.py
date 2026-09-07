from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Any
import finance_engine
import datetime

router = APIRouter()

class FinanceRequest(BaseModel):
    marginCapital: float
    avgRevenue: float
    avgOperatingCost: float

@router.post("/calculate")
async def calculate_finance(req: FinanceRequest):
    base_fin = finance_engine.calculate_financials(req.marginCapital)
    scenarios = finance_engine.calculate_scenario_financials(req.marginCapital, req.avgRevenue, req.avgOperatingCost)
    readiness = finance_engine.calculate_repayment_readiness(req.marginCapital, req.avgRevenue, req.avgOperatingCost)
    
    timestamp = datetime.datetime.now().isoformat()
    
    return {
        "base": base_fin,
        "scenarios": scenarios,
        "readiness": readiness,
        "provenance": {
            "source": "Arthniti Backend Finance Engine",
            "retrievedAt": timestamp,
            "confidence": "high",
            "dataType": "deterministic calculation"
        }
    }

class FinancialPlanRequest(BaseModel):
    # The business/profile shape is the canonical advisory request. The scalar
    # fields remain accepted for backwards compatibility with older clients.
    business: Optional[dict] = None
    userProfile: Optional[dict] = None
    location: Optional[dict] = None
    schemeMatches: Optional[list[dict]] = None
    projectCost: Optional[float] = None
    applicantMargin: Optional[float] = None
    requiredCredit: Optional[float] = None
    annualInterestRate: Optional[float] = None
    tenureMonths: Optional[int] = None
    monthlyRevenue: float = 0
    monthlyOperatingCost: float = 0
    householdExpenses: float = 0


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def _scheme_matches_for_plan(req: FinancialPlanRequest, project_cost: float) -> tuple[list[dict], dict]:
    if req.schemeMatches is not None:
        return req.schemeMatches, {"status": "ready", "matches": req.schemeMatches}
    if not req.business:
        return [], {"status": "not_requested", "matches": []}

    try:
        import api_schemes
        profile = {**(req.userProfile or {}), "projectCost": project_cost}
        match_request = api_schemes.SchemeMatchRequest(
            businessCategory=req.business.get("category", ""),
            userProfile=profile,
            location=req.location or (req.userProfile or {}).get("location") or {},
        )
        response = await api_schemes.match_schemes(match_request)
        return response.get("matches") or [], response
    except Exception as error:
        print(f"Financial plan scheme matching error: {type(error).__name__}")
        return [], {"status": "unavailable", "matches": [], "message": "Scheme matching is unavailable; a lender-neutral planning model was used."}

@router.post("/plan")
async def financial_plan(req: FinancialPlanRequest):
    timestamp = datetime.datetime.now().isoformat()
    business = req.business or {}
    profile = req.userProfile or {}
    project_cost = _number(
        business.get("minCapital")
        or business.get("maxCapital")
        or req.projectCost
    )
    applicant_margin = _number(profile.get("marginCapital") if req.business else req.applicantMargin)
    monthly_revenue = _number(business.get("avgRevenue") if req.business else req.monthlyRevenue)
    monthly_operating_cost = _number(business.get("avgOperatingCost") if req.business else req.monthlyOperatingCost)
    household_expenses = _number(profile.get("householdExpenses") if req.business else req.householdExpenses)

    if applicant_margin < 0 or monthly_revenue < 0 or monthly_operating_cost < 0 or household_expenses < 0:
        return {
            "status": "incomplete",
            "financials": {},
            "validationErrors": ["Financial inputs cannot be negative."],
            "message": "Financial plan unavailable because one or more inputs are invalid.",
            "source": {"retrievedAt": timestamp, "name": "Arthniti Deterministic Engine"},
        }

    matches, scheme_matching = await _scheme_matches_for_plan(req, project_cost)
    plan = finance_engine.build_business_financial_plan(
        project_cost=project_cost,
        applicant_margin=applicant_margin,
        monthly_revenue=monthly_revenue,
        monthly_operating_cost=monthly_operating_cost,
        household_expenses=household_expenses,
        scheme_matches=matches,
    )
    plan["schemeMatching"] = scheme_matching
    plan["source"] = {
        "retrievedAt": timestamp,
        "name": "Arthniti canonical deterministic finance model",
        "dataType": "reducing-balance EMI estimate",
    }
    return plan

class DebtHealthRequest(BaseModel):
    financialPlan: dict

@router.post("/analyse")
async def analyse_debt_health(req: DebtHealthRequest):
    import asyncio
    import api_ai
    timestamp = datetime.datetime.now().isoformat()
    try:
        plan = req.financialPlan
        ratio = plan.get('emiToSurplusRatio', 0)
        
        prompt = f"You are a rural debt advisor. Analyze this micro-business debt health briefly (2-3 sentences). Focus on EMI-to-Surplus ratio risk. Plan: {plan}"
        summary, _ = await asyncio.to_thread(api_ai._generate, prompt)
        
        return {
            "status": "ready",
            "analysis": {
                "executiveSummary": summary.strip(),
                "riskLevel": "High" if ratio > 60 else "Medium" if ratio > 40 else "Low",
                "recommendedActions": ["Maintain a 3-month EMI buffer", "Track daily operating costs closely"]
            },
            "retrievedAt": timestamp
        }
    except Exception as e:
        print(f"Debt analysis error: {e}")
        return {
            "status": "error",
            "analysis": None,
            "message": "Debt health analysis unavailable.",
            "retrievedAt": timestamp
        }

class BudgetImpactRequest(BaseModel):
    expenseAmount: float
    expensePurpose: str
    expenseType: str
    marginCapital: float
    avgRevenue: float
    avgOperatingCost: float

@router.post("/budget-impact")
async def budget_impact(req: BudgetImpactRequest):
    import asyncio
    import api_ai
    
    prompt = f"""
    You are a rural business finance advisor. A micro-entrepreneur is considering an expense.
    Expense Amount: ₹{req.expenseAmount}
    Purpose: {req.expensePurpose}
    Type: {req.expenseType}
    Business Average Monthly Revenue: ₹{req.avgRevenue}
    Business Average Monthly Operating Cost: ₹{req.avgOperatingCost}
    Available Capital: ₹{req.marginCapital}
    
    Provide a short, concise analysis (max 3 sentences) on the impact of this expense on their financial goals.
    Is it a safe investment or risky? Give concrete advice. Do not output markdown, just plain text.
    """
    try:
        response_text, _ = await asyncio.to_thread(api_ai._generate, prompt)
        return {"analysis": response_text.strip()}
    except Exception as e:
        print("Budget impact error:", e)
        return {"error": "Failed to analyze budget impact."}
