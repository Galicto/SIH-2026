I cross-verified the existing project without opening any `.env` files.

## Already Present — Retain

- **Login card animation:** exists on the logged-out Home page. Do not alter it.
- **Business Advisory:** form, location lookup, margin capital, profile storage, and opportunity flow already exist.
- **OSM/Overpass fallback:** already works without keys; Google Places is optional.
- **Business comparison:** already supports selecting **2 or 3** businesses; it does not support one-business analysis yet.
- **Feasibility report:** finance, scheme matching, Gemini advisory, and a report UI already exist.
- **Chat assistant:** UI and Gemini backend integration exist, but reliability/configuration is weak.
- **Education:** structure already supports 10 links: 5 tracks × 2 videos.
- **Analysis:** already uses backend AI summary generation.
- **Goals:** already uses deterministic planning plus an AI narrative.
- **Marketplace/jobs:** not implemented.
- **Map:** current map is only a decorative/random visual, not a real map.

## Important

1. **Protect the login page**
   - Freeze the login animation, layout, wallet modal, and card behavior.
   - Add regression testing/screenshots before modifying other pages.

2. **Redirect after wallet login**
   - Current behavior: user remains on Home after connecting.
   - Required behavior: first successful wallet connection should route to Business Advisory.

3. **Fix Business Advisory inputs**
   - Several profile fields exist in code but are not fully rendered or used.
   - Add and connect: skill level, work type, workspace, availability, household expenses, existing-business status, artisan/SHG status.
   - Use these fields in opportunity ranking and scheme matching.

4. **Make Local Opportunities fast and reliable**
   - Keep OSM/Overpass as the free default.
   - Add coordinate/result caching, shorter provider timeout, stale-result fallback, and request deduplication.
   - Avoid replacing OSM before measuring latency; the main issue is currently uncached public-provider requests.
   - Use Google Places/another provider only as an optional enhanced source.

5. **Fix Comparison**
   - Support one-business “Viability Check.”
   - Support two or more businesses for comparison.
   - Replace near-identical scores with a weighted score using demand, competition, capital gap, monthly surplus, EMI burden, skills, scheme fit, and confidence.
   - Add detailed side-by-side comparison charts and recommendation reasons.

6. **Fix Feasibility + Financial Plan consistency**
   - Correct location-context integration.
   - Use one consistent project-cost, interest-rate, tenure, and EMI model everywhere.
   - Fix missing scheme-term data that currently prevents a complete Financial Plan.
   - Complete the Viability Passport/PDF action.
   - Improve the report with demand, customer segments, costs, break-even, risks, mitigations, schemes, and next steps.

7. **Fix Chat Assistant before replacing it**
   - Centralize model/provider settings.
   - Fix stale provider naming and hardcoded model assumptions.
   - Add retry, timeout, clear failure state, and grounded session context.
   - Keep Gemini as the first provider; add a fallback provider only if Gemini remains unreliable.

## Better to Do

1. **Real interactive map**
   - Replace the current random visual map.
   - Use MapLibre + OpenStreetMap for a no-key real map.
   - Show geo-tagged businesses, competitors, demand anchors, opportunity radius, rental items, and jobs.
   - Add marker clustering and filters.

2. **Marketplace**
   - Add rental listings for agricultural tools, vehicles, machinery, and service equipment.
   - Add job posting and job search.
   - Start with local database-backed listings, search, filters, contact method, and moderation/reporting.

3. **Education**
   - The structure is ready.
   - Replace the current 10 video links after you provide the final links.

4. **Analysis**
   - Keep deterministic totals/charts.
   - Improve the AI layer for spending patterns, risks, recommendations, and next steps.
   - Do not make core financial numbers AI-only.

5. **Goals**
   - Existing goal planner is partly AI-assisted.
   - Improve AI suggestions using income, expenses, business surplus, and feasibility results.
   - Keep timeline/SIP mathematics deterministic.

## Optional / Better Later

1. **3D map**
   - Add only after the real 2D map works.
   - Use Cesium or Mapbox 3D if credentials and performance budget allow.

2. **Paid map/place provider**
   - Benchmark Google Places, HERE, Mapbox, or Foursquare after OSM caching is implemented.
   - Retain OSM as fallback.

3. **Live jobs API**
   - Add only with approved legal API access and moderation rules.
   - Until then, keep jobs as user-posted marketplace listings.

4. **Streaming AI responses**
   - Useful for chat polish, but not required before fixing reliability.

## Plus Points for Jury Impact

- Visible source, timestamp, and confidence on every local opportunity.
- “Why this recommendation?” score breakdown.
- Low-data warning instead of fabricated results.
- Hindi/Telugu advisory and chat output.
- Saved reports and downloadable feasibility passport.
- Live map with radius, competitors, schools, markets, hospitals, and rental assets.
- A polished demo route: Login → Advisory → Opportunities → Comparison → Feasibility → Marketplace.