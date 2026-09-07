"""One transparent financial-planning model for advisory, feasibility and passport views.

The default is an indicative lender-neutral plan. It is only replaced when a
matched scheme supplies published, applicable credit terms. A plan is never
blocked merely because a scheme (such as PMMY) leaves rate and tenure to the
lender.
"""

DEFAULT_ANNUAL_INTEREST_RATE = 12.0
DEFAULT_TENURE_MONTHS = 36


def calculate_emi(principal: float, annual_rate: float, tenure_months: int) -> float:
    if tenure_months <= 0: return 0
    r = annual_rate / 100 / 12
    if r == 0: return principal / tenure_months
    factor = (1 + r) ** tenure_months
    return (principal * r * factor) / (factor - 1)


def _money(value) -> float:
    try:
        return max(0.0, float(value or 0))
    except (TypeError, ValueError):
        return 0.0


def select_credit_terms(required_credit: float, scheme_matches: list | None = None) -> dict:
    """Select verified terms only when they cover this exact first-stage credit need."""
    for match in scheme_matches or []:
        terms = (match or {}).get("financeTerms") or {}
        interest_rate = _money(terms.get("annualInterestRate"))
        tenure_months = int(_money(terms.get("tenureMonths")))
        max_credit = _money(terms.get("maxCredit"))
        if interest_rate and tenure_months and max_credit and required_credit <= max_credit:
            return {
                "annualInterestRate": interest_rate,
                "tenureMonths": tenure_months,
                "termSource": "published_scheme_terms",
                "schemeId": (match or {}).get("schemeId"),
                "schemeName": (match or {}).get("name"),
                "termNote": terms.get("note") or "Published scheme terms; lender approval and eligibility still apply.",
                "officialUrl": (match or {}).get("officialUrl"),
            }

    return {
        "annualInterestRate": DEFAULT_ANNUAL_INTEREST_RATE,
        "tenureMonths": DEFAULT_TENURE_MONTHS,
        "termSource": "planning_assumption",
        "schemeId": None,
        "schemeName": None,
        "termNote": "Indicative planning assumption only. The lender sets final rate and tenure unless verified scheme terms apply.",
        "officialUrl": None,
    }


def build_business_financial_plan(
    project_cost: float,
    applicant_margin: float,
    monthly_revenue: float,
    monthly_operating_cost: float,
    household_expenses: float = 0,
    scheme_matches: list | None = None,
) -> dict:
    """Return the canonical reducing-balance plan used across the advisory flow."""
    project_cost = _money(project_cost)
    stated_margin = _money(applicant_margin)
    applicant_margin = min(stated_margin, project_cost)
    monthly_revenue = _money(monthly_revenue)
    monthly_operating_cost = _money(monthly_operating_cost)
    household_expenses = _money(household_expenses)

    if project_cost <= 0:
        return {
            "status": "incomplete",
            "financials": {},
            "validationErrors": ["A positive startup project cost is required."],
            "message": "Financial plan unavailable because the selected business has no startup-cost estimate.",
            "assumptions": {},
        }

    required_credit = max(0.0, project_cost - applicant_margin)
    terms = select_credit_terms(required_credit, scheme_matches)
    annual_rate = terms["annualInterestRate"]
    tenure_months = terms["tenureMonths"]
    monthly_emi = calculate_emi(required_credit, annual_rate, tenure_months)
    operating_surplus = monthly_revenue - monthly_operating_cost
    monthly_surplus = operating_surplus - household_expenses
    emi_to_surplus = (monthly_emi / monthly_surplus * 100) if monthly_surplus > 0 else (100.0 if monthly_emi > 0 else 0.0)

    if required_credit <= 0:
        readiness, message = 100, "Your stated margin capital covers the estimated startup cost; no credit is assumed."
    elif monthly_surplus <= 0:
        readiness, message = 0, "Projected revenue does not cover operating and stated household costs before EMI."
    elif emi_to_surplus <= 35:
        readiness, message = 90, "Projected monthly surplus comfortably covers the estimated EMI."
    elif emi_to_surplus <= 50:
        readiness, message = 70, "Projected monthly surplus covers the estimated EMI, but the repayment buffer is limited."
    elif emi_to_surplus <= 80:
        readiness, message = 40, "Estimated EMI is high relative to projected monthly surplus; reduce capital need or improve margin."
    else:
        readiness, message = 20, "Estimated EMI exceeds a safe share of projected monthly surplus."

    total_repayment = monthly_emi * tenure_months
    return {
        "status": "ready",
        "financials": {
            "projectCost": round(project_cost),
            "applicantMargin": round(applicant_margin),
            "unallocatedMargin": round(max(0.0, stated_margin - project_cost)),
            "requiredCredit": round(required_credit),
            "annualInterestRate": annual_rate,
            "tenureMonths": tenure_months,
            "monthlyEmi": round(monthly_emi),
            "monthlyRevenue": round(monthly_revenue),
            "monthlyOperatingCost": round(monthly_operating_cost),
            "householdExpenses": round(household_expenses),
            "operatingSurplus": round(operating_surplus),
            "monthlySurplus": round(monthly_surplus),
            "emiToSurplusRatio": round(emi_to_surplus, 1),
            "repaymentReadinessScore": readiness,
            "totalRepayment": round(total_repayment),
            "totalInterest": round(max(0.0, total_repayment - required_credit)),
        },
        "terms": terms,
        "validationErrors": [],
        "message": message,
        "assumptions": {
            "projectCost": "Uses the selected business's minimum estimated startup capital.",
            "surplus": "Monthly revenue minus operating cost and the household expenses stated in your advisory profile.",
            "emi": "Reducing-balance EMI on the required credit for the shown annual rate and tenure. It is an estimate, not a loan offer.",
        },
    }

def calculate_financials(margin_capital: float) -> dict:
    # Scheme Definitions
    MICRO_FINANCE = {
        'type': 'micro_finance',
        'name': 'Micro Finance Scheme',
        'nameHi': 'माइक्रो फाइनेंस योजना',
        'maxLoan': 1_25_000,
        'annualInterestRate': 6.5,
        'tenureYears': 3,
        'moratoriumMonths': 3,
        'description': 'For small-scale micro enterprises with project cost up to ₹1,40,000. Maximum loan of ₹1,25,000 at 6.5% annual interest with 3-year repayment.'
    }

    TERM_LOAN = {
        'type': 'term_loan',
        'name': 'Term Loan Scheme',
        'nameHi': 'सावधि ऋण योजना',
        'maxLoan': 45_00_000,
        'annualInterestRate': 8.0,
        'tenureYears': 7,
        'moratoriumMonths': 6,
        'description': 'For medium enterprises with project cost between ₹1,40,001 and ₹50,00,000. Maximum loan of ₹45,00,000 at 8% annual interest with 7-year repayment.'
    }

    if margin_capital <= 0:
        return {
            'isEligible': False,
            'marginCapital': 0,
            'projectCost': 0,
            'loanAmount': 0,
            'ineligibleReason': 'Margin capital must be greater than 0.'
        }

    project_cost = margin_capital * 10
    loan_amount = project_cost * 0.9

    if project_cost <= 1_40_000:
        scheme = MICRO_FINANCE
    elif project_cost <= 50_00_000:
        scheme = TERM_LOAN
    else:
        return {
            'isEligible': False,
            'marginCapital': margin_capital,
            'projectCost': project_cost,
            'loanAmount': loan_amount,
            'ineligibleReason': 'Project cost exceeds maximum limit of ₹50,00,000 for available schemes.'
        }

    capped_loan_amount = min(loan_amount, scheme['maxLoan'])
    
    annual_rate = scheme['annualInterestRate']
    tenure_years = scheme['tenureYears']
    moratorium_months = scheme['moratoriumMonths']
    
    monthly_rate = annual_rate / 100 / 12
    balance = capped_loan_amount
    
    moratorium_interest = 0
    amortization_table = []
    
    # Moratorium period
    for m in range(1, moratorium_months + 1):
        interest_accrued = balance * monthly_rate
        moratorium_interest += interest_accrued
        new_balance = balance + interest_accrued
        amortization_table.append({
            'month': m,
            'openingBalance': round(balance, 2),
            'emi': 0,
            'principalPaid': 0,
            'interestPaid': 0,
            'closingBalance': round(new_balance, 2),
            'isMoratorium': True
        })
        balance = new_balance
        
    capitalized_principal = balance
    repayment_months = tenure_years * 12 - moratorium_months
    emi = calculate_emi(capitalized_principal, annual_rate, repayment_months)
    
    total_repayment = 0
    total_interest_paid = moratorium_interest
    
    for m in range(moratorium_months + 1, tenure_years * 12 + 1):
        interest = balance * monthly_rate
        principal = emi - interest
        
        # Adjust last month rounding
        if m == tenure_years * 12:
            principal = balance
            emi = principal + interest
            
        new_balance = balance - principal
        total_repayment += emi
        total_interest_paid += interest
        
        amortization_table.append({
            'month': m,
            'openingBalance': round(balance, 2),
            'emi': round(emi, 2),
            'principalPaid': round(principal, 2),
            'interestPaid': round(interest, 2),
            'closingBalance': max(0, round(new_balance, 2)),
            'isMoratorium': False
        })
        balance = new_balance

    return {
        'isEligible': True,
        'marginCapital': margin_capital,
        'projectCost': project_cost,
        'loanAmount': loan_amount,
        'cappedLoanAmount': capped_loan_amount,
        'scheme': scheme,
        'monthlyEMI': emi,
        'moratoriumInterest': moratorium_interest,
        'capitalizedPrincipal': capitalized_principal,
        'totalRepayment': total_repayment,
        'totalInterestPaid': total_interest_paid,
        'amortizationTable': amortization_table
    }

def calculate_scenario_financials(margin_capital: float, avg_revenue: float, avg_operating_cost: float) -> dict:
    fin = calculate_financials(margin_capital)
    if not fin.get('isEligible'):
        return None
        
    emi = fin.get('monthlyEMI', 0)
    
    def calc_scenario(rev, cost):
        surplus = max(0, rev - cost)
        ratio = (emi / surplus * 100) if surplus > 0 else (100 if emi > 0 else 0)
        return {
            'revenue': rev,
            'operatingCost': cost,
            'surplus': surplus,
            'emiRatio': ratio,
            'isSafe': ratio <= 50
        }
        
    return {
        'optimistic': calc_scenario(avg_revenue * 1.2, avg_operating_cost * 0.9),
        'expected': calc_scenario(avg_revenue, avg_operating_cost),
        'conservative': calc_scenario(avg_revenue * 0.8, avg_operating_cost * 1.1)
    }

def calculate_repayment_readiness(margin_capital: float, avg_revenue: float, avg_operating_cost: float) -> dict:
    fin = calculate_financials(margin_capital)
    if not fin.get('isEligible'):
        return {
            'status': 'High Risk',
            'statusHi': 'उच्च जोखिम',
            'ratio': 100,
            'message': fin.get('ineligibleReason', 'Ineligible'),
            'messageHi': 'अपात्र'
        }
        
    emi = fin.get('monthlyEMI', 0)
    surplus = max(0, avg_revenue - avg_operating_cost)
    ratio = (emi / surplus * 100) if surplus > 0 else 100
    
    if ratio < 35:
        return {
            'status': 'Comfortable',
            'statusHi': 'आरामदायक',
            'ratio': ratio,
            'message': 'Your expected surplus easily covers the EMI. You have a strong buffer for unexpected expenses.',
            'messageHi': 'आपका अपेक्षित अधिशेष आसानी से EMI को कवर करता है।'
        }
    elif ratio <= 50:
        return {
            'status': 'Caution',
            'statusHi': 'सावधानी',
            'ratio': ratio,
            'message': 'EMI is manageable, but takes up a significant portion of surplus. Maintain an emergency fund.',
            'messageHi': 'EMI प्रबंधनीय है, लेकिन अधिशेष का एक महत्वपूर्ण हिस्सा लेती है।'
        }
    else:
        return {
            'status': 'High Risk',
            'statusHi': 'उच्च जोखिम',
            'ratio': ratio,
            'message': 'EMI exceeds safe limits. Consider starting smaller or increasing margin capital to reduce loan size.',
            'messageHi': 'EMI सुरक्षित सीमा से अधिक है। ऋण का आकार कम करने के लिए मार्जिन पूंजी बढ़ाने पर विचार करें।'
        }
