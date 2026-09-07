from fastapi import APIRouter
from pydantic import BaseModel

from scheme_matcher import load_scheme_catalog, match_response


router = APIRouter()


class SchemeMatchRequest(BaseModel):
    businessCategory: str = ""
    userProfile: dict = {}
    location: dict = {}


# Backwards-compatible export for callers that previously imported the list.
# Its source is now the reviewed, version-controlled JSON catalogue.
SCHEMES_DB = load_scheme_catalog()


@router.post("/match")
async def match_schemes(req: SchemeMatchRequest):
    """Match local reviewed records; never call an external scheme portal per user."""
    try:
        return match_response(req.businessCategory, req.userProfile or {}, req.location or {})
    except Exception as error:
        print(f"Scheme matching error: {type(error).__name__}")
        return {
            "status": "error",
            "matches": [],
            "message": "We could not process scheme matching right now.",
            "sources": [],
            "retrievedAt": None,
            "providerStatus": "unavailable",
        }
