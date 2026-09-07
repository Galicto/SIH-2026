# Arthniti — Project Context (read this first)

Arthniti is an AI-powered business advisory + loan-structuring web app for rural micro-entrepreneurs in India (SIH project). A user enters their location, business type, and available margin money; the app returns a hyper-local feasibility report + a structured government loan plan.

**This repo is the original "PredX" codebase (a prediction-market / crypto-trading app), being repurposed into Arthniti.** It is NOT Next.js. Earlier project notes describing Next.js/shadcn/next-themes were written for a different, abandoned scaffold — ignore any reference to those. This file describes the ACTUAL repo.

**Current status: bug-fix + strip-out pass, NOT a build-more-pages pass.** Fix Known Issue 1 first — it's blocking. Then 2 and 3. Do not touch unrelated files while fixing one issue.

**Build philosophy: one fix / one page at a time.** Fix, verify, report back, move to the next item.

---

## Actual tech stack (confirmed from the running app — do not assume otherwise)
- **Vite + React 18 + TypeScript** (NOT Next.js — no App Router, no server components, no `/api` routes)
- Single-page app: view switching happens via a `navigate()` function on `PredXContext`, not file-based routing or react-router
- Styling: Tailwind CSS + **daisyui** (daisyui themes are controlled via a `data-theme` attribute on `<html>`, NOT Tailwind's `dark:` class variant — there are zero `dark:` usages in the codebase)
- Theme mechanism: `PredXContext` sets `theme-dark`/`theme-light` class + `data-theme` `algodark`/`algolight` on `<html>` only. Colour tokens are CSS custom properties (`--surface-container`, `--on-surface`, …) redefined under `:root, .theme-dark` and `.theme-light` in `src/styles/main.css`; Tailwind maps `bg-surface-container` etc. to `rgb(var(--token))`.
- Charts: `lightweight-charts` (old trading terminal, being removed) + Recharts (new amortization chart)
- Wallet/chain: `@txnlab/use-wallet-react`, `algosdk` — Algorand TestNet, originally for the PredX prediction market
- Backend: separate Python service at `backend/main.py` (already has AI + endpoints from before — reuse this, don't build a second backend)
- Key contexts: `PredXContext` (app state + navigation), `AnalysisContext`
- Key pages confirmed to exist: `Dashboard.tsx` (OLD PredX wallet screen — retired from the flow), `FinancialPlan.tsx`, `FeasibilityReport.tsx`, `BusinessAdvisory.tsx`

---

## KNOWN ISSUES — fix in this order

### Issue 1 🔴 "Dashboard" page crashed — FIXED (2026-09-06)
The main nav's "Dashboard" opened the OLD `Dashboard.tsx`, which mounts `SendAlgo`, `MintNFT`, `AssetOptIn`, and `Bank` — Algorand wallet components. `Bank.tsx` calls `getAlgodConfigFromViteEnvironment()` at render, which throws when `VITE_ALGOD_SERVER` is unset (only `.env.template` exists) → the whole page white-screens.

Fixed by routing, NOT by adding env vars:
- `pages/AppRouter.tsx`: `case 'dashboard'` now renders `<FeasibilityReport />`; `Dashboard` import removed; added `case 'bank'` → `<BankView />`.
- `pages/BankView.tsx` (new): isolated SCA/bank-side view, `<Bank>` wrapped in `PanelErrorBoundary`.
- `components/DashboardLayout.tsx`: added an isolated "SCA / Bank View" nav item (bottom group).
- `context/PredXContext.tsx`: added `'bank'` to `validPages`.

`pages/Dashboard.tsx` and `components/SendAlgo.tsx` / `MintNFT.tsx` / `AssetOptIn.tsx` are now orphaned — safe to delete later.

### Issue 2 🔴 Dark/light theme toggle doesn't fully convert — IN PROGRESS
Not a wiring bug. The token system and daisyui both switch correctly. The partial-conversion symptom comes from hardcoded colours that bypass tokens: ~360 arbitrary hex values in classNames, 16 raw `bg-white`/`text-white`, fixed Tailwind palette utilities used as status colours, inline `style` hex, and a few components using `themeMode === 'light' ? … : …` ternaries.

Sub-fixes done (2026-09-06):
- FOUC: pre-paint inline `<script>` in `index.html` sets the theme class/attr before first paint (localStorage → else `prefers-color-scheme`); `getInitialThemeMode()` matches; removed the hardcoded `class="dark" data-theme="algodark"` from `index.html`.
- Light `--primary` / `--primary-container` fixed to `#C24400` (was a buggy near-black green).
- Added `--success` / `--warning` tokens to both theme blocks + `tailwind.config.cjs`.

Remaining: page-by-page sweep of hardcoded `#FF5A00` → `primary` token, then the wider hardcoded-hex / `bg-white` sweep, one page at a time, reporting after each.

### Issue 3 🔴 Language toggle doesn't translate content
Page text is hardcoded as plain strings in JSX rather than pulled from the i18n dictionary, and/or components don't re-read the current language from context.

**Fix systematically:**
1. Confirm there is a single source of truth for current language (context/state).
2. Confirm every user-facing string goes through a translation function referencing that source.
3. Confirm the dictionary has real Hindi/Telugu entries for every key actually used on screen.

---

## UI/UX ENHANCEMENT DIRECTIVE (only after Issues 1–3 are fixed)

Reference: Linear, Vercel, Stripe. Modern SaaS look — explicitly NOT a government-portal aesthetic.

1. **Hierarchy** — one bold focal point per screen (e.g. the loan amount); everything else quieter.
2. **Spacing** — generous whitespace inside cards and between sections.
3. **Micro-interactions** — hover states on every clickable element, smooth 200ms transitions.
4. **Motion** — subtle entrance animation on results load; numbers count up. Respect `prefers-reduced-motion`.
5. **Depth** — soft shadows, thin borders instead of flat rectangles; subtle glow behind hero numbers.
6. **Typography** — Inter, tight letter-spacing on headings, tabular numbers on every financial figure.
7. **Consistency** — one corner-radius scale, one icon set (lucide-react), consistent button styling.
8. **Avoid AI-generated tells** — no ALL-CAPS eyebrow label on every section, no "→" on every button, no identical card treatment regardless of importance.
9. **Loading states** — skeleton loaders while feasibility data loads, never a blank flash.
10. **Mobile pass** — test at 375px after desktop is done.

**Work one page at a time, in this order:** Financial Plan → Feasibility Report → Business Advisory → any remaining pages. Show each before moving to the next.

---

## Design tokens
- Accent: orange — `#FF5A00` (dark theme `--primary` / `--primary-container`). Light theme
  `--primary` / `--primary-container` is `#C24400`, chosen during the token sweep for WCAG AA
  (4.9:1 on the light background); the old light value `#003920` was a bug, not an intentional
  variant. Keep `#FF5A00` as the reference accent in the ledger / bank note.
- Status: `--success` (dark `#22c55e` / light `#15803d`) and `--warning` (dark `#f59e0b` /
  light `#b45309`) added to both theme blocks in `src/styles/main.css`, both AA. `--error`
  already existed. The old neon mint `#00FFA3` maps to `text-success` everywhere (it read
  too crypto/trading-terminal). Exception: functional category/legend markers (e.g. map pins
  — blue/red/green) stay as raw Tailwind palette colours; they're meaningful categories, not brand.
- Dark base: bg `#08080a`, panel `#101014`, border `rgba(255,255,255,.08)`, text `#f4f4f6`, muted `#8a8a95`.
- Light base: bg `#fbfbfd`, panel `#fff`, border `rgba(10,10,20,.09)`, text `#0a0a0f`, muted `#5c6270`.
- Radius: 16px cards, 11–12px inputs/buttons.
- Full token list: `src/styles/main.css` (`:root, .theme-dark` and `.theme-light`).

---

## Financial engine (deterministic — never let an LLM compute these)
```ts
export function calcFinance(margin: number) {
  const projectCost = margin / 0.10;
  const loanAmount  = projectCost * 0.90;
  let scheme, interest = 0, tenure = 0, mor = 0, maxLoan = 0, ok = true;
  if (projectCost <= 140000)      { scheme = "Micro Finance Scheme"; interest = 6.5; tenure = 3; mor = 3; maxLoan = 125000; }
  else if (projectCost <= 5000000){ scheme = "Term Loan Scheme";     interest = 8;   tenure = 7; mor = 6; maxLoan = 4500000; }
  else                            { scheme = "Not Eligible"; ok = false; }
  const loan = ok ? Math.min(loanAmount, maxLoan) : 0;
  let emi = 0, n = 0, totalInterest = 0;
  if (ok && loan > 0) {
    n = tenure * 12 - mor;
    const r = interest / 1200;
    emi = loan * r * Math.pow(1+r, n) / (Math.pow(1+r, n) - 1);
    totalInterest = emi * n - loan;
  }
  return { projectCost, loanAmount, loan, scheme, interest, tenure, mor, emi, n, totalInterest, ok };
}
```
Test case: margin ₹1,00,000 → project ₹10,00,000, loan ₹9,00,000, Term Loan (8%, 7yr, 6mo), EMI ≈ ₹15,340.

---

## Gemini API key — CRITICAL, currently WRONG in this repo
The key is currently read as `VITE_GEMINI_API_KEY` directly in `Dashboard.tsx`. In Vite, any `VITE_`-prefixed env var is bundled into the client-side JavaScript and is fully visible in DevTools on the deployed site. This is a live security issue.

**Correct fix:** this is a pure Vite SPA (no server runtime), so the key must move to the existing **Python backend** (`backend/main.py`):
1. Add an endpoint there (e.g. `POST /api/feasibility`) that holds `GEMINI_API_KEY` as a server-side env var (no `VITE_` prefix).
2. The frontend calls that endpoint — it never touches the Gemini key directly.
3. Remove `VITE_GEMINI_API_KEY` from the frontend entirely.
4. Same treatment for any other page calling Gemini directly from the client.

---

## Do NOT
- Do not add `VITE_ALGOD_SERVER` or any Algorand config just to silence a crash — remove the wallet code from the main flow instead.
- Do not call Gemini directly from any frontend file — route through `backend/main.py`.
- Do not delete `Bank.tsx` — it's isolated as the SCA/bank transparency view.
- Do not build new pages until Issues 1–3 are confirmed fixed.
- Do not assume Next.js, shadcn, or next-themes exist in this repo — they don't.
