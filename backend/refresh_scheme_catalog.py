"""Stage reviewed scheme records from a configured data.gov.in API resource.

This is an operator/scheduled-job utility, never a request-time dependency. It
requires a resource id and API key because data.gov.in resources have different
schemas. The job stages normalised candidate records; ``--apply`` is deliberately
required before a reviewed candidate can replace the public catalogue.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
from typing import Any

import requests


ROOT = Path(__file__).parent
CATALOG_PATH = ROOT / "scheme_catalog.json"
CANDIDATE_PATH = ROOT / "scheme_catalog.candidate.json"
DATA_GOV_ENDPOINT = "https://api.data.gov.in/resource/{resource_id}"


def _pick(record: dict, *keys: str, default: Any = "") -> Any:
    for key in keys:
        value = record.get(key)
        if value not in (None, ""):
            return value
    return default


def _as_list(value: Any, default: list[str] | None = None) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [item.strip() for item in value.split(",") if item.strip()]
    return list(default or [])


def normalise_record(raw: dict, retrieved_at: str) -> dict:
    """Accept the approved Arthniti fields plus common snake_case aliases."""
    source_url = _pick(raw, "officialUrl", "official_url", "sourceUrl", "source_url")
    provenance = raw.get("provenance") if isinstance(raw.get("provenance"), dict) else {}
    return {
        "schemeId": _pick(raw, "schemeId", "scheme_id", "id"),
        "name": _pick(raw, "name", "scheme_name"),
        "governmentLevel": _pick(raw, "governmentLevel", "government_level", default="Central"),
        "stateCoverage": _as_list(_pick(raw, "stateCoverage", "state_coverage", "state", default=["ALL"]), ["ALL"]),
        "agency": _pick(raw, "agency", "ministry", "department"),
        "businessCategories": _as_list(_pick(raw, "businessCategories", "business_categories")),
        "targetGroups": _as_list(_pick(raw, "targetGroups", "target_groups")),
        "benefitType": _as_list(_pick(raw, "benefitType", "benefit_type")),
        "benefitSummary": _pick(raw, "benefitSummary", "benefit_summary"),
        "description": _pick(raw, "description"),
        "maxProjectCost": _pick(raw, "maxProjectCost", "max_project_cost", default=0),
        "eligibilityRules": raw.get("eligibilityRules") or raw.get("eligibility_rules") or {},
        "eligibilitySummary": _pick(raw, "eligibilitySummary", "eligibility_summary"),
        "requiredDocuments": _as_list(_pick(raw, "requiredDocuments", "required_documents")),
        "applicationRoute": _pick(raw, "applicationRoute", "application_route"),
        "officialUrl": source_url,
        "financeTerms": raw.get("financeTerms") or raw.get("finance_terms") or {},
        "provenance": {
            "source": _pick(provenance, "source", default="data.gov.in"),
            "sourceUrl": _pick(provenance, "sourceUrl", "source_url", default=source_url),
            "sourceUpdatedAt": _pick(provenance, "sourceUpdatedAt", "source_updated_at", default=_pick(raw, "source_updated_at")),
            "retrievedAt": retrieved_at,
            "verifiedAt": _pick(provenance, "verifiedAt", "verified_at"),
            "verificationStatus": _pick(provenance, "verificationStatus", "verification_status", default="pending_review"),
        },
    }


def validate_records(records: list[dict], require_verified: bool = False) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for index, record in enumerate(records):
        prefix = f"Record {index + 1}"
        for field in ("schemeId", "name", "agency", "officialUrl"):
            if not str(record.get(field) or "").strip():
                errors.append(f"{prefix}: missing {field}.")
        scheme_id = str(record.get("schemeId") or "").strip()
        if scheme_id in seen:
            errors.append(f"{prefix}: duplicate schemeId {scheme_id}.")
        seen.add(scheme_id)
        if require_verified and record.get("provenance", {}).get("verificationStatus") != "officially_verified":
            errors.append(f"{prefix}: verificationStatus must be officially_verified before applying.")
    return errors


def fetch_records(resource_id: str, api_key: str) -> list[dict]:
    response = requests.get(
        DATA_GOV_ENDPOINT.format(resource_id=resource_id),
        params={"api-key": api_key, "format": "json", "limit": 1000},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    records = payload.get("records") or payload.get("data") or []
    if not isinstance(records, list):
        raise ValueError("Configured data.gov.in resource did not return a record list.")
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Stage or apply reviewed Arthniti scheme catalogue records.")
    parser.add_argument("--resource-id", default=os.getenv("DATA_GOV_IN_SCHEMES_RESOURCE_ID"))
    parser.add_argument("--api-key", default=os.getenv("DATA_GOV_IN_API_KEY") or os.getenv("DATA_GOV_API_KEY"))
    parser.add_argument("--source-file", type=Path, help="Use a reviewed JSON export instead of calling data.gov.in.")
    parser.add_argument("--apply", action="store_true", help="Replace the catalogue only after validation succeeds.")
    args = parser.parse_args()

    if args.source_file:
        raw_payload = json.loads(args.source_file.read_text(encoding="utf-8"))
        raw_records = raw_payload.get("records", raw_payload) if isinstance(raw_payload, dict) else raw_payload
    else:
        if not args.resource_id or not args.api_key:
            parser.error("Provide --source-file, or set DATA_GOV_IN_SCHEMES_RESOURCE_ID and DATA_GOV_IN_API_KEY.")
        raw_records = fetch_records(args.resource_id, args.api_key)

    if not isinstance(raw_records, list):
        parser.error("The source must contain a list of records.")
    retrieved_at = dt.datetime.now(dt.timezone.utc).astimezone().isoformat()
    records = [normalise_record(raw, retrieved_at) for raw in raw_records if isinstance(raw, dict)]
    errors = validate_records(records, require_verified=args.apply)
    if errors:
        print("Candidate catalogue was not applied:")
        print("\n".join(f"- {error}" for error in errors))
        return 1

    payload = {"catalogVersion": 1, "catalogUpdatedAt": retrieved_at, "records": records}
    target = CATALOG_PATH if args.apply else CANDIDATE_PATH
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{'Applied' if args.apply else 'Staged'} {len(records)} reviewed scheme records at {target.name}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
