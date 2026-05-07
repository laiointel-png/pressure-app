"""Unified backend for the Pressure prototype.

Run (after installing deps into .venv):
    .venv/bin/python -m pip install fastapi uvicorn stripe
    STRIPE_SECRET_KEY=sk_test_... \
    PRESSURE_PASS_PRICE_ID=price_... \
    PRESSURE_APP_URL=http://localhost:5173 \
    .venv/bin/python -m uvicorn backend.app:app --port 8001

This server intentionally keeps the MVP payment model "payment-safe":
subscription + platform miss fee + transparent ledger, no pooled pot and no cash payouts.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from backend.payment_api_example import app as payments_app
except Exception:  # pragma: no cover - optional for prototype.
    payments_app = None


DATA_DIR = Path(__file__).resolve().parent / "data"
GROUPS_PATH = DATA_DIR / "groups.json"


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default
    except json.JSONDecodeError:
        return default


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(path)


app = FastAPI(title="Pressure Prototype API")
_default_origins = ["http://localhost:5173", "http://127.0.0.1:5173", "null"]
_extra_origins = [origin.strip() for origin in os.getenv("PRESSURE_ALLOWED_ORIGINS", "").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[*_default_origins, *_extra_origins],
    allow_origin_regex=r"https://.*\.github\.io$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "features": {
            "groups": True,
            "payments": payments_app is not None,
        },
    }


class GroupPayload(BaseModel):
  group_id: str
  name: str
  deadline: str = "22:00"
  fee_label: str = "EUR 10"
  destination_label: str = "Platform fee, geen cash-out"


@app.get("/api/groups")
def list_groups() -> dict[str, Any]:
    groups = _read_json(GROUPS_PATH, default={})
    return {"groups": list(groups.values())}


@app.get("/api/groups/{group_id}")
def get_group(group_id: str) -> dict[str, Any]:
    groups = _read_json(GROUPS_PATH, default={})
    group = groups.get(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group_not_found")
    return {"group": group}


@app.post("/api/groups")
def upsert_group(payload: GroupPayload) -> dict[str, Any]:
    groups = _read_json(GROUPS_PATH, default={})
    group = payload.model_dump()
    groups[payload.group_id] = group
    _write_json(GROUPS_PATH, groups)
    return {"group": group}


if payments_app is not None:
    app.include_router(payments_app.router)
