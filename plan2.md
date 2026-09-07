Your plan fits Arthniti well. The main adjustment is to evolve the current small verified rules database instead of replacing the existing matching flow.

Current system status:

- Existing source: in-memory `SCHEMES_DB` with PMMY/MUDRA and PM Vishwakarma.
- Existing matching inputs: business category, project cost, artisan status, existing-business status, SHG status, skill/workspace/availability, household expenses, and location payload.
- Existing output: official URL, agency, description, maximum project cost, documents, application route, relevance reason, profile-fit score, and provenance.
- Missing: data.gov.in ingestion, normalized persistent database, state/district filtering, sector mapping, `verified_at` / source-update dates, and a unified matcher shared by business discovery and scheme API.

Relevant current files: [api_schemes.py](E:/projects/SIH26/Dashboard/backend/api_schemes.py:11), [api_business.py](E:/projects/SIH26/Dashboard/backend/api_business.py:516), [SchemeMatcher.tsx](E:/projects/SIH26/Dashboard/frontend/src/components/SchemeMatcher.tsx:135).

## Adjusted plan

### 1. Primary Data Source

Use `data.gov.in` as the scheduled ingestion source—not as a live API call for every user search.

Flow:

```text
data.gov.in API
        ↓
Validation and normalization job
        ↓
Arthniti internal schemes database
        ↓
Fast local matching API
```

This matches Arthniti’s existing cached/local backend pattern and avoids slow or unreliable user-facing scheme searches.

### 2. Supporting Official Sources

Keep official ministry, state, and scheme portals as the verification authority.

For every scheme record, retain the existing `officialUrl`, `agency`, `requiredDocuments`, and `applicationRoute` fields. Add a review process before public scheme terms replace existing verified records.

### 3. myScheme Usage

Keep this unchanged:

- Discovery and manual verification only.
- No automated scraping.
- Store only manually verified facts and official links in Arthniti’s database.

### 4. Internal Schemes Database

Replace the current in-memory `SCHEMES_DB` gradually.

Phase 1: version-controlled normalized JSON data loaded by FastAPI.

Phase 2: SQLite/Postgres when scheme volume, state incentives, and update workflows require it.

Keep the current PMMY and PM Vishwakarma records as the initial verified baseline.

### 5. Database Structure

Preserve your structure, but align names with current APIs:

```json
{
  "schemeId": "pm_mudra",
  "scheme_name": "Pradhan Mantri MUDRA Yojana (PMMY)",
  "government_level": "Central",
  "state": "ALL",
  "agency": "Ministry of Finance",

  "business_categories": ["retail", "services"],
  "target_groups": ["new_entrepreneur", "existing_enterprise"],
  "benefit_type": ["loan"],

  "eligibilityRules": {
    "minimum_age": 18,
    "new_unit_only": false,
    "isArtisan": null
  },

  "maxProjectCost": 1000000,
  "description": "...",
  "requiredDocuments": [],
  "applicationRoute": "...",
  "officialUrl": "...",

  "provenance": {
    "source": "data.gov.in",
    "source_updated_at": "...",
    "retrieved_at": "...",
    "verified_at": "..."
  }
}
```

### 6. Normalize Business Categories

Use Arthniti’s existing business ideas as the first mapping layer:

```text
Grocery → Retail → Food
Dairy → Agriculture → Food Processing
Tailoring → Textile → Services → Artisan
Repair → Services → Electronics / Automotive
Food / Restaurant → Food → Hospitality
Handicrafts → Artisan → Manufacturing
Printing / Digital → Services → Technology Adoption
Transport / Rental → Services → Rural Enterprise
```

### 7. Recommendation Inputs

Keep your inputs, with Arthniti’s existing profile fields:

```text
State + District
Business Category + Normalized Sectors
Project Cost / Margin Capital
Skill Level + Work Preference + Workspace + Availability
Household Expenses
Existing Business + Artisan + SHG + Gender / Social Category
```

State should become an eligibility filter first. District should be used mainly for future state/district incentive schemes.

### 8. Recommendation Flow

```text
Business Idea + Location + Investment + Profile
        ↓
Normalize business sectors
        ↓
Filter normalized Arthniti database
        ↓
Check state, project cost, sector, and declared profile conditions
        ↓
Rank by scheme fit and profile-fit score
        ↓
Return “may be eligible” recommendations
```

Use one shared matcher for both `/api/schemes/match` and business discovery. Today those paths contain separate PMMY/Vishwakarma logic and could drift.

### 9. Scheme Output

The UI already shows much of this. Add the remaining fields:

- Eligibility summary
- Benefit type and amount/range
- Government level and state coverage
- Last verified date
- Source updated date
- Explicit “verify with bank/SCA/official portal” disclaimer

### 10. Provenance

Keep your provenance model, but replace the current generic “Official Ministry Data (Proxy DB)” label with the actual source record:

```json
{
  "source": "data.gov.in",
  "official_url": "...",
  "source_updated_at": "...",
  "retrieved_at": "...",
  "verified_at": "...",
  "verification_status": "officially_verified"
}
```

No code was changed.
