import os
import io
import csv
import pickle
import tempfile
import uuid
import socket
import asyncio

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Dict, List, Any

import torch
from transformers import DistilBertForSequenceClassification, DistilBertTokenizerFast

import ollama
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OLLAMA_MODEL = "llama3.1:latest" # Using the model user has installed

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


import pandas as pd
import matplotlib
matplotlib.use('Agg')  # Headless backend for server charts
import matplotlib.pyplot as plt

from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, HRFlowable, Table, TableStyle, BaseDocTemplate, Frame, PageTemplate
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors

app = FastAPI(title="Arthniti AI Expense Classifier & PDF Engine", version="1.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AIProxyRequest(BaseModel):
    prompt: str
    temperature: float = 0.7
    max_tokens: int = 1024

@app.post("/api/ai-proxy")
async def ai_proxy(payload: AIProxyRequest):
    """Unified AI proxy that prefers local Ollama over Gemini"""
    try:
        # Try Ollama First
        res = ollama.chat(model=OLLAMA_MODEL, messages=[{"role": "user", "content": payload.prompt}])
        return {"text": res['message']['content']}
    except Exception as ollama_err:
        print(f"Ollama Proxy Error: {ollama_err}")
        # Fallback to Gemini if key is available
        if GEMINI_API_KEY:
            try:
                model_gemini = genai.GenerativeModel("models/gemini-flash-latest")
                response = model_gemini.generate_content(payload.prompt)
                return {"text": response.text}
            except Exception as gemini_err:
                raise HTTPException(status_code=500, detail=f"Both Ollama and Gemini failed. Gemini error: {gemini_err}")
        else:
            raise HTTPException(status_code=500, detail=f"Ollama failed and no Gemini API key found. Ollama error: {ollama_err}")


# -------------------------------------------------------------
# 1. SETUP CLASSIFIER MODEL
# -------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

# The fine-tuned model directory (contains config.json, model.safetensors, tokenizer files)
TXN_MODEL_DIR = BASE_DIR
# The label encoder from training
LABEL_ENCODER_PATH = os.path.join(BASE_DIR, "label_encoder.pkl")


print("Initializing AI Categories...")
try:
    with open(LABEL_ENCODER_PATH, "rb") as f:
        le = pickle.load(f)
        classes = list(le.classes_)
    CATEGORY_MAP = {i: v for i, v in enumerate(classes)}
    print(f"Loaded {len(CATEGORY_MAP)} categories: {list(CATEGORY_MAP.values())}")
except Exception as e:
    print("Error loading category map:", e)
    CATEGORY_MAP = {}

print("Initializing AI Model...")
try:
    # Load the fine-tuned model and tokenizer directly from the saved model directory
    # This uses the correct config.json, tokenizer, and weights from training
    tokenizer = DistilBertTokenizerFast.from_pretrained(TXN_MODEL_DIR)
    model = DistilBertForSequenceClassification.from_pretrained(TXN_MODEL_DIR, num_labels=13)
    model.eval()
    print(f"PyTorch AI Model loaded successfully from: {TXN_MODEL_DIR}")
except Exception as e:
    print("Error loading model:", e)

def predict_category(text: str) -> str:
    if not text.strip(): return "Unknown"
    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True)
    with torch.no_grad():
        outputs = model(**inputs)
    return CATEGORY_MAP.get(outputs.logits.argmax().item(), "Unknown")

def predict_categories_batch(texts: List[str], batch_size: int = 128) -> List[str]:
    """Processes large arrays of text simultaneously leveraging PyTorch vectorization"""
    if not texts: return []
    results = []
    for i in range(0, len(texts), batch_size):
        batch = [t if t.strip() else "Empty" for t in texts[i:i + batch_size]]
        inputs = tokenizer(batch, return_tensors="pt", truncation=True, padding=True)
        with torch.no_grad():
            logits = model(**inputs).logits
        preds = logits.argmax(dim=-1).tolist()
        
        for idx, p in enumerate(preds):
            if batch[idx] == "Empty":
                results.append("Unknown")
            else:
                results.append(CATEGORY_MAP.get(p, "Unknown"))
    return results

# -------------------------------------------------------------
# 2. DEFINITIONS FOR PDF REPORT STYLING
# -------------------------------------------------------------
PAGE_W, PAGE_H = A4
MARGIN = 40
BRAND_DARK   = colors.HexColor("#1A1A2E") 
BRAND_MID    = colors.HexColor("#16213E")
BRAND_ACCENT = colors.HexColor("#00FFA3")
TEXT_BODY    = colors.HexColor("#2E2E2E")
TEXT_MUTED   = colors.HexColor("#666666")

def draw_header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(BRAND_DARK)
    canvas.rect(0, h - 50, w, 50, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 14)
    canvas.drawString(MARGIN, h - 32, "Arthniti Financial Analysis Report")
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.HexColor("#AAAAAA"))
    canvas.drawRightString(w - MARGIN, h - 32, "Confidential AI Analysis")
    canvas.setStrokeColor(BRAND_ACCENT)
    canvas.setLineWidth(2)
    canvas.line(0, h - 52, w, h - 52)
    canvas.setStrokeColor(colors.HexColor("#DDDDDD"))
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 38, w - MARGIN, 38)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 24, "Generated by Arthniti Behavioral AI")
    canvas.drawRightString(w - MARGIN, 24, f"Page {doc.page}")
    canvas.restoreState()

styles = getSampleStyleSheet()
section_label_style = ParagraphStyle("SectionLabel", fontName="Helvetica-Bold", fontSize=11, textColor=colors.white, leading=16, leftIndent=6)
body_style = ParagraphStyle("BodyStyle", parent=styles["BodyText"], fontName="Helvetica", fontSize=10, leading=16, textColor=TEXT_BODY, spaceAfter=10)
def section_heading(title):
    tbl = Table([[Paragraph(title, section_label_style)]], colWidths=[PAGE_W - MARGIN * 2], rowHeights=[24])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, -1), BRAND_MID),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),("BOTTOMPADDING",(0,0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),("RIGHTPADDING",(0, 0), (-1, -1), 8),
    ]))
    return tbl

def accent_rule(): return HRFlowable(width="100%", thickness=1.5, color=BRAND_ACCENT, spaceAfter=12, spaceBefore=4)

import re as _re

def sanitize_currency(text: str) -> str:
    """Replace all non-INR currency symbols and codes with 'INR '."""
    # Replace Unicode symbols: £ € $ ¥ ₤
    text = _re.sub(r'[£€¥₤\$]', 'INR ', text)
    # Replace spelled-out codes: USD, GBP, EUR, JPY (case-insensitive, standalone)
    text = _re.sub(r'\b(USD|GBP|EUR|JPY|US Dollars?|Euros?|Pounds?)\b', 'INR', text, flags=_re.IGNORECASE)
    # Collapse double spaces
    text = _re.sub(r'INR\s+INR', 'INR', text)
    return text

# -------------------------------------------------------------
# 3. ENDPOINTS
# -------------------------------------------------------------
class SummaryRequest(BaseModel):
    category_totals: Dict[str, float]

class PdfRequestPayload(BaseModel):
    category_totals: Dict[str, float]
    ai_summary: str
    transactions: List[Dict[str, Any]]

@app.post("/api/upload-expenses")
async def upload_expenses(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported currently.")
    decoded = (await file.read()).decode('utf-8', errors='ignore')
    reader = csv.reader(io.StringIO(decoded))
    
    rows_data = []
    headers = next(reader, None)  # read header row
    if not headers:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no header row.")
    
    # Normalize headers to lowercase for flexible matching
    normalized_headers = [h.strip().lower() for h in headers]
    
    # Find column indices by name (flexible — works with any column order)
    desc_idx = None
    amt_idx = None
    date_idx = None
    for i, h in enumerate(normalized_headers):
        if h in ("description", "desc", "narration", "particulars", "details"):
            desc_idx = i
        elif h in ("amount", "amt", "value", "debit", "credit"):
            amt_idx = i
        elif h in ("date", "txn_date", "transaction_date", "txn date"):
            date_idx = i
    
    # Fallback to positional if no matching headers found
    if desc_idx is None:
        desc_idx = 1 if len(headers) > 1 else 0
    if amt_idx is None:
        amt_idx = 2 if len(headers) > 2 else 0
    if date_idx is None:
        date_idx = 0
    
    for row in reader:
        if not row: continue
        desc = row[desc_idx].strip() if len(row) > desc_idx else ""
        amt = row[amt_idx].strip() if len(row) > amt_idx else "0"
        date = row[date_idx].strip() if len(row) > date_idx and date_idx != desc_idx else "Unknown"
        rows_data.append({"date": date, "description": desc, "amount": amt})
        
    descriptions = [r["description"] for r in rows_data]
    categories = predict_categories_batch(descriptions)
    
    results = []
    for r, cat in zip(rows_data, categories):
        r["ai_category"] = cat
        results.append(r)
        
    return {"message": f"Successfully processed {len(results)} rows", "data": results}

class AppCsvRequest(BaseModel):
    csv_data: str

@app.post("/api/save-app-transactions")
async def save_app_transactions(payload: AppCsvRequest):
    # Save the CSV string to the requested file
    transactions_path = os.path.join(BASE_DIR, "transactions.csv")
    with open(transactions_path, "w", encoding="utf-8") as f:
        f.write(payload.csv_data)
        
    # Parse the CSV — for app transactions the CSV already has correct categories
    # Schema: date,description,amount,type,category,necessity
    reader = csv.reader(io.StringIO(payload.csv_data))
    rows_data = []
    headers = next(reader, None)  # skip header
    for row in reader:
        if not row: continue
        desc = row[1] if len(row) > 1 else row[0]
        amt = row[2] if len(row) > 2 else "0"
        date = row[0] if len(row) > 0 else "Unknown"
        # Use the category from the CSV directly (col 4) — the frontend already classifies them
        category = row[4].strip() if len(row) > 4 else predict_category(desc)
        rows_data.append({"date": date, "description": desc, "amount": amt, "ai_category": category})
        
    return {"message": f"Successfully saved and processed {len(rows_data)} rows", "data": rows_data}

@app.post("/api/generate-summary")
async def generate_summary(payload: SummaryRequest):
    totals = payload.category_totals
    # Format amounts as INR strings in the prompt itself so the LLM has context
    fmt_totals = ", ".join([f"{cat}: INR {val:,.0f}" for cat, val in totals.items()])
    prompt = f"""You are a financial analyst working in INDIA. All amounts are in Indian Rupees (INR).
The user's spending breakdown is: {fmt_totals}

Write exactly 4 bullet points (no more, no less). Each bullet must be short, clear, and easy to understand.
RULES — follow strictly:
- Use ONLY the format "INR X,XX,XXX" for any monetary value. Example: INR 53,750
- Do NOT use $, £, €, ¥, USD, EUR, GBP or any other symbol/currency.
- Do NOT write paragraphs. Only bullet points starting with a dash (-).
- EVERY single bullet point absolutely MUST include an exact numerical figure (e.g. INR amounts or percentages) to back up its claim. Be highly quantitative.
- Topics: (1) Largest spend category, (2) Leakage pattern, (3) Actionable advice, (4) Savings recommendation."""
    try:
        # Try Gemini first if API key is present (best for production)
        if GEMINI_API_KEY:
            model_gemini = genai.GenerativeModel("models/gemini-flash-latest")
            response = model_gemini.generate_content(prompt)
            return {"summary": sanitize_currency(response.text.strip())}
            
        # Fallback to Ollama (local dev)
        res = ollama.chat(model=OLLAMA_MODEL, messages=[{"role": "user", "content": prompt}])
        raw = res['message']['content']
        cleaned = sanitize_currency(raw)
        return {"summary": cleaned}
    except Exception as e:
        print(f"LLM Error: {e}")
        return {"summary": "Could not fetch AI summary. Please check if GEMINI_API_KEY is set or Ollama is running."}


class GoalPlannerRequest(BaseModel):
    goal: Dict[str, Any]
    monthlyIncome: float = 0
    monthlyExpenses: float = 0
    riskTolerance: str = "all"

@app.post("/api/goal-planner")
async def goal_planner(payload: GoalPlannerRequest):
    import math
    from datetime import date

    goal = payload.goal
    income = payload.monthlyIncome
    expenses = payload.monthlyExpenses
    disposable = max(0, income - expenses)

    # --- Date & amount calculations ---
    try:
        target_dt = date.fromisoformat(goal.get("targetDate", ""))
        today = date.today()
        months_remaining = max(1, (target_dt.year - today.year) * 12 + (target_dt.month - today.month))
    except Exception:
        months_remaining = 60

    target_amount = float(goal.get("targetAmount", 0))
    current_savings = float(goal.get("currentSavings", 0))
    amount_needed = max(0, target_amount - current_savings)

    # --- Helper: SIP needed to reach corpus in N months at annual return r ---
    def sip_required(corpus: float, months: int, annual_return: float) -> float:
        if months <= 0: return corpus
        r = annual_return / 100 / 12  # monthly rate
        if r == 0: return corpus / months
        fv_factor = ((1 + r) ** months - 1) / r * (1 + r)
        return corpus / fv_factor if fv_factor > 0 else corpus / months

    # --- Helper: corpus after N months of SIP at annual return r ---
    def corpus_after(sip: float, months: int, annual_return: float, existing: float = 0) -> float:
        r = annual_return / 100 / 12
        if r == 0:
            return sip * months + existing * (1 + annual_return/100/12)**months
        fv_sip = sip * (((1 + r) ** months - 1) / r) * (1 + r)
        fv_existing = existing * (1 + r) ** months
        return fv_sip + fv_existing

    # --- Helper: milestone list ---
    def make_milestones(sip: float, annual_return: float, total_months: int) -> list:
        checkpoints = sorted(set([6, 12, 24, total_months]))
        milestones = []
        for m in checkpoints:
            if m > total_months: continue
            c = corpus_after(sip, m, annual_return, current_savings)
            milestones.append({
                "month": m,
                "corpus": round(c),
                "progress_pct": round(min(c / target_amount * 100, 100), 1) if target_amount > 0 else 0
            })
        return milestones

    # --- Define 3 risk profiles ---
    PROFILES = {
        "low": {
            "annual_return": 8.0,
            "instruments": [
                {"name": "PPF", "allocation_pct": 50, "expected_return": 7.1, "data_source": "Govt India", "why": "Tax-free, government-backed, safe returns over 15 years."},
                {"name": "Fixed Deposits", "allocation_pct": 30, "expected_return": 7.5, "data_source": "SBI/HDFC", "why": "Capital protection with guaranteed bank interest."},
                {"name": "Debt Mutual Funds", "allocation_pct": 20, "expected_return": 8.5, "data_source": "AMFI", "why": "Slightly higher return than FD with moderate liquidity."},
            ]
        },
        "medium": {
            "annual_return": 12.0,
            "instruments": [
                {"name": "Large Cap Equity MF", "allocation_pct": 50, "expected_return": 12.5, "data_source": "AMFI", "why": "Consistent long-term performers like Nifty 50 index funds."},
                {"name": "Hybrid / Balanced Fund", "allocation_pct": 30, "expected_return": 10.5, "data_source": "AMFI", "why": "Mix of equity and debt for balanced risk-return."},
                {"name": "Gold ETF", "allocation_pct": 20, "expected_return": 9.0, "data_source": "MCX", "why": "Inflation hedge and portfolio diversifier."},
            ]
        },
        "high": {
            "annual_return": 17.0,
            "instruments": [
                {"name": "Small Cap Equity MF", "allocation_pct": 40, "expected_return": 20.0, "data_source": "AMFI", "why": "High growth potential from emerging companies."},
                {"name": "Mid Cap Equity MF", "allocation_pct": 35, "expected_return": 16.0, "data_source": "AMFI", "why": "Strong performers in India's growing mid-market segment."},
                {"name": "Direct Equity (Stocks)", "allocation_pct": 25, "expected_return": 18.0, "data_source": "NSE/BSE", "why": "Direct ownership of high-conviction Indian companies."},
            ]
        }
    }

    plans = {}
    recommended_plan = "medium"

    for risk_key, profile in PROFILES.items():
        ann_ret = profile["annual_return"]
        sip = sip_required(amount_needed, months_remaining, ann_ret)
        achievable = sip <= disposable * 0.9 if disposable > 0 else False
        revised_months = None
        if not achievable and disposable > 0:
            # find how many months the user CAN achieve at max 90% of disposable
            max_sip = disposable * 0.9
            r = ann_ret / 100 / 12
            if r > 0 and max_sip > 0:
                try:
                    revised_months = math.ceil(math.log(
                        (amount_needed * r / (max_sip * (1 + r)) + 1)
                    ) / math.log(1 + r))
                except Exception:
                    revised_months = None

        instruments_with_amounts = []
        for inst in profile["instruments"]:
            instruments_with_amounts.append({
                **inst,
                "monthly_amount": round(sip * inst["allocation_pct"] / 100)
            })

        plans[risk_key] = {
            "monthly_sip": round(sip),
            "blended_return": ann_ret,
            "is_achievable": achievable,
            "revised_months": revised_months,
            "sentiment_warning": None,
            "instruments": instruments_with_amounts,
            "milestones": make_milestones(sip, ann_ret, months_remaining)
        }

        if achievable and risk_key == "medium":
            recommended_plan = "medium"
        elif achievable and risk_key == "low" and not plans.get("low", {}).get("is_achievable"):
            recommended_plan = "low"

    # Pick the most conservative achievable plan as recommendation
    for rk in ["low", "medium", "high"]:
        if plans[rk]["is_achievable"]:
            recommended_plan = rk
            break

    # --- Get narrative from Ollama (simple text, no JSON risk) ---
    narrative = ""
    try:
        med_sip = plans["medium"]["monthly_sip"]
        narrative_prompt = (
            f"You are an Indian financial advisor. In 2-3 short sentences, give specific advice for "
            f"someone saving for '{goal.get('title', 'their goal')}' (INR {target_amount:,.0f}) "
            f"in {months_remaining} months. They have INR {disposable:,.0f} disposable per month "
            f"and need INR {med_sip:,.0f}/month SIP. Mention specific Indian instruments. "
            f"Use INR not $ or pound. Be concise, no bullet points, just flowing advice."
        )
        # Try Gemini
        if GEMINI_API_KEY:
            model_gemini = genai.GenerativeModel("models/gemini-flash-latest")
            response = model_gemini.generate_content(narrative_prompt)
            narrative = sanitize_currency(response.text.strip())
        else:
            # Fallback to Ollama
            res = ollama.chat(model=OLLAMA_MODEL, messages=[{"role": "user", "content": narrative_prompt}])
            narrative = sanitize_currency(res['message']['content'].strip())
    except Exception as e:
        print(f"Goal Narrative Error: {e}")
        narrative = (
            f"To achieve your goal of INR {target_amount:,.0f} in {months_remaining} months, "
            f"a monthly SIP of INR {plans['medium']['monthly_sip']:,} is recommended. "
            f"Consider a mix of large-cap mutual funds and PPF for balanced growth and safety."
        )

    return {
        "goal_amount": target_amount,
        "amount_needed": amount_needed,
        "disposable": disposable,
        "duration_months": months_remaining,
        "recommended_plan": recommended_plan,
        "inflation_rate": 6.5,
        "market_sentiment": {"sentiment": "neutral", "score": 58, "note": "Indian markets remain resilient with steady FII inflows."},
        "plans": plans,
        "narrative": narrative,
        "data_fetched_at": date.today().isoformat()
    }







@app.post("/api/generate-pdf")
async def generate_pdf(payload: PdfRequestPayload):
    totals = payload.category_totals
    transactions = payload.transactions
    ai_summary = payload.ai_summary
    if not totals: raise HTTPException(status_code=400, detail="No category data provided.")
    
    tmp_path = tempfile.mkdtemp()
    pdf_filename = f"Arthniti_Report_{uuid.uuid4().hex[:6]}.pdf"
    pdf_path = os.path.join(tmp_path, pdf_filename)
    donut_path = os.path.join(tmp_path, "donut.png")
    line_path = os.path.join(tmp_path, "line.png")
    
    # 1. DONUT CHART — all slices labelled via outside leader-line annotations
    labels = list(totals.keys())
    values = list(totals.values())
    total_val = sum(values)

    fig, ax = plt.subplots(figsize=(10, 7))
    colors_cycle = plt.cm.Paired.colors
    wedges, _ = ax.pie(
        values,
        startangle=140,
        colors=colors_cycle,
        wedgeprops=dict(width=0.52, edgecolor='white', linewidth=0.8),
        # no autopct — we'll annotate manually
    )
    ax.set_aspect('equal')

    import numpy as np
    bbox_props = dict(boxstyle="round,pad=0.2", fc="white", ec="gray", lw=0.6)
    kw = dict(arrowprops=dict(arrowstyle="-", color="gray", lw=0.8),
              bbox=bbox_props, zorder=0, va="center", fontsize=7)

    for i, (wedge, val) in enumerate(zip(wedges, values)):
        pct = val / total_val * 100
        ang = (wedge.theta2 + wedge.theta1) / 2.0          # midpoint angle
        x_mid = np.cos(np.deg2rad(ang))
        y_mid = np.sin(np.deg2rad(ang))
        # label position: 1.25× radius from centre
        x_lbl = 1.28 * x_mid
        y_lbl = 1.28 * y_mid
        ha = "right" if x_mid < 0 else "left"
        ax.annotate(f"{pct:.1f}%",
                    xy=(0.7 * x_mid, 0.7 * y_mid),          # arrow tip on ring
                    xytext=(x_lbl, y_lbl),
                    horizontalalignment=ha, **kw)

    # Legend on the right — plain category names (percentages are on the chart itself)
    legend_labels = [f"{lbl}" for lbl in labels]
    ax.legend(wedges, legend_labels, title="Categories", loc="center left",
              bbox_to_anchor=(1.05, 0.5), ncol=1, fontsize=8,
              frameon=True, framealpha=0.8, title_fontsize=9)
    plt.tight_layout()
    plt.savefig(donut_path, dpi=150, transparent=True, bbox_inches='tight')
    plt.close()
    
    # 2. SPENDING TIMELINE LINE CHART — robust date parsing
    line_generated = False
    if len(transactions) > 0:
        try:
            df = pd.DataFrame(transactions)
            df['amount'] = pd.to_numeric(df['amount'], errors='coerce').fillna(0)
            
            # Try multiple date formats common in Indian CSVs
            date_formats = ['%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%d/%m/%y',
                            '%d-%m-%y', '%m/%d/%Y', '%Y/%m/%d', '%d %b %Y', '%d %B %Y']
            parsed = None
            for fmt in date_formats:
                try:
                    parsed = pd.to_datetime(df['date'], format=fmt, errors='raise')
                    break
                except Exception:
                    continue
            if parsed is None:
                # Last resort: infer with dayfirst=True (handles mixed formats)
                parsed = pd.to_datetime(df['date'], errors='coerce', dayfirst=True)
            
            df['date'] = parsed
            df = df.dropna(subset=['date'])
            
            if not df.empty and df['date'].nunique() > 1:
                daily = df.groupby(df['date'].dt.to_period('D'))['amount'].sum()
                daily.index = daily.index.to_timestamp()
                daily = daily.sort_index()
                
                fig, ax = plt.subplots(figsize=(9, 4))
                ax.fill_between(daily.index, daily.values, alpha=0.15, color='#2962FF')
                ax.plot(daily.index, daily.values, marker='o', markersize=4,
                        color='#2962FF', linewidth=2, label='Daily Spend')
                ax.set_title("Spending Over Time", fontdict={'fontsize': 12, 'fontweight': 'bold'})
                ax.set_ylabel("Amount (INR)")
                ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'INR {x:,.0f}'))
                plt.grid(True, linestyle="--", alpha=0.4)
                fig.autofmt_xdate(rotation=30)
                plt.tight_layout()
                plt.savefig(line_path, dpi=150, transparent=True, bbox_inches='tight')
                line_generated = True
            plt.close('all')
        except Exception as e:
            print(f"[Timeline] Skipped due to error: {e}")
            plt.close('all')
    
    # Build ReportLab PDF
    doc = BaseDocTemplate(pdf_path, pagesize=A4, rightMargin=MARGIN, leftMargin=MARGIN, topMargin=70, bottomMargin=55)
    frame = Frame(doc.leftMargin, doc.bottomMargin, PAGE_W - doc.leftMargin - doc.rightMargin, PAGE_H - doc.topMargin - doc.bottomMargin, id="main")
    doc.addPageTemplates([PageTemplate(id="main", frames=frame, onPage=draw_header_footer)])
    
    story = []
    story.append(section_heading("Behavioral Analysis Summary"))
    story.append(accent_rule())
    # Sanitize text: strip foreign currencies + ₹ glyph (Helvetica can't render it)
    safe_summary = sanitize_currency(ai_summary)
    safe_summary = safe_summary.replace('₹', 'INR ').replace('\u20b9', 'INR ')
    story.append(Paragraph(safe_summary.replace("\n", "<br/>").replace("*", ""), body_style))
    story.append(Spacer(1, 16))
    
    story.append(section_heading("Spending Distribution"))
    story.append(accent_rule())
    img1 = Image(donut_path, width=320, height=220)
    tbl1 = Table([[img1]], colWidths=[PAGE_W - MARGIN * 2])
    tbl1.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    story.append(tbl1)
    story.append(Spacer(1, 16))

    if line_generated and os.path.exists(line_path):
        story.append(section_heading("Spending Timeline"))
        story.append(accent_rule())
        img2 = Image(line_path, width=430, height=210)
        tbl2 = Table([[img2]], colWidths=[PAGE_W - MARGIN * 2])
        tbl2.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
        story.append(tbl2)

    doc.build(story)
    return FileResponse(pdf_path, filename="Arthniti_Behavioral_Report.pdf", media_type="application/pdf")

# -------------------------------------------------------------
# TTS – Natural-sounding Text-to-Speech using Edge TTS (free)
# Supports English (Indian) and Hindi Neural voices
# -------------------------------------------------------------
import edge_tts
from fastapi.responses import StreamingResponse

class TTSRequest(BaseModel):
    text: str
    lang: str = "en"  # "en" for English, "hi" for Hindi

# Premium Microsoft Neural voices — sound very human
TTS_VOICES = {
    "en": "en-IN-NeerjaNeural",       # Indian English female (natural)
    "en-male": "en-IN-PrabhatNeural",  # Indian English male
    "hi": "hi-IN-SwaraNeural",         # Hindi female (natural)
    "hi-male": "hi-IN-MadhurNeural",   # Hindi male
}

@app.post("/api/tts")
async def text_to_speech(payload: TTSRequest):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided.")
    
    voice = TTS_VOICES.get(payload.lang, TTS_VOICES["en"])
    
    # Generate speech audio in memory
    communicate = edge_tts.Communicate(text, voice, rate="+0%", pitch="+0Hz")
    audio_buffer = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_buffer.write(chunk["data"])
    
    audio_buffer.seek(0)
    return StreamingResponse(
        audio_buffer,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=speech.mp3"}
    )

@app.get("/api/tts-voices")
async def list_voices():
    """List available TTS voices for the frontend UI"""
    return {
        "voices": [
            {"id": "en", "name": "Neerja (English - Indian)", "lang": "en-IN"},
            {"id": "en-male", "name": "Prabhat (English - Indian)", "lang": "en-IN"},
            {"id": "hi", "name": "Swara (Hindi)", "lang": "hi-IN"},
            {"id": "hi-male", "name": "Madhur (Hindi)", "lang": "hi-IN"},
        ]
    }

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    requested_port = int(os.getenv("PORT", "8000"))
    max_tries = 20

    selected_port = None
    for port in range(requested_port, requested_port + max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((host, port))
                selected_port = port
                break
            except OSError:
                continue

    if selected_port is None:
        raise RuntimeError(
            f"No free port found in range {requested_port}-{requested_port + max_tries - 1}"
        )

    if selected_port != requested_port:
        print(
            f"Port {requested_port} is already in use. Starting backend on port {selected_port} instead."
        )

    uvicorn.run(app, host=host, port=selected_port)
